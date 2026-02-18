"""Tests for GET /users/{userId}/activity."""

import pytest
import requests
from conftest import BASE_URL, NORMAL1_ID, NORMAL2_ID, NONEXISTENT_UUID


def activity_url(user_id, **params):
    url = f"{BASE_URL}/users/{user_id}/activity"
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
        url += f"?{qs}"
    return url


class TestGetUserActivityById:
    """GET /users/{userId}/activity"""

    def test_unauthenticated_returns_401(self):
        resp = requests.get(activity_url(NORMAL1_ID))
        assert resp.status_code == 401

    @pytest.mark.smoke
    def test_returns_activity_page(self, normal_headers):
        resp = requests.get(activity_url(NORMAL1_ID), headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body
        assert "hasMore" in body
        assert isinstance(body["items"], list)

    def test_filter_posts_only(self, normal_headers):
        resp = requests.get(activity_url(NORMAL1_ID, type="posts"), headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        for item in body["items"]:
            assert item["type"] == "post"

    def test_filter_comments_only(self, normal_headers):
        resp = requests.get(activity_url(NORMAL1_ID, type="comments"), headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        for item in body["items"]:
            assert item["type"] == "comment"

    def test_nonexistent_user_returns_404(self, normal_headers):
        resp = requests.get(activity_url(NONEXISTENT_UUID), headers=normal_headers)
        assert resp.status_code == 404

    def test_pagination_limit(self, normal_headers):
        resp = requests.get(activity_url(NORMAL1_ID, limit=1), headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["items"]) <= 1

    def test_can_view_other_users_activity(self, normal_headers):
        """Normal user can view another normal user's activity."""
        resp = requests.get(activity_url(NORMAL2_ID), headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body["items"], list)
