import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from candid.models.create_position_request import CreatePositionRequest  # noqa: E501
from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.position import Position  # noqa: E501
from candid.models.user import User
from candid.models.position_response import PositionResponse  # noqa: E501
from candid.models.response import Response  # noqa: E501
from candid import util

from candid.controllers import db
from candid.controllers.helpers.config import Config
from candid.controllers.helpers.auth import authorization, token_to_user
from candid.controllers.helpers import polis_sync

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
    # TODO: Check that user in in location
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
