"""Unit tests for polis_client.py — Polis API client.

NOTE: The following low-value tests were intentionally removed:
- TestPolisErrors (exception constructors — testing Python's Exception class)
- TestGetClient (singleton pattern — testing module-level variable assignment)
- test_xid_format (string concatenation — no code path exercised)
- test_403_raises_auth_error (redundant with test_401_raises_auth_error — same branch)
- test_auth_token_sets_header (mock wiring — verifies dict assignment, not logic)
"""

import pytest
from datetime import datetime, timezone, timedelta
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
        mock_resp.json.return_value = {"access_token": "admin-tok", "expires_in": 300}

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

    def test_expired_token_refetches(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()
        # Pre-set an expired token
        client._admin_token = "old-token"
        client._admin_token_expires_at = datetime.now(timezone.utc) - timedelta(seconds=60)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"access_token": "new-token", "expires_in": 300}

        with patch.object(client.session, "post", return_value=mock_resp) as mock_post:
            tok = client._get_admin_token()
            assert tok == "new-token"
            mock_post.assert_called_once()

    def test_stores_expires_at(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"access_token": "tok", "expires_in": 600}

        before = datetime.now(timezone.utc)
        with patch.object(client.session, "post", return_value=mock_resp):
            client._get_admin_token()
        after = datetime.now(timezone.utc)

        assert client._admin_token_expires_at is not None
        expected_min = before + timedelta(seconds=600)
        expected_max = after + timedelta(seconds=600)
        assert expected_min <= client._admin_token_expires_at <= expected_max


# ---------------------------------------------------------------------------
# PolisClient._clear_admin_token
# ---------------------------------------------------------------------------

class TestClearAdminToken:
    def test_clears_token_and_expiry(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()
        client._admin_token = "some-token"
        client._admin_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=300)

        client._clear_admin_token()

        assert client._admin_token is None
        assert client._admin_token_expires_at is None


# ---------------------------------------------------------------------------
# PolisClient._admin_request
# ---------------------------------------------------------------------------

class TestAdminRequest:
    def _make_client_with_token(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()
        client._admin_token = "valid-token"
        client._admin_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=300)
        return client

    def test_retries_on_401(self):
        from candid.controllers.helpers.polis_client import PolisClient, PolisAuthError
        client = self._make_client_with_token()

        call_count = [0]
        def mock_request(method, endpoint, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                raise PolisAuthError("Authentication failed", 401)
            else:
                return {"ok": True}

        # Mock _get_admin_token to return fresh tokens and track calls
        token_calls = [0]
        def mock_get_token():
            token_calls[0] += 1
            client._admin_token = f"token-{token_calls[0]}"
            client._admin_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=300)
            return client._admin_token

        with patch.object(client, "_request", side_effect=mock_request):
            with patch.object(client, "_get_admin_token", side_effect=mock_get_token):
                result = client._admin_request("GET", "/test")
                assert result == {"ok": True}
                assert token_calls[0] == 2  # initial + retry

    def test_gives_up_after_retry(self):
        from candid.controllers.helpers.polis_client import PolisClient, PolisAuthError
        client = self._make_client_with_token()

        def mock_request(method, endpoint, **kwargs):
            raise PolisAuthError("Authentication failed", 401)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"access_token": "new-tok", "expires_in": 300}

        with patch.object(client, "_request", side_effect=mock_request):
            with patch.object(client.session, "post", return_value=mock_resp):
                with pytest.raises(PolisAuthError):
                    client._admin_request("GET", "/test")

    def test_no_retry_on_other_errors(self):
        from candid.controllers.helpers.polis_client import PolisClient, PolisError
        client = self._make_client_with_token()

        def mock_request(method, endpoint, **kwargs):
            raise PolisError("Server error", status_code=500)

        with patch.object(client, "_request", side_effect=mock_request):
            with pytest.raises(PolisError, match="Server error"):
                client._admin_request("GET", "/test")


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
# PolisClient.create_conversation
# ---------------------------------------------------------------------------

class TestCreateConversation:
    def test_success_extracts_conversation_id_from_url(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()
        client._admin_token = "admin-tok"
        client._admin_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=300)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'{"url": "https://polis.example.com/conv-abc"}'
        mock_resp.json.return_value = {"url": "https://polis.example.com/conv-abc"}
        mock_resp.raise_for_status = MagicMock()

        with patch.object(client.session, "request", return_value=mock_resp):
            result = client.create_conversation("Topic", "Description")
            assert result == "conv-abc"

    def test_success_falls_back_to_conversation_id_field(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()
        client._admin_token = "admin-tok"
        client._admin_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=300)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'{"conversation_id": "conv-xyz"}'
        mock_resp.json.return_value = {"conversation_id": "conv-xyz"}
        mock_resp.raise_for_status = MagicMock()

        with patch.object(client.session, "request", return_value=mock_resp):
            result = client.create_conversation("Topic", "Desc")
            assert result == "conv-xyz"

    def test_no_conversation_id_raises(self):
        from candid.controllers.helpers.polis_client import PolisClient, PolisError
        client = PolisClient()
        client._admin_token = "admin-tok"
        client._admin_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=300)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'{}'
        mock_resp.json.return_value = {}
        mock_resp.raise_for_status = MagicMock()

        with patch.object(client.session, "request", return_value=mock_resp):
            with pytest.raises(PolisError, match="No conversation_id"):
                client.create_conversation("Topic", "Desc")

    def test_auth_failure_propagates(self):
        from candid.controllers.helpers.polis_client import PolisClient, PolisAuthError
        client = PolisClient()

        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.text = "Unauthorized"

        with patch.object(client.session, "post", return_value=mock_resp):
            with pytest.raises(PolisAuthError):
                client.create_conversation("Topic", "Desc")


