#!/usr/bin/env python3
"""
Backfill existing positions to Polis.

This script queues all existing positions for Polis sync, which will:
1. Create Polis conversations for each location/category combination
2. Create comments in Polis for each position
3. Establish mappings in polis_comment table

Use this script when positions were created before Polis sync was enabled,
or after resetting Polis data.

Usage:
    python backfill_polis_positions.py [--dry-run] [--batch-size 50]

Environment variables:
    DATABASE_URL: PostgreSQL connection string
"""

import argparse
import json
import os
import sys
import time
import uuid

import psycopg2
import psycopg2.extras


def get_db_connection():
    """Create database connection."""
    db_url = os.environ.get(
        'DATABASE_URL',
        'postgresql://user:postgres@localhost:5432/candid'
    )
    return psycopg2.connect(db_url)


def get_positions_to_sync(conn, limit=None):
    """
    Fetch all active positions that haven't been synced to Polis.

    A position needs syncing if it doesn't have any entries in polis_comment.
    """
    query = """
        SELECT p.id, p.statement, p.category_id, p.location_id, p.creator_user_id,
               pc.label as category_name, l.name as location_name
        FROM position p
        JOIN position_category pc ON p.category_id = pc.id
        JOIN location l ON p.location_id = l.id
        LEFT JOIN polis_comment pcom ON p.id = pcom.position_id
        WHERE p.status = 'active'
          AND pcom.id IS NULL
        ORDER BY p.created_time ASC
    """
    if limit:
        query += f" LIMIT {limit}"

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query)
        return cur.fetchall()


def get_sync_queue_stats(conn):
    """Get statistics about the current sync queue."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT
                status,
                operation_type,
                COUNT(*) as count
            FROM polis_sync_queue
            GROUP BY status, operation_type
            ORDER BY status, operation_type
        """)
        return cur.fetchall()


def queue_position_for_sync(conn, position):
    """Queue a single position for Polis sync."""
    payload = {
        "position_id": str(position["id"]),
        "statement": position["statement"],
        "category_id": str(position["category_id"]),
        "location_id": str(position["location_id"]),
        "creator_user_id": str(position["creator_user_id"]),
    }

    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO polis_sync_queue (id, operation_type, payload, status)
            VALUES (%s, 'position', %s, 'pending')
        """, (str(uuid.uuid4()), json.dumps(payload)))


def batch_queue_positions(conn, positions):
    """Queue a batch of positions for Polis sync."""
    with conn.cursor() as cur:
        for pos in positions:
            payload = {
                "position_id": str(pos["id"]),
                "statement": pos["statement"],
                "category_id": str(pos["category_id"]),
                "location_id": str(pos["location_id"]),
                "creator_user_id": str(pos["creator_user_id"]),
            }
            cur.execute("""
                INSERT INTO polis_sync_queue (id, operation_type, payload, status)
                VALUES (%s, 'position', %s, 'pending')
            """, (str(uuid.uuid4()), json.dumps(payload)))
    conn.commit()


def main():
    parser = argparse.ArgumentParser(
        description='Backfill existing positions to Polis'
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=50,
        help='Number of positions to queue per batch (default: 50)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be done without making changes'
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=None,
        help='Limit number of positions to process (for testing)'
    )
    args = parser.parse_args()

    # Connect to database
    print("Connecting to database...")
    conn = get_db_connection()

    # Show current queue stats
    print("\nCurrent sync queue statistics:")
    stats = get_sync_queue_stats(conn)
    if stats:
        for stat in stats:
            print(f"  {stat['operation_type']}/{stat['status']}: {stat['count']}")
    else:
        print("  (empty)")

    # Get positions to sync
    print("\nFetching positions that need Polis sync...")
    positions = get_positions_to_sync(conn, args.limit)
    total = len(positions)
    print(f"Found {total} positions without Polis sync")

    if total == 0:
        print("\nNothing to do - all positions are already synced!")
        conn.close()
        return

    # Group by location/category for summary
    location_category_counts = {}
    for pos in positions:
        key = f"{pos['location_name']}/{pos['category_name']}"
        location_category_counts[key] = location_category_counts.get(key, 0) + 1

    print("\nPositions by location/category:")
    for key, count in sorted(location_category_counts.items()):
        print(f"  {key}: {count}")

    if args.dry_run:
        print("\n[DRY RUN] Would queue the following positions:")
        for pos in positions[:10]:
            print(f"  - {pos['id']}: {pos['statement'][:60]}...")
        if total > 10:
            print(f"  ... and {total - 10} more")
        print(f"\nTotal: {total} positions would be queued")
        conn.close()
        return

    # Confirm before proceeding
    print(f"\nThis will queue {total} positions for Polis sync.")
    print("The Polis worker will process them and create conversations as needed.")

    # Process in batches
    queued = 0
    errors = 0
    start_time = time.time()

    for i in range(0, total, args.batch_size):
        batch = positions[i:i + args.batch_size]
        batch_num = i // args.batch_size + 1
        total_batches = (total + args.batch_size - 1) // args.batch_size

        print(f"\nQueuing batch {batch_num}/{total_batches} ({len(batch)} positions)...")

        try:
            batch_queue_positions(conn, batch)
            queued += len(batch)

            elapsed = time.time() - start_time
            rate = queued / elapsed if elapsed > 0 else 0
            remaining = (total - queued) / rate if rate > 0 else 0

            print(f"  Queued {queued}/{total} ({queued/total*100:.1f}%) - "
                  f"{rate:.1f} pos/sec - ETA: {remaining:.0f}s")

        except psycopg2.Error as e:
            print(f"  Database error: {e}")
            conn.rollback()
            errors += len(batch)

    # Show final queue stats
    print("\n" + "=" * 50)
    print("Backfill complete!")
    print(f"  Queued: {queued}/{total}")
    print(f"  Errors: {errors}")

    elapsed = time.time() - start_time
    print(f"  Time: {elapsed:.1f}s")

    print("\nUpdated sync queue statistics:")
    stats = get_sync_queue_stats(conn)
    for stat in stats:
        print(f"  {stat['operation_type']}/{stat['status']}: {stat['count']}")

    print("\nThe Polis worker should now process these positions.")
    print("Check the worker logs or run this script again to verify progress.")

    conn.close()


if __name__ == '__main__':
    main()
