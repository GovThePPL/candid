"""Integration tests for Wiki Suggestion endpoints."""

import json
import pytest
import requests
from conftest import (
    BASE_URL,
    ADMIN1_ID,
    NORMAL1_ID,
    NORMAL2_ID,
    OREGON_LOCATION_ID,
    HEALTHCARE_SESSION_ID,
    db_execute,
    db_execute_returning,
    db_query_one,
)

SUGGESTIONS_URL = f"{BASE_URL}/wiki/suggestions"
SUGGESTION_COUNT_URL = f"{BASE_URL}/wiki/suggestions/count"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _cleanup_suggestions():
    """Delete test suggestions, terms, and pages after each test."""
    yield
    db_execute("DELETE FROM wiki_suggestion WHERE proposed_title LIKE 'Test%%'")
    db_execute("DELETE FROM glossary_term_version WHERE term_id IN "
               "(SELECT id FROM glossary_term WHERE slug LIKE 'test-%%')")
    db_execute("DELETE FROM glossary_term_scope WHERE term_id IN "
               "(SELECT id FROM glossary_term WHERE slug LIKE 'test-%%')")
    db_execute("DELETE FROM glossary_term WHERE slug LIKE 'test-%%'")
    db_execute("DELETE FROM wiki_page_version WHERE page_id IN "
               "(SELECT id FROM wiki_page WHERE slug LIKE 'test-%%')")
    db_execute("DELETE FROM wiki_page_scope WHERE page_id IN "
               "(SELECT id FROM wiki_page WHERE slug LIKE 'test-%%')")
    db_execute("DELETE FROM wiki_page WHERE slug LIKE 'test-%%'")


def _seed_test_term(slug="test-suggest-term", term="Test Suggest Term"):
    """Seed a glossary term for edit suggestions."""
    db_execute("""
        INSERT INTO glossary_term (slug, term, summary, content, scope_combine)
        VALUES (%s, %s, 'Summary', 'Content', 'or')
        ON CONFLICT (slug) DO UPDATE SET term = EXCLUDED.term
    """, (slug, term))
    row = db_query_one("SELECT id FROM glossary_term WHERE slug = %s", (slug,))
    if row:
        db_execute("""
            INSERT INTO glossary_term_scope (term_id, scope_type, scope_id)
            VALUES (%s, 'location', %s) ON CONFLICT DO NOTHING
        """, (row["id"], OREGON_LOCATION_ID))
    return row["id"] if row else None


def _create_suggestion(headers, **overrides):
    """Helper to create a suggestion with defaults."""
    body = {
        "suggestionType": "new_term",
        "proposedTitle": "Test New Term",
        "proposedAliases": ["alias1"],
        "proposedSummary": "A summary",
        "proposedContent": "Full content",
        "proposedScopes": [{"type": "location", "id": OREGON_LOCATION_ID}],
        "proposedScopeCombine": "or",
        "suggestionReason": "Needed for clarity",
    }
    body.update(overrides)
    return requests.post(SUGGESTIONS_URL, headers=headers, json=body)


# ---------------------------------------------------------------------------
# POST /wiki/suggestions
# ---------------------------------------------------------------------------

