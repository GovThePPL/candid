"""Tests for NSFW detection and image processing functions."""

import base64
import io
import os
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image

from app.nsfw_detector import (
    check_nsfw,
    decode_base64_image,
    process_avatar,
    resize_image,
    validate_image,
)


class TestDecodeBase64Image:
    """Test base64 image decoding."""

    def test_plain_base64(self, small_png_bytes):
        encoded = base64.b64encode(small_png_bytes).decode("utf-8")
        result = decode_base64_image(encoded)
        assert result == small_png_bytes

    def test_data_uri_strips_prefix(self, small_png_bytes):
        encoded = base64.b64encode(small_png_bytes).decode("utf-8")
        data_uri = f"data:image/png;base64,{encoded}"
        result = decode_base64_image(data_uri)
        assert result == small_png_bytes

    def test_invalid_raises(self):
        with pytest.raises(Exception):
            decode_base64_image("not-valid-base64!!!")


class TestValidateImage:
    """Test image validation."""

    def test_valid_returns_none(self, small_png_bytes):
        assert validate_image(small_png_bytes) is None

    def test_oversized_returns_error(self, small_png_bytes):
        # Set max to something tiny so our small image exceeds it
        error = validate_image(small_png_bytes, max_size_mb=0.000001)
        assert error is not None
        assert "too large" in error.lower()

    def test_corrupted_returns_error(self):
        error = validate_image(b"not an image at all")
        assert error is not None
        assert "invalid image" in error.lower()


class TestCheckNsfw:
    """Test NSFW checking with mocked classifier."""

    def test_safe_v3(self, small_png_bytes, mock_nudenet):
        """No NSFW detections → safe."""
        mock_nudenet.detect.return_value = []
        result = check_nsfw(small_png_bytes)
        assert result["is_safe"] is True
        assert result["nsfw_score"] == 0.0
        assert result["safe_score"] == 1.0

    def test_unsafe_v3_above_threshold(self, small_png_bytes, mock_nudenet):
        """High-confidence NSFW detection → unsafe."""
        mock_nudenet.detect.return_value = [
            {"class": "FEMALE_BREAST_EXPOSED", "score": 0.9}
        ]
        result = check_nsfw(small_png_bytes, threshold=0.6)
        assert result["is_safe"] is False
        assert result["nsfw_score"] == 0.9
        assert result["threshold"] == 0.6

    def test_below_threshold_safe(self, small_png_bytes, mock_nudenet):
        """Low-confidence NSFW detection below threshold → safe."""
        mock_nudenet.detect.return_value = [
            {"class": "BELLY_EXPOSED", "score": 0.3}
        ]
        result = check_nsfw(small_png_bytes, threshold=0.6)
        assert result["is_safe"] is True
        assert result["nsfw_score"] == 0.3

    def test_v2_api_fallback(self, small_png_bytes):
        """Test v2 API code path (NudeClassifier)."""
        mock_classifier = MagicMock()
        mock_classifier._api_version = "v2"

        def _classify(path):
            return {path: {"unsafe": 0.8, "safe": 0.2}}

        mock_classifier.classify.side_effect = _classify

        with patch("app.nsfw_detector.get_classifier", return_value=mock_classifier):
            result = check_nsfw(small_png_bytes, threshold=0.6)

        assert result["is_safe"] is False
        assert result["nsfw_score"] == 0.8
        assert result["safe_score"] == 0.2

    def test_temp_file_cleanup(self, small_png_bytes, mock_nudenet):
        """Temp file should not exist after check_nsfw completes."""
        # Track the temp path used
        temp_paths = []
        original_detect = mock_nudenet.detect

        def _track_detect(path):
            temp_paths.append(path)
            return []

        mock_nudenet.detect.side_effect = _track_detect
        check_nsfw(small_png_bytes)
        assert len(temp_paths) == 1
        assert not os.path.exists(temp_paths[0])


class TestResizeImage:
    """Test image resizing and format conversion."""

    def test_square_jpeg_output(self, small_png_bytes):
        result = resize_image(small_png_bytes, (64, 64))
        # Should be valid JPEG
        img = Image.open(io.BytesIO(result))
        assert img.format == "JPEG"

    def test_correct_dimensions(self, small_png_bytes):
        result = resize_image(small_png_bytes, (128, 128))
        img = Image.open(io.BytesIO(result))
        assert img.size == (128, 128)

    def test_rgba_to_rgb(self, rgba_png_bytes):
        """RGBA PNG should be converted to RGB JPEG."""
        result = resize_image(rgba_png_bytes, (32, 32))
        img = Image.open(io.BytesIO(result))
        assert img.mode == "RGB"
        assert img.size == (32, 32)


class TestProcessAvatar:
    """Test avatar processing pipeline."""

    def test_success_both_sizes(self, small_png_bytes):
        result = process_avatar(small_png_bytes)
        assert result["error"] is None
        assert result["full_base64"].startswith("data:image/jpeg;base64,")
        assert result["icon_base64"].startswith("data:image/jpeg;base64,")
        # Verify full is 256x256
        full_data = base64.b64decode(result["full_base64"].split(",", 1)[1])
        full_img = Image.open(io.BytesIO(full_data))
        assert full_img.size == (256, 256)
        # Verify icon is 64x64
        icon_data = base64.b64decode(result["icon_base64"].split(",", 1)[1])
        icon_img = Image.open(io.BytesIO(icon_data))
        assert icon_img.size == (64, 64)

    def test_error_returns_error_dict(self):
        result = process_avatar(b"not an image")
        assert result["error"] is not None
        assert result["full_base64"] is None
        assert result["icon_base64"] is None
