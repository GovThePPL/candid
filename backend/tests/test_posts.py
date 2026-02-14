"""Integration tests for Posts endpoints (CRUD, voting, locking via PATCH)."""

import pytest
import requests
from conftest import (
    BASE_URL,
    OREGON_LOCATION_ID,
    HEALTHCARE_CAT_ID,
    ECONOMY_CAT_ID,
    NORMAL1_ID,
    NORMAL2_ID,
    NONEXISTENT_UUID,
    RULE_VIOLENCE_ID,
    db_execute,
    db_query_one,
    clear_rate_limits,
)

POSTS_URL = f"{BASE_URL}/posts"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _cleanup_test_posts():
    """Clear rate limits before and delete test posts after each test."""
    clear_rate_limits()
    yield
    db_execute("DELETE FROM post_vote WHERE post_id IN (SELECT id FROM post WHERE title LIKE 'TEST%%')")
    db_execute("DELETE FROM comment_vote WHERE comment_id IN (SELECT id FROM comment WHERE post_id IN (SELECT id FROM post WHERE title LIKE 'TEST%%'))")
    db_execute("DELETE FROM comment WHERE post_id IN (SELECT id FROM post WHERE title LIKE 'TEST%%')")
    db_execute("DELETE FROM post WHERE title LIKE 'TEST%%'")


