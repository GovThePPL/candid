"""Unit tests for cache_headers.py — HTTP caching utilities."""

import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# parse_http_date / format_http_date
# ---------------------------------------------------------------------------

class TestHttpDateParsing:
    def test_roundtrip(self):
        from candid.controllers.helpers.cache_headers import parse_http_date, format_http_date
        dt = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        formatted = format_http_date(dt)
        parsed = parse_http_date(formatted)
        assert parsed is not None
        assert parsed.year == 2024
        assert parsed.month == 1
        assert parsed.day == 15

    def test_parse_none(self):
        from candid.controllers.helpers.cache_headers import parse_http_date
        assert parse_http_date(None) is None

    def test_parse_empty(self):
        from candid.controllers.helpers.cache_headers import parse_http_date
        assert parse_http_date("") is None

    def test_parse_invalid(self):
        from candid.controllers.helpers.cache_headers import parse_http_date
        assert parse_http_date("not-a-date") is None

    def test_format_none(self):
        from candid.controllers.helpers.cache_headers import format_http_date
        assert format_http_date(None) is None

    def test_format_naive_datetime(self):
        from candid.controllers.helpers.cache_headers import format_http_date
        dt = datetime(2024, 6, 1, 10, 30, 0)
        result = format_http_date(dt)
        assert result is not None
        assert "GMT" in result


# ---------------------------------------------------------------------------
# generate_etag
# ---------------------------------------------------------------------------

class TestGenerateEtag:
    def test_deterministic(self):
        from candid.controllers.helpers.cache_headers import generate_etag
        assert generate_etag("hello") == generate_etag("hello")

    def test_weak_prefix(self):
        from candid.controllers.helpers.cache_headers import generate_etag
        etag = generate_etag("test data")
        assert etag.startswith('W/"')
        assert etag.endswith('"')

    def test_none_input(self):
        from candid.controllers.helpers.cache_headers import generate_etag
        assert generate_etag(None) is None

    def test_different_data_different_etag(self):
        from candid.controllers.helpers.cache_headers import generate_etag
        assert generate_etag("abc") != generate_etag("xyz")

    def test_dict_input(self):
        from candid.controllers.helpers.cache_headers import generate_etag
        etag = generate_etag({"key": "value"})
        assert etag is not None
        assert etag.startswith('W/"')


# ---------------------------------------------------------------------------
# check_not_modified (requires Flask request context)
# ---------------------------------------------------------------------------

class TestCheckNotModified:
    def _make_app(self):
        from flask import Flask
        return Flask(__name__)

    def test_etag_match(self):
        from candid.controllers.helpers.cache_headers import check_not_modified
        app = self._make_app()
        with app.test_request_context(headers={"If-None-Match": 'W/"abc123"'}):
            assert check_not_modified(etag='W/"abc123"') is True

    def test_etag_weak_comparison(self):
        """W/\"abc\" should match \"abc\" (weak comparison)."""
        from candid.controllers.helpers.cache_headers import check_not_modified
        app = self._make_app()
        with app.test_request_context(headers={"If-None-Match": '"abc123"'}):
            assert check_not_modified(etag='W/"abc123"') is True

    def test_etag_no_match(self):
        from candid.controllers.helpers.cache_headers import check_not_modified
        app = self._make_app()
        with app.test_request_context(headers={"If-None-Match": '"different"'}):
            assert check_not_modified(etag='W/"abc123"') is False

    def test_if_modified_since_not_modified(self):
        from candid.controllers.helpers.cache_headers import check_not_modified, format_http_date
        app = self._make_app()
        server_time = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        client_time_str = format_http_date(datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc))
        with app.test_request_context(headers={"If-Modified-Since": client_time_str}):
            assert check_not_modified(last_modified=server_time) is True

    def test_if_modified_since_modified(self):
        from candid.controllers.helpers.cache_headers import check_not_modified, format_http_date
        app = self._make_app()
        server_time = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        client_time_str = format_http_date(datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc))
        with app.test_request_context(headers={"If-Modified-Since": client_time_str}):
            assert check_not_modified(last_modified=server_time) is False

    def test_no_headers_returns_false(self):
        from candid.controllers.helpers.cache_headers import check_not_modified
        app = self._make_app()
        with app.test_request_context():
            assert check_not_modified() is False

    def test_no_args_returns_false(self):
        from candid.controllers.helpers.cache_headers import check_not_modified
        app = self._make_app()
        with app.test_request_context(headers={"If-None-Match": '"abc"'}):
            assert check_not_modified() is False


# ---------------------------------------------------------------------------
# add_cache_headers
# ---------------------------------------------------------------------------

class TestAddCacheHeaders:
    def test_adds_last_modified(self):
        from flask import Flask
        from candid.controllers.helpers.cache_headers import add_cache_headers
        app = Flask(__name__)
        with app.test_request_context():
            from flask import make_response
            resp = make_response("ok")
            dt = datetime(2024, 3, 15, 10, 0, 0, tzinfo=timezone.utc)
            add_cache_headers(resp, last_modified=dt)
            assert "Last-Modified" in resp.headers

    def test_adds_etag(self):
        from flask import Flask
        from candid.controllers.helpers.cache_headers import add_cache_headers
        app = Flask(__name__)
        with app.test_request_context():
            from flask import make_response
            resp = make_response("ok")
            add_cache_headers(resp, etag_data="test")
            assert resp.headers.get("ETag", "").startswith('W/"')

    def test_adds_cache_control(self):
        from flask import Flask
        from candid.controllers.helpers.cache_headers import add_cache_headers
        app = Flask(__name__)
        with app.test_request_context():
            from flask import make_response
            resp = make_response("ok")
            add_cache_headers(resp, max_age=300)
            assert resp.headers.get("Cache-Control") == "max-age=300"


# ---------------------------------------------------------------------------
# Benchmarks
# ---------------------------------------------------------------------------

@pytest.mark.benchmark(group="generate_etag")
@pytest.mark.parametrize("size", [100, 10000])
def test_bench_generate_etag(benchmark, size):
    from candid.controllers.helpers.cache_headers import generate_etag
    data = "x" * size
    benchmark(generate_etag, data)
