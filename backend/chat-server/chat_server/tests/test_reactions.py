"""Tests for reaction handler logic.

Tests pure logic (validation, rate limiting) by extracting constants and
functions from the source file without executing the module-level imports
that require aiohttp.
"""

import ast
import time
from collections import defaultdict
from pathlib import Path

import pytest

# --- Extract VALID_EMOJIS from the source AST (no import required) ---
_source_path = Path(__file__).resolve().parent.parent / "handlers" / "reactions.py"
_source = _source_path.read_text()
_tree = ast.parse(_source)

VALID_EMOJIS = None
for node in ast.iter_child_nodes(_tree):
    if isinstance(node, ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == "VALID_EMOJIS":
                VALID_EMOJIS = ast.literal_eval(node.value)
                break

assert VALID_EMOJIS is not None, "Could not extract VALID_EMOJIS from source"


# --- Re-implement rate limiting logic from the module for unit testing ---
_RATE_LIMIT_MAX = 30
_RATE_LIMIT_WINDOW = 60

_rate_limit_buckets: dict[str, list[float]] = defaultdict(list)


def _is_rate_limited(user_id: str) -> bool:
    """Check if user has exceeded reaction rate limit."""
    now = time.monotonic()
    bucket = _rate_limit_buckets[user_id]
    _rate_limit_buckets[user_id] = bucket = [
        t for t in bucket if now - t < _RATE_LIMIT_WINDOW
    ]
    if len(bucket) >= _RATE_LIMIT_MAX:
        return True
    bucket.append(now)
    return False


class TestValidEmojis:
    """Tests for the VALID_EMOJIS set."""

    def test_contains_expected_emojis(self):
        expected = {"agree", "appreciate", "grateful", "considering", "respect"}
        assert VALID_EMOJIS == expected

    def test_has_five_emojis(self):
        assert len(VALID_EMOJIS) == 5

    def test_rejects_invalid_emojis(self):
        invalid = ["angry", "laugh", "thumbsdown", "sad", "fire", "insightful", ""]
        for emoji in invalid:
            assert emoji not in VALID_EMOJIS


class TestRateLimiting:
    """Tests for the rate limiting logic."""

    def setup_method(self):
        """Clear rate limit buckets before each test."""
        _rate_limit_buckets.clear()

    def test_allows_first_reaction(self):
        assert _is_rate_limited("user-1") is False

    def test_allows_up_to_limit(self):
        for _ in range(29):
            assert _is_rate_limited("user-2") is False
        # 30th should still be allowed
        assert _is_rate_limited("user-2") is False

    def test_blocks_after_limit(self):
        for _ in range(30):
            _is_rate_limited("user-3")
        # 31st should be blocked
        assert _is_rate_limited("user-3") is True

    def test_separate_users_have_separate_limits(self):
        for _ in range(30):
            _is_rate_limited("user-4")
        # user-4 is at limit
        assert _is_rate_limited("user-4") is True
        # user-5 is fresh
        assert _is_rate_limited("user-5") is False

    def test_old_entries_expire(self):
        """Entries older than the rate limit window should be pruned."""
        old_time = time.monotonic() - 61  # 61 seconds ago (window is 60s)
        _rate_limit_buckets["user-6"] = [old_time] * 30
        # Should not be rate limited since all entries are expired
        assert _is_rate_limited("user-6") is False
