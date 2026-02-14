import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from candid.models.chat_request import ChatRequest
from candid.models.error_model import ErrorModel
from candid.models.get_chat_log_response import GetChatLogResponse
from candid.models.get_user_chats200_response_inner import GetUserChats200ResponseInner
from candid.models.kudos import Kudos
from candid import util

from candid.controllers import db
from candid.controllers.helpers.config import Config
from candid.controllers.helpers.auth import authorization, authorization_allow_banned, token_to_user, is_moderator_anywhere
from candid.controllers.helpers.chat_events import publish_chat_accepted, publish_chat_request_response, publish_chat_request_received
from candid.controllers.cards_controller import _get_pending_chat_requests
from candid.controllers.helpers.card_builders import chat_request_to_card as _chat_request_to_card
from candid.controllers.helpers import presence
from candid.controllers.helpers.push_notifications import send_chat_request_notification
from candid.controllers.helpers.chat_availability import _is_notifiable
from candid.controllers.helpers.cache_headers import (
    add_cache_headers,
    check_not_modified,
    make_304_response,
    generate_etag,
)

from candid.controllers.helpers.rate_limiting import check_rate_limit_for
from flask import jsonify, make_response
import uuid


def create_chat_request(body, token_info=None):
    """Request to chat about a position statement

    Creates a chat request for a specific user_position. The recipient
    is the owner of that user_position.

    :param body: Chat request data containing userPositionId
    :type body: dict | bytes
    :param token_info: JWT token info from authentication
    :type token_info: dict

    :rtype: Union[ChatRequest, Tuple[ChatRequest, int], Tuple[ChatRequest, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    # Rate limit
    allowed, _ = check_rate_limit_for(str(user.id), "chat_request")
    if not allowed:
        return ErrorModel(code=429, message="Rate limit exceeded"), 429

    if connexion.request.is_json:
        body = connexion.request.get_json()

    user_position_id = body.get("userPositionId")
    if not user_position_id:
        return ErrorModel(code=400, message="userPositionId is required"), 400

    # Verify the user_position exists and get the owner
    result = db.execute_query("""
        SELECT up.id, up.user_id, up.position_id, p.statement
        FROM user_position up
        JOIN position p ON up.position_id = p.id
        WHERE up.id = %s AND up.status = 'active'
    """, (user_position_id,), fetchone=True)

    if not result:
        return ErrorModel(code=404, message="User position not found"), 404

    recipient_user_id = str(result["user_id"])
    position_id = str(result["position_id"])

    # Safety check: reject if recipient has chat requests turned off
    recipient_settings = db.execute_query("""
        SELECT chat_request_likelihood FROM users WHERE id = %s
    """, (recipient_user_id,), fetchone=True)
    if recipient_settings and recipient_settings.get("chat_request_likelihood") == 0:
        return ErrorModel(code=403, message="This user is not accepting chat requests"), 403

    # Can't request to chat with yourself
    if recipient_user_id == str(user.id):
        return ErrorModel(code=400, message="Cannot request to chat with yourself"), 400

    # Check for existing pending request
    existing = db.execute_query("""
        SELECT id FROM chat_request
        WHERE initiator_user_id = %s
        AND user_position_id = %s
        AND response = 'pending'
    """, (str(user.id), user_position_id), fetchone=True)

    if existing:
        return ErrorModel(code=409, message="A pending chat request already exists"), 409

    # Record presence: user is swiping (creating a chat request)
    presence.record_swiping(str(user.id))

    # Determine delivery context based on recipient's presence
    if presence.is_user_swiping(recipient_user_id):
        delivery_context = 'swiping'
    elif presence.is_user_in_app(recipient_user_id):
        delivery_context = 'in_app'
    else:
        delivery_context = 'notification'

    # Create the chat request with delivery context
    request_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO chat_request (id, initiator_user_id, user_position_id, response, delivery_context)
        VALUES (%s, %s, %s, 'pending', %s)
    """, (request_id, str(user.id), user_position_id, delivery_context))

    # Send push notification if recipient is offline
    if delivery_context == 'notification':
        recipient_info = db.execute_query("""
            SELECT push_token, notifications_enabled, notification_frequency,
                   notifications_sent_today, notifications_sent_date,
                   quiet_hours_start, quiet_hours_end, timezone
            FROM users WHERE id = %s
        """, (recipient_user_id,), fetchone=True)

        if recipient_info and _is_notifiable(recipient_info):
            initiator_info = db.execute_query("""
                SELECT display_name FROM users WHERE id = %s
            """, (str(user.id),), fetchone=True)
            initiator_name = initiator_info["display_name"] if initiator_info else "Someone"

            send_chat_request_notification(
                push_token=recipient_info["push_token"],
                initiator_display_name=initiator_name,
                position_statement=result["statement"],
                db=db,
                recipient_user_id=recipient_user_id,
            )

    # For swiping/in_app contexts, publish real-time event to recipient
    if delivery_context in ('swiping', 'in_app'):
        # Query full chat request data and build card for socket delivery
        chat_req_rows = _get_pending_chat_requests(
            recipient_user_id, limit=10
        )
        # Find the one we just created
        for row in chat_req_rows:
            if str(row['id']) == request_id:
                card_data = _chat_request_to_card(row)
                # Include createdTime for expiration tracking on the client
                card_data['data']['createdTime'] = row.get('created_time')
                publish_chat_request_received(
                    recipient_user_id=recipient_user_id,
                    card_data=card_data,
                )
                break

    # Add position to initiator's chatting list (or update if already exists)
    _add_to_chatting_list(str(user.id), position_id)

    # Return the created request
    created = db.execute_query("""
        SELECT
            cr.id,
            cr.initiator_user_id,
            cr.user_position_id,
            cr.response,
            cr.response_time,
            cr.created_time,
            cr.updated_time
        FROM chat_request cr
        WHERE cr.id = %s
    """, (request_id,), fetchone=True)

    return {
        "id": str(created["id"]),
        "initiatorUserId": str(created["initiator_user_id"]),
        "userPositionId": str(created["user_position_id"]),
        "response": created["response"],
        "responseTime": created["response_time"].isoformat() if created["response_time"] else None,
        "createdTime": created["created_time"].isoformat() if created["created_time"] else None,
        "updatedTime": created["updated_time"].isoformat() if created["updated_time"] else None,
    }, 201


