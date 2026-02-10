"""Tests for GET/PUT /users/me/settings."""
# Auth tests (test_unauthenticated_returns_401) live in test_auth_required.py.

import pytest
import requests
from conftest import BASE_URL, HEALTHCARE_CAT_ID, ECONOMY_CAT_ID, db_execute, NORMAL1_ID

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
        # Clean up any leftover weights from previous test runs
        db_execute(
            "DELETE FROM user_position_categories WHERE user_id = %s",
            (NORMAL1_ID,),
        )
        resp = requests.get(SETTINGS_URL, headers=normal_headers)
        assert resp.status_code == 200
        assert resp.json()["categoryWeights"] == []



class TestUpdateUserSettings:
    """PUT /users/me/settings"""

    @pytest.mark.mutation
    def test_set_weights_and_rollback(self, normal_headers):
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

        # Response uses snake_case keys (category_id) due to Model.to_dict()
        cat_id_key = "categoryId" if "categoryId" in weights[0] else "category_id"
        weight_map = {w[cat_id_key]: w["weight"] for w in weights}
        assert weight_map[HEALTHCARE_CAT_ID] == "most"
        assert weight_map[ECONOMY_CAT_ID] == "less"

        # Verify persistence via GET
        resp = requests.get(SETTINGS_URL, headers=normal_headers)
        assert resp.status_code == 200
        assert len(resp.json()["categoryWeights"]) == 2

        # Rollback to empty (use camelCase keys as the API expects)
        rollback = {"categoryWeights": []}
        resp = requests.put(SETTINGS_URL, headers=normal_headers, json=rollback)
        assert resp.status_code == 200
        assert resp.json()["categoryWeights"] == []

