"""Comments controller — CRUD and voting for nested comments."""

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
from candid.controllers.helpers.rate_limiting import check_rate_limit
from candid.controllers.helpers.scoring import wilson_score, vote_weight
from candid.controllers.helpers.ideological_coords import (
    get_effective_coords, get_conversation_for_post,
)


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
        }
    elif row.get("creator_user_id"):
        comment["creator"] = {"id": str(row["creator_user_id"])}

    # Creator role (for Q&A badge)
    comment["creatorRole"] = row.get("creator_role")

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

def get_comments(post_id, token_info=None):  # noqa: E501
    """Get comments for a post (path-ordered tree)."""
    user_id = token_info["sub"] if token_info else None

    # Verify post exists
    post = db.execute_query(
        "SELECT * FROM post WHERE id = %s AND status != 'removed'",
        (post_id,), fetchone=True,
    )
    if not post:
        return ErrorModel(404, "Post not found"), 404

    vote_join = ""
    vote_select = ", NULL AS user_vote_type, NULL AS user_vote_reason"
    params = [post_id]

    if user_id:
        vote_join = "LEFT JOIN comment_vote cv ON cv.comment_id = c.id AND cv.user_id = %s"
        vote_select = ", cv.vote_type AS user_vote_type, cv.downvote_reason AS user_vote_reason"
        params = [user_id, post_id]

    rows = db.execute_query(f"""
        SELECT c.*,
               u.username AS creator_username, u.display_name AS creator_display_name,
               u.avatar_icon_url AS creator_avatar_icon_url, u.status AS creator_status
               {vote_select}
        FROM comment c
        JOIN users u ON c.creator_user_id = u.id
        {vote_join}
        WHERE c.post_id = %s
        ORDER BY c.path
    """, tuple(params))

    if rows is None:
        rows = []

    is_qa = post["post_type"] == "question"
    post_location_id = str(post["location_id"])
    post_category_id = str(post["category_id"]) if post.get("category_id") else None

    # Post-process: handle deleted/removed, add role badges for Q&A
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

        # Q&A role badge
        creator_role = None
        if is_qa:
            creator_role = get_highest_role_at_location(
                str(row["creator_user_id"]), post_location_id, post_category_id
            )
        row_dict = dict(row) if not isinstance(row, dict) else row
        row_dict["creator_role"] = creator_role

        result.append(_row_to_comment(row_dict))

    return result, 200


def create_comment(post_id, body, token_info=None):  # noqa: E501
    """Create a comment on a post."""
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)
    user_id = str(user.id)

    # Rate limit
    allowed, count = check_rate_limit(user_id, "comment_create", 30, 3600)
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

    # Insert comment
    db.execute_query("""
        INSERT INTO comment (id, post_id, parent_comment_id, creator_user_id, body, path, depth)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (comment_id, post_id, parent_comment_id, user_id, body_text, path, depth))

    # Update post comment count
    db.execute_query(
        "UPDATE post SET comment_count = comment_count + 1 WHERE id = %s",
        (post_id,),
    )

    # Update parent child count
    if parent_comment_id:
        db.execute_query(
            "UPDATE comment SET child_count = child_count + 1 WHERE id = %s",
            (parent_comment_id,),
        )

    # Fetch created comment
    row = db.execute_query("""
        SELECT c.*,
               u.username AS creator_username, u.display_name AS creator_display_name,
               u.avatar_icon_url AS creator_avatar_icon_url, u.status AS creator_status,
               NULL AS user_vote_type, NULL AS user_vote_reason
        FROM comment c
        JOIN users u ON c.creator_user_id = u.id
        WHERE c.id = %s
    """, (comment_id,), fetchone=True)

    # Add creator role for Q&A
    creator_role = None
    if post["post_type"] == "question":
        creator_role = get_highest_role_at_location(user_id, post_location_id, post_category_id)
    row_dict = dict(row)
    row_dict["creator_role"] = creator_role

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
               NULL AS user_vote_type, NULL AS user_vote_reason
        FROM comment c
        JOIN users u ON c.creator_user_id = u.id
        WHERE c.id = %s
    """, (comment_id,), fetchone=True)

    row_dict = dict(row)
    row_dict["creator_role"] = None
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
    allowed, count = check_rate_limit(user_id, "vote", 100, 3600)
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
