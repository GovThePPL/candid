import connexion
from typing import Dict, List, Optional, Any
from typing import Tuple
from typing import Union

from candid.models.create_position_request import CreatePositionRequest  # noqa: E501
from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.position import Position  # noqa: E501
from candid.models.user import User
from candid.models.user_position import UserPosition  # noqa: E501
from candid.models.position_response import PositionResponse  # noqa: E501
from candid.models.response import Response  # noqa: E501
from candid import util

from candid.controllers import db, config
from candid.controllers.helpers.config import Config
from candid.controllers.helpers.auth import authorization, authorization_allow_banned, token_to_user
from candid.controllers.helpers import polis_sync
from candid.controllers.helpers import presence
from candid.controllers.helpers import nlp
from candid.controllers.helpers.polis_sync import (
    get_oldest_active_conversation,
    generate_xid,
)
from candid.controllers.helpers.polis_client import get_client, PolisError

from candid.controllers.stats_controller import _get_cached_group_labels
import uuid

def _get_user_card(user_id):
    user = db.execute_query("""
        SELECT
            u.display_name,
            u.id,
            u.status,
            u.username,
            COALESCE((
                SELECT COUNT(*) FROM kudos k
                WHERE k.receiver_user_id = u.id AND k.status = 'sent'
            ), 0) as kudos_count
        FROM users u
        WHERE u.id = %s
    """, (user_id,), fetchone=True)
    if user is not None:
        return User(
            id=str(user['id']),
            username=user['username'],
            display_name=user['display_name'],
            status=user['status'],
            kudos_count=user.get('kudos_count', 0),
        )
    return None

def _row_to_user_position(row):
    return UserPosition(
        id=str(row['id']),
        user_id=str(row['user_id']),
        position_id=str(row['position_id']),
        location_id=str(row['location_id']) if row.get('location_id') else None,
        category_id=str(row['category_id']) if row.get('category_id') else None,
        category_name=row.get('category_name'),
        location_name=row.get('location_name'),
        location_code=row.get('location_code'),
        statement=row.get('statement'),
        status=row['status'],
        agree_count=row.get('agree_count', 0),
        disagree_count=row.get('disagree_count', 0),
        pass_count=row.get('pass_count', 0),
        chat_count=row.get('chat_count', 0),
    )

