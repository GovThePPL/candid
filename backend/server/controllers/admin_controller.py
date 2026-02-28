import connexion
from typing import Dict
from typing import Tuple
from typing import Union
import uuid

from candid.models.create_survey_request import CreateSurveyRequest  # noqa: E501
from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.survey import Survey  # noqa: E501
from candid.models.survey_question import SurveyQuestion  # noqa: E501
from candid.models.survey_question_option import SurveyQuestionOption  # noqa: E501
from candid.models.update_survey_request import UpdateSurveyRequest  # noqa: E501
from candid.models.user import User  # noqa: E501
from candid import util

from candid.controllers import db, config
from candid.controllers.helpers.auth import (
    authorization_site_admin, authorization_scoped, token_to_user,
    is_admin_at_location, is_moderator_at_location, is_facilitator_for,
    get_location_descendants, get_location_ancestors, get_user_roles,
    invalidate_location_cache, invalidate_ban_cache,
)
from candid.controllers.helpers.constants import (
    VALID_PROPOSAL_METHODS, PROPOSAL_METHOD_INITIAL_STAGE,
)
from candid.controllers.helpers.admin import (
    get_user_card as _get_user_card,
    build_survey_with_nested_data as _build_survey_with_nested_data,
    build_pairwise_survey as _build_pairwise_survey,
    get_group_user_ids as _get_group_user_ids,
    compute_pairwise_rankings as _compute_pairwise_rankings,
    notify_peers as _notify_peers,
    notify_request_outcome as _notify_request_outcome,
    notify_role_target as _notify_role_target,
    notify_admin_action as _notify_admin_action,
    get_admins_at_location as _get_admins_at_location,
    check_auto_approve_expired as _check_auto_approve_expired,
    apply_role_change as _apply_role_change,
    find_approval_peer as _find_approval_peer,
    get_requester_authority_location as _get_requester_authority_location,
    format_role_request as _format_role_request,
    ADMIN_ASSIGNABLE as _ADMIN_ASSIGNABLE,
    FACILITATOR_ASSIGNABLE as _FACILITATOR_ASSIGNABLE,
    ALL_ASSIGNABLE as _ALL_ASSIGNABLE,
    build_rule_response as _build_rule_response,
    get_rule_authority_location as _get_rule_authority_location,
    find_rule_approval_peer as _find_rule_approval_peer,
    apply_rule_change as _apply_rule_change,
    format_rule_request as _format_rule_request,
    check_rule_auto_approve_expired as _check_rule_auto_approve_expired,
    VALID_CONTENT_TYPES as _VALID_CONTENT_TYPES,
    VALID_POST_TYPES as _VALID_POST_TYPES,
)


