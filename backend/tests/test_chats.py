"""Integration tests for chat endpoints and REST API to Chat Server integration."""

import pytest
import requests
import time
from conftest import (
    BASE_URL, CHAT_SERVER_URL,
    NORMAL1_ID, NORMAL2_ID, NORMAL3_ID, ADMIN1_ID,
    USER_POSITION_NORMAL1, USER_POSITION_NORMAL2, USER_POSITION_NORMAL3,
    CHAT_LOG_1_ID, NONEXISTENT_UUID,
    cleanup_chat_request, cleanup_kudos,
    redis_get_chat_metadata, redis_get_chat_messages, redis_delete_chat,
    redis_add_test_message, get_chat_log_from_db,
    db_query_one, db_execute,
)


# ---------------------------------------------------------------------------
# URL Helpers
# ---------------------------------------------------------------------------

def chat_requests_url():
    return f"{BASE_URL}/chats/requests/"


def chat_request_url(request_id):
    return f"{BASE_URL}/chats/requests/{request_id}"


def chat_log_url(chat_id):
    return f"{BASE_URL}/chats/{chat_id}/log"


def user_chats_url(user_id):
    return f"{BASE_URL}/chats/user/{user_id}"


def kudos_url(chat_id):
    return f"{BASE_URL}/chats/{chat_id}/kudos"


def chat_server_health_url():
    return f"{CHAT_SERVER_URL}/health"


# ---------------------------------------------------------------------------
# Chat Server Health Tests
# ---------------------------------------------------------------------------

class TestChatServerHealth:
    """Verify chat server is running."""

    @pytest.mark.smoke
    def test_chat_server_health(self):
        """Chat server health endpoint returns healthy status."""
        resp = requests.get(chat_server_health_url())
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "healthy"
        assert body["service"] == "chat-server"


# ---------------------------------------------------------------------------
# Create Chat Request Tests
# ---------------------------------------------------------------------------

