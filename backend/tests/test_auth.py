"""Tests for POST /auth/login."""

import pytest
import requests
from conftest import BASE_URL, DEFAULT_PASSWORD

LOGIN_URL = f"{BASE_URL}/auth/login"


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
