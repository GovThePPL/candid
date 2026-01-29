"""Tests for authentication endpoints: POST /auth/login and POST /auth/register."""

import pytest
import requests
import uuid
from conftest import BASE_URL, DEFAULT_PASSWORD

LOGIN_URL = f"{BASE_URL}/auth/login"
REGISTER_URL = f"{BASE_URL}/auth/register"


class TestLoginValid:
    """Successful login scenarios."""

    @pytest.mark.smoke
    def test_login_admin(self):
        resp = requests.post(LOGIN_URL, json={"username": "admin1", "password": DEFAULT_PASSWORD})
        assert resp.status_code == 200
        body = resp.json()
        assert "token" in body
        assert len(body["token"]) > 0

    def test_login_normal(self):
        resp = requests.post(LOGIN_URL, json={"username": "normal1", "password": DEFAULT_PASSWORD})
        assert resp.status_code == 200
        assert "token" in resp.json()

    def test_login_moderator(self):
        resp = requests.post(LOGIN_URL, json={"username": "moderator1", "password": DEFAULT_PASSWORD})
        assert resp.status_code == 200
        assert "token" in resp.json()

    def test_login_returns_user_info(self):
        resp = requests.post(LOGIN_URL, json={"username": "admin1", "password": DEFAULT_PASSWORD})
        assert resp.status_code == 200
        body = resp.json()
        assert "token" in body


class TestLoginInvalid:
    """Failed login scenarios."""

    @pytest.mark.smoke
    def test_wrong_password(self):
        resp = requests.post(LOGIN_URL, json={"username": "admin1", "password": "wrongpassword"})
        assert resp.status_code == 401

    def test_nonexistent_user(self):
        resp = requests.post(LOGIN_URL, json={"username": "doesnotexist", "password": DEFAULT_PASSWORD})
        assert resp.status_code == 401

    def test_empty_password(self):
        resp = requests.post(LOGIN_URL, json={"username": "admin1", "password": ""})
        assert resp.status_code == 401

    def test_missing_username_field(self):
        resp = requests.post(LOGIN_URL, json={"password": DEFAULT_PASSWORD})
        assert resp.status_code in (400, 422)

    def test_missing_password_field(self):
        resp = requests.post(LOGIN_URL, json={"username": "admin1"})
        assert resp.status_code in (400, 422)

    def test_empty_body(self):
        resp = requests.post(LOGIN_URL, json={})
        assert resp.status_code in (400, 422)

    def test_guest_cannot_login(self):
        """Guest users have empty password hashes and shouldn't be able to login."""
        resp = requests.post(LOGIN_URL, json={"username": "guest1", "password": ""})
        assert resp.status_code == 401


class TestRegisterUser:
    """Tests for user registration endpoint."""

    def _unique_username(self):
        """Generate a unique username for testing."""
        return f"testuser_{uuid.uuid4().hex[:8]}"

    @pytest.mark.smoke
    def test_register_success(self):
        """New user created with 201 status."""
        username = self._unique_username()
        resp = requests.post(REGISTER_URL, json={
            "username": username,
            "displayName": "Test User",
            "password": "testpassword123"
        })
        assert resp.status_code == 201

    def test_register_returns_user_info(self):
        """Response contains expected user fields."""
        username = self._unique_username()
        resp = requests.post(REGISTER_URL, json={
            "username": username,
            "displayName": "Test User",
            "password": "testpassword123"
        })
        assert resp.status_code == 201
        body = resp.json()
        assert body["username"] == username
        assert body["displayName"] == "Test User"
        assert body["userType"] == "normal"
        assert body["status"] == "active"
        assert "id" in body

    def test_register_with_email(self):
        """Registration with optional email field."""
        username = self._unique_username()
        email = f"{username}@test.com"
        resp = requests.post(REGISTER_URL, json={
            "username": username,
            "displayName": "Test User",
            "password": "testpassword123",
            "email": email
        })
        assert resp.status_code == 201
        body = resp.json()
        assert body["email"] == email

    def test_duplicate_username_returns_400(self):
        """Username uniqueness is enforced."""
        username = self._unique_username()
        # First registration
        resp1 = requests.post(REGISTER_URL, json={
            "username": username,
            "displayName": "Test User 1",
            "password": "testpassword123"
        })
        assert resp1.status_code == 201
        # Second registration with same username
        resp2 = requests.post(REGISTER_URL, json={
            "username": username,
            "displayName": "Test User 2",
            "password": "testpassword456"
        })
        assert resp2.status_code == 400

    def test_duplicate_email_returns_400(self):
        """Email uniqueness is enforced."""
        email = f"test_{uuid.uuid4().hex[:8]}@test.com"
        # First registration
        resp1 = requests.post(REGISTER_URL, json={
            "username": self._unique_username(),
            "displayName": "Test User 1",
            "password": "testpassword123",
            "email": email
        })
        assert resp1.status_code == 201
        # Second registration with same email
        resp2 = requests.post(REGISTER_URL, json={
            "username": self._unique_username(),
            "displayName": "Test User 2",
            "password": "testpassword456",
            "email": email
        })
        assert resp2.status_code == 400

    def test_missing_username_returns_400(self):
        """Missing username field returns error."""
        resp = requests.post(REGISTER_URL, json={
            "displayName": "Test User",
            "password": "testpassword123"
        })
        assert resp.status_code in (400, 422)

    def test_missing_password_returns_400(self):
        """Missing password field returns error."""
        resp = requests.post(REGISTER_URL, json={
            "username": self._unique_username(),
            "displayName": "Test User"
        })
        assert resp.status_code in (400, 422)

    def test_missing_display_name_returns_400(self):
        """Missing displayName field returns error."""
        resp = requests.post(REGISTER_URL, json={
            "username": self._unique_username(),
            "password": "testpassword123"
        })
        assert resp.status_code in (400, 422)

    def test_registered_user_can_login(self):
        """Newly registered user can log in with their password."""
        username = self._unique_username()
        password = "testpassword123"
        # Register
        reg_resp = requests.post(REGISTER_URL, json={
            "username": username,
            "displayName": "Test User",
            "password": password
        })
        assert reg_resp.status_code == 201
        # Login
        login_resp = requests.post(LOGIN_URL, json={
            "username": username,
            "password": password
        })
        assert login_resp.status_code == 200
        assert "token" in login_resp.json()

    def test_existing_seeded_username_returns_400(self):
        """Cannot register with a username that already exists in seed data."""
        resp = requests.post(REGISTER_URL, json={
            "username": "admin1",
            "displayName": "Fake Admin",
            "password": "testpassword123"
        })
        assert resp.status_code == 400
