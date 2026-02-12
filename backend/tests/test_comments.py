"""Integration tests for Comments endpoints (CRUD, voting, Q&A authorization)."""

import pytest
import requests
from conftest import (
    BASE_URL,
    OREGON_LOCATION_ID,
    HEALTHCARE_CAT_ID,
    NORMAL1_ID,
    NORMAL2_ID,
    NONEXISTENT_UUID,
    RULE_VIOLENCE_ID,
    db_execute,
    db_query_one,
    clear_rate_limits,
)

POSTS_URL = f"{BASE_URL}/posts"
COMMENTS_URL = f"{BASE_URL}/comments"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _cleanup_test_data():
    """Clear rate limits before and delete test data after each test."""
    clear_rate_limits()
    yield
    db_execute("DELETE FROM comment_vote WHERE comment_id IN (SELECT id FROM comment WHERE post_id IN (SELECT id FROM post WHERE title LIKE 'CTEST%%'))")
    db_execute("DELETE FROM post_vote WHERE post_id IN (SELECT id FROM post WHERE title LIKE 'CTEST%%')")
    db_execute("DELETE FROM comment WHERE post_id IN (SELECT id FROM post WHERE title LIKE 'CTEST%%')")
    db_execute("DELETE FROM post WHERE title LIKE 'CTEST%%'")


def _create_post(headers, title="CTEST discussion post", post_type="discussion",
                 category_id=None, location_id=OREGON_LOCATION_ID):
    """Create a post via API."""
    payload = {
        "title": title,
        "body": "Test body",
        "locationId": location_id,
        "postType": post_type,
    }
    if category_id:
        payload["categoryId"] = category_id
    resp = requests.post(POSTS_URL, headers=headers, json=payload)
    assert resp.status_code == 201, f"Failed to create post: {resp.text}"
    return resp.json()


