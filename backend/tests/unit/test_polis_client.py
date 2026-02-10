"""Unit tests for polis_client.py — Polis API client."""

import pytest
from unittest.mock import patch, MagicMock, PropertyMock
import requests.exceptions

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# PolisClient._get_admin_token
# ---------------------------------------------------------------------------

class TestGetAdminToken:
    def test_caches_token(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"access_token": "admin-tok"}

        mock_post = MagicMock(return_value=mock_resp)
        with patch.object(client.session, "post", mock_post):
            tok1 = client._get_admin_token()
            tok2 = client._get_admin_token()

            assert tok1 == "admin-tok"
            assert tok2 == "admin-tok"
            # post should only be called once (cached)
            mock_post.assert_called_once()

    def test_auth_failure_raises(self):
        from candid.controllers.helpers.polis_client import PolisClient, PolisAuthError
        client = PolisClient()

        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.text = "Unauthorized"

        with patch.object(client.session, "post", return_value=mock_resp):
            with pytest.raises(PolisAuthError):
                client._get_admin_token()

    def test_connection_error_raises(self):
        from candid.controllers.helpers.polis_client import PolisClient, PolisAuthError
        client = PolisClient()

        with patch.object(client.session, "post",
                          side_effect=requests.exceptions.ConnectionError("down")):
            with pytest.raises(PolisAuthError):
                client._get_admin_token()


# ---------------------------------------------------------------------------
# PolisClient._request — HTTP error handling
# ---------------------------------------------------------------------------

class TestRequest:
    def test_401_raises_auth_error(self):
        from candid.controllers.helpers.polis_client import PolisClient, PolisAuthError
        client = PolisClient()

        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.text = "Unauthorized"

        with patch.object(client.session, "request", return_value=mock_resp):
            with pytest.raises(PolisAuthError):
                client._request("GET", "/test")

    def test_connection_error_raises_unavailable(self):
        from candid.controllers.helpers.polis_client import PolisClient, PolisUnavailableError
        client = PolisClient()

        with patch.object(client.session, "request",
                          side_effect=requests.exceptions.ConnectionError("down")):
            with pytest.raises(PolisUnavailableError):
                client._request("GET", "/test")

    def test_timeout_raises_unavailable(self):
        from candid.controllers.helpers.polis_client import PolisClient, PolisUnavailableError
        client = PolisClient()

        with patch.object(client.session, "request",
                          side_effect=requests.exceptions.Timeout("timeout")):
            with pytest.raises(PolisUnavailableError):
                client._request("GET", "/test")

    def test_success_returns_json(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'{"ok": true}'
        mock_resp.json.return_value = {"ok": True}
        mock_resp.raise_for_status = MagicMock()

        with patch.object(client.session, "request", return_value=mock_resp):
            result = client._request("GET", "/test")
            assert result == {"ok": True}

    def test_empty_response_returns_empty_dict(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()

        mock_resp = MagicMock()
        mock_resp.status_code = 204
        mock_resp.content = b""
        mock_resp.raise_for_status = MagicMock()

        with patch.object(client.session, "request", return_value=mock_resp):
            result = client._request("GET", "/test")
            assert result == {}


# ---------------------------------------------------------------------------
# PolisClient._get_xid_token
# ---------------------------------------------------------------------------

class TestGetXidToken:
    def test_invalid_xid_format(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()
        # XID without "candid:" prefix is invalid
        result = client._get_xid_token("conv-123", "bad-format")
        assert result == ""

    def test_memory_cache_hit(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()
        # Seed in-memory cache
        client._xid_tokens["conv-1"] = {"candid:user-1": "cached-token"}
        result = client._get_xid_token("conv-1", "candid:user-1")
        assert result == "cached-token"

    def test_xid_format(self):
        """XID should be 'candid:{uuid}'."""
        user_id = "abc-123"
        xid = f"candid:{user_id}"
        assert xid == "candid:abc-123"
        assert xid.replace("candid:", "") == user_id


# ---------------------------------------------------------------------------
# PolisClient.clear_user_token
# ---------------------------------------------------------------------------

class TestClearUserToken:
    def test_clears_specific_conversation(self):
        from candid.controllers.helpers.polis_client import PolisClient
        mock_db = MagicMock()

        with patch("candid.controllers.helpers.polis_client.db", mock_db):
            client = PolisClient()
            client._xid_tokens["conv-1"] = {"candid:user-1": "tok"}
            client._xid_tokens["conv-2"] = {"candid:user-1": "tok2"}

            result = client.clear_user_token("user-1", "conv-1")
            assert result is True
            assert "candid:user-1" not in client._xid_tokens.get("conv-1", {})
            assert "candid:user-1" in client._xid_tokens["conv-2"]

    def test_clears_all_conversations(self):
        from candid.controllers.helpers.polis_client import PolisClient
        mock_db = MagicMock()

        with patch("candid.controllers.helpers.polis_client.db", mock_db):
            client = PolisClient()
            client._xid_tokens["conv-1"] = {"candid:user-1": "tok1"}
            client._xid_tokens["conv-2"] = {"candid:user-1": "tok2"}

            result = client.clear_user_token("user-1")
            assert result is True
            assert "candid:user-1" not in client._xid_tokens.get("conv-1", {})
            assert "candid:user-1" not in client._xid_tokens.get("conv-2", {})


# ---------------------------------------------------------------------------
# PolisClient error classes
# ---------------------------------------------------------------------------

class TestPolisErrors:
    def test_polis_error(self):
        from candid.controllers.helpers.polis_client import PolisError
        err = PolisError("test error", status_code=500)
        assert str(err) == "test error"
        assert err.status_code == 500

    def test_unavailable_error(self):
        from candid.controllers.helpers.polis_client import PolisUnavailableError
        err = PolisUnavailableError("down")
        assert "down" in str(err)

    def test_auth_error(self):
        from candid.controllers.helpers.polis_client import PolisAuthError
        err = PolisAuthError("bad creds", 401)
        assert err.status_code == 401
