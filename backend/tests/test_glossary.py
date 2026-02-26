"""Integration tests for Glossary and Wiki endpoints."""

import pytest
import requests
from conftest import (
    BASE_URL,
    ADMIN1_ID,
    OREGON_LOCATION_ID,
    db_execute,
    db_query_one,
)

GLOSSARY_TERMS_URL = f"{BASE_URL}/glossary/terms"
WIKI_PAGES_URL = f"{BASE_URL}/wiki/pages"
WIKI_PAGE_URL = f"{BASE_URL}/wiki/pages/content"
WIKI_CATEGORIES_URL = f"{BASE_URL}/wiki/categories"
WIKI_PAGE_HISTORY_URL = f"{BASE_URL}/wiki/pages/history"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _cleanup_test_data():
    """Delete test glossary terms and wiki pages after each test."""
    yield
    db_execute("DELETE FROM glossary_term_version WHERE term_id IN (SELECT id FROM glossary_term WHERE slug LIKE 'test-%%')")
    db_execute("DELETE FROM glossary_term_scope WHERE term_id IN (SELECT id FROM glossary_term WHERE slug LIKE 'test-%%')")
    db_execute("DELETE FROM glossary_term WHERE slug LIKE 'test-%%'")
    db_execute("DELETE FROM wiki_page_version WHERE page_id IN (SELECT id FROM wiki_page WHERE slug LIKE 'test-%%')")
    db_execute("DELETE FROM wiki_page_scope WHERE page_id IN (SELECT id FROM wiki_page WHERE slug LIKE 'test-%%')")
    db_execute("DELETE FROM wiki_page WHERE slug LIKE 'test-%%'")


def _seed_test_term(slug="test-filibuster", term="Filibuster", summary="A delay tactic",
                    content="Full article", scope_combine="or", location_ids=None, session_ids=None):
    """Seed a glossary term directly in the DB for testing."""
    db_execute("""
        INSERT INTO glossary_term (slug, term, summary, content, scope_combine)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
    """, (slug, term, summary, content, scope_combine))

    row = db_query_one("SELECT id FROM glossary_term WHERE slug = %s", (slug,))
    if not row:
        return None

    term_id = row["id"]
    for loc_id in (location_ids or []):
        db_execute("""
            INSERT INTO glossary_term_scope (term_id, scope_type, scope_id)
            VALUES (%s, 'location', %s) ON CONFLICT DO NOTHING
        """, (term_id, loc_id))
    for sess_id in (session_ids or []):
        db_execute("""
            INSERT INTO glossary_term_scope (term_id, scope_type, scope_id)
            VALUES (%s, 'session', %s) ON CONFLICT DO NOTHING
        """, (term_id, sess_id))

    return term_id


def _seed_test_page(slug="test-page", title="Test Page", description="Test desc",
                    content="Page content", wiki_category=None, location_ids=None, session_ids=None):
    """Seed a wiki page directly in the DB for testing."""
    db_execute("""
        INSERT INTO wiki_page (slug, title, description, content, wiki_category)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
    """, (slug, title, description, content, wiki_category))

    row = db_query_one("SELECT id FROM wiki_page WHERE slug = %s", (slug,))
    if not row:
        return None

    page_id = str(row["id"])
    for loc_id in (location_ids or []):
        db_execute("""
            INSERT INTO wiki_page_scope (page_id, scope_type, scope_id)
            VALUES (%s, 'location', %s) ON CONFLICT DO NOTHING
        """, (page_id, loc_id))
    for sess_id in (session_ids or []):
        db_execute("""
            INSERT INTO wiki_page_scope (page_id, scope_type, scope_id)
            VALUES (%s, 'session', %s) ON CONFLICT DO NOTHING
        """, (page_id, sess_id))

    return page_id


# ---------------------------------------------------------------------------
# GET /glossary/terms
# ---------------------------------------------------------------------------

