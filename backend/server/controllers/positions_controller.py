import connexion
from typing import Dict, List
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

from candid.controllers import db
from candid.controllers.helpers.config import Config
from candid.controllers.helpers.auth import authorization, token_to_user
from candid.controllers.helpers import polis_sync
from candid.controllers.helpers import nlp

from camel_converter import dict_to_camel
import uuid

def _get_user_card(user_id):
    user = db.execute_query("""
        SELECT
            display_name,
            id,
            status,
            username
        FROM users
        WHERE id = %s
    """, (user_id,), fetchone=True)
    if user is not None:
        return User.from_dict(dict_to_camel(user))
    return None

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
    ret = Position.from_dict(dict_to_camel(position))

    ret.creator = user

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
            l.name AS location_name
        FROM user_position AS up
        JOIN position AS p ON up.position_id = p.id
        LEFT JOIN position_category AS c ON p.category_id = c.id
        LEFT JOIN location AS l ON p.location_id = l.id
        WHERE up.id = %s
    """, (user_position_id,), fetchone=True)

    return UserPosition.from_dict(dict_to_camel(ret)), 201


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
    """]
    params = [Config.TIMESTAMP_FORMAT, embedding, user.id, user.id, user.id]

    # Add optional category filter
    if category_id:
        query_parts.append("AND p.category_id = %s")
        params.append(category_id)

    # Add optional location filter (include parent locations)
    if location_id:
        query_parts.append("""
            AND p.location_id IN (
                WITH RECURSIVE location_hierarchy AS (
                    SELECT id, parent_location_id FROM location WHERE id = %s
                    UNION ALL
                    SELECT l.id, l.parent_location_id
                    FROM location l
                    JOIN location_hierarchy lh ON l.id = lh.parent_location_id
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
                'name': pos['category_name']
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
