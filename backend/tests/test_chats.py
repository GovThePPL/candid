"""Tests for GET /chats/user/{userId}."""

import pytest
import requests
from conftest import BASE_URL, NORMAL1_ID, ADMIN1_ID


def chats_url(user_id):
    return f"{BASE_URL}/chats/user/{user_id}"


class TestGetUserChats:
    """GET /chats/user/{userId}"""

    @pytest.mark.smoke
    def test_get_chats_returns_list(self, normal_headers):
        resp = requests.get(chats_url(NORMAL1_ID), headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)

    def test_chat_has_expected_fields(self, normal_headers):
        """If user has chats, verify the shape of each entry."""
        resp = requests.get(chats_url(NORMAL1_ID), headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        if len(body) > 0:
            chat = body[0]
            assert "id" in chat
            assert "startTime" in chat
            assert "position" in chat
            assert "otherUser" in chat

    def test_limit_parameter(self, normal_headers):
        resp = requests.get(
            chats_url(NORMAL1_ID),
            headers=normal_headers,
            params={"limit": 1},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) <= 1

    def test_admin_chats(self, admin_headers):
        resp = requests.get(chats_url(ADMIN1_ID), headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_unauthenticated_returns_401(self):
        resp = requests.get(chats_url(NORMAL1_ID))
        assert resp.status_code == 401
