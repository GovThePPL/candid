"""Tests for GET/PUT/PATCH /users/me/demographics."""
# Auth tests (test_unauthenticated_returns_401) live in test_auth_required.py.

import pytest
import requests
from conftest import BASE_URL, OREGON_LOCATION_ID, DEM_PARTY_ID

DEMOGRAPHICS_URL = f"{BASE_URL}/users/me/demographics"

# Stable baseline used for rollback (uses valid enum values throughout)
_BASELINE = {
    "locationId": OREGON_LOCATION_ID,
    "lean": "conservative",
    "affiliation": DEM_PARTY_ID,
    "education": "high_school",
    "geoLocale": "rural",
    "race": "other",
    "sex": "other",
}


class TestGetUserDemographics:
    """GET /users/me/demographics"""

    @pytest.mark.smoke
    def test_get_demographics_no_data(self, normal_headers):
        """Seed data has no demographics, so expect 204 or empty response."""
        resp = requests.get(DEMOGRAPHICS_URL, headers=normal_headers)
        assert resp.status_code in (200, 204)



class TestUpdateUserDemographics:
    """PUT /users/me/demographics (full replace)"""

    @pytest.mark.mutation
    def test_put_demographics_and_rollback(self, admin_headers):
        # Set full demographics
        demographics = {
            "locationId": OREGON_LOCATION_ID,
            "lean": "moderate",
            "affiliation": DEM_PARTY_ID,
            "education": "bachelors",
            "geoLocale": "urban",
            "race": "white",
            "sex": "male",
        }
        resp = requests.put(DEMOGRAPHICS_URL, headers=admin_headers, json=demographics)
        assert resp.status_code == 200
        body = resp.json()
        assert body["lean"] == "moderate"
        assert body["education"] == "bachelors"
        assert body["geoLocale"] == "urban"

        # Verify via GET
        resp = requests.get(DEMOGRAPHICS_URL, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["lean"] == "moderate"

        # Rollback to baseline
        resp = requests.put(DEMOGRAPHICS_URL, headers=admin_headers, json=_BASELINE)
        assert resp.status_code == 200



class TestPartialUpdateDemographics:
    """PATCH /users/me/demographics (partial update)"""

    @pytest.mark.mutation
    def test_patch_single_field_and_rollback(self, admin_headers):
        # Set a known starting state via PUT
        base = {
            "locationId": OREGON_LOCATION_ID,
            "lean": "liberal",
            "affiliation": DEM_PARTY_ID,
            "education": "bachelors",
            "geoLocale": "suburban",
            "race": "asian",
            "sex": "female",
        }
        resp = requests.put(DEMOGRAPHICS_URL, headers=admin_headers, json=base)
        assert resp.status_code == 200

        # Patch just education
        resp = requests.patch(
            DEMOGRAPHICS_URL,
            headers=admin_headers,
            json={"education": "masters"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["education"] == "masters"
        # lean should be unchanged
        assert body["lean"] == "liberal"

        # Rollback to baseline
        resp = requests.put(DEMOGRAPHICS_URL, headers=admin_headers, json=_BASELINE)
        assert resp.status_code == 200

    def test_patch_empty_body_returns_400(self, admin_headers):
        resp = requests.patch(DEMOGRAPHICS_URL, headers=admin_headers, json={})
        assert resp.status_code == 400

