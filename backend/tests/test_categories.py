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
