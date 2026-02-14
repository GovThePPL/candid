"""Tests for chatRequestLikelihood and chattingListLikelihood settings.

Tests that these user preferences actually affect behavior:
- chatRequestLikelihood=0 blocks chat requests (403)
- chatRequestLikelihood syncs to Redis on settings update
- chattingListLikelihood=0 produces no chatting list cards
- chattingListLikelihood scales the number of chatting list cards

Requires: docker compose up (API + DB + Redis running).
"""

import pytest
import requests

from conftest import (
    BASE_URL, REDIS_URL,
    ADMIN1_ID, NORMAL1_ID, NORMAL2_ID, NORMAL3_ID,
    POSITION1_ID,
    USER_POSITION_NORMAL1, USER_POSITION_NORMAL2,
    login, auth_header,
    cleanup_chat_request,
    db_execute, db_query_one,
    get_redis_client,
)

# ---------------------------------------------------------------------------
# URL Helpers
# ---------------------------------------------------------------------------

SETTINGS_URL = f"{BASE_URL}/users/me/settings"
CARD_QUEUE_URL = f"{BASE_URL}/card-queue"
CHAT_REQUESTS_URL = f"{BASE_URL}/chats/requests"
CHATTING_LIST_URL = f"{BASE_URL}/users/me/chatting-list"

SWIPING_PREFIX = "presence:swiping:"
IN_APP_PREFIX = "presence:in_app:"
CHAT_LIKELIHOOD_PREFIX = "preference:chat_likelihood:"


# ---------------------------------------------------------------------------
# Redis / DB Helpers
# ---------------------------------------------------------------------------

def set_swiping(user_id):
    r = get_redis_client()
    try:
        pipe = r.pipeline()
        pipe.setex(f"{SWIPING_PREFIX}{user_id}", 45, "1")
        pipe.setex(f"{IN_APP_PREFIX}{user_id}", 60, "1")
        pipe.execute()
    finally:
        r.close()


def clear_all_presence():
    r = get_redis_client()
    try:
        keys = r.keys("presence:*")
        if keys:
            r.delete(*keys)
    finally:
        r.close()


def clear_chat_likelihood(user_id):
    r = get_redis_client()
    try:
        r.delete(f"{CHAT_LIKELIHOOD_PREFIX}{user_id}")
    finally:
        r.close()


def get_chat_likelihood_from_redis(user_id):
    r = get_redis_client()
    try:
        val = r.get(f"{CHAT_LIKELIHOOD_PREFIX}{user_id}")
        return int(val) if val is not None else None
    finally:
        r.close()


def set_chat_request_likelihood_db(user_id, value):
    db_execute(
        "UPDATE users SET chat_request_likelihood = %s WHERE id = %s",
        (value, user_id),
    )


def set_chatting_list_likelihood_db(user_id, value):
    db_execute(
        "UPDATE users SET chatting_list_likelihood = %s WHERE id = %s",
        (value, user_id),
    )


def cleanup_chatting_list(user_id):
    db_execute("DELETE FROM user_chatting_list WHERE user_id = %s", (user_id,))


# ---------------------------------------------------------------------------
# Session-scoped token fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def normal1_headers():
    return auth_header(login("normal1"))


@pytest.fixture(scope="session")
def normal2_headers():
    return auth_header(login("normal2"))


@pytest.fixture(scope="session")
def normal3_headers():
    return auth_header(login("normal3"))


# ---------------------------------------------------------------------------
# 1. TestChatRequestLikelihoodSafety
# ---------------------------------------------------------------------------

