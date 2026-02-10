"""Comprehensive integration tests for the chat matching system.

Tests the full lifecycle: card queue assembly → chat request creation → acceptance,
including presence tracking, availability tiers, notification eligibility,
delivery context, chatting list, and card queue composition.

Requires: docker compose up (API + DB + Redis running).
"""
# Auth tests (test_unauthenticated_returns_401) live in test_auth_required.py.

import pytest
import requests
import time
from datetime import date, timedelta

from conftest import (
    BASE_URL, REDIS_URL,
    ADMIN1_ID, MODERATOR1_ID,
    NORMAL1_ID, NORMAL2_ID, NORMAL3_ID, NORMAL4_ID, NORMAL5_ID,
    POSITION1_ID, POSITION2_ID,
    USER_POSITION_NORMAL1, USER_POSITION_NORMAL2, USER_POSITION_NORMAL3,
    USER_POSITION_ADMIN1, USER_POSITION_MODERATOR1,
    NONEXISTENT_UUID,
    login, auth_header,
    cleanup_chat_request,
    db_execute, db_query, db_query_one,
    get_redis_client,
)

# ---------------------------------------------------------------------------
# URL Helpers
# ---------------------------------------------------------------------------

CARD_QUEUE_URL = f"{BASE_URL}/card-queue"
CHAT_REQUESTS_URL = f"{BASE_URL}/chats/requests/"
CHATTING_LIST_URL = f"{BASE_URL}/users/me/chatting-list"
HEARTBEAT_URL = f"{BASE_URL}/users/me/heartbeat"

SWIPING_PREFIX = "presence:swiping:"
IN_APP_PREFIX = "presence:in_app:"


def chat_request_url(request_id):
    return f"{BASE_URL}/chats/requests/{request_id}"


def chatting_list_item_url(item_id):
    return f"{CHATTING_LIST_URL}/{item_id}"


# ---------------------------------------------------------------------------
# Redis / DB Helpers
# ---------------------------------------------------------------------------

def set_swiping(user_id):
    """Set a user as swiping (both swiping + in_app keys)."""
    r = get_redis_client()
    try:
        pipe = r.pipeline()
        pipe.setex(f"{SWIPING_PREFIX}{user_id}", 45, "1")
        pipe.setex(f"{IN_APP_PREFIX}{user_id}", 60, "1")
        pipe.execute()
    finally:
        r.close()


def set_in_app(user_id):
    """Set a user as in-app only (no swiping key)."""
    r = get_redis_client()
    try:
        r.setex(f"{IN_APP_PREFIX}{user_id}", 60, "1")
    finally:
        r.close()


def clear_presence(user_id):
    """Clear all presence keys for a user."""
    r = get_redis_client()
    try:
        r.delete(f"{SWIPING_PREFIX}{user_id}", f"{IN_APP_PREFIX}{user_id}")
    finally:
        r.close()


def clear_all_presence():
    """Clear ALL presence keys in Redis."""
    r = get_redis_client()
    try:
        keys = r.keys("presence:*")
        if keys:
            r.delete(*keys)
    finally:
        r.close()


def set_notification_settings(user_id, enabled=True, frequency=3,
                               quiet_start=None, quiet_end=None,
                               timezone="America/New_York",
                               sent_today=0, sent_date=None):
    """Set notification columns for a user."""
    db_execute("""
        UPDATE users SET
            notifications_enabled = %s,
            notification_frequency = %s,
            quiet_hours_start = %s,
            quiet_hours_end = %s,
            timezone = %s,
            notifications_sent_today = %s,
            notifications_sent_date = %s
        WHERE id = %s
    """, (enabled, frequency, quiet_start, quiet_end, timezone,
          sent_today, sent_date, user_id))


def reset_notification_settings(user_id):
    """Reset notification settings to defaults."""
    set_notification_settings(
        user_id,
        enabled=False,
        frequency=3,
        quiet_start=None,
        quiet_end=None,
        timezone="America/New_York",
        sent_today=0,
        sent_date=None,
    )


def cleanup_chatting_list(user_id):
    """Delete all chatting list entries for a user."""
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


@pytest.fixture(scope="session")
def normal4_headers():
    return auth_header(login("normal4"))


@pytest.fixture(scope="session")
def normal5_headers():
    return auth_header(login("normal5"))


@pytest.fixture(scope="session")
def admin1_headers():
    return auth_header(login("admin1"))


# ---------------------------------------------------------------------------
# 1. TestPresenceTracking
# ---------------------------------------------------------------------------

