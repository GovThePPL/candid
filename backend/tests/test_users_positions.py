"""Tests for GET /users/me/positions."""

import pytest
import requests
from conftest import BASE_URL

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
        for field in ("id", "positionId", "status", "statement", "categoryId"):
            assert field in pos, f"Missing field: {field}"

    def test_admin_has_positions(self, admin_headers):
        resp = requests.get(POSITIONS_URL, headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()) > 0

    def test_unauthenticated_returns_401(self):
        resp = requests.get(POSITIONS_URL)
        assert resp.status_code == 401
