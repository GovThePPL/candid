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

from candid.controllers.helpers import auth
from candid.controllers import db


def _get_kudos_count(user_id):
    """Get the number of kudos received by a user."""
    result = db.execute_query("""
        SELECT COUNT(*) as count
        FROM kudos
        WHERE receiver_user_id = %s AND status = 'sent'
    """, (user_id,), fetchone=True)
    return result['count'] if result else 0


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

    login_info = auth.get_login_info(login_user_request.username)
    if not login_info:
        # username not found
        return ErrorModel(401, "Unauthorized"), 401
    if not login_info["password_hash"]:
        # account has no password (e.g. guest users)
        return ErrorModel(401, "Unauthorized"), 401
    correct_pw = auth.does_password_match(login_user_request.password, login_info["password_hash"])
    if correct_pw:
        token = auth.create_token(login_info["id"])
        ret = LoginUser200Response.from_dict({"token": token})
        kudos_count = _get_kudos_count(login_info["id"])
        current_user = CurrentUser.from_dict({
            "id": str(login_info["id"]),
            "username": login_info["username"],
            "displayName": login_info["display_name"],
            "userType": login_info["user_type"],
            "status": login_info["status"],
            "kudosCount": kudos_count,
            "trustScore": float(login_info["trust_score"]) if login_info.get("trust_score") is not None else None,
            "avatarUrl": login_info.get("avatar_url"),
            "avatarIconUrl": login_info.get("avatar_icon_url"),
        })
        ret.user = current_user
        return ret
    else:
        return ErrorModel(401, "Unauthorized"), 401


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

    username = register_user_request.username
    display_name = register_user_request.display_name
    password = register_user_request.password
    email = register_user_request.email  # optional

    # Check username uniqueness
    existing = db.execute_query(
        "SELECT id FROM users WHERE username = %s",
        (username,), fetchone=True
    )
    if existing:
        return ErrorModel(400, "Username already exists"), 400

    # Check email uniqueness if provided
    if email:
        existing_email = db.execute_query(
            "SELECT id FROM users WHERE email = %s",
            (email,), fetchone=True
        )
        if existing_email:
            return ErrorModel(400, "Email already exists"), 400

    # Hash password
    password_hash = auth.hash_password(password)

    # Generate UUID and insert user
    import uuid
    user_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO users (id, username, email, password_hash, display_name)
        VALUES (%s, %s, %s, %s, %s)
    """, (user_id, username, email, password_hash, display_name))

    # Fetch and return created user
    user = db.execute_query("""
        SELECT id, username, display_name, email, user_type, status, created_time
        FROM users WHERE id = %s
    """, (user_id,), fetchone=True)

    return CurrentUser.from_dict({
        'id': str(user['id']),
        'username': user['username'],
        'displayName': user['display_name'],
        'email': user['email'],
        'userType': user['user_type'],
        'status': user['status'],
    }), 201
