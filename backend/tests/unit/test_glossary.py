"""Unit tests for glossary controller — image upload validation and helpers."""

import pytest
from unittest.mock import patch, MagicMock

# Import the parsing function directly
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'server'))

from candid.controllers.glossary_controller import (
    ALLOWED_IMAGE_TYPES, ALLOWED_EXTENSIONS, MAX_IMAGE_SIZE,
)
from candid.controllers.helpers.wiki import _supersede_pending_new_by_slug

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

    def test_svg_not_allowed(self):
        """SVG is excluded to prevent stored XSS via embedded scripts."""
        assert 'image/svg+xml' not in ALLOWED_IMAGE_TYPES
        assert '.svg' not in ALLOWED_EXTENSIONS

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

    def test_disallowed_extensions(self):
        assert '.exe' not in ALLOWED_EXTENSIONS
        assert '.js' not in ALLOWED_EXTENSIONS
        assert '.html' not in ALLOWED_EXTENSIONS
        assert '.pdf' not in ALLOWED_EXTENSIONS

    def test_max_size_is_5mb(self):
        assert MAX_IMAGE_SIZE == 5 * 1024 * 1024


# ---------------------------------------------------------------------------
# _supersede_pending_new_by_slug
# ---------------------------------------------------------------------------

class TestSupersedePendingNewBySlug:
    @patch('candid.controllers.helpers.wiki.db')
    def test_new_term_calls_db_with_correct_params(self, mock_db):
        mock_db.execute_query.return_value = []
        _supersede_pending_new_by_slug("new_term", "test-slug", 42, "user-1")
        mock_db.execute_query.assert_called_once()
        call_args = mock_db.execute_query.call_args
        assert "new_term" in call_args[0][0]
        assert call_args[0][1] == (42, "test-slug")

    @patch('candid.controllers.helpers.wiki.db')
    def test_new_page_calls_db_with_correct_params(self, mock_db):
        mock_db.execute_query.return_value = []
        _supersede_pending_new_by_slug("new_page", "test-page", 99, "user-2")
        mock_db.execute_query.assert_called_once()
        call_args = mock_db.execute_query.call_args
        assert "new_page" in call_args[0][0]
        assert call_args[0][1] == ("test-page", "99", "test-page")

    @patch('candid.controllers.helpers.wiki.db')
    def test_unknown_type_does_nothing(self, mock_db):
        _supersede_pending_new_by_slug("edit_term", "slug", 1, "user")
        mock_db.execute_query.assert_not_called()

    @patch('candid.controllers.helpers.wiki.db')
    def test_notifies_superseded_submitters(self, mock_db):
        mock_db.execute_query.return_value = [{"suggested_by": "user-3"}]
        with patch('candid.controllers.helpers.push_notifications.send_or_queue_notification') as mock_notify:
            _supersede_pending_new_by_slug("new_term", "slug", 1, "admin-1")
            mock_notify.assert_called_once()
            assert mock_notify.call_args[0][3] == "user-3"

    @patch('candid.controllers.helpers.wiki.db')
    def test_no_rows_skips_notification(self, mock_db):
        mock_db.execute_query.return_value = None
        with patch('candid.controllers.helpers.push_notifications.send_or_queue_notification') as mock_notify:
            _supersede_pending_new_by_slug("new_term", "slug", 1, "admin-1")
            mock_notify.assert_not_called()
