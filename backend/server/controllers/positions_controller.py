import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from candid.models.create_position_request import CreatePositionRequest  # noqa: E501
from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.position import Position  # noqa: E501
from candid.models.position_response import PositionResponse  # noqa: E501
from candid.models.response import Response  # noqa: E501
from candid import util


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


def get_position_by_id(position_id):  # noqa: E501
    """Get a specific position statement

     # noqa: E501

    :param position_id: 
    :type position_id: str
    :type position_id: str

    :rtype: Union[Position, Tuple[Position, int], Tuple[Position, int, Dict[str, str]]
    """
    return 'do some magic!'


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
