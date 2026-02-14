"""Comments controller — CRUD and voting for nested comments."""

import base64
import logging
import re
import uuid
from datetime import datetime, timezone, timedelta

import connexion

from candid.models.error_model import ErrorModel
from candid.controllers import db
from candid.controllers.helpers.auth import (
    authorization, token_to_user, is_moderator_at_location,
    has_qa_authority, get_highest_role_at_location,
)
from candid.controllers.helpers.rate_limiting import check_rate_limit_for
from candid.controllers.helpers.scoring import wilson_score, vote_weight
from candid.controllers.helpers.ideological_coords import (
    get_effective_coords, get_conversation_for_post,
)
from candid.controllers.helpers.push_notifications import send_comment_reply_notification


def _strip_html(text):
    """Remove HTML tags from text."""
    return re.sub(r'<[^<]+?>', '', text) if text else text


def _row_to_comment(row, post_type=None, post_location_id=None, post_category_id=None):
    """Convert a DB row to a Comment response dict."""
    comment = {
        "id": str(row["id"]),
        "postId": str(row["post_id"]),
        "parentCommentId": str(row["parent_comment_id"]) if row.get("parent_comment_id") else None,
        "body": row["body"],
        "path": row["path"],
        "depth": row["depth"],
        "status": row["status"],
        "upvoteCount": row.get("upvote_count", 0),
        "downvoteCount": row.get("downvote_count", 0),
        "weightedUpvotes": float(row.get("weighted_upvotes", 0)),
        "weightedDownvotes": float(row.get("weighted_downvotes", 0)),
        "score": float(row.get("score", 0)),
        "bridgingScore": float(row["mf_intercept"]) if row.get("mf_intercept") is not None else None,
        "childCount": row.get("child_count", 0),
        "createdTime": row["created_time"].isoformat() if row.get("created_time") else None,
        "updatedTime": row["updated_time"].isoformat() if row.get("updated_time") else None,
    }

    # Creator
    if row.get("creator_display_name") is not None:
        comment["creator"] = {
            "id": str(row["creator_user_id"]),
            "username": row.get("creator_username"),
            "displayName": row.get("creator_display_name"),
            "avatarIconUrl": row.get("creator_avatar_icon_url"),
            "status": row.get("creator_status"),
            "trustScore": float(row["creator_trust_score"]) if row.get("creator_trust_score") is not None else None,
            "kudosCount": row.get("creator_kudos_count", 0),
        }
    elif row.get("creator_user_id"):
        comment["creator"] = {"id": str(row["creator_user_id"])}

    # Creator role (for Q&A badge)
    comment["creatorRole"] = row.get("creator_role")
    comment["showCreatorRole"] = row.get("show_creator_role")

    # User vote
    if row.get("user_vote_type"):
        comment["userVote"] = {
            "voteType": row["user_vote_type"],
            "downvoteReason": row.get("user_vote_reason"),
        }
    else:
        comment["userVote"] = None

    return comment


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def get_comments(post_id, cursor=None, limit=None, token_info=None):  # noqa: E501
    """Get comments for a post (path-ordered tree, paginated by root comments)."""
    user_id = token_info["sub"] if token_info else None

    # Clamp limit
    if limit is None:
        limit = 20
    limit = max(1, min(limit, 100))

    # Decode cursor (base64-encoded path of last root comment)
    cursor_path = None
    if cursor:
        try:
            cursor_path = base64.urlsafe_b64decode(cursor).decode("utf-8")
        except Exception:
            return ErrorModel(400, "Invalid cursor"), 400

    # Verify post exists
    post = db.execute_query(
        "SELECT * FROM post WHERE id = %s AND status != 'removed'",
        (post_id,), fetchone=True,
    )
    if not post:
        return ErrorModel(404, "Post not found"), 404

    # Count total root comments
    total_root = db.execute_query(
        "SELECT COUNT(*) AS cnt FROM comment WHERE post_id = %s AND parent_comment_id IS NULL AND status != 'removed'",
        (post_id,), fetchone=True,
    )
    total_root_count = total_root["cnt"] if total_root else 0

    # Fetch N+1 root IDs for has_more detection
    root_params = [post_id]
    cursor_condition = ""
    if cursor_path:
        cursor_condition = "AND path > %s"
        root_params.append(cursor_path)
    root_params.append(limit + 1)

    root_rows = db.execute_query(f"""
        SELECT id, path FROM comment
        WHERE post_id = %s AND parent_comment_id IS NULL AND status != 'removed'
        {cursor_condition}
        ORDER BY path
        LIMIT %s
    """, tuple(root_params))

    if root_rows is None:
        root_rows = []

    has_more = len(root_rows) > limit
    if has_more:
        root_rows = root_rows[:limit]

    if not root_rows:
        return {
            "comments": [],
            "nextCursor": None,
            "hasMore": False,
            "totalRootCount": total_root_count,
        }, 200

    root_ids = [str(r["id"]) for r in root_rows]
    last_root_path = root_rows[-1]["path"]
    next_cursor = base64.urlsafe_b64encode(last_root_path.encode("utf-8")).decode("ascii") if has_more else None

    # Build query for roots + all descendants
    vote_join = ""
    vote_select = ", NULL AS user_vote_type, NULL AS user_vote_reason"

    # Build LIKE patterns for descendant matching
    like_patterns = [r["path"] + "/%" for r in root_rows]

    # Construct the IN clause and LIKE ANY clause
    root_placeholders = ",".join(["%s"] * len(root_ids))
    like_placeholders = ",".join(["%s"] * len(like_patterns))

    if user_id:
        vote_join = "LEFT JOIN comment_vote cv ON cv.comment_id = c.id AND cv.user_id = %s"
        vote_select = ", cv.vote_type AS user_vote_type, cv.downvote_reason AS user_vote_reason"
        query_params = [user_id, post_id] + root_ids + like_patterns
    else:
        query_params = [post_id] + root_ids + like_patterns

    rows = db.execute_query(f"""
        SELECT c.*,
               u.username AS creator_username, u.display_name AS creator_display_name,
               u.avatar_icon_url AS creator_avatar_icon_url, u.status AS creator_status,
               u.trust_score AS creator_trust_score,
               u.show_role_badge AS creator_show_role_badge,
               COALESCE((SELECT COUNT(*) FROM kudos k WHERE k.receiver_user_id = u.id AND k.status = 'sent'), 0) AS creator_kudos_count
               {vote_select}
        FROM comment c
        JOIN users u ON c.creator_user_id = u.id
        {vote_join}
        WHERE c.post_id = %s AND (
            c.id IN ({root_placeholders})
            OR c.path LIKE ANY(ARRAY[{like_placeholders}])
        )
        ORDER BY c.path
    """, tuple(query_params))

    if rows is None:
        rows = []

    is_qa = post["post_type"] == "question"
    post_location_id = str(post["location_id"])
    post_category_id = str(post["category_id"]) if post.get("category_id") else None

    # Post-process: handle deleted/removed, add role badges
    result = []
    for row in rows:
        # Deleted/removed leaves are omitted entirely
        if row["status"] in ("deleted", "removed") and row.get("child_count", 0) == 0:
            continue

        # Deleted/removed with children get placeholder body
        if row["status"] == "deleted":
            row = dict(row)
            row["body"] = "[deleted]"
        elif row["status"] == "removed":
            row = dict(row)
            row["body"] = "[removed]"

        row_dict = dict(row) if not isinstance(row, dict) else row

        # Role badge visibility: check both user-level and item-level flags
        creator_role = get_highest_role_at_location(
            str(row["creator_user_id"]), post_location_id, post_category_id
        )
        show_creator_role = row_dict.get("show_creator_role", False)
        creator_show_role_badge = row_dict.get("creator_show_role_badge", True)
        is_own = user_id and str(row["creator_user_id"]) == user_id

        if is_own:
            # Own comments: always return role + showCreatorRole so user can toggle
            row_dict["creator_role"] = creator_role
            row_dict["show_creator_role"] = show_creator_role
        elif creator_role and show_creator_role and creator_show_role_badge:
            # Others: only show role when both flags are true
            row_dict["creator_role"] = creator_role
            row_dict["show_creator_role"] = None
        else:
            row_dict["creator_role"] = None
            row_dict["show_creator_role"] = None

        result.append(_row_to_comment(row_dict))

    return {
        "comments": result,
        "nextCursor": next_cursor,
        "hasMore": has_more,
        "totalRootCount": total_root_count,
    }, 200


