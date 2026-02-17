"""Unit tests for notifications_controller.py — cursor encoding/decoding."""

import json
import base64
import pytest

pytestmark = pytest.mark.unit


# Import the pure functions directly (no DB/auth deps)
from candid.controllers.notifications_controller import _encode_cursor, _decode_cursor


class TestCursorEncoding:
    def test_roundtrip(self):
        created_time = "2026-02-16T10:00:00+00:00"
        item_id = "abc-123"

        cursor = _encode_cursor(created_time, item_id)
        assert isinstance(cursor, str)

        result = _decode_cursor(cursor)
        assert result is not None
        assert result[0] == created_time
        assert result[1] == item_id

    def test_decode_invalid_returns_none(self):
        assert _decode_cursor("not-valid-base64!!!") is None

    def test_decode_empty_returns_none(self):
        assert _decode_cursor("") is None

    def test_encode_produces_url_safe_base64(self):
        cursor = _encode_cursor("2026-02-16T10:00:00", "id-with-dashes")
        # Should not contain +, /, or = (urlsafe variant uses - and _)
        assert "+" not in cursor
        assert "/" not in cursor
