"""Unit tests for glossary controller — image upload validation."""

import pytest

# Import the parsing function directly
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'server'))

from candid.controllers.glossary_controller import (
    ALLOWED_IMAGE_TYPES, ALLOWED_EXTENSIONS, MAX_IMAGE_SIZE,
)

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Image upload constants validation
# ---------------------------------------------------------------------------

class TestImageUploadConstants:
    def test_allowed_types_include_common_images(self):
        assert 'image/png' in ALLOWED_IMAGE_TYPES
        assert 'image/jpeg' in ALLOWED_IMAGE_TYPES
        assert 'image/gif' in ALLOWED_IMAGE_TYPES
        assert 'image/webp' in ALLOWED_IMAGE_TYPES
        assert 'image/svg+xml' in ALLOWED_IMAGE_TYPES

    def test_allowed_types_exclude_non_images(self):
        assert 'application/pdf' not in ALLOWED_IMAGE_TYPES
        assert 'text/html' not in ALLOWED_IMAGE_TYPES
        assert 'application/javascript' not in ALLOWED_IMAGE_TYPES

    def test_allowed_extensions_match_types(self):
        assert '.png' in ALLOWED_EXTENSIONS
        assert '.jpg' in ALLOWED_EXTENSIONS
        assert '.jpeg' in ALLOWED_EXTENSIONS
        assert '.gif' in ALLOWED_EXTENSIONS
        assert '.webp' in ALLOWED_EXTENSIONS
        assert '.svg' in ALLOWED_EXTENSIONS

    def test_disallowed_extensions(self):
        assert '.exe' not in ALLOWED_EXTENSIONS
        assert '.js' not in ALLOWED_EXTENSIONS
        assert '.html' not in ALLOWED_EXTENSIONS
        assert '.pdf' not in ALLOWED_EXTENSIONS

    def test_max_size_is_5mb(self):
        assert MAX_IMAGE_SIZE == 5 * 1024 * 1024