def create_comment(post_id, body, token_info=None):  # noqa: E501
    """Create a comment on a post."""
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)
    user_id = str(user.id)

    # Rate limit
    allowed, count = check_rate_limit_for(user_id, "comment_create")
    if not allowed:
        return ErrorModel(429, "Rate limit exceeded. Max 30 comments per hour."), 429

    # Fetch post
    post = db.execute_query(
        "SELECT * FROM post WHERE id = %s",
        (post_id,), fetchone=True,
    )
    if not post:
        return ErrorModel(404, "Post not found"), 404
    if post["status"] in ("removed", "deleted"):
        return ErrorModel(404, "Post not found"), 404
    if post["status"] == "locked":
        return ErrorModel(403, "Post is locked"), 403

    data = connexion.request.get_json()
    body_text = _strip_html((data.get("body") or "").strip())
    parent_comment_id = data.get("parentCommentId")

    if not body_text:
        return ErrorModel(400, "Body is required"), 400
    if len(body_text) > 2000:
        return ErrorModel(400, "Body must be 2000 characters or less"), 400

    post_location_id = str(post["location_id"])
    post_category_id = str(post["category_id"]) if post.get("category_id") else None

    # Q&A authorization
    if post["post_type"] == "question":
        if not parent_comment_id:
            # Top-level answer: requires QA authority
            if not has_qa_authority(user_id, post_location_id, post_category_id):
                return ErrorModel(403, "Only authorized users can answer questions"), 403
        else:
            # Reply: user with QA authority can reply to anyone
            if not has_qa_authority(user_id, post_location_id, post_category_id):
                # Normal user: can only reply to authorized users
                parent = db.execute_query(
                    "SELECT * FROM comment WHERE id = %s",
                    (parent_comment_id,), fetchone=True,
                )
                if not parent:
                    return ErrorModel(400, "Parent comment not found"), 400
                if not has_qa_authority(str(parent["creator_user_id"]), post_location_id, post_category_id):
                    return ErrorModel(403, "Can only reply to authorized answers"), 403

    # Compute path and depth
    comment_id = str(uuid.uuid4())
    if parent_comment_id:
        parent = db.execute_query(
            "SELECT * FROM comment WHERE id = %s AND post_id = %s",
            (parent_comment_id, post_id), fetchone=True,
        )
        if not parent:
            return ErrorModel(400, "Parent comment not found"), 400
        path = parent["path"] + "/" + comment_id
        depth = parent["depth"] + 1
    else:
        path = comment_id
        depth = 0

    # Q&A posts default to showing role badge; discussion posts default to hiding it
    show_creator_role = post["post_type"] == "question"

    # Insert comment
    db.execute_query("""
        INSERT INTO comment (id, post_id, parent_comment_id, creator_user_id, body, path, depth, show_creator_role)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """, (comment_id, post_id, parent_comment_id, user_id, body_text, path, depth, show_creator_role))

    # post.comment_count and comment.child_count are maintained by trg_comment_counts trigger

    # Send reply notification to parent comment author
    if parent_comment_id:
        parent_row = db.execute_query(
            "SELECT creator_user_id FROM comment WHERE id = %s",
            (parent_comment_id,), fetchone=True)
        if parent_row and str(parent_row["creator_user_id"]) != user_id:
            try:
                user_row = db.execute_query(
                    "SELECT display_name FROM users WHERE id = %s",
                    (user_id,), fetchone=True)
                send_comment_reply_notification(
                    str(parent_row["creator_user_id"]),
                    user_row["display_name"] if user_row else "Someone",
                    body_text, post_id, db)
            except Exception as e:
                logging.getLogger(__name__).error("Reply notification error: %s", e)

    # Fetch created comment
    row = db.execute_query("""
        SELECT c.*,
               u.username AS creator_username, u.display_name AS creator_display_name,
               u.avatar_icon_url AS creator_avatar_icon_url, u.status AS creator_status,
               u.trust_score AS creator_trust_score,
               COALESCE((SELECT COUNT(*) FROM kudos k WHERE k.receiver_user_id = u.id AND k.status = 'sent'), 0) AS creator_kudos_count,
               u.trust_score AS creator_trust_score,
               COALESCE((SELECT COUNT(*) FROM kudos k WHERE k.receiver_user_id = u.id AND k.status = 'sent'), 0) AS creator_kudos_count,
               NULL AS user_vote_type, NULL AS user_vote_reason
        FROM comment c
        JOIN users u ON c.creator_user_id = u.id
        WHERE c.id = %s
    """, (comment_id,), fetchone=True)

    # Add creator role — always compute for all post types
    creator_role = get_highest_role_at_location(user_id, post_location_id, post_category_id)
    row_dict = dict(row)
    row_dict["creator_role"] = creator_role
    row_dict["show_creator_role"] = show_creator_role

    return _row_to_comment(row_dict), 201