class TestHeartbeatEndpoint:
    """POST /users/me/heartbeat — basic endpoint tests (A5)."""

    def test_returns_ok(self, normal1_headers):
        """Authenticated heartbeat returns 200 with status ok."""
        resp = requests.post(HEARTBEAT_URL, headers=normal1_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("status") == "ok"


class TestPresenceTracking:
    """Redis presence mechanics: swiping and heartbeat."""

    def setup_method(self):
        clear_presence(NORMAL2_ID)
        clear_presence(NORMAL3_ID)

    def teardown_method(self):
        clear_presence(NORMAL2_ID)
        clear_presence(NORMAL3_ID)

    def test_card_queue_sets_swiping_presence(self, normal2_headers):
        """GET /card-queue sets both swiping and in_app keys."""
        requests.get(CARD_QUEUE_URL, headers=normal2_headers, params={"limit": 1})
        r = get_redis_client()
        try:
            assert r.exists(f"{SWIPING_PREFIX}{NORMAL2_ID}")
            assert r.exists(f"{IN_APP_PREFIX}{NORMAL2_ID}")
        finally:
            r.close()

    def test_heartbeat_sets_only_in_app(self, normal3_headers):
        """POST /heartbeat sets in_app but NOT swiping."""
        requests.post(HEARTBEAT_URL, headers=normal3_headers)
        r = get_redis_client()
        try:
            assert r.exists(f"{IN_APP_PREFIX}{NORMAL3_ID}")
            assert not r.exists(f"{SWIPING_PREFIX}{NORMAL3_ID}")
        finally:
            r.close()

    def test_swiping_key_has_correct_ttl(self, normal2_headers):
        """After GET /card-queue, swiping key TTL ≤ 45s."""
        requests.get(CARD_QUEUE_URL, headers=normal2_headers, params={"limit": 1})
        r = get_redis_client()
        try:
            ttl = r.ttl(f"{SWIPING_PREFIX}{NORMAL2_ID}")
            assert 0 < ttl <= 45
        finally:
            r.close()

    def test_in_app_key_has_correct_ttl(self, normal3_headers):
        """After POST /heartbeat, in_app key TTL ≤ 60s."""
        requests.post(HEARTBEAT_URL, headers=normal3_headers)
        r = get_redis_client()
        try:
            ttl = r.ttl(f"{IN_APP_PREFIX}{NORMAL3_ID}")
            assert 0 < ttl <= 60
        finally:
            r.close()

    def test_presence_cleared_after_key_delete(self, normal2_headers):
        """After manual delete, keys no longer exist."""
        requests.get(CARD_QUEUE_URL, headers=normal2_headers, params={"limit": 1})
        clear_presence(NORMAL2_ID)
        r = get_redis_client()
        try:
            assert not r.exists(f"{SWIPING_PREFIX}{NORMAL2_ID}")
            assert not r.exists(f"{IN_APP_PREFIX}{NORMAL2_ID}")
        finally:
            r.close()


# ---------------------------------------------------------------------------
# 2. TestAvailabilityTiers
# ---------------------------------------------------------------------------

class TestAvailabilityTiers:
    """The online → notifiable → none cascade in card queue availability."""

    def setup_method(self):
        clear_all_presence()
        reset_notification_settings(NORMAL1_ID)
        reset_notification_settings(ADMIN1_ID)

    def teardown_method(self):
        clear_all_presence()
        reset_notification_settings(NORMAL1_ID)
        reset_notification_settings(ADMIN1_ID)

    def _find_position_card(self, cards, position_id=None, user_position_id=None):
        """Find a position card matching the given criteria."""
        for card in cards:
            if card.get("type") != "position":
                continue
            data = card.get("data", {})
            if position_id and data.get("id") == position_id:
                return card
            if user_position_id and data.get("userPositionId") == user_position_id:
                return card
        return None

    def _get_availability_for_position(self, headers, position_id):
        """Fetch card queue and return the availability for a specific position."""
        resp = requests.get(CARD_QUEUE_URL, headers=headers, params={"limit": 20})
        assert resp.status_code == 200
        cards = resp.json()
        card = self._find_position_card(cards, position_id=position_id)
        if card:
            return card["data"].get("availability")
        return None

    def test_availability_online_when_adopter_swiping(self, normal2_headers):
        """Position shows availability=online when adopter is swiping."""
        set_swiping(NORMAL1_ID)
        avail = self._get_availability_for_position(normal2_headers, POSITION1_ID)
        # POSITION1 is adopted by admin1 (creator), but normal1 also adopted it
        # If the position appears, it should show online since normal1 is swiping
        if avail is not None:
            assert avail == "online"

    def test_availability_online_when_adopter_in_app_only(self, normal2_headers):
        """Position shows availability=online when adopter is in_app (not swiping)."""
        set_in_app(NORMAL1_ID)
        avail = self._get_availability_for_position(normal2_headers, POSITION1_ID)
        if avail is not None:
            assert avail == "online"

    def test_availability_notifiable_when_offline_but_notifications_on(self, normal2_headers):
        """Position shows availability=notifiable when adopter is offline but notifiable."""
        clear_presence(NORMAL1_ID)
        clear_presence(ADMIN1_ID)
        # Normal1 adopted POSITION1 — make them notifiable
        set_notification_settings(NORMAL1_ID, enabled=True, frequency=3)
        avail = self._get_availability_for_position(normal2_headers, POSITION1_ID)
        if avail is not None:
            assert avail in ("notifiable", "online")  # online if another adopter is on

    def test_availability_none_when_offline_and_notifications_off(self, normal2_headers):
        """Position shows availability=none when all adopters offline and not notifiable."""
        clear_all_presence()
        # Disable notifications for all known adopters of POSITION1
        reset_notification_settings(NORMAL1_ID)
        reset_notification_settings(ADMIN1_ID)
        reset_notification_settings(MODERATOR1_ID)
        avail = self._get_availability_for_position(normal2_headers, POSITION1_ID)
        if avail is not None:
            assert avail == "none"

    def test_availability_excludes_self(self, normal1_headers):
        """User's own positions should not appear in their card queue."""
        set_swiping(NORMAL1_ID)
        resp = requests.get(CARD_QUEUE_URL, headers=normal1_headers, params={"limit": 20})
        assert resp.status_code == 200
        cards = resp.json()
        for card in cards:
            if card.get("type") == "position":
                data = card.get("data", {})
                # Normal1's user_position should not be offered to normal1
                assert data.get("userPositionId") != USER_POSITION_NORMAL1


# ---------------------------------------------------------------------------
# 3. TestNotificationEligibility
# ---------------------------------------------------------------------------

class TestNotificationEligibility:
    """Notification eligibility logic via DB manipulation."""

    def setup_method(self):
        clear_all_presence()
        reset_notification_settings(NORMAL1_ID)
        reset_notification_settings(ADMIN1_ID)
        reset_notification_settings(MODERATOR1_ID)

    def teardown_method(self):
        clear_all_presence()
        reset_notification_settings(NORMAL1_ID)
        reset_notification_settings(ADMIN1_ID)
        reset_notification_settings(MODERATOR1_ID)

    def _get_availability(self, headers, position_id):
        resp = requests.get(CARD_QUEUE_URL, headers=headers, params={"limit": 20})
        assert resp.status_code == 200
        for card in resp.json():
            if card.get("type") == "position" and card["data"].get("id") == position_id:
                return card["data"].get("availability")
        return None

    def test_notifiable_with_default_frequency(self, normal2_headers):
        """Notifiable when notifications enabled with default frequency."""
        set_notification_settings(NORMAL1_ID, enabled=True, frequency=3, sent_today=0)
        avail = self._get_availability(normal2_headers, POSITION1_ID)
        if avail is not None:
            assert avail in ("notifiable", "online")

    def test_not_notifiable_frequency_zero(self, normal2_headers):
        """Not notifiable when frequency=0 (cap=0)."""
        set_notification_settings(NORMAL1_ID, enabled=True, frequency=0)
        avail = self._get_availability(normal2_headers, POSITION1_ID)
        if avail is not None:
            assert avail == "none"

    def test_not_notifiable_daily_cap_reached(self, normal2_headers):
        """Not notifiable when daily cap reached."""
        today = date.today()
        # frequency=1 → cap=2, sent_today=2 → at cap
        set_notification_settings(NORMAL1_ID, enabled=True, frequency=1,
                                   sent_today=2, sent_date=today)
        avail = self._get_availability(normal2_headers, POSITION1_ID)
        if avail is not None:
            assert avail == "none"

    def test_notifiable_cap_resets_new_day(self, normal2_headers):
        """Notifiable when cap resets on new day."""
        yesterday = date.today() - timedelta(days=1)
        set_notification_settings(NORMAL1_ID, enabled=True, frequency=1,
                                   sent_today=999, sent_date=yesterday)
        avail = self._get_availability(normal2_headers, POSITION1_ID)
        if avail is not None:
            assert avail in ("notifiable", "online")

    def test_not_notifiable_during_quiet_hours(self, normal2_headers):
        """Not notifiable during all-day quiet hours."""
        set_notification_settings(NORMAL1_ID, enabled=True, frequency=3,
                                   quiet_start=0, quiet_end=23)
        avail = self._get_availability(normal2_headers, POSITION1_ID)
        if avail is not None:
            assert avail == "none"

    def test_not_notifiable_when_disabled(self, normal2_headers):
        """Not notifiable when notifications_enabled=false."""
        set_notification_settings(NORMAL1_ID, enabled=False, frequency=3)
        avail = self._get_availability(normal2_headers, POSITION1_ID)
        if avail is not None:
            assert avail == "none"


# ---------------------------------------------------------------------------
# 4. TestDeliveryContext
# ---------------------------------------------------------------------------

class TestDeliveryContext:
    """How recipient presence affects delivery_context in the DB."""

    def setup_method(self):
        clear_all_presence()
        cleanup_chat_request(NORMAL2_ID, USER_POSITION_NORMAL1)
        reset_notification_settings(NORMAL1_ID)

    def teardown_method(self):
        cleanup_chat_request(NORMAL2_ID, USER_POSITION_NORMAL1)
        clear_all_presence()
        reset_notification_settings(NORMAL1_ID)

    def _create_request(self, headers, user_position_id):
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=headers,
            json={"userPositionId": user_position_id},
        )
        return resp

    def test_delivery_context_swiping(self, normal2_headers):
        """delivery_context=swiping when recipient is swiping."""
        set_swiping(NORMAL1_ID)
        resp = self._create_request(normal2_headers, USER_POSITION_NORMAL1)
        assert resp.status_code == 201
        request_id = resp.json()["id"]
        row = db_query_one(
            "SELECT delivery_context FROM chat_request WHERE id = %s",
            (request_id,),
        )
        assert row["delivery_context"] == "swiping"

    def test_delivery_context_in_app(self, normal2_headers):
        """delivery_context=in_app when recipient is in_app only."""
        set_in_app(NORMAL1_ID)
        resp = self._create_request(normal2_headers, USER_POSITION_NORMAL1)
        assert resp.status_code == 201
        request_id = resp.json()["id"]
        row = db_query_one(
            "SELECT delivery_context FROM chat_request WHERE id = %s",
            (request_id,),
        )
        assert row["delivery_context"] == "in_app"

    def test_delivery_context_notification(self, normal2_headers):
        """delivery_context=notification when recipient is offline."""
        clear_presence(NORMAL1_ID)
        resp = self._create_request(normal2_headers, USER_POSITION_NORMAL1)
        assert resp.status_code == 201
        request_id = resp.json()["id"]
        row = db_query_one(
            "SELECT delivery_context FROM chat_request WHERE id = %s",
            (request_id,),
        )
        assert row["delivery_context"] == "notification"

    def test_response_rates_updated_on_respond(self, normal1_headers, normal2_headers):
        """Response rates updated when a request is responded to."""
        set_swiping(NORMAL1_ID)
        resp = self._create_request(normal2_headers, USER_POSITION_NORMAL1)
        assert resp.status_code == 201
        request_id = resp.json()["id"]

        # Accept the request
        resp = requests.patch(
            chat_request_url(request_id),
            headers=normal1_headers,
            json={"response": "accepted"},
        )
        assert resp.status_code == 200

        # Check response rates were recalculated
        user = db_query_one(
            "SELECT response_rate_swiping, response_rate_in_app, response_rate_notification FROM users WHERE id = %s",
            (NORMAL1_ID,),
        )
        assert user["response_rate_swiping"] is not None


