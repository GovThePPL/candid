"""Shared fixtures for NLP service tests.

sentence_transformers and nudenet are Docker-only dependencies (large ML models).
We inject fake modules into sys.modules at import time so app.embeddings and
app.nsfw_detector can be imported without the real packages.
"""

import base64
import io
import sys
import types
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from PIL import Image

# ---------------------------------------------------------------------------
# Fake sentence_transformers module (must happen before app.embeddings import)
# ---------------------------------------------------------------------------
_fake_st = types.ModuleType("sentence_transformers")
_fake_st.SentenceTransformer = MagicMock  # placeholder class
sys.modules.setdefault("sentence_transformers", _fake_st)

# Fake nudenet module (must happen before app.nsfw_detector lazily imports it)
_fake_nn = types.ModuleType("nudenet")
_fake_nn.NudeDetector = MagicMock
sys.modules.setdefault("nudenet", _fake_nn)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_png(size=(4, 4), mode="RGB"):
    """Create a minimal PNG image in memory."""
    color = (100, 150, 200) if mode == "RGB" else (100, 150, 200, 255)
    img = Image.new(mode, size, color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_normalized_embeddings(n, dim=384):
    """Return (n, dim) numpy array of L2-normalized random vectors."""
    rng = np.random.RandomState(42)
    vecs = rng.randn(n, dim).astype(np.float32)
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    return vecs / norms


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def small_png_bytes():
    """Minimal 4x4 RGB PNG."""
    return _make_png(size=(4, 4), mode="RGB")


@pytest.fixture
def small_png_base64(small_png_bytes):
    """Base64-encoded minimal PNG."""
    return base64.b64encode(small_png_bytes).decode("utf-8")


@pytest.fixture
def rgba_png_bytes():
    """4x4 RGBA PNG for transparency tests."""
    return _make_png(size=(4, 4), mode="RGBA")


@pytest.fixture
def mock_sentence_transformer():
    """Provide a mock SentenceTransformer model instance."""
    mock_model = MagicMock()
    mock_model.get_sentence_embedding_dimension.return_value = 384

    def _encode(texts, convert_to_numpy=True, normalize_embeddings=True):
        return _make_normalized_embeddings(len(texts))

    mock_model.encode.side_effect = _encode
    yield mock_model


@pytest.fixture
def mock_nudenet():
    """Patch get_classifier() to return a mock NudeDetector."""
    mock_detector = MagicMock()
    mock_detector._api_version = "v3"
    mock_detector.detect.return_value = []  # safe by default

    with patch("app.nsfw_detector.get_classifier", return_value=mock_detector):
        yield mock_detector


@pytest.fixture
def app_client(mock_sentence_transformer):
    """FastAPI TestClient with mocked embedding model."""
    from app.embeddings import embedding_model

    # Pre-load with mock so lifespan doesn't try real download
    embedding_model._model = mock_sentence_transformer

    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as client:
        yield client

    # Clean up global state
    embedding_model._model = None
