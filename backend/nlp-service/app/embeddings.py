"""Embedding model wrapper for sentence-transformers."""

import os
from typing import List
import numpy as np
from sentence_transformers import SentenceTransformer


class EmbeddingModel:
    """Wrapper for sentence-transformers embedding model."""

    def __init__(self):
        self.model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
        self.device = os.getenv("DEVICE", "cpu")
        self.max_batch_size = int(os.getenv("MAX_BATCH_SIZE", "32"))
        self._model = None

    def load(self):
        """Load the model into memory."""
        if self._model is None:
            self._model = SentenceTransformer(self.model_name, device=self.device)

    @property
    def model(self) -> SentenceTransformer:
        """Get the loaded model, loading if necessary."""
        if self._model is None:
            self.load()
        return self._model

    @property
    def embedding_dimension(self) -> int:
        """Get the dimension of embeddings produced by this model."""
        return self.model.get_sentence_embedding_dimension()

    def embed(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for a list of texts.

        Args:
            texts: List of text strings to embed

        Returns:
            List of embedding vectors as lists of floats
        """
        if not texts:
            return []

        # Process in batches if needed
        all_embeddings = []
        for i in range(0, len(texts), self.max_batch_size):
            batch = texts[i : i + self.max_batch_size]
            embeddings = self.model.encode(
                batch, convert_to_numpy=True, normalize_embeddings=True
            )
            all_embeddings.extend(embeddings.tolist())

        return all_embeddings

    def similarity(self, query: str, candidates: List[str]) -> List[float]:
        """
        Compute cosine similarity between a query and candidate texts.

        Args:
            query: The query text
            candidates: List of candidate texts to compare against

        Returns:
            List of similarity scores (0-1) for each candidate
        """
        if not candidates:
            return []

        # Get embeddings
        query_embedding = self.model.encode(
            [query], convert_to_numpy=True, normalize_embeddings=True
        )[0]

        candidate_embeddings = []
        for i in range(0, len(candidates), self.max_batch_size):
            batch = candidates[i : i + self.max_batch_size]
            embeddings = self.model.encode(
                batch, convert_to_numpy=True, normalize_embeddings=True
            )
            candidate_embeddings.extend(embeddings)

        candidate_embeddings = np.array(candidate_embeddings)

        # Compute cosine similarity (embeddings are already normalized)
        similarities = np.dot(candidate_embeddings, query_embedding)

        return similarities.tolist()


# Global model instance
embedding_model = EmbeddingModel()