def respond_to_chat_request(request_id, body, token_info=None):
    """Respond to a chat request

    Accept or dismiss a chat request. If accepted, creates a chat_log
    and notifies the chat server to set up the real-time chat.

    :param request_id: Chat request ID
    :type request_id: str
    :param body: Response data containing response ('accepted' or 'dismissed')
    :type body: dict | bytes
    :param token_info: JWT token info from authentication
    :type token_info: dict

    :rtype: Union[ChatRequest, Tuple[ChatRequest, int], Tuple[ChatRequest, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    response_value = body.get("response")
    if response_value not in ("accepted", "dismissed"):
        return ErrorModel(code=400, message="response must be 'accepted' or 'dismissed'"), 400

    # Get the chat request and verify the user is the recipient
    result = db.execute_query("""
        SELECT
            cr.id,
            cr.initiator_user_id,
            cr.user_position_id,
            cr.response,
            up.user_id as recipient_user_id,
            p.statement as position_statement
        FROM chat_request cr
        JOIN user_position up ON cr.user_position_id = up.id
        JOIN position p ON up.position_id = p.id
        WHERE cr.id = %s
    """, (request_id,), fetchone=True)

    if not result:
        return ErrorModel(code=404, message="Chat request not found"), 404

    # Verify the current user is the recipient (owner of the position)
    if str(result["recipient_user_id"]) != str(user.id):
        return ErrorModel(code=403, message="Not authorized to respond to this request"), 403

    # Verify the request is still pending
    if result["response"] != "pending":
        return ErrorModel(code=400, message="Chat request is no longer pending"), 400

    initiator_user_id = str(result["initiator_user_id"])
    responder_user_id = str(user.id)
    position_statement = result["position_statement"]

    # Update the chat request
    db.execute_query("""
        UPDATE chat_request
        SET response = %s,
            response_time = CURRENT_TIMESTAMP,
            updated_time = CURRENT_TIMESTAMP
        WHERE id = %s
    """, (response_value, request_id))

    chat_log_id = None

    # If accepted, create chat_log and notify chat server
    if response_value == "accepted":
        chat_log_id = str(uuid.uuid4())

        db.execute_query("""
            INSERT INTO chat_log (id, chat_request_id, start_time, status, log)
            VALUES (%s, %s, CURRENT_TIMESTAMP, 'active', '{}')
        """, (chat_log_id, request_id))

        # Publish event to chat server via Redis
        publish_chat_accepted(
            chat_log_id=chat_log_id,
            chat_request_id=request_id,
            initiator_user_id=initiator_user_id,
            responder_user_id=responder_user_id,
            position_statement=position_statement,
        )

    # Notify the initiator about the response (accepted or dismissed)
    publish_chat_request_response(
        request_id=request_id,
        response=response_value,
        initiator_user_id=initiator_user_id,
        chat_log_id=chat_log_id,
    )

    # Update context-specific response rates for the responder
    _update_response_rates(str(user.id))

    # Return the updated request
    updated = db.execute_query("""
        SELECT
            cr.id,
            cr.initiator_user_id,
            cr.user_position_id,
            cr.response,
            cr.response_time,
            cr.created_time,
            cr.updated_time
        FROM chat_request cr
        WHERE cr.id = %s
    """, (request_id,), fetchone=True)

    response_data = {
        "id": str(updated["id"]),
        "initiatorUserId": str(updated["initiator_user_id"]),
        "userPositionId": str(updated["user_position_id"]),
        "response": updated["response"],
        "responseTime": updated["response_time"].isoformat() if updated["response_time"] else None,
        "createdTime": updated["created_time"].isoformat() if updated["created_time"] else None,
        "updatedTime": updated["updated_time"].isoformat() if updated["updated_time"] else None,
    }

    # Include chat_log_id if created
    if chat_log_id:
        response_data["chatLogId"] = chat_log_id

    return response_data, 200


def rescind_chat_request(request_id, token_info=None):
    """Rescind a chat request

    Cancel a pending chat request. Only the initiator can rescind.

    :param request_id: Chat request ID
    :type request_id: str
    :param token_info: JWT token info from authentication
    :type token_info: dict

    :rtype: Union[ChatRequest, Tuple[ChatRequest, int], Tuple[ChatRequest, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    # Get the chat request and verify the user is the initiator
    result = db.execute_query("""
        SELECT id, initiator_user_id, response
        FROM chat_request
        WHERE id = %s
    """, (request_id,), fetchone=True)

    if not result:
        return ErrorModel(code=404, message="Chat request not found"), 404

    # Verify the current user is the initiator
    if str(result["initiator_user_id"]) != str(user.id):
        return ErrorModel(code=403, message="Only the initiator can rescind a request"), 403

    # Verify the request is still pending
    if result["response"] != "pending":
        return ErrorModel(code=400, message="Can only rescind pending requests"), 400

    # Delete the request
    db.execute_query("""
        DELETE FROM chat_request WHERE id = %s
    """, (request_id,))

    return '', 204


def get_chat_log(chat_id, token_info=None):
    """Get JSON blob of a chat log

    Retrieves a complete JSON blob of a chat log. Only participants
    can view the log.

    :param chat_id: Chat log ID
    :type chat_id: str
    :param token_info: JWT token info from authentication
    :type token_info: dict

    :rtype: Union[GetChatLogResponse, Tuple[GetChatLogResponse, int], Tuple[GetChatLogResponse, int, Dict[str, str]]
    """
    authorized, auth_err = authorization_allow_banned("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    # Get chat log and verify user is a participant
    result = db.execute_query("""
        SELECT
            cl.id,
            cl.chat_request_id,
            cl.start_time,
            cl.end_time,
            cl.log,
            cl.end_type,
            cl.status,
            cr.initiator_user_id,
            up.user_id as responder_user_id,
            -- Position info
            p.id as position_id,
            p.statement as position_statement,
            -- Category info
            cat.id as category_id,
            cat.label as category_name,
            -- Location info
            loc.id as location_id,
            loc.code as location_code,
            loc.name as location_name,
            -- Position creator info (the user who adopted/created this position)
            pos_holder.username as position_holder_username,
            pos_holder.display_name as position_holder_display_name,
            pos_holder.trust_score as position_holder_trust_score,
            pos_holder.avatar_url as position_holder_avatar_url,
            pos_holder.avatar_icon_url as position_holder_avatar_icon_url,
            COALESCE(pos_holder_kudos.kudos_count, 0) as position_holder_kudos_count,
            -- Initiator user info
            init_u.username as initiator_username,
            init_u.display_name as initiator_display_name,
            init_u.trust_score as initiator_trust_score,
            init_u.avatar_url as initiator_avatar_url,
            init_u.avatar_icon_url as initiator_avatar_icon_url,
            COALESCE(init_kudos.kudos_count, 0) as initiator_kudos_count,
            -- Responder user info
            resp_u.username as responder_username,
            resp_u.display_name as responder_display_name,
            resp_u.trust_score as responder_trust_score,
            resp_u.avatar_url as responder_avatar_url,
            resp_u.avatar_icon_url as responder_avatar_icon_url,
            COALESCE(resp_kudos.kudos_count, 0) as responder_kudos_count
        FROM chat_log cl
        JOIN chat_request cr ON cl.chat_request_id = cr.id
        JOIN user_position up ON cr.user_position_id = up.id
        JOIN position p ON up.position_id = p.id
        LEFT JOIN position_category cat ON p.category_id = cat.id
        LEFT JOIN location loc ON p.location_id = loc.id
        JOIN users pos_holder ON up.user_id = pos_holder.id
        JOIN users init_u ON cr.initiator_user_id = init_u.id
        JOIN users resp_u ON up.user_id = resp_u.id
        LEFT JOIN (
            SELECT receiver_user_id, COUNT(*) as kudos_count
            FROM kudos WHERE status = 'sent'
            GROUP BY receiver_user_id
        ) pos_holder_kudos ON pos_holder.id = pos_holder_kudos.receiver_user_id
        LEFT JOIN (
            SELECT receiver_user_id, COUNT(*) as kudos_count
            FROM kudos WHERE status = 'sent'
            GROUP BY receiver_user_id
        ) init_kudos ON init_u.id = init_kudos.receiver_user_id
        LEFT JOIN (
            SELECT receiver_user_id, COUNT(*) as kudos_count
            FROM kudos WHERE status = 'sent'
            GROUP BY receiver_user_id
        ) resp_kudos ON resp_u.id = resp_kudos.receiver_user_id
        WHERE cl.id = %s
    """, (chat_id,), fetchone=True)

    if not result:
        return ErrorModel(code=404, message="Chat log not found"), 404

    # Verify user is a participant or moderator
    initiator_id = str(result["initiator_user_id"])
    responder_id = str(result["responder_user_id"])
    is_participant = str(user.id) in (initiator_id, responder_id)
    is_moderator = is_moderator_anywhere(user.id)

    # Non-participants (except moderators) can only see agreed statements
    if not is_participant and not is_moderator:
        log_blob = result["log"]
        agreed_closure = None
        agreed_positions = []
        if log_blob and isinstance(log_blob, dict):
            agreed_closure = log_blob.get("agreedClosure")
            agreed_positions = log_blob.get("agreedPositions", [])

        if not agreed_closure and not agreed_positions:
            return ErrorModel(code=403, message="Not authorized to view this chat"), 403

        return {
            "id": str(result["id"]),
            "log": {
                "agreedClosure": agreed_closure,
                "agreedPositions": agreed_positions,
            },
        }, 200

    # Determine the other user based on current user
    # For moderators viewing as non-participants, the else branch shows initiator info
    if str(user.id) == initiator_id:
        other_user = {
            "id": responder_id,
            "username": result["responder_username"],
            "displayName": result["responder_display_name"],
            "avatarUrl": result["responder_avatar_url"],
            "avatarIconUrl": result["responder_avatar_icon_url"],
            "trustScore": float(result["responder_trust_score"]) if result["responder_trust_score"] else None,
            "kudosCount": result["responder_kudos_count"],
        }
    else:
        other_user = {
            "id": initiator_id,
            "username": result["initiator_username"],
            "displayName": result["initiator_display_name"],
            "avatarUrl": result["initiator_avatar_url"],
            "avatarIconUrl": result["initiator_avatar_icon_url"],
            "trustScore": float(result["initiator_trust_score"]) if result["initiator_trust_score"] else None,
            "kudosCount": result["initiator_kudos_count"],
        }

    # Build position object with category, location, and creator
    position = {
        "id": str(result["position_id"]),
        "statement": result["position_statement"],
        "category": {
            "id": str(result["category_id"]) if result["category_id"] else None,
            "label": result["category_name"],
        } if result["category_id"] else None,
        "location": {
            "id": str(result["location_id"]) if result["location_id"] else None,
            "code": result["location_code"],
            "name": result["location_name"],
        } if result["location_id"] else None,
        "creator": {
            "id": str(result["responder_user_id"]),
            "username": result["position_holder_username"],
            "displayName": result["position_holder_display_name"],
            "avatarUrl": result["position_holder_avatar_url"],
            "avatarIconUrl": result["position_holder_avatar_icon_url"],
            "trustScore": float(result["position_holder_trust_score"]) if result["position_holder_trust_score"] else None,
            "kudosCount": result["position_holder_kudos_count"],
        },
    }

    log_blob = result["log"]

    # Extract endedByUserId from log if present
    ended_by_user_id = None
    if log_blob and isinstance(log_blob, dict):
        ended_by_user_id = log_blob.get("endedByUserId")

    # Get kudos status for ETag computation (kudos can change after chat ends)
    kudos_status = db.execute_query("""
        SELECT sender_user_id, receiver_user_id, status, created_time
        FROM kudos
        WHERE chat_log_id = %s
        ORDER BY created_time
    """, (chat_id,))

    # Compute ETag based on chat data and kudos status
    # For ended chats, the log itself is immutable, but kudos can change
    etag_data = f"{chat_id}:{result['end_time']}:{result['status']}"
    if kudos_status:
        kudos_str = "|".join([f"{k['sender_user_id']}:{k['status']}" for k in kudos_status])
        etag_data += f":{kudos_str}"
    etag = generate_etag(etag_data)

    # Use end_time as Last-Modified for ended chats (immutable after that)
    # For active chats, don't cache
    last_modified = result["end_time"] if result["end_time"] else None

    # Check for conditional request (304 Not Modified)
    if last_modified and check_not_modified(last_modified=last_modified, etag=etag):
        return make_304_response()

    response_data = {
        "id": str(result["id"]),
        "chatRequestId": str(result["chat_request_id"]),
        "startTime": result["start_time"].isoformat() if result["start_time"] else None,
        "endTime": result["end_time"].isoformat() if result["end_time"] else None,
        "log": log_blob,  # JSONB column (camelCase keys)
        "endType": result["end_type"],
        "status": result["status"],
        "position": position,
        "otherUser": other_user,
        "endedByUserId": ended_by_user_id,
    }

    # For moderator non-participant viewers, include both participants
    if not is_participant and is_moderator:
        response_data["participants"] = [
            {
                "id": initiator_id,
                "username": result["initiator_username"],
                "displayName": result["initiator_display_name"],
                "avatarUrl": result["initiator_avatar_url"],
                "avatarIconUrl": result["initiator_avatar_icon_url"],
                "trustScore": float(result["initiator_trust_score"]) if result["initiator_trust_score"] else None,
                "kudosCount": result["initiator_kudos_count"],
            },
            {
                "id": responder_id,
                "username": result["responder_username"],
                "displayName": result["responder_display_name"],
                "avatarUrl": result["responder_avatar_url"],
                "avatarIconUrl": result["responder_avatar_icon_url"],
                "trustScore": float(result["responder_trust_score"]) if result["responder_trust_score"] else None,
                "kudosCount": result["responder_kudos_count"],
            },
        ]

    response = make_response(response_data, 200)
    response = add_cache_headers(response, last_modified=last_modified, etag_data=etag_data)
    return response


def get_user_chats_metadata(user_id, token_info=None):
    """Get metadata about user's chat history for cache validation.

    Returns count and last activity time without full chat data.

    :param user_id: User ID
    :type user_id: str
    :param token_info: JWT token info from authentication
    :type token_info: dict

    :rtype: Union[dict, Tuple[dict, int]]
    """
    authorized, auth_err = authorization_allow_banned("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    # Users can only view their own chat metadata (or moderators/admins can view any)
    if str(user.id) != user_id and not is_moderator_anywhere(user.id):
        return ErrorModel(code=403, message="Not authorized to view these chats"), 403

    # Get count and latest activity time
    result = db.execute_query("""
        SELECT
            COUNT(*) as count,
            MAX(GREATEST(cl.start_time, COALESCE(cl.end_time, cl.start_time))) as last_activity_time
        FROM chat_log cl
        JOIN chat_request cr ON cl.chat_request_id = cr.id
        JOIN user_position up ON cr.user_position_id = up.id
        WHERE (cr.initiator_user_id = %s OR up.user_id = %s)
        AND cl.status != 'deleted'
    """, (user_id, user_id), fetchone=True)

    count = result["count"] if result else 0
    last_activity_time = result["last_activity_time"] if result else None

    response_data = {
        "count": count,
        "lastActivityTime": last_activity_time.isoformat() if last_activity_time else None,
    }

    response = make_response(response_data, 200)
    if last_activity_time:
        response = add_cache_headers(response, last_modified=last_activity_time)
    return response


def get_user_chats(user_id, position_id=None, limit=None, offset=None, token_info=None):
    """Get a list of the user's historical chats

    :param user_id: User ID
    :type user_id: str
    :param position_id: Filter chats by position ID
    :type position_id: str
    :param limit: Maximum number of chats to return
    :type limit: int
    :param offset: Number of chats to skip
    :type offset: int
    :param token_info: JWT token info from authentication
    :type token_info: dict

    :rtype: Union[List[GetUserChats200ResponseInner], Tuple[List[GetUserChats200ResponseInner], int], Tuple[List[GetUserChats200ResponseInner], int, Dict[str, str]]
    """
    authorized, auth_err = authorization_allow_banned("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    # Users can only view their own chats (or moderators/admins can view any)
    if str(user.id) != user_id and not is_moderator_anywhere(user.id):
        return ErrorModel(code=403, message="Not authorized to view these chats"), 403

    # Build query with full position, category, location, and user details
    query = """
        SELECT
            cl.id,
            cl.start_time,
            cl.end_time,
            cl.end_type,
            cl.status,
            cl.log,
            -- Position info
            p.id as position_id,
            p.statement as position_statement,
            -- Category info
            cat.id as category_id,
            cat.label as category_name,
            -- Location info
            loc.id as location_id,
            loc.code as location_code,
            loc.name as location_name,
            -- Chat participants
            cr.initiator_user_id,
            up.user_id as responder_user_id,
            -- Position holder info (for author display)
            pos_holder.id as position_holder_id,
            pos_holder.username as position_holder_username,
            pos_holder.display_name as position_holder_display_name,
            pos_holder.trust_score as position_holder_trust_score,
            pos_holder.avatar_url as position_holder_avatar_url,
            pos_holder.avatar_icon_url as position_holder_avatar_icon_url,
            -- Initiator user info
            init_u.id as initiator_id,
            init_u.username as initiator_username,
            init_u.display_name as initiator_display_name,
            init_u.trust_score as initiator_trust_score,
            init_u.avatar_url as initiator_avatar_url,
            init_u.avatar_icon_url as initiator_avatar_icon_url,
            -- Responder user info
            resp_u.id as responder_id,
            resp_u.username as responder_username,
            resp_u.display_name as responder_display_name,
            resp_u.trust_score as responder_trust_score,
            resp_u.avatar_url as responder_avatar_url,
            resp_u.avatar_icon_url as responder_avatar_icon_url
        FROM chat_log cl
        JOIN chat_request cr ON cl.chat_request_id = cr.id
        JOIN user_position up ON cr.user_position_id = up.id
        JOIN position p ON up.position_id = p.id
        LEFT JOIN position_category cat ON p.category_id = cat.id
        LEFT JOIN location loc ON p.location_id = loc.id
        JOIN users pos_holder ON up.user_id = pos_holder.id
        JOIN users init_u ON cr.initiator_user_id = init_u.id
        JOIN users resp_u ON up.user_id = resp_u.id
        WHERE (cr.initiator_user_id = %s OR up.user_id = %s)
        AND cl.status != 'deleted'
    """
    params = [user_id, user_id]

    if position_id:
        query += " AND p.id = %s"
        params.append(position_id)

    query += " ORDER BY cl.start_time DESC"

    if limit:
        query += " LIMIT %s"
        params.append(limit)

    if offset:
        query += " OFFSET %s"
        params.append(offset)

    results = db.execute_query(query, tuple(params))

    # Get kudos counts for all relevant users in a single query
    user_ids = set()
    for row in results:
        user_ids.add(str(row["initiator_id"]))
        user_ids.add(str(row["responder_id"]))
        user_ids.add(str(row["position_holder_id"]))

    kudos_counts = {}
    if user_ids:
        kudos_results = db.execute_query("""
            SELECT receiver_user_id, COUNT(*) as kudos_count
            FROM kudos WHERE status = 'sent' AND receiver_user_id = ANY(%s::uuid[])
            GROUP BY receiver_user_id
        """, (list(user_ids),))
        for kr in kudos_results:
            kudos_counts[str(kr["receiver_user_id"])] = kr["kudos_count"]

    # Get kudos status for each chat (who sent kudos to whom)
    chat_ids = [str(row["id"]) for row in results]
    chat_kudos = {}  # chat_id -> { user_sent: bool, received_from_other: bool }
    if chat_ids:
        kudos_for_chats = db.execute_query("""
            SELECT chat_log_id, sender_user_id, receiver_user_id, status
            FROM kudos
            WHERE chat_log_id = ANY(%s::uuid[])
        """, (chat_ids,))
        for k in kudos_for_chats:
            chat_id = str(k["chat_log_id"])
            if chat_id not in chat_kudos:
                chat_kudos[chat_id] = {"user_sent": False, "received_from_other": False}
            # Check if current user sent kudos
            if str(k["sender_user_id"]) == user_id and k["status"] == "sent":
                chat_kudos[chat_id]["user_sent"] = True
            # Check if the other user sent kudos to current user
            if str(k["receiver_user_id"]) == user_id and k["status"] == "sent":
                chat_kudos[chat_id]["received_from_other"] = True

    chats = []
    for row in results:
        # Determine the other user based on current user
        if str(row["initiator_user_id"]) == user_id:
            other_user = {
                "id": str(row["responder_id"]),
                "username": row["responder_username"],
                "displayName": row["responder_display_name"],
                "avatarUrl": row["responder_avatar_url"],
                "avatarIconUrl": row["responder_avatar_icon_url"],
                "trustScore": float(row["responder_trust_score"]) if row["responder_trust_score"] else None,
                "kudosCount": kudos_counts.get(str(row["responder_id"]), 0),
            }
        else:
            other_user = {
                "id": str(row["initiator_id"]),
                "username": row["initiator_username"],
                "displayName": row["initiator_display_name"],
                "avatarUrl": row["initiator_avatar_url"],
                "avatarIconUrl": row["initiator_avatar_icon_url"],
                "trustScore": float(row["initiator_trust_score"]) if row["initiator_trust_score"] else None,
                "kudosCount": kudos_counts.get(str(row["initiator_id"]), 0),
            }

        # Build position object
        position = {
            "id": str(row["position_id"]),
            "statement": row["position_statement"],
            "category": {
                "id": str(row["category_id"]) if row["category_id"] else None,
                "label": row["category_name"],
            } if row["category_id"] else None,
            "location": {
                "id": str(row["location_id"]) if row["location_id"] else None,
                "code": row["location_code"],
                "name": row["location_name"],
            } if row["location_id"] else None,
            "creator": {
                "id": str(row["position_holder_id"]),
                "username": row["position_holder_username"],
                "displayName": row["position_holder_display_name"],
                "avatarUrl": row["position_holder_avatar_url"],
                "avatarIconUrl": row["position_holder_avatar_icon_url"],
                "trustScore": float(row["position_holder_trust_score"]) if row["position_holder_trust_score"] else None,
                "kudosCount": kudos_counts.get(str(row["position_holder_id"]), 0),
            },
        }
        # Extract agreed closure and endedByUserId from log
        agreed_closure = None
        ended_by_user_id = None
        if row["log"] and isinstance(row["log"], dict):
            log = row["log"]
            # Get who ended the chat
            ended_by_user_id = log.get("endedByUserId")
            # Get agreed closure object if chat ended with agreement
            if row["end_type"] in ("mutual_agreement", "agreed_closure"):
                closure = log.get("agreedClosure")
                if isinstance(closure, dict) and "content" in closure:
                    agreed_closure = closure

        # Get kudos status for this chat
        chat_id_str = str(row["id"])
        kudos_info = chat_kudos.get(chat_id_str, {"user_sent": False, "received_from_other": False})

        chats.append({
            "id": chat_id_str,
            "startTime": row["start_time"].isoformat() if row["start_time"] else None,
            "endTime": row["end_time"].isoformat() if row["end_time"] else None,
            "endType": row["end_type"],
            "status": row["status"],
            "position": position,
            "otherUser": other_user,
            "agreedClosure": agreed_closure,
            "endedByUserId": ended_by_user_id,
            "kudosSent": kudos_info["user_sent"],
            "kudosReceived": kudos_info["received_from_other"],
        })

    # Compute Last-Modified from latest chat activity
    last_activity = None
    for row in results:
        activity_time = row["end_time"] or row["start_time"]
        if activity_time and (last_activity is None or activity_time > last_activity):
            last_activity = activity_time

    response = make_response(jsonify(chats), 200)
    if last_activity:
        response = add_cache_headers(response, last_modified=last_activity)
    return response


def send_kudos(chat_id, token_info=None):
    """Send kudos to a user after a chat

    :param chat_id: Chat log ID
    :type chat_id: str
    :param token_info: JWT token info from authentication
    :type token_info: dict

    :rtype: Union[Kudos, Tuple[Kudos, int], Tuple[Kudos, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    # Get chat and verify user is a participant
    result = db.execute_query("""
        SELECT
            cl.id,
            cl.status,
            cr.initiator_user_id,
            up.user_id as responder_user_id,
            up.position_id
        FROM chat_log cl
        JOIN chat_request cr ON cl.chat_request_id = cr.id
        JOIN user_position up ON cr.user_position_id = up.id
        WHERE cl.id = %s
    """, (chat_id,), fetchone=True)

    if not result:
        return ErrorModel(code=404, message="Chat not found"), 404

    initiator_id = str(result["initiator_user_id"])
    responder_id = str(result["responder_user_id"])

    # Verify user is a participant
    if str(user.id) not in (initiator_id, responder_id):
        return ErrorModel(code=403, message="Not authorized to send kudos for this chat"), 403

    # Determine receiver (the other user)
    if str(user.id) == initiator_id:
        receiver_id = responder_id
    else:
        receiver_id = initiator_id

    # Check if user already sent kudos to this person for the same position
    # (prevents gaming via repeated chats on the same topic)
    position_id = str(result["position_id"])
    existing = db.execute_query("""
        SELECT k.id FROM kudos k
        JOIN chat_log cl2 ON k.chat_log_id = cl2.id
        JOIN chat_request cr2 ON cl2.chat_request_id = cr2.id
        JOIN user_position up2 ON cr2.user_position_id = up2.id
        WHERE k.sender_user_id = %s
          AND k.receiver_user_id = %s
          AND up2.position_id = %s
          AND k.status = 'sent'
    """, (str(user.id), receiver_id, position_id), fetchone=True)

    if existing:
        return ErrorModel(code=409, message="You have already sent kudos to this user for this topic"), 409

    # Create or update kudos (allows sending after dismissing)
    kudos_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO kudos (id, sender_user_id, receiver_user_id, chat_log_id, status)
        VALUES (%s, %s, %s, %s, 'sent')
        ON CONFLICT (sender_user_id, receiver_user_id, chat_log_id)
        DO UPDATE SET status = 'sent', created_time = CURRENT_TIMESTAMP
    """, (kudos_id, str(user.id), receiver_id, chat_id))

    # Return the created kudos (need to get the actual ID since upsert may have used existing)
    created = db.execute_query("""
        SELECT id, sender_user_id, receiver_user_id, chat_log_id, created_time
        FROM kudos
        WHERE sender_user_id = %s AND chat_log_id = %s
    """, (str(user.id), chat_id), fetchone=True)

    return {
        "id": str(created["id"]),
        "senderUserId": str(created["sender_user_id"]),
        "receiverUserId": str(created["receiver_user_id"]),
        "chatLogId": str(created["chat_log_id"]),
        "createdTime": created["created_time"].isoformat() if created["created_time"] else None,
    }, 201


def delete_kudos_prompt(chat_id, token_info=None):
    """Dismiss a kudos prompt without sending kudos

    Records that the user dismissed the kudos prompt, preventing the
    kudos card from appearing again.

    :param chat_id: Chat log ID
    :type chat_id: str
    :param token_info: JWT token info from authentication
    :type token_info: dict

    :rtype: Union[None, Tuple[None, int], Tuple[None, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    # Get chat and verify user is a participant
    result = db.execute_query("""
        SELECT
            cl.id,
            cl.status,
            cr.initiator_user_id,
            up.user_id as responder_user_id
        FROM chat_log cl
        JOIN chat_request cr ON cl.chat_request_id = cr.id
        JOIN user_position up ON cr.user_position_id = up.id
        WHERE cl.id = %s
    """, (chat_id,), fetchone=True)

    if not result:
        return ErrorModel(code=404, message="Chat not found"), 404

    initiator_id = str(result["initiator_user_id"])
    responder_id = str(result["responder_user_id"])

    # Verify user is a participant
    if str(user.id) not in (initiator_id, responder_id):
        return ErrorModel(code=403, message="Not authorized to dismiss kudos for this chat"), 403

    # Determine receiver (the other user)
    if str(user.id) == initiator_id:
        receiver_id = responder_id
    else:
        receiver_id = initiator_id

    # Create kudos record with status='dismissed' (idempotent via upsert)
    kudos_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO kudos (id, sender_user_id, receiver_user_id, chat_log_id, status)
        VALUES (%s, %s, %s, %s, 'dismissed')
        ON CONFLICT (sender_user_id, receiver_user_id, chat_log_id)
        DO NOTHING
    """, (kudos_id, str(user.id), receiver_id, chat_id))

    return None, 204


def _update_response_rates(user_id: str):
    """Recalculate context-specific response rates for a user."""
    db.execute_query("""
        UPDATE users SET
            response_rate_swiping = COALESCE((
                SELECT COUNT(*) FILTER (WHERE cr.response = 'accepted')::decimal /
                    NULLIF(COUNT(*) FILTER (WHERE cr.response IN ('accepted', 'dismissed')), 0)
                FROM chat_request cr
                JOIN user_position up ON cr.user_position_id = up.id
                WHERE up.user_id = %s AND cr.delivery_context = 'swiping'
                  AND cr.response IN ('accepted', 'dismissed')
            ), 1.00),
            response_rate_in_app = COALESCE((
                SELECT COUNT(*) FILTER (WHERE cr.response = 'accepted')::decimal /
                    NULLIF(COUNT(*) FILTER (WHERE cr.response IN ('accepted', 'dismissed')), 0)
                FROM chat_request cr
                JOIN user_position up ON cr.user_position_id = up.id
                WHERE up.user_id = %s AND cr.delivery_context = 'in_app'
                  AND cr.response IN ('accepted', 'dismissed')
            ), 1.00),
            response_rate_notification = COALESCE((
                SELECT COUNT(*) FILTER (WHERE cr.response = 'accepted')::decimal /
                    NULLIF(COUNT(*) FILTER (WHERE cr.response IN ('accepted', 'dismissed')), 0)
                FROM chat_request cr
                JOIN user_position up ON cr.user_position_id = up.id
                WHERE up.user_id = %s AND cr.delivery_context = 'notification'
                  AND cr.response IN ('accepted', 'dismissed')
            ), 1.00)
        WHERE id = %s
    """, (user_id, user_id, user_id, user_id))


def _add_to_chatting_list(user_id: str, position_id: str):
    """Add a position to the user's chatting list or update if already exists.

    This is called when a user swipes up to chat on a position. The position
    is added to their chatting list so it can reappear in their queue later.
    """
    # Check if already in chatting list
    existing = db.execute_query("""
        SELECT id, is_active, chat_count FROM user_chatting_list
        WHERE user_id = %s AND position_id = %s
    """, (user_id, position_id), fetchone=True)

    if existing:
        # Update existing entry: increment chat_count, update last_chat_time,
        # and reactivate if inactive
        db.execute_query("""
            UPDATE user_chatting_list
            SET last_chat_time = CURRENT_TIMESTAMP,
                chat_count = chat_count + 1,
                is_active = true
            WHERE id = %s
        """, (str(existing["id"]),))
    else:
        # Create new entry
        item_id = str(uuid.uuid4())
        db.execute_query("""
            INSERT INTO user_chatting_list (id, user_id, position_id, is_active, chat_count)
            VALUES (%s, %s, %s, true, 1)
        """, (item_id, user_id, position_id))