def update_comment(comment_id, body, token_info=None):  # noqa: E501
    """Update a comment (author only, within 15-minute window)."""
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)
    user_id = str(user.id)

    comment = db.execute_query(
        "SELECT * FROM comment WHERE id = %s AND status = 'active'",
        (comment_id,), fetchone=True,
    )
    if not comment:
        return ErrorModel(404, "Comment not found"), 404

    if str(comment["creator_user_id"]) != user_id:
        return ErrorModel(403, "Only the author can edit this comment"), 403

    # 15-minute edit window
    created = comment["created_time"]
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - created > timedelta(minutes=15):
        return ErrorModel(403, "Edit window expired (15 minutes)"), 403

    data = connexion.request.get_json()
    body_text = _strip_html((data.get("body") or "").strip())

    if not body_text:
        return ErrorModel(400, "Body is required"), 400
    if len(body_text) > 2000:
        return ErrorModel(400, "Body must be 2000 characters or less"), 400

    db.execute_query(
        "UPDATE comment SET body = %s, updated_time = CURRENT_TIMESTAMP WHERE id = %s",
        (body_text, comment_id),
    )

    # Fetch updated
    row = db.execute_query("""
        SELECT c.*,
               u.username AS creator_username, u.display_name AS creator_display_name,
               u.avatar_icon_url AS creator_avatar_icon_url, u.status AS creator_status,
               u.trust_score AS creator_trust_score,
               COALESCE((SELECT COUNT(*) FROM kudos k WHERE k.receiver_user_id = u.id AND k.status = 'sent'), 0) AS creator_kudos_count,
               u.trust_score AS creator_trust_score,
               COALESCE((SELECT COUNT(*) FROM kudos k WHERE k.receiver_user_id = u.id AND k.status = 'sent'), 0) AS creator_kudos_count,
               NULL AS user_vote_type, NULL AS user_vote_reason
        FROM comment c
        JOIN users u ON c.creator_user_id = u.id
        WHERE c.id = %s
    """, (comment_id,), fetchone=True)

    # Look up post for location context
    post = db.execute_query(
        "SELECT location_id, category_id FROM post WHERE id = %s",
        (comment["post_id"],), fetchone=True,
    )
    post_location_id = str(post["location_id"]) if post else None
    post_category_id = str(post["category_id"]) if post and post.get("category_id") else None

    row_dict = dict(row)
    row_dict["creator_role"] = get_highest_role_at_location(user_id, post_location_id, post_category_id) if post_location_id else None
    row_dict["show_creator_role"] = row_dict.get("show_creator_role", False)
    return _row_to_comment(row_dict), 200


