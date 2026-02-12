"""Integration tests for database counter triggers and reconciliation function.

Tests trg_response_position_counts (response → position vote counters),
trg_comment_counts (comment → post.comment_count + comment.child_count),
and reconcile_counters() function.
"""

import uuid
import pytest
from conftest import (
    POSITION1_ID,
    NORMAL1_ID,
    NORMAL3_ID,
    NORMAL5_ID,
    db_execute,
    db_execute_returning,
    db_query,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_position_counts(position_id):
    """Return the denormalized counters for a position."""
    rows = db_query(
        "SELECT agree_count, disagree_count, pass_count, chat_count FROM position WHERE id = %s",
        (position_id,),
    )
    return rows[0] if rows else None


def insert_response(user_id, position_id, response):
    """Insert a response row directly."""
    db_execute(
        "INSERT INTO response (id, user_id, position_id, response) VALUES (%s, %s, %s, %s)",
        (str(uuid.uuid4()), user_id, position_id, response),
    )


def delete_response(user_id, position_id):
    """Delete a response row directly."""
    db_execute(
        "DELETE FROM response WHERE user_id = %s AND position_id = %s",
        (user_id, position_id),
    )


def update_response(user_id, position_id, new_response):
    """Update the response type for a user/position pair."""
    db_execute(
        "UPDATE response SET response = %s WHERE user_id = %s AND position_id = %s",
        (new_response, user_id, position_id),
    )


# ---------------------------------------------------------------------------
# Position response counter triggers
# ---------------------------------------------------------------------------

class TestPositionResponseTrigger:
    """trg_response_position_counts: response INSERT/UPDATE/DELETE → position counters."""

    # Use a position that exists in seed data. Clean up user responses before/after.
    POSITION_ID = POSITION1_ID

    @pytest.fixture(autouse=True)
    def cleanup_responses(self):
        """Remove test user responses before and after each test."""
        for uid in (NORMAL3_ID, NORMAL5_ID):
            delete_response(uid, self.POSITION_ID)
        yield
        for uid in (NORMAL3_ID, NORMAL5_ID):
            delete_response(uid, self.POSITION_ID)

    def _reconcile_position(self):
        """Recalculate position counts from source to get a clean baseline."""
        db_execute("""
            UPDATE position SET
                agree_count    = COALESCE((SELECT COUNT(*) FROM response WHERE position_id = %s AND response = 'agree'), 0),
                disagree_count = COALESCE((SELECT COUNT(*) FROM response WHERE position_id = %s AND response = 'disagree'), 0),
                pass_count     = COALESCE((SELECT COUNT(*) FROM response WHERE position_id = %s AND response = 'pass'), 0),
                chat_count     = COALESCE((SELECT COUNT(*) FROM response WHERE position_id = %s AND response = 'chat'), 0)
            WHERE id = %s
        """, (self.POSITION_ID,) * 4 + (self.POSITION_ID,))

    def test_insert_agree_increments(self):
        self._reconcile_position()
        before = get_position_counts(self.POSITION_ID)
        insert_response(NORMAL3_ID, self.POSITION_ID, "agree")
        after = get_position_counts(self.POSITION_ID)
        assert after["agree_count"] == before["agree_count"] + 1
        assert after["disagree_count"] == before["disagree_count"]

    def test_insert_disagree_increments(self):
        self._reconcile_position()
        before = get_position_counts(self.POSITION_ID)
        insert_response(NORMAL3_ID, self.POSITION_ID, "disagree")
        after = get_position_counts(self.POSITION_ID)
        assert after["disagree_count"] == before["disagree_count"] + 1
        assert after["agree_count"] == before["agree_count"]

    def test_insert_pass_increments(self):
        self._reconcile_position()
        before = get_position_counts(self.POSITION_ID)
        insert_response(NORMAL3_ID, self.POSITION_ID, "pass")
        after = get_position_counts(self.POSITION_ID)
        assert after["pass_count"] == before["pass_count"] + 1

    def test_insert_chat_increments(self):
        self._reconcile_position()
        before = get_position_counts(self.POSITION_ID)
        insert_response(NORMAL3_ID, self.POSITION_ID, "chat")
        after = get_position_counts(self.POSITION_ID)
        assert after["chat_count"] == before["chat_count"] + 1

    def test_delete_decrements(self):
        self._reconcile_position()
        insert_response(NORMAL3_ID, self.POSITION_ID, "agree")
        before = get_position_counts(self.POSITION_ID)
        delete_response(NORMAL3_ID, self.POSITION_ID)
        after = get_position_counts(self.POSITION_ID)
        assert after["agree_count"] == before["agree_count"] - 1

    def test_update_response_type_swaps_counts(self):
        """Changing response type decrements old and increments new."""
        self._reconcile_position()
        insert_response(NORMAL3_ID, self.POSITION_ID, "agree")
        before = get_position_counts(self.POSITION_ID)
        update_response(NORMAL3_ID, self.POSITION_ID, "disagree")
        after = get_position_counts(self.POSITION_ID)
        assert after["agree_count"] == before["agree_count"] - 1
        assert after["disagree_count"] == before["disagree_count"] + 1

    def test_update_same_type_no_change(self):
        """Updating to the same type doesn't change counts (trigger checks OLD <> NEW)."""
        self._reconcile_position()
        insert_response(NORMAL3_ID, self.POSITION_ID, "agree")
        before = get_position_counts(self.POSITION_ID)
        update_response(NORMAL3_ID, self.POSITION_ID, "agree")
        after = get_position_counts(self.POSITION_ID)
        assert after["agree_count"] == before["agree_count"]

    def test_multiple_users_accumulate(self):
        """Multiple users responding accumulates counts correctly."""
        self._reconcile_position()
        before = get_position_counts(self.POSITION_ID)
        insert_response(NORMAL3_ID, self.POSITION_ID, "agree")
        insert_response(NORMAL5_ID, self.POSITION_ID, "disagree")
        after = get_position_counts(self.POSITION_ID)
        assert after["agree_count"] == before["agree_count"] + 1
        assert after["disagree_count"] == before["disagree_count"] + 1


# ---------------------------------------------------------------------------
# Comment counter triggers
# ---------------------------------------------------------------------------

class TestCommentCountTrigger:
    """trg_comment_counts: comment INSERT/DELETE → post.comment_count + parent.child_count."""

    POST_ID = None
    _created_ids = []

    @pytest.fixture(autouse=True)
    def setup_post(self):
        """Create a test post for comment counter tests."""
        self.__class__._created_ids = []
        post_id = str(uuid.uuid4())
        self.__class__.POST_ID = post_id
        db_execute("""
            INSERT INTO post (id, creator_user_id, location_id, title, body)
            VALUES (%s, %s, (SELECT id FROM location LIMIT 1), 'Counter test post', 'Body')
        """, (post_id, NORMAL1_ID))
        yield
        # Clean up: delete comments then post
        for cid in reversed(self._created_ids):
            db_execute("DELETE FROM comment WHERE id = %s", (cid,))
        db_execute("DELETE FROM post WHERE id = %s", (post_id,))

    def _insert_comment(self, parent_comment_id=None):
        """Insert a comment and return its id."""
        cid = str(uuid.uuid4())
        path = cid if parent_comment_id is None else f"{parent_comment_id}.{cid}"
        depth = 0 if parent_comment_id is None else 1
        db_execute("""
            INSERT INTO comment (id, post_id, parent_comment_id, creator_user_id, body, path, depth)
            VALUES (%s, %s, %s, %s, 'Test comment', %s, %s)
        """, (cid, self.POST_ID, parent_comment_id, NORMAL1_ID, path, depth))
        self._created_ids.append(cid)
        return cid

    def _get_post_comment_count(self):
        rows = db_query("SELECT comment_count FROM post WHERE id = %s", (self.POST_ID,))
        return rows[0]["comment_count"]

    def _get_child_count(self, comment_id):
        rows = db_query("SELECT child_count FROM comment WHERE id = %s", (comment_id,))
        return rows[0]["child_count"]

    def test_insert_comment_increments_post_count(self):
        assert self._get_post_comment_count() == 0
        self._insert_comment()
        assert self._get_post_comment_count() == 1

    def test_multiple_comments_accumulate(self):
        self._insert_comment()
        self._insert_comment()
        self._insert_comment()
        assert self._get_post_comment_count() == 3

    def test_reply_increments_parent_child_count(self):
        parent_id = self._insert_comment()
        assert self._get_child_count(parent_id) == 0
        self._insert_comment(parent_comment_id=parent_id)
        assert self._get_child_count(parent_id) == 1

    def test_reply_also_increments_post_count(self):
        parent_id = self._insert_comment()
        assert self._get_post_comment_count() == 1
        self._insert_comment(parent_comment_id=parent_id)
        assert self._get_post_comment_count() == 2

    def test_delete_comment_decrements_post_count(self):
        cid = self._insert_comment()
        assert self._get_post_comment_count() == 1
        db_execute("DELETE FROM comment WHERE id = %s", (cid,))
        self._created_ids.remove(cid)
        assert self._get_post_comment_count() == 0

    def test_delete_reply_decrements_parent_child_count(self):
        parent_id = self._insert_comment()
        child_id = self._insert_comment(parent_comment_id=parent_id)
        assert self._get_child_count(parent_id) == 1
        db_execute("DELETE FROM comment WHERE id = %s", (child_id,))
        self._created_ids.remove(child_id)
        assert self._get_child_count(parent_id) == 0


# ---------------------------------------------------------------------------
# Reconciliation function
# ---------------------------------------------------------------------------

class TestReconcileCounters:
    """reconcile_counters() fixes drifted denormalized counters."""

    @pytest.fixture(autouse=True)
    def cleanup(self):
        """Clean up test responses."""
        delete_response(NORMAL3_ID, POSITION1_ID)
        yield
        delete_response(NORMAL3_ID, POSITION1_ID)

    def test_reconcile_fixes_drifted_position_counts(self):
        """Manually corrupt a counter, then reconcile to fix it."""
        # Insert a response (trigger sets correct count)
        insert_response(NORMAL3_ID, POSITION1_ID, "agree")

        # Corrupt the counter by setting it to 999
        db_execute(
            "UPDATE position SET agree_count = 999 WHERE id = %s",
            (POSITION1_ID,),
        )
        assert get_position_counts(POSITION1_ID)["agree_count"] == 999

        # Run reconciliation (must use db_execute_returning to commit the UPDATEs)
        results = db_execute_returning("SELECT * FROM reconcile_counters()")
        result_map = {r["counter_name"]: r["rows_fixed"] for r in results}

        # Position counts should have been fixed
        assert result_map["position.response_counts"] >= 1

        # Verify counter is now correct (not 999)
        counts = get_position_counts(POSITION1_ID)
        assert counts["agree_count"] != 999

    def test_reconcile_returns_zero_when_no_drift(self):
        """When all counters are correct, reconcile reports zero fixes."""
        # First reconcile to ensure everything is correct
        db_execute_returning("SELECT * FROM reconcile_counters()")

        # Second reconcile should find nothing to fix
        results = db_execute_returning("SELECT * FROM reconcile_counters()")
        result_map = {r["counter_name"]: r["rows_fixed"] for r in results}

        assert result_map["position.response_counts"] == 0
        assert result_map["post.comment_count"] == 0
        assert result_map["comment.child_count"] == 0

    def test_reconcile_returns_all_counter_groups(self):
        """Reconcile returns a row for each counter group."""
        results = db_execute_returning("SELECT * FROM reconcile_counters()")
        names = {r["counter_name"] for r in results}
        assert names == {
            "position.response_counts",
            "post.comment_count",
            "comment.child_count",
            "post.vote_counts",
            "comment.vote_counts",
        }
