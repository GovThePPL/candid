"""FastAPI application for NLP service."""

import logging
import os
from contextlib import asynccontextmanager
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .embeddings import embedding_model
from .nsfw_detector import decode_and_validate_image, check_nsfw, process_avatar
from .toxicity import get_detector

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load models on startup."""
    logger.info(f"Loading embedding model: {embedding_model.model_name}")
    embedding_model.load()
    logger.info(
        f"Model loaded. Dimension: {embedding_model.embedding_dimension}, "
        f"Device: {embedding_model.device}"
    )
    toxicity_detector = get_detector()
    toxicity_detector.load()
    yield


app = FastAPI(
    title="Candid NLP Service",
    description="NLP service for semantic text processing",
    version="1.0.0",
    lifespan=lifespan,
)


# Request/Response models
class EmbedRequest(BaseModel):
    """Request model for embedding generation."""

    texts: List[str] = Field(..., description="List of texts to embed", min_length=1)


class EmbedResponse(BaseModel):
    """Response model for embedding generation."""

    embeddings: List[List[float]] = Field(..., description="List of embedding vectors")
    model: str = Field(..., description="Name of the model used")
    dimension: int = Field(..., description="Dimension of each embedding vector")


class SimilarityRequest(BaseModel):
    """Request model for similarity computation."""

    query: str = Field(..., description="Query text to match against candidates")
    candidates: List[str] = Field(
        ..., description="List of candidate texts", min_length=1
    )


class SimilarityResponse(BaseModel):
    """Response model for similarity computation."""

    scores: List[float] = Field(
        ..., description="Similarity scores (0-1) for each candidate"
    )


class HealthResponse(BaseModel):
    """Response model for health check."""

    status: str = Field(..., description="Service status")
    models: List[str] = Field(..., description="Available models")
    embedding_model: str = Field(..., description="Current embedding model")
    embedding_dimension: int = Field(..., description="Embedding dimension")
    device: str = Field(..., description="Computation device (cpu/cuda)")


class NSFWCheckRequest(BaseModel):
    """Request model for NSFW content check."""

    image_base64: str = Field(..., description="Base64 encoded image (can include data URI prefix)")
    threshold: float = Field(0.6, description="NSFW score threshold (0.0-1.0)", ge=0.0, le=1.0)


class NSFWCheckResponse(BaseModel):
    """Response model for NSFW content check."""

    is_safe: bool = Field(..., description="Whether the image is safe (not NSFW)")
    nsfw_score: float = Field(..., description="NSFW probability score (0.0-1.0)")
    safe_score: float = Field(..., description="Safe probability score (0.0-1.0)")
    threshold: float = Field(..., description="Threshold used for classification")
    error: Optional[str] = Field(None, description="Error message if validation failed")


class ToxicityCheckRequest(BaseModel):
    """Request model for toxicity check."""

    text: str = Field(..., description="Text to check for toxicity", min_length=1)
    threshold: float = Field(0.7, description="Toxicity score threshold (0.0-1.0)", ge=0.0, le=1.0)


class ToxicityCheckResponse(BaseModel):
    """Response model for toxicity check."""

    is_toxic: bool = Field(..., description="Whether the text exceeds the toxicity threshold")
    toxicity_score: float = Field(..., description="Overall toxicity score (0.0-1.0)")


class ProcessAvatarRequest(BaseModel):
    """Request model for avatar processing."""

    image_base64: str = Field(..., description="Base64 encoded image (can include data URI prefix)")
    threshold: float = Field(0.6, description="NSFW score threshold (0.0-1.0)", ge=0.0, le=1.0)


class ProcessAvatarResponse(BaseModel):
    """Response model for avatar processing."""

    is_safe: bool = Field(..., description="Whether the image is safe (not NSFW)")
    full_base64: Optional[str] = Field(None, description="Full size (256x256) avatar as base64 data URI")
    icon_base64: Optional[str] = Field(None, description="Icon size (64x64) avatar as base64 data URI")
    nsfw_score: float = Field(..., description="NSFW probability score (0.0-1.0)")
    error: Optional[str] = Field(None, description="Error message if processing failed")


class ResizeAvatarRequest(BaseModel):
    """Request model for avatar resizing (no NSFW check)."""

    image_base64: str = Field(..., description="Base64 encoded image (can include data URI prefix)")


class ResizeAvatarResponse(BaseModel):
    """Response model for avatar resizing."""

    full_base64: Optional[str] = Field(None, description="Full size (256x256) avatar as base64 data URI")
    icon_base64: Optional[str] = Field(None, description="Icon size (64x64) avatar as base64 data URI")
    error: Optional[str] = Field(None, description="Error message if processing failed")


class ProposalAssistRequest(BaseModel):
    """Request model for proposal AI assistance."""

    template: str = Field(..., description="Proposal type: 'issue' or 'policy'")
    step: str = Field(..., description="Wizard step name")
    user_input: str = Field(..., description="User's draft text for this step", min_length=1)
    context: str = Field("", description="Pre-assembled context (wiki, glossary, Q&A, expert content)")
    previous_sections: Optional[Dict[str, str]] = Field(None, description="Previously completed sections")
    location_name: Optional[str] = Field(None, description="Full location name (e.g. 'Oregon - Multnomah County')")


class ProposalAssistResponse(BaseModel):
    """Response model for proposal AI assistance."""

    content: str = Field(..., description="AI-enhanced content")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check service health and model availability."""
    return HealthResponse(
        status="ok",
        models=["embeddings", "toxicity"],
        embedding_model=embedding_model.model_name,
        embedding_dimension=embedding_model.embedding_dimension,
        device=embedding_model.device,
    )