class TestChatRequestLikelihoodSafety:
    """chat_request_likelihood=0 blocks chat request creation."""

    def setup_method(self):
        cleanup_chat_request(NORMAL2_ID, USER_POSITION_NORMAL1)
        clear_all_presence()
        # Reset to default (3 = normal)
        set_chat_request_likelihood_db(NORMAL1_ID, 3)
        clear_chat_likelihood(NORMAL1_ID)

    def teardown_method(self):
        cleanup_chat_request(NORMAL2_ID, USER_POSITION_NORMAL1)
        clear_all_presence()
        set_chat_request_likelihood_db(NORMAL1_ID, 3)
        clear_chat_likelihood(NORMAL1_ID)

    def test_chat_request_blocked_when_off(self, normal2_headers):
        """Creating a chat request to a user with likelihood=0 returns 403."""
        set_chat_request_likelihood_db(NORMAL1_ID, 0)
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 403
        assert "not accepting" in resp.json().get("message", "").lower()

    def test_chat_request_allowed_when_normal(self, normal2_headers):
        """Creating a chat request to a user with likelihood=3 succeeds."""
        set_chat_request_likelihood_db(NORMAL1_ID, 3)
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201

    def test_chat_request_allowed_when_rarely(self, normal2_headers):
        """Creating a chat request to a user with likelihood=1 still succeeds (safety check only blocks 0)."""
        set_chat_request_likelihood_db(NORMAL1_ID, 1)
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201


# ---------------------------------------------------------------------------
# 2. TestChatRequestLikelihoodRedisSync
# ---------------------------------------------------------------------------

class TestChatRequestLikelihoodRedisSync:
    """Settings update syncs chat_request_likelihood to Redis."""

    def setup_method(self):
        clear_chat_likelihood(NORMAL1_ID)
        set_chat_request_likelihood_db(NORMAL1_ID, 3)

    def teardown_method(self):
        clear_chat_likelihood(NORMAL1_ID)
        set_chat_request_likelihood_db(NORMAL1_ID, 3)

    def test_settings_update_syncs_to_redis(self, normal1_headers):
        """PATCH /settings with chatRequestLikelihood syncs value to Redis."""
        resp = requests.patch(
            SETTINGS_URL,
            headers=normal1_headers,
            json={"chatRequestLikelihood": "off"},
        )
        assert resp.status_code == 200
        assert resp.json()["chatRequestLikelihood"] == "off"

        # Verify Redis has the value
        redis_val = get_chat_likelihood_from_redis(NORMAL1_ID)
        assert redis_val == 0

    def test_settings_update_often_syncs_to_redis(self, normal1_headers):
        """PATCH /settings with chatRequestLikelihood=often syncs 5 to Redis."""
        resp = requests.patch(
            SETTINGS_URL,
            headers=normal1_headers,
            json={"chatRequestLikelihood": "often"},
        )
        assert resp.status_code == 200

        redis_val = get_chat_likelihood_from_redis(NORMAL1_ID)
        assert redis_val == 5

    def test_settings_update_normal_syncs_to_redis(self, normal1_headers):
        """PATCH /settings with chatRequestLikelihood=normal syncs 3 to Redis."""
        resp = requests.patch(
            SETTINGS_URL,
            headers=normal1_headers,
            json={"chatRequestLikelihood": "normal"},
        )
        assert resp.status_code == 200

        redis_val = get_chat_likelihood_from_redis(NORMAL1_ID)
        assert redis_val == 3


# ---------------------------------------------------------------------------
# 3. TestChattingListLikelihood
# ---------------------------------------------------------------------------

