#!/usr/bin/env python3
"""Compute trust scores from pro-social signals.

Runs MF training for all active Polis conversations (to populate
mf_intercept and bridging awards), then recalculates percentile-based
trust scores for all users.

Intended to be called from dev.sh after Polis backfill completes, so
that polis_conversation records exist and the vote matrix can be loaded.
"""

import os
import sys

# Disable background workers — we only need the DB and MF logic
os.environ.setdefault("MF_ENABLED", "false")
os.environ.setdefault("POLIS_ENABLED", "false")
os.environ.setdefault("APPROVAL_REMINDER_ENABLED", "false")
os.environ.setdefault("FLASK_ENV", "dev")

# Add candid package to path — works both on host (backend/server/generated/)
# and inside the api container (/usr/src/app/)
_script_dir = os.path.dirname(os.path.abspath(__file__))
_host_path = os.path.join(_script_dir, "..", "server", "generated")
_container_path = "/usr/src/app"
if os.path.isdir(_host_path):
    sys.path.insert(0, _host_path)
else:
    sys.path.insert(0, _container_path)

os.environ.setdefault(
    "DATABASE_URL", "postgresql://user:postgres@localhost:5432/candid"
)
os.environ.setdefault("REDIS_URL", "redis://:candid-redis-dev@localhost:6379")
os.environ.setdefault("POLIS_API_URL", "http://localhost:5000/api/v3")
os.environ.setdefault("POLIS_BASE_URL", "http://localhost:5000")


def main():
    # Import after env vars are set to prevent worker threads from starting
    from candid.controllers.helpers.matrix_factorization import run_factorization
    from candid.controllers.helpers.trust_score import recalculate_all_trust_scores
    from candid.controllers import db

    # --- Phase 1: MF training for all active conversations ---
    conversations = db.execute_query(
        "SELECT polis_conversation_id FROM polis_conversation WHERE status = 'active'"
    )

    mf_trained = 0
    if conversations:
        for row in conversations:
            conv_id = row["polis_conversation_id"]
            try:
                result = run_factorization(conv_id)
                if result:
                    mf_trained += 1
                    print(
                        f"  MF trained: conv {conv_id} "
                        f"({result['n_users']} users, {result['n_items']} items, "
                        f"{result['n_votes']} votes)"
                    )
                else:
                    print(f"  MF skipped: conv {conv_id} (below thresholds)")
            except Exception as e:
                print(f"  MF failed: conv {conv_id} ({e})")
    else:
        print("  No active Polis conversations found")

    print(f"  MF training complete: {mf_trained} conversations trained")

    # --- Phase 2: Trust score recalculation ---
    scored = recalculate_all_trust_scores(db)
    print(f"  Trust scores computed for {scored} users")

    # Fallback: fill remaining NULL scores with deterministic hash
    # (for users with zero activity across all signal sources)
    db.execute_query("""
        UPDATE users SET trust_score = (
            abs(('x' || substring(md5(username) from 1 for 8))::bit(32)::int)
            % 90 + 10
        )::decimal / 100
        WHERE trust_score IS NULL
        AND username NOT LIKE 'guest%%'
    """)

    fallback = db.execute_query(
        "SELECT count(*) as cnt FROM users WHERE trust_score IS NOT NULL",
        fetchone=True,
    )
    total = fallback["cnt"] if fallback else 0
    if total > scored:
        print(f"  Deterministic fallback filled {total - scored} additional users")

    print(f"  Done: {total} users have trust scores")


if __name__ == "__main__":
    main()
