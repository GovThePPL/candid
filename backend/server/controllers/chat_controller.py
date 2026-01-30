import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from candid.models.chat_request import ChatRequest
from candid.models.error_model import ErrorModel
from candid.models.get_chat_log200_response import GetChatLog200Response
from candid.models.get_user_chats200_response_inner import GetUserChats200ResponseInner
from candid.models.kudos import Kudos
from candid import util

from candid.controllers import db
from candid.controllers.helpers.config import Config
from candid.controllers.helpers.auth import authorization, token_to_user
from candid.controllers.helpers.chat_events import publish_chat_accepted, publish_chat_request_response

from camel_converter import dict_to_camel
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

    if connexion.request.is_json:
        body = connexion.request.get_json()

    user_position_id = body.get("userPositionId")
    if not user_position_id:
        return ErrorModel(code=400, message="userPositionId is required"), 400

    # Verify the user_position exists and get the owner
    result = db.execute_query("""
        SELECT up.id, up.user_id, p.statement
        FROM user_position up
        JOIN position p ON up.position_id = p.id
        WHERE up.id = %s AND up.status = 'active'
    """, (user_position_id,), fetchone=True)

    if not result:
        return ErrorModel(code=404, message="User position not found"), 404

    recipient_user_id = str(result["user_id"])

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

    # Create the chat request
    request_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO chat_request (id, initiator_user_id, user_position_id, response)
        VALUES (%s, %s, %s, 'pending')
    """, (request_id, str(user.id), user_position_id))

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

    return dict_to_camel({
        "id": str(created["id"]),
        "initiator_user_id": str(created["initiator_user_id"]),
        "user_position_id": str(created["user_position_id"]),
        "response": created["response"],
        "response_time": created["response_time"].isoformat() if created["response_time"] else None,
        "created_time": created["created_time"].isoformat() if created["created_time"] else None,
        "updated_time": created["updated_time"].isoformat() if created["updated_time"] else None,
    }), 201


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

    response_data = dict_to_camel({
        "id": str(updated["id"]),
        "initiator_user_id": str(updated["initiator_user_id"]),
        "user_position_id": str(updated["user_position_id"]),
        "response": updated["response"],
        "response_time": updated["response_time"].isoformat() if updated["response_time"] else None,
        "created_time": updated["created_time"].isoformat() if updated["created_time"] else None,
        "updated_time": updated["updated_time"].isoformat() if updated["updated_time"] else None,
    })

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

    return {"message": "Chat request rescinded"}, 200


def get_chat_log(chat_id, token_info=None):
    """Get JSON blob of a chat log

    Retrieves a complete JSON blob of a chat log. Only participants
    can view the log.

    :param chat_id: Chat log ID
    :type chat_id: str
    :param token_info: JWT token info from authentication
    :type token_info: dict

    :rtype: Union[GetChatLog200Response, Tuple[GetChatLog200Response, int], Tuple[GetChatLog200Response, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
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
            COALESCE(pos_holder_kudos.kudos_count, 0) as position_holder_kudos_count,
            -- Initiator user info
            init_u.username as initiator_username,
            init_u.display_name as initiator_display_name,
            init_u.trust_score as initiator_trust_score,
            COALESCE(init_kudos.kudos_count, 0) as initiator_kudos_count,
            -- Responder user info
            resp_u.username as responder_username,
            resp_u.display_name as responder_display_name,
            resp_u.trust_score as responder_trust_score,
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

    # Verify user is a participant
    initiator_id = str(result["initiator_user_id"])
    responder_id = str(result["responder_user_id"])

    if str(user.id) not in (initiator_id, responder_id):
        return ErrorModel(code=403, message="Not authorized to view this chat"), 403

    # Determine the other user based on current user
    if str(user.id) == initiator_id:
        other_user = {
            "id": responder_id,
            "username": result["responder_username"],
            "display_name": result["responder_display_name"],
            "avatar_url": None,  # TODO: Add avatar_url column to users table
            "trust_score": float(result["responder_trust_score"]) if result["responder_trust_score"] else None,
            "kudos_count": result["responder_kudos_count"],
        }
    else:
        other_user = {
            "id": initiator_id,
            "username": result["initiator_username"],
            "display_name": result["initiator_display_name"],
            "avatar_url": None,  # TODO: Add avatar_url column to users table
            "trust_score": float(result["initiator_trust_score"]) if result["initiator_trust_score"] else None,
            "kudos_count": result["initiator_kudos_count"],
        }

    # Build position object with category, location, and creator
    position = {
        "id": str(result["position_id"]),
        "statement": result["position_statement"],
        "category": {
            "id": str(result["category_id"]) if result["category_id"] else None,
            "name": result["category_name"],
        } if result["category_id"] else None,
        "location": {
            "id": str(result["location_id"]) if result["location_id"] else None,
            "code": result["location_code"],
            "name": result["location_name"],
        } if result["location_id"] else None,
        "creator": {
            "id": str(result["responder_user_id"]),
            "username": result["position_holder_username"],
            "display_name": result["position_holder_display_name"],
            "avatar_url": None,  # TODO: Add avatar_url column to users table
            "trust_score": float(result["position_holder_trust_score"]) if result["position_holder_trust_score"] else None,
            "kudos_count": result["position_holder_kudos_count"],
        },
    }

    return dict_to_camel({
        "id": str(result["id"]),
        "chat_request_id": str(result["chat_request_id"]),
        "start_time": result["start_time"].isoformat() if result["start_time"] else None,
        "end_time": result["end_time"].isoformat() if result["end_time"] else None,
        "log": result["log"],  # JSONB column
        "end_type": result["end_type"],
        "status": result["status"],
        "position": position,
        "other_user": other_user,
    }), 200


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
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    # Users can only view their own chats (or admins can view any)
    if str(user.id) != user_id and user.user_type not in ("admin", "moderator"):
        return ErrorModel(code=403, message="Not authorized to view these chats"), 403

    # Build query
    query = """
        SELECT
            cl.id,
            cl.start_time,
            cl.end_time,
            cl.end_type,
            cl.status,
            p.id as position_id,
            p.statement as position_statement,
            cr.initiator_user_id,
            up.user_id as responder_user_id
        FROM chat_log cl
        JOIN chat_request cr ON cl.chat_request_id = cr.id
        JOIN user_position up ON cr.user_position_id = up.id
        JOIN position p ON up.position_id = p.id
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

    chats = []
    for row in results:
        # Determine the other user
        if str(row["initiator_user_id"]) == user_id:
            other_user_id = str(row["responder_user_id"])
        else:
            other_user_id = str(row["initiator_user_id"])

        chats.append(dict_to_camel({
            "id": str(row["id"]),
            "position_id": str(row["position_id"]),
            "position_statement": row["position_statement"],
            "other_user_id": other_user_id,
            "start_time": row["start_time"].isoformat() if row["start_time"] else None,
            "end_time": row["end_time"].isoformat() if row["end_time"] else None,
            "end_type": row["end_type"],
            "status": row["status"],
        }))

    return chats, 200


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
        return ErrorModel(code=403, message="Not authorized to send kudos for this chat"), 403

    # Determine receiver (the other user)
    if str(user.id) == initiator_id:
        receiver_id = responder_id
    else:
        receiver_id = initiator_id

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

    return dict_to_camel({
        "id": str(created["id"]),
        "sender_user_id": str(created["sender_user_id"]),
        "receiver_user_id": str(created["receiver_user_id"]),
        "chat_log_id": str(created["chat_log_id"]),
        "created_time": created["created_time"].isoformat() if created["created_time"] else None,
    }), 201


def dismiss_kudos(chat_id, token_info=None):
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
