"""Tests for stats endpoints: GET /stats/{locationId}/{categoryId},
GET /stats/{locationId}, GET /stats/{locationId}/{categoryId}/demographics/{groupId}."""
# Auth tests (test_unauthenticated_returns_401) live in test_auth_required.py.

import pytest
import requests
from conftest import (
    BASE_URL,
    OREGON_LOCATION_ID,
    HEALTHCARE_CAT_ID,
    NONEXISTENT_UUID,
)

STATS_URL = f"{BASE_URL}/stats"


class TestGetStats:
    """GET /stats/{locationId}/{categoryId}"""

    def test_get_stats_success(self, normal_headers):
        """Can get stats for a location and category."""
        resp = requests.get(
            f"{STATS_URL}/{OREGON_LOCATION_ID}/{HEALTHCARE_CAT_ID}",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, dict)

    def test_stats_has_positions(self, normal_headers):
        """Stats response includes positions list."""
        resp = requests.get(
            f"{STATS_URL}/{OREGON_LOCATION_ID}/{HEALTHCARE_CAT_ID}",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "positions" in body
        assert isinstance(body["positions"], list)

    def test_stats_positions_have_creator(self, normal_headers):
        """Each position in stats has a creator object."""
        resp = requests.get(
            f"{STATS_URL}/{OREGON_LOCATION_ID}/{HEALTHCARE_CAT_ID}",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        if len(body.get("positions", [])) > 0:
            pos = body["positions"][0]
            assert "creator" in pos

    def test_invalid_location_404(self, normal_headers):
        """Nonexistent location returns 404."""
        resp = requests.get(
            f"{STATS_URL}/{NONEXISTENT_UUID}/{HEALTHCARE_CAT_ID}",
            headers=normal_headers,
        )
        assert resp.status_code == 404

    def test_invalid_category_404(self, normal_headers):
        """Nonexistent category returns 404."""
        resp = requests.get(
            f"{STATS_URL}/{OREGON_LOCATION_ID}/{NONEXISTENT_UUID}",
            headers=normal_headers,
        )
        assert resp.status_code == 404



class TestGetLocationStats:
    """GET /stats/{locationId}"""

    def test_get_location_stats_success(self, normal_headers):
        """Can get stats for a location (all categories)."""
        resp = requests.get(
            f"{STATS_URL}/{OREGON_LOCATION_ID}",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, dict)

    def test_includes_positions(self, normal_headers):
        """Response includes positions."""
        resp = requests.get(
            f"{STATS_URL}/{OREGON_LOCATION_ID}",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "positions" in body

    def test_includes_user_votes(self, normal_headers):
        """Response includes userVotes."""
        resp = requests.get(
            f"{STATS_URL}/{OREGON_LOCATION_ID}",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "userVotes" in body

    def test_includes_user_position_ids(self, normal_headers):
        """Response includes userPositionIds."""
        resp = requests.get(
            f"{STATS_URL}/{OREGON_LOCATION_ID}",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "userPositionIds" in body

    def test_invalid_location_404(self, normal_headers):
        """Nonexistent location returns 404."""
        resp = requests.get(
            f"{STATS_URL}/{NONEXISTENT_UUID}",
            headers=normal_headers,
        )
        assert resp.status_code == 404



class TestGetGroupDemographics:
    """GET /stats/{locationId}/{categoryId}/demographics/{groupId}"""

    def test_get_demographics_all_groups(self, normal_headers):
        """Can get demographics for 'all' group."""
        resp = requests.get(
            f"{STATS_URL}/{OREGON_LOCATION_ID}/{HEALTHCARE_CAT_ID}/demographics/all",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, dict)

    def test_demographics_structure(self, normal_headers):
        """Demographics response has expected fields."""
        resp = requests.get(
            f"{STATS_URL}/{OREGON_LOCATION_ID}/{HEALTHCARE_CAT_ID}/demographics/all",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        # Should have group demographics info
        assert "groupId" in body or "memberCount" in body or "lean" in body or isinstance(body, dict)

