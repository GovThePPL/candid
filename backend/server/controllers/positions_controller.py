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
    # Check that user in in location, create user_position as well
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
    return 'do some magic!'
