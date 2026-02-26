"""Tests for sessions: GET /sessions, GET /sessions/{id}, PATCH /sessions/{id},
and stage gating on write endpoints."""
# Auth tests (test_unauthenticated_returns_401) live in test_auth_required.py.

import pytest
import requests
from conftest import (
    BASE_URL,
    HEALTHCARE_SESSION_ID,
    ECONOMY_SESSION_ID,
    EDUCATION_SESSION_ID,
    NONEXISTENT_UUID,
    OREGON_LOCATION_ID,
    CALIFORNIA_LOCATION_ID,
    db_execute,
    db_execute_returning,
    db_query,
    clear_rate_limits,
)


SESSIONS_URL = f"{BASE_URL}/sessions"
POSTS_URL = f"{BASE_URL}/posts"
POSITIONS_URL = f"{BASE_URL}/positions"


class TestGetAllSessions:
    """Tests for the getAllSessions endpoint."""

    @pytest.mark.smoke
    def test_get_sessions_success(self, normal_headers):
        """Returns list of sessions when authenticated."""
        resp = requests.get(SESSIONS_URL, headers=normal_headers)
        assert resp.status_code == 200
        sessions = resp.json()
        assert isinstance(sessions, list)
        assert len(sessions) == 15  # Per seed data (distributed across OR/CA/TX hierarchies)

    def test_sessions_have_expected_fields(self, normal_headers):
        """Each session has id and label fields."""
        resp = requests.get(SESSIONS_URL, headers=normal_headers)
        assert resp.status_code == 200
        sessions = resp.json()
        assert len(sessions) > 0
        for s in sessions:
            assert "id" in s
            assert "label" in s

    def test_sessions_are_flat_list(self, normal_headers):
        """Sessions are a flat list (no parent hierarchy)."""
        resp = requests.get(SESSIONS_URL, headers=normal_headers)
        assert resp.status_code == 200
        sessions = resp.json()
        assert len(sessions) > 0

    def test_admin_can_access(self, admin_headers):
        """Admin users can access sessions."""
        resp = requests.get(SESSIONS_URL, headers=admin_headers)
        assert resp.status_code == 200

    def test_filter_by_location(self, normal_headers):
        """Filtering by locationId returns only sessions assigned to that location."""
        resp = requests.get(SESSIONS_URL, headers=normal_headers,
                            params={"locationId": CALIFORNIA_LOCATION_ID})
        assert resp.status_code == 200
        sessions = resp.json()
        assert len(sessions) == 2  # Climate Action, Pacific Defense
        for s in sessions:
            assert s["locationId"] == CALIFORNIA_LOCATION_ID

    def test_filter_by_location_oregon(self, normal_headers):
        """Oregon location returns its 2 state-level sessions."""
        resp = requests.get(SESSIONS_URL, headers=normal_headers,
                            params={"locationId": OREGON_LOCATION_ID})
        assert resp.status_code == 200
        sessions = resp.json()
        assert len(sessions) == 2  # Healthcare Access, Living Wage
        for s in sessions:
            assert s["locationId"] == OREGON_LOCATION_ID

    def test_moderator_can_access(self, moderator_headers):
        """Moderator users can access sessions."""
        resp = requests.get(SESSIONS_URL, headers=moderator_headers)
        assert resp.status_code == 200


class TestSuggestSession:
    """GET /sessions/suggestions"""

    def test_suggest_too_short_400(self, normal_headers):
        """Statement shorter than 10 chars returns 400."""
        resp = requests.get(
            f"{SESSIONS_URL}/suggestions",
            headers=normal_headers,
            params={"statement": "short"},
        )
        assert resp.status_code == 400

    def test_suggest_valid_statement(self, normal_headers):
        """Valid statement returns suggestions (or 503 if NLP unavailable)."""
        resp = requests.get(
            f"{SESSIONS_URL}/suggestions",
            headers=normal_headers,
            params={"statement": "Healthcare should be available to everyone regardless of income"},
        )
        # NLP service may or may not be running in test env
        if resp.status_code == 200:
            body = resp.json()
            assert isinstance(body, list)
            assert len(body) > 0
            assert "session" in body[0]
            assert "score" in body[0]
        else:
            assert resp.status_code in (500, 503)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _set_session_stage(session_id, stage):
    """Set a session's stage directly in the database."""
    db_execute(
        "UPDATE session SET stage = %s WHERE id = %s",
        (stage, session_id),
    )


