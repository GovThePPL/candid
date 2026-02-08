"""Tests for GET /users/me/positions, PATCH /users/me/positions/{id},
DELETE /users/me/positions/{id}, GET /users/me/positions/metadata."""

import pytest
import requests
from conftest import (
    BASE_URL,
    POSITION2_ID,
    NONEXISTENT_UUID,
    NORMAL1_ID,
    NORMAL2_ID,
    USER_POSITION_NORMAL1,
    USER_POSITION_NORMAL2,
    db_execute,
    db_query_one,
)

POSITIONS_URL = f"{BASE_URL}/users/me/positions"


class TestGetCurrentUserPositions:
    """GET /users/me/positions"""

    @pytest.mark.smoke
    def test_get_positions_returns_list(self, normal_headers):
        resp = requests.get(POSITIONS_URL, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) > 0

    def test_position_has_expected_fields(self, normal_headers):
        resp = requests.get(POSITIONS_URL, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) > 0
        pos = body[0]
        for field in ("id", "positionId", "status", "statement", "categoryId",
                      "locationName", "locationCode", "categoryName"):
            assert field in pos, f"Missing field: {field}"

    def test_admin_has_positions(self, admin_headers):
        resp = requests.get(POSITIONS_URL, headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()) > 0

    def test_unauthenticated_returns_401(self):
        resp = requests.get(POSITIONS_URL)
        assert resp.status_code == 401


class TestUpdateUserPosition:
    """PATCH /users/me/positions/{userPositionId}"""

    def _get_status(self, user_position_id):
        """Get current status of a user_position."""
        row = db_query_one(
            "SELECT status FROM user_position WHERE id = %s",
            (user_position_id,),
        )
        return row["status"] if row else None

    def _restore_status(self, user_position_id, status):
        """Restore a user_position to a specific status."""
        db_execute(
            "UPDATE user_position SET status = %s WHERE id = %s",
            (status, user_position_id),
        )

    @pytest.mark.mutation
    def test_toggle_inactive(self, normal_headers):
        """Can set a user position to inactive."""
        original = self._get_status(USER_POSITION_NORMAL1)
        try:
            resp = requests.patch(
                f"{POSITIONS_URL}/{USER_POSITION_NORMAL1}",
                headers=normal_headers,
                json={"status": "inactive"},
            )
            assert resp.status_code == 200
        finally:
            self._restore_status(USER_POSITION_NORMAL1, original)

    @pytest.mark.mutation
    def test_toggle_back_active(self, normal_headers):
        """Can set a user position back to active."""
        original = self._get_status(USER_POSITION_NORMAL1)
        try:
            # First set to inactive
            requests.patch(
                f"{POSITIONS_URL}/{USER_POSITION_NORMAL1}",
                headers=normal_headers,
                json={"status": "inactive"},
            )
            # Then back to active
            resp = requests.patch(
                f"{POSITIONS_URL}/{USER_POSITION_NORMAL1}",
                headers=normal_headers,
                json={"status": "active"},
            )
            assert resp.status_code == 200
        finally:
            self._restore_status(USER_POSITION_NORMAL1, original)

    def test_invalid_status_400(self, normal_headers):
        """Invalid status value returns 400."""
        resp = requests.patch(
            f"{POSITIONS_URL}/{USER_POSITION_NORMAL1}",
            headers=normal_headers,
            json={"status": "bogus"},
        )
        assert resp.status_code == 400

    def test_other_users_position_404(self, normal_headers):
        """Cannot update another user's position."""
        resp = requests.patch(
            f"{POSITIONS_URL}/{USER_POSITION_NORMAL2}",
            headers=normal_headers,
            json={"status": "inactive"},
        )
        assert resp.status_code == 404

    def test_unauthenticated(self):
        """Unauthenticated request returns 401."""
        resp = requests.patch(
            f"{POSITIONS_URL}/{USER_POSITION_NORMAL1}",
            json={"status": "inactive"},
        )
        assert resp.status_code == 401


class TestDeleteUserPosition:
    """DELETE /users/me/positions/{userPositionId}"""

    @pytest.fixture
    def adopted_position(self, normal2_headers):
        """Adopt a position for normal2 to delete in the test."""
        # Clean up first
        db_execute(
            "DELETE FROM response WHERE user_id = %s AND position_id = %s",
            (NORMAL2_ID, POSITION2_ID),
        )
        # Create adoption via API
        resp = requests.post(
            f"{BASE_URL}/positions/{POSITION2_ID}/adopt",
            headers=normal2_headers,
        )
        if resp.status_code == 201:
            yield resp.json()["id"]
        elif resp.status_code == 400:
            # Already adopted — find the user_position
            row = db_query_one(
                "SELECT id FROM user_position WHERE user_id = %s AND position_id = %s AND status != 'deleted'",
                (NORMAL2_ID, POSITION2_ID),
            )
            yield str(row["id"]) if row else None
        else:
            yield None
        # Cleanup: hard delete
        db_execute(
            "DELETE FROM user_position WHERE user_id = %s AND position_id = %s AND status = 'deleted'",
            (NORMAL2_ID, POSITION2_ID),
        )

    @pytest.mark.mutation
    def test_delete_returns_204(self, normal2_headers, adopted_position):
        """Deleting own user_position returns 204."""
        assert adopted_position is not None
        resp = requests.delete(
            f"{POSITIONS_URL}/{adopted_position}",
            headers=normal2_headers,
        )
        assert resp.status_code in (200, 204)

    def test_delete_other_user_404(self, normal_headers):
        """Cannot delete another user's position."""
        resp = requests.delete(
            f"{POSITIONS_URL}/{USER_POSITION_NORMAL2}",
            headers=normal_headers,
        )
        assert resp.status_code == 404

    def test_unauthenticated(self):
        """Unauthenticated request returns 401."""
        resp = requests.delete(
            f"{POSITIONS_URL}/{USER_POSITION_NORMAL1}",
        )
        assert resp.status_code == 401


class TestPositionsMetadata:
    """GET /users/me/positions/metadata"""

    def test_get_metadata_success(self, normal_headers):
        """Returns metadata with count and lastUpdatedTime."""
        resp = requests.get(
            f"{POSITIONS_URL}/metadata",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "count" in body
        assert isinstance(body["count"], int)
        assert body["count"] > 0

    def test_unauthenticated(self):
        """Unauthenticated request returns 401."""
        resp = requests.get(f"{POSITIONS_URL}/metadata")
        assert resp.status_code == 401
