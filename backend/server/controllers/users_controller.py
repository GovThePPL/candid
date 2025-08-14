import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from candid.models.current_user import CurrentUser  # noqa: E501
from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.get_user_chats200_response_inner import GetUserChats200ResponseInner  # noqa: E501
from candid.models.update_user_profile_request import UpdateUserProfileRequest  # noqa: E501
from candid.models.user import User  # noqa: E501
from candid.models.user_demographics import UserDemographics  # noqa: E501
from candid.models.user_position import UserPosition  # noqa: E501
from candid.models.user_settings import UserSettings  # noqa: E501
from candid import util


def get_current_user():  # noqa: E501
    """Get current user profile

     # noqa: E501


    :rtype: Union[CurrentUser, Tuple[CurrentUser, int], Tuple[CurrentUser, int, Dict[str, str]]
    """
    return 'do some magic!'


def get_current_user_positions(status=None):  # noqa: E501
    """Get current user&#39;s position statements

     # noqa: E501

    :param status: 
    :type status: str

    :rtype: Union[List[UserPosition], Tuple[List[UserPosition], int], Tuple[List[UserPosition], int, Dict[str, str]]
    """
    return 'do some magic!'


def get_user_by_id(user_id):  # noqa: E501
    """Get a user by ID

     # noqa: E501

    :param user_id: ID of the user to retrieve
    :type user_id: str
    :type user_id: str

    :rtype: Union[User, Tuple[User, int], Tuple[User, int, Dict[str, str]]
    """
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
    return 'do some magic!'


def get_user_demographics():  # noqa: E501
    """Get current user demographics

     # noqa: E501


    :rtype: Union[UserDemographics, Tuple[UserDemographics, int], Tuple[UserDemographics, int, Dict[str, str]]
    """
    return 'do some magic!'


def get_user_settings():  # noqa: E501
    """Get current user settings

     # noqa: E501


    :rtype: Union[UserSettings, Tuple[UserSettings, int], Tuple[UserSettings, int, Dict[str, str]]
    """
    return 'do some magic!'


def update_user_demographics(body):  # noqa: E501
    """Replace user demographics

     # noqa: E501

    :param user_demographics: 
    :type user_demographics: dict | bytes

    :rtype: Union[UserDemographics, Tuple[UserDemographics, int], Tuple[UserDemographics, int, Dict[str, str]]
    """
    user_demographics = body
    if connexion.request.is_json:
        user_demographics = UserDemographics.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'


def update_user_demographics_partial(body):  # noqa: E501
    """Update specific user demographics fields

     # noqa: E501

    :param user_demographics: 
    :type user_demographics: dict | bytes

    :rtype: Union[UserDemographics, Tuple[UserDemographics, int], Tuple[UserDemographics, int, Dict[str, str]]
    """
    user_demographics = body
    if connexion.request.is_json:
        user_demographics = UserDemographics.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'


def update_user_profile(body):  # noqa: E501
    """Update current user profile (only displayName and email)

     # noqa: E501

    :param update_user_profile_request: 
    :type update_user_profile_request: dict | bytes

    :rtype: Union[CurrentUser, Tuple[CurrentUser, int], Tuple[CurrentUser, int, Dict[str, str]]
    """
    update_user_profile_request = body
    if connexion.request.is_json:
        update_user_profile_request = UpdateUserProfileRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'


def update_user_settings(body):  # noqa: E501
    """Update current user settings

     # noqa: E501

    :param user_settings: 
    :type user_settings: dict | bytes

    :rtype: Union[UserSettings, Tuple[UserSettings, int], Tuple[UserSettings, int, Dict[str, str]]
    """
    user_settings = body
    if connexion.request.is_json:
        user_settings = UserSettings.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'
