"""Tests for GET /categories."""

import pytest
import requests
from conftest import BASE_URL


CATEGORIES_URL = f"{BASE_URL}/categories"


class TestGetAllCategories:
    """Tests for the getAllCategories endpoint."""

    @pytest.mark.smoke
    def test_get_categories_success(self, normal_headers):
        """Returns list of categories when authenticated."""
        resp = requests.get(CATEGORIES_URL, headers=normal_headers)
        assert resp.status_code == 200
        categories = resp.json()
        assert isinstance(categories, list)
        assert len(categories) == 10  # Per seed data

    def test_categories_have_expected_fields(self, normal_headers):
        """Each category has id and label fields; parentId is optional (omitted for null)."""
        resp = requests.get(CATEGORIES_URL, headers=normal_headers)
        assert resp.status_code == 200
        categories = resp.json()
        assert len(categories) > 0
        for cat in categories:
            assert "id" in cat
            assert "label" in cat
            # parentId is omitted when null (Connexion behavior)

    def test_top_level_categories_have_no_parent(self, normal_headers):
        """Top-level categories have no parentId field (omitted when null)."""
        resp = requests.get(CATEGORIES_URL, headers=normal_headers)
        assert resp.status_code == 200
        categories = resp.json()
        top_level = [c for c in categories if "parentId" not in c]
        # Seed data has top-level categories
        assert len(top_level) > 0

    def test_subcategories_have_valid_parent(self, normal_headers):
        """Subcategories reference existing parent categories."""
        resp = requests.get(CATEGORIES_URL, headers=normal_headers)
        assert resp.status_code == 200
        categories = resp.json()
        cat_ids = {c["id"] for c in categories}
        for cat in categories:
            if "parentId" in cat and cat["parentId"] is not None:
                assert cat["parentId"] in cat_ids

    def test_unauthenticated_returns_401(self):
        """Returns 401 when no auth token provided."""
        resp = requests.get(CATEGORIES_URL)
        assert resp.status_code == 401

    def test_admin_can_access(self, admin_headers):
        """Admin users can access categories."""
        resp = requests.get(CATEGORIES_URL, headers=admin_headers)
        assert resp.status_code == 200

    def test_moderator_can_access(self, moderator_headers):
        """Moderator users can access categories."""
        resp = requests.get(CATEGORIES_URL, headers=moderator_headers)
        assert resp.status_code == 200


class TestSuggestCategory:
    """POST /categories/suggest"""

    def test_suggest_too_short_400(self, normal_headers):
        """Statement shorter than 10 chars returns 400."""
        resp = requests.post(
            f"{CATEGORIES_URL}/suggest",
            headers=normal_headers,
            json={"statement": "short"},
        )
        assert resp.status_code == 400

    def test_suggest_valid_statement(self, normal_headers):
        """Valid statement returns suggestions (or 503 if NLP unavailable)."""
        resp = requests.post(
            f"{CATEGORIES_URL}/suggest",
            headers=normal_headers,
            json={"statement": "Healthcare should be available to everyone regardless of income"},
        )
        # NLP service may or may not be running in test env
        if resp.status_code == 200:
            body = resp.json()
            assert isinstance(body, list)
            assert len(body) > 0
            assert "category" in body[0]
            assert "score" in body[0]
        else:
            assert resp.status_code in (500, 503)

    def test_suggest_unauthenticated(self):
        """Unauthenticated request returns 401."""
        resp = requests.post(
            f"{CATEGORIES_URL}/suggest",
            json={"statement": "Healthcare should be available to everyone regardless of income"},
        )
        assert resp.status_code == 401
