"""Tests for GET/PUT /users/me/settings."""

import pytest
import requests
from conftest import BASE_URL, HEALTHCARE_CAT_ID, ECONOMY_CAT_ID

SETTINGS_URL = f"{BASE_URL}/users/me/settings"


class TestGetUserSettings:
    """GET /users/me/settings"""

    @pytest.mark.smoke
    def test_get_settings(self, normal_headers):
        resp = requests.get(SETTINGS_URL, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert "categoryWeights" in body

    def test_default_empty_weights(self, normal_headers):
        """Seed data has no user_position_categories, so weights should be empty."""
        resp = requests.get(SETTINGS_URL, headers=normal_headers)
        assert resp.status_code == 200
        assert resp.json()["categoryWeights"] == []

    def test_unauthenticated_returns_401(self):
        resp = requests.get(SETTINGS_URL)
        assert resp.status_code == 401


class TestUpdateUserSettings:
    """PUT /users/me/settings"""

    @pytest.mark.mutation
    def test_set_weights_and_rollback(self, normal_headers):
        # Save original
        original = requests.get(SETTINGS_URL, headers=normal_headers).json()

        # Set new weights
        new_settings = {
            "categoryWeights": [
                {"categoryId": HEALTHCARE_CAT_ID, "weight": "most"},
                {"categoryId": ECONOMY_CAT_ID, "weight": "less"},
            ]
        }
        resp = requests.put(SETTINGS_URL, headers=normal_headers, json=new_settings)
        assert resp.status_code == 200
        body = resp.json()
        weights = body["categoryWeights"]
        assert len(weights) == 2

        weight_map = {w["categoryId"]: w["weight"] for w in weights}
        assert weight_map[HEALTHCARE_CAT_ID] == "most"
        assert weight_map[ECONOMY_CAT_ID] == "less"

        # Verify persistence via GET
        resp = requests.get(SETTINGS_URL, headers=normal_headers)
        assert resp.status_code == 200
        assert len(resp.json()["categoryWeights"]) == 2

        # Rollback to original (empty)
        resp = requests.put(SETTINGS_URL, headers=normal_headers, json=original)
        assert resp.status_code == 200
        assert resp.json()["categoryWeights"] == []

    def test_unauthenticated_returns_401(self):
        resp = requests.put(SETTINGS_URL, json={"categoryWeights": []})
        assert resp.status_code == 401
