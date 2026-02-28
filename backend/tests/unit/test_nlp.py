"""Unit tests for nlp.py — NLP service client."""

import pytest
from unittest.mock import patch, MagicMock
import requests.exceptions

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# get_embeddings / get_embedding
# ---------------------------------------------------------------------------

class TestGetEmbeddings:
    def test_empty_list_returns_empty(self):
        from candid.controllers.helpers.nlp import get_embeddings
        assert get_embeddings([]) == []

    def test_success(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"embeddings": [[0.1, 0.2], [0.3, 0.4]]}
        mock_resp.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.nlp.requests.post", return_value=mock_resp):
            from candid.controllers.helpers.nlp import get_embeddings
            result = get_embeddings(["hello", "world"])
            assert len(result) == 2
            assert result[0] == [0.1, 0.2]

    def test_connection_error_returns_none(self):
        with patch("candid.controllers.helpers.nlp.requests.post",
                    side_effect=requests.exceptions.ConnectionError("conn failed")):
            from candid.controllers.helpers.nlp import get_embeddings
            result = get_embeddings(["hello"])
            assert result is None

    def test_timeout_returns_none(self):
        with patch("candid.controllers.helpers.nlp.requests.post",
                    side_effect=requests.exceptions.Timeout("timeout")):
            from candid.controllers.helpers.nlp import get_embeddings
            result = get_embeddings(["hello"])
            assert result is None

    def test_http_error_raises(self):
        from candid.controllers.helpers.nlp import NLPServiceError
        with patch("candid.controllers.helpers.nlp.requests.post",
                    side_effect=requests.exceptions.HTTPError("500")):
            from candid.controllers.helpers.nlp import get_embeddings
            with pytest.raises(NLPServiceError):
                get_embeddings(["hello"])


class TestGetEmbedding:
    def test_single_embedding(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"embeddings": [[0.5, 0.6]]}
        mock_resp.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.nlp.requests.post", return_value=mock_resp):
            from candid.controllers.helpers.nlp import get_embedding
            result = get_embedding("test")
            assert result == [0.5, 0.6]

    def test_service_unavailable_returns_none(self):
        with patch("candid.controllers.helpers.nlp.requests.post",
                    side_effect=requests.exceptions.ConnectionError()):
            from candid.controllers.helpers.nlp import get_embedding
            assert get_embedding("test") is None


# ---------------------------------------------------------------------------
# compute_similarity
# ---------------------------------------------------------------------------

class TestComputeSimilarity:
    def test_empty_candidates(self):
        from candid.controllers.helpers.nlp import compute_similarity
        assert compute_similarity("query", []) == []

    def test_success(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"scores": [0.95, 0.60, 0.30]}
        mock_resp.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.nlp.requests.post", return_value=mock_resp):
            from candid.controllers.helpers.nlp import compute_similarity
            scores = compute_similarity("query", ["a", "b", "c"])
            assert scores == [0.95, 0.60, 0.30]

    def test_connection_error_returns_none(self):
        with patch("candid.controllers.helpers.nlp.requests.post",
                    side_effect=requests.exceptions.ConnectionError()):
            from candid.controllers.helpers.nlp import compute_similarity
            assert compute_similarity("q", ["a"]) is None


# ---------------------------------------------------------------------------
# check_nsfw
# ---------------------------------------------------------------------------

class TestCheckNSFW:
    def test_safe_image(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"is_safe": True, "nsfw_score": 0.1}
        mock_resp.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.nlp.requests.post", return_value=mock_resp):
            from candid.controllers.helpers.nlp import check_nsfw
            result = check_nsfw("base64data")
            assert result["is_safe"] is True

    def test_fail_open_on_connection_error(self):
        """NSFW check should fail open (allow) if service unavailable."""
        with patch("candid.controllers.helpers.nlp.requests.post",
                    side_effect=requests.exceptions.ConnectionError()):
            from candid.controllers.helpers.nlp import check_nsfw
            result = check_nsfw("base64data")
            assert result["is_safe"] is True
            assert result["nsfw_score"] == 0.0

    def test_fail_open_on_timeout(self):
        with patch("candid.controllers.helpers.nlp.requests.post",
                    side_effect=requests.exceptions.Timeout()):
            from candid.controllers.helpers.nlp import check_nsfw
            result = check_nsfw("base64data")
            assert result["is_safe"] is True


# ---------------------------------------------------------------------------
# resize_avatar
# ---------------------------------------------------------------------------

