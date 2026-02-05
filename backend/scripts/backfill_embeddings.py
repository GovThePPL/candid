#!/usr/bin/env python3
"""
Backfill embeddings for existing positions.

This script fetches all positions without embeddings and generates
embeddings via the NLP service, then updates the database.

Usage:
    python backfill_embeddings.py [--batch-size 32] [--dry-run]

Environment variables:
    DATABASE_URL: PostgreSQL connection string
    NLP_SERVICE_URL: URL of the NLP service (default: http://nlp:5001)
"""

import argparse
import os
import sys
import time

import psycopg2
import psycopg2.extras
import requests


def get_db_connection():
    """Create database connection."""
    db_url = os.environ.get(
        'DATABASE_URL',
        'postgresql://user:postgres@localhost:5432/candid'
    )
    return psycopg2.connect(db_url)


def get_positions_without_embeddings(conn, limit=None):
    """Fetch all positions without embeddings."""
    query = """
        SELECT id, statement
        FROM position
        WHERE embedding IS NULL AND status = 'active'
        ORDER BY created_time DESC
    """
    if limit:
        query += f" LIMIT {limit}"

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query)
        return cur.fetchall()


def get_embeddings_from_nlp(texts, nlp_url):
    """Get embeddings from NLP service."""
    response = requests.post(
        f"{nlp_url}/embed",
        json={"texts": texts},
        timeout=60
    )
    response.raise_for_status()
    return response.json()["embeddings"]


def update_position_embedding(conn, position_id, embedding):
    """Update a single position's embedding."""
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE position SET embedding = %s WHERE id = %s",
            (embedding, position_id)
        )


def batch_update_embeddings(conn, positions, embeddings):
    """Update embeddings for a batch of positions."""
    with conn.cursor() as cur:
        for pos, emb in zip(positions, embeddings):
            cur.execute(
                "UPDATE position SET embedding = %s WHERE id = %s",
                (emb, pos['id'])
            )
    conn.commit()


def main():
    parser = argparse.ArgumentParser(
        description='Backfill embeddings for positions'
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=32,
        help='Number of positions to process per batch (default: 32)'
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

    nlp_url = os.environ.get('NLP_SERVICE_URL', 'http://nlp:5001')

    # Check NLP service health
    print(f"Checking NLP service at {nlp_url}...")
    try:
        response = requests.get(f"{nlp_url}/health", timeout=10)
        response.raise_for_status()
        health = response.json()
        print(f"NLP service healthy: model={health['embedding_model']}, "
              f"dimension={health['embedding_dimension']}")
    except requests.exceptions.RequestException as e:
        print(f"Error: NLP service unavailable: {e}")
        sys.exit(1)

    # Connect to database
    print("Connecting to database...")
    conn = get_db_connection()

    # Get positions without embeddings
    print("Fetching positions without embeddings...")
    positions = get_positions_without_embeddings(conn, args.limit)
    total = len(positions)
    print(f"Found {total} positions without embeddings")

    if total == 0:
        print("Nothing to do!")
        conn.close()
        return

    if args.dry_run:
        print("\nDry run - would process the following positions:")
        for pos in positions[:10]:
            print(f"  - {pos['id']}: {pos['statement'][:50]}...")
        if total > 10:
            print(f"  ... and {total - 10} more")
        conn.close()
        return

    # Process in batches
    processed = 0
    errors = 0
    start_time = time.time()

    for i in range(0, total, args.batch_size):
        batch = positions[i:i + args.batch_size]
        batch_num = i // args.batch_size + 1
        total_batches = (total + args.batch_size - 1) // args.batch_size

        print(f"\nProcessing batch {batch_num}/{total_batches} "
              f"({len(batch)} positions)...")

        try:
            # Get embeddings
            statements = [p['statement'] for p in batch]
            embeddings = get_embeddings_from_nlp(statements, nlp_url)

            # Update database
            batch_update_embeddings(conn, batch, embeddings)

            processed += len(batch)
            elapsed = time.time() - start_time
            rate = processed / elapsed if elapsed > 0 else 0
            remaining = (total - processed) / rate if rate > 0 else 0

            print(f"  Processed {processed}/{total} "
                  f"({processed/total*100:.1f}%) - "
                  f"{rate:.1f} pos/sec - "
                  f"ETA: {remaining:.0f}s")

        except requests.exceptions.RequestException as e:
            print(f"  Error getting embeddings: {e}")
            errors += len(batch)
        except psycopg2.Error as e:
            print(f"  Database error: {e}")
            conn.rollback()
            errors += len(batch)

    # Summary
    elapsed = time.time() - start_time
    print(f"\n{'='*50}")
    print(f"Backfill complete!")
    print(f"  Processed: {processed}/{total}")
    print(f"  Errors: {errors}")
    print(f"  Time: {elapsed:.1f}s")
    print(f"  Rate: {processed/elapsed:.1f} positions/sec")

    conn.close()


if __name__ == '__main__':
    main()
