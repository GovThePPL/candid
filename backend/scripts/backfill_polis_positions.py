#!/usr/bin/env python3
"""
Backfill existing positions and votes to Polis.

This script queues positions and votes for Polis sync, which will:
1. Create Polis conversations for each location/category combination
2. Create comments in Polis for each position
3. Sync existing votes to Polis conversations

Use this script when:
- Positions/votes were created before Polis sync was enabled
- After resetting Polis data
- When Polis reconnects after being unavailable

Usage:
    python backfill_polis_positions.py [--dry-run] [--batch-size 50]
    python backfill_polis_positions.py --positions-only  # Skip votes
    python backfill_polis_positions.py --votes-only      # Skip positions

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

# Vote mapping: Candid response -> Polis vote value
VOTE_MAPPING = {
    "agree": -1,
    "disagree": 1,
    "pass": 0,
}


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


def get_votes_to_sync(conn, limit=None):
    """
    Fetch all votes that need to be synced to Polis.

    A vote needs syncing if:
    - The position has been synced to Polis (has polis_comment entry)
    - The vote hasn't been queued for sync yet (not in polis_sync_queue)
    - The response is a valid vote type (agree/disagree/pass, not chat)
    """
    query = """
        SELECT DISTINCT r.id, r.position_id, r.user_id, r.response,
               p.statement, r.created_time
        FROM response r
        JOIN position p ON r.position_id = p.id
        JOIN polis_comment pc ON p.id = pc.position_id
        WHERE r.response IN ('agree', 'disagree', 'pass')
          AND NOT EXISTS (
              SELECT 1 FROM polis_sync_queue psq
              WHERE psq.operation_type = 'vote'
                AND psq.payload->>'position_id' = r.position_id::text
                AND psq.payload->>'user_id' = r.user_id::text
          )
        ORDER BY r.created_time ASC
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


def batch_queue_votes(conn, votes):
    """Queue a batch of votes for Polis sync."""
    with conn.cursor() as cur:
        for vote in votes:
            polis_vote = VOTE_MAPPING.get(vote["response"])
            if polis_vote is None:
                continue

            payload = {
                "position_id": str(vote["position_id"]),
                "user_id": str(vote["user_id"]),
                "response": vote["response"],
                "polis_vote": polis_vote,
            }
            cur.execute("""
                INSERT INTO polis_sync_queue (id, operation_type, payload, status)
                VALUES (%s, 'vote', %s, 'pending')
            """, (str(uuid.uuid4()), json.dumps(payload)))
    conn.commit()


def process_positions(conn, args):
    """Process position backfill."""
    print("\n" + "=" * 50)
    print("POSITIONS")
    print("=" * 50)

    positions = get_positions_to_sync(conn, args.limit)
    total = len(positions)
    print(f"Found {total} positions without Polis sync")

    if total == 0:
        print("All positions are already synced!")
        return 0

    # Group by location/category for summary
    location_category_counts = {}
    for pos in positions:
        key = f"{pos['location_name']}/{pos['category_name']}"
        location_category_counts[key] = location_category_counts.get(key, 0) + 1

    print("\nPositions by location/category:")
    for key, count in sorted(location_category_counts.items()):
        print(f"  {key}: {count}")

    if args.dry_run:
        print("\n[DRY RUN] Would queue positions:")
        for pos in positions[:5]:
            print(f"  - {pos['statement'][:60]}...")
        if total > 5:
            print(f"  ... and {total - 5} more")
        return total

    # Process in batches
    queued = 0
    start_time = time.time()

    for i in range(0, total, args.batch_size):
        batch = positions[i:i + args.batch_size]
        batch_num = i // args.batch_size + 1
        total_batches = (total + args.batch_size - 1) // args.batch_size

        try:
            batch_queue_positions(conn, batch)
            queued += len(batch)
            print(f"  Batch {batch_num}/{total_batches}: queued {len(batch)} positions")
        except psycopg2.Error as e:
            print(f"  Batch {batch_num} error: {e}")
            conn.rollback()

    elapsed = time.time() - start_time
    print(f"\nQueued {queued}/{total} positions in {elapsed:.1f}s")
    return queued