class TestGetGlossaryTerms:
    def test_empty_list(self, normal_headers):
        """Returns empty list when no terms exist."""
        db_execute("DELETE FROM glossary_term_scope WHERE term_id IN (SELECT id FROM glossary_term WHERE slug LIKE 'test-%%')")
        db_execute("DELETE FROM glossary_term WHERE slug LIKE 'test-%%'")

        resp = requests.get(GLOSSARY_TERMS_URL, headers=normal_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_returns_seeded_terms(self, normal_headers):
        """Returns terms after seeding."""
        _seed_test_term("test-global-term", "Test Global Term")

        resp = requests.get(GLOSSARY_TERMS_URL, headers=normal_headers)
        assert resp.status_code == 200

        terms = resp.json()
        slugs = [t["slug"] for t in terms]
        assert "test-global-term" in slugs

    def test_term_structure(self, normal_headers):
        """Term has expected fields."""
        _seed_test_term("test-structure", "Test Structure")

        resp = requests.get(GLOSSARY_TERMS_URL, headers=normal_headers)
        assert resp.status_code == 200

        term = next(t for t in resp.json() if t["slug"] == "test-structure")
        assert "slug" in term
        assert "term" in term
        assert "aliases" in term
        assert "scopeCombine" in term
        assert "locationIds" in term
        assert "sessionIds" in term

    def test_location_filter(self, normal_headers):
        """Location filter includes global and location-matching terms."""
        _seed_test_term("test-global", "Test Global")
        _seed_test_term("test-oregon", "Test Oregon",
                        location_ids=[OREGON_LOCATION_ID])

        resp = requests.get(
            GLOSSARY_TERMS_URL,
            headers=normal_headers,
            params={"locationId": OREGON_LOCATION_ID},
        )
        assert resp.status_code == 200

        slugs = [t["slug"] for t in resp.json()]
        assert "test-global" in slugs
        assert "test-oregon" in slugs

    def test_unauthenticated(self):
        """Returns 401 without auth."""
        resp = requests.get(GLOSSARY_TERMS_URL)
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /glossary/terms/{slug}
# ---------------------------------------------------------------------------

class TestGetGlossaryTerm:
    def test_found(self, normal_headers):
        """Returns full term detail."""
        _seed_test_term("test-detail", "Test Detail", summary="Short desc",
                        content="Full article body")

        resp = requests.get(f"{GLOSSARY_TERMS_URL}/test-detail",
                            headers=normal_headers)
        assert resp.status_code == 200

        data = resp.json()
        assert data["slug"] == "test-detail"
        assert data["term"] == "Test Detail"
        assert data["summary"] == "Short desc"
        assert data["content"] == "Full article body"
        assert "updatedAt" in data
        assert "canEdit" in data

    def test_not_found(self, normal_headers):
        """Returns 404 for nonexistent slug."""
        resp = requests.get(f"{GLOSSARY_TERMS_URL}/nonexistent-slug-xyz",
                            headers=normal_headers)
        assert resp.status_code == 404

    def test_admin_can_edit(self, admin_headers):
        """Admin sees canEdit=True."""
        _seed_test_term("test-admin-edit", "Test Admin Edit",
                        location_ids=[OREGON_LOCATION_ID])

        resp = requests.get(f"{GLOSSARY_TERMS_URL}/test-admin-edit",
                            headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["canEdit"] is True


# ---------------------------------------------------------------------------
# PUT /glossary/terms/{slug} (direct edit)
# ---------------------------------------------------------------------------

class TestUpdateGlossaryTerm:
    def test_admin_can_edit(self, admin_headers):
        """Admin can directly edit a term."""
        _seed_test_term("test-direct-edit", "Test Direct Edit",
                        location_ids=[OREGON_LOCATION_ID])

        resp = requests.put(
            f"{GLOSSARY_TERMS_URL}/test-direct-edit",
            headers=admin_headers,
            json={
                "term": "Test Direct Edited",
                "title": "Test Direct Edited",
                "summary": "Updated summary",
                "content": "Updated content",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["term"] == "Test Direct Edited"

        # Version record should exist
        version = db_query_one("""
            SELECT * FROM glossary_term_version
            WHERE term_id = (SELECT id FROM glossary_term WHERE slug = 'test-direct-edit')
        """)
        assert version is not None

    def test_normal_cannot_edit(self, normal_headers):
        """Normal user can't directly edit."""
        _seed_test_term("test-no-edit", "Test No Edit",
                        location_ids=[OREGON_LOCATION_ID])

        resp = requests.put(
            f"{GLOSSARY_TERMS_URL}/test-no-edit",
            headers=normal_headers,
            json={"term": "Nope", "title": "Nope"})
        assert resp.status_code == 403

    def test_not_found(self, admin_headers):
        """Returns 404 for nonexistent slug."""
        resp = requests.put(
            f"{GLOSSARY_TERMS_URL}/nonexistent-slug-xyz",
            headers=admin_headers,
            json={"term": "Nope", "title": "Nope"})
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /wiki/pages, /wiki/pages/{slug}, and /wiki/categories
# ---------------------------------------------------------------------------

class TestWikiPages:
    def test_pages_returns_list(self, normal_headers):
        """Wiki pages endpoint returns a list."""
        resp = requests.get(WIKI_PAGES_URL, headers=normal_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_page_detail(self, normal_headers):
        """Wiki page detail returns content and canEdit."""
        _seed_test_page("test-article", "Test Article", content="Article body")

        resp = requests.get(WIKI_PAGE_URL,
                            headers=normal_headers,
                            params={"slug": "test-article"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["slug"] == "test-article"
        assert data["title"] == "Test Article"
        assert data["content"] == "Article body"
        assert "canEdit" in data

    def test_page_not_found(self, normal_headers):
        """Returns 404 for nonexistent page slug."""
        resp = requests.get(WIKI_PAGE_URL,
                            headers=normal_headers,
                            params={"slug": "nonexistent-page-xyz"})
        assert resp.status_code == 404

    def test_categories_returns_list(self, normal_headers):
        """Wiki categories endpoint returns a list."""
        resp = requests.get(WIKI_CATEGORIES_URL, headers=normal_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_pages_unauthenticated(self):
        """Returns 401 without auth."""
        resp = requests.get(WIKI_PAGES_URL)
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PUT /wiki/page?slug= (direct edit)
# ---------------------------------------------------------------------------

class TestUpdateWikiPage:
    def test_admin_can_edit(self, admin_headers):
        """Admin can directly edit a wiki page."""
        _seed_test_page("test-direct-page", "Test Direct Page",
                        content="Original content",
                        location_ids=[OREGON_LOCATION_ID])

        resp = requests.put(
            WIKI_PAGE_URL,
            headers=admin_headers,
            params={"slug": "test-direct-page"},
            json={
                "title": "Test Direct Page Updated",
                "content": "Updated content",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Test Direct Page Updated"

        # Version record should exist
        version = db_query_one("""
            SELECT * FROM wiki_page_version
            WHERE page_id = (SELECT id FROM wiki_page WHERE slug = 'test-direct-page')
        """)
        assert version is not None

    def test_normal_cannot_edit(self, normal_headers):
        """Normal user can't directly edit a page."""
        _seed_test_page("test-no-edit-page", "Test No Edit Page",
                        location_ids=[OREGON_LOCATION_ID])

        resp = requests.put(
            WIKI_PAGE_URL,
            headers=normal_headers,
            params={"slug": "test-no-edit-page"},
            json={"title": "Nope"})
        assert resp.status_code == 403

    def test_not_found(self, admin_headers):
        """Returns 404 for nonexistent page slug."""
        resp = requests.put(
            WIKI_PAGE_URL,
            headers=admin_headers,
            params={"slug": "nonexistent-page-xyz"},
            json={"title": "Nope"})
        assert resp.status_code == 404

    def test_supersedes_pending_suggestions(self, admin_headers, normal2_headers):
        """Direct edit supersedes pending suggestions for the same page."""
        _seed_test_page("test-supersede-page", "Test Supersede Page",
                        location_ids=[OREGON_LOCATION_ID])

        # Create a suggestion for this page
        resp = requests.post(
            f"{BASE_URL}/wiki/suggestions",
            headers=normal2_headers,
            json={
                "suggestionType": "edit_page",
                "proposedTitle": "Test Suggested Edit",
                "wikiPagePath": "test-supersede-page",
                "proposedScopes": [],
            })
        assert resp.status_code == 201
        suggestion_id = resp.json()["id"]

        # Direct edit the page
        resp = requests.put(
            WIKI_PAGE_URL,
            headers=admin_headers,
            params={"slug": "test-supersede-page"},
            json={"title": "Test Supersede Page Updated"})
        assert resp.status_code == 200

        # Suggestion should be superseded
        sug = db_query_one("SELECT status FROM wiki_suggestion WHERE id = %s", (suggestion_id,))
        assert sug["status"] == "superseded"


# ---------------------------------------------------------------------------
# GET /wiki/page/history
# ---------------------------------------------------------------------------

class TestWikiPageHistory:
    def test_empty_history(self, normal_headers):
        """Page with no edits returns empty history."""
        _seed_test_page("test-history-empty", "Test History Empty",
                        location_ids=[OREGON_LOCATION_ID])

        resp = requests.get(
            WIKI_PAGE_HISTORY_URL,
            headers=normal_headers,
            params={"slug": "test-history-empty"})
        assert resp.status_code == 200
        assert resp.json() == []

    def test_history_after_edit(self, admin_headers):
        """Editing a page creates a version entry in history."""
        _seed_test_page("test-history-edit", "Test History Edit",
                        content="Original content",
                        location_ids=[OREGON_LOCATION_ID])

        # Direct edit creates a version snapshot
        resp = requests.put(
            WIKI_PAGE_URL,
            headers=admin_headers,
            params={"slug": "test-history-edit"},
            json={"title": "Test History Edit Updated", "content": "New content"})
        assert resp.status_code == 200

        resp = requests.get(
            WIKI_PAGE_HISTORY_URL,
            headers=admin_headers,
            params={"slug": "test-history-edit"})
        assert resp.status_code == 200

        versions = resp.json()
        assert len(versions) == 1
        assert versions[0]["title"] == "Test History Edit"
        assert "editedBy" in versions[0]
        assert "editedAt" in versions[0]

    def test_version_detail(self, admin_headers):
        """Version detail returns before/after snapshots."""
        _seed_test_page("test-history-detail", "Test History Detail",
                        content="Original content",
                        location_ids=[OREGON_LOCATION_ID])

        # Edit to create a version
        resp = requests.put(
            WIKI_PAGE_URL,
            headers=admin_headers,
            params={"slug": "test-history-detail"},
            json={"title": "Test History Detail V2", "content": "Updated content"})
        assert resp.status_code == 200

        # Get history
        resp = requests.get(
            WIKI_PAGE_HISTORY_URL,
            headers=admin_headers,
            params={"slug": "test-history-detail"})
        assert resp.status_code == 200
        versions = resp.json()
        assert len(versions) == 1

        # Get version detail
        version_id = versions[0]["id"]
        resp = requests.get(
            f"{BASE_URL}/wiki/pages/versions/{version_id}",
            headers=admin_headers,
            params={"slug": "test-history-detail"})
        assert resp.status_code == 200

        data = resp.json()
        assert data["beforeSnapshot"]["title"] == "Test History Detail"
        assert data["beforeSnapshot"]["content"] == "Original content"
        assert data["afterSnapshot"]["title"] == "Test History Detail V2"
        assert data["afterSnapshot"]["content"] == "Updated content"

    def test_not_found(self, normal_headers):
        """Returns 404 for nonexistent page."""
        resp = requests.get(
            WIKI_PAGE_HISTORY_URL,
            headers=normal_headers,
            params={"slug": "nonexistent-page-xyz"})
        assert resp.status_code == 404

    def test_any_user_can_view(self, normal_headers, admin_headers):
        """Any authenticated user can view history, not just editors."""
        _seed_test_page("test-history-access", "Test History Access",
                        content="Content",
                        location_ids=[OREGON_LOCATION_ID])

        # Admin edits to create history
        requests.put(
            WIKI_PAGE_URL,
            headers=admin_headers,
            params={"slug": "test-history-access"},
            json={"title": "Test History Access Updated"})

        # Normal user can view history
        resp = requests.get(
            WIKI_PAGE_HISTORY_URL,
            headers=normal_headers,
            params={"slug": "test-history-access"})
        assert resp.status_code == 200
        assert len(resp.json()) == 1


# ---------------------------------------------------------------------------
# GET /glossary/terms/{slug}/history
# ---------------------------------------------------------------------------

class TestGlossaryTermHistory:
    def test_empty_history(self, normal_headers):
        """Term with no edits returns empty history."""
        _seed_test_term("test-term-history-empty", "Test Term History Empty",
                        location_ids=[OREGON_LOCATION_ID])

        resp = requests.get(
            f"{GLOSSARY_TERMS_URL}/test-term-history-empty/history",
            headers=normal_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_history_after_edit(self, admin_headers):
        """Editing a term creates a version entry."""
        _seed_test_term("test-term-history-edit", "Test Term History Edit",
                        location_ids=[OREGON_LOCATION_ID])

        # Direct edit
        resp = requests.put(
            f"{GLOSSARY_TERMS_URL}/test-term-history-edit",
            headers=admin_headers,
            json={"term": "Test Term History Edit Updated", "content": "New content"})
        assert resp.status_code == 200

        resp = requests.get(
            f"{GLOSSARY_TERMS_URL}/test-term-history-edit/history",
            headers=admin_headers)
        assert resp.status_code == 200

        versions = resp.json()
        assert len(versions) == 1
        assert versions[0]["title"] == "Test Term History Edit"

    def test_version_detail(self, admin_headers):
        """Term version detail returns before/after snapshots with aliases."""
        _seed_test_term("test-term-history-detail", "Test Term History Detail",
                        summary="Old summary", content="Old content",
                        location_ids=[OREGON_LOCATION_ID])

        requests.put(
            f"{GLOSSARY_TERMS_URL}/test-term-history-detail",
            headers=admin_headers,
            json={"term": "Test Term V2", "summary": "New summary", "content": "New content"})

        resp = requests.get(
            f"{GLOSSARY_TERMS_URL}/test-term-history-detail/history",
            headers=admin_headers)
        versions = resp.json()
        assert len(versions) == 1

        version_id = versions[0]["id"]
        resp = requests.get(
            f"{GLOSSARY_TERMS_URL}/test-term-history-detail/history/{version_id}",
            headers=admin_headers)
        assert resp.status_code == 200

        data = resp.json()
        assert data["beforeSnapshot"]["title"] == "Test Term History Detail"
        assert data["beforeSnapshot"]["summary"] == "Old summary"
        assert data["afterSnapshot"]["title"] == "Test Term V2"
        assert data["afterSnapshot"]["summary"] == "New summary"
        assert "aliases" in data["beforeSnapshot"]

    def test_not_found(self, normal_headers):
        """Returns 404 for nonexistent term."""
        resp = requests.get(
            f"{GLOSSARY_TERMS_URL}/nonexistent-slug-xyz/history",
            headers=normal_headers)
        assert resp.status_code == 404
