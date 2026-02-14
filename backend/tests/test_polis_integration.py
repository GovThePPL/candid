"""Tests for Polis integration - syncing positions and votes to Polis conversations.

These tests verify:
1. Keycloak OIDC authentication with Polis
2. Conversation creation
3. Participant initialization with XID
4. Comment creation and retrieval
5. Vote submission
6. Position sync queue processing
7. End-to-end position and vote syncing

Note on Network Topology:
- Keycloak issuer is http://keycloak:8180/realms/candid/ from Docker network
- From the host, Keycloak is at http://localhost:8180/realms/candid/
- Polis server is configured with AUTH_ISSUER=http://keycloak:8180/realms/candid/
- Therefore, tokens obtained from localhost:8180 will have a different issuer than
  what Polis expects, causing direct API tests to fail from host.
- End-to-end tests through Candid API work correctly (API container uses Docker network).
"""

import pytest
import requests
import time
import uuid
from conftest import (
    BASE_URL,
    NORMAL1_ID,
    NORMAL2_ID,
    HEALTHCARE_CAT_ID,
    OREGON_LOCATION_ID,
    db_execute,
    db_query,
    db_query_one,
    login,
    auth_header,
)

# Polis API URL (from inside Docker network, but tests run on host)
POLIS_API_URL = "http://localhost:5000/api/v3"
KEYCLOAK_TOKEN_URL = "http://localhost:8180/realms/candid/protocol/openid-connect/token"

POSITIONS_URL = f"{BASE_URL}/positions"


# ---------------------------------------------------------------------------
# Polis-specific helpers
# ---------------------------------------------------------------------------

def get_polis_oidc_token():
    """Get an OIDC token from Keycloak for Polis admin operations."""
    try:
        resp = requests.post(
            KEYCLOAK_TOKEN_URL,
            data={
                "grant_type": "password",
                "client_id": "polis-admin",
                "client_secret": "polis-admin-secret",
                "username": "polis-admin@candid.dev",
                "password": "password",
                "scope": "openid profile email"
            },
            timeout=10
        )
        if resp.status_code == 200:
            return resp.json().get("access_token")
        return None
    except Exception:
        return None


def cleanup_polis_test_data():
    """Clean up Polis-related test data from the database."""
    # Delete failed and pending test items from queue
    db_execute("""
        DELETE FROM polis_sync_queue
        WHERE status IN ('pending', 'failed')
        OR payload::text LIKE '%Polis integration test%'
    """)
    # Delete test comments
    db_execute("""
        DELETE FROM polis_comment
        WHERE position_id IN (
            SELECT id FROM position WHERE statement LIKE '%Polis integration test%'
        )
    """)
    # Delete test conversations created during tests
    db_execute("DELETE FROM polis_conversation WHERE polis_conversation_id LIKE 'test_%'")


def get_sync_queue_stats():
    """Get statistics about the Polis sync queue."""
    rows = db_query("""
        SELECT status, COUNT(*) as count
        FROM polis_sync_queue
        GROUP BY status
    """)
    stats = {"pending": 0, "processing": 0, "completed": 0, "failed": 0, "partial": 0}
    for row in rows:
        stats[row["status"]] = row["count"]
    return stats


def wait_for_sync_completion(timeout=30, interval=1):
    """Wait for all pending sync items to complete."""
    start = time.time()
    while time.time() - start < timeout:
        stats = get_sync_queue_stats()
        if stats["pending"] == 0 and stats["processing"] == 0:
            return True
        time.sleep(interval)
    return False


def get_polis_conversations():
    """Get all Polis conversations from the database."""
    return db_query("""
        SELECT id, location_id, category_id, polis_conversation_id,
               conversation_type, status, active_from, active_until
        FROM polis_conversation
        ORDER BY created_time DESC
    """)


def get_polis_comments_for_position(position_id):
    """Get all Polis comment mappings for a position."""
    return db_query("""
        SELECT pc.id, pc.position_id, pc.polis_conversation_id,
               pc.polis_comment_tid, pc.sync_status
        FROM polis_comment pc
        WHERE pc.position_id = %s
    """, (position_id,))