def delete_comment(comment_id, token_info=None):  # noqa: E501
    """Delete a comment (author soft-delete or moderator remove)."""
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)
    user_id = str(user.id)

    comment = db.execute_query(
        "SELECT c.*, p.location_id AS post_location_id FROM comment c JOIN post p ON c.post_id = p.id WHERE c.id = %s AND c.status = 'active'",
        (comment_id,), fetchone=True,
    )
    if not comment:
        return ErrorModel(404, "Comment not found"), 404

    if str(comment["creator_user_id"]) == user_id:
        db.execute_query(
            "UPDATE comment SET status = 'deleted', deleted_by_user_id = %s WHERE id = %s",
            (user_id, comment_id),
        )
        return '', 204
    elif is_moderator_at_location(user_id, str(comment["post_location_id"])):
        db.execute_query(
            "UPDATE comment SET status = 'removed', deleted_by_user_id = %s WHERE id = %s",
            (user_id, comment_id),
        )
        return '', 204
    else:
        return ErrorModel(403, "Forbidden"), 403


def vote_on_comment(comment_id, body, token_info=None):  # noqa: E501
    """Vote on a comment (upvote/downvote with toggle)."""
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)
    user_id = str(user.id)

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

    # Validate comment + fetch post context
    comment = db.execute_query("""
        SELECT c.*, p.location_id AS post_location_id, p.category_id AS post_category_id
        FROM comment c
        JOIN post p ON c.post_id = p.id
        WHERE c.id = %s AND c.status = 'active'
    """, (comment_id,), fetchone=True)

    if not comment:
        return ErrorModel(404, "Comment not found"), 404

    # Self-vote check
    if str(comment["creator_user_id"]) == user_id:
        return ErrorModel(400, "Cannot vote on your own comment"), 400

    # Check existing vote
    existing = db.execute_query(
        "SELECT * FROM comment_vote WHERE comment_id = %s AND user_id = %s",
        (comment_id, user_id), fetchone=True,
    )

    if existing and existing["vote_type"] == vote_type:
        # Toggle off
        db.execute_query(
            "DELETE FROM comment_vote WHERE comment_id = %s AND user_id = %s",
            (comment_id, user_id),
        )
        user_vote = None
    else:
        # Compute weight
        weight = 1.0
        post_location_id = str(comment["post_location_id"])
        post_category_id = str(comment["post_category_id"]) if comment.get("post_category_id") else None
        conversation_id = get_conversation_for_post(post_location_id, post_category_id)
        if conversation_id:
            try:
                voter_coords = get_effective_coords(user_id, conversation_id)
                author_coords = get_effective_coords(str(comment["creator_user_id"]), conversation_id)
                from candid.controllers.helpers.ideological_coords import get_pca_cache
                pca = get_pca_cache(conversation_id)
                max_distance = pca.get("max_distance") if pca else None
                weight = vote_weight(voter_coords, author_coords, max_distance)
            except Exception:
                weight = 1.0

        db.execute_query("""
            INSERT INTO comment_vote (id, comment_id, user_id, vote_type, weight, downvote_reason)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (comment_id, user_id) DO UPDATE SET
                vote_type = EXCLUDED.vote_type,
                weight = EXCLUDED.weight,
                downvote_reason = EXCLUDED.downvote_reason
        """, (str(uuid.uuid4()), comment_id, user_id, vote_type, weight, downvote_reason))

        user_vote = {"voteType": vote_type, "downvoteReason": downvote_reason}

    # Recalc denormalized counts
    counts = db.execute_query("""
        SELECT
            COUNT(*) FILTER (WHERE vote_type = 'upvote') AS up_count,
            COUNT(*) FILTER (WHERE vote_type = 'downvote') AS down_count,
            COALESCE(SUM(weight) FILTER (WHERE vote_type = 'upvote'), 0) AS weighted_up,
            COALESCE(SUM(weight) FILTER (WHERE vote_type = 'downvote'), 0) AS weighted_down
        FROM comment_vote WHERE comment_id = %s
    """, (comment_id,), fetchone=True)

    up_count = counts["up_count"] or 0
    down_count = counts["down_count"] or 0
    weighted_up = float(counts["weighted_up"] or 0)
    weighted_down = float(counts["weighted_down"] or 0)
    new_score = wilson_score(weighted_up, weighted_down)

    db.execute_query("""
        UPDATE comment SET
            upvote_count = %s, downvote_count = %s,
            weighted_upvotes = %s, weighted_downvotes = %s,
            score = %s
        WHERE id = %s
    """, (up_count, down_count, weighted_up, weighted_down, new_score, comment_id))

    return {
        "userVote": user_vote,
        "upvoteCount": up_count,
        "downvoteCount": down_count,
        "score": new_score,
    }, 200


