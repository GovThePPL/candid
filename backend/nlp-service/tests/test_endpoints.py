"""Tests for FastAPI endpoints in main.py.

NOTE: The following low-value tests were intentionally removed:
- test_empty_texts_422, test_empty_candidates_422 (Pydantic min_length validation —
  testing framework behavior, not application logic)
- test_returns_200_with_model_info (smoke test; the embed/similarity success tests
  already exercise the app with a mocked model)
- test_invalid_base64_returns_error, test_invalid_image_returns_error in nsfw-check
  (duplicate coverage — decode_base64_image and validate_image are tested directly
  in test_nsfw_detector.py)
- test_invalid_image_error in process-avatar (same duplication)
"""

import base64
from unittest.mock import patch

import pytest


class TestEmbedEndpoint:
    """Test POST /embed."""

    def test_success(self, app_client):
        resp = app_client.post("/embed", json={"texts": ["hello world"]})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["embeddings"]) == 1
        assert data["dimension"] == 384
        assert isinstance(data["model"], str)

    def test_model_error_500(self, app_client, mock_sentence_transformer):
        mock_sentence_transformer.encode.side_effect = RuntimeError("OOM")
        resp = app_client.post("/embed", json={"texts": ["boom"]})
        assert resp.status_code == 500


class TestSimilarityEndpoint:
    """Test POST /similarity."""

    def test_success(self, app_client):
        resp = app_client.post(
            "/similarity",
            json={"query": "test", "candidates": ["a", "b"]},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["scores"]) == 2


class TestNsfwCheckEndpoint:
    """Test POST /nsfw-check."""

    def test_safe_image(self, app_client, small_png_base64, mock_nudenet):
        mock_nudenet.detect.return_value = []
        resp = app_client.post(
            "/nsfw-check",
            json={"image_base64": small_png_base64},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_safe"] is True
        assert data["error"] is None


class TestProcessAvatarEndpoint:
    """Test POST /process-avatar."""

    def test_success_returns_both_sizes(self, app_client, small_png_base64, mock_nudenet):
        mock_nudenet.detect.return_value = []
        resp = app_client.post(
            "/process-avatar",
            json={"image_base64": small_png_base64},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_safe"] is True
        assert data["full_base64"].startswith("data:image/jpeg;base64,")
        assert data["icon_base64"].startswith("data:image/jpeg;base64,")
        assert data["error"] is None

    def test_nsfw_rejected(self, app_client, small_png_base64, mock_nudenet):
        mock_nudenet.detect.return_value = [
            {"class": "FEMALE_BREAST_EXPOSED", "score": 0.95}
        ]
        resp = app_client.post(
            "/process-avatar",
            json={"image_base64": small_png_base64},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_safe"] is False
        assert data["full_base64"] is None
        assert "inappropriate" in data["error"].lower()