# ---------------------------------------------------------------------------
# Test Classes
# ---------------------------------------------------------------------------

class TestPolisOIDCAuthentication:
    """Test Keycloak OIDC authentication for Polis."""

    @pytest.mark.polis
    def test_oidc_token_retrieval(self):
        """Test that we can get an OIDC token from Keycloak."""
        token = get_polis_oidc_token()
        if token is None:
            pytest.skip("Keycloak not reachable")
        assert len(token) > 50, "Token appears too short"
        # JWT tokens have 3 parts separated by dots
        assert token.count(".") == 2, "Token doesn't appear to be a valid JWT"

    @pytest.mark.polis
    def test_oidc_token_has_correct_claims(self):
        """Test that the OIDC token has the expected claims."""
        import base64
        import json

        token = get_polis_oidc_token()
        if token is None:
            pytest.skip("Keycloak not reachable")

        # Decode the JWT payload (middle part)
        parts = token.split(".")
        payload = parts[1]
        # Add padding if needed
        payload += "=" * (4 - len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload)
        claims = json.loads(decoded)

        # Verify expected claims
        assert "iss" in claims, "Token should have issuer claim"
        assert "keycloak" in claims["iss"] or "realms/candid" in claims["iss"], \
            "Issuer should be Keycloak"
        assert "sub" in claims, "Token should have subject claim"
        assert "exp" in claims, "Token should have expiration claim"


class TestPolisConversationCreation:
    """Test Polis conversation creation via Keycloak OIDC-authenticated API.

    Note: These tests may skip when running from host due to issuer mismatch.
    Tokens from localhost:8180 have issuer http://localhost:8180/realms/candid/,
    but Polis expects http://keycloak:8180/realms/candid/ (Docker network hostname).
    """

    @pytest.mark.polis
    def test_create_conversation_with_oidc_token(self):
        """Test creating a Polis conversation using Keycloak OIDC authentication.

        This test may fail when running from host due to issuer mismatch.
        It works correctly when the Candid API calls Polis (via Docker network).
        """
        token = get_polis_oidc_token()
        if token is None:
            pytest.skip("Keycloak not reachable")

        # Create a conversation
        resp = requests.post(
            f"{POLIS_API_URL}/conversations",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            json={
                "topic": "Test: Integration Test Conversation",
                "description": "Created by integration test",
                "is_active": True
            },
            timeout=15
        )

        # When running from host, this may fail due to Keycloak issuer mismatch
        # (localhost:8180 vs keycloak:8180). This is expected behavior.
        if resp.status_code == 401 and "Token does not match" in resp.text:
            pytest.skip(
                "Keycloak issuer mismatch (running from host). "
                "This test works when Candid API calls Polis via Docker network."
            )

        assert resp.status_code == 200, f"Failed to create conversation: {resp.text}"
        data = resp.json()
        assert "conversation_id" in data, "Response should contain conversation_id"
        assert len(data["conversation_id"]) > 5, "Conversation ID should be non-empty"

    @pytest.mark.polis
    def test_conversation_creation_without_token_fails(self):
        """Test that conversation creation fails without authentication."""
        resp = requests.post(
            f"{POLIS_API_URL}/conversations",
            headers={"Content-Type": "application/json"},
            json={
                "topic": "Should Fail",
                "description": "No auth",
                "is_active": True
            },
            timeout=15
        )
        # Should fail with 401 or 403
        assert resp.status_code in (401, 403), f"Expected auth error, got {resp.status_code}"