class TestCreateSuggestion:
    def test_create_new_term(self, normal2_headers):
        """Normal user can submit a new term suggestion."""
        resp = _create_suggestion(normal2_headers)
        assert resp.status_code == 201

        data = resp.json()
        assert data["suggestionType"] == "new_term"
        assert data["proposedTitle"] == "Test New Term"
        assert data["status"] == "pending"
        assert data["suggestedBy"]["id"] == NORMAL2_ID
        assert data["proposedScopes"] is not None

    def test_create_new_page(self, normal2_headers):
        """Normal user can submit a new page suggestion."""
        resp = _create_suggestion(normal2_headers,
                                  suggestionType="new_page",
                                  proposedTitle="Test New Page",
                                  proposedScopes=[])
        assert resp.status_code == 201
        assert resp.json()["suggestionType"] == "new_page"

    def test_create_edit_term(self, normal2_headers):
        """Can suggest edits to an existing term."""
        term_id = _seed_test_term()
        resp = _create_suggestion(
            normal2_headers,
            suggestionType="edit_term",
            proposedTitle="Test Edited Term",
            glossaryTermId=term_id,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["suggestionType"] == "edit_term"
        assert data["glossaryTermId"] == term_id
        assert data["originalUpdatedAt"] is not None

    def test_title_required(self, normal2_headers):
        """Rejects suggestion without title."""
        resp = _create_suggestion(normal2_headers, proposedTitle="")
        assert resp.status_code == 400

    def test_scopes_required_for_terms(self, normal2_headers):
        """Term suggestions require scope tags."""
        resp = _create_suggestion(normal2_headers, proposedScopes=[])
        assert resp.status_code == 400

    def test_scopes_optional_for_pages(self, normal2_headers):
        """Page suggestions don't require scope tags."""
        resp = _create_suggestion(normal2_headers,
                                  suggestionType="new_page",
                                  proposedTitle="Test Page No Scopes",
                                  proposedScopes=[])
        assert resp.status_code == 201

    def test_edit_term_requires_term_id(self, normal2_headers):
        """edit_term requires glossaryTermId."""
        resp = _create_suggestion(normal2_headers,
                                  suggestionType="edit_term",
                                  proposedTitle="Test Edit Missing ID")
        assert resp.status_code == 400

    def test_edit_term_nonexistent(self, normal2_headers):
        """edit_term with nonexistent term ID returns 404."""
        resp = _create_suggestion(normal2_headers,
                                  suggestionType="edit_term",
                                  proposedTitle="Test Edit Bad ID",
                                  glossaryTermId=999999)
        assert resp.status_code == 404

    def test_rate_limit(self, normal2_headers):
        """Max 5 pending suggestions per user."""
        for i in range(5):
            resp = _create_suggestion(normal2_headers,
                                      proposedTitle=f"Test Rate {i}")
            assert resp.status_code == 201

        resp = _create_suggestion(normal2_headers,
                                  proposedTitle="Test Rate 6th")
        assert resp.status_code == 429

    def test_no_duplicate_edit(self, normal2_headers):
        """Can't have two pending edits for the same term by same user."""
        term_id = _seed_test_term()
        resp1 = _create_suggestion(normal2_headers,
                                   suggestionType="edit_term",
                                   proposedTitle="Test Edit 1",
                                   glossaryTermId=term_id)
        assert resp1.status_code == 201

        resp2 = _create_suggestion(normal2_headers,
                                   suggestionType="edit_term",
                                   proposedTitle="Test Edit 2",
                                   glossaryTermId=term_id)
        assert resp2.status_code == 400

    def test_unauthenticated(self):
        """Returns 401 without auth."""
        resp = requests.post(SUGGESTIONS_URL, json={
            "suggestionType": "new_term",
            "proposedTitle": "Test Unauth",
            "proposedScopes": [{"type": "location", "id": OREGON_LOCATION_ID}],
        })
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /wiki/suggestions
# ---------------------------------------------------------------------------

class TestGetSuggestions:
    def test_mine_view(self, normal2_headers):
        """Returns user's own suggestions."""
        _create_suggestion(normal2_headers, proposedTitle="Test Mine View")
        resp = requests.get(SUGGESTIONS_URL,
                            headers=normal2_headers,
                            params={"view": "mine"})
        assert resp.status_code == 200
        data = resp.json()
        assert any(s["proposedTitle"] == "Test Mine View" for s in data)

    def test_pending_view_reviewer(self, admin_headers, normal2_headers):
        """Admin sees pending suggestions in review queue."""
        _create_suggestion(normal2_headers, proposedTitle="Test Pending Review")
        resp = requests.get(SUGGESTIONS_URL,
                            headers=admin_headers,
                            params={"view": "pending"})
        assert resp.status_code == 200
        data = resp.json()
        assert any(s["proposedTitle"] == "Test Pending Review" for s in data)

    def test_pending_view_non_reviewer(self, normal3_headers, normal2_headers):
        """Non-reviewer sees empty pending queue."""
        _create_suggestion(normal2_headers, proposedTitle="Test Not Visible")
        resp = requests.get(SUGGESTIONS_URL,
                            headers=normal3_headers,
                            params={"view": "pending"})
        assert resp.status_code == 200
        # normal3 has no reviewer roles — should not see pending suggestions
        data = resp.json()
        assert not any(s["proposedTitle"] == "Test Not Visible" for s in data)

    def test_default_view_is_mine(self, normal2_headers):
        """Default view parameter is 'mine'."""
        _create_suggestion(normal2_headers, proposedTitle="Test Default View")
        resp = requests.get(SUGGESTIONS_URL, headers=normal2_headers)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# GET /wiki/suggestions/{id}
# ---------------------------------------------------------------------------

class TestGetSuggestionDetail:
    def test_detail(self, normal2_headers):
        """Returns full suggestion detail."""
        create_resp = _create_suggestion(normal2_headers, proposedTitle="Test Detail")
        suggestion_id = create_resp.json()["id"]

        resp = requests.get(f"{SUGGESTIONS_URL}/{suggestion_id}",
                            headers=normal2_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["proposedTitle"] == "Test Detail"
        assert "isStale" in data

    def test_not_found(self, normal2_headers):
        """Returns 404 for nonexistent suggestion."""
        resp = requests.get(f"{SUGGESTIONS_URL}/00000000-0000-0000-0000-000000000000",
                            headers=normal2_headers)
        assert resp.status_code == 404

    def test_stale_detection(self, normal2_headers, admin_headers):
        """isStale is true when term was updated after suggestion."""
        term_id = _seed_test_term()
        create_resp = _create_suggestion(
            normal2_headers,
            suggestionType="edit_term",
            proposedTitle="Test Stale Check",
            glossaryTermId=term_id)
        suggestion_id = create_resp.json()["id"]

        # Update the term to make suggestion stale
        db_execute("UPDATE glossary_term SET updated_at = NOW() + interval '1 hour' WHERE id = %s",
                   (term_id,))

        resp = requests.get(f"{SUGGESTIONS_URL}/{suggestion_id}",
                            headers=normal2_headers)
        assert resp.status_code == 200
        assert resp.json()["isStale"] is True


# ---------------------------------------------------------------------------
# PUT /wiki/suggestions/{id}
# ---------------------------------------------------------------------------

class TestReviewSuggestion:
    def test_approve_new_term(self, admin_headers, normal2_headers):
        """Admin can approve a new term suggestion — creates the term."""
        create_resp = _create_suggestion(normal2_headers,
                                         proposedTitle="Test Approve Term")
        suggestion_id = create_resp.json()["id"]

        resp = requests.put(
            f"{SUGGESTIONS_URL}/{suggestion_id}",
            headers=admin_headers,
            json={"status": "approved"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"
        assert resp.json()["reviewedBy"] is not None

        # Term should exist in DB
        term = db_query_one(
            "SELECT * FROM glossary_term WHERE slug = 'test-approve-term'")
        assert term is not None
        assert term["term"] == "Test Approve Term"

    def test_deny(self, admin_headers, normal2_headers):
        """Admin can deny with a review note."""
        create_resp = _create_suggestion(normal2_headers,
                                         proposedTitle="Test Deny Term")
        suggestion_id = create_resp.json()["id"]

        resp = requests.put(
            f"{SUGGESTIONS_URL}/{suggestion_id}",
            headers=admin_headers,
            json={"status": "denied", "reviewNote": "Not appropriate"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "denied"
        assert resp.json()["reviewNote"] == "Not appropriate"

    def test_withdraw(self, normal2_headers):
        """Submitter can withdraw their pending suggestion."""
        create_resp = _create_suggestion(normal2_headers,
                                         proposedTitle="Test Withdraw Term")
        suggestion_id = create_resp.json()["id"]

        resp = requests.put(
            f"{SUGGESTIONS_URL}/{suggestion_id}",
            headers=normal2_headers,
            json={"status": "withdrawn"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "withdrawn"

    def test_non_submitter_cannot_withdraw(self, admin_headers, normal2_headers):
        """Only submitter can withdraw."""
        create_resp = _create_suggestion(normal2_headers,
                                         proposedTitle="Test Withdraw Fail")
        suggestion_id = create_resp.json()["id"]

        resp = requests.put(
            f"{SUGGESTIONS_URL}/{suggestion_id}",
            headers=admin_headers,
            json={"status": "withdrawn"})
        assert resp.status_code == 403

    def test_non_reviewer_cannot_approve(self, normal3_headers, normal2_headers):
        """Non-reviewer can't approve."""
        create_resp = _create_suggestion(normal2_headers,
                                         proposedTitle="Test No Auth Approve")
        suggestion_id = create_resp.json()["id"]

        resp = requests.put(
            f"{SUGGESTIONS_URL}/{suggestion_id}",
            headers=normal3_headers,
            json={"status": "approved"})
        assert resp.status_code == 403

    def test_cannot_review_already_reviewed(self, admin_headers, normal2_headers):
        """Can't approve an already-denied suggestion."""
        create_resp = _create_suggestion(normal2_headers,
                                         proposedTitle="Test Double Review")
        suggestion_id = create_resp.json()["id"]

        # Deny first
        requests.put(f"{SUGGESTIONS_URL}/{suggestion_id}",
                     headers=admin_headers,
                     json={"status": "denied"})

        # Try to approve
        resp = requests.put(
            f"{SUGGESTIONS_URL}/{suggestion_id}",
            headers=admin_headers,
            json={"status": "approved"})
        assert resp.status_code == 400

    def test_approve_supersedes_others(self, admin_headers, normal2_headers, normal3_headers):
        """Approving one suggestion supersedes other pending ones for same item."""
        term_id = _seed_test_term()

        # Two different users suggest edits to the same term
        resp1 = _create_suggestion(normal2_headers,
                                   suggestionType="edit_term",
                                   proposedTitle="Test Supersede A",
                                   glossaryTermId=term_id)
        resp2 = _create_suggestion(normal3_headers,
                                   suggestionType="edit_term",
                                   proposedTitle="Test Supersede B",
                                   glossaryTermId=term_id)
        id1 = resp1.json()["id"]
        id2 = resp2.json()["id"]

        # Approve the first
        requests.put(f"{SUGGESTIONS_URL}/{id1}",
                     headers=admin_headers,
                     json={"status": "approved"})

        # Second should be superseded
        detail = requests.get(f"{SUGGESTIONS_URL}/{id2}",
                              headers=admin_headers)
        assert detail.json()["status"] == "superseded"


# ---------------------------------------------------------------------------
# GET /wiki/suggestions/count
# ---------------------------------------------------------------------------

class TestSuggestionCount:
    def test_count_for_reviewer(self, admin_headers, normal2_headers):
        """Admin sees correct pending count."""
        _create_suggestion(normal2_headers, proposedTitle="Test Count 1")
        _create_suggestion(normal2_headers, proposedTitle="Test Count 2")

        resp = requests.get(SUGGESTION_COUNT_URL, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["count"] >= 2

    def test_count_for_non_reviewer(self, normal3_headers):
        """Non-reviewer sees 0 pending."""
        resp = requests.get(SUGGESTION_COUNT_URL, headers=normal3_headers)
        assert resp.status_code == 200
        assert resp.json()["count"] == 0

    def test_unauthenticated(self):
        """Returns 401 without auth."""
        resp = requests.get(SUGGESTION_COUNT_URL)
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Edit & Approve: Two-version history
# ---------------------------------------------------------------------------

def _seed_test_page(slug="test-suggest-page", title="Test Suggest Page"):
    """Seed a wiki page for edit suggestions."""
    db_execute("""
        INSERT INTO wiki_page (slug, title, description, content, wiki_category, scope_combine, created_by, updated_by)
        VALUES (%s, %s, 'Page summary', 'Page content', NULL, 'or', %s, %s)
        ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title
    """, (slug, title, ADMIN1_ID, ADMIN1_ID))
    row = db_query_one("SELECT id FROM wiki_page WHERE slug = %s", (slug,))
    if row:
        db_execute("""
            INSERT INTO wiki_page_scope (page_id, scope_type, scope_id)
            VALUES (%s, 'location', %s) ON CONFLICT DO NOTHING
        """, (str(row["id"]), OREGON_LOCATION_ID))
    return str(row["id"]) if row else None


class TestEditApproveVersionHistory:
    def test_edit_approve_new_term_creates_two_versions(self, admin_headers, normal2_headers):
        """Edit & Approve on new term creates two version entries."""
        # Submitter creates suggestion
        create_resp = _create_suggestion(normal2_headers,
                                          proposedTitle="Test EA New Term",
                                          proposedContent="Original content")
        assert create_resp.status_code == 201
        suggestion_id = create_resp.json()["id"]

        # Reviewer approves with modified content
        resp = requests.put(
            f"{SUGGESTIONS_URL}/{suggestion_id}",
            headers=admin_headers,
            json={
                "status": "approved",
                "proposedContent": "Reviewer modified content",
            })
        assert resp.status_code == 200

        # Find the created term
        term = db_query_one(
            "SELECT id FROM glossary_term WHERE slug = 'test-ea-new-term'")
        assert term is not None

        # Should have 2 version rows
        versions = db_execute_returning(
            "SELECT edited_by, content FROM glossary_term_version "
            "WHERE term_id = %s ORDER BY created_at",
            (term["id"],))
        assert len(versions) == 2

        # Version 1: submitter's original content, attributed to submitter
        assert str(versions[0]["edited_by"]) == NORMAL2_ID
        assert versions[0]["content"] == "Original content"

        # Version 2: same submitter content, attributed to reviewer
        assert str(versions[1]["edited_by"]) == ADMIN1_ID
        assert versions[1]["content"] == "Original content"

        # Live term has reviewer's modified content
        live = db_query_one(
            "SELECT content FROM glossary_term WHERE id = %s", (term["id"],))
        assert live["content"] == "Reviewer modified content"

    def test_edit_approve_edit_page_creates_two_versions(self, admin_headers, normal2_headers):
        """Edit & Approve on page edit creates two version entries."""
        page_id = _seed_test_page()

        # Create edit_page suggestion
        create_resp = _create_suggestion(
            normal2_headers,
            suggestionType="edit_page",
            proposedTitle="Test EA Edit Page",
            proposedContent="Submitter page content",
            wikiPagePath="test-suggest-page",
            proposedScopes=[{"type": "location", "id": OREGON_LOCATION_ID}])
        assert create_resp.status_code == 201
        suggestion_id = create_resp.json()["id"]

        # Reviewer approves with modified content
        resp = requests.put(
            f"{SUGGESTIONS_URL}/{suggestion_id}",
            headers=admin_headers,
            json={
                "status": "approved",
                "proposedContent": "Reviewer page content",
            })
        assert resp.status_code == 200

        # Should have 2 version rows
        versions = db_execute_returning(
            "SELECT edited_by, content FROM wiki_page_version "
            "WHERE page_id = %s ORDER BY created_at",
            (page_id,))
        assert len(versions) == 2

        # Version 1: pre-edit page content, attributed to submitter
        assert str(versions[0]["edited_by"]) == NORMAL2_ID
        assert versions[0]["content"] == "Page content"

        # Version 2: submitter's proposed content, attributed to reviewer
        assert str(versions[1]["edited_by"]) == ADMIN1_ID
        assert versions[1]["content"] == "Submitter page content"

        # Live page has reviewer's modified content
        live = db_query_one(
            "SELECT content FROM wiki_page WHERE id = %s", (page_id,))
        assert live["content"] == "Reviewer page content"

    def test_approve_without_edits_creates_one_version(self, admin_headers, normal2_headers):
        """Normal approval (no reviewer edits) creates single version."""
        create_resp = _create_suggestion(normal2_headers,
                                          proposedTitle="Test No Edit Approve")
        assert create_resp.status_code == 201
        suggestion_id = create_resp.json()["id"]

        resp = requests.put(
            f"{SUGGESTIONS_URL}/{suggestion_id}",
            headers=admin_headers,
            json={"status": "approved"})
        assert resp.status_code == 200

        term = db_query_one(
            "SELECT id FROM glossary_term WHERE slug = 'test-no-edit-approve'")
        assert term is not None

        versions = db_execute_returning(
            "SELECT edited_by FROM glossary_term_version WHERE term_id = %s",
            (term["id"],))
        assert len(versions) == 1
        # Single version attributed to submitter
        assert str(versions[0]["edited_by"]) == NORMAL2_ID

    def test_edit_approve_no_actual_change_creates_one_version(self, admin_headers, normal2_headers):
        """Edit approval sending same values creates single version."""
        create_resp = _create_suggestion(
            normal2_headers,
            proposedTitle="Test Same Values",
            proposedContent="Same content",
            proposedSummary="Same summary")
        assert create_resp.status_code == 201
        suggestion_id = create_resp.json()["id"]

        # "Edit" approval with identical values
        resp = requests.put(
            f"{SUGGESTIONS_URL}/{suggestion_id}",
            headers=admin_headers,
            json={
                "status": "approved",
                "proposedTitle": "Test Same Values",
                "proposedContent": "Same content",
                "proposedSummary": "Same summary",
            })
        assert resp.status_code == 200

        term = db_query_one(
            "SELECT id FROM glossary_term WHERE slug = 'test-same-values'")
        assert term is not None

        versions = db_execute_returning(
            "SELECT edited_by FROM glossary_term_version WHERE term_id = %s",
            (term["id"],))
        assert len(versions) == 1


# ---------------------------------------------------------------------------
# POST /glossary/terms, POST /wiki/pages, GET /wiki/authority
# ---------------------------------------------------------------------------

GLOSSARY_TERMS_URL = f"{BASE_URL}/glossary/terms"
WIKI_PAGES_URL = f"{BASE_URL}/wiki/pages"
CHECK_AUTHORITY_URL = f"{BASE_URL}/wiki/authority"


class TestDirectCreate:
    """Tests for direct create endpoints."""

    def test_create_term_as_admin(self, admin_headers):
        resp = requests.post(GLOSSARY_TERMS_URL, headers=admin_headers, json={
            "term": "Test Direct Term",
            "summary": "A directly created term",
            "content": "Some content",
            "scopes": [{"type": "location", "id": OREGON_LOCATION_ID}],
            "scopeCombine": "or",
            "aliases": ["TDT"],
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["slug"] == "test-direct-term"
        assert data["term"] == "Test Direct Term"
        assert data["aliases"] == ["TDT"]

    def test_create_page_as_admin(self, admin_headers):
        resp = requests.post(WIKI_PAGES_URL, headers=admin_headers, json={
            "title": "Test Direct Page",
            "description": "A directly created page",
            "content": "Page content here",
            "scopes": [{"type": "location", "id": OREGON_LOCATION_ID}],
            "scopeCombine": "or",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["slug"] == "test-direct-page"
        assert data["title"] == "Test Direct Page"

    def test_create_term_as_normal_forbidden(self, normal2_headers):
        resp = requests.post(GLOSSARY_TERMS_URL, headers=normal2_headers, json={
            "term": "Test Forbidden Term",
            "scopes": [{"type": "location", "id": OREGON_LOCATION_ID}],
        })
        assert resp.status_code == 403

    def test_create_page_as_normal_forbidden(self, normal2_headers):
        resp = requests.post(WIKI_PAGES_URL, headers=normal2_headers, json={
            "title": "Test Forbidden Page",
            "scopes": [{"type": "location", "id": OREGON_LOCATION_ID}],
        })
        assert resp.status_code == 403

    def test_create_term_duplicate_slug_409(self, admin_headers):
        # Create first
        resp1 = requests.post(GLOSSARY_TERMS_URL, headers=admin_headers, json={
            "term": "Test Dup Term",
            "scopes": [{"type": "location", "id": OREGON_LOCATION_ID}],
        })
        assert resp1.status_code == 201
        # Duplicate
        resp2 = requests.post(GLOSSARY_TERMS_URL, headers=admin_headers, json={
            "term": "Test Dup Term",
            "scopes": [{"type": "location", "id": OREGON_LOCATION_ID}],
        })
        assert resp2.status_code == 409

    def test_create_page_duplicate_slug_409(self, admin_headers):
        resp1 = requests.post(WIKI_PAGES_URL, headers=admin_headers, json={
            "title": "Test Dup Page",
            "scopes": [{"type": "location", "id": OREGON_LOCATION_ID}],
        })
        assert resp1.status_code == 201
        resp2 = requests.post(WIKI_PAGES_URL, headers=admin_headers, json={
            "title": "Test Dup Page",
            "scopes": [{"type": "location", "id": OREGON_LOCATION_ID}],
        })
        assert resp2.status_code == 409

    def test_create_term_missing_required_400(self, admin_headers):
        # Missing term name
        resp = requests.post(GLOSSARY_TERMS_URL, headers=admin_headers, json={
            "scopes": [{"type": "location", "id": OREGON_LOCATION_ID}],
        })
        assert resp.status_code == 400

        # Missing scopes
        resp = requests.post(GLOSSARY_TERMS_URL, headers=admin_headers, json={
            "term": "Test Missing Scopes",
        })
        assert resp.status_code == 400

    def test_create_term_supersedes_pending_suggestion(self, admin_headers, normal2_headers):
        # normal2 submits a suggestion for "Test Supersede Term"
        resp = _create_suggestion(normal2_headers,
            suggestionType="new_term",
            proposedTitle="Test Supersede Term",
            proposedScopes=[{"type": "location", "id": OREGON_LOCATION_ID}],
        )
        assert resp.status_code == 201
        suggestion_id = resp.json()["id"]

        # admin1 directly creates the same term
        resp = requests.post(GLOSSARY_TERMS_URL, headers=admin_headers, json={
            "term": "Test Supersede Term",
            "scopes": [{"type": "location", "id": OREGON_LOCATION_ID}],
        })
        assert resp.status_code == 201

        # Suggestion should be superseded
        row = db_query_one("SELECT status FROM wiki_suggestion WHERE id = %s", (suggestion_id,))
        assert row["status"] == "superseded"

    def test_check_authority_admin_true(self, admin_headers):
        resp = requests.get(CHECK_AUTHORITY_URL, headers=admin_headers, params={
            "locationIds": OREGON_LOCATION_ID,
        })
        assert resp.status_code == 200
        assert resp.json()["canCreate"] is True

    def test_check_authority_normal_false(self, normal2_headers):
        resp = requests.get(CHECK_AUTHORITY_URL, headers=normal2_headers, params={
            "locationIds": OREGON_LOCATION_ID,
        })
        assert resp.status_code == 200
        assert resp.json()["canCreate"] is False

    def test_create_term_version_recorded(self, admin_headers):
        resp = requests.post(GLOSSARY_TERMS_URL, headers=admin_headers, json={
            "term": "Test Version Term",
            "summary": "With version",
            "scopes": [{"type": "location", "id": OREGON_LOCATION_ID}],
        })
        assert resp.status_code == 201
        term = db_query_one("SELECT id FROM glossary_term WHERE slug = 'test-version-term'")
        versions = db_execute_returning(
            "SELECT * FROM glossary_term_version WHERE term_id = %s", (term["id"],))
        assert len(versions) == 1
        assert versions[0]["edited_by"] == ADMIN1_ID
