"""NSFW content detection and image processing using NudeNet."""

import base64
import io
import logging
from typing import Dict, Optional, Tuple

from PIL import Image

logger = logging.getLogger(__name__)

# Image size limits
MAX_FILE_SIZE_MB = 5.0
FULL_SIZE = (256, 256)
ICON_SIZE = (64, 64)

# NudeNet classifier - loaded lazily
_classifier = None


def get_classifier():
    """Get or create the NudeNet classifier (lazy loading)."""
    global _classifier
    if _classifier is None:
        logger.info("Loading NudeNet classifier...")
        try:
            # Try newer API first (nudenet >= 3.0)
            from nudenet import NudeDetector
            _classifier = NudeDetector()
            _classifier._api_version = 'v3'
            logger.info("NudeNet detector loaded (v3 API)")
        except ImportError:
            # Fall back to older API
            from nudenet import NudeClassifier
            _classifier = NudeClassifier()
            _classifier._api_version = 'v2'
            logger.info("NudeNet classifier loaded (v2 API)")
    return _classifier


def decode_base64_image(base64_data: str) -> bytes:
    """Decode base64 image data, handling data URI format."""
    # Handle data URI format: data:image/png;base64,xxxx
    if base64_data.startswith('data:'):
        # Extract the base64 part after the comma
        base64_data = base64_data.split(',', 1)[1]
    return base64.b64decode(base64_data)


def validate_image(image_bytes: bytes, max_size_mb: float = 5.0) -> Optional[str]:
    """
    Validate image bytes.

    Returns error message if invalid, None if valid.
    """
    # Check file size
    size_mb = len(image_bytes) / (1024 * 1024)
    if size_mb > max_size_mb:
        return f"Image too large: {size_mb:.1f}MB (max {max_size_mb}MB)"

    # Try to open as image
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.verify()
    except Exception as e:
        return f"Invalid image format: {str(e)}"

    return None


def decode_and_validate_image(base64_data: str) -> Tuple[Optional[bytes], Optional[str]]:
    """Decode base64 image data and validate the result.

    Returns:
        (image_bytes, None) on success, or (None, error_message) on failure.
    """
    try:
        image_bytes = decode_base64_image(base64_data)
    except Exception as e:
        return None, f"Invalid base64 data: {str(e)}"

    validation_error = validate_image(image_bytes)
    if validation_error:
        return None, validation_error

    return image_bytes, None


def check_nsfw(image_bytes: bytes, threshold: float = 0.6) -> Dict:
    """
    Check if an image contains NSFW content.

    Args:
        image_bytes: Raw image bytes
        threshold: Score above which content is considered NSFW (0.0-1.0)

    Returns:
        Dict with 'is_safe', 'nsfw_score', and 'details'
    """
    import tempfile
    import os

    classifier = get_classifier()

    # NudeNet requires a file path, so we save temporarily
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
        f.write(image_bytes)
        temp_path = f.name

    try:
        api_version = getattr(classifier, '_api_version', 'v2')

        if api_version == 'v3':
            # NudeDetector v3 API - returns list of detections
            detections = classifier.detect(temp_path)

            # NSFW classes in NudeDetector v3
            nsfw_classes = {
                'FEMALE_BREAST_EXPOSED', 'FEMALE_GENITALIA_EXPOSED',
                'MALE_GENITALIA_EXPOSED', 'BUTTOCKS_EXPOSED',
                'ANUS_EXPOSED', 'FEMALE_BREAST_COVERED',
                'BELLY_EXPOSED', 'ARMPITS_EXPOSED'
            }

            # Calculate unsafe score based on detections
            unsafe_score = 0.0
            for detection in detections:
                if detection.get('class') in nsfw_classes:
                    # Use the highest confidence NSFW detection
                    unsafe_score = max(unsafe_score, detection.get('score', 0.0))

            safe_score = 1.0 - unsafe_score
            is_safe = unsafe_score < threshold

            return {
                'is_safe': is_safe,
                'nsfw_score': unsafe_score,
                'safe_score': safe_score,
                'threshold': threshold,
                'details': detections
            }
        else:
            # NudeClassifier v2 API
            result = classifier.classify(temp_path)

            # Extract the score for the temp file
            scores = result.get(temp_path, {})
            unsafe_score = scores.get('unsafe', 0.0)
            safe_score = scores.get('safe', 1.0)

            is_safe = unsafe_score < threshold

            return {
                'is_safe': is_safe,
                'nsfw_score': unsafe_score,
                'safe_score': safe_score,
                'threshold': threshold,
                'details': scores
            }
    finally:
        # Clean up temp file
        try:
            os.unlink(temp_path)
        except:
            pass


def resize_image(image_bytes: bytes, size: Tuple[int, int]) -> bytes:
    """
    Resize an image to the specified size (square crop from center).

    Args:
        image_bytes: Raw image bytes
        size: Target size as (width, height) tuple

    Returns:
        Resized image as JPEG bytes
    """
    img = Image.open(io.BytesIO(image_bytes))

    # Convert to RGB if necessary (handles PNG with alpha, etc.)
    if img.mode in ('RGBA', 'LA', 'P'):
        # Create white background
        background = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')

    # Crop to square (center crop)
    width, height = img.size
    min_dim = min(width, height)
    left = (width - min_dim) // 2
    top = (height - min_dim) // 2
    right = left + min_dim
    bottom = top + min_dim
    img = img.crop((left, top, right, bottom))

    # Resize to target size with high quality
    img = img.resize(size, Image.Resampling.LANCZOS)

    # Save as JPEG
    output = io.BytesIO()
    img.save(output, format='JPEG', quality=85, optimize=True)
    return output.getvalue()


def process_avatar(image_bytes: bytes) -> Dict:
    """
    Process an avatar image: validate, resize to full and icon sizes.

    Args:
        image_bytes: Raw image bytes

    Returns:
        Dict with 'full_base64' and 'icon_base64' data URIs, or 'error'
    """
    try:
        # Resize to both sizes
        full_bytes = resize_image(image_bytes, FULL_SIZE)
        icon_bytes = resize_image(image_bytes, ICON_SIZE)

        # Convert to base64 data URIs
        full_base64 = f"data:image/jpeg;base64,{base64.b64encode(full_bytes).decode('utf-8')}"
        icon_base64 = f"data:image/jpeg;base64,{base64.b64encode(icon_bytes).decode('utf-8')}"

        return {
            'full_base64': full_base64,
            'icon_base64': icon_base64,
            'error': None
        }
    except Exception as e:
        logger.error(f"Error processing avatar: {e}")
        return {
            'full_base64': None,
            'icon_base64': None,
            'error': str(e)
        }