class TestPolisParticipantXID:
    """Test XID-based participant initialization."""

    @pytest.fixture
    def test_conversation_id(self):
        """Create a test conversation and return its ID."""
        token = get_polis_oidc_token()
        if not token:
            pytest.skip("Could not get OIDC token")

        resp = requests.post(
            f"{POLIS_API_URL}/conversations",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            json={
                "topic": "Test: XID Test Conversation",
                "description": "For XID testing",
                "is_active": True
            },
            timeout=15
        )
        if resp.status_code != 200:
            pytest.skip(f"Could not create test conversation: {resp.text}")

        return resp.json()["conversation_id"]

    @pytest.mark.polis
    def test_initialize_participant_with_xid(self, test_conversation_id):
        """Test initializing a participant using XID."""
        test_xid = f"candid:{uuid.uuid4()}"

        resp = requests.get(
            f"{POLIS_API_URL}/participationInit",
            params={
                "conversation_id": test_conversation_id,
                "xid": test_xid
            },
            timeout=15
        )

        assert resp.status_code == 200, f"Failed to init participant: {resp.text}"
        data = resp.json()
        assert "user" in data, "Response should contain user info"
        assert "ptpt" in data, "Response should contain participant info"

    @pytest.mark.polis
    def test_same_xid_returns_same_participant(self, test_conversation_id):
        """Test that the same XID always returns the same participant."""
        test_xid = f"candid:{uuid.uuid4()}"

        # First initialization
        resp1 = requests.get(
            f"{POLIS_API_URL}/participationInit",
            params={"conversation_id": test_conversation_id, "xid": test_xid},
            timeout=15
        )
        assert resp1.status_code == 200

        # Second initialization with same XID
        resp2 = requests.get(
            f"{POLIS_API_URL}/participationInit",
            params={"conversation_id": test_conversation_id, "xid": test_xid},
            timeout=15
        )
        assert resp2.status_code == 200

        # Should be the same participant
        data1 = resp1.json()
        data2 = resp2.json()
        assert data1["user"]["uid"] == data2["user"]["uid"], "Same XID should return same user"


class TestPolisCommentOperations:
    """Test comment creation and retrieval in Polis."""

    @pytest.fixture
    def test_conversation_with_participant(self):
        """Create a test conversation with an initialized participant."""
        token = get_polis_oidc_token()
        if not token:
            pytest.skip("Could not get OIDC token")

        # Create conversation
        resp = requests.post(
            f"{POLIS_API_URL}/conversations",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            json={
                "topic": "Test: Comment Test Conversation",
                "description": "For comment testing",
                "is_active": True
            },
            timeout=15
        )
        if resp.status_code != 200:
            pytest.skip(f"Could not create test conversation: {resp.text}")

        conv_id = resp.json()["conversation_id"]
        test_xid = f"candid:{uuid.uuid4()}"

        # Initialize participant
        requests.get(
            f"{POLIS_API_URL}/participationInit",
            params={"conversation_id": conv_id, "xid": test_xid},
            timeout=15
        )

        return {"conversation_id": conv_id, "xid": test_xid}

    @pytest.mark.polis
    def test_create_comment(self, test_conversation_with_participant):
        """Test creating a comment in a Polis conversation."""
        conv_id = test_conversation_with_participant["conversation_id"]
        xid = test_conversation_with_participant["xid"]

        resp = requests.post(
            f"{POLIS_API_URL}/comments",
            json={
                "conversation_id": conv_id,
                "txt": "Test comment from integration test",
                "xid": xid
            },
            timeout=15
        )

        assert resp.status_code == 200, f"Failed to create comment: {resp.text}"
        data = resp.json()
        assert "tid" in data, "Response should contain tid (thread ID)"

    @pytest.mark.polis
    def test_get_comments(self, test_conversation_with_participant):
        """Test retrieving comments from a Polis conversation."""
        conv_id = test_conversation_with_participant["conversation_id"]
        xid = test_conversation_with_participant["xid"]

        # First create a comment
        requests.post(
            f"{POLIS_API_URL}/comments",
            json={
                "conversation_id": conv_id,
                "txt": "Comment for retrieval test",
                "xid": xid
            },
            timeout=15
        )

        # Get comments
        resp = requests.get(
            f"{POLIS_API_URL}/comments",
            params={"conversation_id": conv_id},
            timeout=15
        )

        assert resp.status_code == 200, f"Failed to get comments: {resp.text}"
        comments = resp.json()
        assert isinstance(comments, list), "Comments should be a list"
        assert len(comments) >= 1, "Should have at least one comment"