def _create_comment(headers, post_id, body="Test comment", parent_comment_id=None):
    """Create a comment via API."""
    payload = {"body": body}
    if parent_comment_id:
        payload["parentCommentId"] = parent_comment_id
    return requests.post(
        f"{POSTS_URL}/{post_id}/comments",
        headers=headers,
        json=payload,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestCreateComment:
    """POST /posts/{postId}/comments"""

    def test_top_level_comment(self, normal_headers):
        post = _create_post(normal_headers)
        resp = _create_comment(normal_headers, post["id"])
        assert resp.status_code == 201
        data = resp.json()
        assert data["postId"] == post["id"]
        assert data["depth"] == 0
        assert data["parentCommentId"] is None

    def test_nested_reply(self, normal_headers, normal2_headers):
        post = _create_post(normal_headers)
        comment = _create_comment(normal_headers, post["id"], body="Parent comment")
        assert comment.status_code == 201
        parent_id = comment.json()["id"]

        reply = _create_comment(normal2_headers, post["id"], body="Reply", parent_comment_id=parent_id)
        assert reply.status_code == 201
        data = reply.json()
        assert data["depth"] == 1
        assert data["parentCommentId"] == parent_id
        assert parent_id in data["path"]

    def test_post_comment_count_incremented(self, normal_headers):
        post = _create_post(normal_headers)
        _create_comment(normal_headers, post["id"])
        _create_comment(normal_headers, post["id"])

        row = db_query_one("SELECT comment_count FROM post WHERE id = %s", (post["id"],))
        assert row["comment_count"] == 2

    def test_parent_child_count_incremented(self, normal_headers, normal2_headers):
        post = _create_post(normal_headers)
        parent = _create_comment(normal_headers, post["id"])
        parent_id = parent.json()["id"]

        _create_comment(normal2_headers, post["id"], parent_comment_id=parent_id)
        _create_comment(normal2_headers, post["id"], parent_comment_id=parent_id)

        row = db_query_one("SELECT child_count FROM comment WHERE id = %s", (parent_id,))
        assert row["child_count"] == 2

    def test_body_too_long(self, normal_headers):
        post = _create_post(normal_headers)
        resp = _create_comment(normal_headers, post["id"], body="A" * 2001)
        assert resp.status_code == 400

    def test_comment_on_locked_post(self, normal_headers, moderator_headers, normal2_headers):
        post = _create_post(normal_headers, title="CTEST locked comment")
        requests.post(f"{POSTS_URL}/{post['id']}/lock", headers=moderator_headers)

        resp = _create_comment(normal2_headers, post["id"])
        assert resp.status_code == 403


class TestCreateCommentQA:
    """Q&A authorization for question posts.

    Seed data roles:
    - admin1: admin at US root → QA authority everywhere
    - moderator1: moderator at Oregon → QA authority at Oregon
    - normal1: facilitator at Oregon + Healthcare → QA authority at Oregon+Healthcare
    - normal2, normal3: no roles → no QA authority
    """

    def test_facilitator_posts_top_level_answer(self, normal_headers):
        """normal1 is facilitator at Oregon+Healthcare → can answer."""
        post = _create_post(
            normal_headers,
            title="CTEST qa facilitator",
            post_type="question",
            category_id=HEALTHCARE_CAT_ID,
        )
        resp = _create_comment(normal_headers, post["id"], body="Expert answer")
        assert resp.status_code == 201

    def test_moderator_posts_top_level_answer(self, moderator_headers, normal_headers):
        """moderator1 has QA authority at Oregon."""
        post = _create_post(
            normal_headers,
            title="CTEST qa moderator",
            post_type="question",
            category_id=HEALTHCARE_CAT_ID,
        )
        resp = _create_comment(moderator_headers, post["id"], body="Moderator answer")
        assert resp.status_code == 201

    def test_normal_user_top_level_answer_blocked(self, normal_headers, normal2_headers):
        """normal2 has no roles → cannot answer."""
        post = _create_post(
            normal_headers,
            title="CTEST qa normal blocked",
            post_type="question",
            category_id=HEALTHCARE_CAT_ID,
        )
        resp = _create_comment(normal2_headers, post["id"], body="Unauthorized answer")
        assert resp.status_code == 403

    def test_normal_user_replies_to_expert_answer(self, normal_headers, normal2_headers):
        """normal2 can reply to an authorized answer (normal1 is facilitator)."""
        post = _create_post(
            normal_headers,
            title="CTEST qa reply to expert",
            post_type="question",
            category_id=HEALTHCARE_CAT_ID,
        )
        expert_comment = _create_comment(normal_headers, post["id"], body="Expert answer")
        assert expert_comment.status_code == 201
        expert_id = expert_comment.json()["id"]

        reply = _create_comment(
            normal2_headers, post["id"],
            body="Follow-up question",
            parent_comment_id=expert_id,
        )
        assert reply.status_code == 201

    def test_normal_user_replies_to_normal_blocked(self, normal_headers, normal2_headers, normal3_headers):
        """normal3 cannot reply to normal2's comment (neither is authorized)."""
        post = _create_post(
            normal_headers,
            title="CTEST qa normal reply blocked",
            post_type="question",
            category_id=HEALTHCARE_CAT_ID,
        )
        # normal1 (facilitator) answers first
        expert_comment = _create_comment(normal_headers, post["id"], body="Expert answer")
        expert_id = expert_comment.json()["id"]

        # normal2 replies to expert (allowed)
        normal2_reply = _create_comment(
            normal2_headers, post["id"],
            body="normal2 reply",
            parent_comment_id=expert_id,
        )
        assert normal2_reply.status_code == 201
        normal2_id = normal2_reply.json()["id"]

        # normal3 tries to reply to normal2 (blocked — normal2 is not authorized)
        resp = _create_comment(
            normal3_headers, post["id"],
            body="normal3 reply to normal2",
            parent_comment_id=normal2_id,
        )
        assert resp.status_code == 403

    def test_expert_replies_to_anyone(self, normal_headers, normal2_headers):
        """normal1 (facilitator) can reply to anyone."""
        post = _create_post(
            normal_headers,
            title="CTEST qa expert reply",
            post_type="question",
            category_id=HEALTHCARE_CAT_ID,
        )
        # normal1 answers
        answer = _create_comment(normal_headers, post["id"], body="Answer")
        answer_id = answer.json()["id"]

        # normal2 replies to expert answer (allowed)
        n2_reply = _create_comment(
            normal2_headers, post["id"],
            body="User question",
            parent_comment_id=answer_id,
        )
        assert n2_reply.status_code == 201
        n2_id = n2_reply.json()["id"]

        # normal1 (facilitator) replies to normal2 (allowed — has QA authority)
        resp = _create_comment(
            normal_headers, post["id"],
            body="Expert follow-up",
            parent_comment_id=n2_id,
        )
        assert resp.status_code == 201


class TestGetComments:
    """GET /posts/{postId}/comments"""

    def test_path_ordered_tree(self, normal_headers, normal2_headers):
        post = _create_post(normal_headers, title="CTEST tree")
        c1 = _create_comment(normal_headers, post["id"], body="First").json()
        c2 = _create_comment(normal2_headers, post["id"], body="Second").json()
        c1_reply = _create_comment(
            normal2_headers, post["id"], body="Reply to first",
            parent_comment_id=c1["id"],
        ).json()

        resp = requests.get(f"{POSTS_URL}/{post['id']}/comments", headers=normal_headers)
        assert resp.status_code == 200
        comments = resp.json()
        # Should be: c1, c1_reply, c2 (path order)
        assert len(comments) == 3
        ids = [c["id"] for c in comments]
        assert ids.index(c1["id"]) < ids.index(c1_reply["id"])

    def test_deleted_leaf_hidden(self, normal_headers, normal2_headers):
        post = _create_post(normal_headers, title="CTEST deleted leaf")
        c = _create_comment(normal2_headers, post["id"]).json()

        # Delete comment
        requests.delete(f"{COMMENTS_URL}/{c['id']}", headers=normal2_headers)

        resp = requests.get(f"{POSTS_URL}/{post['id']}/comments", headers=normal_headers)
        assert resp.status_code == 200
        ids = [x["id"] for x in resp.json()]
        assert c["id"] not in ids

    def test_deleted_parent_shows_placeholder(self, normal_headers, normal2_headers):
        post = _create_post(normal_headers, title="CTEST deleted parent")
        parent = _create_comment(normal_headers, post["id"], body="Parent").json()
        _create_comment(
            normal2_headers, post["id"], body="Child",
            parent_comment_id=parent["id"],
        )

        # Delete parent
        requests.delete(f"{COMMENTS_URL}/{parent['id']}", headers=normal_headers)

        resp = requests.get(f"{POSTS_URL}/{post['id']}/comments", headers=normal_headers)
        comments = resp.json()
        parent_comment = next(c for c in comments if c["id"] == parent["id"])
        assert parent_comment["body"] == "[deleted]"

    def test_includes_user_vote(self, normal_headers, normal2_headers):
        post = _create_post(normal_headers, title="CTEST comment vote")
        c = _create_comment(normal_headers, post["id"]).json()

        # normal2 upvotes
        requests.post(
            f"{COMMENTS_URL}/{c['id']}/vote",
            headers=normal2_headers,
            json={"voteType": "upvote"},
        )

        resp = requests.get(f"{POSTS_URL}/{post['id']}/comments", headers=normal2_headers)
        comments = resp.json()
        voted = next(x for x in comments if x["id"] == c["id"])
        assert voted["userVote"] is not None
        assert voted["userVote"]["voteType"] == "upvote"

    def test_qa_role_badge(self, normal_headers):
        """Q&A posts show creator role badge."""
        post = _create_post(
            normal_headers,
            title="CTEST qa badge",
            post_type="question",
            category_id=HEALTHCARE_CAT_ID,
        )
        _create_comment(normal_headers, post["id"], body="Facilitator answer")

        resp = requests.get(f"{POSTS_URL}/{post['id']}/comments", headers=normal_headers)
        comments = resp.json()
        assert len(comments) >= 1
        # normal1 is facilitator at Oregon+Healthcare
        assert comments[0]["creatorRole"] == "facilitator"


class TestUpdateComment:
    """PUT /comments/{commentId}"""

    def test_author_edit_within_window(self, normal_headers):
        post = _create_post(normal_headers, title="CTEST edit comment")
        c = _create_comment(normal_headers, post["id"], body="Original").json()

        resp = requests.put(
            f"{COMMENTS_URL}/{c['id']}",
            headers=normal_headers,
            json={"body": "Updated"},
        )
        assert resp.status_code == 200
        assert resp.json()["body"] == "Updated"

    def test_non_author_blocked(self, normal_headers, normal2_headers):
        post = _create_post(normal_headers, title="CTEST edit blocked")
        c = _create_comment(normal_headers, post["id"]).json()

        resp = requests.put(
            f"{COMMENTS_URL}/{c['id']}",
            headers=normal2_headers,
            json={"body": "Hacked"},
        )
        assert resp.status_code == 403

    def test_edit_window_expired(self, normal_headers):
        post = _create_post(normal_headers, title="CTEST edit expired")
        c = _create_comment(normal_headers, post["id"]).json()

        db_execute(
            "UPDATE comment SET created_time = created_time - interval '20 minutes' WHERE id = %s",
            (c["id"],),
        )

        resp = requests.put(
            f"{COMMENTS_URL}/{c['id']}",
            headers=normal_headers,
            json={"body": "Too late"},
        )
        assert resp.status_code == 403


class TestDeleteComment:
    """DELETE /comments/{commentId}"""

    def test_author_soft_delete(self, normal_headers):
        post = _create_post(normal_headers, title="CTEST delete comment")
        c = _create_comment(normal_headers, post["id"]).json()

        resp = requests.delete(f"{COMMENTS_URL}/{c['id']}", headers=normal_headers)
        assert resp.status_code == 204

        row = db_query_one("SELECT status FROM comment WHERE id = %s", (c["id"],))
        assert row["status"] == "deleted"

    def test_moderator_remove(self, normal_headers, moderator_headers):
        post = _create_post(normal_headers, title="CTEST mod remove comment")
        c = _create_comment(normal_headers, post["id"]).json()

        resp = requests.delete(f"{COMMENTS_URL}/{c['id']}", headers=moderator_headers)
        assert resp.status_code == 204

        row = db_query_one("SELECT status FROM comment WHERE id = %s", (c["id"],))
        assert row["status"] == "removed"

    def test_non_author_non_mod_blocked(self, normal_headers, normal2_headers):
        post = _create_post(normal_headers, title="CTEST delete blocked")
        c = _create_comment(normal_headers, post["id"]).json()

        resp = requests.delete(f"{COMMENTS_URL}/{c['id']}", headers=normal2_headers)
        assert resp.status_code == 403


class TestVoteOnComment:
    """POST /comments/{commentId}/vote"""

    def test_upvote(self, normal_headers, normal2_headers):
        post = _create_post(normal_headers, title="CTEST vote comment")
        c = _create_comment(normal_headers, post["id"]).json()

        resp = requests.post(
            f"{COMMENTS_URL}/{c['id']}/vote",
            headers=normal2_headers,
            json={"voteType": "upvote"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["upvoteCount"] == 1
        assert data["userVote"]["voteType"] == "upvote"

    def test_toggle_off(self, normal_headers, normal2_headers):
        post = _create_post(normal_headers, title="CTEST vote toggle")
        c = _create_comment(normal_headers, post["id"]).json()

        requests.post(
            f"{COMMENTS_URL}/{c['id']}/vote",
            headers=normal2_headers,
            json={"voteType": "upvote"},
        )
        resp = requests.post(
            f"{COMMENTS_URL}/{c['id']}/vote",
            headers=normal2_headers,
            json={"voteType": "upvote"},
        )
        assert resp.status_code == 200
        assert resp.json()["upvoteCount"] == 0
        assert resp.json()["userVote"] is None

    def test_self_vote_blocked(self, normal_headers):
        post = _create_post(normal_headers, title="CTEST self vote")
        c = _create_comment(normal_headers, post["id"]).json()

        resp = requests.post(
            f"{COMMENTS_URL}/{c['id']}/vote",
            headers=normal_headers,
            json={"voteType": "upvote"},
        )
        assert resp.status_code == 400

    def test_denormalized_counts(self, normal_headers, normal2_headers, normal3_headers):
        post = _create_post(normal_headers, title="CTEST counts")
        c = _create_comment(normal_headers, post["id"]).json()

        requests.post(
            f"{COMMENTS_URL}/{c['id']}/vote",
            headers=normal2_headers,
            json={"voteType": "upvote"},
        )
        requests.post(
            f"{COMMENTS_URL}/{c['id']}/vote",
            headers=normal3_headers,
            json={"voteType": "downvote", "downvoteReason": "offtopic"},
        )

        row = db_query_one(
            "SELECT upvote_count, downvote_count FROM comment WHERE id = %s",
            (c["id"],),
        )
        assert row["upvote_count"] == 1
        assert row["downvote_count"] == 1


class TestReportComment:
    """POST /comments/{commentId}/report"""

    def test_report_comment(self, normal_headers, normal2_headers):
        post = _create_post(normal_headers, title="CTEST report comment")
        c = _create_comment(normal_headers, post["id"]).json()

        resp = requests.post(
            f"{COMMENTS_URL}/{c['id']}/report",
            headers=normal2_headers,
            json={"ruleId": RULE_VIOLENCE_ID},
        )
        assert resp.status_code == 201