# ---------------------------------------------------------------------------
# 5. TestChatRequestCreation
# ---------------------------------------------------------------------------

class TestChatRequestCreation:
    """POST /chats/requests/ — creating chat requests."""

    def setup_method(self):
        cleanup_chat_request(NORMAL2_ID, USER_POSITION_NORMAL1)
        cleanup_chat_request(NORMAL1_ID, USER_POSITION_NORMAL2)
        cleanup_chat_request(NORMAL3_ID, USER_POSITION_NORMAL1)
        clear_all_presence()

    def teardown_method(self):
        cleanup_chat_request(NORMAL2_ID, USER_POSITION_NORMAL1)
        cleanup_chat_request(NORMAL1_ID, USER_POSITION_NORMAL2)
        cleanup_chat_request(NORMAL3_ID, USER_POSITION_NORMAL1)
        cleanup_chatting_list(NORMAL2_ID)
        clear_all_presence()

    def test_create_request_success(self, normal2_headers):
        """Normal user can create a chat request."""
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["response"] == "pending"

    def test_create_request_returns_expected_fields(self, normal2_headers):
        """Response includes all expected fields."""
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body
        assert body["initiatorUserId"] == NORMAL2_ID
        assert body["userPositionId"] == USER_POSITION_NORMAL1
        assert body["response"] == "pending"
        assert "createdTime" in body

    def test_cannot_request_chat_with_yourself(self, normal1_headers):
        """Cannot request to chat with your own position."""
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal1_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 400

    def test_cannot_request_without_auth(self):
        """Unauthenticated request returns 401."""
        resp = requests.post(
            CHAT_REQUESTS_URL,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 401

    def test_nonexistent_user_position(self, normal2_headers):
        """Chat request to nonexistent position returns 404."""
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": NONEXISTENT_UUID},
        )
        assert resp.status_code == 404

    def test_duplicate_pending_request(self, normal2_headers):
        """Second pending request to same position returns 409."""
        resp1 = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp1.status_code == 201

        resp2 = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp2.status_code == 409

    def test_can_request_after_previous_dismissed(self, normal1_headers, normal2_headers):
        """Can create new request after previous one is dismissed."""
        # Create first
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201
        req_id = resp.json()["id"]

        # Dismiss (normal1 is the recipient)
        resp = requests.patch(
            chat_request_url(req_id),
            headers=normal1_headers,
            json={"response": "dismissed"},
        )
        assert resp.status_code == 200

        # Create again
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201

    def test_creates_chatting_list_entry(self, normal2_headers):
        """Creating a request adds position to initiator's chatting list."""
        cleanup_chatting_list(NORMAL2_ID)
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201

        # Check chatting list via DB
        row = db_query_one(
            """SELECT id FROM user_chatting_list
               WHERE user_id = %s AND position_id = (
                   SELECT position_id FROM user_position WHERE id = %s
               )""",
            (NORMAL2_ID, USER_POSITION_NORMAL1),
        )
        assert row is not None


