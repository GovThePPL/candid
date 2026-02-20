"""Tests for toxicity detection."""

from unittest.mock import MagicMock, patch

import pytest

from app.toxicity import ToxicityDetector, get_detector


class TestToxicityDetector:
    """Test ToxicityDetector class."""

    def test_check_clean_text(self, mock_detoxify):
        """Text below threshold returns is_toxic=False."""
        mock_detoxify.predict.return_value = {
            "toxicity": 0.1,
            "severe_toxicity": 0.01,
            "obscene": 0.05,
            "identity_attack": 0.02,
            "insult": 0.08,
            "threat": 0.01,
            "sexual_explicit": 0.01,
        }
        detector = ToxicityDetector()
        detector._model = mock_detoxify
        result = detector.check("I respectfully disagree", threshold=0.7)
        assert result["is_toxic"] is False
        assert result["toxicity_score"] == 0.1
        assert "toxicity" in result["categories"]

    def test_check_toxic_text(self, mock_detoxify):
        """Text above threshold returns is_toxic=True."""
        mock_detoxify.predict.return_value = {
            "toxicity": 0.95,
            "severe_toxicity": 0.3,
            "obscene": 0.8,
            "identity_attack": 0.1,
            "insult": 0.9,
            "threat": 0.05,
            "sexual_explicit": 0.02,
        }
        detector = ToxicityDetector()
        detector._model = mock_detoxify
        result = detector.check("you are terrible", threshold=0.7)
        assert result["is_toxic"] is True
        assert result["toxicity_score"] == 0.95

    def test_check_at_threshold(self, mock_detoxify):
        """Exactly at threshold returns is_toxic=True (>= comparison)."""
        mock_detoxify.predict.return_value = {"toxicity": 0.7}
        detector = ToxicityDetector()
        detector._model = mock_detoxify
        result = detector.check("borderline text", threshold=0.7)
        assert result["is_toxic"] is True

    def test_check_below_threshold(self, mock_detoxify):
        """Just below threshold returns is_toxic=False."""
        mock_detoxify.predict.return_value = {"toxicity": 0.69}
        detector = ToxicityDetector()
        detector._model = mock_detoxify
        result = detector.check("slightly edgy text", threshold=0.7)
        assert result["is_toxic"] is False

    def test_model_not_loaded_raises(self):
        """Calling check() without loading the model raises RuntimeError."""
        detector = ToxicityDetector()
        with pytest.raises(RuntimeError, match="not loaded"):
            detector.check("test")

    def test_categories_returned(self, mock_detoxify):
        """All model categories are returned in result."""
        mock_detoxify.predict.return_value = {
            "toxicity": 0.5,
            "insult": 0.4,
            "threat": 0.1,
        }
        detector = ToxicityDetector()
        detector._model = mock_detoxify
        result = detector.check("some text")
        assert result["categories"]["insult"] == 0.4
        assert result["categories"]["threat"] == 0.1


class TestGetDetector:
    """Test the singleton factory."""

    def test_returns_same_instance(self):
        """get_detector() returns the same ToxicityDetector."""
        d1 = get_detector()
        d2 = get_detector()
        assert d1 is d2


class TestToxicityEndpoint:
    """Test the /toxicity-check API endpoint."""

    def test_clean_text(self, app_client, mock_detoxify):
        mock_detoxify.predict.return_value = {"toxicity": 0.1}
        response = app_client.post(
            "/toxicity-check",
            json={"text": "I respectfully disagree"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_toxic"] is False
        assert data["toxicity_score"] == 0.1

    def test_toxic_text(self, app_client, mock_detoxify):
        mock_detoxify.predict.return_value = {"toxicity": 0.95}
        response = app_client.post(
            "/toxicity-check",
            json={"text": "you are terrible"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_toxic"] is True
        assert data["toxicity_score"] == 0.95

    def test_custom_threshold(self, app_client, mock_detoxify):
        mock_detoxify.predict.return_value = {"toxicity": 0.5}
        response = app_client.post(
            "/toxicity-check",
            json={"text": "edgy text", "threshold": 0.3},
        )
        assert response.status_code == 200
        assert response.json()["is_toxic"] is True

    def test_empty_text_validation(self, app_client):
        response = app_client.post(
            "/toxicity-check",
            json={"text": ""},
        )
        assert response.status_code == 422

    def test_missing_text_validation(self, app_client):
        response = app_client.post(
            "/toxicity-check",
            json={},
        )
        assert response.status_code == 422
