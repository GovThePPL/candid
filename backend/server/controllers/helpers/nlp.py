"""NLP service client for embedding generation and similarity search."""

import requests
from typing import List, Optional
from candid.controllers.helpers.config import Config


class NLPServiceError(Exception):
    """Exception raised when NLP service communication fails."""
    pass


def get_embeddings(texts: List[str]) -> Optional[List[List[float]]]:
    """
    Get embeddings for a list of texts from the NLP service.

    Args:
        texts: List of text strings to embed

    Returns:
        List of embedding vectors, or None if service unavailable

    Raises:
        NLPServiceError: If the service returns an error
    """
    if not texts:
        return []

    try:
        response = requests.post(
            f"{Config.NLP_SERVICE_URL}/embed",
            json={"texts": texts},
            timeout=Config.NLP_SERVICE_TIMEOUT
        )
        response.raise_for_status()
        data = response.json()
        return data.get("embeddings", [])
    except requests.exceptions.ConnectionError:
        print("NLP service unavailable - embeddings will not be generated", flush=True)
        return None
    except requests.exceptions.Timeout:
        print("NLP service timeout - embeddings will not be generated", flush=True)
        return None
    except requests.exceptions.RequestException as e:
        raise NLPServiceError(f"NLP service error: {e}")


def get_embedding(text: str) -> Optional[List[float]]:
    """
    Get embedding for a single text.

    Args:
        text: Text string to embed

    Returns:
        Embedding vector, or None if service unavailable
    """
    embeddings = get_embeddings([text])
    if embeddings and len(embeddings) > 0:
        return embeddings[0]
    return None


def compute_similarity(query: str, candidates: List[str]) -> Optional[List[float]]:
    """
    Compute similarity scores between a query and candidate texts.

    Args:
        query: Query text
        candidates: List of candidate texts

    Returns:
        List of similarity scores (0-1), or None if service unavailable
    """
    if not candidates:
        return []

    try:
        response = requests.post(
            f"{Config.NLP_SERVICE_URL}/similarity",
            json={"query": query, "candidates": candidates},
            timeout=Config.NLP_SERVICE_TIMEOUT
        )
        response.raise_for_status()
        data = response.json()
        return data.get("scores", [])
    except requests.exceptions.ConnectionError:
        print("NLP service unavailable", flush=True)
        return None
    except requests.exceptions.Timeout:
        print("NLP service timeout", flush=True)
        return None
    except requests.exceptions.RequestException as e:
        raise NLPServiceError(f"NLP service error: {e}")


def health_check() -> bool:
    """
    Check if NLP service is healthy.

    Returns:
        True if service is available and healthy
    """
    try:
        response = requests.get(
            f"{Config.NLP_SERVICE_URL}/health",
            timeout=5
        )
        return response.status_code == 200
    except requests.exceptions.RequestException:
        return False


def check_nsfw(image_base64: str, threshold: float = 0.6) -> dict:
    """
    Check if an image contains NSFW content.

    Args:
        image_base64: Base64 encoded image data (with or without data URI prefix)
        threshold: NSFW score threshold (0.0-1.0)

    Returns:
        Dict with 'is_safe', 'nsfw_score', 'error' fields

    Raises:
        NLPServiceError: If the service returns an error
    """
    try:
        response = requests.post(
            f"{Config.NLP_SERVICE_URL}/nsfw-check",
            json={"image_base64": image_base64, "threshold": threshold},
            timeout=30  # Longer timeout for image processing
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.ConnectionError:
        # If NLP service is unavailable, allow the image (fail open)
        print("NLP service unavailable - NSFW check skipped", flush=True)
        return {"is_safe": True, "nsfw_score": 0.0, "error": None}
    except requests.exceptions.Timeout:
        print("NLP service timeout - NSFW check skipped", flush=True)
        return {"is_safe": True, "nsfw_score": 0.0, "error": None}
    except requests.exceptions.RequestException as e:
        raise NLPServiceError(f"NLP service error: {e}")


def check_toxicity(text: str, threshold: float = 0.7) -> dict:
    """
    Check if text contains toxic content.

    Args:
        text: Text string to check
        threshold: Toxicity score threshold (0.0-1.0)

    Returns:
        Dict with 'is_toxic' and 'toxicity_score' fields.
        Fails open: returns is_toxic=False on connection/timeout errors.
    """
    try:
        response = requests.post(
            f"{Config.NLP_SERVICE_URL}/toxicity-check",
            json={"text": text, "threshold": threshold},
            timeout=Config.NLP_SERVICE_TIMEOUT
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.ConnectionError:
        print("NLP service unavailable - toxicity check skipped", flush=True)
        return {"is_toxic": False, "toxicity_score": 0.0}
    except requests.exceptions.Timeout:
        print("NLP service timeout - toxicity check skipped", flush=True)
        return {"is_toxic": False, "toxicity_score": 0.0}
    except requests.exceptions.RequestException as e:
        raise NLPServiceError(f"NLP service error: {e}")


def proposal_assist(template: str, step: str, user_input: str,
                    context: str = "", previous_sections: dict = None,
                    location_name: str = None) -> dict:
    """
    Request AI-enhanced content for a proposal wizard step from the NLP service.

    Unlike other NLP functions, this does NOT fail open — if the service is
    unavailable or errors, the error is propagated so the frontend can show
    the user an appropriate message.

    Args:
        template: "issue" or "policy"
        step: Wizard step name
        user_input: User's draft text
        context: Pre-assembled context string
        previous_sections: Dict of previous sections
        location_name: Full location name (e.g. "Oregon - Multnomah County")

    Returns:
        Dict with 'content' field

    Raises:
        NLPServiceError: If the service returns an error or is unavailable
    """
    payload = {
        "template": template,
        "step": step,
        "user_input": user_input,
        "context": context,
    }
    if previous_sections:
        payload["previous_sections"] = previous_sections
    if location_name:
        payload["location_name"] = location_name

    try:
        response = requests.post(
            f"{Config.NLP_SERVICE_URL}/llm/proposal-assist",
            json=payload,
            timeout=60  # Longer timeout for LLM generation
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.ConnectionError:
        raise NLPServiceError("NLP service unavailable for proposal assistance")
    except requests.exceptions.Timeout:
        raise NLPServiceError("NLP service timeout during proposal assistance")
    except requests.exceptions.RequestException as e:
        raise NLPServiceError(f"Proposal assist error: {e}")


def process_avatar(image_base64: str, threshold: float = 0.6) -> dict:
    """
    Process an avatar image: validate NSFW and resize to full/icon sizes.

    Args:
        image_base64: Base64 encoded image data (with or without data URI prefix)
        threshold: NSFW score threshold (0.0-1.0)

    Returns:
        Dict with 'is_safe', 'full_base64', 'icon_base64', 'nsfw_score', 'error'

    Raises:
        NLPServiceError: If the service returns an error
    """
    try:
        response = requests.post(
            f"{Config.NLP_SERVICE_URL}/process-avatar",
            json={"image_base64": image_base64, "threshold": threshold},
            timeout=60  # Longer timeout for image processing
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.ConnectionError:
        print("NLP service unavailable - avatar processing failed", flush=True)
        return {"is_safe": False, "full_base64": None, "icon_base64": None, "error": "Service unavailable"}
    except requests.exceptions.Timeout:
        print("NLP service timeout - avatar processing failed", flush=True)
        return {"is_safe": False, "full_base64": None, "icon_base64": None, "error": "Service timeout"}
    except requests.exceptions.RequestException as e:
        raise NLPServiceError(f"NLP service error: {e}")