@app.post("/embed", response_model=EmbedResponse)
async def embed_texts(request: EmbedRequest):
    """
    Generate embeddings for a list of texts.

    Returns normalized embedding vectors suitable for cosine similarity.
    """
    try:
        embeddings = embedding_model.embed(request.texts)
        return EmbedResponse(
            embeddings=embeddings,
            model=embedding_model.model_name,
            dimension=embedding_model.embedding_dimension,
        )
    except Exception as e:
        logger.error(f"Error generating embeddings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/similarity", response_model=SimilarityResponse)
async def compute_similarity(request: SimilarityRequest):
    """
    Compute cosine similarity between a query and candidate texts.

    Returns similarity scores between 0 and 1 for each candidate.
    """
    try:
        scores = embedding_model.similarity(request.query, request.candidates)
        return SimilarityResponse(scores=scores)
    except Exception as e:
        logger.error(f"Error computing similarity: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/nsfw-check", response_model=NSFWCheckResponse)
async def nsfw_check(request: NSFWCheckRequest):
    """
    Check if an image contains NSFW content.

    Accepts base64 encoded image data (with or without data URI prefix).
    Returns whether the image is safe and the NSFW probability score.
    """
    try:
        # Decode and validate image
        image_bytes, error = decode_and_validate_image(request.image_base64)
        if error:
            return NSFWCheckResponse(
                is_safe=False,
                nsfw_score=1.0,
                safe_score=0.0,
                threshold=request.threshold,
                error=error
            )

        # Check for NSFW content
        result = check_nsfw(image_bytes, threshold=request.threshold)

        return NSFWCheckResponse(
            is_safe=result['is_safe'],
            nsfw_score=result['nsfw_score'],
            safe_score=result['safe_score'],
            threshold=result['threshold'],
            error=None
        )
    except Exception as e:
        logger.error(f"Error checking NSFW content: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/toxicity-check", response_model=ToxicityCheckResponse)
async def toxicity_check(request: ToxicityCheckRequest):
    """
    Check if text contains toxic content.

    Uses the detoxify unbiased model to detect toxicity.
    Returns whether the text exceeds the threshold and the toxicity score.
    """
    try:
        detector = get_detector()
        result = detector.check(request.text, threshold=request.threshold)
        return ToxicityCheckResponse(
            is_toxic=result["is_toxic"],
            toxicity_score=result["toxicity_score"],
        )
    except Exception as e:
        logger.error(f"Error checking toxicity: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/resize-avatar", response_model=ResizeAvatarResponse)
