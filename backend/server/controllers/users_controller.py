import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from candid.models.current_user import CurrentUser  # noqa: E501
from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.get_user_chats200_response_inner import GetUserChats200ResponseInner  # noqa: E501
from candid.models.position import Position  # noqa: E501
from candid.models.update_user_profile_request import UpdateUserProfileRequest  # noqa: E501
from candid.models.user import User  # noqa: E501
from candid.models.user_demographics import UserDemographics  # noqa: E501
from candid.models.user_position import UserPosition  # noqa: E501
from candid.models.user_settings import UserSettings  # noqa: E501
from candid.models.user_settings_category_weights_inner import UserSettingsCategoryWeightsInner  # noqa: E501
from candid import util

from candid.controllers import db
from candid.controllers.helpers.config import Config
from candid.controllers.helpers.auth import authorization, token_to_user

from camel_converter import dict_to_camel
import uuid

WEIGHT_TO_PRIORITY = {
    'none': 0,
    'least': 1,
    'less': 2,
    'default': 3,
    'more': 4,
    'most': 5,
}

PRIORITY_TO_WEIGHT = {v: k for k, v in WEIGHT_TO_PRIORITY.items()}

DEMOGRAPHICS_API_TO_DB = {
    'locationId': 'location_id',
    'lean': 'lean',
    'affiliation': 'affiliation_id',
    'education': 'education',
    'geoLocale': 'geo_locale',
    'race': 'race',
    'sex': 'sex',
}


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


def get_current_user(token_info=None):  # noqa: E501
    """Get current user profile

     # noqa: E501


    :rtype: Union[CurrentUser, Tuple[CurrentUser, int], Tuple[CurrentUser, int, Dict[str, str]]
    """

    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    current_user = db.execute_query("""
        SELECT
            display_name,
            email,
            id,
            status,
            trust_score,
            user_type,
            created_time,
            username
        FROM users
        WHERE id = %s
        """,
    (user.id,),
    fetchone=True)

    if current_user is None:
        return ErrorModel(404, "Not Found"), 404
    return CurrentUser.from_dict(dict_to_camel(current_user))


