"""Wiki/glossary helper functions — suggestion processing, merging, and image cleanup."""

import difflib
import json
import logging
import re

from candid.models.error_model import ErrorModel
from candid.controllers import db
from candid.controllers.helpers.auth import get_location_ancestors, is_root_admin

logger = logging.getLogger(__name__)


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

    for sess_id in parsed["session_ids"]:
        db.execute_query(
            "INSERT INTO glossary_term_scope (term_id, scope_type, scope_id) VALUES (%s, 'session', %s)",
            (term_id, sess_id))

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
    session_ids = []
    for scope in (proposed_scopes or []):
        if scope.get("type") == "location":
            location_ids.append(str(scope["id"]))
        elif scope.get("type") == "session":
            session_ids.append(str(scope["id"]))

    if not location_ids and not session_ids:
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

    # Session-scoped: facilitator or expert for that session
    for sess_id in session_ids:
        rows = db.execute_query("""
            SELECT DISTINCT user_id::text
            FROM user_role
            WHERE role IN ('facilitator', 'expert')
              AND session_id = %s
        """, (sess_id,))
        for r in (rows or []):
            reviewer_ids.add(r["user_id"])

        # Also admins/moderators at any location can review session-scoped
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
    """Add human-readable labels to scope objects by looking up location/session names."""
    loc_ids = [s["id"] for s in scopes if s.get("type") == "location"]
    sess_ids = [s["id"] for s in scopes if s.get("type") == "session"]

    loc_map = {}
    if loc_ids:
        rows = db.execute_query(
            "SELECT id, name FROM location WHERE id = ANY(%s::uuid[])", (loc_ids,))
        loc_map = {str(r["id"]): r["name"] for r in (rows or [])}

    sess_map = {}
    if sess_ids:
        rows = db.execute_query(
            "SELECT id, label FROM session WHERE id = ANY(%s::uuid[])", (sess_ids,))
        sess_map = {str(r["id"]): r["label"] for r in (rows or [])}

    enriched = []
    for s in scopes:
        entry = {"type": s["type"], "id": s["id"]}
        if s["type"] == "location":
            entry["label"] = loc_map.get(str(s["id"]), s["id"])
        elif s["type"] == "session":
            entry["label"] = sess_map.get(str(s["id"]), s["id"])
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


def _snapshot_scopes(scope_table, id_column, item_id):
    """Build a JSONB-ready list of scope snapshots with labels for a wiki page or glossary term."""
    rows = db.execute_query(f"""
        SELECT s.scope_type, s.scope_id::text,
               CASE WHEN s.scope_type = 'location' THEN l.name
                    WHEN s.scope_type = 'session' THEN pc.label
               END AS label
        FROM {scope_table} s
        LEFT JOIN location l ON s.scope_type = 'location' AND l.id = s.scope_id
        LEFT JOIN session pc ON s.scope_type = 'session' AND pc.id = s.scope_id
        WHERE s.{id_column} = %s
    """, (item_id,))
    return json.dumps([
        {"type": r["scope_type"], "id": r["scope_id"], "label": r.get("label")}
        for r in (rows or [])
    ])


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


def _supersede_pending_new_by_slug(suggestion_type, slug, item_id, actor_user_id):
    """Supersede pending new_term/new_page suggestions whose title matches the given slug."""
    if suggestion_type == "new_term":
        rows = db.execute_query("""
            UPDATE wiki_suggestion
            SET status = 'superseded', glossary_term_id = %s, updated_at = NOW()
            WHERE status = 'pending' AND suggestion_type = 'new_term'
              AND trim(both '-' from regexp_replace(lower(proposed_title), '[^a-z0-9]+', '-', 'g')) = %s
            RETURNING suggested_by
        """, (item_id, slug))
    elif suggestion_type == "new_page":
        rows = db.execute_query("""
            UPDATE wiki_suggestion
            SET status = 'superseded', wiki_page_path = %s, wiki_page_id = %s, updated_at = NOW()
            WHERE status = 'pending' AND suggestion_type = 'new_page'
              AND trim(both '-' from regexp_replace(lower(proposed_title), '[^a-z0-9/]+', '-', 'g')) = %s
            RETURNING suggested_by
        """, (slug, str(item_id), slug))
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
                "The item you suggested has been created directly. Your suggestion has been superseded.",
                {"action": "open_wiki_suggestions"},
                r["suggested_by"], db,
                notification_type='wiki_suggestion',
                actor_user_id=actor_user_id)
    except Exception as e:
        logger.error("Failed to notify superseded submitters: %s", e)


# ---------------------------------------------------------------------------
# Three-way merge helpers
# ---------------------------------------------------------------------------

def _three_way_merge_text(original, proposed, current):
    """Line-based 3-way merge for text fields.

    Returns (merged_text, has_conflict).
    - If original == current: no intervening edit -> use proposed.
    - If original == proposed: suggestion didn't change -> use current.
    - If current == proposed: same change made -> use current.
    - Otherwise: attempt line-level merge via difflib.
    """
    if original == current:
        return proposed, False
    if original == proposed:
        return current, False
    if current == proposed:
        return current, False

    # Attempt line-level merge using difflib
    orig_lines = (original or '').splitlines(keepends=True)
    prop_lines = (proposed or '').splitlines(keepends=True)
    curr_lines = (current or '').splitlines(keepends=True)

    # Get changes: original->proposed and original->current
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

    # Non-overlapping changes -- apply proposed changes on top of current
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