# ---------------------------------------------------------------------------
# PolisClient.create_comment
# ---------------------------------------------------------------------------

class TestCreateComment:
    def test_success_returns_tid(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()
        # Pre-seed XID token to skip participationInit
        client._xid_tokens["conv-1"] = {"candid:user-1": "xid-tok"}

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'{"tid": 42}'
        mock_resp.json.return_value = {"tid": 42}
        mock_resp.raise_for_status = MagicMock()

        with patch.object(client.session, "request", return_value=mock_resp):
            result = client.create_comment("conv-1", "test comment", "candid:user-1")
            assert result == 42

    def test_duplicate_409_looks_up_existing(self):
        from candid.controllers.helpers.polis_client import PolisClient, PolisError
        client = PolisClient()
        client._xid_tokens["conv-1"] = {"candid:user-1": "xid-tok"}

        # First request: 409 conflict
        conflict_resp = MagicMock()
        conflict_resp.status_code = 409
        conflict_resp.text = "Duplicate"
        conflict_resp.raise_for_status = MagicMock(
            side_effect=requests.exceptions.HTTPError(response=conflict_resp)
        )

        # Second request: GET comments returns list
        comments_resp = MagicMock()
        comments_resp.status_code = 200
        comments_resp.content = b'[{"tid": 7, "txt": "test comment"}]'
        comments_resp.json.return_value = [{"tid": 7, "txt": "test comment"}]
        comments_resp.raise_for_status = MagicMock()

        call_count = [0]
        def mock_request(method, url, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                # POST /comments → 409
                raise PolisError("Duplicate", status_code=409)
            else:
                # GET /comments → list of comments
                return comments_resp

        with patch.object(client.session, "request", side_effect=mock_request):
            result = client.create_comment("conv-1", "test comment", "candid:user-1")
            assert result == 7

    def test_failure_returns_none(self):
        from candid.controllers.helpers.polis_client import PolisClient, PolisError
        client = PolisClient()
        client._xid_tokens["conv-1"] = {"candid:user-1": "xid-tok"}

        with patch.object(client.session, "request",
                          side_effect=requests.exceptions.ConnectionError("down")):
            result = client.create_comment("conv-1", "text", "candid:user-1")
            assert result is None


# ---------------------------------------------------------------------------
# PolisClient.submit_vote
# ---------------------------------------------------------------------------

class TestSubmitVote:
    def test_success_returns_true(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()
        client._xid_tokens["conv-1"] = {"candid:user-1": "xid-tok"}

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'{}'
        mock_resp.json.return_value = {}
        mock_resp.raise_for_status = MagicMock()

        with patch.object(client.session, "request", return_value=mock_resp):
            result = client.submit_vote("conv-1", 5, -1, "candid:user-1")
            assert result is True

    def test_failure_returns_false(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()
        client._xid_tokens["conv-1"] = {"candid:user-1": "xid-tok"}

        with patch.object(client.session, "request",
                          side_effect=requests.exceptions.ConnectionError("down")):
            result = client.submit_vote("conv-1", 5, -1, "candid:user-1")
            assert result is False


# ---------------------------------------------------------------------------
# PolisClient.get_comments
# ---------------------------------------------------------------------------

class TestGetComments:
    def test_list_response(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'[{"tid": 1, "txt": "hello"}]'
        mock_resp.json.return_value = [{"tid": 1, "txt": "hello"}]
        mock_resp.raise_for_status = MagicMock()

        with patch.object(client.session, "request", return_value=mock_resp):
            result = client.get_comments("conv-1")
            assert len(result) == 1
            assert result[0]["tid"] == 1

    def test_dict_response_extracts_comments(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'{"comments": [{"tid": 2}]}'
        mock_resp.json.return_value = {"comments": [{"tid": 2}]}
        mock_resp.raise_for_status = MagicMock()

        with patch.object(client.session, "request", return_value=mock_resp):
            result = client.get_comments("conv-1")
            assert result == [{"tid": 2}]

    def test_error_returns_empty_list(self):
        from candid.controllers.helpers.polis_client import PolisClient
        client = PolisClient()

        with patch.object(client.session, "request",
                          side_effect=requests.exceptions.ConnectionError("down")):
            result = client.get_comments("conv-1")
            assert result == []



# ---------------------------------------------------------------------------
# PolisClient._request — additional edge cases
# ---------------------------------------------------------------------------

class TestRequestEdgeCases:
    def test_500_raises_polis_error(self):
        from candid.controllers.helpers.polis_client import PolisClient, PolisError
        client = PolisClient()

        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.text = "Internal Server Error"
        mock_resp.raise_for_status = MagicMock(
            side_effect=requests.exceptions.HTTPError(response=mock_resp)
        )

        with patch.object(client.session, "request", return_value=mock_resp):
            with pytest.raises(PolisError):
                client._request("GET", "/test")