class TestResizeAvatar:
    def test_success(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "full_base64": "full_data",
            "icon_base64": "icon_data",
            "error": None,
        }
        mock_resp.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.nlp.requests.post", return_value=mock_resp):
            from candid.controllers.helpers.nlp import resize_avatar
            result = resize_avatar("base64data")
            assert result["full_base64"] == "full_data"
            assert result["icon_base64"] == "icon_data"
            assert result["error"] is None

    def test_service_unavailable(self):
        with patch("candid.controllers.helpers.nlp.requests.post",
                    side_effect=requests.exceptions.ConnectionError()):
            from candid.controllers.helpers.nlp import resize_avatar
            result = resize_avatar("base64data")
            assert result["full_base64"] is None
            assert result["error"] == "Service unavailable"

    def test_timeout(self):
        with patch("candid.controllers.helpers.nlp.requests.post",
                    side_effect=requests.exceptions.Timeout()):
            from candid.controllers.helpers.nlp import resize_avatar
            result = resize_avatar("base64data")
            assert result["full_base64"] is None
            assert result["error"] == "Service timeout"

    def test_request_exception_raises(self):
        with patch("candid.controllers.helpers.nlp.requests.post",
                    side_effect=requests.exceptions.HTTPError("500")):
            from candid.controllers.helpers.nlp import resize_avatar, NLPServiceError
            with pytest.raises(NLPServiceError):
                resize_avatar("base64data")


# ---------------------------------------------------------------------------
# process_avatar
# ---------------------------------------------------------------------------

class TestProcessAvatar:
    def test_success(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "is_safe": True,
            "full_base64": "full_data",
            "icon_base64": "icon_data",
            "nsfw_score": 0.05,
        }
        mock_resp.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.nlp.requests.post", return_value=mock_resp):
            from candid.controllers.helpers.nlp import process_avatar
            result = process_avatar("base64data")
            assert result["is_safe"] is True
            assert result["full_base64"] == "full_data"

    def test_service_unavailable_returns_unsafe(self):
        """Avatar processing fails closed (reject) if service unavailable."""
        with patch("candid.controllers.helpers.nlp.requests.post",
                    side_effect=requests.exceptions.ConnectionError()):
            from candid.controllers.helpers.nlp import process_avatar
            result = process_avatar("base64data")
            assert result["is_safe"] is False
            assert result["error"] == "Service unavailable"

    def test_timeout_returns_unsafe(self):
        with patch("candid.controllers.helpers.nlp.requests.post",
                    side_effect=requests.exceptions.Timeout()):
            from candid.controllers.helpers.nlp import process_avatar
            result = process_avatar("base64data")
            assert result["is_safe"] is False
            assert result["error"] == "Service timeout"


# ---------------------------------------------------------------------------
# check_toxicity
# ---------------------------------------------------------------------------

class TestCheckToxicity:
    def test_clean_text(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"is_toxic": False, "toxicity_score": 0.1}
        mock_resp.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.nlp.requests.post", return_value=mock_resp):
            from candid.controllers.helpers.nlp import check_toxicity
            result = check_toxicity("I respectfully disagree")
            assert result["is_toxic"] is False
            assert result["toxicity_score"] == 0.1

    def test_toxic_text(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"is_toxic": True, "toxicity_score": 0.95}
        mock_resp.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.nlp.requests.post", return_value=mock_resp):
            from candid.controllers.helpers.nlp import check_toxicity
            result = check_toxicity("you are terrible")
            assert result["is_toxic"] is True
            assert result["toxicity_score"] == 0.95

    def test_fail_open_on_connection_error(self):
        """Toxicity check should fail open if service unavailable."""
        with patch("candid.controllers.helpers.nlp.requests.post",
                    side_effect=requests.exceptions.ConnectionError()):
            from candid.controllers.helpers.nlp import check_toxicity
            result = check_toxicity("some text")
            assert result["is_toxic"] is False
            assert result["toxicity_score"] == 0.0

    def test_fail_open_on_timeout(self):
        with patch("candid.controllers.helpers.nlp.requests.post",
                    side_effect=requests.exceptions.Timeout()):
            from candid.controllers.helpers.nlp import check_toxicity
            result = check_toxicity("some text")
            assert result["is_toxic"] is False
            assert result["toxicity_score"] == 0.0

    def test_http_error_raises(self):
        from candid.controllers.helpers.nlp import NLPServiceError
        with patch("candid.controllers.helpers.nlp.requests.post",
                    side_effect=requests.exceptions.HTTPError("500")):
            from candid.controllers.helpers.nlp import check_toxicity
            with pytest.raises(NLPServiceError):
                check_toxicity("some text")


# ---------------------------------------------------------------------------
# health_check
# ---------------------------------------------------------------------------

class TestHealthCheck:
    def test_healthy(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200

        with patch("candid.controllers.helpers.nlp.requests.get", return_value=mock_resp):
            from candid.controllers.helpers.nlp import health_check
            assert health_check() is True

    def test_unhealthy(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 503

        with patch("candid.controllers.helpers.nlp.requests.get", return_value=mock_resp):
            from candid.controllers.helpers.nlp import health_check
            assert health_check() is False

    def test_connection_error(self):
        with patch("candid.controllers.helpers.nlp.requests.get",
                    side_effect=requests.exceptions.ConnectionError()):
            from candid.controllers.helpers.nlp import health_check
            assert health_check() is False
