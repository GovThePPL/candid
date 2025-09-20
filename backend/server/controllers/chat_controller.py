import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from candid.models.chat_request import ChatRequest  # noqa: E501
from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.get_chat_log200_response import GetChatLog200Response  # noqa: E501
from candid.models.get_user_chats200_response_inner import GetUserChats200ResponseInner  # noqa: E501
from candid.models.kudos import Kudos  # noqa: E501
from candid import util

from candid.controllers import db
from candid.controllers.helpers.config import Config
from candid.controllers.helpers.auth import authorization, token_to_user

from camel_converter import dict_to_camel
import uuid

def create_chat_request(body):  # noqa: E501
    """Request to chat about a position statement

     # noqa: E501

    :param chat_request:
    :type chat_request: dict | bytes

    :rtype: Union[ChatRequest, Tuple[ChatRequest, int], Tuple[ChatRequest, int, Dict[str, str]]
    """
    chat_request = body
    if connexion.request.is_json:
        chat_request = ChatRequest.from_dict(connexion.request.get_json())  # noqa: E501

    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    #

    return 'do some magic!'


def get_chat_log(chat_id):  # noqa: E501
    """Get JSON blob of a chat log

    Retrieves a complete JSON blob of a chat log.  # noqa: E501

    :param chat_id:
    :type chat_id: str
    :type chat_id: str

    :rtype: Union[GetChatLog200Response, Tuple[GetChatLog200Response, int], Tuple[GetChatLog200Response, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    return 'do some magic!'


def get_user_chats(user_id, position_id=None, limit=None, offset=None):  # noqa: E501
    """Get a list of the user&#39;s historical chats

     # noqa: E501

    :param user_id:
    :type user_id: str
    :type user_id: str
    :param position_id: Filter chats by position ID
    :type position_id: str
    :type position_id: str
    :param limit: Maximum number of chats to return
    :type limit: int
    :param offset: Number of chats to skip
    :type offset: int

    :rtype: Union[List[GetUserChats200ResponseInner], Tuple[List[GetUserChats200ResponseInner], int], Tuple[List[GetUserChats200ResponseInner], int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    return 'do some magic!'


def rescind_chat_request(request_id):  # noqa: E501
    """Rescind a chat request

     # noqa: E501

    :param request_id:
    :type request_id: str
    :type request_id: str

    :rtype: Union[ChatRequest, Tuple[ChatRequest, int], Tuple[ChatRequest, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    return 'do some magic!'


def respond_to_chat_request(request_id, body):  # noqa: E501
    """Respond to a chat request

     # noqa: E501

    :param request_id:
    :type request_id: str
    :type request_id: str
    :param chat_request:
    :type chat_request: dict | bytes

    :rtype: Union[ChatRequest, Tuple[ChatRequest, int], Tuple[ChatRequest, int, Dict[str, str]]
    """
    chat_request = body
    if connexion.request.is_json:
        chat_request = ChatRequest.from_dict(connexion.request.get_json())  # noqa: E501

    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    return 'do some magic!'


def send_kudos(chat_id):  # noqa: E501
    """Send kudos to a user after a chat

     # noqa: E501

    :param chat_id:
    :type chat_id: str
    :type chat_id: str

    :rtype: Union[Kudos, Tuple[Kudos, int], Tuple[Kudos, int, Dict[str, str]]
    """

    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    return 'do some magic!'
