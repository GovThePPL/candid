import connexion
from typing import Dict, List, Tuple, Union

from candid.models.error_model import ErrorModel
from candid import util

from candid.controllers import db
from candid.controllers.helpers.config import Config
from candid.controllers.helpers.auth import authorization, token_to_user

from camel_converter import dict_to_camel
import uuid


def get_chatting_list(token_info=None):
    """Get user's chatting list positions

    Returns positions the user has swiped up on and wants to continue chatting about

    :param token_info: JWT token info from authentication
    :type token_info: dict

    :rtype: Union[List[ChattingListItem], Tuple[List[ChattingListItem], int], Tuple[List[ChattingListItem], int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    items = db.execute_query("""
        SELECT
            ucl.id,
            ucl.position_id,
            ucl.is_active,
            TO_CHAR(ucl.added_time, %s) as added_time,
            TO_CHAR(ucl.last_chat_time, %s) as last_chat_time,
            ucl.chat_count,
            -- Position data
            p.statement,
            p.category_id,
            p.creator_user_id,
            p.agree_count,
            p.disagree_count,
            p.pass_count,
            p.chat_count as position_chat_count,
            p.status as position_status,
            TO_CHAR(p.created_time, %s) as position_created_time,
            -- Creator data
            u.display_name as creator_display_name,
            u.username as creator_username,
            u.status as creator_status,
            u.trust_score as creator_trust_score,
            COALESCE((
                SELECT COUNT(*) FROM kudos k
                WHERE k.receiver_user_id = u.id AND k.status = 'sent'
            ), 0) as creator_kudos_count,
            -- Category
            pc.label as category_name,
            -- Location
            l.code as location_code,
            l.name as location_name,
            -- Pending request count (requests from this user on this position)
            (
                SELECT COUNT(*)
                FROM chat_request cr
                JOIN user_position up ON cr.user_position_id = up.id
                WHERE up.position_id = ucl.position_id
                  AND cr.initiator_user_id = %s
                  AND cr.response = 'pending'
            ) as pending_request_count
        FROM user_chatting_list ucl
        JOIN position p ON ucl.position_id = p.id
        JOIN users u ON p.creator_user_id = u.id
        LEFT JOIN position_category pc ON p.category_id = pc.id
        LEFT JOIN location l ON p.location_id = l.id
        WHERE ucl.user_id = %s
          AND p.status = 'active'
        ORDER BY ucl.added_time DESC
    """, (Config.TIMESTAMP_FORMAT, Config.TIMESTAMP_FORMAT, Config.TIMESTAMP_FORMAT, str(user.id), str(user.id)))

    result = []
    for item in (items or []):
        creator = {
            "id": str(item["creator_user_id"]),
            "displayName": item["creator_display_name"],
            "username": item["creator_username"],
            "status": item["creator_status"],
            "kudosCount": item["creator_kudos_count"],
            "trustScore": float(item["creator_trust_score"]) if item.get("creator_trust_score") else None
        }

        category = None
        if item.get("category_name"):
            category = {
                "id": str(item["category_id"]) if item.get("category_id") else None,
                "name": item["category_name"]
            }

        location = None
        if item.get("location_code"):
            location = {
                "code": item["location_code"],
                "name": item.get("location_name")
            }

        position = {
            "id": str(item["position_id"]),
            "creator": creator,
            "statement": item["statement"],
            "categoryId": str(item["category_id"]) if item.get("category_id") else None,
            "category": category,
            "location": location,
            "createdTime": item["position_created_time"],
            "agreeCount": item["agree_count"],
            "disagreeCount": item["disagree_count"],
            "passCount": item["pass_count"],
            "chatCount": item["position_chat_count"],
            "status": item["position_status"],
        }

        result.append({
            "id": str(item["id"]),
            "positionId": str(item["position_id"]),
            "position": position,
            "isActive": item["is_active"],
            "addedTime": item["added_time"],
            "lastChatTime": item["last_chat_time"],
            "chatCount": item["chat_count"],
            "pendingRequestCount": item["pending_request_count"],
        })

    return result, 200


def add_to_chatting_list(body, token_info=None):
    """Add a position to the chatting list

    :param body: Request body containing positionId
    :type body: dict | bytes
    :param token_info: JWT token info from authentication
    :type token_info: dict

    :rtype: Union[ChattingListItem, Tuple[ChattingListItem, int], Tuple[ChattingListItem, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    position_id = body.get("positionId")
    if not position_id:
        return ErrorModel(code=400, message="positionId is required"), 400

    # Verify the position exists and is active
    position = db.execute_query("""
        SELECT id, creator_user_id FROM position WHERE id = %s AND status = 'active'
    """, (position_id,), fetchone=True)

    if not position:
        return ErrorModel(code=404, message="Position not found"), 404

    # Can't add your own position to chatting list
    if str(position["creator_user_id"]) == str(user.id):
        return ErrorModel(code=400, message="Cannot add your own position to chatting list"), 400

    # Check if already exists
    existing = db.execute_query("""
        SELECT id, is_active FROM user_chatting_list
        WHERE user_id = %s AND position_id = %s
    """, (str(user.id), position_id), fetchone=True)

    if existing:
        # If it exists but is inactive, reactivate it
        if not existing["is_active"]:
            db.execute_query("""
                UPDATE user_chatting_list
                SET is_active = true, added_time = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (str(existing["id"]),))
            # Fetch and return the updated item
            return _get_chatting_list_item(str(existing["id"]), str(user.id))
        else:
            return ErrorModel(code=409, message="Position already in chatting list"), 409

    # Create new chatting list item
    item_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO user_chatting_list (id, user_id, position_id, is_active)
        VALUES (%s, %s, %s, true)
    """, (item_id, str(user.id), position_id))

    return _get_chatting_list_item(item_id, str(user.id)), 201


def update_chatting_list_item(id_, body, token_info=None):
    """Update a chatting list item (toggle active status)

    :param id: Chatting list item ID
    :type id: str
    :param body: Request body containing isActive
    :type body: dict | bytes
    :param token_info: JWT token info from authentication
    :type token_info: dict

    :rtype: Union[ChattingListItem, Tuple[ChattingListItem, int], Tuple[ChattingListItem, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    # Verify ownership
    item = db.execute_query("""
        SELECT id, user_id FROM user_chatting_list WHERE id = %s
    """, (id_,), fetchone=True)

    if not item:
        return ErrorModel(code=404, message="Chatting list item not found"), 404

    if str(item["user_id"]) != str(user.id):
        return ErrorModel(code=403, message="Not authorized to modify this item"), 403

    # Update is_active if provided
    is_active = body.get("isActive")
    if is_active is not None:
        db.execute_query("""
            UPDATE user_chatting_list
            SET is_active = %s
            WHERE id = %s
        """, (is_active, id_))

    return _get_chatting_list_item(id_, str(user.id)), 200


def remove_from_chatting_list(id_, token_info=None):
    """Remove a position from the chatting list

    :param id: Chatting list item ID
    :type id: str
    :param token_info: JWT token info from authentication
    :type token_info: dict

    :rtype: Union[None, Tuple[None, int], Tuple[None, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    # Verify ownership
    item = db.execute_query("""
        SELECT id, user_id FROM user_chatting_list WHERE id = %s
    """, (id_,), fetchone=True)

    if not item:
        return ErrorModel(code=404, message="Chatting list item not found"), 404

    if str(item["user_id"]) != str(user.id):
        return ErrorModel(code=403, message="Not authorized to delete this item"), 403

    db.execute_query("""
        DELETE FROM user_chatting_list WHERE id = %s
    """, (id_,))

    return None, 204


def mark_chatting_list_explanation_seen(token_info=None):
    """Mark the chatting list explanation as seen

    :param token_info: JWT token info from authentication
    :type token_info: dict

    :rtype: Union[None, Tuple[None, int], Tuple[None, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    db.execute_query("""
        UPDATE users
        SET seen_chatting_list_explanation = true
        WHERE id = %s
    """, (str(user.id),))

    return None, 204


def bulk_remove_from_chatting_list(body, token_info=None):
    """Remove multiple positions from chatting list

    Bulk remove by category, location, or specific item IDs.

    :param body: Request body with filters
    :type body: dict | bytes
    :param token_info: JWT token info from authentication
    :type token_info: dict

    :rtype: Union[dict, Tuple[dict, int], Tuple[dict, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    category_id = body.get("categoryId")
    location_code = body.get("locationCode")
    item_ids = body.get("itemIds")

    # At least one filter must be provided
    if not category_id and not location_code and not item_ids:
        return ErrorModel(code=400, message="At least one of categoryId, locationCode, or itemIds is required"), 400

    # Build the DELETE query dynamically based on filters
    conditions = ["ucl.user_id = %s"]
    params = [str(user.id)]

    if item_ids:
        # Direct item IDs - no need for joins
        placeholders = ', '.join(['%s'] * len(item_ids))
        conditions.append(f"ucl.id IN ({placeholders})")
        params.extend(item_ids)

    if category_id:
        conditions.append("p.category_id = %s")
        params.append(category_id)

    if location_code:
        conditions.append("l.code = %s")
        params.append(location_code)

    # Build the query - join position and location tables for filtering
    where_clause = " AND ".join(conditions)

    # Count first for response
    count_query = f"""
        SELECT COUNT(*) as count
        FROM user_chatting_list ucl
        JOIN position p ON ucl.position_id = p.id
        LEFT JOIN location l ON p.location_id = l.id
        WHERE {where_clause}
    """
    count_result = db.execute_query(count_query, tuple(params), fetchone=True)
    removed_count = count_result["count"] if count_result else 0

    # Now delete
    delete_query = f"""
        DELETE FROM user_chatting_list
        WHERE id IN (
            SELECT ucl.id
            FROM user_chatting_list ucl
            JOIN position p ON ucl.position_id = p.id
            LEFT JOIN location l ON p.location_id = l.id
            WHERE {where_clause}
        )
    """
    db.execute_query(delete_query, tuple(params))

    return {"removedCount": removed_count}, 200


def _get_chatting_list_item(item_id: str, user_id: str) -> dict:
    """Helper to fetch a single chatting list item with full position data."""
    item = db.execute_query("""
        SELECT
            ucl.id,
            ucl.position_id,
            ucl.is_active,
            TO_CHAR(ucl.added_time, %s) as added_time,
            TO_CHAR(ucl.last_chat_time, %s) as last_chat_time,
            ucl.chat_count,
            -- Position data
            p.statement,
            p.category_id,
            p.creator_user_id,
            p.agree_count,
            p.disagree_count,
            p.pass_count,
            p.chat_count as position_chat_count,
            p.status as position_status,
            TO_CHAR(p.created_time, %s) as position_created_time,
            -- Creator data
            u.display_name as creator_display_name,
            u.username as creator_username,
            u.status as creator_status,
            u.trust_score as creator_trust_score,
            COALESCE((
                SELECT COUNT(*) FROM kudos k
                WHERE k.receiver_user_id = u.id AND k.status = 'sent'
            ), 0) as creator_kudos_count,
            -- Category
            pc.label as category_name,
            -- Location
            l.code as location_code,
            l.name as location_name,
            -- Pending request count
            (
                SELECT COUNT(*)
                FROM chat_request cr
                JOIN user_position up ON cr.user_position_id = up.id
                WHERE up.position_id = ucl.position_id
                  AND cr.initiator_user_id = %s
                  AND cr.response = 'pending'
            ) as pending_request_count
        FROM user_chatting_list ucl
        JOIN position p ON ucl.position_id = p.id
        JOIN users u ON p.creator_user_id = u.id
        LEFT JOIN position_category pc ON p.category_id = pc.id
        LEFT JOIN location l ON p.location_id = l.id
        WHERE ucl.id = %s
    """, (Config.TIMESTAMP_FORMAT, Config.TIMESTAMP_FORMAT, Config.TIMESTAMP_FORMAT, user_id, item_id), fetchone=True)

    if not item:
        return None

    creator = {
        "id": str(item["creator_user_id"]),
        "displayName": item["creator_display_name"],
        "username": item["creator_username"],
        "status": item["creator_status"],
        "kudosCount": item["creator_kudos_count"],
        "trustScore": float(item["creator_trust_score"]) if item.get("creator_trust_score") else None
    }

    category = None
    if item.get("category_name"):
        category = {
            "id": str(item["category_id"]) if item.get("category_id") else None,
            "name": item["category_name"]
        }

    location = None
    if item.get("location_code"):
        location = {
            "code": item["location_code"],
            "name": item.get("location_name")
        }

    position = {
        "id": str(item["position_id"]),
        "creator": creator,
        "statement": item["statement"],
        "categoryId": str(item["category_id"]) if item.get("category_id") else None,
        "category": category,
        "location": location,
        "createdTime": item["position_created_time"],
        "agreeCount": item["agree_count"],
        "disagreeCount": item["disagree_count"],
        "passCount": item["pass_count"],
        "chatCount": item["position_chat_count"],
        "status": item["position_status"],
    }

    return {
        "id": str(item["id"]),
        "positionId": str(item["position_id"]),
        "position": position,
        "isActive": item["is_active"],
        "addedTime": item["added_time"],
        "lastChatTime": item["last_chat_time"],
        "chatCount": item["chat_count"],
        "pendingRequestCount": item["pending_request_count"],
    }
