"""Tests for GET/PATCH /users/me/settings."""
# Auth tests (test_unauthenticated_returns_401) live in test_auth_required.py.

import pytest
import requests
from conftest import BASE_URL, HEALTHCARE_SESSION_ID, ECONOMY_SESSION_ID, db_execute, NORMAL1_ID

SETTINGS_URL = f"{BASE_URL}/users/me/settings"


class TestGetUserSettings:
    """GET /users/me/settings"""

    @pytest.mark.smoke
    def test_get_settings(self, normal_headers):
        resp = requests.get(SETTINGS_URL, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert "sessionWeights" in body

    def test_default_empty_weights(self, normal_headers):
        """Seed data has no user_session_preferences, so weights should be empty."""
        # Clean up any leftover weights from previous test runs
        db_execute(
            "DELETE FROM user_session_preferences WHERE user_id = %s",
            (NORMAL1_ID,),
        )
        resp = requests.get(SETTINGS_URL, headers=normal_headers)
        assert resp.status_code == 200
        assert resp.json()["sessionWeights"] == []



class TestUpdateUserSettings:
    """PATCH /users/me/settings"""

    @pytest.mark.mutation
    def test_set_weights_and_rollback(self, normal_headers):
        # Set new weights
        new_settings = {
            "sessionWeights": [
                {"sessionId": HEALTHCARE_SESSION_ID, "weight": "most"},
                {"sessionId": ECONOMY_SESSION_ID, "weight": "less"},
            ]
        }
        resp = requests.patch(SETTINGS_URL, headers=normal_headers, json=new_settings)
        assert resp.status_code == 200
        body = resp.json()
        weights = body["sessionWeights"]
        assert len(weights) == 2

        # Response uses snake_case keys (session_id) due to Model.to_dict()
        sess_id_key = "sessionId" if "sessionId" in weights[0] else "session_id"
        weight_map = {w[sess_id_key]: w["weight"] for w in weights}
        assert weight_map[HEALTHCARE_SESSION_ID] == "most"
        assert weight_map[ECONOMY_SESSION_ID] == "less"

        # Verify persistence via GET
        resp = requests.get(SETTINGS_URL, headers=normal_headers)
        assert resp.status_code == 200
        assert len(resp.json()["sessionWeights"]) == 2

        # Rollback to empty (use camelCase keys as the API expects)
        rollback = {"sessionWeights": []}
        resp = requests.patch(SETTINGS_URL, headers=normal_headers, json=rollback)
        assert resp.status_code == 200
        assert resp.json()["sessionWeights"] == []

