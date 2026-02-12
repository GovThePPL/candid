"""FastAPI application for NLP service."""

import logging
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .embeddings import embedding_model
from .nsfw_detector import decode_and_validate_image, check_nsfw, process_avatar

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup."""
    logger.info(f"Loading embedding model: {embedding_model.model_name}")
    embedding_model.load()
    logger.info(
        f"Model loaded. Dimension: {embedding_model.embedding_dimension}, "
        f"Device: {embedding_model.device}"
    )
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


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check service health and model availability."""
    return HealthResponse(
        status="ok",
        models=["embeddings"],
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
