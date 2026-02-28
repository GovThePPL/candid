import json
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
from candid.models.user_settings_session_weights_inner import UserSettingsSessionWeightsInner  # noqa: E501
from candid import util

from candid.controllers import db
from candid.controllers.helpers.config import Config
from candid.controllers.helpers.auth import authorization, authorization_allow_banned, require_auth, token_to_user, get_user_roles
from candid.controllers.helpers import keycloak
from candid.controllers.helpers import nlp
from candid.controllers.helpers import presence
from candid.controllers.helpers.cache_headers import add_cache_headers
from candid.controllers.helpers.rate_limiting import check_rate_limit_for
from candid.controllers.helpers.user_mappers import (
    WEIGHT_TO_PRIORITY,
    PRIORITY_TO_WEIGHT,
    LIKELIHOOD_TO_INT,
    INT_TO_LIKELIHOOD,
    NOTIFICATION_FREQ_TO_INT,
    NOTIFICATION_FREQ_TO_LABEL,
    DEMOGRAPHICS_API_TO_DB,
    row_to_current_user as _row_to_current_user,
    row_to_user_position as _row_to_user_position,
    row_to_user_demographics as _row_to_user_demographics,
    compute_location_levels as _compute_location_levels,
)
from candid.controllers.cards_controller import invalidate_user_context_cache
from candid.controllers.helpers import polis_sync
import uuid

logger = logging.getLogger(__name__)


@require_auth("normal", allow_banned=True)
def get_user_locations(token_info=None, user_id=None):  # noqa: E501
    """Get current user's locations with hierarchy

    Returns the user's locations ordered from highest level (country) to lowest level (city)

    :rtype: Union[List[Location], Tuple[List[Location], int], Tuple[List[Location], int, Dict[str, str]]
    """
    user = token_to_user(token_info)

    # Get all locations the user is directly associated with (exclude soft-deleted)
    user_locations = db.execute_query("""
        SELECT l.id, l.name, l.code, l.parent_location_id
        FROM user_location ul
        JOIN location l ON ul.location_id = l.id
        WHERE ul.user_id = %s AND l.deleted_at IS NULL
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
                WHERE id = %s AND deleted_at IS NULL
            """, (current_id,), fetchone=True)

            if not location:
                break

            chain.append(location)
            current_id = location['parent_location_id']

        # Add chain to all_locations with level calculation
        for loc_in_chain in chain:
            if loc_in_chain['id'] not in all_locations:
                all_locations[loc_in_chain['id']] = loc_in_chain

    return _compute_location_levels(list(all_locations.values()))


def get_all_locations(token_info=None):  # noqa: E501
    """Get all locations as a flat list with hierarchy info

    :rtype: Union[List[Location], Tuple[List[Location], int]]
    """
    # Public endpoint — no auth required
    all_locs = db.execute_query("""
        SELECT id, name, code, parent_location_id
        FROM location
        WHERE deleted_at IS NULL
        ORDER BY name
    """)

    if all_locs is None:
        return []

    return _compute_location_levels(all_locs)