def get_current_user_positions(status='active', token_info=None):  # noqa: E501
    """Get current user&#39;s position statements

     # noqa: E501

    :param status:
    :type status: str

    :rtype: Union[List[UserPosition], Tuple[List[UserPosition], int], Tuple[List[UserPosition], int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    ret = db.execute_query("""
        SELECT
            up.agree_count,
            up.chat_count,
            up.disagree_count,
            up.pass_count,
            up.id,
            p.id AS position_id,
            up.status,
            p.statement,
            p.category_id,
            p.location_id,
            u.id AS user_id
        FROM users AS u
        JOIN user_position AS up ON u.id = up.user_id
        JOIN position AS p ON up.position_id = p.id
        WHERE u.id = %s AND p.status= %s
        """,
    (user.id, status))
    if ret == None:
        return ErrorModel(500, "Internal Server Error"), 500

    return [UserPosition.from_dict(dict_to_camel(p)) for p in ret]


def get_user_by_id(user_id, token_info=None):  # noqa: E501
    """Get a user by ID

     # noqa: E501

    :param user_id: ID of the user to retrieve
    :type user_id: str
    :type user_id: str

    :rtype: Union[User, Tuple[User, int], Tuple[User, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    ret = db.execute_query("""
        SELECT
            display_name,
            id,
            status,
            trust_score,
            username
        FROM users
        WHERE id = %s
        """,
    (user_id,), fetchone=True)

    return User.from_dict(dict_to_camel(ret))


def get_user_chats(user_id, position_id=None, limit=None, offset=None, token_info=None):  # noqa: E501
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

    if limit is None:
        limit = 20
    if offset is None:
        offset = 0

    query = """
        SELECT
            cl.id,
            cl.start_time,
            cl.end_time,
            cl.end_type,
            cr.initiator_user_id,
            up.user_id AS position_holder_user_id,
            up.position_id,
            p.statement,
            p.category_id,
            p.status AS position_status,
            p.agree_count,
            p.disagree_count,
            p.pass_count,
            p.chat_count,
            p.created_time AS position_created_time,
            p.creator_user_id
        FROM chat_log AS cl
        JOIN chat_request AS cr ON cl.chat_request_id = cr.id
        JOIN user_position AS up ON cr.user_position_id = up.id
        JOIN position AS p ON up.position_id = p.id
        WHERE (cr.initiator_user_id = %s OR up.user_id = %s)
    """
    params = [user_id, user_id]

    if position_id is not None:
        query += " AND up.position_id = %s"
        params.append(position_id)

    query += " ORDER BY cl.start_time DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    rows = db.execute_query(query, tuple(params))
    if rows is None:
        return ErrorModel(500, "Internal Server Error"), 500

    results = []
    for row in rows:
        # Determine the "other user"
        if str(row['initiator_user_id']) == str(user_id):
            other_user_id = row['position_holder_user_id']
        else:
            other_user_id = row['initiator_user_id']

        other_user = _get_user_card(other_user_id)
        position_creator = _get_user_card(row['creator_user_id'])

        position = Position.from_dict(dict_to_camel({
            'id': row['position_id'],
            'statement': row['statement'],
            'category_id': row['category_id'],
            'status': row['position_status'],
            'agree_count': row['agree_count'],
            'disagree_count': row['disagree_count'],
            'pass_count': row['pass_count'],
            'chat_count': row['chat_count'],
            'created_time': str(row['position_created_time']) if row['position_created_time'] else None,
        }))
        position.creator = position_creator

        chat_entry = GetUserChats200ResponseInner()
        chat_entry.id = str(row['id'])
        chat_entry.start_time = row['start_time']
        chat_entry.end_time = row['end_time']
        chat_entry.position = position
        chat_entry.other_user = other_user
        chat_entry.agreed_closure = None

        results.append(chat_entry)

    return results


def get_user_demographics(token_info=None):  # noqa: E501
    """Get current user demographics

     # noqa: E501


    :rtype: Union[UserDemographics, Tuple[UserDemographics, int], Tuple[UserDemographics, int, Dict[str, str]]
    """

    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    ret = db.execute_query("""
        SELECT
            location_id,
            lean,
            affiliation_id AS affiliation,
            education,
            geo_locale,
            race,
            sex,
            created_time
        FROM user_demographics
        WHERE user_id = %s
        """,
    (user.id,), fetchone=True)

    if ret == None:
        return None, 204
    if ret["created_time"]: # Constructor doesn't do this
        ret["created_time"] = str(ret["created_time"])
    return UserDemographics.from_dict(dict_to_camel(ret))


def get_user_settings(token_info=None):  # noqa: E501
    """Get current user settings

     # noqa: E501


    :rtype: Union[UserSettings, Tuple[UserSettings, int], Tuple[UserSettings, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    rows = db.execute_query("""
        SELECT position_category_id, priority
        FROM user_position_categories
        WHERE user_id = %s
        """,
    (user.id,))

    if rows is None:
        rows = []

    category_weights = []
    for row in rows:
        weight = PRIORITY_TO_WEIGHT.get(row['priority'], 'default')
        category_weights.append(UserSettingsCategoryWeightsInner(
            category_id=str(row['position_category_id']),
            weight=weight
        ))

    return UserSettings(category_weights=category_weights)


def update_user_demographics(body, token_info=None):  # noqa: E501
    """Replace user demographics

     # noqa: E501

    :param user_demographics:
    :type user_demographics: dict | bytes

    :rtype: Union[UserDemographics, Tuple[UserDemographics, int], Tuple[UserDemographics, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    user_demographics = body
    if connexion.request.is_json:
        user_demographics = UserDemographics.from_dict(connexion.request.get_json())

    db.execute_query("""
        INSERT INTO user_demographics (user_id, location_id, lean, affiliation_id, education, geo_locale, race, sex)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (user_id) DO UPDATE SET
            location_id = EXCLUDED.location_id,
            lean = EXCLUDED.lean,
            affiliation_id = EXCLUDED.affiliation_id,
            education = EXCLUDED.education,
            geo_locale = EXCLUDED.geo_locale,
            race = EXCLUDED.race,
            sex = EXCLUDED.sex,
            updated_time = CURRENT_TIMESTAMP
        """,
    (user.id,
     user_demographics.location_id,
     user_demographics.lean,
     user_demographics.affiliation,
     user_demographics.education,
     user_demographics.geo_locale,
     user_demographics.race,
     user_demographics.sex))

    ret = db.execute_query("""
        SELECT
            location_id,
            lean,
            affiliation_id AS affiliation,
            education,
            geo_locale,
            race,
            sex,
            created_time
        FROM user_demographics
        WHERE user_id = %s
        """,
    (user.id,), fetchone=True)

    if ret is None:
        return ErrorModel(500, "Internal Server Error"), 500
    if ret["created_time"]:
        ret["created_time"] = str(ret["created_time"])
    return UserDemographics.from_dict(dict_to_camel(ret))


def update_user_demographics_partial(body, token_info=None):  # noqa: E501
    """Update specific user demographics fields

     # noqa: E501

    :param user_demographics:
    :type user_demographics: dict | bytes

    :rtype: Union[UserDemographics, Tuple[UserDemographics, int], Tuple[UserDemographics, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    raw = connexion.request.get_json()

    # Map camelCase API fields to snake_case DB columns
    db_fields = {}
    for api_key, db_col in DEMOGRAPHICS_API_TO_DB.items():
        if api_key in raw:
            db_fields[db_col] = raw[api_key]

    if not db_fields:
        return ErrorModel(400, "No valid fields provided"), 400

    # Check if row exists
    existing = db.execute_query("""
        SELECT id FROM user_demographics WHERE user_id = %s
        """,
    (user.id,), fetchone=True)

    if existing is None:
        # INSERT with only provided fields
        columns = ['user_id'] + list(db_fields.keys())
        placeholders = ', '.join(['%s'] * len(columns))
        col_names = ', '.join(columns)
        values = [user.id] + list(db_fields.values())
        db.execute_query(
            f"INSERT INTO user_demographics ({col_names}) VALUES ({placeholders})",
            tuple(values))
    else:
        # UPDATE only provided fields
        set_clauses = [f"{col} = %s" for col in db_fields.keys()]
        set_clauses.append("updated_time = CURRENT_TIMESTAMP")
        set_str = ', '.join(set_clauses)
        values = list(db_fields.values()) + [user.id]
        db.execute_query(
            f"UPDATE user_demographics SET {set_str} WHERE user_id = %s",
            tuple(values))

    ret = db.execute_query("""
        SELECT
            location_id,
            lean,
            affiliation_id AS affiliation,
            education,
            geo_locale,
            race,
            sex,
            created_time
        FROM user_demographics
        WHERE user_id = %s
        """,
    (user.id,), fetchone=True)

    if ret is None:
        return ErrorModel(500, "Internal Server Error"), 500
    if ret["created_time"]:
        ret["created_time"] = str(ret["created_time"])
    return UserDemographics.from_dict(dict_to_camel(ret))


def update_user_profile(body, token_info=None):  # noqa: E501
    """Update current user profile (only displayName and email)

     # noqa: E501

    :param update_user_profile_request:
    :type update_user_profile_request: dict | bytes

    :rtype: Union[CurrentUser, Tuple[CurrentUser, int], Tuple[CurrentUser, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    update_user_profile_request = body
    if connexion.request.is_json:
        update_user_profile_request = UpdateUserProfileRequest.from_dict(connexion.request.get_json())

    set_clauses = []
    params = []

    if update_user_profile_request.display_name is not None:
        set_clauses.append("display_name = %s")
        params.append(update_user_profile_request.display_name)

    if update_user_profile_request.email is not None:
        set_clauses.append("email = %s")
        params.append(update_user_profile_request.email)

    if not set_clauses:
        return ErrorModel(400, "No fields provided to update"), 400

    set_clauses.append("updated_time = CURRENT_TIMESTAMP")
    set_str = ', '.join(set_clauses)
    params.append(user.id)

    db.execute_query(
        f"UPDATE users SET {set_str} WHERE id = %s",
        tuple(params))

    current_user = db.execute_query("""
        SELECT
            display_name,
            email,
            id,
            status,
            trust_score,
            user_type,
            created_time,
            username
        FROM users
        WHERE id = %s
        """,
    (user.id,), fetchone=True)

    if current_user is None:
        return ErrorModel(500, "Internal Server Error"), 500
    return CurrentUser.from_dict(dict_to_camel(current_user))


def update_user_settings(body, token_info=None):  # noqa: E501
    """Update current user settings

     # noqa: E501

    :param user_settings:
    :type user_settings: dict | bytes

    :rtype: Union[UserSettings, Tuple[UserSettings, int], Tuple[UserSettings, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    user_settings = body
    if connexion.request.is_json:
        user_settings = UserSettings.from_dict(connexion.request.get_json())

    # Delete existing category weights
    db.execute_query("""
        DELETE FROM user_position_categories WHERE user_id = %s
        """,
    (user.id,))

    # Insert new category weights
    if user_settings.category_weights:
        for cw in user_settings.category_weights:
            priority = WEIGHT_TO_PRIORITY.get(cw.weight, 3)
            db.execute_query("""
                INSERT INTO user_position_categories (user_id, position_category_id, priority)
                VALUES (%s, %s, %s)
                """,
            (user.id, cw.category_id, priority))

    return get_user_settings(token_info=token_info)