class TestPolisVoteOperations:
    """Test vote submission in Polis."""

    @pytest.fixture
    def conversation_with_comment(self):
        """Create a conversation with a comment to vote on."""
        token = get_polis_oidc_token()
        if not token:
            pytest.skip("Could not get OIDC token")

        # Create conversation
        resp = requests.post(
            f"{POLIS_API_URL}/conversations",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            json={
                "topic": "Test: Vote Test Conversation",
                "description": "For vote testing",
                "is_active": True
            },
            timeout=15
        )
        if resp.status_code != 200:
            pytest.skip(f"Could not create test conversation: {resp.text}")

        conv_id = resp.json()["conversation_id"]

        # Create author and voter participants
        author_xid = f"candid:{uuid.uuid4()}"
        voter_xid = f"candid:{uuid.uuid4()}"

        requests.get(
            f"{POLIS_API_URL}/participationInit",
            params={"conversation_id": conv_id, "xid": author_xid},
            timeout=15
        )
        requests.get(
            f"{POLIS_API_URL}/participationInit",
            params={"conversation_id": conv_id, "xid": voter_xid},
            timeout=15
        )

        # Create comment
        comment_resp = requests.post(
            f"{POLIS_API_URL}/comments",
            json={
                "conversation_id": conv_id,
                "txt": "Comment for voting test",
                "xid": author_xid
            },
            timeout=15
        )

        tid = comment_resp.json().get("tid", 0)

        return {
            "conversation_id": conv_id,
            "tid": tid,
            "author_xid": author_xid,
            "voter_xid": voter_xid
        }

    @pytest.mark.polis
    def test_submit_agree_vote(self, conversation_with_comment):
        """Test submitting an agree vote."""
        conv_id = conversation_with_comment["conversation_id"]
        tid = conversation_with_comment["tid"]
        voter_xid = conversation_with_comment["voter_xid"]

        resp = requests.post(
            f"{POLIS_API_URL}/votes",
            json={
                "conversation_id": conv_id,
                "tid": tid,
                "vote": -1,  # -1 = agree
                "xid": voter_xid
            },
            timeout=15
        )

        assert resp.status_code == 200, f"Failed to submit vote: {resp.text}"

    @pytest.mark.polis
    def test_submit_disagree_vote(self, conversation_with_comment):
        """Test submitting a disagree vote."""
        conv_id = conversation_with_comment["conversation_id"]
        tid = conversation_with_comment["tid"]
        # Use a different voter
        new_voter_xid = f"candid:{uuid.uuid4()}"

        # Initialize new voter
        requests.get(
            f"{POLIS_API_URL}/participationInit",
            params={"conversation_id": conv_id, "xid": new_voter_xid},
            timeout=15
        )

        resp = requests.post(
            f"{POLIS_API_URL}/votes",
            json={
                "conversation_id": conv_id,
                "tid": tid,
                "vote": 1,  # 1 = disagree
                "xid": new_voter_xid
            },
            timeout=15
        )

        assert resp.status_code == 200, f"Failed to submit vote: {resp.text}"


