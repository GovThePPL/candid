"""Tests for GET /positions/{positionId}, POST /positions, POST /positions/response."""

import pytest
import requests
from conftest import (
    BASE_URL,
    POSITION1_ID,
    POSITION2_ID,
    NONEXISTENT_UUID,
    HEALTHCARE_CAT_ID,
    OREGON_LOCATION_ID,
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

    def test_unauthenticated_returns_401(self):
        resp = requests.get(f"{POSITIONS_URL}/{POSITION1_ID}")
        assert resp.status_code == 401


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

    def test_unauthenticated_returns_401(self):
        payload = {
            "statement": "Should fail",
            "categoryId": HEALTHCARE_CAT_ID,
            "locationId": OREGON_LOCATION_ID,
        }
        resp = requests.post(POSITIONS_URL, json=payload)
        assert resp.status_code == 401


class TestRespondToPositions:
    """POST /positions/response"""

    @pytest.mark.mutation
    def test_respond_to_position(self, moderator_headers):
        """Submit a response to a position. The controller may not return a body."""
        payload = {
            "responses": [
                {"positionId": POSITION1_ID, "response": "agree"},
            ]
        }
        resp = requests.post(
            f"{POSITIONS_URL}/response",
            headers=moderator_headers,
            json=payload,
        )
        # Accept 200/201/204 since the controller has a partial implementation
        assert resp.status_code in (200, 201, 204)

    def test_unauthenticated_returns_401(self):
        payload = {
            "responses": [
                {"positionId": POSITION1_ID, "response": "agree"},
            ]
        }
        resp = requests.post(f"{POSITIONS_URL}/response", json=payload)
        assert resp.status_code == 401