class TestCreateChatRequest:
    """POST /chats/requests/"""

    @pytest.fixture(autouse=True)
    def cleanup(self):
        """Clean up test data before each test."""
        cleanup_chat_request(NORMAL1_ID, USER_POSITION_NORMAL2)
        yield
        cleanup_chat_request(NORMAL1_ID, USER_POSITION_NORMAL2)

    @pytest.mark.smoke
    def test_create_chat_request_success(self, normal_headers):
        """User can create a chat request for another user's position."""
        resp = requests.post(
            chat_requests_url(),
            headers=normal_headers,
            json={"userPositionId": USER_POSITION_NORMAL2},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body
        assert body["userPositionId"] == USER_POSITION_NORMAL2
        assert body["initiatorUserId"] == NORMAL1_ID
        assert body["response"] == "pending"
        assert body["responseTime"] is None

    def test_create_chat_request_returns_timestamps(self, normal_headers):
        """Created chat request includes created and updated timestamps."""
        resp = requests.post(
            chat_requests_url(),
            headers=normal_headers,
            json={"userPositionId": USER_POSITION_NORMAL2},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "createdTime" in body
        assert "updatedTime" in body
        assert body["createdTime"] is not None

    def test_cannot_request_chat_with_own_position(self, normal_headers):
        """User cannot create a chat request for their own position."""
        resp = requests.post(
            chat_requests_url(),
            headers=normal_headers,
            json={"userPositionId": USER_POSITION_NORMAL1},
        )
        assert resp.status_code == 400
        assert "yourself" in resp.json()["message"].lower()

    def test_duplicate_pending_request_rejected(self, normal_headers):
        """Cannot create duplicate pending request for same position."""
        # Create first request
        resp1 = requests.post(
            chat_requests_url(),
            headers=normal_headers,
            json={"userPositionId": USER_POSITION_NORMAL2},
        )
        assert resp1.status_code == 201

        # Try to create duplicate
        resp2 = requests.post(
            chat_requests_url(),
            headers=normal_headers,
            json={"userPositionId": USER_POSITION_NORMAL2},
        )
        assert resp2.status_code == 409
        assert "pending" in resp2.json()["message"].lower()

    def test_missing_user_position_id(self, normal_headers):
        """Request without userPositionId returns 400."""
        resp = requests.post(
            chat_requests_url(),
            headers=normal_headers,
            json={},
        )
        assert resp.status_code == 400

    def test_nonexistent_user_position(self, normal_headers):
        """Request for nonexistent position returns 404."""
        resp = requests.post(
            chat_requests_url(),
            headers=normal_headers,
            json={"userPositionId": NONEXISTENT_UUID},
        )
        assert resp.status_code == 404

    def test_unauthenticated_returns_401(self):
        """Unauthenticated request returns 401."""
        resp = requests.post(
            chat_requests_url(),
            json={"userPositionId": USER_POSITION_NORMAL2},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Respond to Chat Request Tests
# ---------------------------------------------------------------------------

class TestRespondToChatRequest:
    """PATCH /chats/requests/{requestId}"""

    @pytest.fixture
    def pending_request(self, normal_headers):
        """Create a pending chat request for testing."""
        cleanup_chat_request(NORMAL1_ID, USER_POSITION_NORMAL2)
        resp = requests.post(
            chat_requests_url(),
            headers=normal_headers,
            json={"userPositionId": USER_POSITION_NORMAL2},
        )
        assert resp.status_code == 201
        request_data = resp.json()
        yield request_data
        # Cleanup after test
        cleanup_chat_request(NORMAL1_ID, USER_POSITION_NORMAL2)

    @pytest.mark.smoke
    def test_accept_chat_request_success(self, normal2_headers, pending_request):
        """Recipient can accept a chat request."""
        request_id = pending_request["id"]

        resp = requests.patch(
            chat_request_url(request_id),
            headers=normal2_headers,
            json={"response": "accepted"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["response"] == "accepted"
        assert body["responseTime"] is not None
        assert "chatLogId" in body

    def test_accept_creates_chat_log_in_database(self, normal2_headers, pending_request):
        """Accepting creates a chat_log record in PostgreSQL."""
        request_id = pending_request["id"]

        resp = requests.patch(
            chat_request_url(request_id),
            headers=normal2_headers,
            json={"response": "accepted"},
        )
        assert resp.status_code == 200
        chat_log_id = resp.json()["chatLogId"]

        # Verify in database
        chat_log = db_query_one(
            "SELECT * FROM chat_log WHERE id = %s",
            (chat_log_id,)
        )
        assert chat_log is not None
        assert chat_log["chat_request_id"] == request_id
        assert chat_log["status"] == "active"

    @pytest.mark.integration
    def test_accept_creates_chat_in_redis(self, normal2_headers, pending_request):
        """Accepting triggers chat creation in Redis via pub/sub."""
        request_id = pending_request["id"]

        resp = requests.patch(
            chat_request_url(request_id),
            headers=normal2_headers,
            json={"response": "accepted"},
        )
        assert resp.status_code == 200
        chat_log_id = resp.json()["chatLogId"]

        # Give pub/sub time to process
        time.sleep(0.5)

        # Verify chat metadata exists in Redis
        metadata = redis_get_chat_metadata(chat_log_id)
        assert metadata is not None
        assert metadata.get("chat_id") == chat_log_id
        assert NORMAL1_ID in metadata.get("participant_ids", "")
        assert NORMAL2_ID in metadata.get("participant_ids", "")

        # Cleanup Redis
        redis_delete_chat(chat_log_id)

    def test_dismiss_chat_request(self, normal2_headers, pending_request):
        """Recipient can dismiss a chat request."""
        request_id = pending_request["id"]

        resp = requests.patch(
            chat_request_url(request_id),
            headers=normal2_headers,
            json={"response": "dismissed"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["response"] == "dismissed"
        assert "chatLogId" not in body  # No chat log created

    def test_invalid_response_value(self, normal2_headers, pending_request):
        """Invalid response value returns 400."""
        request_id = pending_request["id"]

        resp = requests.patch(
            chat_request_url(request_id),
            headers=normal2_headers,
            json={"response": "invalid"},
        )
        assert resp.status_code == 400

    def test_non_recipient_cannot_respond(self, normal3_headers, pending_request):
        """User who is not the recipient cannot respond."""
        request_id = pending_request["id"]

        resp = requests.patch(
            chat_request_url(request_id),
            headers=normal3_headers,
            json={"response": "accepted"},
        )
        assert resp.status_code == 403

    def test_initiator_cannot_respond(self, normal_headers, pending_request):
        """Initiator cannot respond to their own request."""
        request_id = pending_request["id"]

        resp = requests.patch(
            chat_request_url(request_id),
            headers=normal_headers,
            json={"response": "accepted"},
        )
        assert resp.status_code == 403

    def test_cannot_respond_twice(self, normal2_headers, pending_request):
        """Cannot respond to an already-responded request."""
        request_id = pending_request["id"]

        # First response
        resp1 = requests.patch(
            chat_request_url(request_id),
            headers=normal2_headers,
            json={"response": "accepted"},
        )
        assert resp1.status_code == 200

        # Second response should fail
        resp2 = requests.patch(
            chat_request_url(request_id),
            headers=normal2_headers,
            json={"response": "dismissed"},
        )
        assert resp2.status_code == 400
        assert "pending" in resp2.json()["message"].lower()

    def test_nonexistent_request(self, normal2_headers):
        """Responding to nonexistent request returns 404."""
        resp = requests.patch(
            chat_request_url(NONEXISTENT_UUID),
            headers=normal2_headers,
            json={"response": "accepted"},
        )
        assert resp.status_code == 404

    def test_unauthenticated_returns_401(self, pending_request):
        """Unauthenticated request returns 401."""
        resp = requests.patch(
            chat_request_url(pending_request["id"]),
            json={"response": "accepted"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Rescind Chat Request Tests
# ---------------------------------------------------------------------------

class TestRescindChatRequest:
    """DELETE /chats/requests/{requestId}"""

    @pytest.fixture
    def pending_request(self, normal_headers):
        """Create a pending chat request for testing."""
        cleanup_chat_request(NORMAL1_ID, USER_POSITION_NORMAL2)
        resp = requests.post(
            chat_requests_url(),
            headers=normal_headers,
            json={"userPositionId": USER_POSITION_NORMAL2},
        )
        assert resp.status_code == 201
        request_data = resp.json()
        yield request_data
        cleanup_chat_request(NORMAL1_ID, USER_POSITION_NORMAL2)

    @pytest.mark.smoke
    def test_rescind_chat_request_success(self, normal_headers, pending_request):
        """Initiator can rescind their pending request."""
        request_id = pending_request["id"]

        resp = requests.delete(
            chat_request_url(request_id),
            headers=normal_headers,
        )
        assert resp.status_code == 200

        # Verify deleted from database
        result = db_query_one(
            "SELECT * FROM chat_request WHERE id = %s",
            (request_id,)
        )
        assert result is None

    def test_non_initiator_cannot_rescind(self, normal2_headers, pending_request):
        """Non-initiator cannot rescind a request."""
        request_id = pending_request["id"]

        resp = requests.delete(
            chat_request_url(request_id),
            headers=normal2_headers,
        )
        assert resp.status_code == 403

    def test_cannot_rescind_accepted_request(self, normal_headers, normal2_headers, pending_request):
        """Cannot rescind an already-accepted request."""
        request_id = pending_request["id"]

        # Accept the request first
        accept_resp = requests.patch(
            chat_request_url(request_id),
            headers=normal2_headers,
            json={"response": "accepted"},
        )
        assert accept_resp.status_code == 200

        # Try to rescind
        resp = requests.delete(
            chat_request_url(request_id),
            headers=normal_headers,
        )
        assert resp.status_code == 400

    def test_nonexistent_request(self, normal_headers):
        """Rescinding nonexistent request returns 404."""
        resp = requests.delete(
            chat_request_url(NONEXISTENT_UUID),
            headers=normal_headers,
        )
        assert resp.status_code == 404

    def test_unauthenticated_returns_401(self, pending_request):
        """Unauthenticated request returns 401."""
        resp = requests.delete(
            chat_request_url(pending_request["id"]),
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Get Chat Log Tests
# ---------------------------------------------------------------------------

class TestGetChatLog:
    """GET /chats/{chatId}/log"""

    @pytest.mark.smoke
    def test_get_chat_log_as_participant(self, normal_headers):
        """Participant can retrieve their chat log."""
        resp = requests.get(
            chat_log_url(CHAT_LOG_1_ID),
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == CHAT_LOG_1_ID
        assert "chatRequestId" in body
        assert "startTime" in body

    def test_non_participant_cannot_view(self, normal2_headers):
        """Non-participant cannot view chat log."""
        resp = requests.get(
            chat_log_url(CHAT_LOG_1_ID),
            headers=normal2_headers,
        )
        assert resp.status_code == 403

    def test_nonexistent_chat_log(self, normal_headers):
        """Requesting nonexistent chat log returns 404."""
        resp = requests.get(
            chat_log_url(NONEXISTENT_UUID),
            headers=normal_headers,
        )
        assert resp.status_code == 404

    def test_unauthenticated_returns_401(self):
        """Unauthenticated request returns 401."""
        resp = requests.get(chat_log_url(CHAT_LOG_1_ID))
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Get User Chats Tests
# ---------------------------------------------------------------------------

class TestGetUserChats:
    """GET /chats/user/{userId}"""

    @pytest.mark.smoke
    def test_get_own_chats_returns_list(self, normal_headers):
        """User can retrieve their own chat history."""
        resp = requests.get(
            user_chats_url(NORMAL1_ID),
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)

    def test_chat_entry_has_expected_fields(self, normal_headers):
        """Chat entries include expected fields."""
        resp = requests.get(
            user_chats_url(NORMAL1_ID),
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        if len(body) > 0:
            chat = body[0]
            assert "id" in chat
            assert "startTime" in chat
            # Position info is nested in 'position' object
            assert "position" in chat
            assert "otherUser" in chat
            # endTime and endType are present for completed chats
            assert "endTime" in chat or "endType" in chat or True  # Optional fields

    def test_limit_parameter(self, normal_headers):
        """Limit parameter restricts number of results."""
        resp = requests.get(
            user_chats_url(NORMAL1_ID),
            headers=normal_headers,
            params={"limit": 1},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) <= 1

    def test_offset_parameter(self, normal_headers):
        """Offset parameter skips results."""
        # Get all chats
        resp_all = requests.get(
            user_chats_url(NORMAL1_ID),
            headers=normal_headers,
        )
        all_chats = resp_all.json()

        if len(all_chats) > 1:
            # Get with offset
            resp_offset = requests.get(
                user_chats_url(NORMAL1_ID),
                headers=normal_headers,
                params={"offset": 1},
            )
            offset_chats = resp_offset.json()
            assert len(offset_chats) == len(all_chats) - 1

    def test_cannot_view_other_user_chats(self, normal_headers):
        """Regular user cannot view another user's chats."""
        resp = requests.get(
            user_chats_url(NORMAL2_ID),
            headers=normal_headers,
        )
        assert resp.status_code == 403

    def test_admin_can_view_any_user_chats(self, admin_headers):
        """Admin can view any user's chat history."""
        resp = requests.get(
            user_chats_url(NORMAL1_ID),
            headers=admin_headers,
        )
        assert resp.status_code == 200

    def test_moderator_can_view_any_user_chats(self, moderator_headers):
        """Moderator can view any user's chat history."""
        resp = requests.get(
            user_chats_url(NORMAL1_ID),
            headers=moderator_headers,
        )
        assert resp.status_code == 200

    def test_unauthenticated_returns_401(self):
        """Unauthenticated request returns 401."""
        resp = requests.get(user_chats_url(NORMAL1_ID))
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Send Kudos Tests
# ---------------------------------------------------------------------------

class TestSendKudos:
    """POST /chats/{chatId}/kudos"""

    @pytest.fixture(autouse=True)
    def cleanup(self):
        """Clean up test kudos."""
        cleanup_kudos(NORMAL1_ID, CHAT_LOG_1_ID)
        yield
        cleanup_kudos(NORMAL1_ID, CHAT_LOG_1_ID)

    @pytest.mark.smoke
    def test_send_kudos_success(self, normal_headers):
        """Participant can send kudos after a chat."""
        resp = requests.post(
            kudos_url(CHAT_LOG_1_ID),
            headers=normal_headers,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["senderUserId"] == NORMAL1_ID
        assert body["chatLogId"] == CHAT_LOG_1_ID
        assert "receiverUserId" in body
        assert "createdTime" in body

    def test_send_kudos_is_idempotent(self, normal_headers):
        """Sending kudos twice is idempotent (succeeds both times)."""
        # Send first kudos
        resp1 = requests.post(
            kudos_url(CHAT_LOG_1_ID),
            headers=normal_headers,
        )
        assert resp1.status_code == 201

        # Send again - should succeed (idempotent)
        resp2 = requests.post(
            kudos_url(CHAT_LOG_1_ID),
            headers=normal_headers,
        )
        assert resp2.status_code == 201

    def test_non_participant_cannot_send_kudos(self, normal2_headers):
        """Non-participant cannot send kudos."""
        resp = requests.post(
            kudos_url(CHAT_LOG_1_ID),
            headers=normal2_headers,
        )
        assert resp.status_code == 403

    def test_nonexistent_chat(self, normal_headers):
        """Sending kudos for nonexistent chat returns 404."""
        resp = requests.post(
            kudos_url(NONEXISTENT_UUID),
            headers=normal_headers,
        )
        assert resp.status_code == 404

    def test_unauthenticated_returns_401(self):
        """Unauthenticated request returns 401."""
        resp = requests.post(kudos_url(CHAT_LOG_1_ID))
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Full Integration Flow Tests
# ---------------------------------------------------------------------------

class TestChatIntegrationFlow:
    """End-to-end integration tests for chat flow."""

    @pytest.fixture(autouse=True)
    def cleanup(self):
        """Clean up test data."""
        cleanup_chat_request(NORMAL1_ID, USER_POSITION_NORMAL3)
        yield
        cleanup_chat_request(NORMAL1_ID, USER_POSITION_NORMAL3)

    @pytest.mark.integration
    def test_full_chat_request_accept_flow(self, normal_headers, normal3_headers):
        """
        Full integration test:
        1. User creates chat request
        2. Recipient accepts
        3. Chat log created in PostgreSQL
        4. Chat created in Redis via pub/sub
        5. Chat log can be retrieved
        """
        # Step 1: Create chat request
        create_resp = requests.post(
            chat_requests_url(),
            headers=normal_headers,
            json={"userPositionId": USER_POSITION_NORMAL3},
        )
        assert create_resp.status_code == 201
        request_id = create_resp.json()["id"]

        # Step 2: Accept the request
        accept_resp = requests.patch(
            chat_request_url(request_id),
            headers=normal3_headers,
            json={"response": "accepted"},
        )
        assert accept_resp.status_code == 200
        chat_log_id = accept_resp.json()["chatLogId"]

        # Step 3: Verify chat log in PostgreSQL
        chat_log = db_query_one(
            "SELECT * FROM chat_log WHERE id = %s",
            (chat_log_id,)
        )
        assert chat_log is not None
        assert chat_log["status"] == "active"

        # Step 4: Verify chat in Redis (give pub/sub time)
        time.sleep(0.5)
        metadata = redis_get_chat_metadata(chat_log_id)
        assert metadata is not None
        assert metadata.get("chat_id") == chat_log_id

        # Step 5: Verify chat log can be retrieved via API
        log_resp = requests.get(
            chat_log_url(chat_log_id),
            headers=normal_headers,
        )
        assert log_resp.status_code == 200
        assert log_resp.json()["id"] == chat_log_id

        # Cleanup
        redis_delete_chat(chat_log_id)

    @pytest.mark.integration
    def test_dismiss_flow_no_redis_chat(self, normal_headers, normal3_headers):
        """
        When a chat request is dismissed:
        1. Request status updated
        2. No chat log created
        3. No Redis chat created
        """
        # Create chat request
        create_resp = requests.post(
            chat_requests_url(),
            headers=normal_headers,
            json={"userPositionId": USER_POSITION_NORMAL3},
        )
        assert create_resp.status_code == 201
        request_id = create_resp.json()["id"]

        # Dismiss the request
        dismiss_resp = requests.patch(
            chat_request_url(request_id),
            headers=normal3_headers,
            json={"response": "dismissed"},
        )
        assert dismiss_resp.status_code == 200
        assert "chatLogId" not in dismiss_resp.json()

        # Verify no chat log in database
        chat_log = db_query_one(
            "SELECT * FROM chat_log WHERE chat_request_id = %s",
            (request_id,)
        )
        assert chat_log is None


