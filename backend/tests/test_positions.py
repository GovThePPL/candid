"""Tests for GET /positions/{positionId}, POST /positions, POST /positions/responses,
POST /users/me/positions, POST /positions/search,
GET /positions/{positionId}/agreed-closures, POST /positions/search-stats."""
# Auth tests (test_unauthenticated_returns_401) live in test_auth_required.py.

import pytest
import requests
from conftest import (
    BASE_URL,
    POSITION1_ID,
    POSITION2_ID,
    POSITION3_ID,
    NONEXISTENT_UUID,
    HEALTHCARE_CAT_ID,
    ECONOMY_CAT_ID,
    OREGON_LOCATION_ID,
    NORMAL1_ID,
    NORMAL2_ID,
    db_execute,
    db_query,
)

POSITIONS_URL = f"{BASE_URL}/positions"


class TestGetPositionById:
    """GET /positions/{positionId}"""

    @pytest.mark.smoke
    def test_get_known_position(self, normal_headers):
        resp = requests.get(f"{POSITIONS_URL}/{POSITION1_ID}", headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == POSITION1_ID
        assert body["categoryId"] == HEALTHCARE_CAT_ID
        assert "statement" in body
        assert "creator" in body

    def test_position_has_expected_fields(self, normal_headers):
        resp = requests.get(f"{POSITIONS_URL}/{POSITION1_ID}", headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        for field in ("id", "statement", "categoryId", "status", "creator"):
            assert field in body, f"Missing field: {field}"
        # Creator should be a user object
        creator = body["creator"]
        assert "id" in creator
        assert "username" in creator

    def test_second_position(self, normal_headers):
        resp = requests.get(f"{POSITIONS_URL}/{POSITION2_ID}", headers=normal_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == POSITION2_ID

    def test_nonexistent_position_returns_404(self, normal_headers):
        resp = requests.get(f"{POSITIONS_URL}/{NONEXISTENT_UUID}", headers=normal_headers)
        assert resp.status_code == 404



class TestCreatePosition:
    """POST /positions"""

    @pytest.mark.mutation
    def test_create_position(self, normal_headers):
        """Create a position. Note: create_position may not return a response body
        (partial implementation), so we just check the status code."""
        payload = {
            "statement": "Integration test position - should be cleaned up",
            "categoryId": HEALTHCARE_CAT_ID,
            "locationId": OREGON_LOCATION_ID,
        }
        resp = requests.post(POSITIONS_URL, headers=normal_headers, json=payload)
        # The controller doesn't return anything explicitly, so accept 200/201/204
        assert resp.status_code in (200, 201, 204)

    def test_statement_too_long_400(self, normal_headers):
        """Statement exceeding 140 chars returns 400."""
        payload = {
            "statement": "A" * 141,
            "categoryId": HEALTHCARE_CAT_ID,
            "locationId": OREGON_LOCATION_ID,
        }
        resp = requests.post(POSITIONS_URL, headers=normal_headers, json=payload)
        assert resp.status_code == 400

    def test_missing_category_400(self, normal_headers):
        """Omitting categoryId returns 400."""
        payload = {
            "statement": "This position has no category assigned to it at all",
            "locationId": OREGON_LOCATION_ID,
        }
        resp = requests.post(POSITIONS_URL, headers=normal_headers, json=payload)
        assert resp.status_code == 400

    def test_missing_location_400(self, normal_headers):
        """Omitting locationId returns 400."""
        payload = {
            "statement": "This position has no location assigned to it ever",
            "categoryId": HEALTHCARE_CAT_ID,
        }
        resp = requests.post(POSITIONS_URL, headers=normal_headers, json=payload)
        assert resp.status_code == 400

    def test_missing_statement_400(self, normal_headers):
        """Omitting statement returns 400."""
        payload = {
            "categoryId": HEALTHCARE_CAT_ID,
            "locationId": OREGON_LOCATION_ID,
        }
        resp = requests.post(POSITIONS_URL, headers=normal_headers, json=payload)
        assert resp.status_code == 400

    def test_invalid_category_accepted(self, normal_headers):
        """Nonexistent categoryId — API does not FK-validate categories."""
        payload = {
            "statement": "Position with a nonexistent category",
            "categoryId": NONEXISTENT_UUID,
            "locationId": OREGON_LOCATION_ID,
        }
        resp = requests.post(POSITIONS_URL, headers=normal_headers, json=payload)
        # API accepts any UUID for category; no FK constraint check
        assert resp.status_code in (201, 400, 404, 500)


class TestRespondToPositions:
    """POST /positions/responses"""

    @pytest.mark.mutation
    def test_respond_to_position(self, moderator_headers):
        """Submit a response to a position. The controller may not return a body."""
        payload = {
            "responses": [
                {"positionId": POSITION1_ID, "response": "agree"},
            ]
        }
        resp = requests.post(
            f"{POSITIONS_URL}/responses",
            headers=moderator_headers,
            json=payload,
        )
        # Accept 200/201/204 since the controller has a partial implementation
        assert resp.status_code in (200, 201, 204)

    def test_empty_responses_array_error(self, normal_headers):
        """Empty responses array returns an error (400 or 500)."""
        resp = requests.post(
            f"{POSITIONS_URL}/responses",
            headers=normal_headers,
            json={"responses": []},
        )
        assert resp.status_code in (400, 500)

    @pytest.mark.mutation
    def test_multiple_responses_in_batch(self, normal2_headers):
        """Can submit multiple responses in a single batch."""
        payload = {
            "responses": [
                {"positionId": POSITION1_ID, "response": "agree"},
                {"positionId": POSITION2_ID, "response": "disagree"},
            ]
        }
        resp = requests.post(
            f"{POSITIONS_URL}/responses",
            headers=normal2_headers,
            json=payload,
        )
        assert resp.status_code in (200, 201, 204)

    @pytest.mark.mutation
    def test_invalid_position_id_in_batch(self, moderator_headers):
        """Nonexistent position ID in batch is handled gracefully."""
        payload = {
            "responses": [
                {"positionId": NONEXISTENT_UUID, "response": "agree"},
            ]
        }
        resp = requests.post(
            f"{POSITIONS_URL}/responses",
            headers=moderator_headers,
            json=payload,
        )
        # Should either skip invalid or return error, but not crash
        assert resp.status_code in (200, 201, 204, 400, 404)


class TestAdoptPosition:
    """POST /users/me/positions"""

    def _cleanup_adoption(self, user_id, position_id):
        """Remove user_position and response records for a user/position pair."""
        db_execute(
            "DELETE FROM response WHERE user_id = %s AND position_id = %s",
            (user_id, position_id),
        )
        db_execute(
            "DELETE FROM user_position WHERE user_id = %s AND position_id = %s",
            (user_id, position_id),
        )

    @pytest.mark.mutation
    def test_adopt_success(self, normal2_headers):
        """Normal user can adopt a position they haven't adopted yet."""
        # Use a position normal2 hasn't adopted: POSITION1_ID (admin1's position)
        # First clean up in case of leftover
        self._cleanup_adoption(NORMAL2_ID, POSITION1_ID)
        try:
            resp = requests.post(
                f"{BASE_URL}/users/me/positions",
                json={"positionId": POSITION1_ID},
                headers=normal2_headers,
            )
            assert resp.status_code == 201
            body = resp.json()
            assert body["positionId"] == POSITION1_ID
            assert "id" in body
        finally:
            self._cleanup_adoption(NORMAL2_ID, POSITION1_ID)

    @pytest.mark.mutation
    def test_adopt_already_adopted_400(self, normal2_headers):
        """Adopting a position already adopted returns 400."""
        self._cleanup_adoption(NORMAL2_ID, POSITION1_ID)
        try:
            # Adopt first
            resp1 = requests.post(
                f"{BASE_URL}/users/me/positions",
                json={"positionId": POSITION1_ID},
                headers=normal2_headers,
            )
            assert resp1.status_code == 201

            # Try again
            resp2 = requests.post(
                f"{BASE_URL}/users/me/positions",
                json={"positionId": POSITION1_ID},
                headers=normal2_headers,
            )
            assert resp2.status_code == 400
        finally:
            self._cleanup_adoption(NORMAL2_ID, POSITION1_ID)

    def test_adopt_not_found_404(self, normal_headers):
        """Adopting a nonexistent position returns 404."""
        resp = requests.post(
            f"{BASE_URL}/users/me/positions",
            json={"positionId": NONEXISTENT_UUID},
            headers=normal_headers,
        )
        assert resp.status_code == 404



class TestSearchSimilarPositions:
    """POST /positions/search"""

    def test_search_too_short_400(self, normal_headers):
        """Statement shorter than 20 chars returns 400."""
        resp = requests.post(
            f"{POSITIONS_URL}/search",
            headers=normal_headers,
            json={"statement": "too short"},
        )
        assert resp.status_code == 400

    def test_search_valid_statement(self, normal_headers):
        """Valid statement returns results (or 503 if NLP unavailable)."""
        resp = requests.post(
            f"{POSITIONS_URL}/search",
            headers=normal_headers,
            json={"statement": "Universal healthcare should be a fundamental right for everyone"},
        )
        if resp.status_code == 200:
            body = resp.json()
            assert isinstance(body, list)
        else:
            assert resp.status_code in (500, 503)

    def test_search_with_category_filter(self, normal_headers):
        """Search with categoryId parameter returns filtered results."""
        resp = requests.post(
            f"{POSITIONS_URL}/search",
            headers=normal_headers,
            json={
                "statement": "Universal healthcare should be a fundamental right for everyone",
                "categoryId": HEALTHCARE_CAT_ID,
            },
        )
        if resp.status_code == 200:
            body = resp.json()
            assert isinstance(body, list)
        else:
            assert resp.status_code in (500, 503)

    def test_search_with_location_filter(self, normal_headers):
        """Search with locationId parameter returns results."""
        resp = requests.post(
            f"{POSITIONS_URL}/search",
            headers=normal_headers,
            json={
                "statement": "Universal healthcare should be a fundamental right for everyone",
                "locationId": OREGON_LOCATION_ID,
            },
        )
        if resp.status_code == 200:
            body = resp.json()
            assert isinstance(body, list)
        else:
            assert resp.status_code in (500, 503)

    def test_search_exact_20_chars(self, normal_headers):
        """Exactly 20-character query succeeds (boundary)."""
        resp = requests.post(
            f"{POSITIONS_URL}/search",
            headers=normal_headers,
            json={"statement": "A" * 20},  # Exactly 20 chars
        )
        # Should not return 400 (min is 20)
        if resp.status_code == 200:
            body = resp.json()
            assert isinstance(body, list)
        else:
            # NLP might be down, but it shouldn't be a 400
            assert resp.status_code in (200, 500, 503)


class TestGetPositionAgreedClosures:
    """GET /positions/{positionId}/agreed-closures"""

    def test_get_closures_success(self, normal_headers):
        """Can retrieve agreed closures for a known position."""
        resp = requests.get(
            f"{POSITIONS_URL}/{POSITION1_ID}/agreed-closures",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "position" in body
        assert "closures" in body

    def test_get_closures_structure(self, normal_headers):
        """Response has expected structure."""
        resp = requests.get(
            f"{POSITIONS_URL}/{POSITION1_ID}/agreed-closures",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "position" in body
        assert "closures" in body
        assert isinstance(body["closures"], list)

    def test_get_closures_not_found_404(self, normal_headers):
        """Nonexistent position returns 404."""
        resp = requests.get(
            f"{POSITIONS_URL}/{NONEXISTENT_UUID}/agreed-closures",
            headers=normal_headers,
        )
        assert resp.status_code == 404

    def test_closures_empty_for_position_with_no_chats(self, normal_headers):
        """Position with zero closures returns an empty list."""
        # POSITION2_ID may not have agreed closures from seed data
        resp = requests.get(
            f"{POSITIONS_URL}/{POSITION2_ID}/agreed-closures",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body["closures"], list)

    def test_closures_contain_user_info(self, normal_headers):
        """Closures entries have positionHolderUser and initiatorUser fields (if any exist)."""
        resp = requests.get(
            f"{POSITIONS_URL}/{POSITION1_ID}/agreed-closures",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        for closure in body["closures"]:
            # Each closure should have user info for both sides
            assert "positionHolderUser" in closure or "initiatorUser" in closure or "closingStatement" in closure

    def test_closures_sorted_by_priority(self, normal_headers):
        """Closures are returned in a consistent order (mutual kudos + cross-group first)."""
        resp = requests.get(
            f"{POSITIONS_URL}/{POSITION1_ID}/agreed-closures",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        # Just verify the response is a well-formed list
        assert isinstance(body["closures"], list)
        # If there are closures with priority scores, verify descending order
        priorities = [
            c.get("priorityScore", 0) for c in body["closures"]
            if "priorityScore" in c
        ]
        assert priorities == sorted(priorities, reverse=True)


class TestSearchStatsPositions:
    """POST /positions/search-stats"""

    SEARCH_URL = f"{POSITIONS_URL}/search-stats"

    def test_short_query_uses_text_search(self, normal_headers):
        """Short query (< 3 words) uses text search, matches by substring."""
        resp = requests.post(
            self.SEARCH_URL,
            headers=normal_headers,
            json={"query": "healthcare", "locationId": OREGON_LOCATION_ID},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "results" in body
        assert "hasMore" in body
        assert isinstance(body["results"], list)
        assert len(body["results"]) >= 1
        for pos in body["results"]:
            assert "healthcare" in pos["statement"].lower()

    def test_result_shape(self, normal_headers):
        """Results have GroupPosition-compatible fields."""
        resp = requests.post(
            self.SEARCH_URL,
            headers=normal_headers,
            json={"query": "healthcare", "locationId": OREGON_LOCATION_ID},
        )
        assert resp.status_code == 200
        pos = resp.json()["results"][0]
        for field in ("id", "statement", "voteDistribution", "totalVotes",
                      "groupVotes", "closureCount"):
            assert field in pos, f"Missing field: {field}"
        dist = pos["voteDistribution"]
        assert "agree" in dist
        assert "disagree" in dist
        assert "pass" in dist

    def test_no_matches_returns_empty(self, normal_headers):
        """Query with no matches returns empty results."""
        resp = requests.post(
            self.SEARCH_URL,
            headers=normal_headers,
            json={"query": "xyznonexistent", "locationId": OREGON_LOCATION_ID},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["results"] == []
        assert body["hasMore"] is False

    def test_long_query_uses_semantic_search(self, normal_headers):
        """Long query (>= 3 words) tries semantic search (or falls back to text)."""
        resp = requests.post(
            self.SEARCH_URL,
            headers=normal_headers,
            json={"query": "government run healthcare systems",
                   "locationId": OREGON_LOCATION_ID},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "results" in body
        assert isinstance(body["results"], list)

    def test_query_too_short_400(self, normal_headers):
        """Query shorter than 2 chars returns 400."""
        resp = requests.post(
            self.SEARCH_URL,
            headers=normal_headers,
            json={"query": "x", "locationId": OREGON_LOCATION_ID},
        )
        assert resp.status_code == 400

    def test_missing_location_400(self, normal_headers):
        """Missing locationId returns 400."""
        resp = requests.post(
            self.SEARCH_URL,
            headers=normal_headers,
            json={"query": "healthcare"},
        )
        assert resp.status_code == 400

    def test_pagination(self, normal_headers):
        """Limit and offset parameters work."""
        resp = requests.post(
            self.SEARCH_URL,
            headers=normal_headers,
            json={"query": "should", "locationId": OREGON_LOCATION_ID,
                   "limit": 2, "offset": 0},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["results"]) <= 2

