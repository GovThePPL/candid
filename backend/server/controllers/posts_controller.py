"""Posts controller — CRUD, voting, and lock/unlock for posts."""

import re
import uuid
import base64
import json
from datetime import datetime, timezone, timedelta

import connexion

from candid.models.error_model import ErrorModel
from candid.controllers import db
from candid.controllers.helpers.auth import (
    require_auth, is_moderator_at_location, is_admin_at_location,
    is_facilitator_for, get_highest_role_at_location,
    check_session_stage, get_session_stage,
)
from candid.controllers.helpers.constants import STAGE_ORDER, STAGE_TO_PHASE
from candid.controllers.helpers.rate_limiting import check_rate_limit_for
from candid.controllers.helpers.serializers import build_creator_dict
from candid.controllers.helpers.scoring import wilson_score
from candid.controllers.helpers.config import Config
from candid.controllers.helpers.ideological_coords import (
    get_effective_coords, get_conversation_for_post,
)
from candid.controllers.helpers.scoring import vote_weight
from candid.controllers.helpers.mentions import process_mentions
from candid.controllers.helpers import nlp
from candid.controllers.helpers.proposal_context import gather_proposal_context

_SENTINEL = object()


def _strip_html(text):
    """Remove HTML tags from user text to prevent injection.

    Strips tags but preserves the text content. Uses the database's
    parameterized queries for SQL injection protection; this only
    handles HTML/XSS.
    """
    import re
    if not text:
        return text
    return re.sub(r'<[^>]+>', '', text).strip()


def _row_to_post(row, user_vote_row=None):
    """Convert a DB row to a Post response dict."""
    post = {
        "id": str(row["id"]),
        "title": row["title"],
        "body": row["body"],
        "postType": row["post_type"],
        "status": row["status"],
        "locationId": str(row["location_id"]),
        "sessionId": str(row["session_id"]) if row.get("session_id") else None,
        "upvoteCount": row.get("upvote_count", 0),
        "downvoteCount": row.get("downvote_count", 0),
        "weightedUpvotes": float(row.get("weighted_upvotes", 0)),
        "weightedDownvotes": float(row.get("weighted_downvotes", 0)),
        "score": float(row.get("score", 0)),
        "commentCount": row.get("comment_count", 0),
        "glossaryHighlight": row.get("glossary_highlight", True),
        "createdTime": row["created_time"].isoformat() if row.get("created_time") else None,
        "updatedTime": row["updated_time"].isoformat() if row.get("updated_time") else None,
    }

    # Creator
    creator = build_creator_dict(row)
    if creator:
        post["creator"] = creator

    # Session
    if row.get("session_label"):
        post["session"] = {
            "id": str(row["session_id"]),
            "label": row["session_label"],
        }
    else:
        post["session"] = None

    # Location
    if row.get("location_name"):
        post["location"] = {
            "id": str(row["location_id"]),
            "code": row.get("location_code"),
            "name": row["location_name"],
        }
    else:
        post["location"] = None

    # Creator role (highest approved role at post location, if badge visible)
    post["creatorRole"] = row.get("creator_role")
    post["showCreatorRole"] = row.get("show_creator_role")

    # Pinned comment
    post["pinnedCommentId"] = str(row["pinned_comment_id"]) if row.get("pinned_comment_id") else None

    # Bridging score from MF
    post["bridgingScore"] = float(row["mf_intercept"]) if row.get("mf_intercept") is not None else None

    # isAnswered (Q&A posts only — true if any authority user has replied)
    if row.get("post_type") == "question":
        post["isAnswered"] = bool(row.get("is_answered"))
    else:
        post["isAnswered"] = None

    # User vote
    if user_vote_row and user_vote_row.get("user_vote_type"):
        post["userVote"] = {
            "voteType": user_vote_row["user_vote_type"],
            "downvoteReason": user_vote_row.get("user_vote_reason"),
        }
    elif row.get("user_vote_type"):
        post["userVote"] = {
            "voteType": row["user_vote_type"],
            "downvoteReason": row.get("user_vote_reason"),
        }
    else:
        post["userVote"] = None

    # Stage tag
    post["createdDuringStage"] = row.get("created_during_stage")

    # Pinned post fields
    post["isPinned"] = bool(row.get("is_pinned"))
    post["pinnedStage"] = row.get("pinned_stage")

    # Proposal fields
    post["proposalStatus"] = row.get("proposal_status")
    if row.get("proposal_metadata"):
        import json as _json
        meta = row["proposal_metadata"]
        post["proposalMetadata"] = meta if isinstance(meta, dict) else _json.loads(meta)
    else:
        post["proposalMetadata"] = None

    return post


def _encode_cursor(sort_value, post_id):
    """Encode a cursor for keyset pagination."""
    payload = json.dumps({"v": str(sort_value), "id": str(post_id)})
    return base64.urlsafe_b64encode(payload.encode()).decode()


