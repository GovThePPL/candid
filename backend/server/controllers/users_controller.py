import logging
import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from flask import make_response

from candid.models.current_user import CurrentUser  # noqa: E501
from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.update_user_profile_request import UpdateUserProfileRequest  # noqa: E501
from candid.models.user import User  # noqa: E501
from candid.models.user_demographics import UserDemographics  # noqa: E501
from candid.models.user_position import UserPosition  # noqa: E501
from candid.models.user_settings import UserSettings  # noqa: E501
from candid.models.user_settings_category_weights_inner import UserSettingsCategoryWeightsInner  # noqa: E501
from candid import util

from candid.controllers import db
from candid.controllers.helpers.config import Config
from candid.controllers.helpers.auth import authorization, authorization_allow_banned, token_to_user
from candid.controllers.helpers import keycloak
from candid.controllers.helpers import nlp
from candid.controllers.helpers import presence
from candid.controllers.helpers.cache_headers import add_cache_headers
from candid.controllers.cards_controller import invalidate_user_context_cache
import uuid

logger = logging.getLogger(__name__)


def _row_to_current_user(row):
    """Convert a DB row to a CurrentUser model."""
    return CurrentUser(
        id=str(row['id']),
        username=row['username'],
        display_name=row['display_name'],
        email=row.get('email'),
        avatar_url=row.get('avatar_url'),
        avatar_icon_url=row.get('avatar_icon_url'),
        user_type=row['user_type'],
        status=row['status'],
        join_time=str(row['join_time']) if row.get('join_time') else None,
        trust_score=float(row['trust_score']) if row.get('trust_score') is not None else None,
        kudos_count=row.get('kudos_count', 0),
        diagnostics_consent=row.get('diagnostics_consent'),
    )


def _row_to_user_position(row):
    """Convert a DB row to a UserPosition model."""
    return UserPosition(
        id=str(row['id']),
        user_id=str(row['user_id']),
        position_id=str(row['position_id']),
        location_id=str(row['location_id']) if row.get('location_id') else None,
        category_id=str(row['category_id']) if row.get('category_id') else None,
        category_name=row.get('category_name'),
        location_name=row.get('location_name'),
        location_code=row.get('location_code'),
        statement=row['statement'],
        status=row['status'],
        agree_count=row.get('agree_count', 0),
        disagree_count=row.get('disagree_count', 0),
        pass_count=row.get('pass_count', 0),
        chat_count=row.get('chat_count', 0),
    )


def _row_to_user_demographics(row):
    """Convert a DB row to a UserDemographics model."""
    return UserDemographics(
        location_id=str(row['location_id']) if row.get('location_id') else None,
        lean=row.get('lean'),
        affiliation=str(row['affiliation']) if row.get('affiliation') else None,
        education=row.get('education'),
        geo_locale=row.get('geo_locale'),
        race=row.get('race'),
        sex=row.get('sex'),
        age_range=row.get('age_range'),
        income_range=row.get('income_range'),
        created_time=str(row['created_time']) if row.get('created_time') else None,
    )

WEIGHT_TO_PRIORITY = {
    'none': 0,
    'least': 1,
    'less': 2,
    'default': 3,
    'more': 4,
    'most': 5,
}

PRIORITY_TO_WEIGHT = {v: k for k, v in WEIGHT_TO_PRIORITY.items()}

LIKELIHOOD_TO_INT = {
    'off': 0,
    'rarely': 1,
    'less': 2,
    'normal': 3,
    'more': 4,
    'often': 5,
}

INT_TO_LIKELIHOOD = {v: k for k, v in LIKELIHOOD_TO_INT.items()}

NOTIFICATION_FREQ_TO_INT = {
    'off': 0,
    'rarely': 1,
    'less': 2,
    'normal': 3,
    'more': 4,
    'often': 5,
}

NOTIFICATION_FREQ_TO_LABEL = {v: k for k, v in NOTIFICATION_FREQ_TO_INT.items()}

DEMOGRAPHICS_API_TO_DB = {
    'locationId': 'location_id',
    'lean': 'lean',
    'affiliation': 'affiliation_id',
    'education': 'education',
    'geoLocale': 'geo_locale',
    'race': 'race',
    'sex': 'sex',
    'ageRange': 'age_range',
    'incomeRange': 'income_range',
}