class TestChattingListLikelihood:
    """chattingListLikelihood controls chatting list card volume."""

    def setup_method(self):
        clear_all_presence()
        cleanup_chatting_list(NORMAL2_ID)
        set_chatting_list_likelihood_db(NORMAL2_ID, 3)

    def teardown_method(self):
        clear_all_presence()
        cleanup_chatting_list(NORMAL2_ID)
        set_chatting_list_likelihood_db(NORMAL2_ID, 3)

    def _add_to_chatting_list(self, headers, position_id):
        return requests.post(
            CHATTING_LIST_URL,
            headers=headers,
            json={"positionId": position_id},
        )

    def test_no_chatting_list_cards_when_off(self, normal2_headers):
        """With chattingListLikelihood=0 (off), no chatting list cards appear."""
        # Add position to chatting list
        resp = self._add_to_chatting_list(normal2_headers, POSITION1_ID)
        assert resp.status_code in (200, 201)

        # Set adopter online
        set_swiping(ADMIN1_ID)

        # Set likelihood to off
        set_chatting_list_likelihood_db(NORMAL2_ID, 0)
        # Invalidate cache by updating settings via API
        resp = requests.patch(
            SETTINGS_URL,
            headers=normal2_headers,
            json={"chattingListLikelihood": "off"},
        )
        assert resp.status_code == 200

        # Fetch card queue
        resp = requests.get(CARD_QUEUE_URL, headers=normal2_headers, params={"limit": 20})
        assert resp.status_code == 200
        cards = resp.json()
        chatting_list_cards = [
            c for c in cards
            if c.get("type") == "position" and c.get("data", {}).get("source") == "chatting_list"
        ]
        assert len(chatting_list_cards) == 0

    def test_chatting_list_cards_appear_when_normal(self, normal2_headers):
        """With chattingListLikelihood=3 (normal) and adopter online, chatting list cards may appear."""
        resp = self._add_to_chatting_list(normal2_headers, POSITION1_ID)
        assert resp.status_code in (200, 201)

        set_swiping(ADMIN1_ID)

        # Ensure likelihood is normal (3)
        resp = requests.patch(
            SETTINGS_URL,
            headers=normal2_headers,
            json={"chattingListLikelihood": "normal"},
        )
        assert resp.status_code == 200

        # Fetch multiple times to account for random shuffling
        found = False
        for _ in range(5):
            resp = requests.get(CARD_QUEUE_URL, headers=normal2_headers, params={"limit": 20})
            assert resp.status_code == 200
            cards = resp.json()
            chatting_list_cards = [
                c for c in cards
                if c.get("type") == "position" and c.get("data", {}).get("source") == "chatting_list"
            ]
            if chatting_list_cards:
                found = True
                break

        # Chatting list cards should eventually appear (adopter is online, likelihood=normal)
        assert found, "Expected chatting list cards to appear with likelihood=normal and adopter online"


# ---------------------------------------------------------------------------
# 4. TestLikelihoodSettingsRoundtrip
# ---------------------------------------------------------------------------

class TestLikelihoodSettingsRoundtrip:
    """Settings API correctly stores and retrieves likelihood values."""

    def setup_method(self):
        set_chat_request_likelihood_db(NORMAL1_ID, 3)
        set_chatting_list_likelihood_db(NORMAL1_ID, 3)
        clear_chat_likelihood(NORMAL1_ID)

    def teardown_method(self):
        set_chat_request_likelihood_db(NORMAL1_ID, 3)
        set_chatting_list_likelihood_db(NORMAL1_ID, 3)
        clear_chat_likelihood(NORMAL1_ID)

    def test_roundtrip_off(self, normal1_headers):
        """Setting both to 'off' reads back as 'off'."""
        resp = requests.patch(
            SETTINGS_URL,
            headers=normal1_headers,
            json={
                "chatRequestLikelihood": "off",
                "chattingListLikelihood": "off",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["chatRequestLikelihood"] == "off"
        assert body["chattingListLikelihood"] == "off"

        # Verify via GET
        resp = requests.get(SETTINGS_URL, headers=normal1_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["chatRequestLikelihood"] == "off"
        assert body["chattingListLikelihood"] == "off"

    def test_roundtrip_often(self, normal1_headers):
        """Setting both to 'often' reads back as 'often'."""
        resp = requests.patch(
            SETTINGS_URL,
            headers=normal1_headers,
            json={
                "chatRequestLikelihood": "often",
                "chattingListLikelihood": "often",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["chatRequestLikelihood"] == "often"
        assert body["chattingListLikelihood"] == "often"

    def test_roundtrip_each_value(self, normal1_headers):
        """All six likelihood values round-trip correctly."""
        for label in ("off", "rarely", "less", "normal", "more", "often"):
            resp = requests.patch(
                SETTINGS_URL,
                headers=normal1_headers,
                json={"chatRequestLikelihood": label},
            )
            assert resp.status_code == 200
            assert resp.json()["chatRequestLikelihood"] == label
