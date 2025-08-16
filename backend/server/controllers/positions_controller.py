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

from candid.controllers.helpers.database import execute_query
from candid.controllers.helpers.config import Config
from candid.controllers.helpers.auth import authorization

def get_user_card(user_id):
    res = execute_query(f"""
        SELECT
            display_name as "displayName", 
            id,
            status,
            username
        FROM users
        WHERE id = '{user_id}'
        LIMIT 1;
    """)
    if res is not None:
        return res[0]
    return None

def create_position(body):  # noqa: E501
    """Create a new position statement

     # noqa: E501

    :param create_position_request: 
    :type create_position_request: dict | bytes

    :rtype: Union[Position, Tuple[Position, int], Tuple[Position, int, Dict[str, str]]
    """
    create_position_request = body
    if connexion.request.is_json:
        create_position_request = CreatePositionRequest.from_dict(connexion.request.get_json())  # noqa: E501    
    return 'do some magic!'

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

    res = execute_query(f"""
        SELECT 
            agree_count as "agreeCount",
            category_id as "categoryId",
            chat_count as "chatCount",
            TO_CHAR(created_time, '{Config.TIMESTAMP_FORMAT}') as "createdTime",
            disagree_count as "disagreeCount",
            creator_user_id,
            id,
            pass_count as "passCount",
            statement,
            status
        FROM position as p 
        WHERE p.id = '{position_id}'
        LIMIT 1;
    """)
    if res is None:
        return ErrorModel(404, "Not Found"), 404
    pos = res[0]
    
    user = User.from_dict(get_user_card(pos['creator_user_id']))
    position = Position.from_dict(pos)

    position.creator = user

    return position


def respond_to_positions(body):  # noqa: E501
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