def _create_post(headers, title="TEST discussion post", body="Test body content",
                 location_id=OREGON_LOCATION_ID, category_id=None,
                 post_type="discussion"):
    """Helper to create a post via API."""
    payload = {
        "title": title,
        "body": body,
        "locationId": location_id,
        "postType": post_type,
    }
    if category_id:
        payload["categoryId"] = category_id
    resp = requests.post(POSTS_URL, headers=headers, json=payload)
    return resp


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestCreatePost:
    """POST /posts"""

    def test_create_discussion_post(self, normal_headers):
        resp = _create_post(normal_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "TEST discussion post"
        assert data["postType"] == "discussion"
        assert data["status"] == "active"
        assert data["locationId"] == OREGON_LOCATION_ID
        assert "creator" in data
        assert data["creator"]["id"] == NORMAL1_ID

    def test_create_question_with_category(self, normal_headers):
        resp = _create_post(
            normal_headers,
            title="TEST question post",
            post_type="question",
            category_id=HEALTHCARE_CAT_ID,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["postType"] == "question"
        assert data["categoryId"] == HEALTHCARE_CAT_ID
        assert data["category"] is not None
        assert data["category"]["id"] == HEALTHCARE_CAT_ID

    def test_question_without_category_400(self, normal_headers):
        resp = _create_post(
            normal_headers,
            title="TEST question no cat",
            post_type="question",
            category_id=None,
        )
        assert resp.status_code == 400

    def test_title_too_long_400(self, normal_headers):
        resp = _create_post(normal_headers, title="TEST " + "A" * 200)
        assert resp.status_code == 400

    def test_body_too_long_400(self, normal_headers):
        resp = _create_post(
            normal_headers,
            title="TEST long body",
            body="A" * 10001,
        )
        assert resp.status_code == 400

    def test_missing_title_400(self, normal_headers):
        resp = requests.post(POSTS_URL, headers=normal_headers, json={
            "body": "test body",
            "locationId": OREGON_LOCATION_ID,
        })
        assert resp.status_code == 400

    def test_unauthenticated_401(self):
        resp = _create_post({}, title="TEST unauth")
        assert resp.status_code == 401


class TestGetPosts:
    """GET /posts"""

    def test_get_posts_hot_sort(self, normal_headers):
        _create_post(normal_headers, title="TEST hot sort post")
        resp = requests.get(
            POSTS_URL,
            headers=normal_headers,
            params={"locationId": OREGON_LOCATION_ID, "sort": "hot"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "posts" in data
        assert "hasMore" in data
        assert isinstance(data["posts"], list)

    def test_get_posts_new_sort(self, normal_headers):
        _create_post(normal_headers, title="TEST new sort A")
        _create_post(normal_headers, title="TEST new sort B")
        resp = requests.get(
            POSTS_URL,
            headers=normal_headers,
            params={"locationId": OREGON_LOCATION_ID, "sort": "new"},
        )
        assert resp.status_code == 200
        posts = resp.json()["posts"]
        assert len(posts) >= 2
        # Most recent first
        titles = [p["title"] for p in posts]
        assert titles.index("TEST new sort B") < titles.index("TEST new sort A")

    def test_get_posts_top_sort(self, normal_headers):
        resp = requests.get(
            POSTS_URL,
            headers=normal_headers,
            params={"locationId": OREGON_LOCATION_ID, "sort": "top"},
        )
        assert resp.status_code == 200

    def test_get_posts_controversial_sort(self, normal_headers):
        resp = requests.get(
            POSTS_URL,
            headers=normal_headers,
            params={"locationId": OREGON_LOCATION_ID, "sort": "controversial"},
        )
        assert resp.status_code == 200

    def test_cursor_pagination(self, normal_headers):
        # Create enough posts for pagination
        for i in range(5):
            _create_post(normal_headers, title=f"TEST page {i}")

        resp = requests.get(
            POSTS_URL,
            headers=normal_headers,
            params={"locationId": OREGON_LOCATION_ID, "sort": "new", "limit": 2},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["posts"]) == 2
        assert data["hasMore"] is True
        assert data["nextCursor"] is not None

        # Fetch next page
        resp2 = requests.get(
            POSTS_URL,
            headers=normal_headers,
            params={
                "locationId": OREGON_LOCATION_ID,
                "sort": "new",
                "limit": 2,
                "cursor": data["nextCursor"],
            },
        )
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert len(data2["posts"]) >= 1

        # No overlap between pages
        ids1 = {p["id"] for p in data["posts"]}
        ids2 = {p["id"] for p in data2["posts"]}
        assert ids1.isdisjoint(ids2)

    def test_category_filter(self, normal_headers):
        _create_post(normal_headers, title="TEST cat filter", category_id=HEALTHCARE_CAT_ID)
        _create_post(normal_headers, title="TEST cat filter other", category_id=ECONOMY_CAT_ID)

        resp = requests.get(
            POSTS_URL,
            headers=normal_headers,
            params={"locationId": OREGON_LOCATION_ID, "categoryId": HEALTHCARE_CAT_ID},
        )
        assert resp.status_code == 200
        posts = resp.json()["posts"]
        for p in posts:
            assert p["categoryId"] == HEALTHCARE_CAT_ID

    def test_post_type_filter(self, normal_headers):
        _create_post(normal_headers, title="TEST type filter discussion")
        _create_post(
            normal_headers,
            title="TEST type filter question",
            post_type="question",
            category_id=HEALTHCARE_CAT_ID,
        )

        resp = requests.get(
            POSTS_URL,
            headers=normal_headers,
            params={"locationId": OREGON_LOCATION_ID, "postType": "question"},
        )
        assert resp.status_code == 200
        posts = resp.json()["posts"]
        for p in posts:
            assert p["postType"] == "question"

    def test_location_scoping(self, normal_headers):
        _create_post(normal_headers, title="TEST loc scope")
        resp = requests.get(
            POSTS_URL,
            headers=normal_headers,
            params={"locationId": NONEXISTENT_UUID},
        )
        assert resp.status_code == 200
        # Should not return our test post (different location)
        posts = resp.json()["posts"]
        for p in posts:
            assert p["locationId"] != OREGON_LOCATION_ID


class TestGetPost:
    """GET /posts/{postId}"""

    def test_get_single_post(self, normal_headers):
        create_resp = _create_post(normal_headers, title="TEST single get")
        post_id = create_resp.json()["id"]

        resp = requests.get(f"{POSTS_URL}/{post_id}", headers=normal_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == post_id
        assert data["title"] == "TEST single get"
        assert "creator" in data
        assert "location" in data

    def test_nonexistent_post_404(self, normal_headers):
        resp = requests.get(f"{POSTS_URL}/{NONEXISTENT_UUID}", headers=normal_headers)
        assert resp.status_code == 404

    def test_deleted_post_hidden_from_others(self, normal_headers, normal2_headers):
        create_resp = _create_post(normal_headers, title="TEST deleted hidden")
        post_id = create_resp.json()["id"]

        # Author deletes it
        requests.delete(f"{POSTS_URL}/{post_id}", headers=normal_headers)

        # Other user can't see it
        resp = requests.get(f"{POSTS_URL}/{post_id}", headers=normal2_headers)
        assert resp.status_code == 404

    def test_includes_user_vote(self, normal_headers, normal2_headers):
        create_resp = _create_post(normal_headers, title="TEST with vote")
        post_id = create_resp.json()["id"]

        # normal2 upvotes
        requests.post(
            f"{POSTS_URL}/{post_id}/vote",
            headers=normal2_headers,
            json={"voteType": "upvote"},
        )

        # Check userVote in response
        resp = requests.get(f"{POSTS_URL}/{post_id}", headers=normal2_headers)
        assert resp.status_code == 200
        assert resp.json()["userVote"] is not None
        assert resp.json()["userVote"]["voteType"] == "upvote"


class TestUpdatePost:
    """PUT /posts/{postId}"""

    def test_author_edit_within_window(self, normal_headers):
        create_resp = _create_post(normal_headers, title="TEST edit original")
        post_id = create_resp.json()["id"]

        resp = requests.put(
            f"{POSTS_URL}/{post_id}",
            headers=normal_headers,
            json={"title": "TEST edit updated"},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "TEST edit updated"

    def test_non_author_blocked(self, normal_headers, normal2_headers):
        create_resp = _create_post(normal_headers, title="TEST edit blocked")
        post_id = create_resp.json()["id"]

        resp = requests.put(
            f"{POSTS_URL}/{post_id}",
            headers=normal2_headers,
            json={"title": "TEST edit hacked"},
        )
        assert resp.status_code == 403

    def test_edit_window_expired(self, normal_headers):
        create_resp = _create_post(normal_headers, title="TEST edit expired")
        post_id = create_resp.json()["id"]

        # Backdate created_time
        db_execute(
            "UPDATE post SET created_time = created_time - interval '20 minutes' WHERE id = %s",
            (post_id,),
        )

        resp = requests.put(
            f"{POSTS_URL}/{post_id}",
            headers=normal_headers,
            json={"title": "TEST edit too late"},
        )
        assert resp.status_code == 403


class TestDeletePost:
    """DELETE /posts/{postId}"""

    def test_author_soft_delete(self, normal_headers):
        create_resp = _create_post(normal_headers, title="TEST delete author")
        post_id = create_resp.json()["id"]

        resp = requests.delete(f"{POSTS_URL}/{post_id}", headers=normal_headers)
        assert resp.status_code == 204

        row = db_query_one("SELECT status FROM post WHERE id = %s", (post_id,))
        assert row["status"] == "deleted"

    def test_moderator_remove(self, normal_headers, moderator_headers):
        create_resp = _create_post(normal_headers, title="TEST delete mod")
        post_id = create_resp.json()["id"]

        resp = requests.delete(f"{POSTS_URL}/{post_id}", headers=moderator_headers)
        assert resp.status_code == 204

        row = db_query_one("SELECT status FROM post WHERE id = %s", (post_id,))
        assert row["status"] == "removed"

    def test_non_author_non_mod_blocked(self, normal_headers, normal2_headers):
        create_resp = _create_post(normal_headers, title="TEST delete blocked")
        post_id = create_resp.json()["id"]

        resp = requests.delete(f"{POSTS_URL}/{post_id}", headers=normal2_headers)
        assert resp.status_code == 403


class TestLockPost:
    """PATCH /posts/{postId} with {"locked": true/false}"""

    def test_moderator_can_lock(self, normal_headers, moderator_headers):
        create_resp = _create_post(normal_headers, title="TEST lock post")
        post_id = create_resp.json()["id"]

        resp = requests.patch(f"{POSTS_URL}/{post_id}", headers=moderator_headers, json={"locked": True})
        assert resp.status_code == 200
        assert resp.json()["status"] == "locked"

    def test_moderator_can_unlock(self, normal_headers, moderator_headers):
        create_resp = _create_post(normal_headers, title="TEST unlock post")
        post_id = create_resp.json()["id"]

        # Lock
        requests.patch(f"{POSTS_URL}/{post_id}", headers=moderator_headers, json={"locked": True})
        # Unlock
        resp = requests.patch(f"{POSTS_URL}/{post_id}", headers=moderator_headers, json={"locked": False})
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    def test_non_moderator_blocked(self, normal_headers):
        create_resp = _create_post(normal_headers, title="TEST lock blocked")
        post_id = create_resp.json()["id"]

        resp = requests.patch(f"{POSTS_URL}/{post_id}", headers=normal_headers, json={"locked": True})
        assert resp.status_code == 403

    def test_comment_on_locked_post_blocked(self, normal_headers, moderator_headers, normal2_headers):
        create_resp = _create_post(normal_headers, title="TEST locked comment")
        post_id = create_resp.json()["id"]

        # Lock it
        requests.patch(f"{POSTS_URL}/{post_id}", headers=moderator_headers, json={"locked": True})

        # Try to comment
        resp = requests.post(
            f"{BASE_URL}/posts/{post_id}/comments",
            headers=normal2_headers,
            json={"body": "should fail"},
        )
        assert resp.status_code == 403


class TestVoteOnPost:
    """POST /posts/{postId}/vote"""

    def test_upvote(self, normal_headers, normal2_headers):
        create_resp = _create_post(normal_headers, title="TEST vote up")
        post_id = create_resp.json()["id"]

        resp = requests.post(
            f"{POSTS_URL}/{post_id}/vote",
            headers=normal2_headers,
            json={"voteType": "upvote"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["upvoteCount"] == 1
        assert data["downvoteCount"] == 0
        assert data["userVote"]["voteType"] == "upvote"

    def test_downvote_with_reason(self, normal_headers, normal2_headers):
        create_resp = _create_post(normal_headers, title="TEST vote down")
        post_id = create_resp.json()["id"]

        resp = requests.post(
            f"{POSTS_URL}/{post_id}/vote",
            headers=normal2_headers,
            json={"voteType": "downvote", "downvoteReason": "spam"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["downvoteCount"] == 1
        assert data["userVote"]["voteType"] == "downvote"
        assert data["userVote"]["downvoteReason"] == "spam"

    def test_downvote_without_reason_400(self, normal_headers, normal2_headers):
        create_resp = _create_post(normal_headers, title="TEST vote no reason")
        post_id = create_resp.json()["id"]

        resp = requests.post(
            f"{POSTS_URL}/{post_id}/vote",
            headers=normal2_headers,
            json={"voteType": "downvote"},
        )
        assert resp.status_code == 400

    def test_toggle_off(self, normal_headers, normal2_headers):
        create_resp = _create_post(normal_headers, title="TEST vote toggle")
        post_id = create_resp.json()["id"]

        # Vote
        requests.post(
            f"{POSTS_URL}/{post_id}/vote",
            headers=normal2_headers,
            json={"voteType": "upvote"},
        )
        # Toggle off (same type again)
        resp = requests.post(
            f"{POSTS_URL}/{post_id}/vote",
            headers=normal2_headers,
            json={"voteType": "upvote"},
        )
        assert resp.status_code == 200
        assert resp.json()["upvoteCount"] == 0
        assert resp.json()["userVote"] is None

    def test_change_vote(self, normal_headers, normal2_headers):
        create_resp = _create_post(normal_headers, title="TEST vote change")
        post_id = create_resp.json()["id"]

        # Upvote first
        requests.post(
            f"{POSTS_URL}/{post_id}/vote",
            headers=normal2_headers,
            json={"voteType": "upvote"},
        )
        # Change to downvote
        resp = requests.post(
            f"{POSTS_URL}/{post_id}/vote",
            headers=normal2_headers,
            json={"voteType": "downvote", "downvoteReason": "offtopic"},
        )
        assert resp.status_code == 200
        assert resp.json()["upvoteCount"] == 0
        assert resp.json()["downvoteCount"] == 1

    def test_self_vote_blocked(self, normal_headers):
        create_resp = _create_post(normal_headers, title="TEST self vote")
        post_id = create_resp.json()["id"]

        resp = requests.post(
            f"{POSTS_URL}/{post_id}/vote",
            headers=normal_headers,
            json={"voteType": "upvote"},
        )
        assert resp.status_code == 400

    def test_denormalized_counts_correct(self, normal_headers, normal2_headers, normal3_headers):
        create_resp = _create_post(normal_headers, title="TEST count check")
        post_id = create_resp.json()["id"]

        # Two upvotes
        requests.post(
            f"{POSTS_URL}/{post_id}/vote",
            headers=normal2_headers,
            json={"voteType": "upvote"},
        )
        requests.post(
            f"{POSTS_URL}/{post_id}/vote",
            headers=normal3_headers,
            json={"voteType": "upvote"},
        )

        row = db_query_one("SELECT upvote_count, downvote_count FROM post WHERE id = %s", (post_id,))
        assert row["upvote_count"] == 2
        assert row["downvote_count"] == 0


class TestReportPost:
    """POST /posts/{postId}/report"""

    def test_report_post(self, normal_headers, normal2_headers):
        create_resp = _create_post(normal_headers, title="TEST report post")
        post_id = create_resp.json()["id"]

        resp = requests.post(
            f"{POSTS_URL}/{post_id}/report",
            headers=normal2_headers,
            json={"ruleId": RULE_VIOLENCE_ID},
        )
        assert resp.status_code == 201
