"""Tests for the card queue endpoint."""

import pytest
import requests
from conftest import (
    BASE_URL,
    NORMAL1_ID,
    NORMAL4_ID,
    NORMAL5_ID,
    CHAT_LOG_2_ID,
    login,
    auth_header,
    db_execute,
    db_query_one,
    cleanup_kudos,
)


@pytest.fixture(scope="session")
def normal4_token():
    return login("normal4")


@pytest.fixture(scope="session")
def normal4_headers(normal4_token):
    return auth_header(normal4_token)


@pytest.fixture(scope="session")
def normal5_token():
    return login("normal5")


@pytest.fixture(scope="session")
def normal5_headers(normal5_token):
    return auth_header(normal5_token)


class TestCardQueueBasic:
    """Basic card queue functionality tests."""

    def test_get_card_queue_unauthenticated(self):
        """Card queue requires authentication."""
        resp = requests.get(f"{BASE_URL}/card-queue")
        assert resp.status_code == 401

    def test_get_card_queue_authenticated(self, normal_headers):
        """Authenticated users can get the card queue."""
        resp = requests.get(f"{BASE_URL}/card-queue", headers=normal_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_get_card_queue_returns_valid_types(self, normal_headers):
        """Card queue returns cards with valid types."""
        resp = requests.get(f"{BASE_URL}/card-queue?limit=10", headers=normal_headers)
        assert resp.status_code == 200
        data = resp.json()

        valid_types = {"position", "survey", "chat_request", "kudos", "demographic", "pairwise", "chatting_list", "ban_notification", "position_removed_notification"}
        for card in data:
            assert "type" in card
            assert "data" in card
            assert card["type"] in valid_types

    def test_get_card_queue_respects_limit(self, normal_headers):
        """Card queue respects the limit parameter."""
        resp = requests.get(f"{BASE_URL}/card-queue?limit=3", headers=normal_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) <= 3


class TestCardQueuePriorityOrdering:
    """Tests for priority card ordering (chat requests and kudos at front)."""

    def test_chat_requests_appear_at_front(self, normal_headers):
        """Chat requests should appear at the front of the queue."""
        resp = requests.get(f"{BASE_URL}/card-queue?limit=10", headers=normal_headers)
        assert resp.status_code == 200
        data = resp.json()

        # Find indices of chat_request cards
        chat_request_indices = [i for i, card in enumerate(data) if card["type"] == "chat_request"]

        if chat_request_indices:
            # All chat requests should be at the beginning
            # The max index should be less than the number of chat requests
            max_chat_idx = max(chat_request_indices)
            assert max_chat_idx < len(chat_request_indices), "Chat requests should be at the front"


class TestKudosCards:
    """Tests for kudos card functionality."""

    def test_kudos_card_appears_for_receiver(self, normal5_headers):
        """Kudos card appears when other participant has sent kudos first.

        Based on test data: Normal4 sent kudos to Normal5 after chat 2,
        but Normal5 has not reciprocated. So Normal5 should see a kudos card.
        """
        # First, ensure the kudos from Normal4 to Normal5 exists
        kudos = db_query_one(
            "SELECT * FROM kudos WHERE sender_user_id = %s AND receiver_user_id = %s AND chat_log_id = %s",
            (NORMAL4_ID, NORMAL5_ID, CHAT_LOG_2_ID)
        )
        assert kudos is not None, "Test data should have Normal4->Normal5 kudos"

        # Ensure Normal5 hasn't sent kudos back
        cleanup_kudos(NORMAL5_ID, CHAT_LOG_2_ID)

        resp = requests.get(f"{BASE_URL}/card-queue?limit=10", headers=normal5_headers)
        assert resp.status_code == 200
        data = resp.json()

        # Look for kudos card for this chat
        kudos_cards = [c for c in data if c["type"] == "kudos"]

        # Should have a kudos card for chat_log_2
        found = any(
            c["data"]["id"] == CHAT_LOG_2_ID
            for c in kudos_cards
        )
        assert found, f"Normal5 should see kudos card for chat {CHAT_LOG_2_ID}"

    def test_kudos_card_has_correct_data(self, normal5_headers):
        """Kudos card contains expected fields."""
        # Ensure Normal5 hasn't sent kudos back
        cleanup_kudos(NORMAL5_ID, CHAT_LOG_2_ID)

        resp = requests.get(f"{BASE_URL}/card-queue?limit=10", headers=normal5_headers)
        assert resp.status_code == 200
        data = resp.json()

        kudos_cards = [c for c in data if c["type"] == "kudos" and c["data"]["id"] == CHAT_LOG_2_ID]

        if kudos_cards:
            card = kudos_cards[0]
            assert "otherParticipant" in card["data"]
            assert "closingStatement" in card["data"]
            assert "chatEndTime" in card["data"]

    def test_kudos_card_disappears_after_sending(self, normal5_headers):
        """Kudos card disappears after user sends kudos back."""
        # Ensure Normal5 hasn't sent kudos back
        cleanup_kudos(NORMAL5_ID, CHAT_LOG_2_ID)

        # First verify the kudos card is there
        resp = requests.get(f"{BASE_URL}/card-queue?limit=10", headers=normal5_headers)
        data = resp.json()
        kudos_cards_before = [c for c in data if c["type"] == "kudos" and c["data"]["id"] == CHAT_LOG_2_ID]
        assert len(kudos_cards_before) > 0, "Should have kudos card before sending"

        # Send kudos
        resp = requests.post(f"{BASE_URL}/chats/{CHAT_LOG_2_ID}/kudos", headers=normal5_headers)
        assert resp.status_code == 201

        # Now check the card queue again
        resp = requests.get(f"{BASE_URL}/card-queue?limit=10", headers=normal5_headers)
        data = resp.json()
        kudos_cards_after = [c for c in data if c["type"] == "kudos" and c["data"]["id"] == CHAT_LOG_2_ID]
        assert len(kudos_cards_after) == 0, "Kudos card should disappear after sending"

        # Cleanup
        cleanup_kudos(NORMAL5_ID, CHAT_LOG_2_ID)

    def test_kudos_card_disappears_after_dismissing(self, normal5_headers):
        """Kudos card disappears after user dismisses it."""
        # Ensure Normal5 hasn't sent kudos back
        cleanup_kudos(NORMAL5_ID, CHAT_LOG_2_ID)

        # First verify the kudos card is there
        resp = requests.get(f"{BASE_URL}/card-queue?limit=10", headers=normal5_headers)
        data = resp.json()
        kudos_cards_before = [c for c in data if c["type"] == "kudos" and c["data"]["id"] == CHAT_LOG_2_ID]
        assert len(kudos_cards_before) > 0, "Should have kudos card before dismissing"

        # Dismiss kudos
        resp = requests.post(f"{BASE_URL}/chats/{CHAT_LOG_2_ID}/kudos/dismiss", headers=normal5_headers)
        assert resp.status_code == 204

        # Now check the card queue again
        resp = requests.get(f"{BASE_URL}/card-queue?limit=10", headers=normal5_headers)
        data = resp.json()
        kudos_cards_after = [c for c in data if c["type"] == "kudos" and c["data"]["id"] == CHAT_LOG_2_ID]
        assert len(kudos_cards_after) == 0, "Kudos card should disappear after dismissing"

        # Cleanup
        cleanup_kudos(NORMAL5_ID, CHAT_LOG_2_ID)

    def test_kudos_card_not_shown_without_received_kudos(self, normal4_headers):
        """Kudos card does NOT appear if the other participant hasn't sent kudos first.

        Normal4 sent kudos to Normal5, but Normal5 hasn't sent back.
        Normal4 should NOT see a kudos card for this chat (since they already sent).
        """
        resp = requests.get(f"{BASE_URL}/card-queue?limit=10", headers=normal4_headers)
        assert resp.status_code == 200
        data = resp.json()

        # Normal4 should NOT see kudos card for chat_log_2 (they already sent kudos)
        kudos_cards = [c for c in data if c["type"] == "kudos" and c["data"].get("id") == CHAT_LOG_2_ID]
        assert len(kudos_cards) == 0, "User who already sent kudos should not see kudos card"


class TestDismissKudos:
    """Tests for the dismiss kudos endpoint."""

    def test_dismiss_kudos_unauthorized(self):
        """Dismiss kudos requires authentication."""
        resp = requests.post(f"{BASE_URL}/chats/{CHAT_LOG_2_ID}/kudos/dismiss")
        assert resp.status_code == 401

    def test_dismiss_kudos_not_participant(self, normal_headers):
        """Can only dismiss kudos for chats you participated in."""
        # Normal1 was not a participant in chat_log_2
        resp = requests.post(f"{BASE_URL}/chats/{CHAT_LOG_2_ID}/kudos/dismiss", headers=normal_headers)
        assert resp.status_code == 403

    def test_dismiss_kudos_nonexistent_chat(self, normal5_headers):
        """Cannot dismiss kudos for nonexistent chat."""
        resp = requests.post(
            f"{BASE_URL}/chats/00000000-0000-0000-0000-000000000000/kudos/dismiss",
            headers=normal5_headers
        )
        assert resp.status_code == 404

    def test_dismiss_kudos_idempotent(self, normal5_headers):
        """Dismissing kudos multiple times is idempotent."""
        # Cleanup first
        cleanup_kudos(NORMAL5_ID, CHAT_LOG_2_ID)

        # First dismiss
        resp = requests.post(f"{BASE_URL}/chats/{CHAT_LOG_2_ID}/kudos/dismiss", headers=normal5_headers)
        assert resp.status_code == 204

        # Second dismiss should also succeed
        resp = requests.post(f"{BASE_URL}/chats/{CHAT_LOG_2_ID}/kudos/dismiss", headers=normal5_headers)
        assert resp.status_code == 204

        # Cleanup
        cleanup_kudos(NORMAL5_ID, CHAT_LOG_2_ID)


class TestSendKudosAfterDismiss:
    """Tests for sending kudos after initially dismissing."""

    def test_can_send_kudos_after_dismissing(self, normal5_headers):
        """User can send kudos even after initially dismissing."""
        # Cleanup first
        cleanup_kudos(NORMAL5_ID, CHAT_LOG_2_ID)

        # First dismiss
        resp = requests.post(f"{BASE_URL}/chats/{CHAT_LOG_2_ID}/kudos/dismiss", headers=normal5_headers)
        assert resp.status_code == 204

        # Now try to send kudos - should succeed and override dismissed status
        resp = requests.post(f"{BASE_URL}/chats/{CHAT_LOG_2_ID}/kudos", headers=normal5_headers)
        assert resp.status_code == 201

        # Verify status was changed to 'sent'
        kudos = db_query_one(
            "SELECT status FROM kudos WHERE sender_user_id = %s AND chat_log_id = %s",
            (NORMAL5_ID, CHAT_LOG_2_ID)
        )
        assert kudos["status"] == "sent"

        # Cleanup
        cleanup_kudos(NORMAL5_ID, CHAT_LOG_2_ID)


class TestDemographicCards:
    """Tests for demographic card functionality."""

    def test_demographic_card_structure(self, normal_headers):
        """Demographic cards have the expected structure."""
        resp = requests.get(f"{BASE_URL}/card-queue?limit=10", headers=normal_headers)
        assert resp.status_code == 200
        data = resp.json()

        demographic_cards = [c for c in data if c["type"] == "demographic"]

        for card in demographic_cards:
            assert "field" in card["data"]
            assert "question" in card["data"]
            assert "options" in card["data"]
            assert isinstance(card["data"]["options"], list)

            # Each option should have value and label
            for option in card["data"]["options"]:
                assert "value" in option
                assert "label" in option

    def test_demographic_fields_valid(self, normal_headers):
        """Demographic cards only show valid fields."""
        resp = requests.get(f"{BASE_URL}/card-queue?limit=10", headers=normal_headers)
        assert resp.status_code == 200
        data = resp.json()

        valid_fields = {"lean", "education", "geo_locale", "sex"}
        demographic_cards = [c for c in data if c["type"] == "demographic"]

        for card in demographic_cards:
            assert card["data"]["field"] in valid_fields
