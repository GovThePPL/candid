"""Tests for the EmbeddingModel class.

NOTE: EmbeddingModel.__init__ env-var tests were intentionally removed —
they tested os.getenv returning default constants (Python stdlib, not logic).
"""

import numpy as np
import pytest
from unittest.mock import patch

from app.embeddings import EmbeddingModel


class TestEmbed:
    """Test EmbeddingModel.embed() batching and output."""

    def test_empty_returns_empty(self, mock_sentence_transformer):
        model = EmbeddingModel()
        model._model = mock_sentence_transformer
        assert model.embed([]) == []
        mock_sentence_transformer.encode.assert_not_called()

    def test_single_text(self, mock_sentence_transformer):
        model = EmbeddingModel()
        model._model = mock_sentence_transformer
        result = model.embed(["hello"])
        assert len(result) == 1
        assert len(result[0]) == 384
        mock_sentence_transformer.encode.assert_called_once()

    def test_batch_processing(self, mock_sentence_transformer):
        """50 texts with batch_size=32 should trigger 2 encode calls."""
        model = EmbeddingModel()
        model._model = mock_sentence_transformer
        model.max_batch_size = 32
        texts = [f"text {i}" for i in range(50)]
        result = model.embed(texts)
        assert len(result) == 50
        assert mock_sentence_transformer.encode.call_count == 2

    def test_embeddings_normalized(self, mock_sentence_transformer):
        """Returned embeddings should have L2 norm close to 1.0."""
        model = EmbeddingModel()
        model._model = mock_sentence_transformer
        result = model.embed(["normalize me"])
        vec = np.array(result[0])
        assert abs(np.linalg.norm(vec) - 1.0) < 1e-5


class TestSimilarity:
    """Test EmbeddingModel.similarity() scoring."""

    def test_empty_candidates_returns_empty(self, mock_sentence_transformer):
        model = EmbeddingModel()
        model._model = mock_sentence_transformer
        assert model.similarity("query", []) == []

    def test_identical_score_near_1(self, mock_sentence_transformer):
        """When encode returns the same vector for query and candidate, score ~ 1."""
        fixed = np.ones((1, 384), dtype=np.float32)
        fixed /= np.linalg.norm(fixed)
        mock_sentence_transformer.encode.side_effect = (
            lambda texts, **kw: np.tile(fixed, (len(texts), 1))
        )
        model = EmbeddingModel()
        model._model = mock_sentence_transformer
        scores = model.similarity("same", ["same"])
        assert len(scores) == 1
        assert abs(scores[0] - 1.0) < 1e-5

    def test_one_score_per_candidate(self, mock_sentence_transformer):
        model = EmbeddingModel()
        model._model = mock_sentence_transformer
        scores = model.similarity("query", ["a", "b", "c"])
        assert len(scores) == 3
        assert all(isinstance(s, float) for s in scores)

    def test_batch_candidates(self, mock_sentence_transformer):
        """40 candidates with batch_size=32 -> 1 query call + 2 candidate calls."""
        model = EmbeddingModel()
        model._model = mock_sentence_transformer
        model.max_batch_size = 32
        candidates = [f"c{i}" for i in range(40)]
        scores = model.similarity("query", candidates)
        assert len(scores) == 40
        # 1 call for query + 2 calls for candidates (32 + 8)
        assert mock_sentence_transformer.encode.call_count == 3