def patch_comment(comment_id, body, token_info=None):  # noqa: E501
    """Patch a comment — toggle role badge visibility (author only)."""
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)
    user_id = str(user.id)

    # Fetch comment with post context
    comment = db.execute_query("""
        SELECT c.*, p.location_id AS post_location_id, p.category_id AS post_category_id
        FROM comment c
        JOIN post p ON c.post_id = p.id
        WHERE c.id = %s AND c.status = 'active'
    """, (comment_id,), fetchone=True)

    if not comment:
        return ErrorModel(404, "Comment not found"), 404

    if str(comment["creator_user_id"]) != user_id:
        return ErrorModel(403, "Only the author can toggle role visibility"), 403

    # Verify user has a role at this location
    post_location_id = str(comment["post_location_id"])
    post_category_id = str(comment["post_category_id"]) if comment.get("post_category_id") else None
    creator_role = get_highest_role_at_location(user_id, post_location_id, post_category_id)
    if not creator_role:
        return ErrorModel(403, "No role at this location"), 403

    data = connexion.request.get_json()
    show_creator_role = data.get("showCreatorRole")
    if show_creator_role is None:
        return ErrorModel(400, "showCreatorRole is required"), 400

    db.execute_query(
        "UPDATE comment SET show_creator_role = %s WHERE id = %s",
        (show_creator_role, comment_id),
    )

    # Fetch updated comment
    row = db.execute_query("""
        SELECT c.*,
               u.username AS creator_username, u.display_name AS creator_display_name,
               u.avatar_icon_url AS creator_avatar_icon_url, u.status AS creator_status,
               u.trust_score AS creator_trust_score,
               COALESCE((SELECT COUNT(*) FROM kudos k WHERE k.receiver_user_id = u.id AND k.status = 'sent'), 0) AS creator_kudos_count,
               NULL AS user_vote_type, NULL AS user_vote_reason
        FROM comment c
        JOIN users u ON c.creator_user_id = u.id
        WHERE c.id = %s
    """, (comment_id,), fetchone=True)

    row_dict = dict(row)
    row_dict["creator_role"] = creator_role
    row_dict["show_creator_role"] = show_creator_role
    return _row_to_comment(row_dict), 200
