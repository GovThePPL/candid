"""Tests for location endpoints: GET /users/me/locations, GET /locations, PUT /users/me/locations."""

import pytest
import requests
from conftest import (
    BASE_URL,
    OREGON_LOCATION_ID,
    NONEXISTENT_UUID,
    NORMAL1_ID,
    db_execute,
    db_query,
)

LOCATIONS_URL = f"{BASE_URL}/locations"
USER_LOCATIONS_URL = f"{BASE_URL}/users/me/locations"


class TestGetUserLocations:
    """GET /users/me/locations"""

    def test_get_locations_returns_list(self, normal_headers):
        """Authenticated user can get their locations."""
        resp = requests.get(USER_LOCATIONS_URL, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) > 0
        loc = body[0]
        assert "id" in loc
        assert "name" in loc

    def test_unauthenticated(self):
        """Unauthenticated request returns 401."""
        resp = requests.get(USER_LOCATIONS_URL)
        assert resp.status_code == 401


class TestGetAllLocations:
    """GET /locations"""

    def test_get_all_locations_returns_list(self, normal_headers):
        """Returns a list of all locations."""
        resp = requests.get(LOCATIONS_URL, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) > 0

    def test_locations_include_oregon(self, normal_headers):
        """Locations include Oregon from seed data."""
        resp = requests.get(LOCATIONS_URL, headers=normal_headers)
        assert resp.status_code == 200
        names = [loc["name"] for loc in resp.json()]
        assert "Oregon" in names

    def test_locations_have_expected_fields(self, normal_headers):
        """Each location has id, name, and code."""
        resp = requests.get(LOCATIONS_URL, headers=normal_headers)
        assert resp.status_code == 200
        for loc in resp.json():
            assert "id" in loc
            assert "name" in loc
            assert "code" in loc

    def test_unauthenticated(self):
        """Unauthenticated request returns 401."""
        resp = requests.get(LOCATIONS_URL)
        assert resp.status_code == 401


class TestSetUserLocation:
    """PUT /users/me/locations"""

    def _save_user_locations(self, user_id):
        """Save current user_location rows."""
        return db_query(
            "SELECT location_id FROM user_location WHERE user_id = %s",
            (user_id,),
        )

    def _restore_user_locations(self, user_id, saved):
        """Restore user_location rows."""
        db_execute("DELETE FROM user_location WHERE user_id = %s", (user_id,))
        for row in saved:
            db_execute(
                "INSERT INTO user_location (user_id, location_id) VALUES (%s, %s)",
                (user_id, row["location_id"]),
            )

    @pytest.mark.mutation
    def test_set_location_success(self, normal_headers):
        """Can set user location."""
        saved = self._save_user_locations(NORMAL1_ID)
        try:
            resp = requests.put(
                USER_LOCATIONS_URL,
                headers=normal_headers,
                json={"locationId": OREGON_LOCATION_ID},
            )
            assert resp.status_code == 200
        finally:
            self._restore_user_locations(NORMAL1_ID, saved)

    def test_invalid_location_400(self, normal_headers):
        """Setting a nonexistent location returns 400."""
        resp = requests.put(
            USER_LOCATIONS_URL,
            headers=normal_headers,
            json={"locationId": NONEXISTENT_UUID},
        )
        assert resp.status_code in (400, 404)

    def test_missing_location_id_400(self, normal_headers):
        """Missing locationId returns 400."""
        resp = requests.put(
            USER_LOCATIONS_URL,
            headers=normal_headers,
            json={},
        )
        assert resp.status_code == 400

    def test_unauthenticated(self):
        """Unauthenticated request returns 401."""
        resp = requests.put(
            USER_LOCATIONS_URL,
            json={"locationId": OREGON_LOCATION_ID},
        )
        assert resp.status_code == 401
