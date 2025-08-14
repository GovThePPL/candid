import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from candid.models.current_user import CurrentUser  # noqa: E501
from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.login_user200_response import LoginUser200Response  # noqa: E501
from candid.models.login_user_request import LoginUserRequest  # noqa: E501
from candid.models.login_with_google_request import LoginWithGoogleRequest  # noqa: E501
from candid.models.register_user_request import RegisterUserRequest  # noqa: E501
from candid import util


def login_user(body):  # noqa: E501
    """Log in a user

     # noqa: E501

    :param login_user_request: 
    :type login_user_request: dict | bytes

    :rtype: Union[LoginUser200Response, Tuple[LoginUser200Response, int], Tuple[LoginUser200Response, int, Dict[str, str]]
    """
    login_user_request = body
    if connexion.request.is_json:
        login_user_request = LoginUserRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'


def login_with_facebook(body):  # noqa: E501
    """Log in or register with Facebook

     # noqa: E501

    :param login_with_google_request: 
    :type login_with_google_request: dict | bytes

    :rtype: Union[LoginUser200Response, Tuple[LoginUser200Response, int], Tuple[LoginUser200Response, int, Dict[str, str]]
    """
    login_with_google_request = body
    if connexion.request.is_json:
        login_with_google_request = LoginWithGoogleRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'


def login_with_google(body):  # noqa: E501
    """Log in or register with Google

     # noqa: E501

    :param login_with_google_request: 
    :type login_with_google_request: dict | bytes

    :rtype: Union[LoginUser200Response, Tuple[LoginUser200Response, int], Tuple[LoginUser200Response, int, Dict[str, str]]
    """
    login_with_google_request = body
    if connexion.request.is_json:
        login_with_google_request = LoginWithGoogleRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'


def register_user(body):  # noqa: E501
    """Register a new user

     # noqa: E501

    :param register_user_request: 
    :type register_user_request: dict | bytes

    :rtype: Union[CurrentUser, Tuple[CurrentUser, int], Tuple[CurrentUser, int, Dict[str, str]]
    """
    register_user_request = body
    if connexion.request.is_json:
        register_user_request = RegisterUserRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'