def _decode_cursor(cursor):
    """Decode a cursor. Returns (sort_value, post_id) or None."""
    try:
        payload = json.loads(base64.urlsafe_b64decode(cursor))
        return payload["v"], payload["id"]
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@require_auth("normal")
def create_post(body, token_info=None, user_id=None):  # noqa: E501
    """Create a new post."""

    # Rate limit
    allowed, count = check_rate_limit_for(user_id, "post_create")
    if not allowed:
        return ErrorModel(429, "Rate limit exceeded. Max 5 posts per hour."), 429

    data = connexion.request.get_json()

    title = _strip_html((data.get("title") or "").strip())
    body_text = _strip_html((data.get("body") or "").strip())
    location_id = data.get("locationId")
    session_id = data.get("sessionId")
    post_type = data.get("postType", "discussion")

    # Validate required fields
    if not title:
        return ErrorModel(400, "Title is required"), 400
    if not body_text:
        return ErrorModel(400, "Body is required"), 400
    if not location_id:
        return ErrorModel(400, "locationId is required"), 400
    if len(title) > 200:
        return ErrorModel(400, "Title must be 200 characters or less"), 400
    if len(body_text) > 10000:
        return ErrorModel(400, "Body must be 10000 characters or less"), 400
    if post_type not in ("discussion", "question", "proposal"):
        return ErrorModel(400, "postType must be 'discussion', 'question', or 'proposal'"), 400

    # Q&A posts require a session
    if post_type == "question" and not session_id:
        return ErrorModel(400, "Question posts require a sessionId"), 400

    # Proposal posts require a session
    if post_type == "proposal" and not session_id:
        return ErrorModel(400, "Proposal posts require a sessionId"), 400

    # Stage gating
    content_type = 'proposal_post' if post_type == 'proposal' else 'post'
    allowed_stage, stage_err = check_session_stage(session_id, content_type)
    if not allowed_stage:
        return stage_err, stage_err.code

    # Validate location exists
    loc = db.execute_query(
        "SELECT id FROM location WHERE id = %s AND deleted_at IS NULL",
        (location_id,), fetchone=True,
    )
    if not loc:
        return ErrorModel(400, "Location not found"), 400

    # Validate session if provided
    if session_id:
        sess = db.execute_query(
            "SELECT id FROM session WHERE id = %s",
            (session_id,), fetchone=True,
        )
        if not sess:
            return ErrorModel(400, "Session not found"), 400

    post_id = str(uuid.uuid4())
    # Q&A posts default to showing role badge; discussion posts default to hiding it
    show_creator_role = post_type == "question"
    glossary_highlight = body.get("glossary_highlight", True)
    current_stage = get_session_stage(session_id) if session_id else None

    # Proposal-specific fields
    proposal_status = 'draft' if post_type == 'proposal' else None
    proposal_metadata = data.get("proposalMetadata")
    proposal_metadata_json = json.dumps(proposal_metadata) if proposal_metadata else None

    db.execute_query("""
        INSERT INTO post (id, creator_user_id, location_id, session_id, post_type, title, body,
                          show_creator_role, glossary_highlight, created_during_stage,
                          proposal_status, proposal_metadata)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (post_id, user_id, location_id, session_id, post_type, title, body_text,
          show_creator_role, glossary_highlight, current_stage,
          proposal_status, proposal_metadata_json))

    # Fetch the created post with joins
    row = db.execute_query("""
        SELECT p.*,
               u.username AS creator_username, u.display_name AS creator_display_name,
               u.avatar_icon_url AS creator_avatar_icon_url, u.status AS creator_status,
               u.trust_score AS creator_trust_score,
               u.kudos_count AS creator_kudos_count,
               pc.label AS session_label,
               l.code AS location_code, l.name AS location_name
        FROM post p
        JOIN users u ON p.creator_user_id = u.id
        LEFT JOIN session pc ON p.session_id = pc.id
        LEFT JOIN location l ON p.location_id = l.id
        WHERE p.id = %s
    """, (post_id,), fetchone=True)

    # Process @mentions for notifications
    try:
        process_mentions(
            body_text, user_id, row["creator_display_name"],
            post_id, location_id, session_id, db)
    except Exception:
        pass  # Don't fail the post creation if mentions fail

    return _row_to_post(row), 201


def get_posts(location_id, session_id=None, post_type=None, sort=None,
              cursor=None, limit=None, answered=None, phase=None,
              proposal_status=None, token_info=None):  # noqa: E501
    """List posts for a location."""
    if not location_id:
        return ErrorModel(400, "locationId is required"), 400

    sort = sort or "hot"
    if sort not in ("hot", "new", "top", "controversial"):
        sort = "hot"

    limit = min(int(limit or 25), 50)
    user_id = token_info["sub"] if token_info else None

    # Build WHERE clauses
    conditions = ["p.location_id = %s", "p.status IN ('active', 'locked')"]
    params = [location_id]

    if session_id:
        conditions.append("p.session_id = %s")
        params.append(session_id)
    if post_type:
        conditions.append("p.post_type = %s")
        params.append(post_type)

    # Proposal status filter (draft/finalized)
    if proposal_status and proposal_status in ('draft', 'finalized'):
        conditions.append("p.proposal_status = %s")
        params.append(proposal_status)

    # Phase filtering: map phase to constituent stages
    if phase:
        phase_stages = [s for s, p in STAGE_TO_PHASE.items() if p == phase]
        if phase_stages:
            placeholders = ','.join(['%s'] * len(phase_stages))
            conditions.append(f"p.created_during_stage IN ({placeholders})")
            params.extend(phase_stages)

    # Answered filter (only meaningful for Q&A posts)
    if answered is not None:
        answered_subquery = """(SELECT 1 FROM comment c_ans
            JOIN user_role ur_ans ON ur_ans.user_id = c_ans.creator_user_id
                AND ur_ans.location_id = p.location_id
            WHERE c_ans.post_id = p.id AND c_ans.parent_comment_id IS NULL
                AND c_ans.status = 'active')"""
        if answered == 'true':
            conditions.append(f"EXISTS{answered_subquery}")
        elif answered == 'false':
            conditions.append(f"NOT EXISTS{answered_subquery}")

    where = " AND ".join(conditions)

    # Sort expressions
    sort_exprs = {
        "hot": f"""(CASE WHEN (p.weighted_upvotes - p.weighted_downvotes) > 0 THEN 1
                        WHEN (p.weighted_upvotes - p.weighted_downvotes) < 0 THEN -1
                        ELSE 0 END
                   * log(greatest(abs(p.weighted_upvotes - p.weighted_downvotes), 1) + 1))
                  / power(extract(epoch from now() - p.created_time)/3600 + 2, {Config.SCORING_HOT_GRAVITY})""",
        "new": "extract(epoch from p.created_time)",
        "top": "p.score",
        "controversial": """(LEAST(p.weighted_upvotes, p.weighted_downvotes)
                            / GREATEST(p.weighted_upvotes, p.weighted_downvotes, 0.001))
                           * (p.weighted_upvotes + p.weighted_downvotes)""",
    }

    sort_expr = sort_exprs[sort]

    # Cursor pagination
    if cursor:
        decoded = _decode_cursor(cursor)
        if decoded:
            cursor_val, cursor_id = decoded
            if sort == "new":
                conditions.append(
                    "(extract(epoch from p.created_time) < %s OR "
                    "(extract(epoch from p.created_time) = %s AND p.id < %s::uuid))"
                )
                params.extend([cursor_val, cursor_val, cursor_id])
            else:
                conditions.append(
                    f"(({sort_expr}) < %s OR "
                    f"(({sort_expr}) = %s AND p.id < %s::uuid))"
                )
                params.extend([float(cursor_val), float(cursor_val), cursor_id])
            where = " AND ".join(conditions)

    # User vote join
    vote_join = ""
    if user_id:
        vote_join = "LEFT JOIN post_vote pv ON pv.post_id = p.id AND pv.user_id = %s"
        # Insert user_id param at the right position (after FROM joins)
        vote_select = ", pv.vote_type AS user_vote_type, pv.downvote_reason AS user_vote_reason"
    else:
        vote_select = ", NULL AS user_vote_type, NULL AS user_vote_reason"

    # Subqueries for creator role and is_answered
    # Raw role lookup (without badge filters — filtering is done in Python for own/other distinction)
    creator_role_subquery = """(SELECT ur_cr.role FROM user_role ur_cr
        WHERE ur_cr.user_id = p.creator_user_id
          AND ur_cr.location_id = p.location_id
        ORDER BY CASE ur_cr.role
          WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 WHEN 'facilitator' THEN 3
          WHEN 'assistant_moderator' THEN 4 WHEN 'expert' THEN 5 WHEN 'liaison' THEN 6
        END LIMIT 1
    ) AS creator_role"""

    is_answered_subquery = """EXISTS(
        SELECT 1 FROM comment c2
        JOIN user_role ur2 ON ur2.user_id = c2.creator_user_id
          AND ur2.location_id = p.location_id
        WHERE c2.post_id = p.id AND c2.parent_comment_id IS NULL
          AND c2.status = 'active'
    ) AS is_answered"""

    sql = f"""
        SELECT p.*,
               u.username AS creator_username, u.display_name AS creator_display_name,
               u.avatar_icon_url AS creator_avatar_icon_url, u.status AS creator_status,
               u.trust_score AS creator_trust_score,
               u.show_role_badge AS creator_show_role_badge,
               u.kudos_count AS creator_kudos_count,
               pc.label AS session_label,
               l.code AS location_code, l.name AS location_name,
               ({sort_expr}) AS sort_value,
               {creator_role_subquery},
               {is_answered_subquery}
               {vote_select}
        FROM post p
        JOIN users u ON p.creator_user_id = u.id
        LEFT JOIN session pc ON p.session_id = pc.id
        LEFT JOIN location l ON p.location_id = l.id
        {vote_join}
        WHERE {where}
        ORDER BY sort_value DESC, p.id DESC
        LIMIT %s
    """

    # Build final params
    final_params = list(params)
    if user_id:
        # Insert user_id for the vote join after the base params
        # We need to restructure: base table params come first, then vote join param, then WHERE params
        # Actually, in this SQL structure, the joins come before WHERE, so we need vote param first
        # Let's restructure the query to use a subquery approach instead
        pass

    # Simpler approach: build params list in order SQL references them
    query_params = []
    # The sort_expr in SELECT is computed from p.* columns, no extra params
    # vote_join param
    if user_id:
        query_params.append(user_id)
    # WHERE params
    query_params.extend(params)
    # LIMIT
    query_params.append(limit + 1)

    rows = db.execute_query(sql, tuple(query_params))
    if rows is None:
        rows = []

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    posts = []
    for r in rows:
        r_dict = dict(r)
        is_own = user_id and str(r["creator_user_id"]) == user_id
        creator_role = r_dict.get("creator_role")
        show_creator_role = r_dict.get("show_creator_role", False)
        creator_show_role_badge = r_dict.get("creator_show_role_badge", True)

        if is_own:
            # Own posts: always return role + showCreatorRole so user can toggle
            r_dict["show_creator_role"] = show_creator_role
        elif creator_role and show_creator_role and creator_show_role_badge:
            # Others: show role only when both flags true
            r_dict["show_creator_role"] = None
        else:
            r_dict["creator_role"] = None
            r_dict["show_creator_role"] = None

        posts.append(_row_to_post(r_dict))

    next_cursor = None
    if has_more and rows:
        last = rows[-1]
        next_cursor = _encode_cursor(last["sort_value"], str(last["id"]))

    # Prepend pinned posts on first page (no cursor) when filtering by session+phase
    if not cursor and session_id and phase:
        phase_stages = [s for s, p in STAGE_TO_PHASE.items() if p == phase]
        if phase_stages:
            stage_placeholders = ','.join(['%s'] * len(phase_stages))
            pinned_sql = f"""
                SELECT p.*,
                       u.username AS creator_username, u.display_name AS creator_display_name,
                       u.avatar_icon_url AS creator_avatar_icon_url, u.status AS creator_status,
                       u.trust_score AS creator_trust_score,
                       u.show_role_badge AS creator_show_role_badge,
                       u.kudos_count AS creator_kudos_count,
                       pc.label AS session_label,
                       l.code AS location_code, l.name AS location_name,
                       pp.pinned_at, pp.stage AS pinned_stage, TRUE AS is_pinned,
                       NULL AS user_vote_type, NULL AS user_vote_reason,
                       (SELECT ur_cr.role FROM user_role ur_cr
                        WHERE ur_cr.user_id = p.creator_user_id
                          AND ur_cr.location_id = p.location_id
                        ORDER BY CASE ur_cr.role
                          WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 WHEN 'facilitator' THEN 3
                          WHEN 'assistant_moderator' THEN 4 WHEN 'expert' THEN 5 WHEN 'liaison' THEN 6
                        END LIMIT 1
                       ) AS creator_role,
                       EXISTS(
                         SELECT 1 FROM comment c2
                         JOIN user_role ur2 ON ur2.user_id = c2.creator_user_id
                           AND ur2.location_id = p.location_id
                         WHERE c2.post_id = p.id AND c2.parent_comment_id IS NULL
                           AND c2.status = 'active'
                       ) AS is_answered
                FROM pinned_post pp
                JOIN post p ON pp.post_id = p.id
                JOIN users u ON p.creator_user_id = u.id
                LEFT JOIN session pc ON p.session_id = pc.id
                LEFT JOIN location l ON p.location_id = l.id
                WHERE pp.session_id = %s AND pp.stage IN ({stage_placeholders})
                  AND p.status IN ('active', 'locked')
                ORDER BY pp.pinned_at DESC
            """
            pinned_params = [session_id] + phase_stages
            pinned_rows = db.execute_query(pinned_sql, tuple(pinned_params))

            if pinned_rows:
                pinned_ids = set()
                pinned_posts = []
                for r in pinned_rows:
                    r_dict = dict(r)
                    pinned_ids.add(str(r["id"]))

                    is_own = user_id and str(r["creator_user_id"]) == user_id
                    creator_role = r_dict.get("creator_role")
                    show_creator_role = r_dict.get("show_creator_role", False)
                    creator_show_role_badge = r_dict.get("creator_show_role_badge", True)
                    if is_own:
                        r_dict["show_creator_role"] = show_creator_role
                    elif creator_role and show_creator_role and creator_show_role_badge:
                        r_dict["show_creator_role"] = None
                    else:
                        r_dict["creator_role"] = None
                        r_dict["show_creator_role"] = None

                    pinned_posts.append(_row_to_post(r_dict))

                # Remove duplicates from main list
                posts = [p for p in posts if p["id"] not in pinned_ids]
                posts = pinned_posts + posts

    return {
        "posts": posts,
        "nextCursor": next_cursor,
        "hasMore": has_more,
    }, 200


def get_post(post_id, token_info=None):  # noqa: E501
    """Get a single post."""
    user_id = token_info["sub"] if token_info else None

    vote_join = ""
    vote_select = ", NULL AS user_vote_type, NULL AS user_vote_reason"
    params = [post_id]

    if user_id:
        vote_join = "LEFT JOIN post_vote pv ON pv.post_id = p.id AND pv.user_id = %s"
        vote_select = ", pv.vote_type AS user_vote_type, pv.downvote_reason AS user_vote_reason"
        params = [user_id, post_id]

    row = db.execute_query(f"""
        SELECT p.*,
               u.username AS creator_username, u.display_name AS creator_display_name,
               u.avatar_icon_url AS creator_avatar_icon_url, u.status AS creator_status,
               u.trust_score AS creator_trust_score,
               u.show_role_badge AS creator_show_role_badge,
               u.kudos_count AS creator_kudos_count,
               pc.label AS session_label,
               l.code AS location_code, l.name AS location_name,
               (SELECT ur_cr.role FROM user_role ur_cr
                WHERE ur_cr.user_id = p.creator_user_id
                  AND ur_cr.location_id = p.location_id
                ORDER BY CASE ur_cr.role
                  WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 WHEN 'facilitator' THEN 3
                  WHEN 'assistant_moderator' THEN 4 WHEN 'expert' THEN 5 WHEN 'liaison' THEN 6
                END LIMIT 1
               ) AS creator_role,
               EXISTS(
                 SELECT 1 FROM comment c2
                 JOIN user_role ur2 ON ur2.user_id = c2.creator_user_id
                   AND ur2.location_id = p.location_id
                 WHERE c2.post_id = p.id AND c2.parent_comment_id IS NULL
                   AND c2.status = 'active'
               ) AS is_answered
               {vote_select}
        FROM post p
        JOIN users u ON p.creator_user_id = u.id
        LEFT JOIN session pc ON p.session_id = pc.id
        LEFT JOIN location l ON p.location_id = l.id
        {vote_join}
        WHERE p.id = %s AND p.status != 'removed'
    """, tuple(params), fetchone=True)

    if not row:
        return ErrorModel(404, "Post not found"), 404

    # Also hide deleted posts from non-creators
    if row["status"] == "deleted":
        if not user_id or str(row["creator_user_id"]) != user_id:
            return ErrorModel(404, "Post not found"), 404

    # Role visibility filtering for own vs other
    row_dict = dict(row)
    is_own = user_id and str(row["creator_user_id"]) == user_id
    creator_role = row_dict.get("creator_role")
    show_creator_role = row_dict.get("show_creator_role", False)
    creator_show_role_badge = row_dict.get("creator_show_role_badge", True)

    if is_own:
        row_dict["show_creator_role"] = show_creator_role
    elif creator_role and show_creator_role and creator_show_role_badge:
        row_dict["show_creator_role"] = None
    else:
        row_dict["creator_role"] = None
        row_dict["show_creator_role"] = None

    return _row_to_post(row_dict), 200


@require_auth("normal")
def update_post(post_id, body, token_info=None, user_id=None):  # noqa: E501
    """Update a post (author only, within 15-minute window)."""

    post = db.execute_query(
        "SELECT * FROM post WHERE id = %s AND status NOT IN ('removed')",
        (post_id,), fetchone=True,
    )
    if not post:
        return ErrorModel(404, "Post not found"), 404

    if str(post["creator_user_id"]) != user_id:
        return ErrorModel(403, "Only the author can edit this post"), 403

    # Block edits on finalized proposals
    if post.get("proposal_status") == "finalized":
        return ErrorModel(403, "Cannot edit a finalized proposal"), 403

    # For proposals: only block by edit window during draft phase
    # For non-proposals: standard 15-minute edit window
    if post.get("post_type") != "proposal":
        created = post["created_time"]
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - created > timedelta(minutes=15):
            return ErrorModel(403, "Edit window expired (15 minutes)"), 403

    data = connexion.request.get_json()
    title = data.get("title")
    body_text = data.get("body")

    if title is not None:
        title = _strip_html(title.strip())
        if len(title) > 200:
            return ErrorModel(400, "Title must be 200 characters or less"), 400
    if body_text is not None:
        body_text = _strip_html(body_text.strip())
        if len(body_text) > 10000:
            return ErrorModel(400, "Body must be 10000 characters or less"), 400

    # Build UPDATE
    updates = []
    params = []
    if title is not None:
        updates.append("title = %s")
        params.append(title)
    if body_text is not None:
        updates.append("body = %s")
        params.append(body_text)

    if not updates:
        return ErrorModel(400, "No fields to update"), 400

    updates.append("updated_time = CURRENT_TIMESTAMP")
    params.append(post_id)

    db.execute_query(
        f"UPDATE post SET {', '.join(updates)} WHERE id = %s",
        tuple(params),
    )

    # Fetch updated post
    row = db.execute_query("""
        SELECT p.*,
               u.username AS creator_username, u.display_name AS creator_display_name,
               u.avatar_icon_url AS creator_avatar_icon_url, u.status AS creator_status,
               u.trust_score AS creator_trust_score,
               u.kudos_count AS creator_kudos_count,
               pc.label AS session_label,
               l.code AS location_code, l.name AS location_name,
               NULL AS user_vote_type, NULL AS user_vote_reason
        FROM post p
        JOIN users u ON p.creator_user_id = u.id
        LEFT JOIN session pc ON p.session_id = pc.id
        LEFT JOIN location l ON p.location_id = l.id
        WHERE p.id = %s
    """, (post_id,), fetchone=True)

    # Process @mentions for notifications on edit
    if body_text is not None:
        try:
            process_mentions(
                body_text, user_id, row["creator_display_name"],
                post_id, str(post["location_id"]),
                str(post["session_id"]) if post.get("session_id") else None,
                db)
        except Exception:
            pass

    return _row_to_post(row), 200


@require_auth("normal")
def delete_post(post_id, token_info=None, user_id=None):  # noqa: E501
    """Delete a post (author soft-delete or moderator remove)."""

    post = db.execute_query(
        "SELECT * FROM post WHERE id = %s AND status NOT IN ('removed', 'deleted')",
        (post_id,), fetchone=True,
    )
    if not post:
        return ErrorModel(404, "Post not found"), 404

    if str(post["creator_user_id"]) == user_id:
        db.execute_query(
            "UPDATE post SET status = 'deleted', deleted_by_user_id = %s WHERE id = %s",
            (user_id, post_id),
        )
        return '', 204
    elif is_moderator_at_location(user_id, str(post["location_id"])):
        db.execute_query(
            "UPDATE post SET status = 'removed', deleted_by_user_id = %s WHERE id = %s",
            (user_id, post_id),
        )
        return '', 204
    else:
        return ErrorModel(403, "Forbidden"), 403


@require_auth("normal")
def vote_on_post(post_id, body, token_info=None, user_id=None):  # noqa: E501
    """Vote on a post (upvote/downvote with toggle)."""

    # Rate limit
    allowed, count = check_rate_limit_for(user_id, "vote")
    if not allowed:
        return ErrorModel(429, "Rate limit exceeded. Max 100 votes per hour."), 429

    data = connexion.request.get_json()
    vote_type = data.get("voteType")
    downvote_reason = data.get("downvoteReason")

    if vote_type not in ("upvote", "downvote"):
        return ErrorModel(400, "voteType must be 'upvote' or 'downvote'"), 400

    if vote_type == "downvote" and not downvote_reason:
        return ErrorModel(400, "downvoteReason is required for downvotes"), 400

    # Validate post
    post = db.execute_query(
        "SELECT * FROM post WHERE id = %s AND status IN ('active', 'locked')",
        (post_id,), fetchone=True,
    )
    if not post:
        return ErrorModel(404, "Post not found"), 404

    # Stage gating
    post_session_id = str(post["session_id"]) if post.get("session_id") else None
    allowed_stage, stage_err = check_session_stage(post_session_id, 'post_vote')
    if not allowed_stage:
        return stage_err, stage_err.code

    # Self-vote check
    if str(post["creator_user_id"]) == user_id:
        return ErrorModel(400, "Cannot vote on your own post"), 400

    # Check existing vote
    existing = db.execute_query(
        "SELECT * FROM post_vote WHERE post_id = %s AND user_id = %s",
        (post_id, user_id), fetchone=True,
    )

    is_cross_group = False

    if existing and existing["vote_type"] == vote_type:
        # Toggle off — remove the vote
        db.execute_query(
            "DELETE FROM post_vote WHERE post_id = %s AND user_id = %s",
            (post_id, user_id),
        )
        user_vote = None
    else:
        # Compute vote weight
        weight = 1.0
        conversation_id = get_conversation_for_post(
            str(post["location_id"]),
            str(post["session_id"]) if post.get("session_id") else None,
        )
        if conversation_id:
            try:
                voter_coords = get_effective_coords(user_id, conversation_id)
                author_coords = get_effective_coords(str(post["creator_user_id"]), conversation_id)
                from candid.controllers.helpers.ideological_coords import get_pca_cache
                pca = get_pca_cache(conversation_id)
                max_distance = pca.get("max_distance") if pca else None
                weight = vote_weight(voter_coords, author_coords, max_distance)

                # Cross-group detection
                is_cross_group = (
                    voter_coords is not None
                    and author_coords is not None
                    and voter_coords.get("polis_group_id") is not None
                    and author_coords.get("polis_group_id") is not None
                    and voter_coords["polis_group_id"] != author_coords["polis_group_id"]
                )
            except Exception:
                weight = 1.0

        # Upsert vote
        db.execute_query("""
            INSERT INTO post_vote (id, post_id, user_id, vote_type, weight, downvote_reason)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (post_id, user_id) DO UPDATE SET
                vote_type = EXCLUDED.vote_type,
                weight = EXCLUDED.weight,
                downvote_reason = EXCLUDED.downvote_reason
        """, (str(uuid.uuid4()), post_id, user_id, vote_type, weight, downvote_reason))

        user_vote = {"voteType": vote_type, "downvoteReason": downvote_reason}

    # Recalc denormalized counts
    counts = db.execute_query("""
        SELECT
            COUNT(*) FILTER (WHERE vote_type = 'upvote') AS up_count,
            COUNT(*) FILTER (WHERE vote_type = 'downvote') AS down_count,
            COALESCE(SUM(weight) FILTER (WHERE vote_type = 'upvote'), 0) AS weighted_up,
            COALESCE(SUM(weight) FILTER (WHERE vote_type = 'downvote'), 0) AS weighted_down
        FROM post_vote WHERE post_id = %s
    """, (post_id,), fetchone=True)

    up_count = counts["up_count"] or 0
    down_count = counts["down_count"] or 0
    weighted_up = float(counts["weighted_up"] or 0)
    weighted_down = float(counts["weighted_down"] or 0)
    new_score = wilson_score(weighted_up, weighted_down)

    db.execute_query("""
        UPDATE post SET
            upvote_count = %s, downvote_count = %s,
            weighted_upvotes = %s, weighted_downvotes = %s,
            score = %s
        WHERE id = %s
    """, (up_count, down_count, weighted_up, weighted_down, new_score, post_id))

    return {
        "userVote": user_vote,
        "upvoteCount": up_count,
        "downvoteCount": down_count,
        "score": new_score,
        "isCrossGroup": is_cross_group,
    }, 200


@require_auth("normal")
def patch_post(post_id, body, token_info=None, user_id=None):  # noqa: E501
    """Patch a post — toggle role badge visibility or lock/unlock."""

    post = db.execute_query(
        "SELECT * FROM post WHERE id = %s AND status NOT IN ('removed', 'deleted')",
        (post_id,), fetchone=True,
    )
    if not post:
        return ErrorModel(404, "Post not found"), 404

    data = connexion.request.get_json()
    show_creator_role = data.get("showCreatorRole")
    locked = data.get("locked")
    pinned_comment_id = data.get("pinnedCommentId", _SENTINEL)
    pinned = data.get("pinned")
    pin_session_id = data.get("pinSessionId")
    pin_stage = data.get("pinStage")
    proposal_status = data.get("proposalStatus")

    if (show_creator_role is None and locked is None
            and pinned_comment_id is _SENTINEL and pinned is None
            and proposal_status is None):
        return ErrorModel(400, "No patchable fields provided"), 400

    creator_role = None

    # Handle showCreatorRole (author only)
    if show_creator_role is not None:
        if str(post["creator_user_id"]) != user_id:
            return ErrorModel(403, "Only the author can toggle role badge"), 403

        post_location_id = str(post["location_id"])
        post_session_id = str(post["session_id"]) if post.get("session_id") else None
        creator_role = get_highest_role_at_location(user_id, post_location_id, post_session_id)
        if not creator_role:
            return ErrorModel(403, "No role at this location"), 403

        db.execute_query(
            "UPDATE post SET show_creator_role = %s WHERE id = %s",
            (show_creator_role, post_id),
        )

    # Handle locked (post author, moderator, or facilitator)
    if locked is not None:
        is_author = str(post["creator_user_id"]) == user_id
        loc_id = str(post["location_id"])
        sess_id = str(post["session_id"]) if post.get("session_id") else None
        if not is_author and not is_moderator_at_location(user_id, loc_id) and not is_facilitator_for(user_id, loc_id, sess_id):
            return ErrorModel(403, "Only the author or moderators can lock posts"), 403

        new_status = "locked" if locked else "active"
        db.execute_query(
            "UPDATE post SET status = %s WHERE id = %s",
            (new_status, post_id),
        )

    # Handle pinnedCommentId (post author, moderator, or facilitator)
    if pinned_comment_id is not _SENTINEL:
        is_pin_author = str(post["creator_user_id"]) == user_id
        pin_loc_id = str(post["location_id"])
        pin_sess_id = str(post["session_id"]) if post.get("session_id") else None
        is_pin_mod = is_moderator_at_location(user_id, pin_loc_id)
        is_pin_fac = is_facilitator_for(user_id, pin_loc_id, pin_sess_id)
        if not is_pin_author and not is_pin_mod and not is_pin_fac:
            return ErrorModel(403, "Only post author or moderators can pin comments"), 403

        if pinned_comment_id:
            # Verify comment belongs to this post, is active, and is a root comment
            comment = db.execute_query(
                "SELECT id FROM comment WHERE id = %s AND post_id = %s AND status = 'active' AND depth = 0",
                (pinned_comment_id, post_id), fetchone=True,
            )
            if not comment:
                return ErrorModel(404, "Comment not found"), 404

        db.execute_query(
            "UPDATE post SET pinned_comment_id = %s WHERE id = %s",
            (pinned_comment_id, post_id),
        )

    # Handle pinned (facilitator, moderator, or admin)
    if pinned is not None:
        pin_loc_id = str(post["location_id"])
        pin_sess_id = str(post["session_id"]) if post.get("session_id") else None
        if (not is_facilitator_for(user_id, pin_loc_id, pin_sess_id)
                and not is_moderator_at_location(user_id, pin_loc_id)
                and not is_admin_at_location(user_id, pin_loc_id)):
            return ErrorModel(403, "Only facilitators, moderators, or admins can pin posts"), 403

        if pinned:
            if not pin_session_id or not pin_stage:
                return ErrorModel(400, "pinSessionId and pinStage are required to pin a post"), 400
            if pin_stage not in STAGE_ORDER:
                return ErrorModel(400, f"Invalid pinStage: {pin_stage}"), 400
            # Verify post belongs to the given session
            if str(post.get("session_id")) != pin_session_id:
                return ErrorModel(400, "Post does not belong to the specified session"), 400
            # Check max 3 pins per session+stage
            count = db.execute_query(
                "SELECT COUNT(*) AS cnt FROM pinned_post WHERE session_id = %s AND stage = %s",
                (pin_session_id, pin_stage), fetchone=True,
            )
            if count and count["cnt"] >= 3:
                return ErrorModel(409, "Maximum of 3 posts can be pinned per stage"), 409
            # Insert pin (ignore conflict if already pinned)
            db.execute_query("""
                INSERT INTO pinned_post (post_id, session_id, stage, pinned_by)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (session_id, stage, post_id) DO NOTHING
            """, (post_id, pin_session_id, pin_stage, user_id))
        else:
            # Unpin — remove matching pin(s)
            if pin_session_id and pin_stage:
                db.execute_query(
                    "DELETE FROM pinned_post WHERE post_id = %s AND session_id = %s AND stage = %s",
                    (post_id, pin_session_id, pin_stage),
                )
            else:
                # Unpin from all stages in the post's session
                db.execute_query(
                    "DELETE FROM pinned_post WHERE post_id = %s AND session_id = %s",
                    (post_id, str(post["session_id"])),
                )

    # Handle proposalStatus (author only, draft → finalized)
    if proposal_status is not None:
        if proposal_status != "finalized":
            return ErrorModel(400, "proposalStatus can only be set to 'finalized'"), 400
        if post["post_type"] != "proposal":
            return ErrorModel(400, "Only proposals have a proposalStatus"), 400
        if post.get("proposal_status") != "draft":
            return ErrorModel(400, "Only draft proposals can be finalized"), 400
        if str(post["creator_user_id"]) != user_id:
            return ErrorModel(403, "Only the author can finalize a proposal"), 403

        # Voting round must be in finalization_open
        fin_session_id = str(post["session_id"]) if post.get("session_id") else None
        if fin_session_id:
            vr = db.execute_query("""
                SELECT status FROM voting_round
                WHERE session_id = %s
                ORDER BY created_time DESC LIMIT 1
            """, (fin_session_id,), fetchone=True)
            if not vr or vr["status"] != "finalization_open":
                return ErrorModel(400, "Proposals can only be finalized during the finalization period"), 400

        db.execute_query(
            "UPDATE post SET proposal_status = 'finalized', updated_time = CURRENT_TIMESTAMP WHERE id = %s",
            (post_id,),
        )

    # Fetch updated post
    row = db.execute_query("""
        SELECT p.*,
               u.username AS creator_username, u.display_name AS creator_display_name,
               u.avatar_icon_url AS creator_avatar_icon_url, u.status AS creator_status,
               u.trust_score AS creator_trust_score,
               u.kudos_count AS creator_kudos_count,
               pc.label AS session_label,
               l.code AS location_code, l.name AS location_name,
               NULL AS user_vote_type, NULL AS user_vote_reason
        FROM post p
        JOIN users u ON p.creator_user_id = u.id
        LEFT JOIN session pc ON p.session_id = pc.id
        LEFT JOIN location l ON p.location_id = l.id
        WHERE p.id = %s
    """, (post_id,), fetchone=True)

    row_dict = dict(row)
    if creator_role:
        row_dict["creator_role"] = creator_role
    if show_creator_role is not None:
        row_dict["show_creator_role"] = show_creator_role
    return _row_to_post(row_dict), 200


# ---------------------------------------------------------------------------
# Proposal-specific endpoints
# ---------------------------------------------------------------------------

@require_auth("normal")
def proposal_assist(body, token_info=None, user_id=None):  # noqa: E501
    """Request AI enhancement for a proposal wizard step."""

    # Rate limit: 20 per hour
    allowed, count = check_rate_limit_for(user_id, "proposal_assist")
    if not allowed:
        return ErrorModel(429, "Rate limit exceeded. Max 20 AI assists per hour."), 429

    data = connexion.request.get_json()
    session_id = data.get("sessionId")
    step = data.get("step")
    user_input = data.get("userInput", "").strip()

    if not session_id:
        return ErrorModel(400, "sessionId is required"), 400
    if not step:
        return ErrorModel(400, "step is required"), 400
    if not user_input:
        return ErrorModel(400, "userInput is required"), 400

    # Get session to determine proposal type from stage
    session = db.execute_query(
        "SELECT stage FROM session WHERE id = %s",
        (session_id,), fetchone=True,
    )
    if not session:
        return ErrorModel(404, "Session not found"), 404

    stage = session["stage"]
    if stage in ('proposal_issue', 'proposal_qualify', 'proposal_stakeholders'):
        template = "issue"
    elif stage == 'opinion_proposals':
        template = "policy"
    else:
        return ErrorModel(400, f"Proposal assist is not available during '{stage}' stage"), 400

    # Gather context
    context = gather_proposal_context(session_id)

    # Get previous sections if provided
    previous_sections = data.get("previousSections")

    try:
        result = nlp.proposal_assist(
            template=template,
            step=step,
            user_input=user_input,
            context=context,
            previous_sections=previous_sections,
        )
        return {"generatedContent": result.get("content", "")}, 200
    except nlp.NLPServiceError as e:
        return ErrorModel(503, str(e)), 503