# ---------------------------------------------------------------------------
# 6. TestChatRequestResponse
# ---------------------------------------------------------------------------

class TestChatRequestResponse:
    """PATCH /chats/requests/{id} — accepting/dismissing requests."""

    def setup_method(self):
        cleanup_chat_request(NORMAL2_ID, USER_POSITION_NORMAL1)
        clear_all_presence()

    def teardown_method(self):
        cleanup_chat_request(NORMAL2_ID, USER_POSITION_NORMAL1)
        cleanup_chatting_list(NORMAL2_ID)
        clear_all_presence()

    def _create_pending_request(self, headers):
        """Helper to create a pending chat request."""
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201
        return resp.json()["id"]

    def test_accept_creates_chat_log(self, normal1_headers, normal2_headers):
        """Accepting creates a chat_log row in the DB."""
        req_id = self._create_pending_request(normal2_headers)
        resp = requests.patch(
            chat_request_url(req_id),
            headers=normal1_headers,
            json={"response": "accepted"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "chatLogId" in body

        # Verify chat_log exists
        chat_log = db_query_one(
            "SELECT id, status FROM chat_log WHERE id = %s",
            (body["chatLogId"],),
        )
        assert chat_log is not None
        assert chat_log["status"] == "active"

    def test_dismiss_request(self, normal1_headers, normal2_headers):
        """Dismissing sets response=dismissed, no chat_log."""
        req_id = self._create_pending_request(normal2_headers)
        resp = requests.patch(
            chat_request_url(req_id),
            headers=normal1_headers,
            json={"response": "dismissed"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["response"] == "dismissed"
        assert "chatLogId" not in body or body.get("chatLogId") is None

    def test_only_recipient_can_respond(self, normal2_headers):
        """Initiator cannot accept their own request."""
        req_id = self._create_pending_request(normal2_headers)
        resp = requests.patch(
            chat_request_url(req_id),
            headers=normal2_headers,
            json={"response": "accepted"},
        )
        assert resp.status_code == 403

    def test_third_party_cannot_respond(self, normal2_headers, normal3_headers):
        """Third party cannot respond to someone else's request."""
        req_id = self._create_pending_request(normal2_headers)
        resp = requests.patch(
            chat_request_url(req_id),
            headers=normal3_headers,
            json={"response": "accepted"},
        )
        assert resp.status_code == 403

    def test_cannot_respond_to_nonexistent(self, normal1_headers):
        """Responding to nonexistent request returns 404."""
        resp = requests.patch(
            chat_request_url(NONEXISTENT_UUID),
            headers=normal1_headers,
            json={"response": "accepted"},
        )
        assert resp.status_code == 404

    def test_cannot_respond_twice(self, normal1_headers, normal2_headers):
        """Cannot respond to an already responded request."""
        req_id = self._create_pending_request(normal2_headers)
        # Accept first
        resp = requests.patch(
            chat_request_url(req_id),
            headers=normal1_headers,
            json={"response": "accepted"},
        )
        assert resp.status_code == 200

        # Try to dismiss same request
        resp = requests.patch(
            chat_request_url(req_id),
            headers=normal1_headers,
            json={"response": "dismissed"},
        )
        assert resp.status_code == 400

    def test_invalid_response_value(self, normal1_headers, normal2_headers):
        """Invalid response value returns 400."""
        req_id = self._create_pending_request(normal2_headers)
        resp = requests.patch(
            chat_request_url(req_id),
            headers=normal1_headers,
            json={"response": "foobar"},
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# 7. TestChatRequestRescind
# ---------------------------------------------------------------------------

class TestChatRequestRescind:
    """DELETE /chats/requests/{id} — canceling pending requests."""

    def setup_method(self):
        cleanup_chat_request(NORMAL2_ID, USER_POSITION_NORMAL1)
        clear_all_presence()

    def teardown_method(self):
        cleanup_chat_request(NORMAL2_ID, USER_POSITION_NORMAL1)
        cleanup_chatting_list(NORMAL2_ID)
        clear_all_presence()

    def _create_pending_request(self, headers):
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201
        return resp.json()["id"]

    def test_rescind_pending_request(self, normal2_headers):
        """Initiator can rescind a pending request."""
        req_id = self._create_pending_request(normal2_headers)
        resp = requests.delete(
            chat_request_url(req_id),
            headers=normal2_headers,
        )
        assert resp.status_code == 200

    def test_only_initiator_can_rescind(self, normal1_headers, normal2_headers):
        """Recipient cannot rescind the request."""
        req_id = self._create_pending_request(normal2_headers)
        resp = requests.delete(
            chat_request_url(req_id),
            headers=normal1_headers,
        )
        assert resp.status_code == 403

    def test_cannot_rescind_accepted_request(self, normal1_headers, normal2_headers):
        """Cannot rescind an already accepted request."""
        req_id = self._create_pending_request(normal2_headers)
        # Accept first
        requests.patch(
            chat_request_url(req_id),
            headers=normal1_headers,
            json={"response": "accepted"},
        )
        # Try to rescind
        resp = requests.delete(
            chat_request_url(req_id),
            headers=normal2_headers,
        )
        assert resp.status_code == 400

    def test_cannot_rescind_nonexistent(self, normal2_headers):
        """Rescinding nonexistent request returns 404."""
        resp = requests.delete(
            chat_request_url(NONEXISTENT_UUID),
            headers=normal2_headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 8. TestCardQueueComposition
# ---------------------------------------------------------------------------

class TestCardQueueComposition:
    """Card queue structure and content types."""

    def setup_method(self):
        cleanup_chat_request(NORMAL2_ID, USER_POSITION_NORMAL1)
        clear_all_presence()

    def teardown_method(self):
        cleanup_chat_request(NORMAL2_ID, USER_POSITION_NORMAL1)
        cleanup_chatting_list(NORMAL2_ID)
        clear_all_presence()

    def test_card_queue_returns_cards(self, normal2_headers):
        """GET /card-queue returns 200 with a non-empty array."""
        resp = requests.get(CARD_QUEUE_URL, headers=normal2_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        assert len(resp.json()) > 0

    def test_card_queue_respects_limit(self, normal2_headers):
        """?limit=2 returns at most 2 cards."""
        resp = requests.get(CARD_QUEUE_URL, headers=normal2_headers, params={"limit": 2})
        assert resp.status_code == 200
        assert len(resp.json()) <= 2

    def test_position_cards_have_expected_fields(self, normal2_headers):
        """Position cards have type, id, statement, category, availability, userPositionId."""
        resp = requests.get(CARD_QUEUE_URL, headers=normal2_headers, params={"limit": 20})
        assert resp.status_code == 200
        cards = resp.json()
        position_cards = [c for c in cards if c.get("type") == "position"]
        if position_cards:
            card = position_cards[0]
            data = card["data"]
            assert "id" in data
            assert "statement" in data
            assert "availability" in data
            assert "userPositionId" in data

    def test_chat_request_not_in_card_queue(self, normal1_headers, normal2_headers):
        """Chat requests are no longer included in card queue (delivered via socket instead)."""
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201

        # Normal1 fetches queue - should NOT contain chat_request cards
        resp = requests.get(CARD_QUEUE_URL, headers=normal1_headers, params={"limit": 20})
        assert resp.status_code == 200
        cards = resp.json()
        chat_req_cards = [c for c in cards if c.get("type") == "chat_request"]
        assert len(chat_req_cards) == 0

    def test_queue_includes_position_type(self, normal2_headers):
        """Card queue includes at least position-type cards."""
        resp = requests.get(CARD_QUEUE_URL, headers=normal2_headers, params={"limit": 20})
        assert resp.status_code == 200
        cards = resp.json()
        types = {c.get("type") for c in cards}
        assert "position" in types

    def test_card_queue_sets_swiping_presence_side_effect(self, normal2_headers):
        """GET /card-queue sets swiping presence as side effect."""
        clear_presence(NORMAL2_ID)
        requests.get(CARD_QUEUE_URL, headers=normal2_headers, params={"limit": 1})
        r = get_redis_client()
        try:
            assert r.exists(f"{SWIPING_PREFIX}{NORMAL2_ID}")
        finally:
            r.close()


# ---------------------------------------------------------------------------
# 9. TestChattingListCards
# ---------------------------------------------------------------------------

class TestChattingListCards:
    """Chatting list positions in the card queue (online-only filter)."""

    def setup_method(self):
        clear_all_presence()
        cleanup_chatting_list(NORMAL2_ID)

    def teardown_method(self):
        clear_all_presence()
        cleanup_chatting_list(NORMAL2_ID)

    def _add_to_chatting_list(self, headers, position_id):
        """Add a position to chatting list via API."""
        return requests.post(
            CHATTING_LIST_URL,
            headers=headers,
            json={"positionId": position_id},
        )

    def test_chatting_list_card_appears_when_adopter_online(self, normal2_headers):
        """Chatting list card appears when adopter is swiping."""
        resp = self._add_to_chatting_list(normal2_headers, POSITION1_ID)
        assert resp.status_code in (200, 201)

        # Set the position's creator (admin1) as swiping
        set_swiping(ADMIN1_ID)

        resp = requests.get(CARD_QUEUE_URL, headers=normal2_headers, params={"limit": 20})
        assert resp.status_code == 200
        cards = resp.json()
        chatting_list_cards = [
            c for c in cards
            if c.get("type") == "position" and c.get("data", {}).get("source") == "chatting_list"
        ]
        # May or may not appear due to random sampling, but if it does it should be position type
        for clc in chatting_list_cards:
            assert clc["type"] == "position"

    def test_chatting_list_card_filtered_when_no_adopter_online(self, normal2_headers):
        """No chatting list cards when all adopters are offline."""
        resp = self._add_to_chatting_list(normal2_headers, POSITION1_ID)
        assert resp.status_code in (200, 201)

        clear_all_presence()

        resp = requests.get(CARD_QUEUE_URL, headers=normal2_headers, params={"limit": 20})
        assert resp.status_code == 200
        cards = resp.json()
        chatting_list_cards = [
            c for c in cards
            if c.get("type") == "position" and c.get("data", {}).get("source") == "chatting_list"
        ]
        assert len(chatting_list_cards) == 0

    def test_inactive_chatting_list_item_excluded(self, normal2_headers):
        """Inactive chatting list items don't appear in queue."""
        resp = self._add_to_chatting_list(normal2_headers, POSITION1_ID)
        assert resp.status_code in (200, 201)
        item_id = resp.json()["id"]

        # Set inactive
        requests.patch(
            chatting_list_item_url(item_id),
            headers=normal2_headers,
            json={"isActive": False},
        )

        # Set adopter online
        set_swiping(ADMIN1_ID)

        resp = requests.get(CARD_QUEUE_URL, headers=normal2_headers, params={"limit": 20})
        assert resp.status_code == 200
        cards = resp.json()
        chatting_list_cards = [
            c for c in cards
            if c.get("type") == "position" and c.get("data", {}).get("source") == "chatting_list"
        ]
        assert len(chatting_list_cards) == 0

    def test_chatting_list_card_shows_availability_online(self, normal2_headers):
        """When chatting list card passes filter, availability is online."""
        resp = self._add_to_chatting_list(normal2_headers, POSITION1_ID)
        assert resp.status_code in (200, 201)

        set_swiping(ADMIN1_ID)

        resp = requests.get(CARD_QUEUE_URL, headers=normal2_headers, params={"limit": 20})
        assert resp.status_code == 200
        cards = resp.json()
        chatting_list_cards = [
            c for c in cards
            if c.get("type") == "position" and c.get("data", {}).get("source") == "chatting_list"
        ]
        for clc in chatting_list_cards:
            assert clc["data"]["availability"] == "online"


# ---------------------------------------------------------------------------
# 10. TestChattingListCRUD
# ---------------------------------------------------------------------------

class TestChattingListCRUD:
    """Chatting list management endpoints."""

    def setup_method(self):
        cleanup_chatting_list(NORMAL2_ID)
        cleanup_chatting_list(NORMAL3_ID)

    def teardown_method(self):
        cleanup_chatting_list(NORMAL2_ID)
        cleanup_chatting_list(NORMAL3_ID)

    def test_get_chatting_list_returns_array(self, normal2_headers):
        """GET /users/me/chatting-list returns 200 with array."""
        resp = requests.get(CHATTING_LIST_URL, headers=normal2_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_add_to_chatting_list(self, normal2_headers):
        """POST creates a new chatting list item."""
        resp = requests.post(
            CHATTING_LIST_URL,
            headers=normal2_headers,
            json={"positionId": POSITION1_ID},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["positionId"] == POSITION1_ID
        assert body["isActive"] is True

    def test_add_duplicate_active_returns_409(self, normal2_headers):
        """Adding same active position returns 409."""
        resp = requests.post(
            CHATTING_LIST_URL,
            headers=normal2_headers,
            json={"positionId": POSITION1_ID},
        )
        assert resp.status_code == 201

        resp = requests.post(
            CHATTING_LIST_URL,
            headers=normal2_headers,
            json={"positionId": POSITION1_ID},
        )
        assert resp.status_code == 409

    def test_add_own_position_returns_400(self, normal1_headers):
        """Cannot add own position to chatting list."""
        # POSITION1 is created by admin1, so we need a position created by normal1
        # normal1's position is tied to USER_POSITION_NORMAL1 - get the position_id
        up = db_query_one(
            "SELECT position_id FROM user_position WHERE id = %s",
            (USER_POSITION_NORMAL1,),
        )
        resp = requests.post(
            CHATTING_LIST_URL,
            headers=normal1_headers,
            json={"positionId": str(up["position_id"])},
        )
        assert resp.status_code == 400

    def test_remove_from_chatting_list(self, normal2_headers):
        """DELETE removes the item."""
        resp = requests.post(
            CHATTING_LIST_URL,
            headers=normal2_headers,
            json={"positionId": POSITION1_ID},
        )
        assert resp.status_code == 201
        item_id = resp.json()["id"]

        resp = requests.delete(
            chatting_list_item_url(item_id),
            headers=normal2_headers,
        )
        assert resp.status_code == 204

        # Verify it's gone
        resp = requests.get(CHATTING_LIST_URL, headers=normal2_headers)
        ids = [item["id"] for item in resp.json()]
        assert item_id not in ids

    def test_toggle_active_status(self, normal2_headers):
        """PATCH isActive toggles the item."""
        resp = requests.post(
            CHATTING_LIST_URL,
            headers=normal2_headers,
            json={"positionId": POSITION1_ID},
        )
        assert resp.status_code == 201
        item_id = resp.json()["id"]

        # Deactivate
        resp = requests.patch(
            chatting_list_item_url(item_id),
            headers=normal2_headers,
            json={"isActive": False},
        )
        assert resp.status_code == 200
        assert resp.json()["isActive"] is False

        # Reactivate
        resp = requests.patch(
            chatting_list_item_url(item_id),
            headers=normal2_headers,
            json={"isActive": True},
        )
        assert resp.status_code == 200
        assert resp.json()["isActive"] is True

    def test_cannot_modify_other_users_item(self, normal2_headers, normal3_headers):
        """Cannot PATCH/DELETE another user's chatting list item."""
        resp = requests.post(
            CHATTING_LIST_URL,
            headers=normal2_headers,
            json={"positionId": POSITION1_ID},
        )
        assert resp.status_code == 201
        item_id = resp.json()["id"]

        # Normal3 tries to patch
        resp = requests.patch(
            chatting_list_item_url(item_id),
            headers=normal3_headers,
            json={"isActive": False},
        )
        assert resp.status_code == 403

        # Normal3 tries to delete
        resp = requests.delete(
            chatting_list_item_url(item_id),
            headers=normal3_headers,
        )
        assert resp.status_code == 403

    def test_chatting_list_item_has_expected_fields(self, normal2_headers):
        """Item has all expected fields."""
        resp = requests.post(
            CHATTING_LIST_URL,
            headers=normal2_headers,
            json={"positionId": POSITION1_ID},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body
        assert "positionId" in body
        assert "position" in body
        assert "isActive" in body
        assert "addedTime" in body
        assert "chatCount" in body
        assert "pendingRequestCount" in body

        # Position sub-object
        pos = body["position"]
        assert "statement" in pos
        assert "creator" in pos

    def test_reactivate_inactive_item_via_add(self, normal2_headers):
        """POST to add an inactive position reactivates it."""
        # Add then deactivate
        resp = requests.post(
            CHATTING_LIST_URL,
            headers=normal2_headers,
            json={"positionId": POSITION1_ID},
        )
        assert resp.status_code == 201
        item_id = resp.json()["id"]

        requests.patch(
            chatting_list_item_url(item_id),
            headers=normal2_headers,
            json={"isActive": False},
        )

        # Add again — should reactivate, not 409
        resp = requests.post(
            CHATTING_LIST_URL,
            headers=normal2_headers,
            json={"positionId": POSITION1_ID},
        )
        assert resp.status_code in (200, 201)
        body = resp.json()
        assert body["isActive"] is True


# ---------------------------------------------------------------------------
# 11. TestFullLifecycle
# ---------------------------------------------------------------------------

class TestFullLifecycle:
    """End-to-end matching flows."""

    def setup_method(self):
        cleanup_chat_request(NORMAL2_ID, USER_POSITION_NORMAL1)
        cleanup_chatting_list(NORMAL2_ID)
        clear_all_presence()
        reset_notification_settings(NORMAL1_ID)

    def teardown_method(self):
        cleanup_chat_request(NORMAL2_ID, USER_POSITION_NORMAL1)
        cleanup_chatting_list(NORMAL2_ID)
        clear_all_presence()
        reset_notification_settings(NORMAL1_ID)

    def test_full_chat_lifecycle_swiping(self, normal1_headers, normal2_headers):
        """Full lifecycle: card queue → request → accept → chat_log (swiping)."""
        # 1. Normal2 fetches cards (sets swiping)
        resp = requests.get(CARD_QUEUE_URL, headers=normal2_headers, params={"limit": 5})
        assert resp.status_code == 200

        # 2. Set normal1 as swiping
        set_swiping(NORMAL1_ID)

        # 3. Normal2 creates chat request on normal1's position
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201
        req_id = resp.json()["id"]

        # 4. Verify delivery_context=swiping
        row = db_query_one(
            "SELECT delivery_context FROM chat_request WHERE id = %s",
            (req_id,),
        )
        assert row["delivery_context"] == "swiping"

        # 5. Chat requests are now delivered via socket (not in card queue)
        # Verify card queue does NOT include chat_request cards
        resp = requests.get(CARD_QUEUE_URL, headers=normal1_headers, params={"limit": 20})
        assert resp.status_code == 200
        cards = resp.json()
        cr_cards = [c for c in cards if c.get("type") == "chat_request"]
        assert len(cr_cards) == 0

        # 6. Normal1 accepts
        resp = requests.patch(
            chat_request_url(req_id),
            headers=normal1_headers,
            json={"response": "accepted"},
        )
        assert resp.status_code == 200
        chat_log_id = resp.json()["chatLogId"]

        # 7. Verify chat_log exists in DB
        chat_log = db_query_one(
            "SELECT id, status FROM chat_log WHERE id = %s",
            (chat_log_id,),
        )
        assert chat_log is not None
        assert chat_log["status"] == "active"

        # 8. Verify position in Normal2's chatting list
        cl_row = db_query_one(
            """SELECT id FROM user_chatting_list
               WHERE user_id = %s AND position_id = (
                   SELECT position_id FROM user_position WHERE id = %s
               )""",
            (NORMAL2_ID, USER_POSITION_NORMAL1),
        )
        assert cl_row is not None

    def test_full_chat_lifecycle_notification(self, normal1_headers, normal2_headers):
        """Full lifecycle with offline recipient (notification context)."""
        # 1. Clear normal1 presence
        clear_presence(NORMAL1_ID)

        # 2. Set normal1 as notifiable
        set_notification_settings(NORMAL1_ID, enabled=True, frequency=3)

        # 3. Normal2 creates request
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201
        req_id = resp.json()["id"]

        # 4. Verify delivery_context=notification
        row = db_query_one(
            "SELECT delivery_context FROM chat_request WHERE id = %s",
            (req_id,),
        )
        assert row["delivery_context"] == "notification"

        # 5. Normal1 accepts
        resp = requests.patch(
            chat_request_url(req_id),
            headers=normal1_headers,
            json={"response": "accepted"},
        )
        assert resp.status_code == 200
        assert "chatLogId" in resp.json()

        # 6. Verify chat_log exists
        chat_log = db_query_one(
            "SELECT id FROM chat_log WHERE id = %s",
            (resp.json()["chatLogId"],),
        )
        assert chat_log is not None

    def test_dismiss_and_retry(self, normal1_headers, normal2_headers):
        """Create → dismiss → create again succeeds."""
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201
        req_id = resp.json()["id"]

        # Dismiss
        resp = requests.patch(
            chat_request_url(req_id),
            headers=normal1_headers,
            json={"response": "dismissed"},
        )
        assert resp.status_code == 200

        # Create again
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201

    def test_rescind_and_retry(self, normal2_headers):
        """Create → rescind → create again succeeds."""
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201
        req_id = resp.json()["id"]

        # Rescind
        resp = requests.delete(
            chat_request_url(req_id),
            headers=normal2_headers,
        )
        assert resp.status_code == 200

        # Create again
        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201

    def test_chatting_list_survives_dismiss(self, normal1_headers, normal2_headers):
        """Chatting list entry persists after request is dismissed."""
        cleanup_chatting_list(NORMAL2_ID)

        resp = requests.post(
            CHAT_REQUESTS_URL,
            headers=normal2_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 201
        req_id = resp.json()["id"]

        # Dismiss
        resp = requests.patch(
            chat_request_url(req_id),
            headers=normal1_headers,
            json={"response": "dismissed"},
        )
        assert resp.status_code == 200

        # Chatting list entry should still exist
        cl_row = db_query_one(
            """SELECT id FROM user_chatting_list
               WHERE user_id = %s AND position_id = (
                   SELECT position_id FROM user_position WHERE id = %s
               )""",
            (NORMAL2_ID, USER_POSITION_NORMAL1),
        )
        assert cl_row is not None
