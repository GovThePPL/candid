"""Tests for GET /avatars endpoint."""

import requests
from conftest import BASE_URL

AVATARS_URL = f"{BASE_URL}/avatars"


class TestGetAvatars:
    """GET /avatars"""

    def test_returns_list(self, normal_headers):
        """Returns 200 with a list (may be empty since users upload their own)."""
        resp = requests.get(AVATARS_URL, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)

    def test_no_auth_required(self):
        """Avatars endpoint does not require authentication."""
        resp = requests.get(AVATARS_URL)
        # Should return 200 (public) or 401 if auth is required
        # Based on controller: get_available_avatars() has no auth decorator
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
