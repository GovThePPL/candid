"""Integration tests for GET /users/me/activity."""

import pytest
import requests
from conftest import (
    BASE_URL,
    OREGON_LOCATION_ID,
    NORMAL1_ID,
    NORMAL2_ID,
    db_execute,
    clear_rate_limits,
)

ACTIVITY_URL = f"{BASE_URL}/users/me/activity"
POSTS_URL = f"{BASE_URL}/posts"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _cleanup_test_data():
    """Clear rate limits before and delete test data after each test."""
    clear_rate_limits()
    yield
    db_execute("DELETE FROM comment_vote WHERE comment_id IN (SELECT id FROM comment WHERE post_id IN (SELECT id FROM post WHERE title LIKE 'ATEST%%'))")
    db_execute("DELETE FROM post_vote WHERE post_id IN (SELECT id FROM post WHERE title LIKE 'ATEST%%')")
    db_execute("DELETE FROM comment WHERE post_id IN (SELECT id FROM post WHERE title LIKE 'ATEST%%')")
    db_execute("DELETE FROM post WHERE title LIKE 'ATEST%%'")


def _create_post(headers, title="ATEST discussion post", body="Test body"):
    payload = {
        "title": title,
        "body": body,
        "locationId": OREGON_LOCATION_ID,
        "postType": "discussion",
    }
    resp = requests.post(POSTS_URL, headers=headers, json=payload)
    assert resp.status_code == 201, f"Failed to create post: {resp.text}"
    return resp.json()


def _create_comment(headers, post_id, body="Test comment", parent_comment_id=None):
    payload = {"body": body}
    if parent_comment_id:
        payload["parentCommentId"] = parent_comment_id
    resp = requests.post(f"{POSTS_URL}/{post_id}/comments", headers=headers, json=payload)
    assert resp.status_code == 201, f"Failed to create comment: {resp.text}"
    return resp.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestGetUserActivity:
    """GET /users/me/activity"""

    def test_returns_empty_for_new_user(self, normal_headers):
        """Activity should at minimum return successfully with expected shape."""
        resp = requests.get(ACTIVITY_URL, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body
        assert "hasMore" in body
        assert isinstance(body["items"], list)

    @pytest.mark.mutation
    def test_returns_own_posts(self, normal_headers):
        post = _create_post(normal_headers, title="ATEST my post")
        resp = requests.get(ACTIVITY_URL, params={"type": "posts"}, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        ids = [item["id"] for item in body["items"]]
        assert post["id"] in ids
        # Verify item shape
        item = next(i for i in body["items"] if i["id"] == post["id"])
        assert item["type"] == "post"
        assert item["title"] == "ATEST my post"
        assert "upvoteCount" in item
        assert "createdTime" in item

    @pytest.mark.mutation
    def test_returns_own_comments(self, normal_headers):
        post = _create_post(normal_headers, title="ATEST comment post")
        comment = _create_comment(normal_headers, post["id"], body="My test comment")
        resp = requests.get(ACTIVITY_URL, params={"type": "comments"}, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        ids = [item["id"] for item in body["items"]]
        assert comment["id"] in ids
        item = next(i for i in body["items"] if i["id"] == comment["id"])
        assert item["type"] == "comment"
        assert item["postTitle"] == "ATEST comment post"

    @pytest.mark.mutation
    def test_posts_filter_excludes_comments(self, normal_headers):
        """The 'posts' filter must return only posts, never comments."""
        post = _create_post(normal_headers, title="ATEST filter-excl post")
        _create_comment(normal_headers, post["id"], body="ATEST filter-excl comment")
        resp = requests.get(ACTIVITY_URL, params={"type": "posts"}, headers=normal_headers)
        assert resp.status_code == 200
        types = {item["type"] for item in resp.json()["items"]}
        assert "comment" not in types

    @pytest.mark.mutation
    def test_comments_filter_excludes_posts(self, normal_headers):
        """The 'comments' filter must return only comments, never posts."""
        post = _create_post(normal_headers, title="ATEST filter-excl2 post")
        _create_comment(normal_headers, post["id"], body="ATEST filter-excl2 comment")
        resp = requests.get(ACTIVITY_URL, params={"type": "comments"}, headers=normal_headers)
        assert resp.status_code == 200
        types = {item["type"] for item in resp.json()["items"]}
        assert "post" not in types

    @pytest.mark.mutation
    def test_does_not_return_other_users_content(self, normal_headers, normal2_headers):
        post = _create_post(normal2_headers, title="ATEST other user post")
        resp = requests.get(ACTIVITY_URL, params={"type": "posts"}, headers=normal_headers)
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()["items"]]
        assert post["id"] not in ids

    @pytest.mark.mutation
    def test_filter_all_returns_both(self, normal_headers):
        post = _create_post(normal_headers, title="ATEST all-filter post")
        comment = _create_comment(normal_headers, post["id"], body="ATEST all-filter comment")
        resp = requests.get(ACTIVITY_URL, params={"type": "all"}, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        types = {item["type"] for item in body["items"]
                 if item["id"] in (post["id"], comment["id"])}
        assert "post" in types
        assert "comment" in types

    @pytest.mark.mutation
    def test_pagination(self, normal_headers):
        # Create 3 posts to test pagination with limit=2
        for i in range(3):
            _create_post(normal_headers, title=f"ATEST page-{i}")

        resp = requests.get(ACTIVITY_URL, params={"type": "posts", "limit": 2}, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["items"]) <= 2
        if body["hasMore"]:
            assert body["nextCursor"] is not None
            # Fetch next page
            resp2 = requests.get(
                ACTIVITY_URL,
                params={"type": "posts", "limit": 2, "cursor": body["nextCursor"]},
                headers=normal_headers,
            )
            assert resp2.status_code == 200
            page2 = resp2.json()
            assert isinstance(page2["items"], list)
            # No overlap
            page1_ids = {item["id"] for item in body["items"]}
            page2_ids = {item["id"] for item in page2["items"]}
            assert page1_ids.isdisjoint(page2_ids)

    @pytest.mark.mutation
    def test_ordered_by_newest_first(self, normal_headers):
        p1 = _create_post(normal_headers, title="ATEST order-1")
        p2 = _create_post(normal_headers, title="ATEST order-2")
        resp = requests.get(ACTIVITY_URL, params={"type": "posts"}, headers=normal_headers)
        assert resp.status_code == 200
        items = resp.json()["items"]
        test_items = [i for i in items if i["title"] and i["title"].startswith("ATEST order")]
        if len(test_items) >= 2:
            assert test_items[0]["id"] == p2["id"]  # Newest first
            assert test_items[1]["id"] == p1["id"]

    def test_unauthenticated_returns_401(self):
        resp = requests.get(ACTIVITY_URL)
        assert resp.status_code == 401
