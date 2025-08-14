import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.get_moderation_queue200_response_inner import GetModerationQueue200ResponseInner  # noqa: E501
from candid.models.mod_action import ModAction  # noqa: E501
from candid.models.mod_action_appeal_response import ModActionAppealResponse  # noqa: E501
from candid.models.mod_action_request import ModActionRequest  # noqa: E501
from candid.models.report import Report  # noqa: E501
from candid.models.report_position_request import ReportPositionRequest  # noqa: E501
from candid.models.respond_to_appeal_request import RespondToAppealRequest  # noqa: E501
from candid import util


def get_moderation_queue():  # noqa: E501
    """Get unified moderation queue with all items requiring moderator attention

     # noqa: E501


    :rtype: Union[List[GetModerationQueue200ResponseInner], Tuple[List[GetModerationQueue200ResponseInner], int], Tuple[List[GetModerationQueue200ResponseInner], int, Dict[str, str]]
    """
    return 'do some magic!'


def report_chat(chat_id, body):  # noqa: E501
    """Report a chat

     # noqa: E501

    :param chat_id: 
    :type chat_id: str
    :type chat_id: str
    :param report_position_request: 
    :type report_position_request: dict | bytes

    :rtype: Union[Report, Tuple[Report, int], Tuple[Report, int, Dict[str, str]]
    """
    report_position_request = body
    if connexion.request.is_json:
        report_position_request = ReportPositionRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'


def report_position(position_id, body):  # noqa: E501
    """Report a position statement

     # noqa: E501

    :param position_id: 
    :type position_id: str
    :type position_id: str
    :param report_position_request: 
    :type report_position_request: dict | bytes

    :rtype: Union[Report, Tuple[Report, int], Tuple[Report, int, Dict[str, str]]
    """
    report_position_request = body
    if connexion.request.is_json:
        report_position_request = ReportPositionRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'


def respond_to_appeal(appeal_id, body):  # noqa: E501
    """Respond to a moderation appeal

     # noqa: E501

    :param appeal_id: 
    :type appeal_id: str
    :type appeal_id: str
    :param respond_to_appeal_request: 
    :type respond_to_appeal_request: dict | bytes

    :rtype: Union[ModActionAppealResponse, Tuple[ModActionAppealResponse, int], Tuple[ModActionAppealResponse, int, Dict[str, str]]
    """
    respond_to_appeal_request = body
    if connexion.request.is_json:
        respond_to_appeal_request = RespondToAppealRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'


def take_moderator_action(report_id, body):  # noqa: E501
    """Take action on a report

     # noqa: E501

    :param report_id: 
    :type report_id: str
    :type report_id: str
    :param mod_action_request: 
    :type mod_action_request: dict | bytes

    :rtype: Union[ModAction, Tuple[ModAction, int], Tuple[ModAction, int, Dict[str, str]]
    """
    mod_action_request = body
    if connexion.request.is_json:
        mod_action_request = ModActionRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'