def create_position(body, token_info=None):  # noqa: E501
    """Create a new position statement

     # noqa: E501

    :param create_position_request:
    :type create_position_request: dict | bytes

    :rtype: Union[Position, Tuple[Position, int], Tuple[Position, int, Dict[str, str]]
    """
    create_position_request = body
    if connexion.request.is_json:
        create_position_request = CreatePositionRequest.from_dict(connexion.request.get_json())  # noqa: E501

    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    # Validate statement length (Polis has a 140 character limit)
    if len(create_position_request.statement) > 140:
        return {"code": 400, "message": "Statement must be 140 characters or less"}, 400

    position_id = str(uuid.uuid4())

    # Generate embedding for the statement
    embedding = nlp.get_embedding(create_position_request.statement)

    # TODO: Check that user in in location
    if embedding:
        ret = db.execute_query("""
            INSERT INTO position (id, creator_user_id, category_id, location_id, statement, embedding)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            position_id,
            user.id,
            create_position_request.category_id,
            create_position_request.location_id,
            create_position_request.statement,
            embedding
        ))
    else:
        ret = db.execute_query("""
            INSERT INTO position (id, creator_user_id, category_id, location_id, statement)
            VALUES (%s, %s, %s, %s, %s)
        """, (
            position_id,
            user.id,
            create_position_request.category_id,
            create_position_request.location_id,
            create_position_request.statement
        ))

    ret = db.execute_query("""
        INSERT INTO user_position (user_id, position_id)
        VALUES (%s, %s)
    """, (
        user.id,
        position_id
    ))

    # Queue position for async Polis sync
    polis_sync.queue_position_sync(
        position_id=position_id,
        statement=create_position_request.statement,
        category_id=create_position_request.category_id,
        location_id=create_position_request.location_id,
        creator_user_id=user.id
    )

    # Return the created position
    return {
        "id": position_id,
        "statement": create_position_request.statement,
        "categoryId": create_position_request.category_id,
        "locationId": create_position_request.location_id,
        "status": "active",
        "agreeCount": 0,
        "disagreeCount": 0,
        "passCount": 0,
        "chatCount": 0
    }, 201


def get_position_by_id(position_id, token_info=None):  # noqa: E501
    """Get a specific position statement

     # noqa: E501

    :param position_id:
    :type position_id: str
    :type position_id: str

    :rtype: Union[Position, Tuple[Position, int], Tuple[Position, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    position = db.execute_query("""
        SELECT
            agree_count,
            category_id,
            chat_count,
            TO_CHAR(created_time, %s),
            disagree_count,
            creator_user_id,
            id,
            pass_count,
            statement,
            status
        FROM position as p
        WHERE p.id = %s
    """,
    (Config.TIMESTAMP_FORMAT, position_id),
    fetchone=True)

    if position is None:
        return ErrorModel(404, "Not Found"), 404

    user = _get_user_card(position['creator_user_id'])
    ret = Position(
        id=str(position['id']),
        statement=position['statement'],
        category_id=str(position['category_id']) if position.get('category_id') else None,
        status=position['status'],
        agree_count=position.get('agree_count', 0),
        disagree_count=position.get('disagree_count', 0),
        pass_count=position.get('pass_count', 0),
        chat_count=position.get('chat_count', 0),
        creator=user,
    )

    return ret


def respond_to_positions(body, token_info=None):  # noqa: E501
    """Respond to one or more position statements

     # noqa: E501

    :param position_response:
    :type position_response: dict | bytes

    :rtype: Union[List[Response], Tuple[List[Response], int], Tuple[List[Response], int, Dict[str, str]]
    """
    position_response = body
    if connexion.request.is_json:
        position_response = PositionResponse.from_dict(connexion.request.get_json())  # noqa: E501

    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    # Record presence: user is swiping (responding to positions)
    presence.record_swiping(str(user.id))

    resp_by_id = {}
    for resp in position_response.responses:
        resp_by_id[resp.position_id] = resp.response

    # Check if any responses already exist
    existing_ids = db.execute_query("""
        SELECT position_id FROM response WHERE user_id = %s and position_id IN %s
    """, (user.id, tuple(resp_by_id.keys())))

    # Update existing responses
    for existing_id in existing_ids:
        id = existing_id["position_id"]
        print("Updating " + id, flush=True)
        db.execute_query("""
            UPDATE response SET response = %s WHERE id = %s
        """, (resp_by_id[id], id))
        del resp_by_id[id]

    # Create new responses
    values = []
    for id in resp_by_id.keys():
        print ("Adding " + id, flush=True)
        values.append((user.id, id, resp_by_id[id]))
    db.execute_query("""
        INSERT INTO response (user_id, position_id, response)
        VALUES (%s, %s, %s)
    """, values, executemany=True)

    # Queue votes for async Polis sync (all responses, not just new ones)
    for resp in position_response.responses:
        polis_sync.queue_vote_sync(
            position_id=resp.position_id,
            user_id=user.id,
            response=resp.response
        )

    # TODO: Update counts, change to have user respond to user_position rather than position


def adopt_position(position_id, token_info=None):  # noqa: E501
    """Adopt a position and register an agree response

    Creates a user_position entry for the current user and registers an agree response.

    :param position_id: ID of the position to adopt
    :type position_id: str

    :rtype: Union[UserPosition, Tuple[UserPosition, int], Tuple[UserPosition, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    # Check if position exists
    position = db.execute_query("""
        SELECT id, category_id, location_id, statement
        FROM position
        WHERE id = %s AND status = 'active'
    """, (position_id,), fetchone=True)

    if not position:
        return ErrorModel(404, "Position not found"), 404

    # Check if user already adopted this position (active)
    existing_active = db.execute_query("""
        SELECT id FROM user_position
        WHERE user_id = %s AND position_id = %s AND status = 'active'
    """, (user.id, position_id), fetchone=True)

    if existing_active:
        return ErrorModel(400, "Position already adopted"), 400

    # Check if user previously had this position (deleted) - reactivate it
    existing_deleted = db.execute_query("""
        SELECT id FROM user_position
        WHERE user_id = %s AND position_id = %s AND status = 'deleted'
    """, (user.id, position_id), fetchone=True)

    if existing_deleted:
        # Reactivate the deleted user_position
        user_position_id = existing_deleted['id']
        db.execute_query("""
            UPDATE user_position SET status = 'active' WHERE id = %s
        """, (user_position_id,))
    else:
        # Create new user_position entry
        user_position_id = str(uuid.uuid4())
        db.execute_query("""
            INSERT INTO user_position (id, user_id, position_id, status)
            VALUES (%s, %s, %s, 'active')
        """, (user_position_id, user.id, position_id))

    # Register agree response (upsert)
    db.execute_query("""
        INSERT INTO response (user_id, position_id, response)
        VALUES (%s, %s, 'agree')
        ON CONFLICT (user_id, position_id) DO UPDATE SET response = 'agree'
    """, (user.id, position_id))

    # Update position agree count
    db.execute_query("""
        UPDATE position SET agree_count = agree_count + 1 WHERE id = %s
    """, (position_id,))

    # Queue vote for Polis sync
    polis_sync.queue_vote_sync(
        position_id=position_id,
        user_id=user.id,
        response='agree'
    )

    # Fetch and return the created user_position
    ret = db.execute_query("""
        SELECT
            up.id,
            up.user_id,
            up.position_id,
            up.status,
            up.agree_count,
            up.disagree_count,
            up.pass_count,
            up.chat_count,
            p.statement,
            p.category_id,
            p.location_id,
            c.label AS category_name,
            l.name AS location_name,
            l.code AS location_code
        FROM user_position AS up
        JOIN position AS p ON up.position_id = p.id
        LEFT JOIN position_category AS c ON p.category_id = c.id
        LEFT JOIN location AS l ON p.location_id = l.id
        WHERE up.id = %s
    """, (user_position_id,), fetchone=True)

    return _row_to_user_position(ret), 201


def search_similar_positions(body, token_info=None):  # noqa: E501
    """Search for positions with similar meaning

    Uses semantic similarity to find existing positions that match the given statement.

    :param body: Search parameters
    :type body: dict

    :rtype: Union[List[dict], Tuple[List[dict], int], Tuple[List[dict], int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    statement = body.get('statement', '')
    category_id = body.get('categoryId')
    location_id = body.get('locationId')
    limit = min(body.get('limit', 5), 10)

    # Validate statement length
    if len(statement) < 20:
        return ErrorModel(400, "Statement must be at least 20 characters"), 400

    # Get embedding for the query statement
    embedding = nlp.get_embedding(statement)
    if embedding is None:
        return ErrorModel(503, "NLP service unavailable"), 503

    # Build the query with optional filters
    # Using pgvector's <=> operator for cosine distance
    # Include positions that:
    # 1. User doesn't currently have (no active user_position)
    # 2. OR user previously had but deleted (user_position with status='deleted')
    query_parts = ["""
        SELECT
            p.id,
            p.creator_user_id,
            p.category_id,
            p.location_id,
            p.statement,
            p.status,
            p.agree_count,
            p.disagree_count,
            p.pass_count,
            p.chat_count,
            TO_CHAR(p.created_time, %s) as created_time,
            1 - (p.embedding <=> %s::vector) AS similarity,
            c.label AS category_name,
            l.name AS location_name,
            l.code AS location_code,
            CASE WHEN up_deleted.id IS NOT NULL THEN true ELSE false END AS was_previously_held
        FROM position p
        LEFT JOIN position_category c ON p.category_id = c.id
        LEFT JOIN location l ON p.location_id = l.id
        LEFT JOIN user_position up_active ON p.id = up_active.position_id
            AND up_active.user_id = %s
            AND up_active.status = 'active'
        LEFT JOIN user_position up_deleted ON p.id = up_deleted.position_id
            AND up_deleted.user_id = %s
            AND up_deleted.status = 'deleted'
        WHERE p.status = 'active'
          AND p.embedding IS NOT NULL
          AND p.creator_user_id != %s
          AND up_active.id IS NULL
          AND (1 - (p.embedding <=> %s::vector)) >= 0.5
    """]
    params = [Config.TIMESTAMP_FORMAT, embedding, user.id, user.id, user.id, embedding]

    # Add optional category filter
    if category_id:
        query_parts.append("AND p.category_id = %s")
        params.append(category_id)

    # Add optional location filter (include parent locations)
    if location_id:
        query_parts.append("""
            AND p.location_id IN (
                WITH RECURSIVE location_hierarchy AS (
                    SELECT id, parent_location_id FROM location WHERE id = %s AND deleted_at IS NULL
                    UNION ALL
                    SELECT l.id, l.parent_location_id
                    FROM location l
                    JOIN location_hierarchy lh ON l.id = lh.parent_location_id
                    WHERE l.deleted_at IS NULL
                )
                SELECT id FROM location_hierarchy
            )
        """)
        params.append(location_id)

    # Order by similarity and limit
    query_parts.append("ORDER BY p.embedding <=> %s::vector LIMIT %s")
    params.extend([embedding, limit])

    query = "\n".join(query_parts)
    positions = db.execute_query(query, tuple(params))

    if positions is None:
        return ErrorModel(500, "Database error"), 500

    # Format results
    results = []
    for pos in positions:
        # Get creator user info
        creator = _get_user_card(pos['creator_user_id'])

        position_data = {
            'id': pos['id'],
            'statement': pos['statement'],
            'categoryId': pos['category_id'],
            'status': pos['status'],
            'agreeCount': pos['agree_count'],
            'disagreeCount': pos['disagree_count'],
            'passCount': pos['pass_count'],
            'chatCount': pos['chat_count'],
            'createdTime': pos['created_time'],
            'creator': creator.to_dict() if creator else None,
        }

        # Add category info if available
        if pos['category_name']:
            position_data['category'] = {
                'id': pos['category_id'],
                'label': pos['category_name']
            }

        # Add location info if available
        if pos['location_name']:
            position_data['location'] = {
                'code': pos['location_code'],
                'name': pos['location_name']
            }

        results.append({
            'position': position_data,
            'similarity': round(float(pos['similarity']), 4),
            'wasPreviouslyHeld': pos['was_previously_held']
        })

    return results, 200


def search_stats_positions(body, token_info=None):  # noqa: E501
    """Search positions for the stats page

    Tries semantic (meaning) search for queries >= 3 words, falls back to
    text (ILIKE) search for shorter queries or when NLP is unavailable.
    Returns GroupPosition-shaped results compatible with the stats PositionCard.

    :param body: Search parameters
    :type body: dict

    :rtype: Union[dict, Tuple[dict, int]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    query = body.get('query', '').strip()
    location_id = body.get('locationId')
    offset = max(body.get('offset', 0), 0)
    limit = min(max(body.get('limit', 20), 1), 50)

    if len(query) < 2:
        return ErrorModel(400, "Query must be at least 2 characters"), 400

    if not location_id:
        return ErrorModel(400, "locationId is required"), 400

    # Location hierarchy filter (include parent locations, exclude soft-deleted)
    location_filter = """
        p.location_id IN (
            WITH RECURSIVE location_hierarchy AS (
                SELECT id, parent_location_id FROM location WHERE id = %s AND deleted_at IS NULL
                UNION ALL
                SELECT l.id, l.parent_location_id
                FROM location l
                JOIN location_hierarchy lh ON l.id = lh.parent_location_id
                WHERE l.deleted_at IS NULL
            )
            SELECT id FROM location_hierarchy
        )
    """

    # Try semantic search first for queries with enough substance (>= 3 words),
    # fall back to text search if NLP is unavailable or query is too short
    use_meaning = len(query.split()) >= 3
    embedding = None
    if use_meaning:
        embedding = nlp.get_embedding(query)
        if embedding is None:
            use_meaning = False  # NLP unavailable, fall back to text

    if use_meaning:
        sql = f"""
            SELECT
                p.id,
                p.statement,
                p.category_id,
                p.location_id,
                p.agree_count,
                p.disagree_count,
                p.pass_count,
                p.creator_user_id,
                c.label AS category_label,
                l.name AS location_name,
                l.code AS location_code,
                1 - (p.embedding <=> %s::vector) AS similarity
            FROM position p
            LEFT JOIN position_category c ON p.category_id = c.id
            LEFT JOIN location l ON p.location_id = l.id
            WHERE p.status = 'active'
              AND p.embedding IS NOT NULL
              AND (1 - (p.embedding <=> %s::vector)) >= 0.5
              AND {location_filter}
            ORDER BY p.embedding <=> %s::vector
            LIMIT %s OFFSET %s
        """
        params = (embedding, embedding, location_id, embedding, limit, offset)
    else:
        # Text fallback: ILIKE search
        like_pattern = f"%{query}%"
        sql = f"""
            SELECT
                p.id,
                p.statement,
                p.category_id,
                p.location_id,
                p.agree_count,
                p.disagree_count,
                p.pass_count,
                p.creator_user_id,
                c.label AS category_label,
                l.name AS location_name,
                l.code AS location_code,
                NULL AS similarity
            FROM position p
            LEFT JOIN position_category c ON p.category_id = c.id
            LEFT JOIN location l ON p.location_id = l.id
            WHERE p.status = 'active'
              AND p.statement ILIKE %s
              AND {location_filter}
            ORDER BY p.agree_count DESC
            LIMIT %s OFFSET %s
        """
        params = (like_pattern, location_id, limit, offset)

    positions = db.execute_query(sql, params)
    if positions is None:
        return ErrorModel(500, "Database error"), 500

    # Get closure counts for all results
    position_ids = [str(p["id"]) for p in positions]
    closure_counts = {}
    if position_ids:
        placeholders = ",".join(["%s"] * len(position_ids))
        counts = db.execute_query(f"""
            SELECT up.position_id, COUNT(cl.id) as closure_count
            FROM chat_log cl
            JOIN chat_request cr ON cl.chat_request_id = cr.id
            JOIN user_position up ON cr.user_position_id = up.id
            WHERE up.position_id IN ({placeholders})
              AND cl.end_type = 'agreed_closure'
              AND cl.status != 'deleted'
            GROUP BY up.position_id
        """, tuple(position_ids))
        for row in (counts or []):
            closure_counts[str(row["position_id"])] = row["closure_count"]

    # Build GroupPosition-shaped results
    results = []
    for p in positions:
        total = p["agree_count"] + p["disagree_count"] + p["pass_count"]
        if total > 0:
            vote_dist = {
                "agree": round(p["agree_count"] / total, 3),
                "disagree": round(p["disagree_count"] / total, 3),
                "pass": round(p["pass_count"] / total, 3)
            }
        else:
            vote_dist = {"agree": 0, "disagree": 0, "pass": 0}

        creator = None
        if p.get("creator_user_id"):
            creator_user = _get_user_card(p["creator_user_id"])
            if creator_user:
                creator = creator_user.to_dict()

        result = {
            "id": str(p["id"]),
            "statement": p["statement"],
            "category": {
                "id": str(p["category_id"]) if p.get("category_id") else None,
                "label": p.get("category_label", "Uncategorized")
            } if p.get("category_label") else None,
            "location": {
                "id": str(p["location_id"]) if p.get("location_id") else None,
                "name": p.get("location_name", "Unknown"),
                "code": p.get("location_code", "")
            } if p.get("location_name") else None,
            "creator": creator,
            "groupId": None,
            "voteDistribution": vote_dist,
            "totalVotes": total,
            "groupVotes": {},
            "isDefining": False,
            "representativeness": 0,
            "consensusType": None,
            "consensusScore": None,
            "closureCount": closure_counts.get(str(p["id"]), 0),
        }

        if use_meaning and p.get("similarity") is not None:
            result["similarity"] = round(float(p["similarity"]), 4)

        results.append(result)

    return {
        "results": results,
        "hasMore": len(results) == limit,
    }, 200


def get_position_agreed_closures(position_id, token_info=None):  # noqa: E501
    """Get all agreed closures for chats about a position.

    Returns all chats that ended with an agreed closure for the specified position,
    along with user info, kudos status, and opinion group assignments.

    :param position_id: ID of the position
    :type position_id: str
    :param token_info: JWT token info from authentication

    :rtype: Union[Dict, Tuple[ErrorModel, int]]
    """
    authorized, auth_err = authorization_allow_banned("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    # Get position info
    position = db.execute_query("""
        SELECT
            p.id,
            p.statement,
            p.category_id,
            p.location_id,
            c.label as category_label,
            l.code as location_code,
            l.name as location_name,
            p.creator_user_id,
            u.display_name as creator_display_name,
            u.user_type as creator_user_type,
            u.trust_score as creator_trust_score,
            u.avatar_url as creator_avatar_url,
            u.avatar_icon_url as creator_avatar_icon_url,
            COALESCE((
                SELECT COUNT(*) FROM kudos k
                WHERE k.receiver_user_id = u.id AND k.status = 'sent'
            ), 0) as creator_kudos_count
        FROM position p
        LEFT JOIN position_category c ON p.category_id = c.id
        LEFT JOIN location l ON p.location_id = l.id
        LEFT JOIN users u ON p.creator_user_id = u.id
        WHERE p.id = %s AND p.status = 'active'
    """, (position_id,), fetchone=True)

    if not position:
        return ErrorModel(404, "Position not found"), 404

    # Get all agreed closures for this position
    # Join through: chat_log -> chat_request -> user_position -> position
    closures_raw = db.execute_query("""
        SELECT
            cl.id as chat_log_id,
            cl.log,
            cl.end_time,
            cr.initiator_user_id,
            up.user_id as position_holder_user_id,
            -- Position holder user info
            ph.display_name as ph_display_name,
            ph.username as ph_username,
            ph.avatar_url as ph_avatar_url,
            ph.avatar_icon_url as ph_avatar_icon_url,
            ph.trust_score as ph_trust_score,
            COALESCE((
                SELECT COUNT(*) FROM kudos k
                WHERE k.receiver_user_id = ph.id AND k.status = 'sent'
            ), 0) as ph_kudos_count,
            -- Initiator user info
            iu.display_name as iu_display_name,
            iu.username as iu_username,
            iu.avatar_url as iu_avatar_url,
            iu.avatar_icon_url as iu_avatar_icon_url,
            iu.trust_score as iu_trust_score,
            COALESCE((
                SELECT COUNT(*) FROM kudos k
                WHERE k.receiver_user_id = iu.id AND k.status = 'sent'
            ), 0) as iu_kudos_count,
            -- Kudos sent status
            EXISTS(
                SELECT 1 FROM kudos k
                WHERE k.chat_log_id = cl.id
                  AND k.sender_user_id = up.user_id
                  AND k.receiver_user_id = cr.initiator_user_id
                  AND k.status = 'sent'
            ) as ph_sent_kudos,
            EXISTS(
                SELECT 1 FROM kudos k
                WHERE k.chat_log_id = cl.id
                  AND k.sender_user_id = cr.initiator_user_id
                  AND k.receiver_user_id = up.user_id
                  AND k.status = 'sent'
            ) as iu_sent_kudos
        FROM chat_log cl
        JOIN chat_request cr ON cl.chat_request_id = cr.id
        JOIN user_position up ON cr.user_position_id = up.id
        JOIN users ph ON up.user_id = ph.id
        JOIN users iu ON cr.initiator_user_id = iu.id
        WHERE up.position_id = %s
          AND cl.end_type = 'agreed_closure'
          AND cl.status != 'deleted'
        ORDER BY cl.end_time DESC
    """, (position_id,))

    if closures_raw is None:
        closures_raw = []

    # Get Polis groups for this position's location/category
    groups = []
    polis_conv_id = None
    math_data = None

    # Also get location-wide (all categories) Polis data
    all_categories_groups = []
    all_categories_conv_id = None
    all_categories_math_data = None

    if config.POLIS_ENABLED:
        conversation = get_oldest_active_conversation(
            position['location_id'],
            position['category_id']
        )
        if conversation:
            polis_conv_id = conversation["polis_conversation_id"]
            try:
                client = get_client()
                math_data = client.get_math_data(polis_conv_id)
                if math_data:
                    groups = _extract_groups_for_closures(math_data, polis_conv_id)
            except PolisError as e:
                print(f"Polis error getting groups: {e}", flush=True)

        # Fetch location-wide conversation (all categories)
        all_conv = get_oldest_active_conversation(
            position['location_id'],
            None
        )
        if all_conv and all_conv["polis_conversation_id"] != polis_conv_id:
            all_categories_conv_id = all_conv["polis_conversation_id"]
            try:
                all_client = get_client()
                all_categories_math_data = all_client.get_math_data(all_categories_conv_id)
                if all_categories_math_data:
                    all_categories_groups = _extract_groups_for_closures(all_categories_math_data, all_categories_conv_id)
            except PolisError as e:
                print(f"Polis error getting all-categories groups: {e}", flush=True)

    # Process closures and add group info
    closures = []
    for closure in closures_raw:
        log = closure.get('log') or {}
        agreed_closure = log.get('agreedClosure') if isinstance(log.get('agreedClosure'), dict) else None
        agreed_positions = log.get('agreedPositions', [])

        # Determine mutual kudos
        mutual_kudos = closure['ph_sent_kudos'] and closure['iu_sent_kudos']

        # Get user Polis info
        ph_polis_info = _get_user_polis_info(
            closure['position_holder_user_id'],
            polis_conv_id,
            math_data,
            groups
        ) if math_data else {'group': None, 'position': None}

        iu_polis_info = _get_user_polis_info(
            closure['initiator_user_id'],
            polis_conv_id,
            math_data,
            groups
        ) if math_data else {'group': None, 'position': None}

        # Get all-categories map positions
        ph_all_polis = _get_user_polis_info(
            closure['position_holder_user_id'],
            all_categories_conv_id,
            all_categories_math_data,
            all_categories_groups
        ) if all_categories_math_data else {'group': None, 'position': None}

        iu_all_polis = _get_user_polis_info(
            closure['initiator_user_id'],
            all_categories_conv_id,
            all_categories_math_data,
            all_categories_groups
        ) if all_categories_math_data else {'group': None, 'position': None}

        # Determine if cross-group (users in different groups)
        cross_group = (
            ph_polis_info['group'] is not None
            and iu_polis_info['group'] is not None
            and ph_polis_info['group']['id'] != iu_polis_info['group']['id']
        )

        closures.append({
            'chatLogId': str(closure['chat_log_id']),
            'closureText': agreed_closure,
            'closedAt': closure['end_time'].isoformat() if closure['end_time'] else None,
            'hasAgreedStatements': len(agreed_positions) > 0,
            'mutualKudos': mutual_kudos,
            'crossGroup': cross_group,
            'positionHolderUser': {
                'id': str(closure['position_holder_user_id']),
                'displayName': closure['ph_display_name'] or 'Anonymous',
                'username': closure['ph_username'],
                'avatarUrl': closure['ph_avatar_url'],
                'avatarIconUrl': closure['ph_avatar_icon_url'],
                'trustScore': float(closure['ph_trust_score']) if closure['ph_trust_score'] else None,
                'kudosCount': closure['ph_kudos_count'],
                'sentKudos': closure['ph_sent_kudos'],
                'opinionGroup': ph_polis_info['group'],
                'mapPosition': ph_polis_info['position'],
                'allCategoriesMapPosition': ph_all_polis['position'],
            },
            'initiatorUser': {
                'id': str(closure['initiator_user_id']),
                'displayName': closure['iu_display_name'] or 'Anonymous',
                'username': closure['iu_username'],
                'avatarUrl': closure['iu_avatar_url'],
                'avatarIconUrl': closure['iu_avatar_icon_url'],
                'trustScore': float(closure['iu_trust_score']) if closure['iu_trust_score'] else None,
                'kudosCount': closure['iu_kudos_count'],
                'sentKudos': closure['iu_sent_kudos'],
                'opinionGroup': iu_polis_info['group'],
                'mapPosition': iu_polis_info['position'],
                'allCategoriesMapPosition': iu_all_polis['position'],
            },
        })

    # Sort closures by priority:
    # 1. mutual_kudos AND cross_group (highest value)
    # 2. cross_group only
    # 3. mutual_kudos only
    # 4. by date (already sorted by end_time DESC)
    def closure_sort_key(c):
        score = 0
        if c['mutualKudos'] and c['crossGroup']:
            score = 3
        elif c['crossGroup']:
            score = 2
        elif c['mutualKudos']:
            score = 1
        return -score  # Negative for descending

    closures.sort(key=closure_sort_key)

    # Build creator info
    creator = None
    if position.get('creator_user_id'):
        creator = {
            'id': str(position['creator_user_id']),
            'displayName': position.get('creator_display_name', 'Anonymous'),
            'userType': position.get('creator_user_type', 'normal'),
            'trustScore': float(position.get('creator_trust_score', 0) or 0),
            'avatarUrl': position.get('creator_avatar_url'),
            'avatarIconUrl': position.get('creator_avatar_icon_url'),
            'kudosCount': position.get('creator_kudos_count', 0),
        }

    # Build response
    response = {
        'position': {
            'id': str(position['id']),
            'statement': position['statement'],
            'category': {
                'id': str(position['category_id']) if position['category_id'] else None,
                'label': position['category_label'],
            } if position['category_label'] else None,
            'location': {
                'id': str(position['location_id']) if position['location_id'] else None,
                'code': position['location_code'],
                'name': position['location_name'],
            } if position['location_name'] else None,
            'creator': creator,
        },
        'groups': groups,
        'allCategoriesGroups': all_categories_groups,
        'closures': closures,
    }

    return response, 200


def _extract_groups_for_closures(math_data: Dict[str, Any], polis_conv_id: str = None) -> List[Dict]:
    """Extract opinion groups from Polis math data (simplified version for closures).

    Returns groups with id, label, labelRankings, memberCount, hull, and centroid.
    """
    groups = []

    pca_wrapper = math_data.get("pca", {})
    pca_data = pca_wrapper.get("asPOJO", {}) if isinstance(pca_wrapper, dict) else {}

    group_clusters = pca_data.get("group-clusters", [])
    base_clusters = pca_data.get("base-clusters", {})

    base_x = base_clusters.get("x", [])
    base_y = base_clusters.get("y", [])
    base_ids = base_clusters.get("id", [])

    # Create mapping from member ID to coordinates
    id_to_coords = {}
    for i, member_id in enumerate(base_ids):
        if i < len(base_x) and i < len(base_y):
            id_to_coords[member_id] = (base_x[i], base_y[i])

    labels = ["A", "B", "C", "D", "E", "F", "G", "H"]

    # Get custom labels from pairwise surveys if available
    custom_labels = {}
    if polis_conv_id:
        try:
            custom_labels = _get_cached_group_labels(polis_conv_id, math_data)
        except Exception:
            pass

    for i, cluster in enumerate(group_clusters):
        if not cluster:
            continue

        group_id = str(i)
        label = labels[i] if i < len(labels) else f"Group {i+1}"
        label_info = custom_labels.get(group_id, {})
        label_rankings = label_info.get("rankings") if label_info else None
        members = cluster.get("members", [])
        member_count = len(members)

        if member_count == 0:
            continue

        # Extract positions for hull
        member_positions = []
        for member_id in members:
            if member_id in id_to_coords:
                x, y = id_to_coords[member_id]
                if x is not None and y is not None:
                    member_positions.append({"x": x, "y": y})

        # Compute hull
        hull = _compute_convex_hull(member_positions)

        # Get centroid
        polis_center = cluster.get("center", [])
        if polis_center and len(polis_center) >= 2:
            centroid = {"x": round(polis_center[0], 4), "y": round(polis_center[1], 4)}
        else:
            centroid = _compute_centroid(member_positions)

        groups.append({
            'id': group_id,
            'label': label,
            'labelRankings': label_rankings,
            'memberCount': member_count,
            'hull': hull,
            'centroid': centroid,
        })

    return groups


def _get_user_polis_info(
    user_id: str,
    polis_conv_id: Optional[str],
    math_data: Optional[Dict],
    groups: List[Dict]
) -> Dict[str, Any]:
    """Get a user's Polis group and map position.

    Returns {'group': {'id': str, 'label': str} or None, 'position': {'x': float, 'y': float} or None}
    """
    if not polis_conv_id or not math_data:
        return {'group': None, 'position': None}

    # Get user's polis_pid
    participant = db.execute_query("""
        SELECT polis_pid FROM polis_participant
        WHERE polis_conversation_id = %s AND user_id = %s
    """, (polis_conv_id, user_id), fetchone=True)

    if not participant or participant.get('polis_pid') is None:
        return {'group': None, 'position': None}

    pid = participant['polis_pid']

    pca_wrapper = math_data.get("pca", {})
    pca_data = pca_wrapper.get("asPOJO", {}) if isinstance(pca_wrapper, dict) else {}

    # Find user in base-clusters
    base_clusters = pca_data.get("base-clusters", {})
    base_x = base_clusters.get("x", [])
    base_y = base_clusters.get("y", [])
    base_members = base_clusters.get("members", [])

    x, y = None, None
    for i, member_list in enumerate(base_members):
        if pid in member_list:
            if i < len(base_x) and i < len(base_y):
                x = base_x[i]
                y = base_y[i]
            break

    position = {'x': float(x), 'y': float(y)} if x is not None and y is not None else None

    # Find user's group
    group_info = None
    group_clusters = pca_data.get("group-clusters", [])
    labels = ["A", "B", "C", "D", "E", "F", "G", "H"]

    for gid, cluster in enumerate(group_clusters):
        if cluster:
            members = cluster.get("members", [])
            if pid in members:
                group_info = {
                    'id': str(gid),
                    'label': labels[gid] if gid < len(labels) else f"Group {gid + 1}"
                }
                break

    return {'group': group_info, 'position': position}


def _compute_convex_hull(points: List[Dict[str, float]]) -> List[Dict[str, float]]:
    """Compute the convex hull of a set of 2D points using Graham scan."""
    import math

    if len(points) < 3:
        return points

    def bottom_left(p):
        return (p["y"], p["x"])

    points = sorted(points, key=bottom_left)
    start = points[0]

    def polar_angle(p):
        dx = p["x"] - start["x"]
        dy = p["y"] - start["y"]
        return math.atan2(dy, dx)

    rest = sorted(points[1:], key=polar_angle)
    hull = [start]

    for p in rest:
        while len(hull) > 1:
            o = hull[-2]
            a = hull[-1]
            cross = (a["x"] - o["x"]) * (p["y"] - o["y"]) - (a["y"] - o["y"]) * (p["x"] - o["x"])
            if cross <= 0:
                hull.pop()
            else:
                break
        hull.append(p)

    return hull


def _compute_centroid(points: List[Dict[str, float]]) -> Dict[str, float]:
    """Compute the centroid of a set of points."""
    if not points:
        return {"x": 0, "y": 0}

    x_sum = sum(p["x"] for p in points)
    y_sum = sum(p["y"] for p in points)
    n = len(points)

    return {
        "x": round(x_sum / n, 4),
        "y": round(y_sum / n, 4)
    }