def get_user_locations(token_info=None):  # noqa: E501
    """Get current user's locations with hierarchy

    Returns the user's locations ordered from highest level (country) to lowest level (city)

    :rtype: Union[List[Location], Tuple[List[Location], int], Tuple[List[Location], int, Dict[str, str]]
    """
    authorized, auth_err = authorization_allow_banned("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    # Get all locations the user is directly associated with
    user_locations = db.execute_query("""
        SELECT l.id, l.name, l.code, l.parent_location_id
        FROM user_location ul
        JOIN location l ON ul.location_id = l.id
        WHERE ul.user_id = %s
    """, (user.id,))

    if not user_locations:
        return []

    # For each location, traverse up to get the full hierarchy
    all_locations = {}  # id -> location dict with level

    for loc in user_locations:
        # Start from this location and go up the parent chain
        current_id = loc['id']
        chain = []

        while current_id:
            if current_id in all_locations:
                # Already processed this location
                break

            location = db.execute_query("""
                SELECT id, name, code, parent_location_id
                FROM location
                WHERE id = %s
            """, (current_id,), fetchone=True)

            if not location:
                break

            chain.append(location)
            current_id = location['parent_location_id']

        # Add chain to all_locations with level calculation
        for loc_in_chain in chain:
            if loc_in_chain['id'] not in all_locations:
                all_locations[loc_in_chain['id']] = loc_in_chain

    # Calculate levels: traverse from each location to root to get depth
    def get_level(loc_id, memo={}):
        if loc_id in memo:
            return memo[loc_id]
        loc = all_locations.get(loc_id)
        if not loc or not loc['parent_location_id']:
            memo[loc_id] = 0
            return 0
        parent_level = get_level(loc['parent_location_id'], memo)
        memo[loc_id] = parent_level + 1
        return memo[loc_id]

    # Build result with levels
    result = []
    for loc_id, loc in all_locations.items():
        level = get_level(loc_id)
        result.append({
            'id': str(loc['id']),
            'name': loc['name'],
            'code': loc['code'],
            'parentLocationId': str(loc['parent_location_id']) if loc['parent_location_id'] else None,
            'level': level
        })

    # Sort by level (highest/country first = level 0, then increasing)
    result.sort(key=lambda x: x['level'])

    return result


def get_all_locations(token_info=None):  # noqa: E501
    """Get all locations as a flat list with hierarchy info

    :rtype: Union[List[Location], Tuple[List[Location], int]]
    """
    authorized, auth_err = authorization_allow_banned("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    all_locs = db.execute_query("""
        SELECT id, name, code, parent_location_id
        FROM location
        ORDER BY name
    """)

    if all_locs is None:
        return []

    # Build lookup for level calculation
    loc_map = {loc['id']: loc for loc in all_locs}

    def get_level(loc_id, memo={}):
        if loc_id in memo:
            return memo[loc_id]
        loc = loc_map.get(loc_id)
        if not loc or not loc['parent_location_id']:
            memo[loc_id] = 0
            return 0
        parent_level = get_level(loc['parent_location_id'], memo)
        memo[loc_id] = parent_level + 1
        return memo[loc_id]

    result = []
    for loc in all_locs:
        level = get_level(loc['id'])
        result.append({
            'id': str(loc['id']),
            'name': loc['name'],
            'code': loc['code'],
            'parentLocationId': str(loc['parent_location_id']) if loc['parent_location_id'] else None,
            'level': level
        })

    result.sort(key=lambda x: (x['level'], x['name']))
    return result


def set_user_location(body, token_info=None):  # noqa: E501
    """Set the current user's location

    :param body: Request body with locationId
    :type body: dict

    :rtype: Union[List[Location], Tuple[List[Location], int]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    location_id = body.get('locationId')
    if not location_id:
        return ErrorModel(400, "locationId is required"), 400

    # Validate location exists
    loc = db.execute_query("""
        SELECT id FROM location WHERE id = %s
    """, (location_id,), fetchone=True)

    if not loc:
        return ErrorModel(400, "Invalid location ID"), 400

    # Delete existing user locations
    db.execute_query("""
        DELETE FROM user_location WHERE user_id = %s
    """, (user.id,))

    # Insert new location
    db.execute_query("""
        INSERT INTO user_location (user_id, location_id) VALUES (%s, %s)
    """, (user.id, location_id))

    # Invalidate cached user context (location changed)
    invalidate_user_context_cache(user.id)

    # Return updated hierarchy
    return get_user_locations(token_info=token_info)


def get_current_user(token_info=None):  # noqa: E501
    """Get current user profile

     # noqa: E501


    :rtype: Union[CurrentUser, Tuple[CurrentUser, int], Tuple[CurrentUser, int, Dict[str, str]]
    """

    authorized, auth_err = authorization_allow_banned("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    current_user = db.execute_query("""
        SELECT
            u.display_name,
            u.email,
            u.id,
            u.status,
            u.trust_score,
            u.user_type,
            u.created_time as join_time,
            u.username,
            u.avatar_url,
            u.avatar_icon_url,
            u.diagnostics_consent,
            COALESCE((
                SELECT COUNT(*) FROM kudos k
                WHERE k.receiver_user_id = u.id AND k.status = 'sent'
            ), 0) as kudos_count
        FROM users u
        WHERE u.id = %s
        """,
    (user.id,),
    fetchone=True)

    if current_user is None:
        return ErrorModel(404, "Not Found"), 404
    return _row_to_current_user(current_user)


def get_current_user_positions(status='active', token_info=None):  # noqa: E501
    """Get current user&#39;s position statements

     # noqa: E501

    :param status:
    :type status: str

    :rtype: Union[List[UserPosition], Tuple[List[UserPosition], int], Tuple[List[UserPosition], int, Dict[str, str]]
    """
    authorized, auth_err = authorization_allow_banned("normal", token_info)
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
            u.id AS user_id,
            c.label AS category_name,
            l.name AS location_name,
            l.code AS location_code
        FROM users AS u
        JOIN user_position AS up ON u.id = up.user_id
        JOIN position AS p ON up.position_id = p.id
        LEFT JOIN position_category AS c ON p.category_id = c.id
        LEFT JOIN location AS l ON p.location_id = l.id
        WHERE u.id = %s
            AND (up.status = %s OR %s = 'all')
            AND up.status != 'deleted'
        """,
    (user.id, status, status))
    if ret == None:
        return ErrorModel(500, "Internal Server Error"), 500

    return [_row_to_user_position(p) for p in ret]


def get_current_user_positions_metadata(token_info=None):  # noqa: E501
    """Get metadata about current user's positions for cache validation.

    Returns count and last updated time without full position data.

    :rtype: Union[dict, Tuple[dict, int]]
    """
    authorized, auth_err = authorization_allow_banned("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    result = db.execute_query("""
        SELECT
            COUNT(*) as count,
            MAX(up.updated_time) as last_updated_time
        FROM user_position up
        WHERE up.user_id = %s
        AND up.status != 'deleted'
    """, (user.id,), fetchone=True)

    count = result["count"] if result else 0
    last_updated_time = result["last_updated_time"] if result else None

    response_data = {
        "count": count,
        "lastUpdatedTime": last_updated_time.isoformat() if last_updated_time else None,
    }

    response = make_response(response_data, 200)
    if last_updated_time:
        response = add_cache_headers(response, last_modified=last_updated_time)
    return response


def update_user_position(user_position_id, body, token_info=None):  # noqa: E501
    """Update a user position (toggle active/inactive)

     # noqa: E501

    :param user_position_id: ID of the user position to update
    :type user_position_id: str
    :param body: Request body with status field
    :type body: dict

    :rtype: Union[UserPosition, Tuple[UserPosition, int], Tuple[UserPosition, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    # Verify ownership
    existing = db.execute_query("""
        SELECT id FROM user_position WHERE id = %s AND user_id = %s
    """, (user_position_id, user.id), fetchone=True)

    if not existing:
        return ErrorModel(404, "Position not found"), 404

    new_status = body.get('status')
    if new_status not in ('active', 'inactive'):
        return ErrorModel(400, "Invalid status. Must be 'active' or 'inactive'"), 400

    db.execute_query("""
        UPDATE user_position SET status = %s, updated_time = CURRENT_TIMESTAMP
        WHERE id = %s
    """, (new_status, user_position_id))

    # Return updated position
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
            up.user_id,
            c.label AS category_name,
            l.name AS location_name,
            l.code AS location_code
        FROM user_position AS up
        JOIN position AS p ON up.position_id = p.id
        LEFT JOIN position_category AS c ON p.category_id = c.id
        LEFT JOIN location AS l ON p.location_id = l.id
        WHERE up.id = %s
    """, (user_position_id,), fetchone=True)

    if ret is None:
        return ErrorModel(500, "Internal Server Error"), 500

    return _row_to_user_position(ret)


def delete_user_position(user_position_id, token_info=None):  # noqa: E501
    """Delete a user position (soft delete)

     # noqa: E501

    :param user_position_id: ID of the user position to delete
    :type user_position_id: str

    :rtype: Union[None, Tuple[None, int], Tuple[None, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    # Verify ownership
    existing = db.execute_query("""
        SELECT id FROM user_position WHERE id = %s AND user_id = %s
    """, (user_position_id, user.id), fetchone=True)

    if not existing:
        return ErrorModel(404, "Position not found"), 404

    db.execute_query("""
        UPDATE user_position SET status = 'deleted', updated_time = CURRENT_TIMESTAMP
        WHERE id = %s
    """, (user_position_id,))

    return None, 204


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

    return User(
        id=str(ret['id']),
        username=ret['username'],
        display_name=ret['display_name'],
        status=ret['status'],
        trust_score=float(ret['trust_score']) if ret.get('trust_score') is not None else None,
    )


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
            age_range,
            income_range,
            created_time
        FROM user_demographics
        WHERE user_id = %s
        """,
    (user.id,), fetchone=True)

    if ret == None:
        return None, 204
    return _row_to_user_demographics(ret)


def get_user_settings(token_info=None):  # noqa: E501
    """Get current user settings

     # noqa: E501


    :rtype: Union[UserSettings, Tuple[UserSettings, int], Tuple[UserSettings, int, Dict[str, str]]
    """
    authorized, auth_err = authorization_allow_banned("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    # Get category weights
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

    # Get likelihood settings and notification settings from users table
    user_row = db.execute_query("""
        SELECT chat_request_likelihood, chatting_list_likelihood,
               notifications_enabled, notification_frequency,
               quiet_hours_start, quiet_hours_end, timezone
        FROM users
        WHERE id = %s
        """,
    (user.id,), fetchone=True)

    chat_request_likelihood = INT_TO_LIKELIHOOD.get(
        user_row['chat_request_likelihood'] if user_row else 3, 'normal')
    chatting_list_likelihood = INT_TO_LIKELIHOOD.get(
        user_row['chatting_list_likelihood'] if user_row else 3, 'normal')

    # Notification settings
    notifications_enabled = user_row.get('notifications_enabled', False) if user_row else False
    notification_frequency = NOTIFICATION_FREQ_TO_LABEL.get(
        user_row['notification_frequency'] if user_row else 3, 'normal')
    quiet_hours_start = user_row.get('quiet_hours_start') if user_row else None
    quiet_hours_end = user_row.get('quiet_hours_end') if user_row else None
    timezone = user_row.get('timezone', 'America/New_York') if user_row else 'America/New_York'

    return {
        "categoryWeights": [{"categoryId": cw.category_id, "weight": cw.weight} for cw in category_weights],
        "chatRequestLikelihood": chat_request_likelihood,
        "chattingListLikelihood": chatting_list_likelihood,
        "notificationsEnabled": notifications_enabled,
        "notificationFrequency": notification_frequency,
        "quietHoursStart": quiet_hours_start,
        "quietHoursEnd": quiet_hours_end,
        "timezone": timezone,
    }


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
        INSERT INTO user_demographics (user_id, location_id, lean, affiliation_id, education, geo_locale, race, sex, age_range, income_range)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (user_id) DO UPDATE SET
            location_id = EXCLUDED.location_id,
            lean = EXCLUDED.lean,
            affiliation_id = EXCLUDED.affiliation_id,
            education = EXCLUDED.education,
            geo_locale = EXCLUDED.geo_locale,
            race = EXCLUDED.race,
            sex = EXCLUDED.sex,
            age_range = EXCLUDED.age_range,
            income_range = EXCLUDED.income_range,
            updated_time = CURRENT_TIMESTAMP
        """,
    (user.id,
     user_demographics.location_id,
     user_demographics.lean,
     user_demographics.affiliation,
     user_demographics.education,
     user_demographics.geo_locale,
     user_demographics.race,
     user_demographics.sex,
     user_demographics.age_range,
     user_demographics.income_range))

    ret = db.execute_query("""
        SELECT
            location_id,
            lean,
            affiliation_id AS affiliation,
            education,
            geo_locale,
            race,
            sex,
            age_range,
            income_range,
            created_time
        FROM user_demographics
        WHERE user_id = %s
        """,
    (user.id,), fetchone=True)

    if ret is None:
        return ErrorModel(500, "Internal Server Error"), 500
    return _row_to_user_demographics(ret)


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
            age_range,
            income_range,
            created_time
        FROM user_demographics
        WHERE user_id = %s
        """,
    (user.id,), fetchone=True)

    if ret is None:
        return ErrorModel(500, "Internal Server Error"), 500
    return _row_to_user_demographics(ret)


def update_user_profile(body, token_info=None):  # noqa: E501
    """Update current user profile (displayName, email, avatarUrl)

     # noqa: E501

    :param update_user_profile_request:
    :type update_user_profile_request: dict | bytes

    :rtype: Union[CurrentUser, Tuple[CurrentUser, int], Tuple[CurrentUser, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    raw = connexion.request.get_json() if connexion.request.is_json else body

    set_clauses = []
    params = []

    if 'displayName' in raw and raw['displayName'] is not None:
        set_clauses.append("display_name = %s")
        params.append(raw['displayName'])

    if 'email' in raw and raw['email'] is not None:
        set_clauses.append("email = %s")
        params.append(raw['email'])

    if 'avatarUrl' in raw:
        # Allow setting to null to clear avatar
        set_clauses.append("avatar_url = %s")
        params.append(raw['avatarUrl'])

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
            u.display_name,
            u.email,
            u.id,
            u.status,
            u.trust_score,
            u.user_type,
            u.created_time as join_time,
            u.username,
            u.avatar_url,
            u.avatar_icon_url,
            u.diagnostics_consent,
            COALESCE((
                SELECT COUNT(*) FROM kudos k
                WHERE k.receiver_user_id = u.id AND k.status = 'sent'
            ), 0) as kudos_count
        FROM users u
        WHERE u.id = %s
        """,
    (user.id,), fetchone=True)

    if current_user is None:
        return ErrorModel(500, "Internal Server Error"), 500
    return _row_to_current_user(current_user)


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

    # Handle category weights if provided
    if user_settings.category_weights is not None:
        # Delete existing category weights
        db.execute_query("""
            DELETE FROM user_position_categories WHERE user_id = %s
            """,
        (user.id,))

        # Insert new category weights
        for cw in user_settings.category_weights:
            priority = WEIGHT_TO_PRIORITY.get(cw.weight, 3)
            db.execute_query("""
                INSERT INTO user_position_categories (user_id, position_category_id, priority)
                VALUES (%s, %s, %s)
                """,
            (user.id, cw.category_id, priority))

    # Handle likelihood settings and notification settings if provided
    set_clauses = []
    params = []

    # Also check raw JSON for notification fields (not part of UserSettings model yet)
    raw = connexion.request.get_json() if connexion.request.is_json else {}

    chat_request_likelihood_changed = False
    chat_request_likelihood_int = None
    if user_settings.chat_request_likelihood is not None:
        chat_request_likelihood_int = LIKELIHOOD_TO_INT.get(user_settings.chat_request_likelihood, 3)
        set_clauses.append("chat_request_likelihood = %s")
        params.append(chat_request_likelihood_int)
        chat_request_likelihood_changed = True

    if user_settings.chatting_list_likelihood is not None:
        likelihood_int = LIKELIHOOD_TO_INT.get(user_settings.chatting_list_likelihood, 3)
        set_clauses.append("chatting_list_likelihood = %s")
        params.append(likelihood_int)

    # Notification settings (from raw JSON since they may not be in the generated model)
    if 'notificationsEnabled' in raw:
        set_clauses.append("notifications_enabled = %s")
        params.append(bool(raw['notificationsEnabled']))

    if 'notificationFrequency' in raw:
        freq_int = NOTIFICATION_FREQ_TO_INT.get(raw['notificationFrequency'], 3)
        set_clauses.append("notification_frequency = %s")
        params.append(freq_int)

    if 'quietHoursStart' in raw:
        set_clauses.append("quiet_hours_start = %s")
        params.append(raw['quietHoursStart'])

    if 'quietHoursEnd' in raw:
        set_clauses.append("quiet_hours_end = %s")
        params.append(raw['quietHoursEnd'])

    if 'timezone' in raw:
        set_clauses.append("timezone = %s")
        params.append(raw['timezone'])

    if set_clauses:
        set_clauses.append("updated_time = CURRENT_TIMESTAMP")
        set_str = ', '.join(set_clauses)
        params.append(user.id)
        db.execute_query(
            f"UPDATE users SET {set_str} WHERE id = %s",
            tuple(params))

    # Sync chat_request_likelihood to Redis for availability checks
    if chat_request_likelihood_changed and chat_request_likelihood_int is not None:
        presence.set_chat_likelihood(str(user.id), chat_request_likelihood_int)

    # Invalidate cached user context (category weights or chatting_list_likelihood may have changed)
    invalidate_user_context_cache(user.id)

    return get_user_settings(token_info=token_info)


def get_available_avatars():  # noqa: E501
    """Get list of available avatar options

    Returns an empty list - users now upload their own avatars.

     # noqa: E501


    :rtype: Union[List[object], Tuple[List[object], int], Tuple[List[object], int, Dict[str, str]]
    """
    return []


def upload_avatar(body, token_info=None):  # noqa: E501
    """Upload a custom avatar image

    Upload a base64 encoded image as avatar. The image will be validated for
    file size (max 5MB), format, and NSFW content. Images are resized to
    256x256 (full) and 64x64 (icon) versions.

    :param body: Request body with image data
    :type body: dict | bytes

    :rtype: Union[object, Tuple[object, int], Tuple[object, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    image_base64 = body.get('imageBase64')
    if not image_base64:
        return ErrorModel(400, "imageBase64 is required"), 400

    # Process avatar: validate, check NSFW, and resize
    try:
        result = nlp.process_avatar(image_base64)

        if result.get('error'):
            # Check if it's an NSFW rejection
            if not result.get('is_safe', True):
                return ErrorModel(400, "Image contains inappropriate content and cannot be used as an avatar"), 400
            return ErrorModel(400, f"Image processing failed: {result['error']}"), 400

        if not result.get('full_base64') or not result.get('icon_base64'):
            return ErrorModel(400, "Image processing failed"), 400

    except nlp.NLPServiceError as e:
        return ErrorModel(500, f"Image processing service error: {str(e)}"), 500

    # Update user's avatar URLs (full size and icon)
    db.execute_query("""
        UPDATE users
        SET avatar_url = %s, avatar_icon_url = %s
        WHERE id = %s
    """, (result['full_base64'], result['icon_base64'], user.id))

    return {
        "avatarUrl": result['full_base64'],
        "avatarIconUrl": result['icon_base64'],
        "message": "Avatar uploaded successfully"
    }


def delete_current_user(body=None, token_info=None):  # noqa: E501
    """Soft delete current user account

     # noqa: E501

    :rtype: Union[object, Tuple[object, int], Tuple[object, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    # Look up keycloak_id from DB (not on the User model)
    row = db.execute_query(
        "SELECT keycloak_id FROM users WHERE id = %s",
        (user.id,), fetchone=True
    )
    keycloak_id = row.get("keycloak_id") if row else None

    # Delete from Keycloak first (so they can re-register with the same username)
    if keycloak_id:
        try:
            keycloak.delete_user(keycloak_id)
        except Exception as e:
            logger.warning(f"Failed to delete Keycloak user {keycloak_id}: {e}")

    # Soft delete the user in Candid DB — mangle username, clear email and keycloak_id
    # so the username/email are freed for re-registration
    db.execute_query("""
        UPDATE users
        SET status = 'deleted',
            username = 'deleted_' || id::text,
            email = NULL,
            keycloak_id = NULL,
            updated_time = CURRENT_TIMESTAMP
        WHERE id = %s
    """, (user.id,))

    return {'message': 'Account deleted successfully'}


def heartbeat(token_info=None):  # noqa: E501
    """Record user heartbeat for presence tracking

    :rtype: Union[dict, Tuple[dict, int]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    presence.record_heartbeat(str(user.id))
    return {"status": "ok"}


def register_push_token(body, token_info=None):  # noqa: E501
    """Register a push notification token

    :param body: Request body with token and platform
    :type body: dict

    :rtype: Union[dict, Tuple[dict, int]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    token = body.get("token")
    platform = body.get("platform", "expo")

    if not token:
        return ErrorModel(400, "token is required"), 400

    if platform not in ("expo", "web"):
        return ErrorModel(400, "platform must be 'expo' or 'web'"), 400

    db.execute_query("""
        UPDATE users
        SET push_token = %s, push_platform = %s, notifications_enabled = TRUE
        WHERE id = %s
    """, (token, platform, user.id))

    return {"status": "ok"}


def update_diagnostics_consent(body, token_info=None):  # noqa: E501
    """Update diagnostics consent preference

    :param body: Request body with consent boolean
    :type body: dict
    :param token_info: JWT token info
    :type token_info: dict

    :rtype: Union[dict, Tuple[dict, int]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)

    consent = body.get('consent')
    if consent is None:
        return ErrorModel(400, "consent is required"), 400

    db.execute_query("""
        UPDATE users SET diagnostics_consent = %s, updated_time = CURRENT_TIMESTAMP
        WHERE id = %s
    """, (bool(consent), user.id))

    return {"diagnosticsConsent": bool(consent)}