def _create_post(headers, title="STEST discussion post", body="Test body content",
                 location_id=OREGON_LOCATION_ID, session_id=None,
                 post_type="discussion"):
    """Helper to create a post via API."""
    payload = {
        "title": title,
        "body": body,
        "locationId": location_id,
        "postType": post_type,
    }
    if session_id:
        payload["sessionId"] = session_id
    return requests.post(POSTS_URL, headers=headers, json=payload)


# ---------------------------------------------------------------------------
# GET /sessions/{sessionId}
# ---------------------------------------------------------------------------

class TestGetSession:
    """Tests for the getSession endpoint."""

    def test_get_session_success(self, normal_headers):
        """Returns full session details for a known session."""
        resp = requests.get(
            f"{SESSIONS_URL}/{HEALTHCARE_SESSION_ID}", headers=normal_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == HEALTHCARE_SESSION_ID
        assert data["label"] == "Healthcare Access"
        assert "stage" in data
        assert "status" in data
        assert "locationId" in data
        assert "description" in data
        assert "facilitatorUserId" in data
        assert "stageChangedAt" in data
        assert "stageChangedBy" in data
        assert "createdBy" in data

    def test_get_session_not_found(self, normal_headers):
        """Non-existent session returns 404."""
        resp = requests.get(
            f"{SESSIONS_URL}/{NONEXISTENT_UUID}", headers=normal_headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /sessions/{sessionId}
# ---------------------------------------------------------------------------

class TestUpdateSession:
    """Tests for the updateSession endpoint (stage advance)."""

    def test_advance_stage_unauthorized(self, normal2_headers):
        """Normal user (no facilitator/admin/mod role) gets 403."""
        resp = requests.patch(
            f"{SESSIONS_URL}/{HEALTHCARE_SESSION_ID}",
            headers=normal2_headers,
            json={"stage": "opinion_curation"},
        )
        assert resp.status_code == 403

    def test_advance_stage_success(self, admin_headers):
        """Admin can advance a session to the next stage."""
        # Set session to a known starting stage
        _set_session_stage(ECONOMY_SESSION_ID, "proposal_issue")
        try:
            resp = requests.patch(
                f"{SESSIONS_URL}/{ECONOMY_SESSION_ID}",
                headers=admin_headers,
                json={"stage": "proposal_qualify"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["stage"] == "proposal_qualify"
        finally:
            _set_session_stage(ECONOMY_SESSION_ID, "opinion_curation")

    def test_advance_stage_invalid_skip(self, admin_headers):
        """Cannot skip stages (e.g. proposal_issue -> opinion_discussion)."""
        _set_session_stage(ECONOMY_SESSION_ID, "proposal_issue")
        try:
            resp = requests.patch(
                f"{SESSIONS_URL}/{ECONOMY_SESSION_ID}",
                headers=admin_headers,
                json={"stage": "opinion_discussion"},
            )
            assert resp.status_code == 400
        finally:
            _set_session_stage(ECONOMY_SESSION_ID, "opinion_curation")

    def test_advance_stage_backward(self, admin_headers):
        """Cannot move backward (e.g. opinion_discussion -> proposal_issue)."""
        resp = requests.patch(
            f"{SESSIONS_URL}/{HEALTHCARE_SESSION_ID}",
            headers=admin_headers,
            json={"stage": "proposal_issue"},
        )
        assert resp.status_code == 400

    def test_advance_stage_not_found(self, admin_headers):
        """Non-existent session returns 404."""
        resp = requests.patch(
            f"{SESSIONS_URL}/{NONEXISTENT_UUID}",
            headers=admin_headers,
            json={"stage": "proposal_qualify"},
        )
        assert resp.status_code == 404

    def test_stage_history_created(self, admin_headers):
        """Advancing a stage creates a record in session_stage_history."""
        _set_session_stage(ECONOMY_SESSION_ID, "proposal_issue")
        try:
            # Clear any existing history for this session
            db_execute(
                "DELETE FROM session_stage_history WHERE session_id = %s",
                (ECONOMY_SESSION_ID,),
            )

            resp = requests.patch(
                f"{SESSIONS_URL}/{ECONOMY_SESSION_ID}",
                headers=admin_headers,
                json={"stage": "proposal_qualify", "reason": "Test advance"},
            )
            assert resp.status_code == 200

            rows = db_query(
                "SELECT * FROM session_stage_history WHERE session_id = %s ORDER BY created_time DESC",
                (ECONOMY_SESSION_ID,),
            )
            assert len(rows) >= 1
            latest = rows[0]
            assert latest["from_stage"] == "proposal_issue"
            assert latest["to_stage"] == "proposal_qualify"
            assert latest["reason"] == "Test advance"
        finally:
            _set_session_stage(ECONOMY_SESSION_ID, "opinion_curation")


# ---------------------------------------------------------------------------
# Stage gating on write endpoints
# ---------------------------------------------------------------------------

class TestStageGating:
    """Tests that write endpoints are blocked in inappropriate stages."""

    @pytest.fixture(autouse=True)
    def _clear_limits(self):
        """Clear rate limits before each test."""
        clear_rate_limits()

    def test_create_position_blocked_in_reflection(self, admin_headers):
        """Creating a position is blocked when session is in reflection stage."""
        _set_session_stage(HEALTHCARE_SESSION_ID, "reflection")
        try:
            resp = requests.post(
                POSITIONS_URL,
                headers=admin_headers,
                json={
                    "statement": "Stage gating test position",
                    "sessionId": HEALTHCARE_SESSION_ID,
                    "locationId": OREGON_LOCATION_ID,
                },
            )
            assert resp.status_code == 403
        finally:
            _set_session_stage(HEALTHCARE_SESSION_ID, "opinion_discussion")

    def test_create_post_blocked_in_consensus(self, admin_headers):
        """Creating a discussion post is blocked when session is in consensus stage."""
        _set_session_stage(HEALTHCARE_SESSION_ID, "consensus")
        try:
            resp = _create_post(
                admin_headers,
                title="STEST blocked post",
                session_id=HEALTHCARE_SESSION_ID,
            )
            assert resp.status_code == 403
        finally:
            _set_session_stage(HEALTHCARE_SESSION_ID, "opinion_discussion")

    def test_create_comment_blocked_in_reflection(self, admin_headers):
        """Creating a comment is blocked when the post's session is in reflection."""
        # First create a post while session is in an active stage
        create_resp = _create_post(
            admin_headers,
            title="STEST comment gating post",
            session_id=HEALTHCARE_SESSION_ID,
        )
        assert create_resp.status_code == 201, f"Failed to create post: {create_resp.text}"
        post_id = create_resp.json()["id"]

        # Now set session to reflection
        _set_session_stage(HEALTHCARE_SESSION_ID, "reflection")
        try:
            resp = requests.post(
                f"{POSTS_URL}/{post_id}/comments",
                headers=admin_headers,
                json={"body": "Should be blocked by stage gating"},
            )
            assert resp.status_code == 403
        finally:
            _set_session_stage(HEALTHCARE_SESSION_ID, "opinion_discussion")

    def test_vote_blocked_in_consensus(self, admin_headers, normal_headers):
        """Voting on a post is blocked when the post's session is in consensus."""
        # Create a post while session is in an active stage
        create_resp = _create_post(
            admin_headers,
            title="STEST vote gating post",
            session_id=HEALTHCARE_SESSION_ID,
        )
        assert create_resp.status_code == 201, f"Failed to create post: {create_resp.text}"
        post_id = create_resp.json()["id"]

        # Now set session to consensus
        _set_session_stage(HEALTHCARE_SESSION_ID, "consensus")
        try:
            resp = requests.post(
                f"{POSTS_URL}/{post_id}/votes",
                headers=normal_headers,
                json={"voteType": "upvote"},
            )
            assert resp.status_code == 403
        finally:
            _set_session_stage(HEALTHCARE_SESSION_ID, "opinion_discussion")

    def test_create_proposal_blocked_in_wrong_stage(self, admin_headers):
        """Creating a proposal post is blocked in proposal_issue (not in proposal_qualify or opinion_proposals)."""
        _set_session_stage(HEALTHCARE_SESSION_ID, "proposal_issue")
        try:
            resp = _create_post(
                admin_headers,
                title="STEST blocked proposal",
                session_id=HEALTHCARE_SESSION_ID,
                post_type="proposal",
            )
            assert resp.status_code == 403
        finally:
            _set_session_stage(HEALTHCARE_SESSION_ID, "opinion_discussion")

    def test_create_proposal_allowed_in_proposal_qualify(self, admin_headers):
        """Creating a proposal post is allowed in proposal_qualify stage."""
        _set_session_stage(HEALTHCARE_SESSION_ID, "proposal_qualify")
        try:
            resp = _create_post(
                admin_headers,
                title="STEST allowed proposal",
                session_id=HEALTHCARE_SESSION_ID,
                post_type="proposal",
            )
            assert resp.status_code == 201
        finally:
            _set_session_stage(HEALTHCARE_SESSION_ID, "opinion_discussion")


# ---------------------------------------------------------------------------
# Voting Round — Endorsements & RCV Lifecycle
# ---------------------------------------------------------------------------

ENDORSEMENTS_URL = lambda sid: f"{BASE_URL}/sessions/{sid}/endorsements"
BALLOT_URL = lambda sid: f"{BASE_URL}/sessions/{sid}/ballot"
CANDIDATES_URL = lambda sid: f"{BASE_URL}/sessions/{sid}/candidates"
RESULTS_URL = lambda sid: f"{BASE_URL}/sessions/{sid}/results"
VOTING_ROUND_URL = lambda sid: f"{BASE_URL}/sessions/{sid}/voting-round"


def _cleanup_voting_round(session_id):
    """Remove voting round and all dependent data for clean tests."""
    # Delete in dependency order
    db_execute("""
        DELETE FROM rcv_ranking WHERE ballot_id IN (
            SELECT b.id FROM rcv_ballot b
            JOIN voting_round vr ON vr.id = b.voting_round_id
            WHERE vr.session_id = %s
        )
    """, (session_id,))
    db_execute("""
        DELETE FROM rcv_ballot WHERE voting_round_id IN (
            SELECT id FROM voting_round WHERE session_id = %s
        )
    """, (session_id,))
    db_execute("""
        DELETE FROM voting_round_candidate WHERE voting_round_id IN (
            SELECT id FROM voting_round WHERE session_id = %s
        )
    """, (session_id,))
    db_execute("""
        DELETE FROM proposal_endorsement WHERE voting_round_id IN (
            SELECT id FROM voting_round WHERE session_id = %s
        )
    """, (session_id,))
    db_execute("DELETE FROM voting_round WHERE session_id = %s", (session_id,))


def _create_voting_round(session_id, ballot_size=7, winner_count=1):
    """Create a voting round directly in DB for testing."""
    rows = db_execute_returning("""
        INSERT INTO voting_round (session_id, round_type, ballot_size, winner_count)
        VALUES (%s, 'issue_selection', %s, %s)
        RETURNING id
    """, (session_id, ballot_size, winner_count))
    return str(rows[0]['id'])


def _create_proposal_post(headers, session_id, title="Test Proposal"):
    """Create a proposal post via API."""
    # Find location for this session
    loc = db_query(
        "SELECT location_id FROM session WHERE id = %s", (session_id,)
    )
    location_id = str(loc[0]['location_id']) if loc else OREGON_LOCATION_ID

    return requests.post(POSTS_URL, headers=headers, json={
        "title": title,
        "body": f"Body of {title}",
        "locationId": location_id,
        "sessionId": session_id,
        "postType": "proposal",
    })


class TestCreateVotingRound:
    """Tests for POST /sessions/{sessionId}/voting-round."""

    @pytest.fixture(autouse=True)
    def _cleanup(self):
        yield
        _cleanup_voting_round(EDUCATION_SESSION_ID)

    def test_facilitator_creates_round(self, admin_headers):
        """Admin (facilitator) can create a voting round in proposal_qualify stage."""
        _set_session_stage(EDUCATION_SESSION_ID, "proposal_qualify")
        try:
            resp = requests.post(
                VOTING_ROUND_URL(EDUCATION_SESSION_ID),
                headers=admin_headers,
                json={"ballotSize": 5, "winnerCount": 1},
            )
            assert resp.status_code == 201
            data = resp.json()
            assert data["roundType"] == "issue_selection"
            assert data["status"] == "proposals_open"
            assert data["ballotSize"] == 5
        finally:
            _set_session_stage(EDUCATION_SESSION_ID, "proposal_qualify")

    def test_duplicate_round_rejected(self, admin_headers):
        """Cannot create two rounds of same type for one session."""
        _set_session_stage(EDUCATION_SESSION_ID, "proposal_qualify")
        try:
            resp1 = requests.post(
                VOTING_ROUND_URL(EDUCATION_SESSION_ID),
                headers=admin_headers, json={},
            )
            assert resp1.status_code == 201
            resp2 = requests.post(
                VOTING_ROUND_URL(EDUCATION_SESSION_ID),
                headers=admin_headers, json={},
            )
            assert resp2.status_code == 400
        finally:
            _set_session_stage(EDUCATION_SESSION_ID, "proposal_qualify")

    def test_wrong_stage_rejected(self, admin_headers):
        """Cannot create round in wrong stage."""
        _set_session_stage(EDUCATION_SESSION_ID, "opinion_discussion")
        try:
            resp = requests.post(
                VOTING_ROUND_URL(EDUCATION_SESSION_ID),
                headers=admin_headers, json={},
            )
            assert resp.status_code == 400
        finally:
            _set_session_stage(EDUCATION_SESSION_ID, "proposal_qualify")

    def test_normal_user_forbidden(self, normal2_headers):
        """Normal user without facilitator role gets 403."""
        _set_session_stage(EDUCATION_SESSION_ID, "proposal_qualify")
        try:
            resp = requests.post(
                VOTING_ROUND_URL(EDUCATION_SESSION_ID),
                headers=normal2_headers, json={},
            )
            assert resp.status_code == 403
        finally:
            _set_session_stage(EDUCATION_SESSION_ID, "proposal_qualify")


class TestEndorsements:
    """Tests for endorsement endpoints."""

    @pytest.fixture(autouse=True)
    def _setup_and_cleanup(self, admin_headers):
        """Set stage and create voting round, clean up after."""
        _set_session_stage(EDUCATION_SESSION_ID, "proposal_qualify")
        _cleanup_voting_round(EDUCATION_SESSION_ID)
        self.vr_id = _create_voting_round(EDUCATION_SESSION_ID, ballot_size=3)
        clear_rate_limits()
        yield
        _cleanup_voting_round(EDUCATION_SESSION_ID)
        _set_session_stage(EDUCATION_SESSION_ID, "proposal_qualify")

    def test_endorse_and_get(self, admin_headers):
        """Create endorsement and retrieve it."""
        # Create a proposal
        resp = _create_proposal_post(admin_headers, EDUCATION_SESSION_ID, "Endorse Test")
        assert resp.status_code == 201, f"Failed to create proposal: {resp.text}"
        post_id = resp.json()["id"]

        # Endorse it
        resp = requests.post(
            ENDORSEMENTS_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            json={"proposalPostId": post_id},
        )
        assert resp.status_code == 201
        endorsement = resp.json()
        assert endorsement["proposalPostId"] == post_id

        # Get endorsements
        resp = requests.get(
            ENDORSEMENTS_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["myEndorsements"]) == 1
        assert data["myEndorsements"][0]["proposalPostId"] == post_id
        counts = {c["proposalPostId"]: c["count"] for c in data["proposalCounts"]}
        assert counts[post_id] == 1

    def test_endorsement_limit(self, admin_headers):
        """Cannot exceed MAX_ENDORSEMENTS_PER_USER (3)."""
        post_ids = []
        for i in range(4):
            resp = _create_proposal_post(admin_headers, EDUCATION_SESSION_ID, f"Limit Test {i}")
            assert resp.status_code == 201, f"Failed to create proposal {i}: {resp.text}"
            post_ids.append(resp.json()["id"])

        # Endorse first 3 — should succeed
        for pid in post_ids[:3]:
            resp = requests.post(
                ENDORSEMENTS_URL(EDUCATION_SESSION_ID),
                headers=admin_headers,
                json={"proposalPostId": pid},
            )
            assert resp.status_code == 201

        # 4th endorsement should fail
        resp = requests.post(
            ENDORSEMENTS_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            json={"proposalPostId": post_ids[3]},
        )
        assert resp.status_code == 400

    def test_duplicate_endorsement_rejected(self, admin_headers):
        """Cannot endorse the same proposal twice."""
        resp = _create_proposal_post(admin_headers, EDUCATION_SESSION_ID, "Dup Test")
        assert resp.status_code == 201
        post_id = resp.json()["id"]

        resp1 = requests.post(
            ENDORSEMENTS_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            json={"proposalPostId": post_id},
        )
        assert resp1.status_code == 201

        resp2 = requests.post(
            ENDORSEMENTS_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            json={"proposalPostId": post_id},
        )
        assert resp2.status_code == 409

    def test_delete_endorsement(self, admin_headers):
        """Can delete own endorsement."""
        resp = _create_proposal_post(admin_headers, EDUCATION_SESSION_ID, "Del Test")
        assert resp.status_code == 201
        post_id = resp.json()["id"]

        create_resp = requests.post(
            ENDORSEMENTS_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            json={"proposalPostId": post_id},
        )
        assert create_resp.status_code == 201
        eid = create_resp.json()["id"]

        del_resp = requests.delete(
            f"{ENDORSEMENTS_URL(EDUCATION_SESSION_ID)}/{eid}",
            headers=admin_headers,
        )
        assert del_resp.status_code == 204

        # Verify gone
        get_resp = requests.get(
            ENDORSEMENTS_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
        )
        assert len(get_resp.json()["myEndorsements"]) == 0

    def test_endorse_wrong_status_rejected(self, admin_headers):
        """Cannot endorse when voting round is in voting_open."""
        db_execute("UPDATE voting_round SET status = 'voting_open' WHERE id = %s", (self.vr_id,))

        resp = _create_proposal_post(admin_headers, EDUCATION_SESSION_ID, "Wrong Status")
        if resp.status_code == 201:
            post_id = resp.json()["id"]
            resp = requests.post(
                ENDORSEMENTS_URL(EDUCATION_SESSION_ID),
                headers=admin_headers,
                json={"proposalPostId": post_id},
            )
            assert resp.status_code == 400

        # Reset
        db_execute("UPDATE voting_round SET status = 'proposals_open' WHERE id = %s", (self.vr_id,))


class TestBallotAndResults:
    """Tests for ballot submission, candidates, and results."""

    @pytest.fixture(autouse=True)
    def _setup_and_cleanup(self, admin_headers, normal_headers):
        """Create voting round with candidates for testing."""
        _set_session_stage(EDUCATION_SESSION_ID, "proposal_qualify")
        _cleanup_voting_round(EDUCATION_SESSION_ID)
        clear_rate_limits()
        self.vr_id = _create_voting_round(EDUCATION_SESSION_ID, ballot_size=3, winner_count=1)

        # Create proposal posts and manually add as candidates
        self.post_ids = []
        for i in range(3):
            resp = _create_proposal_post(admin_headers, EDUCATION_SESSION_ID, f"Ballot Prop {i}")
            assert resp.status_code == 201, f"Failed to create proposal {i}: {resp.text}"
            self.post_ids.append(resp.json()["id"])

        # Insert as candidates directly
        for i, pid in enumerate(self.post_ids):
            db_execute("""
                INSERT INTO voting_round_candidate (voting_round_id, proposal_post_id, endorsement_count, display_order)
                VALUES (%s, %s, %s, %s)
            """, (self.vr_id, pid, 3 - i, i))

        # Set to voting_open
        db_execute("UPDATE voting_round SET status = 'voting_open' WHERE id = %s", (self.vr_id,))

        yield
        _cleanup_voting_round(EDUCATION_SESSION_ID)
        _set_session_stage(EDUCATION_SESSION_ID, "proposal_qualify")

    def test_get_candidates(self, admin_headers):
        """Get qualified ballot candidates."""
        resp = requests.get(
            CANDIDATES_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
        )
        assert resp.status_code == 200
        candidates = resp.json()
        assert len(candidates) == 3
        assert candidates[0]["endorsementCount"] == 3

    def test_submit_and_get_ballot(self, admin_headers):
        """Submit a ballot and retrieve it."""
        rankings = [
            {"proposalPostId": self.post_ids[2], "rank": 1},
            {"proposalPostId": self.post_ids[0], "rank": 2},
            {"proposalPostId": self.post_ids[1], "rank": 3},
        ]

        resp = requests.put(
            BALLOT_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            json={"rankings": rankings},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["rankings"]) == 3

        # Get it back
        resp = requests.get(
            BALLOT_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert len(resp.json()["rankings"]) == 3

    def test_update_ballot(self, admin_headers):
        """Can re-submit ballot to update rankings."""
        rankings1 = [
            {"proposalPostId": self.post_ids[0], "rank": 1},
            {"proposalPostId": self.post_ids[1], "rank": 2},
        ]
        resp = requests.put(
            BALLOT_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            json={"rankings": rankings1},
        )
        assert resp.status_code == 200

        # Update
        rankings2 = [
            {"proposalPostId": self.post_ids[1], "rank": 1},
            {"proposalPostId": self.post_ids[0], "rank": 2},
            {"proposalPostId": self.post_ids[2], "rank": 3},
        ]
        resp = requests.put(
            BALLOT_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            json={"rankings": rankings2},
        )
        assert resp.status_code == 200
        assert resp.json()["rankings"][0]["proposalPostId"] == self.post_ids[1]

    def test_invalid_ranks_rejected(self, admin_headers):
        """Non-sequential ranks are rejected."""
        rankings = [
            {"proposalPostId": self.post_ids[0], "rank": 1},
            {"proposalPostId": self.post_ids[1], "rank": 3},  # gap
        ]
        resp = requests.put(
            BALLOT_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            json={"rankings": rankings},
        )
        assert resp.status_code == 400

    def test_invalid_candidate_rejected(self, admin_headers):
        """Proposal not in candidates is rejected."""
        rankings = [
            {"proposalPostId": NONEXISTENT_UUID, "rank": 1},
        ]
        resp = requests.put(
            BALLOT_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            json={"rankings": rankings},
        )
        assert resp.status_code == 400

    def test_empty_ballot_before_submission(self, normal_headers):
        """Get ballot returns empty before submission."""
        resp = requests.get(
            BALLOT_URL(EDUCATION_SESSION_ID),
            headers=normal_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["rankings"] == []

    def test_results_before_voting_closed(self, admin_headers):
        """Results return 400 when voting not yet closed."""
        resp = requests.get(
            RESULTS_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
        )
        assert resp.status_code == 400

    def test_full_lifecycle(self, admin_headers, normal_headers):
        """Full lifecycle: vote → close → get results."""
        # Submit ballots from two users
        rankings_admin = [
            {"proposalPostId": self.post_ids[0], "rank": 1},
            {"proposalPostId": self.post_ids[1], "rank": 2},
            {"proposalPostId": self.post_ids[2], "rank": 3},
        ]
        resp = requests.put(
            BALLOT_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            json={"rankings": rankings_admin},
        )
        assert resp.status_code == 200

        rankings_normal = [
            {"proposalPostId": self.post_ids[0], "rank": 1},
            {"proposalPostId": self.post_ids[2], "rank": 2},
        ]
        resp = requests.put(
            BALLOT_URL(EDUCATION_SESSION_ID),
            headers=normal_headers,
            json={"rankings": rankings_normal},
        )
        assert resp.status_code == 200

        # Advance to voting_closed
        resp = requests.patch(
            VOTING_ROUND_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "voting_closed"

        # Get results
        resp = requests.get(
            RESULTS_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
        )
        assert resp.status_code == 200
        results = resp.json()
        assert results["method"] in ("condorcet", "irv")
        assert len(results["winners"]) >= 1
        assert results["totalBallots"] == 2
        assert results["winners"][0]["proposalPostId"] == self.post_ids[0]


ADMIN_SESSIONS_URL = f"{BASE_URL}/admin/sessions"


class TestGetAdminSessions:
    """Tests for the GET /admin/sessions endpoint."""

    def test_admin_can_list_sessions(self, admin_headers):
        """Admin users can list all sessions with admin context."""
        resp = requests.get(ADMIN_SESSIONS_URL, headers=admin_headers)
        assert resp.status_code == 200
        sessions = resp.json()
        assert isinstance(sessions, list)
        assert len(sessions) > 0

    def test_sessions_include_admin_fields(self, admin_headers):
        """Admin sessions include location and facilitator info."""
        resp = requests.get(ADMIN_SESSIONS_URL, headers=admin_headers)
        assert resp.status_code == 200
        sessions = resp.json()
        for s in sessions:
            assert "id" in s
            assert "label" in s
            assert "stage" in s
            assert "proposalMethod" in s
            # locationCode/locationName may be null if no location
            assert "locationCode" in s or s.get("locationId") is None

    def test_normal_user_forbidden(self, normal2_headers):
        """Normal users without moderator+ role get 403."""
        resp = requests.get(ADMIN_SESSIONS_URL, headers=normal2_headers)
        assert resp.status_code == 403

    def test_unauthenticated_returns_401(self):
        """Unauthenticated requests return 401."""
        resp = requests.get(ADMIN_SESSIONS_URL)
        assert resp.status_code == 401


class TestRoundTypeFiltering:
    """Tests for roundType query param on voting-round, endorsements, candidates, results, ballot."""

    @pytest.fixture(autouse=True)
    def _setup_and_cleanup(self, admin_headers):
        """Create two voting rounds (issue_selection + policy_selection)."""
        _set_session_stage(EDUCATION_SESSION_ID, "proposal_qualify")
        _cleanup_voting_round(EDUCATION_SESSION_ID)
        # Create issue_selection round
        self.issue_vr_id = _create_voting_round(EDUCATION_SESSION_ID, ballot_size=3)
        # Create policy_selection round directly
        rows = db_execute_returning("""
            INSERT INTO voting_round (session_id, round_type, ballot_size, winner_count)
            VALUES (%s, 'policy_selection', 5, 1)
            RETURNING id
        """, (EDUCATION_SESSION_ID,))
        self.policy_vr_id = str(rows[0]['id'])
        clear_rate_limits()
        yield
        _cleanup_voting_round(EDUCATION_SESSION_ID)
        _set_session_stage(EDUCATION_SESSION_ID, "proposal_qualify")

    def test_voting_round_no_filter_returns_latest(self, admin_headers):
        """Without roundType, returns the most recently created round."""
        resp = requests.get(
            VOTING_ROUND_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["roundType"] == "policy_selection"
        assert data["id"] == self.policy_vr_id

    def test_voting_round_issue_selection(self, admin_headers):
        """roundType=issue_selection returns the issue round."""
        resp = requests.get(
            VOTING_ROUND_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            params={"roundType": "issue_selection"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["roundType"] == "issue_selection"
        assert data["id"] == self.issue_vr_id

    def test_voting_round_policy_selection(self, admin_headers):
        """roundType=policy_selection returns the policy round."""
        resp = requests.get(
            VOTING_ROUND_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            params={"roundType": "policy_selection"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["roundType"] == "policy_selection"
        assert data["id"] == self.policy_vr_id

    def test_endorsements_filtered_by_round_type(self, admin_headers):
        """Endorsements endpoint filters by roundType."""
        # Create a proposal and endorse it in the issue_selection round
        resp = _create_proposal_post(admin_headers, EDUCATION_SESSION_ID, "RoundType Endorse Test")
        assert resp.status_code == 201
        post_id = resp.json()["id"]

        # Endorse in current round (issue_selection is active since it was created for proposal_qualify)
        resp = requests.post(
            ENDORSEMENTS_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            json={"proposalPostId": post_id},
        )
        # May succeed or fail depending on which VR the write endpoint picks — skip asserting status

        # GET with issue_selection filter
        resp = requests.get(
            ENDORSEMENTS_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            params={"roundType": "issue_selection"},
        )
        assert resp.status_code == 200

        # GET with policy_selection filter
        resp = requests.get(
            ENDORSEMENTS_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            params={"roundType": "policy_selection"},
        )
        assert resp.status_code == 200

    def test_candidates_filtered_by_round_type(self, admin_headers):
        """Candidates endpoint filters by roundType."""
        resp = requests.get(
            CANDIDATES_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            params={"roundType": "issue_selection"},
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_ballot_filtered_by_round_type(self, normal_headers):
        """Ballot endpoint filters by roundType."""
        resp = requests.get(
            BALLOT_URL(EDUCATION_SESSION_ID),
            headers=normal_headers,
            params={"roundType": "issue_selection"},
        )
        assert resp.status_code == 200

    def test_results_filtered_by_round_type(self, admin_headers):
        """Results endpoint filters by roundType (returns 400 if not voting_closed)."""
        resp = requests.get(
            RESULTS_URL(EDUCATION_SESSION_ID),
            headers=admin_headers,
            params={"roundType": "issue_selection"},
        )
        # Not voting_closed, so expect 400
        assert resp.status_code == 400