def create_survey(body, token_info=None):  # noqa: E501
    """Create a new survey

     # noqa: E501

    :param create_survey_request:
    :type create_survey_request: dict | bytes

    :rtype: Union[Survey, Tuple[Survey, int], Tuple[Survey, int, Dict[str, str]]
    """
    create_survey_request = body
    if connexion.request.is_json:
        create_survey_request = CreateSurveyRequest.from_dict(connexion.request.get_json())  # noqa: E501

    # Scoped surveys: facilitator+ at that scope.  Unscoped (global): site admin only.
    loc_id = create_survey_request.location_id
    sess_id = create_survey_request.session_id
    if loc_id:
        authorized, auth_err = authorization_scoped(
            'facilitator', token_info, location_id=loc_id, session_id=sess_id,
        )
    else:
        authorized, auth_err = authorization_site_admin(token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    # Validate questions array is not empty
    if not create_survey_request.questions or len(create_survey_request.questions) == 0:
        return ErrorModel(400, "At least one question is required"), 400

    # Generate survey ID
    survey_id = str(uuid.uuid4())

    # Insert survey
    db.execute_query("""
        INSERT INTO survey (id, creator_user_id, session_id, location_id, survey_title, start_time, end_time, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'active')
    """, (
        survey_id,
        user.id,
        create_survey_request.session_id,
        create_survey_request.location_id,
        create_survey_request.survey_title,
        create_survey_request.start_time,
        create_survey_request.end_time
    ))

    # Insert questions and options
    for q in create_survey_request.questions:
        question_id = str(uuid.uuid4())
        db.execute_query("""
            INSERT INTO survey_question (id, survey_id, survey_question)
            VALUES (%s, %s, %s)
        """, (question_id, survey_id, q.question))

        # Insert options for this question
        if q.options:
            for option_text in q.options:
                option_id = str(uuid.uuid4())
                db.execute_query("""
                    INSERT INTO survey_question_option (id, survey_question_id, survey_question_option)
                    VALUES (%s, %s, %s)
                """, (option_id, question_id, option_text))

    return _build_survey_with_nested_data(survey_id), 201


def delete_survey(survey_id, token_info=None):  # noqa: E501
    """Delete a survey

     # noqa: E501

    :param survey_id:
    :type survey_id: str
    :type survey_id: str

    :rtype: Union[None, Tuple[None, int], Tuple[None, int, Dict[str, str]]
    """
    # Check survey exists and is not already deleted
    survey = db.execute_query("""
        SELECT id, status, location_id, session_id FROM survey WHERE id = %s
    """, (survey_id,), fetchone=True)

    if survey is None:
        return ErrorModel(404, "Survey not found"), 404

    # Scoped surveys: facilitator+ at that scope.  Unscoped (global): site admin only.
    loc_id = str(survey['location_id']) if survey.get('location_id') else None
    sess_id = str(survey['session_id']) if survey.get('session_id') else None
    if loc_id:
        authorized, auth_err = authorization_scoped(
            'facilitator', token_info, location_id=loc_id, session_id=sess_id,
        )
    else:
        authorized, auth_err = authorization_site_admin(token_info)
    if not authorized:
        return auth_err, auth_err.code

    if survey['status'] == 'deleted':
        return ErrorModel(404, "Survey not found"), 404

    # Soft delete - set status to 'deleted'
    db.execute_query("""
        UPDATE survey SET status = 'deleted', updated_time = CURRENT_TIMESTAMP WHERE id = %s
    """, (survey_id,))

    return '', 204


def get_survey_by_id_admin(survey_id, token_info=None):  # noqa: E501
    """Get a specific survey (admin access)

     # noqa: E501

    :param survey_id:
    :type survey_id: str
    :type survey_id: str

    :rtype: Union[Survey, Tuple[Survey, int], Tuple[Survey, int, Dict[str, str]]
    """
    # Look up survey scope for authorization
    row = db.execute_query("""
        SELECT location_id, session_id FROM survey WHERE id = %s
    """, (survey_id,), fetchone=True)
    if row is None:
        return ErrorModel(404, "Survey not found"), 404

    # Scoped surveys: facilitator+ at that scope.  Unscoped (global): site admin only.
    loc_id = str(row['location_id']) if row.get('location_id') else None
    sess_id = str(row['session_id']) if row.get('session_id') else None
    if loc_id:
        authorized, auth_err = authorization_scoped(
            'facilitator', token_info, location_id=loc_id, session_id=sess_id,
        )
    else:
        authorized, auth_err = authorization_site_admin(token_info)
    if not authorized:
        return auth_err, auth_err.code

    survey = _build_survey_with_nested_data(survey_id)
    if survey is None:
        return ErrorModel(404, "Survey not found"), 404

    return survey


def get_surveys(title=None, status=None, created_after=None, created_before=None, location_id=None, session_id=None, token_info=None):  # noqa: E501
    """Get a list of surveys

     # noqa: E501

    :param title: Filter surveys by title (partial match)
    :type title: str
    :param status: Filter surveys by active status
    :type status: str
    :param created_after: Filter surveys created after this timestamp
    :type created_after: str
    :param created_before: Filter surveys created before this timestamp
    :type created_before: str

    :rtype: Union[List[Survey], Tuple[List[Survey], int], Tuple[List[Survey], int, Dict[str, str]]
    """
    authorized, auth_err = authorization_scoped("assistant_moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    created_after = util.deserialize_datetime(created_after)
    created_before = util.deserialize_datetime(created_before)

    # Build dynamic WHERE clause
    conditions = []
    params = []

    # Status filter - default excludes 'deleted' unless explicitly requested
    if status and status != 'all':
        conditions.append("status = %s")
        params.append(status)
    elif status != 'deleted':
        # Exclude deleted by default
        conditions.append("status != 'deleted'")

    # Title filter (partial match, case-insensitive)
    if title:
        conditions.append("LOWER(survey_title) LIKE LOWER(%s)")
        params.append(f'%{title}%')

    # Location filter
    if location_id:
        conditions.append("location_id = %s")
        params.append(location_id)

    # Session filter
    if session_id:
        conditions.append("session_id = %s")
        params.append(session_id)

    # Date filters
    if created_after:
        conditions.append("created_time >= %s")
        params.append(created_after)

    if created_before:
        conditions.append("created_time <= %s")
        params.append(created_before)

    # Build query
    query = "SELECT id, survey_type FROM survey"
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY created_time DESC"

    survey_rows = db.execute_query(query, tuple(params) if params else None)

    if survey_rows is None:
        survey_rows = []

    surveys = []
    for row in survey_rows:
        if row['survey_type'] == 'pairwise':
            survey = _build_pairwise_survey(row['id'])
        else:
            survey = _build_survey_with_nested_data(row['id'])
        if survey:
            surveys.append(survey)

    return surveys


def update_survey(survey_id, body, token_info=None):  # noqa: E501
    """Update a survey

     # noqa: E501

    :param survey_id:
    :type survey_id: str
    :type survey_id: str
    :param survey:
    :type survey: dict | bytes

    :rtype: Union[Survey, Tuple[Survey, int], Tuple[Survey, int, Dict[str, str]]
    """
    # Check survey exists and is not deleted
    existing = db.execute_query("""
        SELECT id, status, location_id, session_id FROM survey WHERE id = %s
    """, (survey_id,), fetchone=True)

    if existing is None:
        return ErrorModel(404, "Survey not found"), 404

    if existing['status'] == 'deleted':
        return ErrorModel(404, "Survey not found"), 404

    # Scoped surveys: facilitator+ at that scope.  Unscoped (global): site admin only.
    loc_id = str(existing['location_id']) if existing.get('location_id') else None
    sess_id = str(existing['session_id']) if existing.get('session_id') else None
    if loc_id:
        authorized, auth_err = authorization_scoped(
            'facilitator', token_info, location_id=loc_id, session_id=sess_id,
        )
    else:
        authorized, auth_err = authorization_site_admin(token_info)
    if not authorized:
        return auth_err, auth_err.code

    update_request = body
    if connexion.request.is_json:
        update_request = UpdateSurveyRequest.from_dict(connexion.request.get_json())  # noqa: E501

    # Build dynamic update query for metadata fields only
    set_clauses = []
    params = []

    if update_request.survey_title is not None:
        set_clauses.append("survey_title = %s")
        params.append(update_request.survey_title)

    if update_request.session_id is not None:
        set_clauses.append("session_id = %s")
        params.append(update_request.session_id)

    if update_request.start_time is not None:
        set_clauses.append("start_time = %s")
        params.append(update_request.start_time)

    if update_request.end_time is not None:
        set_clauses.append("end_time = %s")
        params.append(update_request.end_time)

    if not set_clauses:
        return ErrorModel(400, "No fields provided to update"), 400

    set_clauses.append("updated_time = CURRENT_TIMESTAMP")
    params.append(survey_id)

    query = f"UPDATE survey SET {', '.join(set_clauses)} WHERE id = %s"
    db.execute_query(query, tuple(params))

    return _build_survey_with_nested_data(survey_id)


def create_pairwise_survey(body, token_info=None):  # noqa: E501
    """Create a pairwise comparison survey

     # noqa: E501

    :param body: CreatePairwiseSurveyRequest
    :type body: dict | bytes

    :rtype: Union[dict, Tuple[dict, int], Tuple[dict, int, Dict[str, str]]
    """
    # Parse request body
    if connexion.request.is_json:
        body = connexion.request.get_json()

    survey_title = body.get('surveyTitle')
    items = body.get('items', [])
    comparison_question = body.get('comparisonQuestion', "Which better describes this group's views?")
    polis_conversation_id = body.get('polisConversationId')
    location_id = body.get('locationId')
    session_id = body.get('sessionId')
    phase = body.get('phase')

    # Scoped surveys: facilitator+ at that scope.  Unscoped (global): site admin only.
    if location_id:
        authorized, auth_err = authorization_scoped(
            'facilitator', token_info, location_id=location_id, session_id=session_id,
        )
    else:
        authorized, auth_err = authorization_site_admin(token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)
    start_time = body.get('startTime')
    end_time = body.get('endTime')
    is_group_labeling = body.get('isGroupLabeling', False)

    # Validate phase
    if phase and phase not in ('proposal', 'opinion', 'reflection'):
        return ErrorModel(400, "phase must be 'proposal', 'opinion', or 'reflection'"), 400

    # Validate items
    if not items or len(items) < 2:
        return ErrorModel(400, "At least 2 items are required"), 400

    if len(items) > 20:
        return ErrorModel(400, "Maximum 20 items allowed"), 400

    # Generate survey ID
    survey_id = str(uuid.uuid4())

    # Insert survey with survey_type='pairwise'
    db.execute_query("""
        INSERT INTO survey (id, creator_user_id, survey_title, survey_type, comparison_question,
                           polis_conversation_id, location_id, session_id, start_time, end_time,
                           is_group_labeling, phase, status)
        VALUES (%s, %s, %s, 'pairwise', %s, %s, %s, %s, %s, %s, %s, %s, 'active')
    """, (
        survey_id,
        user.id,
        survey_title,
        comparison_question,
        polis_conversation_id,
        location_id,
        session_id,
        start_time,
        end_time,
        is_group_labeling,
        phase,
    ))

    # Insert pairwise items
    for i, item_text in enumerate(items):
        item_id = str(uuid.uuid4())
        db.execute_query("""
            INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
            VALUES (%s, %s, %s, %s)
        """, (item_id, survey_id, item_text, i))

    # Return the created survey
    return _build_pairwise_survey(survey_id), 201


def get_pairwise_rankings(survey_id, group_id=None, token_info=None):  # noqa: E501
    """Get win-count rankings from pairwise survey

     # noqa: E501

    :param survey_id: Survey ID
    :type survey_id: str
    :param group_id: Optional Polis group ID filter
    :type group_id: str

    :rtype: Union[dict, Tuple[dict, int], Tuple[dict, int, Dict[str, str]]
    """
    authorized, auth_err = authorization_site_admin(token_info)
    if not authorized:
        return auth_err, auth_err.code

    # Check survey exists and is pairwise type
    survey = db.execute_query("""
        SELECT id, survey_type, polis_conversation_id
        FROM survey WHERE id = %s
    """, (survey_id,), fetchone=True)

    if survey is None:
        return ErrorModel(404, "Survey not found"), 404

    if survey['survey_type'] != 'pairwise':
        return ErrorModel(400, "Survey is not a pairwise survey"), 400

    polis_conv_id = survey['polis_conversation_id']

    # Get total response count
    total_responses = db.execute_query("""
        SELECT COUNT(*) as count FROM pairwise_response WHERE survey_id = %s
    """, (survey_id,), fetchone=True)['count']

    # If group_id provided and we have a polis conversation, filter by group membership
    user_id_filter = None
    if group_id and polis_conv_id:
        user_id_filter = _get_group_user_ids(polis_conv_id, group_id)
        if user_id_filter is None:
            # Group not found
            return ErrorModel(404, "Group not found"), 404

    # Compute rankings
    rankings = _compute_pairwise_rankings(survey_id, user_id_filter)

    return {
        "surveyId": str(survey_id),
        "totalResponses": total_responses,
        "rankings": rankings
    }


# ---------------------------------------------------------------------------
# User Search API
# ---------------------------------------------------------------------------

def search_users(search=None, limit=20, offset=0, token_info=None):  # noqa: E501
    """Search users by username or display name.

    GET /admin/users?search=&limit=&offset=
    Auth: assistant_moderator+ (any scoped role holder).
    """
    authorized, auth_err = authorization_scoped("assistant_moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    limit = min(int(limit or 20), 100)
    offset = int(offset or 0)

    if search:
        pattern = f"%{search}%"
        rows = db.execute_query("""
            SELECT id, username, display_name, avatar_icon_url, status
            FROM users
            WHERE (username ILIKE %s OR display_name ILIKE %s)
              AND status != 'deleted'
            ORDER BY username ASC
            LIMIT %s OFFSET %s
        """, (pattern, pattern, limit, offset))
    else:
        rows = db.execute_query("""
            SELECT id, username, display_name, avatar_icon_url, status
            FROM users
            WHERE status != 'deleted'
            ORDER BY username ASC
            LIMIT %s OFFSET %s
        """, (limit, offset))

    return [
        {
            'id': str(r['id']),
            'username': r['username'],
            'displayName': r['display_name'],
            'avatarIconUrl': r.get('avatar_icon_url'),
            'status': r['status'],
        }
        for r in (rows or [])
    ]


# ---------------------------------------------------------------------------
# Role Management API (Phase 6)
# ---------------------------------------------------------------------------

def create_role_request(body, token_info=None):  # noqa: E501
    """Create a role change request (assign or remove).

    POST /admin/roles/requests

    For assign: Admins can request admin, moderator, facilitator (at their location or descendants).
    Facilitators can request: assistant_moderator, expert, liaison (at their location+session).
    For remove: specify userRoleId of the role to remove.
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    action = body.get('action')
    if action not in ('assign', 'remove'):
        return ErrorModel(400, "action must be 'assign' or 'remove'"), 400

    # Dispatch to remove handler
    if action == 'remove':
        return _handle_role_removal(body, user, token_info)

    target_user_id = body.get('targetUserId')
    role = body.get('role')
    location_id = body.get('locationId')
    session_id = body.get('sessionId')
    reason = body.get('reason', '')

    # Validate inputs
    if not target_user_id or not role or not location_id:
        return ErrorModel(400, "targetUserId, role, and locationId are required"), 400

    if role not in _ALL_ASSIGNABLE:
        return ErrorModel(400, f"Invalid role: {role}"), 400

    # Validate target user exists
    target = db.execute_query("SELECT id FROM users WHERE id = %s", (target_user_id,), fetchone=True)
    if not target:
        return ErrorModel(400, "Target user not found"), 400

    # Validate location exists (exclude soft-deleted)
    loc = db.execute_query("SELECT id FROM location WHERE id = %s AND deleted_at IS NULL", (location_id,), fetchone=True)
    if not loc:
        return ErrorModel(400, "Location not found"), 400

    # Session required for non-hierarchical roles
    if role in _FACILITATOR_ASSIGNABLE and not session_id:
        return ErrorModel(400, "sessionId is required for this role"), 400

    if session_id:
        sess = db.execute_query("SELECT id FROM session WHERE id = %s", (session_id,), fetchone=True)
        if not sess:
            return ErrorModel(400, "Session not found"), 400

    # Check authorization: does the requester have authority?
    authority_loc = _get_requester_authority_location(str(user.id), role, location_id, session_id)
    if not authority_loc:
        return ErrorModel(403, "You do not have authority to assign this role at this location"), 403

    # Check if target already has this role
    if session_id:
        existing = db.execute_query("""
            SELECT id FROM user_role
            WHERE user_id = %s AND role = %s AND location_id = %s AND session_id = %s
        """, (target_user_id, role, location_id, session_id), fetchone=True)
    else:
        existing = db.execute_query("""
            SELECT id FROM user_role
            WHERE user_id = %s AND role = %s AND location_id = %s AND session_id IS NULL
        """, (target_user_id, role, location_id), fetchone=True)
    if existing:
        return ErrorModel(400, "User already has this role"), 400

    # Check for duplicate pending request
    dup_check_params = [target_user_id, role, location_id]
    dup_cat_clause = "AND session_id = %s" if session_id else "AND session_id IS NULL"
    if session_id:
        dup_check_params.append(session_id)
    dup = db.execute_query(f"""
        SELECT id FROM role_change_request
        WHERE action = 'assign' AND target_user_id = %s AND role = %s
        AND location_id = %s {dup_cat_clause} AND status = 'pending'
    """, tuple(dup_check_params), fetchone=True)
    if dup:
        return ErrorModel(400, "A pending request already exists for this role assignment"), 400

    # Compute auto-approve time
    from datetime import datetime, timezone, timedelta
    timeout_days = config.ROLE_APPROVAL_TIMEOUT_DAYS
    auto_approve_at = datetime.now(timezone.utc) + timedelta(days=timeout_days)

    # Create request
    request_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO role_change_request
            (id, action, target_user_id, role, location_id, session_id,
             requested_by, requester_authority_location_id, request_reason, auto_approve_at)
        VALUES (%s, 'assign', %s, %s, %s, %s, %s, %s, %s, %s)
    """, (request_id, target_user_id, role, location_id, session_id,
          str(user.id), authority_loc, reason, auto_approve_at))

    # Check if auto-approve (no peer available)
    peers = _find_approval_peer({
        'requested_by': str(user.id),
        'role': role,
        'location_id': location_id,
        'session_id': session_id,
        'requester_authority_location_id': authority_loc,
    })
    if peers is None:
        # Auto-approve immediately
        db.execute_query("""
            UPDATE role_change_request SET status = 'auto_approved', updated_time = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (request_id,))
        _apply_role_change({
            'action': 'assign',
            'target_user_id': target_user_id,
            'role': role,
            'location_id': location_id,
            'session_id': session_id,
            'requested_by': str(user.id),
        })
        # Notify requester + target about auto-approval
        loc_row = db.execute_query("SELECT name FROM location WHERE id = %s",
                                   (location_id,), fetchone=True)
        loc_name = loc_row['name'] if loc_row else 'Unknown'
        desc = f"assign {role} at {loc_name}"
        _notify_request_outcome(str(user.id), None, 'auto_approved',
                                desc, 'role_change')
        _notify_role_target(target_user_id, 'assign', role, loc_name,
                            actor_user_id=str(user.id))
        return {'id': request_id, 'status': 'auto_approved'}, 201

    # Notify approval peers
    target_name = db.execute_query("SELECT display_name FROM users WHERE id = %s",
                                    (target_user_id,), fetchone=True)
    target_display = target_name['display_name'] if target_name else 'a user'
    _notify_peers(peers, user.display_name, 'assign', role, target_display,
                  requester_user_id=str(user.id))

    return {'id': request_id, 'status': 'pending'}, 201


def _handle_role_removal(body, user, token_info=None):
    """Handle role removal request (internal helper called from create_role_request)."""
    user_role_id = body.get('userRoleId')
    reason = body.get('reason', '')

    if not user_role_id:
        return ErrorModel(400, "userRoleId is required"), 400

    # Fetch the existing role
    role_row = db.execute_query("""
        SELECT id, user_id, role, location_id, session_id
        FROM user_role WHERE id = %s
    """, (user_role_id,), fetchone=True)
    if not role_row:
        return ErrorModel(400, "Role assignment not found"), 400

    role = role_row['role']
    location_id = str(role_row['location_id']) if role_row['location_id'] else None
    session_id = str(role_row['session_id']) if role_row['session_id'] else None

    # Check authorization
    authority_loc = _get_requester_authority_location(str(user.id), role, location_id, session_id)
    if not authority_loc:
        return ErrorModel(403, "You do not have authority to remove this role"), 403

    # Check for duplicate pending request
    dup = db.execute_query("""
        SELECT id FROM role_change_request
        WHERE action = 'remove' AND user_role_id = %s AND status = 'pending'
    """, (user_role_id,), fetchone=True)
    if dup:
        return ErrorModel(400, "A pending removal request already exists"), 400

    from datetime import datetime, timezone, timedelta
    timeout_days = config.ROLE_APPROVAL_TIMEOUT_DAYS
    auto_approve_at = datetime.now(timezone.utc) + timedelta(days=timeout_days)

    request_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO role_change_request
            (id, action, target_user_id, role, location_id, session_id,
             user_role_id, requested_by, requester_authority_location_id, request_reason, auto_approve_at)
        VALUES (%s, 'remove', %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (request_id, str(role_row['user_id']), role, location_id, session_id,
          user_role_id, str(user.id), authority_loc, reason, auto_approve_at))

    # Check auto-approve
    peers = _find_approval_peer({
        'requested_by': str(user.id),
        'role': role,
        'location_id': location_id,
        'session_id': session_id,
        'requester_authority_location_id': authority_loc,
    })
    if peers is None:
        db.execute_query("""
            UPDATE role_change_request SET status = 'auto_approved', updated_time = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (request_id,))
        _apply_role_change({
            'action': 'remove',
            'user_role_id': user_role_id,
            'target_user_id': str(role_row['user_id']),
            'role': role,
            'location_id': location_id,
            'session_id': session_id,
            'requested_by': str(user.id),
        })
        # Notify requester + target about auto-approval
        loc_row = db.execute_query("SELECT name FROM location WHERE id = %s",
                                   (location_id,), fetchone=True) if location_id else None
        loc_name = loc_row['name'] if loc_row else 'Unknown'
        desc = f"remove {role} at {loc_name}"
        _notify_request_outcome(str(user.id), None, 'auto_approved',
                                desc, 'role_change')
        _notify_role_target(str(role_row['user_id']), 'remove', role, loc_name,
                            actor_user_id=str(user.id))
        return {'id': request_id, 'status': 'auto_approved'}, 201

    # Notify approval peers
    target_name = db.execute_query("SELECT display_name FROM users WHERE id = %s",
                                    (str(role_row['user_id']),), fetchone=True)
    target_display = target_name['display_name'] if target_name else 'a user'
    _notify_peers(peers, user.display_name, 'remove', role, target_display,
                  requester_user_id=str(user.id))

    return {'id': request_id, 'status': 'pending'}, 201


def get_pending_role_requests(token_info=None):  # noqa: E501
    """Get pending role change requests that the current user can approve.

    GET /admin/roles/pending
    """
    authorized, auth_err = authorization_scoped("assistant_moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    # First, auto-approve any expired requests
    _check_auto_approve_expired()

    # Get all pending requests
    requests = db.execute_query("""
        SELECT rcr.id, rcr.action, rcr.target_user_id, rcr.role,
               rcr.location_id, rcr.session_id, rcr.user_role_id,
               rcr.requested_by, rcr.requester_authority_location_id,
               rcr.request_reason, rcr.auto_approve_at, rcr.created_time,
               u_target.username AS target_username, u_target.display_name AS target_display_name,
               u_target.avatar_icon_url AS target_avatar_icon_url,
               u_target.status AS target_status, u_target.trust_score AS target_trust_score,
               u_target.kudos_count AS target_kudos_count,
               u_req.username AS requester_username, u_req.display_name AS requester_display_name,
               u_req.avatar_icon_url AS requester_avatar_icon_url,
               u_req.status AS requester_status, u_req.trust_score AS requester_trust_score,
               u_req.kudos_count AS requester_kudos_count,
               l.name AS location_name, l.code AS location_code,
               pc.label AS session_label
        FROM role_change_request rcr
        JOIN users u_target ON rcr.target_user_id = u_target.id
        JOIN users u_req ON rcr.requested_by = u_req.id
        LEFT JOIN location l ON rcr.location_id = l.id
        LEFT JOIN session pc ON rcr.session_id = pc.id
        WHERE rcr.status = 'pending'
        ORDER BY rcr.created_time ASC
    """)

    result = []
    for r in (requests or []):
        # Check if current user can approve this request
        peers = _find_approval_peer(r)
        if peers and str(user.id) in peers:
            result.append({
                'id': str(r['id']),
                'action': r['action'],
                'targetUser': {
                    'id': str(r['target_user_id']),
                    'username': r['target_username'],
                    'displayName': r['target_display_name'],
                    'status': r.get('target_status', 'active'),
                    'avatarIconUrl': r.get('target_avatar_icon_url'),
                    'trustScore': float(r['target_trust_score']) if r.get('target_trust_score') is not None else None,
                    'kudosCount': r.get('target_kudos_count', 0),
                },
                'role': r['role'],
                'location': {
                    'id': str(r['location_id']),
                    'name': r['location_name'],
                    'code': r['location_code'],
                } if r.get('location_id') else None,
                'session': {
                    'id': str(r['session_id']),
                    'label': r['session_label'],
                } if r.get('session_id') else None,
                'requester': {
                    'id': str(r['requested_by']),
                    'username': r['requester_username'],
                    'displayName': r['requester_display_name'],
                    'status': r.get('requester_status', 'active'),
                    'avatarIconUrl': r.get('requester_avatar_icon_url'),
                    'trustScore': float(r['requester_trust_score']) if r.get('requester_trust_score') is not None else None,
                    'kudosCount': r.get('requester_kudos_count', 0),
                },
                'reason': r.get('request_reason'),
                'autoApproveAt': r['auto_approve_at'].isoformat() if r.get('auto_approve_at') else None,
                'createdTime': r['created_time'].isoformat() if r.get('created_time') else None,
            })

    return result


def update_role_request(request_id, body, token_info=None):  # noqa: E501
    """Update a role change request (approve, deny, or rescind).

    PATCH /admin/roles/requests/{requestId}
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    new_status = body.get('status')
    if new_status not in ('approved', 'denied', 'rescinded'):
        return ErrorModel(400, "status must be 'approved', 'denied', or 'rescinded'"), 400

    # Auto-approve expired first
    _check_auto_approve_expired()

    req = db.execute_query("""
        SELECT * FROM role_change_request WHERE id = %s
    """, (request_id,), fetchone=True)

    if not req:
        return ErrorModel(404, "Request not found"), 404

    if req['status'] != 'pending':
        return ErrorModel(400, f"Request is already {req['status']}"), 400

    # Resolve location name for notifications
    loc_row = db.execute_query("SELECT name FROM location WHERE id = %s",
                               (str(req['location_id']),), fetchone=True) if req.get('location_id') else None
    loc_name = loc_row['name'] if loc_row else 'Unknown'
    desc = f"{req['action']} {req['role']} at {loc_name}"

    if new_status == 'rescinded':
        # Only the original requester can rescind
        if str(req['requested_by']) != str(user.id):
            return ErrorModel(403, "Only the original requester can rescind"), 403

        db.execute_query("""
            UPDATE role_change_request
            SET status = 'rescinded', updated_time = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (request_id,))

        # Notify approval peers about rescission
        peers = _find_approval_peer(req)
        if peers:
            for peer_id in peers:
                _notify_request_outcome(peer_id, user.display_name, 'rescinded',
                                        desc, 'role_change',
                                        actor_user_id=str(user.id))

        return {'id': str(req['id']), 'status': 'rescinded'}

    # Approve or deny: verify this user can review
    peers = _find_approval_peer(req)
    if not peers or str(user.id) not in peers:
        return ErrorModel(403, "You are not authorized to review this request"), 403

    if new_status == 'approved':
        db.execute_query("""
            UPDATE role_change_request
            SET status = 'approved', reviewed_by = %s, updated_time = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (str(user.id), request_id))

        _apply_role_change(req)

        # Notify requester of approval
        _notify_request_outcome(str(req['requested_by']), user.display_name,
                                'approved', desc, 'role_change',
                                actor_user_id=str(user.id))
        # Notify role target
        _notify_role_target(str(req['target_user_id']), req['action'],
                            req['role'], loc_name,
                            actor_user_id=str(user.id))

        return {'id': str(req['id']), 'status': 'approved'}

    else:  # denied
        denial_reason = body.get('reason', '')
        db.execute_query("""
            UPDATE role_change_request
            SET status = 'denied', reviewed_by = %s, denial_reason = %s, updated_time = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (str(user.id), denial_reason, request_id))

        # Notify requester of denial
        _notify_request_outcome(str(req['requested_by']), user.display_name,
                                'denied', desc, 'role_change',
                                actor_user_id=str(user.id))

        return {'id': str(req['id']), 'status': 'denied'}


_ROLE_REQUEST_SELECT = """
    SELECT rcr.id, rcr.action, rcr.target_user_id, rcr.role,
           rcr.location_id, rcr.session_id, rcr.user_role_id,
           rcr.requested_by, rcr.requester_authority_location_id,
           rcr.request_reason, rcr.auto_approve_at, rcr.created_time,
           rcr.status, rcr.denial_reason, rcr.updated_time,
           u_target.username AS target_username, u_target.display_name AS target_display_name,
           u_target.avatar_icon_url AS target_avatar_icon_url,
           u_target.status AS target_status, u_target.trust_score AS target_trust_score,
           u_target.kudos_count AS target_kudos_count,
           u_req.username AS requester_username, u_req.display_name AS requester_display_name,
           u_req.avatar_icon_url AS requester_avatar_icon_url,
           u_req.status AS requester_status, u_req.trust_score AS requester_trust_score,
           u_req.kudos_count AS requester_kudos_count,
           l.name AS location_name, l.code AS location_code,
           pc.label AS session_label,
           u_rev.id AS reviewer_id, u_rev.username AS reviewer_username,
           u_rev.display_name AS reviewer_display_name,
           u_rev.avatar_icon_url AS reviewer_avatar_icon_url,
           u_rev.status AS reviewer_status, u_rev.trust_score AS reviewer_trust_score,
           u_rev.kudos_count AS reviewer_kudos_count
    FROM role_change_request rcr
    JOIN users u_target ON rcr.target_user_id = u_target.id
    JOIN users u_req ON rcr.requested_by = u_req.id
    LEFT JOIN location l ON rcr.location_id = l.id
    LEFT JOIN session pc ON rcr.session_id = pc.id
    LEFT JOIN users u_rev ON rcr.reviewed_by = u_rev.id
"""


def get_role_requests(view=None, token_info=None):  # noqa: E501
    """Get role change requests with view filter.

    GET /admin/roles/requests?view=pending|all|mine
    """
    authorized, auth_err = authorization_scoped("assistant_moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)
    view = view or 'pending'

    # Auto-approve expired before any view
    _check_auto_approve_expired()

    if view == 'pending':
        # Same logic as get_pending_role_requests: pending + filterable by peer
        requests = db.execute_query(
            _ROLE_REQUEST_SELECT + " WHERE rcr.status = 'pending' ORDER BY rcr.created_time ASC"
        )
        result = []
        for r in (requests or []):
            peers = _find_approval_peer(r)
            if peers and str(user.id) in peers:
                result.append(_format_role_request(r))
        return result

    elif view == 'mine':
        requests = db.execute_query(
            _ROLE_REQUEST_SELECT + " WHERE rcr.requested_by = %s ORDER BY rcr.created_time DESC",
            (str(user.id),)
        )
        return [_format_role_request(r) for r in (requests or [])]

    elif view == 'all':
        # Compute user's scope from their roles
        roles = get_user_roles(str(user.id))
        scope_locs = set()
        for ur in roles:
            loc_id = str(ur['location_id']) if ur.get('location_id') else None
            if not loc_id:
                continue
            r = ur['role']
            if r in ('admin', 'moderator'):
                descendants = get_location_descendants(loc_id)
                scope_locs.update(descendants)
            elif r in ('facilitator', 'assistant_moderator'):
                scope_locs.add(loc_id)

        if not scope_locs:
            return []

        scope_list = list(scope_locs)
        requests = db.execute_query(
            _ROLE_REQUEST_SELECT +
            " WHERE rcr.location_id = ANY(%s::uuid[]) ORDER BY rcr.created_time DESC LIMIT 200",
            (scope_list,)
        )
        return [_format_role_request(r) for r in (requests or [])]

    else:
        return ErrorModel(400, f"Invalid view: {view}"), 400


def list_roles(user_id=None, location_id=None, role=None, session_id=None, token_info=None):  # noqa: E501
    """List roles with optional filters.

    GET /admin/roles
    """
    authorized, auth_err = authorization_scoped("assistant_moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    conditions = []
    params = []

    if user_id:
        conditions.append("ur.user_id = %s")
        params.append(user_id)
    if location_id:
        conditions.append("ur.location_id = %s")
        params.append(location_id)
    if role:
        conditions.append("ur.role = %s")
        params.append(role)
    if session_id:
        conditions.append("ur.session_id = %s")
        params.append(session_id)

    where = ""
    if conditions:
        where = "WHERE " + " AND ".join(conditions)

    rows = db.execute_query(f"""
        SELECT ur.id, ur.user_id, ur.role, ur.location_id, ur.session_id,
               ur.assigned_by, ur.created_time,
               u.username, u.display_name, u.avatar_icon_url, u.trust_score,
               u.kudos_count,
               l.name AS location_name, l.code AS location_code,
               pc.label AS session_label
        FROM user_role ur
        JOIN users u ON ur.user_id = u.id
        LEFT JOIN location l ON ur.location_id = l.id
        LEFT JOIN session pc ON ur.session_id = pc.id
        {where}
        ORDER BY ur.created_time DESC
    """, tuple(params) if params else None)

    result = []
    for r in (rows or []):
        result.append({
            'id': str(r['id']),
            'user': {
                'id': str(r['user_id']),
                'username': r['username'],
                'displayName': r['display_name'],
                'avatarIconUrl': r.get('avatar_icon_url'),
                'trustScore': float(r['trust_score']) if r.get('trust_score') is not None else None,
                'kudosCount': r['kudos_count'],
            },
            'role': r['role'],
            'location': {
                'id': str(r['location_id']),
                'name': r['location_name'],
                'code': r['location_code'],
            } if r.get('location_id') else None,
            'session': {
                'id': str(r['session_id']),
                'label': r['session_label'],
            } if r.get('session_id') else None,
            'assignedBy': str(r['assigned_by']) if r.get('assigned_by') else None,
            'createdTime': r['created_time'].isoformat() if r.get('created_time') else None,
        })

    return result


# ---------------------------------------------------------------------------
# Location Management API (Phase 7)
# ---------------------------------------------------------------------------

def create_location(body, token_info=None):  # noqa: E501
    """Create a child location.

    POST /admin/locations
    Auth: admin at parent location.
    """
    authorized, auth_err = authorization_scoped("admin", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    parent_id = body.get('parentLocationId')
    name = body.get('name')
    code = body.get('code')

    if not parent_id or not name:
        return ErrorModel(400, "parentLocationId and name are required"), 400

    # Validate parent exists (exclude soft-deleted)
    parent = db.execute_query("SELECT id FROM location WHERE id = %s AND deleted_at IS NULL", (parent_id,), fetchone=True)
    if not parent:
        return ErrorModel(400, "Parent location not found"), 400

    # Check admin at parent
    if not is_admin_at_location(str(user.id), parent_id):
        return ErrorModel(403, "Admin authority at parent location is required"), 403

    location_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO location (id, parent_location_id, name, code)
        VALUES (%s, %s, %s, %s)
    """, (location_id, parent_id, name, code))

    invalidate_location_cache()

    # Notify admins at parent location
    parent_row = db.execute_query("SELECT name FROM location WHERE id = %s",
                                  (parent_id,), fetchone=True)
    parent_name = parent_row['name'] if parent_row else 'Unknown'
    admin_ids = _get_admins_at_location(parent_id)
    # Exclude the acting user
    admin_ids = [a for a in admin_ids if a != str(user.id)]
    if admin_ids:
        _notify_admin_action(admin_ids, "New location created",
                             f"{name} added under {parent_name}",
                             actor_user_id=str(user.id))

    return {
        'id': location_id,
        'parentLocationId': parent_id,
        'name': name,
        'code': code,
    }, 201


def update_location(location_id, body, token_info=None):  # noqa: E501
    """Update a location (name, code, parent).

    PUT /admin/locations/{id}
    Auth: admin at location or ancestor.
    """
    authorized, auth_err = authorization_scoped("admin", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    # Validate location exists (exclude soft-deleted)
    loc = db.execute_query("""
        SELECT id, parent_location_id, name, code FROM location WHERE id = %s AND deleted_at IS NULL
    """, (location_id,), fetchone=True)
    if not loc:
        return ErrorModel(404, "Location not found"), 404

    if not is_admin_at_location(str(user.id), location_id):
        return ErrorModel(403, "Admin authority at this location is required"), 403

    name = body.get('name', loc['name'])
    code = body.get('code', loc['code'])
    new_parent_id = body.get('parentLocationId')

    # If reparenting, validate no circular reference
    if new_parent_id and str(new_parent_id) != str(loc['parent_location_id'] or ''):
        # Check new parent exists (exclude soft-deleted)
        new_parent = db.execute_query("SELECT id FROM location WHERE id = %s AND deleted_at IS NULL", (new_parent_id,), fetchone=True)
        if not new_parent:
            return ErrorModel(400, "New parent location not found"), 400

        # Check admin at new parent too
        if not is_admin_at_location(str(user.id), new_parent_id):
            return ErrorModel(403, "Admin authority at new parent location is required"), 403

        # Circular reference check: new_parent must not be a descendant of this location
        descendants = get_location_descendants(location_id)
        if str(new_parent_id) in descendants:
            return ErrorModel(400, "Cannot reparent: would create circular reference"), 400

        db.execute_query("""
            UPDATE location SET parent_location_id = %s, name = %s, code = %s WHERE id = %s
        """, (new_parent_id, name, code, location_id))
    else:
        db.execute_query("""
            UPDATE location SET name = %s, code = %s WHERE id = %s
        """, (name, code, location_id))

    invalidate_location_cache()

    # Notify admins at this location
    admin_ids = _get_admins_at_location(location_id)
    admin_ids = [a for a in admin_ids if a != str(user.id)]
    if admin_ids:
        _notify_admin_action(admin_ids, "Location updated",
                             f"{name} was updated",
                             actor_user_id=str(user.id))

    return {
        'id': str(location_id),
        'parentLocationId': str(new_parent_id) if new_parent_id else (str(loc['parent_location_id']) if loc['parent_location_id'] else None),
        'name': name,
        'code': code,
    }


def delete_location(location_id, token_info=None):  # noqa: E501
    """Soft-delete a location, reparenting children to its parent.

    DELETE /admin/locations/{id}
    Auth: admin at location or ancestor.
    """
    authorized, auth_err = authorization_scoped("admin", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    loc = db.execute_query(
        "SELECT id, parent_location_id FROM location WHERE id = %s AND deleted_at IS NULL",
        (location_id,), fetchone=True)
    if not loc:
        return ErrorModel(404, "Location not found"), 404

    # Cannot delete root location
    if loc['parent_location_id'] is None:
        return ErrorModel(400, "Cannot delete the root location"), 400

    if not is_admin_at_location(str(user.id), location_id):
        return ErrorModel(403, "Admin authority at this location is required"), 403

    # Gather admins at this location + parent before soft-delete
    admin_ids = set(_get_admins_at_location(location_id))
    if loc['parent_location_id']:
        admin_ids.update(_get_admins_at_location(loc['parent_location_id']))
    admin_ids.discard(str(user.id))

    loc_name_row = db.execute_query("SELECT name FROM location WHERE id = %s",
                                     (location_id,), fetchone=True)
    loc_name = loc_name_row['name'] if loc_name_row else 'Unknown'

    # Reparent children + soft-delete
    parent_id = loc['parent_location_id']
    db.execute_query(
        "UPDATE location SET parent_location_id = %s WHERE parent_location_id = %s AND deleted_at IS NULL",
        (parent_id, location_id))
    db.execute_query(
        "UPDATE location SET deleted_at = NOW() WHERE id = %s",
        (location_id,))

    invalidate_location_cache()

    # Notify admins
    if admin_ids:
        _notify_admin_action(list(admin_ids), "Location deleted",
                             f"{loc_name} was removed",
                             actor_user_id=str(user.id))

    return '', 204


def get_location_sessions(location_id, token_info=None):  # noqa: E501
    """Get sessions assigned to a location.

    GET /admin/locations/{id}/sessions
    Auth: assistant_moderator+ (any scoped role holder).
    """
    authorized, auth_err = authorization_scoped("assistant_moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    rows = db.execute_query("""
        SELECT pc.id, pc.label
        FROM location_session lc
        JOIN session pc ON lc.session_id = pc.id
        WHERE lc.location_id = %s
        ORDER BY pc.label ASC
    """, (location_id,))

    return [{'id': str(r['id']), 'label': r['label']} for r in (rows or [])]


def assign_location_session(location_id, body, token_info=None):  # noqa: E501
    """Assign a session to a location.

    POST /admin/locations/{id}/categories
    Auth: admin at location or ancestor.
    """
    authorized, auth_err = authorization_scoped("admin", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    session_id = body.get('sessionId')
    if not session_id:
        return ErrorModel(400, "sessionId is required"), 400

    # Validate location and session exist (exclude soft-deleted)
    loc = db.execute_query("SELECT id FROM location WHERE id = %s AND deleted_at IS NULL", (location_id,), fetchone=True)
    if not loc:
        return ErrorModel(404, "Location not found"), 404

    if not is_admin_at_location(str(user.id), location_id):
        return ErrorModel(403, "Admin authority at this location is required"), 403

    sess = db.execute_query("SELECT id, label FROM session WHERE id = %s",
                            (session_id,), fetchone=True)
    if not sess:
        return ErrorModel(400, "Session not found"), 400

    # Check if already assigned
    existing = db.execute_query("""
        SELECT id FROM location_session
        WHERE location_id = %s AND session_id = %s
    """, (location_id, session_id), fetchone=True)
    if existing:
        return ErrorModel(400, "Session already assigned to this location"), 400

    lc_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO location_session (id, location_id, session_id)
        VALUES (%s, %s, %s)
    """, (lc_id, location_id, session_id))

    # Notify admins at this location
    loc_row = db.execute_query("SELECT name FROM location WHERE id = %s",
                               (location_id,), fetchone=True)
    loc_name = loc_row['name'] if loc_row else 'Unknown'
    admin_ids = _get_admins_at_location(location_id)
    admin_ids = [a for a in admin_ids if a != str(user.id)]
    if admin_ids:
        _notify_admin_action(admin_ids, "Session assigned",
                             f"{sess['label']} added to {loc_name}",
                             actor_user_id=str(user.id))

    return {
        'id': lc_id,
        'locationId': str(location_id),
        'sessionId': str(session_id),
        'sessionLabel': sess['label'],
    }, 201


def remove_location_session(location_id, session_id, token_info=None):  # noqa: E501
    """Remove a session from a location.

    DELETE /admin/locations/{id}/categories/{catId}
    Auth: admin at location or ancestor.
    """
    authorized, auth_err = authorization_scoped("admin", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if not is_admin_at_location(str(user.id), location_id):
        return ErrorModel(403, "Admin authority at this location is required"), 403

    existing = db.execute_query("""
        SELECT id FROM location_session
        WHERE location_id = %s AND session_id = %s
    """, (location_id, session_id), fetchone=True)
    if not existing:
        return ErrorModel(404, "Session assignment not found"), 404

    # Look up names for notification before deleting
    sess_row = db.execute_query("SELECT label FROM session WHERE id = %s",
                                (session_id,), fetchone=True)
    sess_label = sess_row['label'] if sess_row else 'Unknown'
    loc_row = db.execute_query("SELECT name FROM location WHERE id = %s",
                               (location_id,), fetchone=True)
    loc_name = loc_row['name'] if loc_row else 'Unknown'

    db.execute_query("""
        DELETE FROM location_session
        WHERE location_id = %s AND session_id = %s
    """, (location_id, session_id))

    # Notify admins at location + facilitators for that session
    admin_ids = set(_get_admins_at_location(location_id))
    facilitators = db.execute_query("""
        SELECT DISTINCT ur.user_id FROM user_role ur
        WHERE ur.role = 'facilitator' AND ur.location_id = %s
          AND ur.session_id = %s
    """, (location_id, session_id))
    for f in (facilitators or []):
        admin_ids.add(str(f['user_id']))
    admin_ids.discard(str(user.id))
    if admin_ids:
        _notify_admin_action(list(admin_ids), "Session removed",
                             f"{sess_label} removed from {loc_name}",
                             actor_user_id=str(user.id))

    return '', 204


# ---------------------------------------------------------------------------
# Session Management API
# ---------------------------------------------------------------------------

def get_admin_sessions(token_info=None):  # noqa: E501
    """List all sessions with admin context (location + facilitator).

    GET /admin/sessions
    Auth: assistant_moderator+ (scoped).
    """
    authorized, auth_err = authorization_scoped("assistant_moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    rows = db.execute_query("""
        SELECT s.id, s.label, s.description, s.location_id, s.stage,
               s.stage_changed_at, s.stage_changed_by, s.facilitator_user_id,
               s.status, s.created_by, s.proposal_method,
               l.code AS location_code, l.name AS location_name,
               u.username AS facilitator_username
        FROM session s
        LEFT JOIN location l ON l.id = s.location_id
        LEFT JOIN users u ON u.id = s.facilitator_user_id
        ORDER BY s.label
    """)

    if rows is None:
        rows = []

    sessions = []
    for row in rows:
        sess = {
            'id': str(row['id']),
            'label': row['label'],
            'description': row.get('description'),
            'locationId': str(row['location_id']) if row.get('location_id') else None,
            'locationCode': row.get('location_code'),
            'locationName': row.get('location_name'),
            'stage': row.get('stage'),
            'stageChangedAt': row['stage_changed_at'].isoformat() if row.get('stage_changed_at') else None,
            'stageChangedBy': str(row['stage_changed_by']) if row.get('stage_changed_by') else None,
            'facilitatorUserId': str(row['facilitator_user_id']) if row.get('facilitator_user_id') else None,
            'facilitatorUsername': row.get('facilitator_username'),
            'status': row.get('status'),
            'createdBy': str(row['created_by']) if row.get('created_by') else None,
            'proposalMethod': row.get('proposal_method', 'user_driven'),
        }
        sessions.append(sess)

    return sessions, 200


def create_session(body, token_info=None):  # noqa: E501
    """Create a new session.

    POST /admin/sessions
    Auth: site admin.
    """
    authorized, auth_err = authorization_site_admin(token_info)
    if not authorized:
        return auth_err, auth_err.code

    if connexion.request.is_json:
        body = connexion.request.get_json()

    label = (body.get('label') or '').strip()
    location_id = body.get('locationId')
    proposal_method = body.get('proposalMethod', 'user_driven')
    proposals = body.get('proposals', [])

    if proposal_method not in VALID_PROPOSAL_METHODS:
        return ErrorModel(400, f"proposalMethod must be one of: {', '.join(VALID_PROPOSAL_METHODS)}"), 400

    if not label:
        return ErrorModel(400, "Session label is required"), 400

    # Validate proposals based on method
    if proposal_method == 'direct_proposal':
        if len(proposals) != 1:
            return ErrorModel(400, "direct_proposal requires exactly 1 proposal"), 400
        for p in proposals:
            if not (p.get('title') or '').strip() or not (p.get('body') or '').strip():
                return ErrorModel(400, "Each proposal must have a title and body"), 400
    elif proposal_method == 'admin_provided':
        if len(proposals) < 2:
            return ErrorModel(400, "admin_provided requires at least 2 proposals"), 400
        for p in proposals:
            if not (p.get('title') or '').strip() or not (p.get('body') or '').strip():
                return ErrorModel(400, "Each proposal must have a title and body"), 400

    # Check for duplicate (case-insensitive) within the same location
    if location_id:
        existing = db.execute_query("""
            SELECT id FROM session WHERE LOWER(label) = LOWER(%s) AND location_id = %s
        """, (label, location_id), fetchone=True)
    else:
        existing = db.execute_query("""
            SELECT id FROM session WHERE LOWER(label) = LOWER(%s)
        """, (label,), fetchone=True)
    if existing:
        return ErrorModel(400, "A session with this label already exists"), 400

    user = token_to_user(token_info)
    user_id = str(user.id)

    # Use provided location_id or fall back to root location
    if not location_id:
        from candid.controllers.helpers.auth import get_root_location_id
        location_id = get_root_location_id()
    if not location_id:
        return ErrorModel(400, "locationId is required"), 400

    initial_stage = PROPOSAL_METHOD_INITIAL_STAGE[proposal_method]

    session_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO session (id, label, location_id, created_by, proposal_method, stage)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (session_id, label, location_id, user_id, proposal_method, initial_stage))

    # Link session to its location via the join table
    db.execute_query("""
        INSERT INTO location_session (id, location_id, session_id)
        VALUES (%s, %s, %s)
    """, (str(uuid.uuid4()), location_id, session_id))

    # Create proposal posts and related objects based on method
    if proposal_method == 'direct_proposal':
        p = proposals[0]
        post_id = str(uuid.uuid4())
        db.execute_query("""
            INSERT INTO post (id, creator_user_id, location_id, session_id, post_type,
                              title, body, proposal_status, created_during_stage)
            VALUES (%s, %s, %s, %s, 'proposal', %s, %s, 'finalized', %s)
        """, (post_id, user_id, location_id, session_id,
              p['title'].strip(), p['body'].strip(), initial_stage))

        # Pin to all opinion+ stages
        opinion_plus_stages = [
            'opinion_discussion', 'reflection_curation', 'reflection_proposals',
            'consensus',
        ]
        for stage in opinion_plus_stages:
            db.execute_query("""
                INSERT INTO pinned_post (post_id, session_id, stage, post_type, pinned_by)
                VALUES (%s, %s, %s, 'proposal', %s)
            """, (post_id, session_id, stage, user_id))

        # Create Polis conversation for the opinion phase
        try:
            from candid.controllers.helpers.polis_sync import get_or_create_conversation
            loc_row = db.execute_query(
                "SELECT name FROM location WHERE id = %s", (location_id,), fetchone=True)
            loc_name = loc_row['name'] if loc_row else 'Unknown'
            get_or_create_conversation(location_id, session_id, loc_name, label, phase='opinion')
        except Exception:
            pass  # Polis is optional; don't fail session creation

    elif proposal_method == 'admin_provided':
        # Create draft proposal posts and collect their IDs
        proposal_post_ids = []
        for p in proposals:
            post_id = str(uuid.uuid4())
            proposal_post_ids.append(post_id)
            db.execute_query("""
                INSERT INTO post (id, creator_user_id, location_id, session_id, post_type,
                                  title, body, proposal_status, created_during_stage)
                VALUES (%s, %s, %s, %s, 'proposal', %s, %s, 'draft', %s)
            """, (post_id, user_id, location_id, session_id,
                  p['title'].strip(), p['body'].strip(), initial_stage))

        # Create voting round at voting_open (skip proposal/endorsement phases)
        vr_row = db.execute_query("""
            INSERT INTO voting_round (session_id, round_type, status, opened_by)
            VALUES (%s, 'issue_selection', 'voting_open', %s)
            RETURNING id
        """, (session_id, user_id), fetchone=True)

        # Populate voting round candidates with admin-provided proposals
        for i, pid in enumerate(proposal_post_ids):
            db.execute_query("""
                INSERT INTO voting_round_candidate (voting_round_id, proposal_post_id, endorsement_count, display_order)
                VALUES (%s, %s, 0, %s)
            """, (str(vr_row['id']), pid, i))

    # Notify other site admins
    from candid.controllers.helpers.auth import get_root_location_id
    root_loc = get_root_location_id()
    if root_loc:
        site_admins = db.execute_query("""
            SELECT DISTINCT ur.user_id FROM user_role ur
            WHERE ur.role = 'admin' AND ur.location_id = %s AND ur.user_id != %s
        """, (root_loc, user_id))
        if site_admins:
            _notify_admin_action(
                [str(r['user_id']) for r in site_admins],
                "New session created",
                f"{label} session was created",
                actor_user_id=user_id)

    result = {
        'id': session_id,
        'label': label,
        'locationId': location_id,
    }

    # Optionally create label surveys at session creation time (one per phase)
    create_label_survey = body.get('createLabelSurvey', False)
    if create_label_survey:
        label_items = body.get('labelSurveyItems', [])
        label_items = [i.strip() for i in label_items if i.strip()]
        if len(label_items) >= 2:
            comp_question = (body.get('labelSurveyComparisonQuestion') or '').strip() or "Which better describes this group's views?"
            label_surveys = {}
            for phase in ('proposal', 'opinion', 'reflection'):
                sid = str(uuid.uuid4())
                db.execute_query("""
                    INSERT INTO survey (id, creator_user_id, survey_title, survey_type, comparison_question,
                                       session_id, is_group_labeling, phase, status)
                    VALUES (%s, %s, %s, 'pairwise', %s, %s, true, %s, 'active')
                """, (sid, user.id, f"Label Survey ({phase}): {label}", comp_question, session_id, phase))
                for i, item_text in enumerate(label_items):
                    item_id = str(uuid.uuid4())
                    db.execute_query("""
                        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
                        VALUES (%s, %s, %s, %s)
                    """, (item_id, sid, item_text, i))
                label_surveys[phase] = _build_pairwise_survey(sid)
            result['labelSurveys'] = label_surveys

    return result, 201


def get_session_label_survey(session_id, token_info=None):  # noqa: E501
    """Get label surveys for a session, grouped by phase.

    GET /admin/sessions/{sessionId}/label-survey
    Auth: assistant_moderator+ (scoped).

    Returns {labelSurveys: {proposal: ..., opinion: ..., reflection: ...}}.
    Legacy surveys with phase=NULL are returned under all phases as fallback.
    """
    authorized, auth_err = authorization_scoped("assistant_moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    rows = db.execute_query("""
        SELECT id, phase FROM survey
        WHERE session_id = %s AND is_group_labeling = true AND status != 'deleted'
        ORDER BY created_time DESC
    """, (session_id,))

    label_surveys = {'proposal': None, 'opinion': None, 'reflection': None}
    legacy_survey = None

    for row in (rows or []):
        phase = row.get('phase')
        if phase in ('proposal', 'opinion', 'reflection') and label_surveys[phase] is None:
            label_surveys[phase] = _build_pairwise_survey(row['id'])
        elif phase is None and legacy_survey is None:
            legacy_survey = _build_pairwise_survey(row['id'])

    # Legacy fallback: if a phase has no survey but a legacy (NULL) one exists, use it
    for phase in ('proposal', 'opinion', 'reflection'):
        if label_surveys[phase] is None and legacy_survey is not None:
            label_surveys[phase] = legacy_survey

    return {"labelSurveys": label_surveys}


# ---------------------------------------------------------------------------
# User Ban/Unban API
# ---------------------------------------------------------------------------

def update_user_status(user_id, body, token_info=None):  # noqa: E501
    """Update a user's status (ban/unban).

    PATCH /admin/users/{userId}/status
    Auth: facilitator+ (scoped).
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    acting_user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    new_status = body.get('status')
    reason = (body.get('reason') or '').strip()

    if new_status not in ('banned', 'active'):
        return ErrorModel(400, "status must be 'banned' or 'active'"), 400

    if not reason:
        return ErrorModel(400, "Reason is required"), 400

    user = db.execute_query("""
        SELECT id, status FROM users WHERE id = %s
    """, (user_id,), fetchone=True)

    if not user:
        return ErrorModel(404, "User not found"), 404

    if new_status == 'banned':
        if user['status'] == 'banned':
            return ErrorModel(400, "User is already banned"), 400
        if user['status'] == 'deleted':
            return ErrorModel(400, "Cannot ban a deleted user"), 400
        action = 'ban'
    else:
        if user['status'] != 'banned':
            return ErrorModel(400, "User is not banned"), 400
        action = 'unban'

    db.execute_query("""
        UPDATE users SET status = %s WHERE id = %s
    """, (new_status, user_id))
    invalidate_ban_cache(user_id)

    db.execute_query("""
        INSERT INTO admin_action_log (id, action, target_user_id, performed_by, reason)
        VALUES (%s, %s, %s, %s, %s)
    """, (str(uuid.uuid4()), action, user_id, acting_user.id, reason))

    # Notify the target user
    if action == 'ban':
        _notify_admin_action([user_id], "Account suspended",
                             f"Your account has been suspended. Reason: {reason}",
                             actor_user_id=str(acting_user.id))
    else:
        _notify_admin_action([user_id], "Account restored",
                             "Your account has been restored",
                             actor_user_id=str(acting_user.id))

    return {'id': str(user_id), 'status': new_status}


def get_admin_actions(token_info=None):  # noqa: E501
    """Get admin action log (ban/unban audit trail).

    GET /admin/actions
    Auth: assistant_moderator+ (scoped).
    """
    authorized, auth_err = authorization_scoped("assistant_moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    rows = db.execute_query("""
        SELECT aal.id, aal.action, aal.target_user_id, aal.performed_by, aal.reason, aal.created_time,
               u_target.username AS target_username, u_target.display_name AS target_display_name,
               u_target.avatar_icon_url AS target_avatar_icon_url,
               u_target.status AS target_status, u_target.trust_score AS target_trust_score,
               u_target.kudos_count AS target_kudos_count,
               u_performer.username AS performer_username, u_performer.display_name AS performer_display_name,
               u_performer.avatar_icon_url AS performer_avatar_icon_url,
               u_performer.status AS performer_status, u_performer.trust_score AS performer_trust_score,
               u_performer.kudos_count AS performer_kudos_count
        FROM admin_action_log aal
        JOIN users u_target ON aal.target_user_id = u_target.id
        JOIN users u_performer ON aal.performed_by = u_performer.id
        ORDER BY aal.created_time DESC
        LIMIT 200
    """)

    return [
        {
            'id': str(r['id']),
            'action': r['action'],
            'targetUser': {
                'id': str(r['target_user_id']),
                'username': r['target_username'],
                'displayName': r['target_display_name'],
                'status': r.get('target_status', 'active'),
                'avatarIconUrl': r.get('target_avatar_icon_url'),
                'trustScore': float(r['target_trust_score']) if r.get('target_trust_score') is not None else None,
                'kudosCount': r.get('target_kudos_count', 0),
            },
            'performedBy': {
                'id': str(r['performed_by']),
                'username': r['performer_username'],
                'displayName': r['performer_display_name'],
                'status': r.get('performer_status', 'active'),
                'avatarIconUrl': r.get('performer_avatar_icon_url'),
                'trustScore': float(r['performer_trust_score']) if r.get('performer_trust_score') is not None else None,
                'kudosCount': r.get('performer_kudos_count', 0),
            },
            'reason': r['reason'],
            'createdTime': r['created_time'].isoformat() if r.get('created_time') else None,
        }
        for r in (rows or [])
    ]


# ---------------------------------------------------------------------------
# Rule Management API
# ---------------------------------------------------------------------------

def get_admin_rules(status=None, location_id=None, content_type=None, post_type=None, token_info=None):  # noqa: E501
    """Get rules (admin view with all statuses).

    GET /admin/rules?status=&location_id=&content_type=&post_type=
    Auth: assistant_moderator+ (any scoped role holder).
    """
    authorized, auth_err = authorization_scoped("assistant_moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    conditions = []
    params = []

    status = status or 'active'
    if status != 'all':
        conditions.append("r.status = %s")
        params.append(status)

    if location_id:
        conditions.append("r.location_id = %s")
        params.append(location_id)

    if content_type:
        conditions.append("%s = ANY(r.applicable_content_types)")
        params.append(content_type)

    if post_type:
        conditions.append("(r.applicable_post_types IS NULL OR %s = ANY(r.applicable_post_types))")
        params.append(post_type)

    where = ""
    if conditions:
        where = "WHERE " + " AND ".join(conditions)

    rows = db.execute_query(f"""
        SELECT r.id, r.creator_user_id, r.title, r.text, r.status, r.severity,
               r.default_actions, r.sentencing_guidelines,
               r.location_id, r.session_id, r.applicable_content_types,
               r.applicable_post_types,
               r.created_time, r.updated_time,
               l.name AS location_name, pc.label AS session_label
        FROM rule r
        LEFT JOIN location l ON r.location_id = l.id
        LEFT JOIN session pc ON r.session_id = pc.id
        {where}
        ORDER BY r.severity DESC, r.created_time ASC
    """, tuple(params) if params else None)

    return [_build_rule_response(r) for r in (rows or [])]


import json as _json


def create_rule_request(body, token_info=None):  # noqa: E501
    """Create a rule change request (create, update, or delete).

    POST /admin/rules/requests
    Auth: facilitator+ (any scoped role holder).
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    action = body.get('action')
    if action not in ('create', 'update', 'delete'):
        return ErrorModel(400, "action must be 'create', 'update', or 'delete'"), 400

    proposed_rule = body.get('proposedRule', {})
    rule_id = body.get('ruleId')
    reason = body.get('reason', '')

    # For update/delete, verify rule_id exists and is active
    existing_rule = None
    if action in ('update', 'delete'):
        if not rule_id:
            return ErrorModel(400, "ruleId is required for update/delete"), 400
        existing_rule = db.execute_query("""
            SELECT id, title, text, severity, default_actions, sentencing_guidelines,
                   location_id, session_id, applicable_content_types,
                   applicable_post_types, status
            FROM rule WHERE id = %s
        """, (rule_id,), fetchone=True)
        if not existing_rule:
            return ErrorModel(400, "Rule not found"), 400
        if existing_rule['status'] != 'active' and action == 'update':
            return ErrorModel(400, "Cannot update an inactive rule"), 400

    # For delete, store current state as proposed_rule for audit trail
    if action == 'delete' and existing_rule:
        post_types_val = existing_rule.get('applicable_post_types')
        proposed_rule = {
            'title': existing_rule['title'],
            'text': existing_rule['text'],
            'severity': existing_rule.get('severity'),
            'defaultActions': existing_rule.get('default_actions', []),
            'sentencingGuidelines': existing_rule.get('sentencing_guidelines'),
            'locationId': str(existing_rule['location_id']) if existing_rule.get('location_id') else None,
            'sessionId': str(existing_rule['session_id']) if existing_rule.get('session_id') else None,
            'applicableContentTypes': list(existing_rule.get('applicable_content_types', [])),
            'applicablePostTypes': list(post_types_val) if post_types_val else None,
        }

    # Validate proposed_rule fields for create/update
    if action in ('create', 'update'):
        title = (proposed_rule.get('title') or '').strip()
        text = (proposed_rule.get('text') or '').strip()

        if action == 'create':
            if not title:
                return ErrorModel(400, "Title is required"), 400
            if not text:
                return ErrorModel(400, "Description text is required"), 400
        if title and len(title) > 255:
            return ErrorModel(400, "Title must be 255 characters or fewer"), 400

        severity = proposed_rule.get('severity')
        if severity is not None and (severity < 1 or severity > 5):
            return ErrorModel(400, "Severity must be between 1 and 5"), 400

        content_types = proposed_rule.get('applicableContentTypes')
        if content_types is not None:
            if not content_types or len(content_types) == 0:
                return ErrorModel(400, "At least one content type is required"), 400
            if not set(content_types).issubset(_VALID_CONTENT_TYPES):
                return ErrorModel(400, "Invalid content type"), 400

        post_types = proposed_rule.get('applicablePostTypes')
        if post_types is not None:
            if not isinstance(post_types, list):
                return ErrorModel(400, "applicablePostTypes must be an array"), 400
            if len(post_types) > 0 and not set(post_types).issubset(_VALID_POST_TYPES):
                return ErrorModel(400, "Invalid post type"), 400

    # Determine scope from proposed_rule
    scope_location_id = proposed_rule.get('locationId')
    scope_session_id = proposed_rule.get('sessionId')

    # For update: also need authority over current scope
    if action == 'update' and existing_rule:
        current_loc = str(existing_rule['location_id']) if existing_rule.get('location_id') else None
        current_cat = str(existing_rule['session_id']) if existing_rule.get('session_id') else None
        # Authority over current scope
        auth_loc_current = _get_rule_authority_location(str(user.id), current_loc, current_cat)
        if not auth_loc_current:
            return ErrorModel(403, "You do not have authority over the current rule scope"), 403

    if action == 'delete' and existing_rule:
        scope_location_id = str(existing_rule['location_id']) if existing_rule.get('location_id') else None
        scope_session_id = str(existing_rule['session_id']) if existing_rule.get('session_id') else None

    # Check authority over proposed scope
    authority_loc = _get_rule_authority_location(str(user.id), scope_location_id, scope_session_id)
    if not authority_loc:
        return ErrorModel(403, "You do not have authority to manage rules at this scope"), 403

    # Check for duplicate pending request on same rule_id+action
    if rule_id:
        dup = db.execute_query("""
            SELECT id FROM rule_change_request
            WHERE rule_id = %s AND action = %s AND status = 'pending'
        """, (rule_id, action), fetchone=True)
        if dup:
            return ErrorModel(400, "A pending request already exists for this rule and action"), 400

    # Compute auto-approve time
    from datetime import datetime, timezone, timedelta
    timeout_days = config.ROLE_APPROVAL_TIMEOUT_DAYS
    auto_approve_at = datetime.now(timezone.utc) + timedelta(days=timeout_days)

    # Create request
    request_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO rule_change_request
            (id, action, rule_id, proposed_rule, requested_by,
             requester_authority_location_id, request_reason, auto_approve_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """, (request_id, action, rule_id, _json.dumps(proposed_rule),
          str(user.id), authority_loc, reason, auto_approve_at))

    # Check if auto-approve (no peer available)
    request_row = {
        'requested_by': str(user.id),
        'requester_authority_location_id': authority_loc,
        'proposed_rule': proposed_rule,
        'rule_id': rule_id,
        'action': action,
    }
    peers = _find_rule_approval_peer(request_row)
    if peers is None:
        # Auto-approve immediately
        db.execute_query("""
            UPDATE rule_change_request SET status = 'auto_approved', updated_time = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (request_id,))
        request_row['rule_id'] = rule_id
        _apply_rule_change(request_row)
        # Notify requester of auto-approval
        _notify_request_outcome(str(user.id), None, 'auto_approved',
                                proposed_rule.get('title', 'Rule change'),
                                'rule_change')
        return {'id': request_id, 'status': 'auto_approved'}, 201

    # Notify approval peers
    _notify_peers(peers, user.display_name, action, 'rule', proposed_rule.get('title', 'a rule'),
                  requester_user_id=str(user.id))

    return {'id': request_id, 'status': 'pending'}, 201


_RULE_REQUEST_SELECT = """
    SELECT rcr.id, rcr.action, rcr.rule_id, rcr.proposed_rule,
           rcr.requested_by, rcr.requester_authority_location_id,
           rcr.request_reason, rcr.auto_approve_at, rcr.created_time,
           rcr.status, rcr.denial_reason, rcr.updated_time, rcr.reviewed_by,
           u_req.username AS requester_username, u_req.display_name AS requester_display_name,
           u_req.avatar_icon_url AS requester_avatar_icon_url,
           u_req.status AS requester_status, u_req.trust_score AS requester_trust_score,
           u_req.kudos_count AS requester_kudos_count,
           u_rev.id AS reviewer_id, u_rev.username AS reviewer_username,
           u_rev.display_name AS reviewer_display_name,
           u_rev.avatar_icon_url AS reviewer_avatar_icon_url,
           u_rev.status AS reviewer_status, u_rev.trust_score AS reviewer_trust_score,
           u_rev.kudos_count AS reviewer_kudos_count,
           l_auth.name AS authority_location_name,
           r_rule.id AS current_rule_id, r_rule.title AS current_rule_title,
           r_rule.text AS current_rule_text, r_rule.severity AS current_rule_severity,
           r_rule.status AS current_rule_status
    FROM rule_change_request rcr
    JOIN users u_req ON rcr.requested_by = u_req.id
    LEFT JOIN users u_rev ON rcr.reviewed_by = u_rev.id
    LEFT JOIN location l_auth ON rcr.requester_authority_location_id = l_auth.id
    LEFT JOIN rule r_rule ON rcr.rule_id = r_rule.id
"""


def get_rule_requests(view=None, token_info=None):  # noqa: E501
    """Get rule change requests with view filter.

    GET /admin/rules/requests?view=pending|all|mine
    Auth: assistant_moderator+ (any scoped role holder).
    """
    authorized, auth_err = authorization_scoped("assistant_moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)
    view = view or 'pending'

    # Auto-approve expired before any view
    _check_rule_auto_approve_expired()

    if view == 'pending':
        requests = db.execute_query(
            _RULE_REQUEST_SELECT + " WHERE rcr.status = 'pending' ORDER BY rcr.created_time ASC"
        )
        result = []
        for r in (requests or []):
            peers = _find_rule_approval_peer(r)
            if peers and str(user.id) in peers:
                result.append(_format_rule_request(r))
        return result

    elif view == 'mine':
        requests = db.execute_query(
            _RULE_REQUEST_SELECT + " WHERE rcr.requested_by = %s ORDER BY rcr.created_time DESC",
            (str(user.id),)
        )
        return [_format_rule_request(r) for r in (requests or [])]

    elif view == 'all':
        # Compute user's scope from their roles
        roles = get_user_roles(str(user.id))
        scope_locs = set()
        for ur in roles:
            loc_id = str(ur['location_id']) if ur.get('location_id') else None
            if not loc_id:
                continue
            r = ur['role']
            if r in ('admin', 'moderator'):
                descendants = get_location_descendants(loc_id)
                scope_locs.update(descendants)
            elif r in ('facilitator', 'assistant_moderator'):
                scope_locs.add(loc_id)

        if not scope_locs:
            return []

        scope_list = list(scope_locs)
        requests = db.execute_query(
            _RULE_REQUEST_SELECT +
            " WHERE rcr.requester_authority_location_id = ANY(%s::uuid[]) ORDER BY rcr.created_time DESC LIMIT 200",
            (scope_list,)
        )
        return [_format_rule_request(r) for r in (requests or [])]

    else:
        return ErrorModel(400, f"Invalid view: {view}"), 400


def update_rule_request(request_id, body, token_info=None):  # noqa: E501
    """Update a rule change request (approve, deny, or rescind).

    PATCH /admin/rules/requests/{requestId}
    Auth: facilitator+ (any scoped role holder).
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    new_status = body.get('status')
    if new_status not in ('approved', 'denied', 'rescinded'):
        return ErrorModel(400, "status must be 'approved', 'denied', or 'rescinded'"), 400

    # Auto-approve expired first
    _check_rule_auto_approve_expired()

    req = db.execute_query("""
        SELECT * FROM rule_change_request WHERE id = %s
    """, (request_id,), fetchone=True)

    if not req:
        return ErrorModel(404, "Request not found"), 404

    if req['status'] != 'pending':
        return ErrorModel(400, f"Request is already {req['status']}"), 400

    # Build description for notifications
    proposed = req.get('proposed_rule') or {}
    if isinstance(proposed, str):
        import json as _json_mod
        proposed = _json_mod.loads(proposed)
    rule_desc = proposed.get('title', 'Rule change')

    if new_status == 'rescinded':
        # Only the original requester can rescind
        if str(req['requested_by']) != str(user.id):
            return ErrorModel(403, "Only the original requester can rescind"), 403

        db.execute_query("""
            UPDATE rule_change_request
            SET status = 'rescinded', updated_time = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (request_id,))

        # Notify approval peers about rescission
        peers = _find_rule_approval_peer(req)
        if peers:
            for peer_id in peers:
                _notify_request_outcome(peer_id, user.display_name, 'rescinded',
                                        rule_desc, 'rule_change',
                                        actor_user_id=str(user.id))

        return {'id': str(req['id']), 'status': 'rescinded'}

    # Approve or deny: verify this user can review
    peers = _find_rule_approval_peer(req)
    if not peers or str(user.id) not in peers:
        return ErrorModel(403, "You are not authorized to review this request"), 403

    if new_status == 'approved':
        db.execute_query("""
            UPDATE rule_change_request
            SET status = 'approved', reviewed_by = %s, updated_time = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (str(user.id), request_id))

        _apply_rule_change(req)

        # Notify requester of approval
        _notify_request_outcome(str(req['requested_by']), user.display_name,
                                'approved', rule_desc, 'rule_change',
                                actor_user_id=str(user.id))

        return {'id': str(req['id']), 'status': 'approved'}

    else:  # denied
        denial_reason = body.get('reason', '')
        db.execute_query("""
            UPDATE rule_change_request
            SET status = 'denied', reviewed_by = %s, denial_reason = %s, updated_time = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (str(user.id), denial_reason, request_id))

        # Notify requester of denial
        _notify_request_outcome(str(req['requested_by']), user.display_name,
                                'denied', rule_desc, 'rule_change',
                                actor_user_id=str(user.id))

        return {'id': str(req['id']), 'status': 'denied'}