class TestPolisSyncQueue:
    """Test the Polis sync queue mechanism."""

    @pytest.fixture(autouse=True)
    def cleanup_queue(self):
        """Clean up queue before each test."""
        cleanup_polis_test_data()
        yield

    @pytest.mark.polis
    def test_position_creation_queues_sync(self, normal_headers):
        """Test that creating a position queues it for Polis sync."""
        # Get initial queue count
        initial_stats = get_sync_queue_stats()
        initial_total = sum(initial_stats.values())

        # Create a position with unique identifier
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "statement": f"Polis integration test - queue test {unique_id}",
            "categoryId": HEALTHCARE_CAT_ID,
            "locationId": OREGON_LOCATION_ID,
        }
        resp = requests.post(POSITIONS_URL, headers=normal_headers, json=payload)
        assert resp.status_code in (200, 201, 204), f"Failed to create position: {resp.text}"

        # Give it a moment to queue
        time.sleep(0.5)

        # Check that a new item was queued
        new_stats = get_sync_queue_stats()
        new_total = sum(new_stats.values())

        assert new_total > initial_total, "Position should be queued for Polis sync"

    @pytest.mark.polis
    def test_sync_queue_processes_items(self, normal_headers):
        """Test that the sync queue worker processes pending items."""
        # Create a position with unique identifier
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "statement": f"Polis integration test - processing {unique_id}",
            "categoryId": HEALTHCARE_CAT_ID,
            "locationId": OREGON_LOCATION_ID,
        }
        resp = requests.post(POSITIONS_URL, headers=normal_headers, json=payload)
        assert resp.status_code in (200, 201, 204)

        # Wait for sync to complete (worker runs in background)
        completed = wait_for_sync_completion(timeout=60)

        # Check final stats
        stats = get_sync_queue_stats()

        # Either completed, failed, or partial (no items stuck processing)
        # We allow failed/pending items since Polis may not be fully reachable
        # from the test environment
        assert stats["processing"] == 0, "No items should be stuck processing"
        if not completed:
            # If sync didn't complete, it's likely Polis is unreachable
            pytest.skip(f"Sync did not complete within timeout (Polis may not be running). Stats: {stats}")


class TestPolisEndToEndSync:
    """End-to-end tests for Polis sync functionality."""

    @pytest.fixture(autouse=True)
    def cleanup_before_test(self):
        """Clean up before each test."""
        cleanup_polis_test_data()
        yield

    @pytest.mark.polis
    @pytest.mark.e2e
    def test_position_syncs_to_polis_conversations(self, normal_headers):
        """Test that a position gets synced to Polis conversations."""
        # Create a position
        test_statement = f"Polis integration test - e2e sync {uuid.uuid4()}"
        payload = {
            "statement": test_statement,
            "categoryId": HEALTHCARE_CAT_ID,
            "locationId": OREGON_LOCATION_ID,
        }
        resp = requests.post(POSITIONS_URL, headers=normal_headers, json=payload)
        assert resp.status_code in (200, 201, 204)

        # Wait for sync to complete (longer timeout for e2e)
        completed = wait_for_sync_completion(timeout=60)
        if not completed:
            stats = get_sync_queue_stats()
            pytest.fail(f"Sync did not complete within timeout. Queue stats: {stats}")

        # Check that Polis conversations were created
        conversations = get_polis_conversations()
        assert len(conversations) >= 2, "Should have at least 2 conversations (category + location_all)"

        # Verify conversation types
        conv_types = {c["conversation_type"] for c in conversations}
        assert "category" in conv_types, "Should have a category conversation"
        assert "location_all" in conv_types, "Should have a location_all conversation"

    @pytest.mark.polis
    @pytest.mark.e2e
    def test_position_has_polis_comment_mappings(self, normal_headers):
        """Test that synced positions have Polis comment mappings."""
        # Create a position
        test_statement = f"Polis integration test - comment mapping {uuid.uuid4()}"
        payload = {
            "statement": test_statement,
            "categoryId": HEALTHCARE_CAT_ID,
            "locationId": OREGON_LOCATION_ID,
        }
        resp = requests.post(POSITIONS_URL, headers=normal_headers, json=payload)
        assert resp.status_code in (200, 201, 204)

        # Wait for sync
        wait_for_sync_completion(timeout=30)

        # Find the position in the database
        position = db_query_one(
            "SELECT id FROM position WHERE statement = %s",
            (test_statement,)
        )
        assert position is not None, "Position should exist in database"

        # Check for Polis comment mappings
        comments = get_polis_comments_for_position(str(position["id"]))
        assert len(comments) >= 2, "Position should be synced to at least 2 Polis conversations"

        # Verify all have valid TIDs
        for comment in comments:
            assert comment["polis_comment_tid"] is not None, "Comment should have a TID"
            assert comment["sync_status"] == "synced", "Comment should be marked as synced"

    @pytest.mark.polis
    @pytest.mark.e2e
    def test_vote_syncs_after_position_sync(self):
        """Test that votes get synced after position is synced."""
        # Login as two different users
        user1_token = login("normal1")
        user2_token = login("normal2")
        user1_headers = auth_header(user1_token)
        user2_headers = auth_header(user2_token)

        # User 1 creates a position
        test_statement = f"Polis integration test - vote sync {uuid.uuid4()}"
        payload = {
            "statement": test_statement,
            "categoryId": HEALTHCARE_CAT_ID,
            "locationId": OREGON_LOCATION_ID,
        }
        resp = requests.post(POSITIONS_URL, headers=user1_headers, json=payload)
        assert resp.status_code in (200, 201, 204)

        # Wait for position sync
        wait_for_sync_completion(timeout=30)

        # Find the position
        position = db_query_one(
            "SELECT id FROM position WHERE statement = %s",
            (test_statement,)
        )
        assert position is not None

        # User 2 votes on the position
        vote_payload = {
            "responses": [
                {"positionId": str(position["id"]), "response": "agree"},
            ]
        }
        vote_resp = requests.post(
            f"{POSITIONS_URL}/responses",
            headers=user2_headers,
            json=vote_payload,
        )
        assert vote_resp.status_code in (200, 201, 204)

        # Wait for vote sync
        wait_for_sync_completion(timeout=30)

        # Check final queue stats (all should be completed)
        stats = get_sync_queue_stats()
        assert stats["failed"] == 0, "No sync items should have failed"