def process_votes(conn, args):
    """Process vote backfill."""
    print("\n" + "=" * 50)
    print("VOTES")
    print("=" * 50)

    votes = get_votes_to_sync(conn, args.limit)
    total = len(votes)
    print(f"Found {total} votes that need Polis sync")

    if total == 0:
        print("All votes are already synced or queued!")
        return 0

    # Group by response type
    response_counts = {}
    for vote in votes:
        response_counts[vote["response"]] = response_counts.get(vote["response"], 0) + 1

    print("\nVotes by response type:")
    for response, count in sorted(response_counts.items()):
        print(f"  {response}: {count}")

    if args.dry_run:
        print("\n[DRY RUN] Would queue votes:")
        for vote in votes[:5]:
            print(f"  - {vote['response']} on: {vote['statement'][:40]}...")
        if total > 5:
            print(f"  ... and {total - 5} more")
        return total

    # Process in batches
    queued = 0
    start_time = time.time()

    for i in range(0, total, args.batch_size):
        batch = votes[i:i + args.batch_size]
        batch_num = i // args.batch_size + 1
        total_batches = (total + args.batch_size - 1) // args.batch_size

        try:
            batch_queue_votes(conn, batch)
            queued += len(batch)
            print(f"  Batch {batch_num}/{total_batches}: queued {len(batch)} votes")
        except psycopg2.Error as e:
            print(f"  Batch {batch_num} error: {e}")
            conn.rollback()

    elapsed = time.time() - start_time
    print(f"\nQueued {queued}/{total} votes in {elapsed:.1f}s")
    return queued


def relink_pairwise_surveys(conn):
    """
    Re-link pairwise surveys to current Polis conversations.

    After a Polis reset, conversations get new IDs. This updates the
    polis_conversation_id on pairwise surveys by matching on
    location_id + position_category_id.
    """
    print("\n" + "=" * 50)
    print("PAIRWISE SURVEY LINKS")
    print("=" * 50)

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            UPDATE survey s
            SET polis_conversation_id = pc.polis_conversation_id
            FROM polis_conversation pc
            WHERE pc.location_id = s.location_id
              AND (
                (pc.category_id = s.position_category_id)
                OR (pc.category_id IS NULL AND s.position_category_id IS NULL)
              )
              AND pc.status = 'active'
              AND s.survey_type = 'pairwise'
              AND s.status = 'active'
              AND (s.polis_conversation_id IS NULL
                   OR s.polis_conversation_id != pc.polis_conversation_id)
        """)
        updated = cur.rowcount
    conn.commit()

    if updated > 0:
        print(f"Re-linked {updated} pairwise surveys to current conversations")
    else:
        print("All pairwise surveys already linked to current conversations")

    return updated


def main():
    parser = argparse.ArgumentParser(
        description='Backfill existing positions and votes to Polis'
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=50,
        help='Number of items to queue per batch (default: 50)'
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
        help='Limit number of items to process (for testing)'
    )
    parser.add_argument(
        '--positions-only',
        action='store_true',
        help='Only sync positions, skip votes'
    )
    parser.add_argument(
        '--votes-only',
        action='store_true',
        help='Only sync votes, skip positions'
    )
    args = parser.parse_args()

    if args.positions_only and args.votes_only:
        print("Error: Cannot specify both --positions-only and --votes-only")
        sys.exit(1)

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

    positions_queued = 0
    votes_queued = 0

    # Process positions
    if not args.votes_only:
        positions_queued = process_positions(conn, args)

    # Process votes
    if not args.positions_only:
        votes_queued = process_votes(conn, args)

    # Re-link pairwise surveys to new conversations
    relinked = relink_pairwise_surveys(conn)

    # Final summary
    print("\n" + "=" * 50)
    print("SUMMARY")
    print("=" * 50)

    if args.dry_run:
        print(f"[DRY RUN] Would queue:")
        print(f"  Positions: {positions_queued}")
        print(f"  Votes: {votes_queued}")
    else:
        print(f"Queued:")
        print(f"  Positions: {positions_queued}")
        print(f"  Votes: {votes_queued}")

        print("\nUpdated sync queue statistics:")
        stats = get_sync_queue_stats(conn)
        for stat in stats:
            print(f"  {stat['operation_type']}/{stat['status']}: {stat['count']}")

        print("\nThe Polis worker will process these items.")
        print("Run this script again to check progress or sync new items.")

    conn.close()


if __name__ == '__main__':
    main()
