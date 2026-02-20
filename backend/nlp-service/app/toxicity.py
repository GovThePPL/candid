"""Toxicity detection using the detoxify library (Jigsaw/Perspective model)."""

import logging
import os

logger = logging.getLogger(__name__)

# Lazy-loaded singleton
_detector = None

TOXICITY_MODEL = os.environ.get("TOXICITY_MODEL", "unbiased")
DEFAULT_THRESHOLD = float(os.environ.get("TOXICITY_THRESHOLD", "0.7"))


class ToxicityDetector:
    """Wraps detoxify for text toxicity classification."""

    def __init__(self, model_name: str = TOXICITY_MODEL):
        self.model_name = model_name
        self._model = None

    def load(self):
        """Load the detoxify model (call once at startup)."""
        from detoxify import Detoxify

        logger.info(f"Loading detoxify model: {self.model_name}")
        self._model = Detoxify(self.model_name)
        logger.info("Detoxify model loaded")

    def check(self, text: str, threshold: float = DEFAULT_THRESHOLD) -> dict:
        """Check text for toxicity.

        Args:
            text: The text to check.
            threshold: Score above which text is considered toxic (0.0-1.0).

        Returns:
            Dict with 'is_toxic', 'toxicity_score', and 'categories'.
        """
        if self._model is None:
            raise RuntimeError("Model not loaded — call load() first")

        results = self._model.predict(text)

        # results is a dict like:
        # {'toxicity': 0.99, 'severe_toxicity': 0.01, 'obscene': 0.5,
        #  'identity_attack': 0.02, 'insult': 0.9, 'threat': 0.01,
        #  'sexual_explicit': 0.01}
        toxicity_score = float(results.get("toxicity", 0.0))
        is_toxic = toxicity_score >= threshold

        categories = {k: float(v) for k, v in results.items()}

        return {
            "is_toxic": is_toxic,
            "toxicity_score": toxicity_score,
            "categories": categories,
        }


def get_detector() -> ToxicityDetector:
    """Get or create the singleton ToxicityDetector."""
    global _detector
    if _detector is None:
        _detector = ToxicityDetector()
    return _detector