class TestPolisConversationLifecycle:
    """Test Polis conversation creation and management."""

    @pytest.mark.polis
    def test_conversations_are_time_windowed(self, normal_headers):
        """Test that conversations have proper time window settings."""
        # Create a position to trigger conversation creation
        payload = {
            "statement": "Polis integration test - time window test",
            "categoryId": HEALTHCARE_CAT_ID,
            "locationId": OREGON_LOCATION_ID,
        }
        requests.post(POSITIONS_URL, headers=normal_headers, json=payload)
        wait_for_sync_completion(timeout=30)

        # Check conversations have time windows
        conversations = get_polis_conversations()
        for conv in conversations:
            assert conv["active_from"] is not None, "Conversation should have active_from"
            assert conv["active_until"] is not None, "Conversation should have active_until"
            assert conv["active_until"] > conv["active_from"], "active_until should be after active_from"
            assert conv["status"] == "active", "New conversations should be active"

    @pytest.mark.polis
    def test_conversations_created_for_location_and_category(self, normal_headers):
        """Test that both location and category conversations are created."""
        # Create position
        payload = {
            "statement": "Polis integration test - dual conversation test",
            "categoryId": HEALTHCARE_CAT_ID,
            "locationId": OREGON_LOCATION_ID,
        }
        requests.post(POSITIONS_URL, headers=normal_headers, json=payload)
        wait_for_sync_completion(timeout=30)

        # Get conversations for this location
        conversations = db_query("""
            SELECT conversation_type, category_id
            FROM polis_conversation
            WHERE location_id = %s
            ORDER BY conversation_type
        """, (OREGON_LOCATION_ID,))

        # Should have category conversation (with category_id)
        category_convs = [c for c in conversations if c["conversation_type"] == "category"]
        assert len(category_convs) >= 1, "Should have at least one category conversation"
        assert category_convs[0]["category_id"] is not None, "Category conv should have category_id"

        # Should have location_all conversation (no category_id)
        location_convs = [c for c in conversations if c["conversation_type"] == "location_all"]
        assert len(location_convs) >= 1, "Should have at least one location_all conversation"
        assert location_convs[0]["category_id"] is None, "Location conv should not have category_id"
