"""Glossary controller — terms, wiki pages, suggestions, direct editing, and image storage."""

import json
import logging
import re

import connexion
from flask import make_response

from candid.models.error_model import ErrorModel
from candid.controllers import db
from candid.controllers.helpers.auth import (
    authorization, authorization_allow_banned,
    get_location_ancestors, get_location_descendants, is_root_admin,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Glossary endpoints (for highlighting)
# ---------------------------------------------------------------------------

def get_glossary_terms(token_info=None, location_id=None):
    """GET /glossary/terms — lightweight term list for highlighting."""
    ok, err = authorization_allow_banned("normal", token_info)
    if not ok:
        return err, err.code

    # Build query: get all terms with their scope tags aggregated
    if location_id:
        # Get the full ancestry chain for the location
        ancestors = get_location_ancestors(location_id)
        if not ancestors:
            ancestors = [str(location_id)]

        # Global terms (no scope rows) + terms with matching location ancestry
        rows = db.execute_query("""
            SELECT gt.slug, gt.term, gt.aliases, gt.summary, gt.wiki_category, gt.scope_combine,
                   COALESCE(array_agg(DISTINCT gts.scope_id::text) FILTER (WHERE gts.scope_type = 'location'), ARRAY[]::text[]) AS location_ids,
                   COALESCE(array_agg(DISTINCT gts.scope_id::text) FILTER (WHERE gts.scope_type = 'category'), ARRAY[]::text[]) AS category_ids
            FROM glossary_term gt
            LEFT JOIN glossary_term_scope gts ON gts.term_id = gt.id
            WHERE NOT EXISTS (
                SELECT 1 FROM glossary_term_scope s WHERE s.term_id = gt.id AND s.scope_type = 'location'
            )
            OR EXISTS (
                SELECT 1 FROM glossary_term_scope s
                WHERE s.term_id = gt.id AND s.scope_type = 'location'
                AND s.scope_id = ANY(%s::uuid[])
            )
            GROUP BY gt.id
            ORDER BY gt.term
        """, (ancestors,))
    else:
        rows = db.execute_query("""
            SELECT gt.slug, gt.term, gt.aliases, gt.summary, gt.wiki_category, gt.scope_combine,
                   COALESCE(array_agg(DISTINCT gts.scope_id::text) FILTER (WHERE gts.scope_type = 'location'), ARRAY[]::text[]) AS location_ids,
                   COALESCE(array_agg(DISTINCT gts.scope_id::text) FILTER (WHERE gts.scope_type = 'category'), ARRAY[]::text[]) AS category_ids
            FROM glossary_term gt
            LEFT JOIN glossary_term_scope gts ON gts.term_id = gt.id
            GROUP BY gt.id
            ORDER BY gt.term
        """)

    terms = []
    for row in (rows or []):
        terms.append({
            "slug": row["slug"],
            "term": row["term"],
            "summary": row.get("summary"),
            "aliases": row["aliases"] or [],
            "wikiCategory": row.get("wiki_category"),
            "scopeCombine": row.get("scope_combine", "or"),
            "locationIds": list(row.get("location_ids") or []),
            "categoryIds": list(row.get("category_ids") or []),
        })

    return terms, 200, {"Cache-Control": "public, max-age=600"}


def get_glossary_term(slug, token_info=None):
    """GET /glossary/terms/{slug} — full definition for drawer."""
    ok, err = authorization_allow_banned("normal", token_info)
    if not ok:
        return err, err.code

    user_id = token_info["sub"]

    row = db.execute_query("""
        SELECT gt.slug, gt.term, gt.aliases, gt.summary, gt.content,
               gt.wiki_category, gt.scope_combine, gt.updated_at,
               COALESCE(array_agg(DISTINCT gts.scope_id::text) FILTER (WHERE gts.scope_type = 'location'), ARRAY[]::text[]) AS location_ids,
               COALESCE(array_agg(DISTINCT gts.scope_id::text) FILTER (WHERE gts.scope_type = 'category'), ARRAY[]::text[]) AS category_ids
        FROM glossary_term gt
        LEFT JOIN glossary_term_scope gts ON gts.term_id = gt.id
        WHERE gt.slug = %s
        GROUP BY gt.id
    """, (slug,), fetchone=True)

    if not row:
        return ErrorModel(404, "Term not found"), 404

    # Check if user can directly edit
    proposed_scopes = []
    for lid in (row.get("location_ids") or []):
        proposed_scopes.append({"type": "location", "id": lid})
    for cid in (row.get("category_ids") or []):
        proposed_scopes.append({"type": "category", "id": cid})
    can_edit = _user_can_review_suggestion(user_id, proposed_scopes)

    return {
        "slug": row["slug"],
        "term": row["term"],
        "aliases": row["aliases"] or [],
        "summary": row.get("summary"),
        "content": row.get("content"),
        "wikiCategory": row.get("wiki_category"),
        "scopeCombine": row.get("scope_combine", "or"),
        "locationIds": list(row.get("location_ids") or []),
        "categoryIds": list(row.get("category_ids") or []),
        "updatedAt": row["updated_at"].isoformat() if row.get("updated_at") else None,
        "canEdit": can_edit,
    }, 200


# ---------------------------------------------------------------------------
# Wiki browsing endpoints (native PostgreSQL)
# ---------------------------------------------------------------------------

def get_wiki_pages(token_info=None, category=None, search=None,
                    location_id=None, category_id=None):
    """GET /wiki/pages — browsable page list."""
    ok, err = authorization_allow_banned("normal", token_info)
    if not ok:
        return err, err.code

    conditions = []
    params = []

    if category:
        conditions.append("wp.wiki_category ILIKE %s")
        params.append(category)

    if search:
        conditions.append("(wp.title ILIKE %s OR wp.description ILIKE %s)")
        params.extend([f"%{search}%", f"%{search}%"])

    if location_id:
        descendants = get_location_descendants(location_id)
        conditions.append("""
            EXISTS (
                SELECT 1 FROM wiki_page_scope wps
                WHERE wps.page_id = wp.id AND wps.scope_type = 'location'
                AND wps.scope_id = ANY(%s::uuid[])
            )
        """)
        params.append(descendants)

    if category_id:
        conditions.append("""
            EXISTS (
                SELECT 1 FROM wiki_page_scope wps
                WHERE wps.page_id = wp.id AND wps.scope_type = 'category'
                AND wps.scope_id = %s
            )
        """)
        params.append(category_id)

    where = " AND ".join(conditions) if conditions else "TRUE"

    rows = db.execute_query(f"""
        SELECT wp.id, wp.slug, wp.title, wp.description, wp.wiki_category, wp.updated_at,
               COALESCE(array_agg(DISTINCT wps.scope_id::text) FILTER (WHERE wps.scope_type = 'location'), ARRAY[]::text[]) AS location_ids,
               COALESCE(array_agg(DISTINCT wps.scope_id::text) FILTER (WHERE wps.scope_type = 'category'), ARRAY[]::text[]) AS category_ids
        FROM wiki_page wp
        LEFT JOIN wiki_page_scope wps ON wps.page_id = wp.id
        WHERE {where}
        GROUP BY wp.id
        ORDER BY wp.title
    """, tuple(params) if params else None)

    result = []
    for row in (rows or []):
        result.append({
            "id": str(row["id"]),
            "slug": row["slug"],
            "title": row["title"],
            "description": row.get("description"),
            "wikiCategory": row.get("wiki_category"),
            "locationIds": list(row.get("location_ids") or []),
            "categoryIds": list(row.get("category_ids") or []),
            "updatedAt": row["updated_at"].isoformat() if row.get("updated_at") else None,
        })

    return result, 200, {"Cache-Control": "public, max-age=300"}


def get_wiki_page(slug, token_info=None):
    """GET /wiki/pages/{slug} — full page content."""
    ok, err = authorization_allow_banned("normal", token_info)
    if not ok:
        return err, err.code

    user_id = token_info["sub"]

    row = db.execute_query("""
        SELECT wp.id, wp.slug, wp.title, wp.description, wp.content,
               wp.wiki_category, wp.scope_combine, wp.updated_at,
               COALESCE(array_agg(DISTINCT wps.scope_id::text) FILTER (WHERE wps.scope_type = 'location'), ARRAY[]::text[]) AS location_ids,
               COALESCE(array_agg(DISTINCT wps.scope_id::text) FILTER (WHERE wps.scope_type = 'category'), ARRAY[]::text[]) AS category_ids
        FROM wiki_page wp
        LEFT JOIN wiki_page_scope wps ON wps.page_id = wp.id
        WHERE wp.slug = %s
        GROUP BY wp.id
    """, (slug,), fetchone=True)

    if row:
        # Check if user can directly edit
        proposed_scopes = []
        for lid in (row.get("location_ids") or []):
            proposed_scopes.append({"type": "location", "id": lid})
        for cid in (row.get("category_ids") or []):
            proposed_scopes.append({"type": "category", "id": cid})
        can_edit = _user_can_review_suggestion(user_id, proposed_scopes)

        return {
            "id": str(row["id"]),
            "slug": row["slug"],
            "title": row["title"],
            "description": row.get("description"),
            "content": row.get("content"),
            "wikiCategory": row.get("wiki_category"),
            "scopeCombine": row.get("scope_combine", "or"),
            "locationIds": list(row.get("location_ids") or []),
            "categoryIds": list(row.get("category_ids") or []),
            "updatedAt": row["updated_at"].isoformat() if row.get("updated_at") else None,
            "canEdit": can_edit,
        }, 200, {"Cache-Control": "public, max-age=600"}

    # Fallback: check glossary_term table (glossary terms are linkable as wiki pages)
    term_row = db.execute_query("""
        SELECT gt.id, gt.slug, gt.term, gt.summary, gt.content,
               gt.wiki_category, gt.scope_combine, gt.updated_at,
               COALESCE(array_agg(DISTINCT gts.scope_id::text) FILTER (WHERE gts.scope_type = 'location'), ARRAY[]::text[]) AS location_ids,
               COALESCE(array_agg(DISTINCT gts.scope_id::text) FILTER (WHERE gts.scope_type = 'category'), ARRAY[]::text[]) AS category_ids
        FROM glossary_term gt
        LEFT JOIN glossary_term_scope gts ON gts.term_id = gt.id
        WHERE gt.slug = %s
        GROUP BY gt.id
    """, (slug,), fetchone=True)

    if not term_row:
        return ErrorModel(404, "Page not found"), 404

    # Check if user can directly edit
    proposed_scopes = []
    for lid in (term_row.get("location_ids") or []):
        proposed_scopes.append({"type": "location", "id": lid})
    for cid in (term_row.get("category_ids") or []):
        proposed_scopes.append({"type": "category", "id": cid})
    can_edit = _user_can_review_suggestion(user_id, proposed_scopes)

    return {
        "id": str(term_row["id"]),
        "slug": term_row["slug"],
        "title": term_row["term"],
        "description": term_row.get("summary"),
        "content": term_row.get("content"),
        "wikiCategory": term_row.get("wiki_category"),
        "scopeCombine": term_row.get("scope_combine", "or"),
        "locationIds": list(term_row.get("location_ids") or []),
        "categoryIds": list(term_row.get("category_ids") or []),
        "updatedAt": term_row["updated_at"].isoformat() if term_row.get("updated_at") else None,
        "canEdit": can_edit,
    }, 200, {"Cache-Control": "public, max-age=600"}


def get_wiki_categories(token_info=None):
    """GET /wiki/categories — distinct wiki categories."""
    ok, err = authorization_allow_banned("normal", token_info)
    if not ok:
        return err, err.code

    rows = db.execute_query("""
        SELECT DISTINCT wiki_category FROM wiki_page
        WHERE wiki_category IS NOT NULL AND wiki_category != ''
        UNION
        SELECT DISTINCT wiki_category FROM glossary_term
        WHERE wiki_category IS NOT NULL AND wiki_category != ''
        ORDER BY wiki_category
    """)

    categories = [r["wiki_category"] for r in (rows or [])]
    return categories, 200, {"Cache-Control": "public, max-age=600"}


# ---------------------------------------------------------------------------
# Version history endpoints
# ---------------------------------------------------------------------------

def get_wiki_page_history(slug, token_info=None):
    """GET /wiki/page/history?slug= — list version history for a wiki page.

    Mirrors get_wiki_page fallback: if slug is not in wiki_page, checks
    glossary_term and returns its version history instead.
    """
    ok, err = authorization_allow_banned("normal", token_info)
    if not ok:
        return err, err.code

    # Look up page — try wiki_page first, fall back to glossary_term
    page = db.execute_query(
        "SELECT id FROM wiki_page WHERE slug = %s",
        (slug,), fetchone=True)

    if page:
        rows = db.execute_query("""
            SELECT wpv.id, wpv.title, wpv.created_at,
                   u.id AS user_id, u.username, u.display_name, u.avatar_icon_url
            FROM wiki_page_version wpv
            LEFT JOIN users u ON u.id = wpv.edited_by
            WHERE wpv.page_id = %s
            ORDER BY wpv.created_at DESC
        """, (str(page["id"]),))
    else:
        # Fallback: check glossary_term (same pattern as get_wiki_page)
        term = db.execute_query(
            "SELECT id FROM glossary_term WHERE slug = %s",
            (slug,), fetchone=True)
        if not term:
            return ErrorModel(404, "Page not found"), 404

        rows = db.execute_query("""
            SELECT gtv.id, gtv.term AS title, gtv.created_at,
                   u.id AS user_id, u.username, u.display_name, u.avatar_icon_url
            FROM glossary_term_version gtv
            LEFT JOIN users u ON u.id = gtv.edited_by
            WHERE gtv.term_id = %s
            ORDER BY gtv.created_at DESC
        """, (term["id"],))

    result = []
    for row in (rows or []):
        result.append({
            "id": str(row["id"]),
            "title": row["title"],
            "editedBy": {
                "id": str(row["user_id"]) if row.get("user_id") else None,
                "username": row.get("username"),
                "displayName": row.get("display_name"),
                "avatarIconUrl": row.get("avatar_icon_url"),
            },
            "editedAt": row["created_at"].isoformat() if row.get("created_at") else None,
        })

    return result, 200


def get_wiki_page_version(version_id, slug, token_info=None):
    """GET /wiki/page/history/{versionId}?slug= — version detail with before/after snapshots.

    Checks wiki_page_version first, falls back to glossary_term_version
    (mirrors the get_wiki_page fallback pattern).
    """
    ok, err = authorization_allow_banned("normal", token_info)
    if not ok:
        return err, err.code

    # Try wiki_page_version first
    version = db.execute_query("""
        SELECT wpv.id, wpv.page_id, wpv.title, wpv.description AS summary,
               wpv.content, wpv.wiki_category, wpv.created_at,
               u.id AS user_id, u.username, u.display_name, u.avatar_icon_url
        FROM wiki_page_version wpv
        LEFT JOIN users u ON u.id = wpv.edited_by
        WHERE wpv.id = %s
    """, (version_id,), fetchone=True)

    if version:
        before_snapshot = {
            "title": version["title"],
            "summary": version.get("summary"),
            "content": version.get("content"),
            "wikiCategory": version.get("wiki_category"),
        }

        newer_version = db.execute_query("""
            SELECT title, description, content, wiki_category
            FROM wiki_page_version
            WHERE page_id = %s AND created_at > %s
            ORDER BY created_at ASC
            LIMIT 1
        """, (str(version["page_id"]), version["created_at"]), fetchone=True)

        if newer_version:
            after_snapshot = {
                "title": newer_version["title"],
                "summary": newer_version.get("description"),
                "content": newer_version.get("content"),
                "wikiCategory": newer_version.get("wiki_category"),
            }
        else:
            live_page = db.execute_query(
                "SELECT title, description, content, wiki_category FROM wiki_page WHERE id = %s",
                (str(version["page_id"]),), fetchone=True)
            if live_page:
                after_snapshot = {
                    "title": live_page["title"],
                    "summary": live_page.get("description"),
                    "content": live_page.get("content"),
                    "wikiCategory": live_page.get("wiki_category"),
                }
            else:
                after_snapshot = None

        # If after is identical to before (e.g., creation version with no subsequent edits),
        # return None so the frontend shows the "earliest version" content view instead of an empty diff
        if (after_snapshot and
                after_snapshot.get("title") == before_snapshot.get("title") and
                after_snapshot.get("content") == before_snapshot.get("content") and
                after_snapshot.get("summary") == before_snapshot.get("summary")):
            after_snapshot = None
    else:
        # Fallback: check glossary_term_version
        version = db.execute_query("""
            SELECT gtv.id, gtv.term_id, gtv.term AS title, gtv.aliases,
                   gtv.summary, gtv.content, gtv.wiki_category, gtv.created_at,
                   u.id AS user_id, u.username, u.display_name, u.avatar_icon_url
            FROM glossary_term_version gtv
            LEFT JOIN users u ON u.id = gtv.edited_by
            WHERE gtv.id = %s
        """, (version_id,), fetchone=True)

        if not version:
            return ErrorModel(404, "Version not found"), 404

        before_snapshot = {
            "title": version["title"],
            "summary": version.get("summary"),
            "content": version.get("content"),
            "wikiCategory": version.get("wiki_category"),
            "aliases": version.get("aliases") or [],
        }

        newer_version = db.execute_query("""
            SELECT term, aliases, summary, content, wiki_category
            FROM glossary_term_version
            WHERE term_id = %s AND created_at > %s
            ORDER BY created_at ASC
            LIMIT 1
        """, (version["term_id"], version["created_at"]), fetchone=True)

        if newer_version:
            after_snapshot = {
                "title": newer_version["term"],
                "summary": newer_version.get("summary"),
                "content": newer_version.get("content"),
                "wikiCategory": newer_version.get("wiki_category"),
                "aliases": newer_version.get("aliases") or [],
            }
        else:
            live_term = db.execute_query(
                "SELECT term, aliases, summary, content, wiki_category FROM glossary_term WHERE id = %s",
                (version["term_id"],), fetchone=True)
            if live_term:
                after_snapshot = {
                    "title": live_term["term"],
                    "summary": live_term.get("summary"),
                    "content": live_term.get("content"),
                    "wikiCategory": live_term.get("wiki_category"),
                    "aliases": live_term.get("aliases") or [],
                }
            else:
                after_snapshot = None

        # If after is identical to before (e.g., creation version with no subsequent edits),
        # return None so the frontend shows the "earliest version" content view instead of an empty diff
        if (after_snapshot and
                after_snapshot.get("title") == before_snapshot.get("title") and
                after_snapshot.get("content") == before_snapshot.get("content") and
                after_snapshot.get("summary") == before_snapshot.get("summary")):
            after_snapshot = None

    return {
        "id": str(version["id"]),
        "title": version["title"],
        "editedBy": {
            "id": str(version["user_id"]) if version.get("user_id") else None,
            "username": version.get("username"),
            "displayName": version.get("display_name"),
            "avatarIconUrl": version.get("avatar_icon_url"),
        },
        "editedAt": version["created_at"].isoformat() if version.get("created_at") else None,
        "beforeSnapshot": before_snapshot,
        "afterSnapshot": after_snapshot,
    }, 200


def get_glossary_term_history(slug, token_info=None):
    """GET /glossary/terms/{slug}/history — list version history for a glossary term."""
    ok, err = authorization_allow_banned("normal", token_info)
    if not ok:
        return err, err.code

    term = db.execute_query(
        "SELECT id FROM glossary_term WHERE slug = %s",
        (slug,), fetchone=True)
    if not term:
        return ErrorModel(404, "Term not found"), 404

    rows = db.execute_query("""
        SELECT gtv.id, gtv.term AS title, gtv.created_at,
               u.id AS user_id, u.username, u.display_name, u.avatar_icon_url
        FROM glossary_term_version gtv
        LEFT JOIN users u ON u.id = gtv.edited_by
        WHERE gtv.term_id = %s
        ORDER BY gtv.created_at DESC
    """, (term["id"],))

    result = []
    for row in (rows or []):
        result.append({
            "id": str(row["id"]),
            "title": row["title"],
            "editedBy": {
                "id": str(row["user_id"]) if row.get("user_id") else None,
                "username": row.get("username"),
                "displayName": row.get("display_name"),
                "avatarIconUrl": row.get("avatar_icon_url"),
            },
            "editedAt": row["created_at"].isoformat() if row.get("created_at") else None,
        })

    return result, 200


def get_glossary_term_version(slug, version_id, token_info=None):
    """GET /glossary/terms/{slug}/history/{versionId} — version detail with before/after snapshots."""
    ok, err = authorization_allow_banned("normal", token_info)
    if not ok:
        return err, err.code

    # Fetch the requested version
    version = db.execute_query("""
        SELECT gtv.id, gtv.term_id, gtv.term, gtv.aliases, gtv.summary, gtv.content,
               gtv.wiki_category, gtv.created_at,
               u.id AS user_id, u.username, u.display_name, u.avatar_icon_url
        FROM glossary_term_version gtv
        LEFT JOIN users u ON u.id = gtv.edited_by
        WHERE gtv.id = %s
    """, (version_id,), fetchone=True)

    if not version:
        return ErrorModel(404, "Version not found"), 404

    before_snapshot = {
        "title": version["term"],
        "summary": version.get("summary"),
        "content": version.get("content"),
        "wikiCategory": version.get("wiki_category"),
        "aliases": version.get("aliases") or [],
    }

    # The "after" is the next newer version's snapshot, or current live term
    newer_version = db.execute_query("""
        SELECT term, aliases, summary, content, wiki_category
        FROM glossary_term_version
        WHERE term_id = %s AND created_at > %s
        ORDER BY created_at ASC
        LIMIT 1
    """, (version["term_id"], version["created_at"]), fetchone=True)

    if newer_version:
        after_snapshot = {
            "title": newer_version["term"],
            "summary": newer_version.get("summary"),
            "content": newer_version.get("content"),
            "wikiCategory": newer_version.get("wiki_category"),
            "aliases": newer_version.get("aliases") or [],
        }
    else:
        live_term = db.execute_query(
            "SELECT term, aliases, summary, content, wiki_category FROM glossary_term WHERE id = %s",
            (version["term_id"],), fetchone=True)
        if live_term:
            after_snapshot = {
                "title": live_term["term"],
                "summary": live_term.get("summary"),
                "content": live_term.get("content"),
                "wikiCategory": live_term.get("wiki_category"),
                "aliases": live_term.get("aliases") or [],
            }
        else:
            after_snapshot = None

    # If after is identical to before (e.g., creation version with no subsequent edits),
    # return None so the frontend shows the "earliest version" content view instead of an empty diff
    if (after_snapshot and
            after_snapshot.get("title") == before_snapshot.get("title") and
            after_snapshot.get("content") == before_snapshot.get("content") and
            after_snapshot.get("summary") == before_snapshot.get("summary")):
        after_snapshot = None

    return {
        "id": str(version["id"]),
        "title": version["term"],
        "editedBy": {
            "id": str(version["user_id"]) if version.get("user_id") else None,
            "username": version.get("username"),
            "displayName": version.get("display_name"),
            "avatarIconUrl": version.get("avatar_icon_url"),
        },
        "editedAt": version["created_at"].isoformat() if version.get("created_at") else None,
        "beforeSnapshot": before_snapshot,
        "afterSnapshot": after_snapshot,
    }, 200


# ---------------------------------------------------------------------------
# Direct edit endpoints
# ---------------------------------------------------------------------------

def update_wiki_page(slug, body, token_info=None):
    """PUT /wiki/page?slug= — direct edit by authorized user."""
    ok, err = authorization("normal", token_info)
    if not ok:
        return err, err.code

    user_id = token_info["sub"]

    # Fetch existing page
    page = db.execute_query("""
        SELECT wp.id, wp.title, wp.description, wp.content, wp.wiki_category,
               wp.scope_combine, wp.updated_at,
               COALESCE(array_agg(DISTINCT wps.scope_id::text) FILTER (WHERE wps.scope_type = 'location'), ARRAY[]::text[]) AS location_ids,
               COALESCE(array_agg(DISTINCT wps.scope_id::text) FILTER (WHERE wps.scope_type = 'category'), ARRAY[]::text[]) AS category_ids
        FROM wiki_page wp
        LEFT JOIN wiki_page_scope wps ON wps.page_id = wp.id
        WHERE wp.slug = %s
        GROUP BY wp.id
    """, (slug,), fetchone=True)

    if not page:
        return ErrorModel(404, "Page not found"), 404

    # Auth check: user must be able to review suggestions for this page's scopes
    proposed_scopes = []
    for lid in (page.get("location_ids") or []):
        proposed_scopes.append({"type": "location", "id": lid})
    for cid in (page.get("category_ids") or []):
        proposed_scopes.append({"type": "category", "id": cid})
    if not _user_can_review_suggestion(user_id, proposed_scopes):
        return ErrorModel(403, "Not authorized to edit this page"), 403

    page_id = page["id"]

    # Snapshot current content into wiki_page_version
    db.execute_query("""
        INSERT INTO wiki_page_version (page_id, title, description, content, wiki_category, edited_by)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (str(page_id), page["title"], page.get("description"),
          page.get("content"), page.get("wiki_category"), user_id))

    # Update the page
    new_title = body.get("title") or body.get("proposedTitle") or page["title"]
    new_description = body.get("description") or body.get("proposedSummary")
    new_content = body.get("content") or body.get("proposedContent")
    new_wiki_category = body.get("wikiCategory") or body.get("proposedWikiCategory")
    new_scope_combine = body.get("scopeCombine") or body.get("proposedScopeCombine") or page.get("scope_combine", "or")

    db.execute_query("""
        UPDATE wiki_page SET title = %s, description = %s, content = %s,
               wiki_category = %s, scope_combine = %s,
               updated_by = %s, updated_at = NOW()
        WHERE id = %s
    """, (new_title, new_description, new_content,
          new_wiki_category, new_scope_combine, user_id, str(page_id)))

    # Update scopes if provided
    new_scopes = body.get("proposedScopes") or body.get("scopes")
    if new_scopes is not None:
        db.execute_query("DELETE FROM wiki_page_scope WHERE page_id = %s", (str(page_id),))
        for scope in new_scopes:
            db.execute_query(
                "INSERT INTO wiki_page_scope (page_id, scope_type, scope_id) VALUES (%s, %s, %s)",
                (str(page_id), scope["type"], scope["id"]))

    # Clean up images removed in this edit
    old_images = _extract_image_ids(page.get("content"))
    new_images = _extract_image_ids(new_content)
    removed_images = old_images - new_images
    if removed_images:
        try:
            _cleanup_orphan_images(removed_images)
        except Exception as e:
            logger.error("Failed to clean up images for page %s: %s", slug, e)

    # Supersede any pending suggestions for this page
    _supersede_pending_for_item(
        "edit_page", wiki_page_path=slug, actor_user_id=user_id)

    # Return updated page
    return get_wiki_page(slug, token_info=token_info)


def update_glossary_term(slug, body, token_info=None):
    """PUT /glossary/terms/{slug} — direct edit by authorized user."""
    ok, err = authorization("normal", token_info)
    if not ok:
        return err, err.code

    user_id = token_info["sub"]

    # Fetch existing term
    term = db.execute_query("""
        SELECT gt.id, gt.slug, gt.term, gt.aliases, gt.summary, gt.content,
               gt.wiki_category, gt.scope_combine, gt.updated_at,
               COALESCE(array_agg(DISTINCT gts.scope_id::text) FILTER (WHERE gts.scope_type = 'location'), ARRAY[]::text[]) AS location_ids,
               COALESCE(array_agg(DISTINCT gts.scope_id::text) FILTER (WHERE gts.scope_type = 'category'), ARRAY[]::text[]) AS category_ids
        FROM glossary_term gt
        LEFT JOIN glossary_term_scope gts ON gts.term_id = gt.id
        WHERE gt.slug = %s
        GROUP BY gt.id
    """, (slug,), fetchone=True)

    if not term:
        return ErrorModel(404, "Term not found"), 404

    # Auth check
    proposed_scopes = []
    for lid in (term.get("location_ids") or []):
        proposed_scopes.append({"type": "location", "id": lid})
    for cid in (term.get("category_ids") or []):
        proposed_scopes.append({"type": "category", "id": cid})
    if not _user_can_review_suggestion(user_id, proposed_scopes):
        return ErrorModel(403, "Not authorized to edit this term"), 403

    term_id = term["id"]

    # Snapshot current content into glossary_term_version
    db.execute_query("""
        INSERT INTO glossary_term_version (term_id, term, aliases, summary, content, wiki_category, edited_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (term_id, term["term"], term.get("aliases") or [],
          term.get("summary"), term.get("content"),
          term.get("wiki_category"), user_id))

    # Update the term
    new_term = body.get("term") or body.get("proposedTitle") or term["term"]
    new_aliases = body.get("aliases") or body.get("proposedAliases")
    if new_aliases is None:
        new_aliases = term.get("aliases") or []
    new_summary = body.get("summary") or body.get("proposedSummary")
    new_content = body.get("content") or body.get("proposedContent")
    new_wiki_category = body.get("wikiCategory") or body.get("proposedWikiCategory")
    new_scope_combine = body.get("scopeCombine") or body.get("proposedScopeCombine") or term.get("scope_combine", "or")

    db.execute_query("""
        UPDATE glossary_term SET term = %s, aliases = %s, summary = %s, content = %s,
               wiki_category = %s, scope_combine = %s,
               updated_by = %s, updated_at = NOW()
        WHERE id = %s
    """, (new_term, new_aliases, new_summary, new_content,
          new_wiki_category, new_scope_combine, user_id, term_id))

    # Update scopes if provided
    new_scopes = body.get("proposedScopes") or body.get("scopes")
    if new_scopes is not None:
        db.execute_query("DELETE FROM glossary_term_scope WHERE term_id = %s", (term_id,))
        for scope in new_scopes:
            db.execute_query(
                "INSERT INTO glossary_term_scope (term_id, scope_type, scope_id) VALUES (%s, %s, %s)",
                (term_id, scope["type"], scope["id"]))

    # Clean up images removed in this edit
    old_images = _extract_image_ids(term.get("content"))
    new_images = _extract_image_ids(new_content)
    removed_images = old_images - new_images
    if removed_images:
        try:
            _cleanup_orphan_images(removed_images)
        except Exception as e:
            logger.error("Failed to clean up images for term %s: %s", slug, e)

    # Supersede any pending suggestions for this term
    _supersede_pending_for_item(
        "edit_term", glossary_term_id=term_id, actor_user_id=user_id)

    # Return updated term
    return get_glossary_term(slug, token_info=token_info)


# ---------------------------------------------------------------------------
# Glossary term upsert helper (used by suggestion approval)
# ---------------------------------------------------------------------------

def _upsert_glossary_term(slug, parsed):
    """Insert or update a glossary term and its scope rows."""
    row = db.execute_query("""
        INSERT INTO glossary_term (slug, term, aliases, summary, content,
                                   wiki_category, scope_combine, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
        ON CONFLICT (slug) DO UPDATE SET
            term = EXCLUDED.term,
            aliases = EXCLUDED.aliases,
            summary = EXCLUDED.summary,
            content = EXCLUDED.content,
            wiki_category = EXCLUDED.wiki_category,
            scope_combine = EXCLUDED.scope_combine,
            updated_at = NOW()
        RETURNING id
    """, (slug, parsed["term"], parsed["aliases"], parsed["summary"],
          parsed["content"], parsed["wiki_category"],
          parsed["scope_combine"]),
        fetchone=True)

    if not row:
        return None

    term_id = row["id"]

    # Replace scope rows
    db.execute_query("DELETE FROM glossary_term_scope WHERE term_id = %s", (term_id,))

    for loc_id in parsed["location_ids"]:
        db.execute_query(
            "INSERT INTO glossary_term_scope (term_id, scope_type, scope_id) VALUES (%s, 'location', %s)",
            (term_id, loc_id))

    for cat_id in parsed["category_ids"]:
        db.execute_query(
            "INSERT INTO glossary_term_scope (term_id, scope_type, scope_id) VALUES (%s, 'category', %s)",
            (term_id, cat_id))

    return term_id


# ---------------------------------------------------------------------------
# Wiki suggestion helpers
# ---------------------------------------------------------------------------

def _find_suggestion_reviewers(proposed_scopes):
    """Find user IDs who can review a suggestion based on its scopes.

    Reviewer qualifications:
    - Site admins can review anything
    - Admin/moderator at a scope's location (or ancestor) can review
    - Expert/liaison at a scope's location (or ancestor) can review
    - Facilitator for a scope's category can review
    - If no scopes (global): site admins + experts/liaisons at any location
    """
    reviewer_ids = set()

    # Site admins can always review
    admin_rows = db.execute_query("""
        SELECT DISTINCT ur.user_id::text
        FROM user_role ur
        JOIN location l ON l.id = ur.location_id
        WHERE ur.role = 'admin' AND l.parent_location_id IS NULL
          AND l.deleted_at IS NULL
    """)
    for r in (admin_rows or []):
        reviewer_ids.add(r["user_id"])

    location_ids = []
    category_ids = []
    for scope in (proposed_scopes or []):
        if scope.get("type") == "location":
            location_ids.append(str(scope["id"]))
        elif scope.get("type") == "category":
            category_ids.append(str(scope["id"]))

    if not location_ids and not category_ids:
        # Global scope: any expert or liaison can review
        rows = db.execute_query("""
            SELECT DISTINCT user_id::text
            FROM user_role WHERE role IN ('expert', 'liaison')
        """)
        for r in (rows or []):
            reviewer_ids.add(r["user_id"])
        return list(reviewer_ids)

    # Location-scoped: admin/mod/expert/liaison at location or ancestor
    for loc_id in location_ids:
        ancestors = get_location_ancestors(loc_id)
        if not ancestors:
            ancestors = [loc_id]
        rows = db.execute_query("""
            SELECT DISTINCT user_id::text
            FROM user_role
            WHERE role IN ('admin', 'moderator', 'expert', 'liaison')
              AND location_id = ANY(%s::uuid[])
        """, (ancestors,))
        for r in (rows or []):
            reviewer_ids.add(r["user_id"])

    # Category-scoped: facilitator or expert for that category
    for cat_id in category_ids:
        rows = db.execute_query("""
            SELECT DISTINCT user_id::text
            FROM user_role
            WHERE role IN ('facilitator', 'expert')
              AND position_category_id = %s
        """, (cat_id,))
        for r in (rows or []):
            reviewer_ids.add(r["user_id"])

        # Also admins/moderators at any location can review category-scoped
        rows = db.execute_query("""
            SELECT DISTINCT user_id::text
            FROM user_role WHERE role IN ('admin', 'moderator')
        """)
        for r in (rows or []):
            reviewer_ids.add(r["user_id"])

    return list(reviewer_ids)


def _user_can_review_suggestion(user_id, proposed_scopes):
    """Check if a user is among the qualified reviewers for the given scopes."""
    if is_root_admin(user_id):
        return True
    reviewers = _find_suggestion_reviewers(proposed_scopes)
    return str(user_id) in reviewers


def _format_user(row, prefix=""):
    """Format a user dict from a DB row with optional column prefix."""
    uid = row.get(f"{prefix}user_id") or row.get(f"{prefix}id")
    if not uid:
        return None
    return {
        "id": str(uid),
        "username": row.get(f"{prefix}username"),
        "displayName": row.get(f"{prefix}display_name"),
        "avatarIconUrl": row.get(f"{prefix}avatar_icon_url"),
        "status": row.get(f"{prefix}status", "active"),
    }


def _format_suggestion(row):
    """Format a wiki_suggestion DB row into API response dict."""
    scopes = row.get("proposed_scopes") or []
    if scopes:
        scopes = _enrich_scopes(scopes)

    original_scopes = row.get("original_scopes") or []
    if original_scopes:
        original_scopes = _enrich_scopes(original_scopes)

    result = {
        "id": str(row["id"]),
        "suggestionType": row["suggestion_type"],
        "glossaryTermId": row.get("glossary_term_id"),
        "glossaryTermSlug": row.get("term_slug"),
        "wikiPagePath": row.get("wiki_page_path"),
        "proposedTitle": row["proposed_title"],
        "proposedAliases": row.get("proposed_aliases") or [],
        "proposedSummary": row.get("proposed_summary"),
        "proposedContent": row.get("proposed_content"),
        "proposedWikiCategory": row.get("proposed_wiki_category"),
        "proposedScopes": scopes,
        "proposedScopeCombine": row.get("proposed_scope_combine", "or"),
        "originalTitle": row.get("original_title"),
        "originalAliases": row.get("original_aliases") or [],
        "originalSummary": row.get("original_summary"),
        "originalContent": row.get("original_content"),
        "originalWikiCategory": row.get("original_wiki_category"),
        "originalScopes": original_scopes,
        "originalScopeCombine": row.get("original_scope_combine", "or"),
        "suggestedBy": _format_user(row, "suggester_"),
        "suggestionReason": row.get("suggestion_reason"),
        "status": row["status"],
        "reviewedBy": _format_user(row, "reviewer_") if row.get("reviewer_user_id") else None,
        "reviewNote": row.get("review_note"),
        "reviewedAt": row["reviewed_at"].isoformat() if row.get("reviewed_at") else None,
        "originalUpdatedAt": row["original_updated_at"].isoformat() if row.get("original_updated_at") else None,
        "createdAt": row["created_at"].isoformat() if row.get("created_at") else None,
    }
    return result


def _enrich_scopes(scopes):
    """Add human-readable labels to scope objects by looking up location/category names."""
    loc_ids = [s["id"] for s in scopes if s.get("type") == "location"]
    cat_ids = [s["id"] for s in scopes if s.get("type") == "category"]

    loc_map = {}
    if loc_ids:
        rows = db.execute_query(
            "SELECT id, name FROM location WHERE id = ANY(%s::uuid[])", (loc_ids,))
        loc_map = {str(r["id"]): r["name"] for r in (rows or [])}

    cat_map = {}
    if cat_ids:
        rows = db.execute_query(
            "SELECT id, label FROM position_category WHERE id = ANY(%s::uuid[])", (cat_ids,))
        cat_map = {str(r["id"]): r["label"] for r in (rows or [])}

    enriched = []
    for s in scopes:
        entry = {"type": s["type"], "id": s["id"]}
        if s["type"] == "location":
            entry["label"] = loc_map.get(str(s["id"]), s["id"])
        elif s["type"] == "category":
            entry["label"] = cat_map.get(str(s["id"]), s["id"])
        enriched.append(entry)
    return enriched


_SUGGESTION_SELECT = """
    SELECT ws.*,
           su.id AS suggester_user_id, su.username AS suggester_username,
           su.display_name AS suggester_display_name,
           su.avatar_icon_url AS suggester_avatar_icon_url,
           su.status AS suggester_status,
           ru.id AS reviewer_user_id, ru.username AS reviewer_username,
           ru.display_name AS reviewer_display_name,
           ru.avatar_icon_url AS reviewer_avatar_icon_url,
           ru.status AS reviewer_status,
           gt.slug AS term_slug
    FROM wiki_suggestion ws
    JOIN users su ON su.id = ws.suggested_by
    LEFT JOIN users ru ON ru.id = ws.reviewed_by
    LEFT JOIN glossary_term gt ON gt.id = ws.glossary_term_id
"""


def _supersede_pending_for_item(suggestion_type, glossary_term_id=None,
                                wiki_page_path=None, exclude_id=None,
                                actor_user_id=None):
    """Set all other pending suggestions for the same item to 'superseded'."""
    if suggestion_type in ('new_term', 'edit_term') and glossary_term_id:
        rows = db.execute_query("""
            UPDATE wiki_suggestion
            SET status = 'superseded', updated_at = NOW()
            WHERE glossary_term_id = %s AND status = 'pending'
              AND id != %s
            RETURNING suggested_by
        """, (glossary_term_id, str(exclude_id) if exclude_id else '00000000-0000-0000-0000-000000000000'))
    elif suggestion_type in ('new_page', 'edit_page') and wiki_page_path:
        rows = db.execute_query("""
            UPDATE wiki_suggestion
            SET status = 'superseded', updated_at = NOW()
            WHERE wiki_page_path = %s AND status = 'pending'
              AND id != %s
            RETURNING suggested_by
        """, (wiki_page_path, str(exclude_id) if exclude_id else '00000000-0000-0000-0000-000000000000'))
    else:
        return

    if not rows:
        return

    # Notify superseded submitters
    try:
        from candid.controllers.helpers.push_notifications import send_or_queue_notification
        for r in rows:
            send_or_queue_notification(
                "Wiki suggestion superseded",
                "The item you suggested changes to has been updated. Please review and re-submit if needed.",
                {"action": "open_wiki_suggestions"},
                r["suggested_by"], db,
                notification_type='wiki_suggestion',
                actor_user_id=actor_user_id)
    except Exception as e:
        logger.error("Failed to notify superseded submitters: %s", e)


# ---------------------------------------------------------------------------
# Wiki suggestion endpoints
# ---------------------------------------------------------------------------

def create_wiki_suggestion(body, token_info=None):
    """POST /wiki/suggestions — submit a suggestion."""
    ok, err = authorization("normal", token_info)
    if not ok:
        return err, err.code

    user_id = token_info["sub"]

    suggestion_type = body.get("suggestionType") or body.get("suggestion_type")
    proposed_title = body.get("proposedTitle") or body.get("proposed_title", "")
    proposed_aliases = body.get("proposedAliases") or body.get("proposed_aliases") or []
    proposed_summary = body.get("proposedSummary") or body.get("proposed_summary")
    proposed_content = body.get("proposedContent") or body.get("proposed_content")
    proposed_wiki_category = body.get("proposedWikiCategory") or body.get("proposed_wiki_category")
    proposed_scopes = body.get("proposedScopes") or body.get("proposed_scopes") or []
    proposed_scope_combine = body.get("proposedScopeCombine") or body.get("proposed_scope_combine") or "or"
    glossary_term_id = body.get("glossaryTermId") or body.get("glossary_term_id")
    wiki_page_path = body.get("wikiPagePath") or body.get("wiki_page_path")
    suggestion_reason = body.get("suggestionReason") or body.get("suggestion_reason")

    # Validation
    if not proposed_title or not proposed_title.strip():
        return ErrorModel(400, "Title is required"), 400

    if suggestion_type not in ('new_term', 'edit_term', 'new_page', 'edit_page'):
        return ErrorModel(400, "Invalid suggestion type"), 400

    # Scopes mandatory for term suggestions
    if suggestion_type in ('new_term', 'edit_term') and not proposed_scopes:
        return ErrorModel(400, "Scope tags are required for term suggestions"), 400

    # Edit references must exist — fetch full snapshot for originals
    original_title = None
    original_aliases = []
    original_summary = None
    original_content = None
    original_wiki_category = None
    original_scopes = []
    original_scope_combine = 'or'

    if suggestion_type == 'edit_term':
        if not glossary_term_id:
            return ErrorModel(400, "glossaryTermId is required for edit_term"), 400
        term_row = db.execute_query(
            "SELECT * FROM glossary_term WHERE id = %s",
            (glossary_term_id,), fetchone=True)
        if not term_row:
            return ErrorModel(404, "Referenced term not found"), 404
        original_updated_at = term_row.get("updated_at")
        original_title = term_row.get("term")
        original_aliases = term_row.get("aliases") or []
        original_summary = term_row.get("summary")
        original_content = term_row.get("content")
        original_wiki_category = term_row.get("wiki_category")
        original_scope_combine = term_row.get("scope_combine", "or")
        scope_rows = db.execute_query(
            "SELECT scope_type, scope_id FROM glossary_term_scope WHERE term_id = %s",
            (glossary_term_id,))
        original_scopes = [{"type": r["scope_type"], "id": str(r["scope_id"])} for r in (scope_rows or [])]
    elif suggestion_type == 'edit_page':
        if not wiki_page_path:
            return ErrorModel(400, "wikiPagePath is required for edit_page"), 400
        page_row = db.execute_query(
            "SELECT * FROM wiki_page WHERE slug = %s",
            (wiki_page_path,), fetchone=True)
        original_updated_at = page_row.get("updated_at") if page_row else None
        if page_row:
            original_title = page_row.get("title")
            original_summary = page_row.get("description")
            original_content = page_row.get("content")
            original_wiki_category = page_row.get("wiki_category")
            original_scope_combine = page_row.get("scope_combine", "or")
            page_scope_rows = db.execute_query(
                "SELECT scope_type, scope_id FROM wiki_page_scope WHERE page_id = %s",
                (str(page_row["id"]),))
            original_scopes = [{"type": r["scope_type"], "id": str(r["scope_id"])} for r in (page_scope_rows or [])]
    else:
        original_updated_at = None

    # Rate limit: max 5 pending per user
    count_row = db.execute_query(
        "SELECT COUNT(*) AS cnt FROM wiki_suggestion WHERE suggested_by = %s AND status = 'pending'",
        (user_id,), fetchone=True)
    if count_row and count_row["cnt"] >= 5:
        return ErrorModel(429, "Maximum 5 pending suggestions allowed"), 429

    # No duplicate pending for same item by same user
    if suggestion_type == 'edit_term' and glossary_term_id:
        dup = db.execute_query(
            "SELECT id FROM wiki_suggestion WHERE suggested_by = %s AND glossary_term_id = %s AND status = 'pending'",
            (user_id, glossary_term_id), fetchone=True)
        if dup:
            return ErrorModel(400, "You already have a pending suggestion for this term"), 400
    elif suggestion_type == 'edit_page' and wiki_page_path:
        dup = db.execute_query(
            "SELECT id FROM wiki_suggestion WHERE suggested_by = %s AND wiki_page_path = %s AND status = 'pending'",
            (user_id, wiki_page_path), fetchone=True)
        if dup:
            return ErrorModel(400, "You already have a pending suggestion for this page"), 400

    # Insert
    row = db.execute_query("""
        INSERT INTO wiki_suggestion (
            suggestion_type, glossary_term_id, wiki_page_path,
            proposed_title, proposed_aliases, proposed_summary, proposed_content,
            proposed_wiki_category, proposed_scopes, proposed_scope_combine,
            original_title, original_aliases, original_summary, original_content,
            original_wiki_category, original_scopes, original_scope_combine,
            original_updated_at, suggested_by, suggestion_reason
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id, created_at
    """, (suggestion_type, glossary_term_id, wiki_page_path,
          proposed_title.strip(), proposed_aliases, proposed_summary,
          proposed_content, proposed_wiki_category,
          json.dumps(proposed_scopes), proposed_scope_combine,
          original_title, original_aliases, original_summary, original_content,
          original_wiki_category, json.dumps(original_scopes), original_scope_combine,
          original_updated_at, user_id, suggestion_reason),
        fetchone=True)

    if not row:
        return ErrorModel(500, "Failed to create suggestion"), 500

    suggestion_id = row["id"]

    # Notify reviewers
    try:
        reviewers = _find_suggestion_reviewers(proposed_scopes)
        # Don't notify the submitter
        reviewers = [r for r in reviewers if r != str(user_id)]

        if reviewers:
            submitter = db.execute_query(
                "SELECT display_name FROM users WHERE id = %s",
                (user_id,), fetchone=True)
            submitter_name = submitter["display_name"] if submitter else "Someone"

            from candid.controllers.helpers.push_notifications import send_or_queue_notification
            for reviewer_id in reviewers:
                send_or_queue_notification(
                    "New wiki suggestion",
                    f"{submitter_name} suggested a {suggestion_type.replace('_', ' ')}",
                    {"action": "open_wiki_suggestions"},
                    reviewer_id, db,
                    notification_type='wiki_suggestion',
                    actor_user_id=user_id)
    except Exception as e:
        logger.error("Failed to notify reviewers: %s", e)

    # Fetch and return the created suggestion
    result = db.execute_query(
        _SUGGESTION_SELECT + " WHERE ws.id = %s",
        (str(suggestion_id),), fetchone=True)

    return _format_suggestion(result), 201


def get_wiki_suggestions(token_info=None, view=None):
    """GET /wiki/suggestions — list suggestions."""
    ok, err = authorization_allow_banned("normal", token_info)
    if not ok:
        return err, err.code

    user_id = token_info["sub"]
    view = view or "mine"

    if view == "mine":
        rows = db.execute_query(
            _SUGGESTION_SELECT + " WHERE ws.suggested_by = %s ORDER BY ws.created_at DESC",
            (user_id,))
    elif view == "pending":
        # Get all pending, then filter by reviewer authority
        rows = db.execute_query(
            _SUGGESTION_SELECT + " WHERE ws.status = 'pending' ORDER BY ws.created_at ASC")
        if rows:
            rows = [r for r in rows if _user_can_review_suggestion(
                user_id, r.get("proposed_scopes") or [])]
    elif view == "all":
        # All suggestions within user's authority scope
        rows = db.execute_query(
            _SUGGESTION_SELECT + " ORDER BY ws.created_at DESC")
        if rows:
            rows = [r for r in rows if (
                str(r["suggested_by"]) == str(user_id) or
                _user_can_review_suggestion(user_id, r.get("proposed_scopes") or [])
            )]
    else:
        return ErrorModel(400, "Invalid view parameter"), 400

    return [_format_suggestion(r) for r in (rows or [])], 200


def get_wiki_suggestion(suggestion_id, token_info=None):
    """GET /wiki/suggestions/{suggestionId} — suggestion detail."""
    ok, err = authorization_allow_banned("normal", token_info)
    if not ok:
        return err, err.code

    row = db.execute_query(
        _SUGGESTION_SELECT + " WHERE ws.id = %s",
        (suggestion_id,), fetchone=True)

    if not row:
        return ErrorModel(404, "Suggestion not found"), 404

    result = _format_suggestion(row)

    # Add isStale flag for edit suggestions
    if row["suggestion_type"] == "edit_term" and row.get("glossary_term_id"):
        term = db.execute_query(
            "SELECT updated_at FROM glossary_term WHERE id = %s",
            (row["glossary_term_id"],), fetchone=True)
        if term and row.get("original_updated_at"):
            result["isStale"] = term["updated_at"] != row["original_updated_at"]
        else:
            result["isStale"] = False
    elif row["suggestion_type"] == "edit_page" and row.get("wiki_page_path"):
        page = db.execute_query(
            "SELECT updated_at FROM wiki_page WHERE slug = %s",
            (row["wiki_page_path"],), fetchone=True)
        if page and row.get("original_updated_at"):
            result["isStale"] = page["updated_at"] != row["original_updated_at"]
        else:
            result["isStale"] = False
    else:
        result["isStale"] = False

    return result, 200


def update_wiki_suggestion(suggestion_id, body, token_info=None):
    """PUT /wiki/suggestions/{suggestionId} — review (approve/deny/withdraw)."""
    ok, err = authorization("normal", token_info)
    if not ok:
        return err, err.code

    user_id = token_info["sub"]

    row = db.execute_query(
        "SELECT * FROM wiki_suggestion WHERE id = %s",
        (suggestion_id,), fetchone=True)
    if not row:
        return ErrorModel(404, "Suggestion not found"), 404

    if row["status"] != "pending":
        return ErrorModel(400, f"Suggestion is already {row['status']}"), 400

    new_status = body.get("status")
    review_note = body.get("reviewNote") or body.get("review_note")

    if new_status not in ("approved", "denied", "withdrawn"):
        return ErrorModel(400, "Status must be approved, denied, or withdrawn"), 400

    if new_status == "withdrawn":
        # Only submitter can withdraw
        if str(row["suggested_by"]) != str(user_id):
            return ErrorModel(403, "Only the submitter can withdraw"), 403
    else:
        # Approve/deny: must be qualified reviewer
        proposed_scopes = row.get("proposed_scopes") or []
        if not _user_can_review_suggestion(user_id, proposed_scopes):
            return ErrorModel(403, "Not authorized to review this suggestion"), 403

    # Reviewer edits: update proposed fields before applying
    has_reviewer_edits = False
    if new_status == "approved":
        reviewer_fields = {}
        field_map = {
            'proposedTitle': 'proposed_title',
            'proposedSummary': 'proposed_summary',
            'proposedContent': 'proposed_content',
            'proposedWikiCategory': 'proposed_wiki_category',
            'proposedAliases': 'proposed_aliases',
            'proposedScopes': 'proposed_scopes',
            'proposedScopeCombine': 'proposed_scope_combine',
        }
        for api_key, db_key in field_map.items():
            if api_key in body:
                reviewer_fields[db_key] = body[api_key]

        if reviewer_fields:
            has_reviewer_edits = True
            set_clauses = []
            params = []
            for db_key, value in reviewer_fields.items():
                if db_key == 'proposed_scopes':
                    set_clauses.append(f"{db_key} = %s")
                    params.append(json.dumps(value))
                else:
                    set_clauses.append(f"{db_key} = %s")
                    params.append(value)
            set_clauses.append("updated_at = NOW()")
            params.append(suggestion_id)
            db.execute_query(
                f"UPDATE wiki_suggestion SET {', '.join(set_clauses)} WHERE id = %s",
                tuple(params))
            # Re-fetch the updated row for apply
            row = db.execute_query(
                "SELECT * FROM wiki_suggestion WHERE id = %s",
                (suggestion_id,), fetchone=True)

    # Apply changes on approval
    if new_status == "approved":
        apply_err = _apply_suggestion(row, user_id)
        if apply_err:
            return apply_err

    # Update the suggestion status
    db.execute_query("""
        UPDATE wiki_suggestion
        SET status = %s, reviewed_by = %s, review_note = %s,
            reviewed_at = NOW(), updated_at = NOW()
        WHERE id = %s
    """, (new_status, user_id if new_status != "withdrawn" else None,
          review_note, suggestion_id))

    # Clean up orphan images on denial or withdrawal
    if new_status in ("denied", "withdrawn"):
        proposed_content = row.get("proposed_content")
        image_ids = _extract_image_ids(proposed_content)
        if image_ids:
            try:
                _cleanup_orphan_images(image_ids)
            except Exception as e:
                logger.error("Failed to clean up images for suggestion %s: %s", suggestion_id, e)

    # Supersede other pending for same item on approval
    if new_status == "approved":
        _supersede_pending_for_item(
            row["suggestion_type"],
            glossary_term_id=row.get("glossary_term_id"),
            wiki_page_path=row.get("wiki_page_path"),
            exclude_id=suggestion_id,
            actor_user_id=user_id)

    # Notify submitter of outcome (unless they withdrew themselves)
    if new_status != "withdrawn":
        try:
            reviewer = db.execute_query(
                "SELECT display_name FROM users WHERE id = %s",
                (user_id,), fetchone=True)
            reviewer_name = reviewer["display_name"] if reviewer else "A reviewer"

            status_label = "approved" if new_status == "approved" else "declined"
            title = f"Wiki suggestion {status_label}"
            notif_body = f"{reviewer_name} {status_label} your {row['suggestion_type'].replace('_', ' ')} suggestion"
            if has_reviewer_edits:
                notif_body += ". The reviewer made edits to your suggestion before approving"
            if review_note:
                notif_body += f": {review_note}"

            from candid.controllers.helpers.push_notifications import send_or_queue_notification
            send_or_queue_notification(
                title, notif_body,
                {"action": "open_wiki_suggestions"},
                row["suggested_by"], db,
                notification_type='wiki_suggestion',
                actor_user_id=user_id)
        except Exception as e:
            logger.error("Failed to notify submitter: %s", e)

    # Return updated suggestion
    result = db.execute_query(
        _SUGGESTION_SELECT + " WHERE ws.id = %s",
        (suggestion_id,), fetchone=True)

    return _format_suggestion(result), 200


def _three_way_merge_text(original, proposed, current):
    """Line-based 3-way merge for text fields.

    Returns (merged_text, has_conflict).
    - If original == current: no intervening edit → use proposed.
    - If original == proposed: suggestion didn't change → use current.
    - If current == proposed: same change made → use current.
    - Otherwise: attempt line-level merge via difflib.
    """
    if original == current:
        return proposed, False
    if original == proposed:
        return current, False
    if current == proposed:
        return current, False

    # Attempt line-level merge using difflib
    import difflib
    orig_lines = (original or '').splitlines(keepends=True)
    prop_lines = (proposed or '').splitlines(keepends=True)
    curr_lines = (current or '').splitlines(keepends=True)

    # Get changes: original→proposed and original→current
    sm_prop = difflib.SequenceMatcher(None, orig_lines, prop_lines)
    sm_curr = difflib.SequenceMatcher(None, orig_lines, curr_lines)

    prop_changes = set()
    for tag, i1, i2, j1, j2 in sm_prop.get_opcodes():
        if tag != 'equal':
            for i in range(i1, i2):
                prop_changes.add(i)

    curr_changes = set()
    for tag, i1, i2, j1, j2 in sm_curr.get_opcodes():
        if tag != 'equal':
            for i in range(i1, i2):
                curr_changes.add(i)

    # If changes overlap, it's a conflict
    if prop_changes & curr_changes:
        return None, True

    # Non-overlapping changes — apply proposed changes on top of current
    # Since they don't overlap, we can safely use the proposed version
    return proposed, False


def _three_way_merge_scalar(original, proposed, current):
    """3-way merge for scalar fields (title, summary, category, scope_combine).

    Returns (merged_value, has_conflict).
    """
    if original == current:
        return proposed, False
    if original == proposed:
        return current, False
    if current == proposed:
        return current, False
    return None, True


def _three_way_merge_array(original, proposed, current):
    """Set-based 3-way merge for array fields (aliases).

    Adds new items from proposed, removes items deleted in proposed, keeps intervening additions.
    Returns (merged_list, has_conflict). Never conflicts.
    """
    orig_set = set(original or [])
    prop_set = set(proposed or [])
    curr_set = set(current or [])

    added_by_proposal = prop_set - orig_set
    removed_by_proposal = orig_set - prop_set

    merged = (curr_set | added_by_proposal) - removed_by_proposal
    return sorted(merged), False


def _three_way_merge_scopes(original, proposed, current):
    """Set-based 3-way merge for scope arrays.

    Returns (merged_scopes, has_conflict). Never conflicts.
    """
    def scope_key(s):
        return (s.get("type"), str(s.get("id")))

    orig_keys = {scope_key(s) for s in (original or [])}
    prop_keys = {scope_key(s) for s in (proposed or [])}
    curr_keys = {scope_key(s) for s in (current or [])}
    curr_map = {scope_key(s): s for s in (current or [])}
    prop_map = {scope_key(s): s for s in (proposed or [])}

    added_by_proposal = prop_keys - orig_keys
    removed_by_proposal = orig_keys - prop_keys

    merged_keys = (curr_keys | added_by_proposal) - removed_by_proposal
    merged = []
    for key in merged_keys:
        if key in prop_map:
            merged.append(prop_map[key])
        elif key in curr_map:
            merged.append(curr_map[key])
    return merged, False


def _apply_suggestion(row, reviewer_user_id):
    """Apply an approved suggestion — create/update term or page.

    For edit types, performs 3-way merge comparing original snapshot to current
    content. Returns (ErrorModel, status_code) on conflict/failure, None on success.
    """
    suggestion_type = row["suggestion_type"]
    proposed_scopes = row.get("proposed_scopes") or []

    if suggestion_type in ("new_term", "edit_term"):
        # Build slug from title
        slug = re.sub(r'[^a-z0-9]+', '-', row["proposed_title"].lower()).strip('-')
        if not slug:
            return ErrorModel(400, "Cannot derive slug from title"), 400

        merged_title = row["proposed_title"]
        merged_aliases = row.get("proposed_aliases") or []
        merged_summary = row.get("proposed_summary")
        merged_content = row.get("proposed_content")
        merged_wiki_category = row.get("proposed_wiki_category")
        merged_scope_combine = row.get("proposed_scope_combine", "or")
        merged_scopes = proposed_scopes

        old_content = None
        if suggestion_type == "edit_term" and row.get("glossary_term_id"):
            # Get existing slug and current content
            existing = db.execute_query(
                "SELECT slug, term, aliases, summary, content, wiki_category, scope_combine FROM glossary_term WHERE id = %s",
                (row["glossary_term_id"],), fetchone=True)
            if existing:
                slug = existing["slug"]
                old_content = existing.get("content")

                # 3-way merge if we have original snapshot
                if row.get("original_title") is not None:
                    conflicts = []
                    orig = row

                    val, conflict = _three_way_merge_scalar(orig.get("original_title"), row["proposed_title"], existing["term"])
                    if conflict:
                        conflicts.append("title")
                    else:
                        merged_title = val

                    val, conflict = _three_way_merge_text(orig.get("original_summary"), row.get("proposed_summary"), existing.get("summary"))
                    if conflict:
                        conflicts.append("summary")
                    else:
                        merged_summary = val

                    val, conflict = _three_way_merge_text(orig.get("original_content"), row.get("proposed_content"), existing.get("content"))
                    if conflict:
                        conflicts.append("content")
                    else:
                        merged_content = val

                    val, conflict = _three_way_merge_scalar(orig.get("original_wiki_category"), row.get("proposed_wiki_category"), existing.get("wiki_category"))
                    if conflict:
                        conflicts.append("category")
                    else:
                        merged_wiki_category = val

                    val, conflict = _three_way_merge_scalar(orig.get("original_scope_combine"), row.get("proposed_scope_combine", "or"), existing.get("scope_combine", "or"))
                    if conflict:
                        conflicts.append("scope combine")
                    else:
                        merged_scope_combine = val

                    merged_aliases, _ = _three_way_merge_array(orig.get("original_aliases"), row.get("proposed_aliases"), existing.get("aliases"))

                    # Merge scopes
                    orig_scopes = orig.get("original_scopes") or []
                    curr_scope_rows = db.execute_query(
                        "SELECT scope_type, scope_id FROM glossary_term_scope WHERE term_id = %s",
                        (row["glossary_term_id"],))
                    curr_scopes = [{"type": r["scope_type"], "id": str(r["scope_id"])} for r in (curr_scope_rows or [])]
                    merged_scopes, _ = _three_way_merge_scopes(orig_scopes, proposed_scopes, curr_scopes)

                    if conflicts:
                        return ErrorModel(409, f"Cannot auto-merge: conflicting changes in {', '.join(conflicts)}. Deny and ask submitter to update."), 409

        parsed = {
            "term": merged_title,
            "aliases": merged_aliases,
            "summary": merged_summary,
            "content": merged_content,
            "wiki_category": merged_wiki_category,
            "scope_combine": merged_scope_combine,
            "location_ids": [s["id"] for s in merged_scopes if s.get("type") == "location"],
            "category_ids": [s["id"] for s in merged_scopes if s.get("type") == "category"],
        }

        # For edit_term: snapshot current content before updating
        if suggestion_type == "edit_term" and row.get("glossary_term_id"):
            existing_term = db.execute_query(
                "SELECT id, term, aliases, summary, content, wiki_category FROM glossary_term WHERE id = %s",
                (row["glossary_term_id"],), fetchone=True)
            if existing_term:
                db.execute_query("""
                    INSERT INTO glossary_term_version (term_id, term, aliases, summary, content, wiki_category, edited_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (existing_term["id"], existing_term["term"],
                      existing_term.get("aliases") or [],
                      existing_term.get("summary"), existing_term.get("content"),
                      existing_term.get("wiki_category"), reviewer_user_id))

        term_id = _upsert_glossary_term(slug, parsed)
        if not term_id:
            return ErrorModel(500, "Failed to apply term changes"), 500

        # Clean up images that were in old content but not in merged
        if old_content:
            removed = _extract_image_ids(old_content) - _extract_image_ids(merged_content)
            if removed:
                try:
                    _cleanup_orphan_images(removed)
                except Exception as e:
                    logger.error("Failed to clean up images on term approval: %s", e)

        # If new_term, update the glossary_term_id on the suggestion and log creation version
        if suggestion_type == "new_term":
            db.execute_query(
                "UPDATE wiki_suggestion SET glossary_term_id = %s WHERE id = %s",
                (term_id, str(row["id"])))
            # Log creation as first version entry
            db.execute_query("""
                INSERT INTO glossary_term_version (term_id, term, aliases, summary, content, wiki_category, edited_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (term_id, merged_title, merged_aliases or [],
                  merged_summary, merged_content, merged_wiki_category, row["suggested_by"]))

    elif suggestion_type == "new_page":
        # Create page in native wiki_page table
        slug = re.sub(r'[^a-z0-9/]+', '-', row["proposed_title"].lower()).strip('-')
        if not slug:
            return ErrorModel(400, "Cannot derive slug from title"), 400

        scope_combine = row.get("proposed_scope_combine", "or")

        page_row = db.execute_query("""
            INSERT INTO wiki_page (slug, title, description, content, wiki_category,
                                   scope_combine, created_by, updated_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (slug) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                content = EXCLUDED.content,
                wiki_category = EXCLUDED.wiki_category,
                scope_combine = EXCLUDED.scope_combine,
                updated_by = EXCLUDED.updated_by,
                updated_at = NOW()
            RETURNING id
        """, (slug, row["proposed_title"], row.get("proposed_summary"),
              row.get("proposed_content"), row.get("proposed_wiki_category"),
              scope_combine, reviewer_user_id, reviewer_user_id),
            fetchone=True)

        if page_row:
            page_id = str(page_row["id"])
            # Add scope rows
            for s in proposed_scopes:
                db.execute_query("""
                    INSERT INTO wiki_page_scope (page_id, scope_type, scope_id)
                    VALUES (%s, %s, %s) ON CONFLICT DO NOTHING
                """, (page_id, s["type"], s["id"]))

            # Update suggestion with the page path
            db.execute_query(
                "UPDATE wiki_suggestion SET wiki_page_path = %s, wiki_page_id = %s WHERE id = %s",
                (slug, page_id, str(row["id"])))

            # Log creation as first version entry
            db.execute_query("""
                INSERT INTO wiki_page_version (page_id, title, description, content, wiki_category, edited_by)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (page_id, row["proposed_title"], row.get("proposed_summary"),
                  row.get("proposed_content"), row.get("proposed_wiki_category"), row["suggested_by"]))

    elif suggestion_type == "edit_page" and row.get("wiki_page_path"):
        page = db.execute_query(
            "SELECT id, title, description, content, wiki_category, scope_combine FROM wiki_page WHERE slug = %s",
            (row["wiki_page_path"],), fetchone=True)
        if page:
            page_id = str(page["id"])

            merged_title = row["proposed_title"]
            merged_summary = row.get("proposed_summary")
            merged_content = row.get("proposed_content")
            merged_wiki_category = row.get("proposed_wiki_category")
            merged_scope_combine = row.get("proposed_scope_combine", "or")
            merged_scopes = proposed_scopes

            # 3-way merge if we have original snapshot
            if row.get("original_title") is not None:
                conflicts = []
                orig = row

                val, conflict = _three_way_merge_scalar(orig.get("original_title"), row["proposed_title"], page["title"])
                if conflict:
                    conflicts.append("title")
                else:
                    merged_title = val

                val, conflict = _three_way_merge_text(orig.get("original_summary"), row.get("proposed_summary"), page.get("description"))
                if conflict:
                    conflicts.append("summary")
                else:
                    merged_summary = val

                val, conflict = _three_way_merge_text(orig.get("original_content"), row.get("proposed_content"), page.get("content"))
                if conflict:
                    conflicts.append("content")
                else:
                    merged_content = val

                val, conflict = _three_way_merge_scalar(orig.get("original_wiki_category"), row.get("proposed_wiki_category"), page.get("wiki_category"))
                if conflict:
                    conflicts.append("category")
                else:
                    merged_wiki_category = val

                val, conflict = _three_way_merge_scalar(orig.get("original_scope_combine"), row.get("proposed_scope_combine", "or"), page.get("scope_combine", "or"))
                if conflict:
                    conflicts.append("scope combine")
                else:
                    merged_scope_combine = val

                # Merge scopes
                orig_scopes = orig.get("original_scopes") or []
                curr_scope_rows = db.execute_query(
                    "SELECT scope_type, scope_id FROM wiki_page_scope WHERE page_id = %s",
                    (page_id,))
                curr_scopes = [{"type": r["scope_type"], "id": str(r["scope_id"])} for r in (curr_scope_rows or [])]
                merged_scopes, _ = _three_way_merge_scopes(orig_scopes, proposed_scopes, curr_scopes)

                if conflicts:
                    return ErrorModel(409, f"Cannot auto-merge: conflicting changes in {', '.join(conflicts)}. Deny and ask submitter to update."), 409

            # Snapshot current content into wiki_page_version
            db.execute_query("""
                INSERT INTO wiki_page_version (page_id, title, description, content, wiki_category, edited_by)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (page_id, page["title"], page.get("description"),
                  page.get("content"), page.get("wiki_category"), reviewer_user_id))

            # Update page with merged values
            db.execute_query("""
                UPDATE wiki_page SET title = %s, description = %s, content = %s,
                       wiki_category = %s, scope_combine = %s,
                       updated_by = %s, updated_at = NOW()
                WHERE id = %s
            """, (merged_title, merged_summary, merged_content,
                  merged_wiki_category, merged_scope_combine, reviewer_user_id, page_id))

            # Update scopes
            db.execute_query("DELETE FROM wiki_page_scope WHERE page_id = %s", (page_id,))
            for s in merged_scopes:
                db.execute_query("""
                    INSERT INTO wiki_page_scope (page_id, scope_type, scope_id)
                    VALUES (%s, %s, %s) ON CONFLICT DO NOTHING
                """, (page_id, s["type"], s["id"]))

            # Clean up images that were in old content but not in merged
            removed = _extract_image_ids(page.get("content")) - _extract_image_ids(merged_content)
            if removed:
                try:
                    _cleanup_orphan_images(removed)
                except Exception as e:
                    logger.error("Failed to clean up images on page approval: %s", e)

    return None


def get_wiki_suggestion_count(token_info=None):
    """GET /wiki/suggestions/count — pending reviewable count."""
    ok, err = authorization_allow_banned("normal", token_info)
    if not ok:
        return err, err.code

    user_id = token_info["sub"]

    # Get all pending suggestions
    rows = db.execute_query(
        "SELECT id, proposed_scopes FROM wiki_suggestion WHERE status = 'pending'")

    count = 0
    for r in (rows or []):
        scopes = r.get("proposed_scopes") or []
        if _user_can_review_suggestion(user_id, scopes):
            count += 1

    return {"count": count}, 200


# ---------------------------------------------------------------------------
# Wiki image upload & serve (native PostgreSQL bytea storage)
# ---------------------------------------------------------------------------

_WIKI_IMAGE_ID_RE = re.compile(r'/api/v1/wiki/images/([0-9a-f-]{36})')


def _extract_image_ids(content):
    """Extract wiki image UUIDs from markdown/HTML content."""
    if not content:
        return set()
    return set(_WIKI_IMAGE_ID_RE.findall(content))


def _cleanup_orphan_images(image_ids):
    """Delete wiki images that are not referenced by any live content.

    Checks glossary_term.content, wiki_page.content, and pending wiki_suggestion
    proposed_content for references before deleting.
    """
    if not image_ids:
        return
    for image_id in image_ids:
        pattern = f'%/wiki/images/{image_id}%'
        # Check if image is used in any live glossary term or wiki page
        used = db.execute_query("""
            SELECT 1 FROM glossary_term WHERE content LIKE %s
            UNION ALL
            SELECT 1 FROM wiki_page WHERE content LIKE %s
            UNION ALL
            SELECT 1 FROM wiki_suggestion
              WHERE status = 'pending' AND proposed_content LIKE %s
            LIMIT 1
        """, (pattern, pattern, pattern), fetchone=True)
        if not used:
            db.execute_query("DELETE FROM wiki_image WHERE id = %s", (image_id,))


ALLOWED_IMAGE_TYPES = {'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'}
ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB


def upload_wiki_image(token_info=None, **kwargs):
    """POST /wiki/images — upload an image for wiki content."""
    ok, err = authorization("normal", token_info)
    if not ok:
        return err, err.code

    user_id = token_info["sub"]

    files = connexion.request.files
    if 'file' not in files:
        return ErrorModel(400, "No file provided"), 400

    file = files['file']
    if not file.filename:
        return ErrorModel(400, "No file provided"), 400

    # Validate extension
    import os
    _, ext = os.path.splitext(file.filename.lower())
    if ext not in ALLOWED_EXTENSIONS:
        return ErrorModel(400, f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"), 400

    # Validate content type
    content_type = file.content_type or ''
    if content_type not in ALLOWED_IMAGE_TYPES:
        return ErrorModel(400, f"Invalid content type: {content_type}"), 400

    # Read and validate size
    file_data = file.read()
    if len(file_data) > MAX_IMAGE_SIZE:
        return ErrorModel(400, "File too large. Maximum 5MB."), 400

    # Store in wiki_image table
    import psycopg2
    row = db.execute_query("""
        INSERT INTO wiki_image (filename, content_type, data, uploaded_by)
        VALUES (%s, %s, %s, %s)
        RETURNING id
    """, (file.filename, content_type, psycopg2.Binary(file_data), user_id),
        fetchone=True)

    if not row:
        return ErrorModel(500, "Failed to store image"), 500

    image_id = str(row["id"])
    return {"url": f"/api/v1/wiki/images/{image_id}"}, 201


def get_wiki_image(image_id, token_info=None):
    """GET /wiki/images/{imageId} — serve image from DB."""
    # No auth required for image serving (images are public once uploaded)
    row = db.execute_query("""
        SELECT filename, content_type, data FROM wiki_image WHERE id = %s
    """, (image_id,), fetchone=True)

    if not row:
        return ErrorModel(404, "Image not found"), 404

    response = make_response(bytes(row["data"]))
    response.headers['Content-Type'] = row["content_type"]
    response.headers['Cache-Control'] = 'public, max-age=86400'
    response.headers['Content-Disposition'] = f'inline; filename="{row["filename"]}"'
    return response