def _reviewer_actually_changed(original_proposed, row):
    """Compare original proposed values to the (possibly reviewer-modified) row.

    Returns True if any of title, summary, content, wiki_category, or aliases
    differ between what the submitter proposed and what's now in the row.
    """
    if not original_proposed:
        return False
    fields = [
        ("proposed_title", "proposed_title"),
        ("proposed_summary", "proposed_summary"),
        ("proposed_content", "proposed_content"),
        ("proposed_wiki_category", "proposed_wiki_category"),
    ]
    for orig_key, row_key in fields:
        orig_val = original_proposed.get(orig_key)
        row_val = row.get(row_key)
        if orig_val != row_val:
            return True
    # Compare aliases (normalize None to [])
    orig_aliases = original_proposed.get("proposed_aliases") or []
    row_aliases = row.get("proposed_aliases") or []
    if orig_aliases != row_aliases:
        return True
    return False


def _apply_suggestion(row, reviewer_user_id, original_proposed=None):
    """Apply an approved suggestion -- create/update term or page.

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
            "session_ids": [s["id"] for s in merged_scopes if s.get("type") == "session"],
        }

        # For edit_term: snapshot current content before updating
        if suggestion_type == "edit_term" and row.get("glossary_term_id"):
            existing_term = db.execute_query(
                "SELECT id, term, aliases, summary, content, wiki_category FROM glossary_term WHERE id = %s",
                (row["glossary_term_id"],), fetchone=True)
            if existing_term:
                term_scopes_json = _snapshot_scopes("glossary_term_scope", "term_id", existing_term["id"])
                existing_scope_combine = db.execute_query(
                    "SELECT scope_combine FROM glossary_term WHERE id = %s",
                    (existing_term["id"],), fetchone=True)
                existing_sc = existing_scope_combine.get("scope_combine", "or") if existing_scope_combine else "or"
                if original_proposed and _reviewer_actually_changed(original_proposed, row):
                    # Two versions: submitter's changes then reviewer's modifications
                    # Version 1: pre-edit content, attributed to submitter
                    db.execute_query("""
                        INSERT INTO glossary_term_version (term_id, term, aliases, summary, content, wiki_category, scopes, scope_combine, edited_by, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    """, (existing_term["id"], existing_term["term"],
                          existing_term.get("aliases") or [],
                          existing_term.get("summary"), existing_term.get("content"),
                          existing_term.get("wiki_category"),
                          term_scopes_json, existing_sc, row["suggested_by"]))
                    # Version 2: submitter's original proposed content, attributed to reviewer
                    orig_proposed_scopes = json.dumps(original_proposed.get("proposed_scopes") or [])
                    db.execute_query("""
                        INSERT INTO glossary_term_version (term_id, term, aliases, summary, content, wiki_category, scopes, scope_combine, edited_by, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW() + INTERVAL '1 second')
                    """, (existing_term["id"],
                          original_proposed.get("proposed_title") or existing_term["term"],
                          original_proposed.get("proposed_aliases") or existing_term.get("aliases") or [],
                          original_proposed.get("proposed_summary") if original_proposed.get("proposed_summary") is not None else existing_term.get("summary"),
                          original_proposed.get("proposed_content") if original_proposed.get("proposed_content") is not None else existing_term.get("content"),
                          original_proposed.get("proposed_wiki_category") if original_proposed.get("proposed_wiki_category") is not None else existing_term.get("wiki_category"),
                          orig_proposed_scopes,
                          original_proposed.get("proposed_scope_combine", "or"),
                          reviewer_user_id))
                else:
                    # Single version: pre-edit content, attributed to submitter
                    db.execute_query("""
                        INSERT INTO glossary_term_version (term_id, term, aliases, summary, content, wiki_category, scopes, scope_combine, edited_by)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (existing_term["id"], existing_term["term"],
                          existing_term.get("aliases") or [],
                          existing_term.get("summary"), existing_term.get("content"),
                          existing_term.get("wiki_category"),
                          term_scopes_json, existing_sc, row["suggested_by"]))

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
            new_term_scopes_json = _snapshot_scopes("glossary_term_scope", "term_id", term_id)
            if original_proposed and _reviewer_actually_changed(original_proposed, row):
                orig_proposed_scopes = json.dumps(original_proposed.get("proposed_scopes") or [])
                # Two versions: submitter's original then reviewer attribution
                # Version 1: submitter's original proposed content
                db.execute_query("""
                    INSERT INTO glossary_term_version (term_id, term, aliases, summary, content, wiki_category, scopes, scope_combine, edited_by, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                """, (term_id,
                      original_proposed.get("proposed_title"),
                      original_proposed.get("proposed_aliases") or [],
                      original_proposed.get("proposed_summary"),
                      original_proposed.get("proposed_content"),
                      original_proposed.get("proposed_wiki_category"),
                      orig_proposed_scopes,
                      original_proposed.get("proposed_scope_combine", "or"),
                      row["suggested_by"]))
                # Version 2: same submitter content, attributed to reviewer
                db.execute_query("""
                    INSERT INTO glossary_term_version (term_id, term, aliases, summary, content, wiki_category, scopes, scope_combine, edited_by, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW() + INTERVAL '1 second')
                """, (term_id,
                      original_proposed.get("proposed_title"),
                      original_proposed.get("proposed_aliases") or [],
                      original_proposed.get("proposed_summary"),
                      original_proposed.get("proposed_content"),
                      original_proposed.get("proposed_wiki_category"),
                      orig_proposed_scopes,
                      original_proposed.get("proposed_scope_combine", "or"),
                      reviewer_user_id))
            else:
                # Single creation version
                db.execute_query("""
                    INSERT INTO glossary_term_version (term_id, term, aliases, summary, content, wiki_category, scopes, scope_combine, edited_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (term_id, merged_title, merged_aliases or [],
                      merged_summary, merged_content, merged_wiki_category,
                      new_term_scopes_json, merged_scope_combine, row["suggested_by"]))

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

            # Log creation version(s)
            new_page_scopes_json = _snapshot_scopes("wiki_page_scope", "page_id", page_id)
            if original_proposed and _reviewer_actually_changed(original_proposed, row):
                orig_proposed_scopes = json.dumps(original_proposed.get("proposed_scopes") or [])
                # Two versions: submitter's original then reviewer attribution
                db.execute_query("""
                    INSERT INTO wiki_page_version (page_id, title, description, content, wiki_category, scopes, scope_combine, edited_by, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                """, (page_id,
                      original_proposed.get("proposed_title"),
                      original_proposed.get("proposed_summary"),
                      original_proposed.get("proposed_content"),
                      original_proposed.get("proposed_wiki_category"),
                      orig_proposed_scopes,
                      original_proposed.get("proposed_scope_combine", "or"),
                      row["suggested_by"]))
                db.execute_query("""
                    INSERT INTO wiki_page_version (page_id, title, description, content, wiki_category, scopes, scope_combine, edited_by, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW() + INTERVAL '1 second')
                """, (page_id,
                      original_proposed.get("proposed_title"),
                      original_proposed.get("proposed_summary"),
                      original_proposed.get("proposed_content"),
                      original_proposed.get("proposed_wiki_category"),
                      orig_proposed_scopes,
                      original_proposed.get("proposed_scope_combine", "or"),
                      reviewer_user_id))
            else:
                db.execute_query("""
                    INSERT INTO wiki_page_version (page_id, title, description, content, wiki_category, scopes, scope_combine, edited_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (page_id, row["proposed_title"], row.get("proposed_summary"),
                      row.get("proposed_content"), row.get("proposed_wiki_category"),
                      new_page_scopes_json, scope_combine, row["suggested_by"]))

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
            page_scopes_json = _snapshot_scopes("wiki_page_scope", "page_id", page_id)
            if original_proposed and _reviewer_actually_changed(original_proposed, row):
                orig_proposed_scopes = json.dumps(original_proposed.get("proposed_scopes") or [])
                # Two versions: submitter's changes then reviewer's modifications
                # Version 1: pre-edit content, attributed to submitter
                db.execute_query("""
                    INSERT INTO wiki_page_version (page_id, title, description, content, wiki_category, scopes, scope_combine, edited_by, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                """, (page_id, page["title"], page.get("description"),
                      page.get("content"), page.get("wiki_category"),
                      page_scopes_json, page.get("scope_combine", "or"), row["suggested_by"]))
                # Version 2: submitter's original proposed content, attributed to reviewer
                db.execute_query("""
                    INSERT INTO wiki_page_version (page_id, title, description, content, wiki_category, scopes, scope_combine, edited_by, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW() + INTERVAL '1 second')
                """, (page_id,
                      original_proposed.get("proposed_title") or page["title"],
                      original_proposed.get("proposed_summary") if original_proposed.get("proposed_summary") is not None else page.get("description"),
                      original_proposed.get("proposed_content") if original_proposed.get("proposed_content") is not None else page.get("content"),
                      original_proposed.get("proposed_wiki_category") if original_proposed.get("proposed_wiki_category") is not None else page.get("wiki_category"),
                      orig_proposed_scopes,
                      original_proposed.get("proposed_scope_combine", "or"),
                      reviewer_user_id))
            else:
                # Single version: pre-edit content, attributed to submitter
                db.execute_query("""
                    INSERT INTO wiki_page_version (page_id, title, description, content, wiki_category, scopes, scope_combine, edited_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (page_id, page["title"], page.get("description"),
                      page.get("content"), page.get("wiki_category"),
                      page_scopes_json, page.get("scope_combine", "or"), row["suggested_by"]))

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


# ---------------------------------------------------------------------------
# Wiki image helpers
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