async def resize_avatar_endpoint(request: ResizeAvatarRequest):
    """
    Resize an avatar image without NSFW check.

    Accepts base64 encoded image data (with or without data URI prefix).
    Returns resized images (256x256 full, 64x64 icon) as base64 data URIs.
    Used for fast avatar upload with deferred NSFW checking.
    """
    try:
        # Decode and validate image
        image_bytes, error = decode_and_validate_image(request.image_base64)
        if error:
            return ResizeAvatarResponse(
                full_base64=None,
                icon_base64=None,
                error=error
            )

        # Process and resize the avatar (no NSFW check)
        avatar_result = process_avatar(image_bytes)
        if avatar_result['error']:
            return ResizeAvatarResponse(
                full_base64=None,
                icon_base64=None,
                error=f"Failed to process image: {avatar_result['error']}"
            )

        return ResizeAvatarResponse(
            full_base64=avatar_result['full_base64'],
            icon_base64=avatar_result['icon_base64'],
            error=None
        )
    except Exception as e:
        logger.error(f"Error resizing avatar: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process-avatar", response_model=ProcessAvatarResponse)
async def process_avatar_endpoint(request: ProcessAvatarRequest):
    """
    Process an avatar image: validate for NSFW content and resize.

    Accepts base64 encoded image data (with or without data URI prefix).
    Returns resized images (256x256 full, 64x64 icon) as base64 data URIs.
    """
    try:
        # Decode and validate image
        image_bytes, error = decode_and_validate_image(request.image_base64)
        if error:
            return ProcessAvatarResponse(
                is_safe=False,
                full_base64=None,
                icon_base64=None,
                nsfw_score=1.0,
                error=error
            )

        # Check for NSFW content
        nsfw_result = check_nsfw(image_bytes, threshold=request.threshold)
        if not nsfw_result['is_safe']:
            return ProcessAvatarResponse(
                is_safe=False,
                full_base64=None,
                icon_base64=None,
                nsfw_score=nsfw_result['nsfw_score'],
                error="Image contains inappropriate content"
            )

        # Process and resize the avatar
        avatar_result = process_avatar(image_bytes)
        if avatar_result['error']:
            return ProcessAvatarResponse(
                is_safe=True,
                full_base64=None,
                icon_base64=None,
                nsfw_score=nsfw_result['nsfw_score'],
                error=f"Failed to process image: {avatar_result['error']}"
            )

        return ProcessAvatarResponse(
            is_safe=True,
            full_base64=avatar_result['full_base64'],
            icon_base64=avatar_result['icon_base64'],
            nsfw_score=nsfw_result['nsfw_score'],
            error=None
        )
    except Exception as e:
        logger.error(f"Error processing avatar: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/llm/proposal-assist", response_model=ProposalAssistResponse)
async def proposal_assist(request: ProposalAssistRequest):
    """
    Generate AI-enhanced content for a proposal wizard step.

    Uses the configured LLM provider to enhance the user's draft.
    """
    from .proposal_prompts import get_prompt

    try:
        system_prompt = get_prompt(
            template=request.template,
            step=request.step,
            context=request.context,
            previous_sections=request.previous_sections,
            location_name=request.location_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Check if LLM provider is configured
    llm_provider = os.environ.get("LLM_PROVIDER", "").strip()
    api_key = (os.environ.get("ANTHROPIC_API_KEY", "").strip()
               or os.environ.get("OPENAI_API_KEY", "").strip())
    if not llm_provider or not api_key:
        raise HTTPException(
            status_code=503,
            detail="LLM provider not configured. Set LLM_PROVIDER and the appropriate API key.",
        )

    try:
        from .llm_providers import get_provider
        provider = get_provider()
        content = await provider.generate(
            system_prompt=system_prompt,
            user_message=request.user_input,
            max_tokens=2048,
        )
        return ProposalAssistResponse(content=content)
    except Exception as e:
        logger.error(f"Error in proposal assist: {e}")
        raise HTTPException(status_code=500, detail=f"LLM generation failed: {e}")
