"""Tests for Keycloak-based authentication.

Verifies that the API accepts valid Keycloak ROPC tokens, rejects
invalid/expired tokens, and that the registration endpoint works.
"""

import pytest
import requests
from conftest import BASE_URL, KEYCLOAK_URL, KEYCLOAK_REALM, DEFAULT_PASSWORD, login, auth_header


class TestKeycloakTokenAccepted:
    """Valid Keycloak tokens are accepted by the API."""

    @pytest.mark.smoke
    def test_admin_token_accepted(self):
        token = login("admin1")
        resp = requests.get(f"{BASE_URL}/users/me", headers=auth_header(token))
        assert resp.status_code == 200
        body = resp.json()
        assert body["username"] == "admin1"

    def test_normal_token_accepted(self):
        token = login("normal1")
        resp = requests.get(f"{BASE_URL}/users/me", headers=auth_header(token))
        assert resp.status_code == 200
        assert resp.json()["username"] == "normal1"

    def test_moderator_token_accepted(self):
        token = login("moderator1")
        resp = requests.get(f"{BASE_URL}/users/me", headers=auth_header(token))
        assert resp.status_code == 200
        assert resp.json()["username"] == "moderator1"


class TestInvalidTokenRejected:
    """Invalid tokens are rejected with 401."""

    @pytest.mark.smoke
    def test_no_token_returns_401(self):
        resp = requests.get(f"{BASE_URL}/users/me")
        assert resp.status_code == 401

    def test_garbage_token_returns_401(self):
        resp = requests.get(f"{BASE_URL}/users/me",
                            headers=auth_header("not-a-valid-token"))
        assert resp.status_code == 401

    def test_expired_hs256_token_returns_401(self):
        """Old HS256 tokens from the legacy auth system are rejected."""
        # This is a structurally valid HS256 JWT but not signed by Keycloak
        fake_hs256 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
        resp = requests.get(f"{BASE_URL}/users/me",
                            headers=auth_header(fake_hs256))
        assert resp.status_code == 401


class TestOldEndpointsRemoved:
    """Legacy auth endpoints should return 404."""

    def test_login_endpoint_removed(self):
        resp = requests.post(f"{BASE_URL}/auth/login",
                             json={"username": "admin1", "password": DEFAULT_PASSWORD})
        assert resp.status_code == 404

    def test_google_login_removed(self):
        resp = requests.post(f"{BASE_URL}/auth/social/google",
                             json={"token": "fake"})
        assert resp.status_code == 404

    def test_facebook_login_removed(self):
        resp = requests.post(f"{BASE_URL}/auth/social/facebook",
                             json={"token": "fake"})
        assert resp.status_code == 404

    def test_change_password_removed(self):
        resp = requests.put(f"{BASE_URL}/users/me/password",
                            json={"currentPassword": "x", "newPassword": "y"})
        assert resp.status_code == 404


def _cleanup_keycloak_user(username):
    """Delete a test user from Keycloak via Admin REST API."""
    # Get admin token via service account
    token_url = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token"
    resp = requests.post(token_url, data={
        "grant_type": "client_credentials",
        "client_id": "candid-backend",
        "client_secret": "candid-backend-secret",
    })
    if resp.status_code != 200:
        return
    admin_token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Find user by username
    base = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}"
    resp = requests.get(f"{base}/users", params={"username": username, "exact": "true"},
                        headers=headers)
    if resp.status_code != 200 or not resp.json():
        return

    user_id = resp.json()[0]["id"]
    requests.delete(f"{base}/users/{user_id}", headers=headers)


class TestTokenEndpoint:
    """POST /auth/token proxies ROPC to Keycloak."""

    def test_valid_credentials(self):
        resp = requests.post(f"{BASE_URL}/auth/token", json={
            "username": "admin1",
            "password": DEFAULT_PASSWORD,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert "refresh_token" in body

    def test_invalid_password(self):
        resp = requests.post(f"{BASE_URL}/auth/token", json={
            "username": "admin1",
            "password": "wrongpassword",
        })
        assert resp.status_code == 401

    def test_missing_fields(self):
        resp = requests.post(f"{BASE_URL}/auth/token", json={
            "username": "admin1",
        })
        assert resp.status_code == 400


class TestRegistration:
    """POST /auth/register creates users via Keycloak Admin API."""

    TEST_USERNAME = "test_reg_user"
    TEST_EMAIL = "test_reg@example.com"
    TEST_PASSWORD = "testpassword123"

    @pytest.fixture(autouse=True)
    def cleanup(self):
        """Remove test user before and after each test."""
        _cleanup_keycloak_user(self.TEST_USERNAME)
        yield
        _cleanup_keycloak_user(self.TEST_USERNAME)

    def test_register_success(self):
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "username": self.TEST_USERNAME,
            "email": self.TEST_EMAIL,
            "password": self.TEST_PASSWORD,
        })
        assert resp.status_code == 201
        assert resp.json()["message"] == "User created"

        # Verify the user can log in via ROPC
        token = login(self.TEST_USERNAME, self.TEST_PASSWORD)
        assert token

    def test_register_missing_username(self):
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "email": self.TEST_EMAIL,
            "password": self.TEST_PASSWORD,
        })
        assert resp.status_code == 400

    def test_register_missing_email(self):
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "username": self.TEST_USERNAME,
            "password": self.TEST_PASSWORD,
        })
        assert resp.status_code == 400

    def test_register_short_password(self):
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "username": self.TEST_USERNAME,
            "email": self.TEST_EMAIL,
            "password": "short",
        })
        assert resp.status_code == 400
        assert "too short" in resp.json()["detail"]

    def test_register_duplicate_returns_409(self):
        # Create the user first
        requests.post(f"{BASE_URL}/auth/register", json={
            "username": self.TEST_USERNAME,
            "email": self.TEST_EMAIL,
            "password": self.TEST_PASSWORD,
        })
        # Try to create the same user again
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "username": self.TEST_USERNAME,
            "email": "different@example.com",
            "password": self.TEST_PASSWORD,
        })
        assert resp.status_code == 409