@require_auth("normal")
def set_user_location(body, token_info=None, user_id=None):  # noqa: E501
    """Set the current user's location

    :param body: Request body with locationId
    :type body: dict

    :rtype: Union[List[Location], Tuple[List[Location], int]]
    """
    user = token_to_user(token_info)

    location_id = body.get('locationId')
    if not location_id:
        return ErrorModel(400, "locationId is required"), 400

    # Validate location exists (exclude soft-deleted)
    loc = db.execute_query("""
        SELECT id FROM location WHERE id = %s AND deleted_at IS NULL
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


@require_auth("normal", allow_banned=True)
def get_current_user(token_info=None, user_id=None):  # noqa: E501
    """Get current user profile

     # noqa: E501


    :rtype: Union[CurrentUser, Tuple[CurrentUser, int], Tuple[CurrentUser, int, Dict[str, str]]
    """
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
            u.kudos_count
        FROM users u
        WHERE u.id = %s
        """,
    (user.id,),
    fetchone=True)

    if current_user is None:
        return ErrorModel(404, "Not Found"), 404

    result = _row_to_current_user(current_user)

    # Add scoped roles from user_role table
    roles = get_user_roles(user.id)
    result.roles = [
        {
            "role": r["role"],
            "locationId": r["location_id"],
            "sessionId": r["session_id"],
            "locationName": r.get("location_name"),
            "locationCode": r.get("location_code"),
            "sessionLabel": r.get("session_label"),
        }
        for r in roles
    ]

    return result


@require_auth("normal", allow_banned=True)
def get_current_user_positions(status='active', token_info=None, user_id=None):  # noqa: E501
    """Get current user&#39;s position statements

     # noqa: E501

    :param status:
    :type status: str

    :rtype: Union[List[UserPosition], Tuple[List[UserPosition], int], Tuple[List[UserPosition], int, Dict[str, str]]
    """
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
            p.session_id,
            p.location_id,
            u.id AS user_id,
            c.label AS session_name,
            l.name AS location_name,
            l.code AS location_code
        FROM users AS u
        JOIN user_position AS up ON u.id = up.user_id
        JOIN position AS p ON up.position_id = p.id
        LEFT JOIN session AS c ON p.session_id = c.id
        LEFT JOIN location AS l ON p.location_id = l.id
        WHERE u.id = %s
            AND (up.status = %s OR %s = 'all')
            AND up.status != 'deleted'
        """,
    (user.id, status, status))
    if ret == None:
        return ErrorModel(500, "Internal Server Error"), 500

    return [_row_to_user_position(p) for p in ret]


@require_auth("normal", allow_banned=True)
def get_current_user_positions_metadata(token_info=None, user_id=None):  # noqa: E501
    """Get metadata about current user's positions for cache validation.

    Returns count and last updated time without full position data.

    :rtype: Union[dict, Tuple[dict, int]]
    """
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


@require_auth("normal")
def update_user_position(user_position_id, body, token_info=None, user_id=None):  # noqa: E501
    """Update a user position (toggle active/inactive)

     # noqa: E501

    :param user_position_id: ID of the user position to update
    :type user_position_id: str
    :param body: Request body with status field
    :type body: dict

    :rtype: Union[UserPosition, Tuple[UserPosition, int], Tuple[UserPosition, int, Dict[str, str]]
    """
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
            p.session_id,
            p.location_id,
            up.user_id,
            c.label AS session_name,
            l.name AS location_name,
            l.code AS location_code
        FROM user_position AS up
        JOIN position AS p ON up.position_id = p.id
        LEFT JOIN session AS c ON p.session_id = c.id
        LEFT JOIN location AS l ON p.location_id = l.id
        WHERE up.id = %s
    """, (user_position_id,), fetchone=True)

    if ret is None:
        return ErrorModel(500, "Internal Server Error"), 500

    return _row_to_user_position(ret)


@require_auth("normal")
def delete_user_position(user_position_id, token_info=None, user_id=None):  # noqa: E501
    """Delete a user position (soft delete)

     # noqa: E501

    :param user_position_id: ID of the user position to delete
    :type user_position_id: str

    :rtype: Union[None, Tuple[None, int], Tuple[None, int, Dict[str, str]]
    """
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


@require_auth("normal")
def create_user_position(body, token_info=None, user_id=None):  # noqa: E501
    """Adopt a position and register an agree response

    Creates a user_position entry for the current user and registers an agree response.

    :param body: Request body with positionId
    :type body: dict

    :rtype: Union[UserPosition, Tuple[UserPosition, int], Tuple[UserPosition, int, Dict[str, str]]
    """
    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    position_id = body.get('positionId')
    if not position_id:
        return ErrorModel(400, "positionId is required"), 400

    # Check if position exists
    position = db.execute_query("""
        SELECT id, session_id, location_id, statement
        FROM position
        WHERE id = %s AND status = 'active'
    """, (position_id,), fetchone=True)

    if not position:
        return ErrorModel(404, "Position not found"), 404

    # Check if user already adopted this position (active)
    existing_active = db.execute_query("""
        SELECT id FROM user_position
        WHERE user_id = %s AND position_id = %s AND status = 'active'
    """, (user.id, position_id), fetchone=True)

    if existing_active:
        return ErrorModel(400, "Position already adopted"), 400

    # Check if user previously had this position (deleted) - reactivate it
    existing_deleted = db.execute_query("""
        SELECT id FROM user_position
        WHERE user_id = %s AND position_id = %s AND status = 'deleted'
    """, (user.id, position_id), fetchone=True)

    if existing_deleted:
        # Reactivate the deleted user_position
        user_position_id = existing_deleted['id']
        db.execute_query("""
            UPDATE user_position SET status = 'active' WHERE id = %s
        """, (user_position_id,))
    else:
        # Create new user_position entry
        user_position_id = str(uuid.uuid4())
        db.execute_query("""
            INSERT INTO user_position (id, user_id, position_id, status)
            VALUES (%s, %s, %s, 'active')
        """, (user_position_id, user.id, position_id))

    # Register agree response (upsert)
    db.execute_query("""
        INSERT INTO response (user_id, position_id, response)
        VALUES (%s, %s, 'agree')
        ON CONFLICT (user_id, position_id) DO UPDATE SET response = 'agree'
    """, (user.id, position_id))

    # Queue vote for Polis sync
    polis_sync.queue_vote_sync(
        position_id=position_id,
        user_id=user.id,
        response='agree'
    )

    # Fetch and return the created user_position
    ret = db.execute_query("""
        SELECT
            up.id,
            up.user_id,
            up.position_id,
            up.status,
            up.agree_count,
            up.disagree_count,
            up.pass_count,
            up.chat_count,
            p.statement,
            p.session_id,
            p.location_id,
            c.label AS session_name,
            l.name AS location_name,
            l.code AS location_code
        FROM user_position AS up
        JOIN position AS p ON up.position_id = p.id
        LEFT JOIN session AS c ON p.session_id = c.id
        LEFT JOIN location AS l ON p.location_id = l.id
        WHERE up.id = %s
    """, (user_position_id,), fetchone=True)

    return _row_to_user_position(ret), 201


@require_auth("normal")
def get_user_by_username(username, token_info=None, user_id=None):  # noqa: E501
    """Get a user by username

     # noqa: E501

    :param username: Username of the user to retrieve
    :type username: str

    :rtype: Union[User, Tuple[User, int], Tuple[User, int, Dict[str, str]]
    """

    ret = db.execute_query("""
        SELECT
            u.display_name,
            u.id,
            u.status,
            u.trust_score,
            u.username,
            u.avatar_url,
            u.avatar_icon_url,
            u.kudos_count
        FROM users u
        WHERE LOWER(u.username) = LOWER(%s)
        """,
    (username,), fetchone=True)

    if ret is None:
        return ErrorModel(404, "User not found"), 404

    user_id = ret['id']
    roles = get_user_roles(user_id)
    role_list = [
        {
            "role": r["role"],
            "locationId": r["location_id"],
            "sessionId": r["session_id"],
            "locationName": r.get("location_name"),
            "locationCode": r.get("location_code"),
            "sessionLabel": r.get("session_label"),
        }
        for r in roles
    ]

    result = User(
        id=str(ret['id']),
        username=ret['username'],
        display_name=ret['display_name'],
        status=ret['status'],
        trust_score=float(ret['trust_score']) if ret.get('trust_score') is not None else None,
        avatar_url=ret['avatar_url'],
        avatar_icon_url=ret['avatar_icon_url'],
        kudos_count=int(ret['kudos_count']),
    )
    result.roles = role_list
    return result


def get_user_by_id(user_id, token_info=None):  # noqa: E501
    """Get a user by ID

     # noqa: E501

    :param user_id: ID of the user to retrieve
    :type user_id: str

    :rtype: Union[User, Tuple[User, int], Tuple[User, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    ret = db.execute_query("""
        SELECT
            u.display_name,
            u.id,
            u.status,
            u.trust_score,
            u.username,
            u.avatar_url,
            u.avatar_icon_url,
            u.kudos_count
        FROM users u
        WHERE u.id = %s
        """,
    (user_id,), fetchone=True)

    if ret is None:
        return ErrorModel(404, "User not found"), 404

    roles = get_user_roles(user_id)
    role_list = [
        {
            "role": r["role"],
            "locationId": r["location_id"],
            "sessionId": r["session_id"],
            "locationName": r.get("location_name"),
            "locationCode": r.get("location_code"),
            "sessionLabel": r.get("session_label"),
        }
        for r in roles
    ]

    result = User(
        id=str(ret['id']),
        username=ret['username'],
        display_name=ret['display_name'],
        status=ret['status'],
        trust_score=float(ret['trust_score']) if ret.get('trust_score') is not None else None,
        avatar_url=ret['avatar_url'],
        avatar_icon_url=ret['avatar_icon_url'],
        kudos_count=int(ret['kudos_count']),
    )
    result.roles = role_list
    return result


@require_auth("normal")
def get_user_demographics(token_info=None, user_id=None):  # noqa: E501
    """Get current user demographics

     # noqa: E501


    :rtype: Union[UserDemographics, Tuple[UserDemographics, int], Tuple[UserDemographics, int, Dict[str, str]]
    """
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


@require_auth("normal", allow_banned=True)
def get_user_settings(token_info=None, user_id=None):  # noqa: E501
    """Get current user settings

     # noqa: E501


    :rtype: Union[UserSettings, Tuple[UserSettings, int], Tuple[UserSettings, int, Dict[str, str]]
    """
    user = token_to_user(token_info)

    # Get session weights
    rows = db.execute_query("""
        SELECT session_id, priority
        FROM user_session_preferences
        WHERE user_id = %s
        """,
    (user.id,))

    if rows is None:
        rows = []

    session_weights = []
    for row in rows:
        weight = PRIORITY_TO_WEIGHT.get(row['priority'], 'default')
        session_weights.append(UserSettingsSessionWeightsInner(
            session_id=str(row['session_id']),
            weight=weight
        ))

    # Get likelihood settings and notification settings from users table
    user_row = db.execute_query("""
        SELECT chat_request_likelihood, chatting_list_likelihood,
               notifications_enabled, notification_frequency,
               quiet_hours_start, quiet_hours_end, timezone,
               show_role_badge
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

    show_role_badge = user_row.get('show_role_badge', True) if user_row else True

    # Per-type notification preferences
    notif_type_rows = db.execute_query(
        "SELECT notification_type, enabled FROM notification_type_preferences WHERE user_id = %s",
        (user.id,))
    notification_type_prefs = {}
    for row in (notif_type_rows or []):
        notification_type_prefs[row['notification_type']] = row['enabled']

    return {
        "sessionWeights": [{"sessionId": cw.session_id, "weight": cw.weight} for cw in session_weights],
        "chatRequestLikelihood": chat_request_likelihood,
        "chattingListLikelihood": chatting_list_likelihood,
        "notificationsEnabled": notifications_enabled,
        "notificationFrequency": notification_frequency,
        "quietHoursStart": quiet_hours_start,
        "quietHoursEnd": quiet_hours_end,
        "timezone": timezone,
        "showRoleBadge": show_role_badge,
        "notificationTypePrefs": notification_type_prefs,
    }


@require_auth("normal")
def update_user_demographics_partial(body, token_info=None, user_id=None):  # noqa: E501
    """Update specific user demographics fields

     # noqa: E501

    :param user_demographics:
    :type user_demographics: dict | bytes

    :rtype: Union[UserDemographics, Tuple[UserDemographics, int], Tuple[UserDemographics, int, Dict[str, str]]
    """
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


@require_auth("normal")
def update_user_profile(body, token_info=None, user_id=None):  # noqa: E501
    """Update current user profile (displayName, email, avatarUrl)

     # noqa: E501

    :param update_user_profile_request:
    :type update_user_profile_request: dict | bytes

    :rtype: Union[CurrentUser, Tuple[CurrentUser, int], Tuple[CurrentUser, int, Dict[str, str]]
    """
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
            u.kudos_count
        FROM users u
        WHERE u.id = %s
        """,
    (user.id,), fetchone=True)

    if current_user is None:
        return ErrorModel(500, "Internal Server Error"), 500
    return _row_to_current_user(current_user)


@require_auth("normal")
def update_user_settings(body, token_info=None, user_id=None):  # noqa: E501
    """Update current user settings

     # noqa: E501

    :param user_settings:
    :type user_settings: dict | bytes

    :rtype: Union[UserSettings, Tuple[UserSettings, int], Tuple[UserSettings, int, Dict[str, str]]
    """
    user = token_to_user(token_info)

    user_settings = body
    if connexion.request.is_json:
        user_settings = UserSettings.from_dict(connexion.request.get_json())

    # Handle session weights if provided
    if user_settings.session_weights is not None:
        # Delete existing session weights
        db.execute_query("""
            DELETE FROM user_session_preferences WHERE user_id = %s
            """,
        (user.id,))

        # Insert new session weights
        for cw in user_settings.session_weights:
            priority = WEIGHT_TO_PRIORITY.get(cw.weight, 3)
            db.execute_query("""
                INSERT INTO user_session_preferences (user_id, session_id, priority)
                VALUES (%s, %s, %s)
                """,
            (user.id, cw.session_id, priority))

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

    if 'showRoleBadge' in raw:
        set_clauses.append("show_role_badge = %s")
        params.append(bool(raw['showRoleBadge']))

    # Per-type notification preferences
    VALID_NOTIF_TYPES = ('comment_reply', 'post_comment', 'chat_request', 'role_change', 'rule_change', 'admin_action', 'moderation')
    if 'notificationTypePrefs' in raw and isinstance(raw['notificationTypePrefs'], dict):
        for notif_type, enabled in raw['notificationTypePrefs'].items():
            if notif_type in VALID_NOTIF_TYPES:
                db.execute_query("""
                    INSERT INTO notification_type_preferences (user_id, notification_type, enabled)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (user_id, notification_type) DO UPDATE SET enabled = EXCLUDED.enabled
                """, (user.id, notif_type, bool(enabled)))

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

    # Invalidate cached user context (session weights or chatting_list_likelihood may have changed)
    invalidate_user_context_cache(user.id)

    return get_user_settings(token_info=token_info)


def get_available_avatars():  # noqa: E501
    """Get list of available avatar options

    Returns an empty list - users now upload their own avatars.

     # noqa: E501


    :rtype: Union[List[object], Tuple[List[object], int], Tuple[List[object], int, Dict[str, str]]
    """
    return []


@require_auth("normal")
def upload_avatar(body, token_info=None, user_id=None):  # noqa: E501
    """Upload a custom avatar image

    Upload a base64 encoded image as avatar. The image will be validated for
    file size (max 5MB), format, and NSFW content. Images are resized to
    256x256 (full) and 64x64 (icon) versions.

    :param body: Request body with image data
    :type body: dict | bytes

    :rtype: Union[object, Tuple[object, int], Tuple[object, int, Dict[str, str]]
    """
    user = token_to_user(token_info)

    # Rate limit: 10 uploads per hour
    allowed, _ = check_rate_limit_for(str(user["id"]), "avatar_upload")
    if not allowed:
        return ErrorModel(429, "Upload rate limit exceeded. Try again later."), 429

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
            logger.warning("Image processing failed: %s", result['error'])
            return ErrorModel(400, "Image processing failed"), 400

        if not result.get('full_base64') or not result.get('icon_base64'):
            return ErrorModel(400, "Image processing failed"), 400

    except nlp.NLPServiceError as e:
        logger.error("Image processing service error: %s", e)
        return ErrorModel(500, "Image processing service unavailable"), 500

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


@require_auth("normal")
def delete_current_user(token_info=None, user_id=None):  # noqa: E501
    """Soft delete current user account

     # noqa: E501

    :rtype: Union[None, Tuple[None, int], Tuple[None, int, Dict[str, str]]
    """
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

    return '', 204


@require_auth("normal")
def heartbeat(token_info=None, user_id=None):  # noqa: E501
    """Record user heartbeat for presence tracking

    :rtype: Union[dict, Tuple[dict, int]]
    """
    user = token_to_user(token_info)

    presence.record_heartbeat(str(user.id))

    # Drain any queued notifications (quiet-hours delivery)
    try:
        from candid.controllers.helpers.push_notifications import drain_notification_queue
        drain_notification_queue(str(user.id), db)
    except Exception:
        pass  # Notification drain failure shouldn't break heartbeat

    return {"status": "ok"}


@require_auth("normal")
def update_push_token(body, token_info=None, user_id=None):  # noqa: E501
    """Register a push notification token

    :param body: Request body with token and platform
    :type body: dict

    :rtype: Union[dict, Tuple[dict, int]]
    """
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


@require_auth("normal")
def update_notification_mute(body, token_info=None, user_id=None):  # noqa: E501
    """Mute or unmute notifications for a specific post or comment."""
    user = token_to_user(token_info)

    raw = connexion.request.get_json() if connexion.request.is_json else body
    target_type = raw.get('targetType')
    target_id = raw.get('targetId')
    muted = raw.get('muted')

    if target_type not in ('post', 'comment'):
        return ErrorModel(400, "targetType must be 'post' or 'comment'"), 400
    if not target_id:
        return ErrorModel(400, "targetId is required"), 400
    if muted is None:
        return ErrorModel(400, "muted is required"), 400

    # Verify ownership
    if target_type == 'post':
        row = db.execute_query(
            "SELECT creator_user_id FROM post WHERE id = %s", (target_id,), fetchone=True)
    else:
        row = db.execute_query(
            "SELECT creator_user_id FROM comment WHERE id = %s", (target_id,), fetchone=True)

    if not row:
        return ErrorModel(404, "Target not found"), 404
    if str(row["creator_user_id"]) != str(user.id):
        return ErrorModel(403, "Only the content owner can mute notifications"), 403

    if muted:
        db.execute_query("""
            INSERT INTO notification_mute (user_id, target_type, target_id)
            VALUES (%s, %s, %s)
            ON CONFLICT (user_id, target_type, target_id) DO NOTHING
        """, (user.id, target_type, target_id))
    else:
        db.execute_query("""
            DELETE FROM notification_mute
            WHERE user_id = %s AND target_type = %s AND target_id = %s
        """, (user.id, target_type, target_id))

    return {"muted": muted}


@require_auth("normal")
def get_notification_mute_status(target_type, target_id, token_info=None, user_id=None):  # noqa: E501
    """Check if a post or comment is muted."""
    user = token_to_user(token_info)

    if target_type not in ('post', 'comment'):
        return ErrorModel(400, "targetType must be 'post' or 'comment'"), 400

    row = db.execute_query(
        "SELECT 1 FROM notification_mute WHERE user_id = %s AND target_type = %s AND target_id = %s",
        (user.id, target_type, target_id), fetchone=True)

    return {"muted": row is not None}


def _encode_activity_cursor(created_time, item_id):
    """Encode a cursor for activity pagination."""
    import base64 as b64
    payload = json.dumps({"v": str(created_time), "id": str(item_id)})
    return b64.urlsafe_b64encode(payload.encode()).decode()


def _decode_activity_cursor(cursor):
    """Decode an activity cursor. Returns (created_time_str, item_id) or None."""
    import base64 as b64
    try:
        payload = json.loads(b64.urlsafe_b64decode(cursor))
        return payload["v"], payload["id"]
    except Exception:
        return None


@require_auth("normal")
def get_user_activity(type_=None, cursor=None, limit=None, token_info=None, user_id=None):  # noqa: E501
    """Get current user's recent posts and comments.

    :param type_: Filter by activity type (posts, comments, all).
                  Named type_ because connexion's pythonic_params renames
                  'type' to avoid shadowing the Python builtin.
    :param cursor: Pagination cursor
    :param limit: Number of items per page
    :param token_info: JWT token info
    :rtype: Union[dict, Tuple[dict, int]]
    """

    activity_type = type_ or "all"
    if limit is None:
        limit = 20
    limit = max(1, min(limit, 50))

    # Build UNION query
    parts = []
    params = []

    cursor_vals = None
    if cursor:
        cursor_vals = _decode_activity_cursor(cursor)

    if activity_type in ("all", "posts"):
        cursor_clause = ""
        if cursor_vals:
            cursor_clause = "AND (p.created_time < %s OR (p.created_time = %s AND p.id::text < %s))"
            params_post = [user_id, cursor_vals[0], cursor_vals[0], cursor_vals[1]]
        else:
            params_post = [user_id]

        parts.append(f"""
            SELECT p.id, 'post' AS type, p.title, p.body,
                   p.id AS post_id, p.title AS post_title,
                   pc.label AS post_session_label,
                   pl.code AS post_location_code,
                   p.upvote_count, p.downvote_count, p.score,
                   p.comment_count, p.created_time, p.status
            FROM post p
            LEFT JOIN session pc ON pc.id = p.session_id
            LEFT JOIN location pl ON pl.id = p.location_id
            WHERE p.creator_user_id = %s
              AND p.status != 'removed'
              {cursor_clause}
        """)
        params.extend(params_post)

    if activity_type in ("all", "comments"):
        cursor_clause = ""
        if cursor_vals:
            cursor_clause = "AND (c.created_time < %s OR (c.created_time = %s AND c.id::text < %s))"
            params_comment = [user_id, cursor_vals[0], cursor_vals[0], cursor_vals[1]]
        else:
            params_comment = [user_id]

        parts.append(f"""
            SELECT c.id, 'comment' AS type, NULL AS title, c.body,
                   c.post_id, pt.title AS post_title,
                   pc.label AS post_session_label,
                   pl.code AS post_location_code,
                   c.upvote_count, c.downvote_count, c.score,
                   NULL AS comment_count, c.created_time, c.status
            FROM comment c
            LEFT JOIN post pt ON pt.id = c.post_id
            LEFT JOIN session pc ON pc.id = pt.session_id
            LEFT JOIN location pl ON pl.id = pt.location_id
            WHERE c.creator_user_id = %s
              AND c.status != 'removed'
              {cursor_clause}
        """)
        params.extend(params_comment)

    if not parts:
        return {"items": [], "nextCursor": None, "hasMore": False}

    union_query = " UNION ALL ".join(parts)
    full_query = f"""
        SELECT * FROM ({union_query}) AS activity
        ORDER BY created_time DESC, id DESC
        LIMIT %s
    """
    params.append(limit + 1)

    rows = db.execute_query(full_query, tuple(params))
    if rows is None:
        rows = []

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    items = []
    for row in rows:
        item = {
            "id": str(row["id"]),
            "type": row["type"],
            "title": row["title"],
            "body": row["body"][:200] if row["body"] else "",
            "postId": str(row["post_id"]) if row["post_id"] else None,
            "postTitle": row["post_title"],
            "postSessionLabel": row["post_session_label"],
            "postLocationCode": row["post_location_code"],
            "upvoteCount": row["upvote_count"] or 0,
            "downvoteCount": row["downvote_count"] or 0,
            "score": float(row["score"] or 0),
            "commentCount": row["comment_count"],
            "createdTime": row["created_time"].isoformat() if row["created_time"] else None,
            "status": row["status"],
        }
        items.append(item)

    next_cursor = None
    if has_more and rows:
        last = rows[-1]
        next_cursor = _encode_activity_cursor(
            last["created_time"].isoformat(), str(last["id"])
        )

    return {"items": items, "nextCursor": next_cursor, "hasMore": has_more}


def get_user_activity_by_id(user_id, type_=None, cursor=None, limit=None, token_info=None):  # noqa: E501
    """Get a user's recent posts and comments by user ID.

    :param user_id: ID of the user whose activity to retrieve
    :param type_: Filter by activity type (posts, comments, all)
    :param cursor: Pagination cursor
    :param limit: Number of items per page
    :param token_info: JWT token info
    :rtype: Union[dict, Tuple[dict, int]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    # Verify user exists
    user_row = db.execute_query(
        "SELECT id FROM users WHERE id = %s", (user_id,), fetchone=True)
    if user_row is None:
        return ErrorModel(404, "User not found"), 404

    activity_type = type_ or "all"
    if limit is None:
        limit = 20
    limit = max(1, min(limit, 50))

    parts = []
    params = []

    cursor_vals = None
    if cursor:
        cursor_vals = _decode_activity_cursor(cursor)

    if activity_type in ("all", "posts"):
        cursor_clause = ""
        if cursor_vals:
            cursor_clause = "AND (p.created_time < %s OR (p.created_time = %s AND p.id::text < %s))"
            params_post = [user_id, cursor_vals[0], cursor_vals[0], cursor_vals[1]]
        else:
            params_post = [user_id]

        parts.append(f"""
            SELECT p.id, 'post' AS type, p.title, p.body,
                   p.id AS post_id, p.title AS post_title,
                   pc.label AS post_session_label,
                   pl.code AS post_location_code,
                   p.upvote_count, p.downvote_count, p.score,
                   p.comment_count, p.created_time, p.status
            FROM post p
            LEFT JOIN session pc ON pc.id = p.session_id
            LEFT JOIN location pl ON pl.id = p.location_id
            WHERE p.creator_user_id = %s
              AND p.status != 'removed'
              {cursor_clause}
        """)
        params.extend(params_post)

    if activity_type in ("all", "comments"):
        cursor_clause = ""
        if cursor_vals:
            cursor_clause = "AND (c.created_time < %s OR (c.created_time = %s AND c.id::text < %s))"
            params_comment = [user_id, cursor_vals[0], cursor_vals[0], cursor_vals[1]]
        else:
            params_comment = [user_id]

        parts.append(f"""
            SELECT c.id, 'comment' AS type, NULL AS title, c.body,
                   c.post_id, pt.title AS post_title,
                   pc.label AS post_session_label,
                   pl.code AS post_location_code,
                   c.upvote_count, c.downvote_count, c.score,
                   NULL AS comment_count, c.created_time, c.status
            FROM comment c
            LEFT JOIN post pt ON pt.id = c.post_id
            LEFT JOIN session pc ON pc.id = pt.session_id
            LEFT JOIN location pl ON pl.id = pt.location_id
            WHERE c.creator_user_id = %s
              AND c.status != 'removed'
              {cursor_clause}
        """)
        params.extend(params_comment)

    if not parts:
        return {"items": [], "nextCursor": None, "hasMore": False}

    union_query = " UNION ALL ".join(parts)
    full_query = f"""
        SELECT * FROM ({union_query}) AS activity
        ORDER BY created_time DESC, id DESC
        LIMIT %s
    """
    params.append(limit + 1)

    rows = db.execute_query(full_query, tuple(params))
    if rows is None:
        rows = []

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    items = []
    for row in rows:
        item = {
            "id": str(row["id"]),
            "type": row["type"],
            "title": row["title"],
            "body": row["body"][:200] if row["body"] else "",
            "postId": str(row["post_id"]) if row["post_id"] else None,
            "postTitle": row["post_title"],
            "postSessionLabel": row["post_session_label"],
            "postLocationCode": row["post_location_code"],
            "upvoteCount": row["upvote_count"] or 0,
            "downvoteCount": row["downvote_count"] or 0,
            "score": float(row["score"] or 0),
            "commentCount": row["comment_count"],
            "createdTime": row["created_time"].isoformat() if row["created_time"] else None,
            "status": row["status"],
        }
        items.append(item)

    next_cursor = None
    if has_more and rows:
        last = rows[-1]
        next_cursor = _encode_activity_cursor(
            last["created_time"].isoformat(), str(last["id"])
        )

    return {"items": items, "nextCursor": next_cursor, "hasMore": has_more}


@require_auth("normal")
def update_diagnostics_consent(body, token_info=None, user_id=None):  # noqa: E501
    """Update diagnostics consent preference

    :param body: Request body with consent boolean
    :type body: dict
    :param token_info: JWT token info
    :type token_info: dict

    :rtype: Union[dict, Tuple[dict, int]]
    """
    user = token_to_user(token_info)

    consent = body.get('consent')
    if consent is None:
        return ErrorModel(400, "consent is required"), 400

    db.execute_query("""
        UPDATE users SET diagnostics_consent = %s, updated_time = CURRENT_TIMESTAMP
        WHERE id = %s
    """, (bool(consent), user.id))

    return {"diagnosticsConsent": bool(consent)}
