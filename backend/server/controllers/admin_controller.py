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
def _get_user_card(user_id):
    """Helper to fetch and return a User model for API responses."""
    user = db.execute_query("""
        SELECT id, username, display_name, status
        FROM users WHERE id = %s
    """, (user_id,), fetchone=True)
    if user is not None:
        return User(
            id=str(user['id']),
            username=user['username'],
            display_name=user['display_name'],
            status=user['status'],
        )
    return None


def _build_survey_with_nested_data(survey_id):
    """Fetch survey with creator User, questions, and options nested."""
    survey_row = db.execute_query("""
        SELECT s.id, s.creator_user_id, s.position_category_id, s.location_id,
               s.survey_title, s.survey_type, s.created_time, s.start_time, s.end_time, s.status,
               l.name AS location_name, l.code AS location_code,
               pc.label AS category_name
        FROM survey s
        LEFT JOIN location l ON s.location_id = l.id
        LEFT JOIN position_category pc ON s.position_category_id = pc.id
        WHERE s.id = %s
    """, (survey_id,), fetchone=True)

    if survey_row is None:
        return None

    # Get creator
    creator = _get_user_card(survey_row['creator_user_id'])

    # Get questions
    question_rows = db.execute_query("""
        SELECT id, survey_id, survey_question
        FROM survey_question WHERE survey_id = %s
        ORDER BY id
    """, (survey_id,))

    questions = []
    if question_rows:
        for q_row in question_rows:
            # Get options for this question
            option_rows = db.execute_query("""
                SELECT id, survey_question_id, survey_question_option
                FROM survey_question_option WHERE survey_question_id = %s
                ORDER BY id
            """, (q_row['id'],))

            options = []
            if option_rows:
                for o_row in option_rows:
                    options.append(SurveyQuestionOption(
                        id=str(o_row['id']),
                        survey_question_id=str(o_row['survey_question_id']),
                        option=o_row['survey_question_option']
                    ))

            questions.append(SurveyQuestion(
                id=str(q_row['id']),
                survey_id=str(q_row['survey_id']),
                question=q_row['survey_question'],
                options=options
            ))

    return Survey(
        id=str(survey_row['id']),
        creator=creator,
        position_category_id=str(survey_row['position_category_id']) if survey_row['position_category_id'] else None,
        survey_title=survey_row['survey_title'],
        survey_type=survey_row['survey_type'],
        location_id=str(survey_row['location_id']) if survey_row['location_id'] else None,
        location_code=survey_row['location_code'],
        location_name=survey_row['location_name'],
        category_id=str(survey_row['position_category_id']) if survey_row['position_category_id'] else None,
        category_name=survey_row['category_name'],
        created_time=survey_row['created_time'],
        start_time=survey_row['start_time'],
        end_time=survey_row['end_time'],
        questions=questions
    )


def create_survey(body, token_info=None):  # noqa: E501
    """Create a new survey

     # noqa: E501

    :param create_survey_request:
    :type create_survey_request: dict | bytes

    :rtype: Union[Survey, Tuple[Survey, int], Tuple[Survey, int, Dict[str, str]]
    """
    authorized, auth_err = authorization_site_admin(token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    create_survey_request = body
    if connexion.request.is_json:
        create_survey_request = CreateSurveyRequest.from_dict(connexion.request.get_json())  # noqa: E501

    # Validate questions array is not empty
    if not create_survey_request.questions or len(create_survey_request.questions) == 0:
        return ErrorModel(400, "At least one question is required"), 400

    # Generate survey ID
    survey_id = str(uuid.uuid4())

    # Insert survey
    db.execute_query("""
        INSERT INTO survey (id, creator_user_id, position_category_id, location_id, survey_title, start_time, end_time, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'active')
    """, (
        survey_id,
        user.id,
        create_survey_request.position_category_id,
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
    authorized, auth_err = authorization_site_admin(token_info)
    if not authorized:
        return auth_err, auth_err.code

    # Check survey exists and is not already deleted
    survey = db.execute_query("""
        SELECT id, status FROM survey WHERE id = %s
    """, (survey_id,), fetchone=True)

    if survey is None:
        return ErrorModel(404, "Survey not found"), 404

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
    authorized, auth_err = authorization_site_admin(token_info)
    if not authorized:
        return auth_err, auth_err.code

    survey = _build_survey_with_nested_data(survey_id)
    if survey is None:
        return ErrorModel(404, "Survey not found"), 404

    return survey


def get_surveys(title=None, status=None, created_after=None, created_before=None, location_id=None, token_info=None):  # noqa: E501
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
    authorized, auth_err = authorization_scoped("facilitator", token_info)
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
    authorized, auth_err = authorization_site_admin(token_info)
    if not authorized:
        return auth_err, auth_err.code

    update_request = body
    if connexion.request.is_json:
        update_request = UpdateSurveyRequest.from_dict(connexion.request.get_json())  # noqa: E501

    # Check survey exists and is not deleted
    existing = db.execute_query("""
        SELECT id, status FROM survey WHERE id = %s
    """, (survey_id,), fetchone=True)

    if existing is None:
        return ErrorModel(404, "Survey not found"), 404

    if existing['status'] == 'deleted':
        return ErrorModel(404, "Survey not found"), 404

    # Build dynamic update query for metadata fields only
    set_clauses = []
    params = []

    if update_request.survey_title is not None:
        set_clauses.append("survey_title = %s")
        params.append(update_request.survey_title)

    if update_request.position_category_id is not None:
        set_clauses.append("position_category_id = %s")
        params.append(update_request.position_category_id)

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
    authorized, auth_err = authorization_site_admin(token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    # Parse request body
    if connexion.request.is_json:
        body = connexion.request.get_json()

    survey_title = body.get('surveyTitle')
    items = body.get('items', [])
    comparison_question = body.get('comparisonQuestion', "Which better describes this group's views?")
    polis_conversation_id = body.get('polisConversationId')
    location_id = body.get('locationId')
    position_category_id = body.get('positionCategoryId')
    start_time = body.get('startTime')
    end_time = body.get('endTime')
    is_group_labeling = body.get('isGroupLabeling', False)

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
                           polis_conversation_id, location_id, position_category_id, start_time, end_time,
                           is_group_labeling, status)
        VALUES (%s, %s, %s, 'pairwise', %s, %s, %s, %s, %s, %s, %s, 'active')
    """, (
        survey_id,
        user.id,
        survey_title,
        comparison_question,
        polis_conversation_id,
        location_id,
        position_category_id,
        start_time,
        end_time,
        is_group_labeling,
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


def _build_pairwise_survey(survey_id):
    """Build a pairwise survey response object."""
    survey_row = db.execute_query("""
        SELECT s.id, s.creator_user_id, s.survey_title, s.survey_type,
               s.comparison_question, s.polis_conversation_id,
               s.location_id, s.position_category_id,
               s.start_time, s.end_time, s.status, s.created_time,
               s.is_group_labeling,
               l.name AS location_name, l.code AS location_code,
               pc.label AS category_name
        FROM survey s
        LEFT JOIN location l ON s.location_id = l.id
        LEFT JOIN position_category pc ON s.position_category_id = pc.id
        WHERE s.id = %s
    """, (survey_id,), fetchone=True)

    if survey_row is None:
        return None

    # Get items
    item_rows = db.execute_query("""
        SELECT id, item_text, item_order
        FROM pairwise_item WHERE survey_id = %s
        ORDER BY item_order
    """, (survey_id,))

    items = []
    for row in (item_rows or []):
        items.append({
            "id": str(row['id']),
            "text": row['item_text'],
            "order": row['item_order']
        })

    return {
        "id": str(survey_row['id']),
        "surveyTitle": survey_row['survey_title'],
        "surveyType": survey_row['survey_type'] or 'pairwise',
        "comparisonQuestion": survey_row['comparison_question'],
        "polisConversationId": survey_row['polis_conversation_id'],
        "locationId": str(survey_row['location_id']) if survey_row['location_id'] else None,
        "locationCode": survey_row['location_code'],
        "locationName": survey_row['location_name'],
        "categoryId": str(survey_row['position_category_id']) if survey_row['position_category_id'] else None,
        "categoryName": survey_row['category_name'],
        "isGroupLabeling": bool(survey_row.get('is_group_labeling')),
        "items": items,
        "startTime": survey_row['start_time'].isoformat() if survey_row['start_time'] else None,
        "endTime": survey_row['end_time'].isoformat() if survey_row['end_time'] else None,
        "status": survey_row['status'],
        "createdTime": survey_row['created_time'].isoformat() if survey_row['created_time'] else None
    }


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


def _get_group_user_ids(polis_conv_id, group_id):
    """Get user IDs for members of a specific Polis group."""
    from candid.controllers.helpers.polis_client import get_client, PolisError

    try:
        client = get_client()
        math_data = client.get_math_data(polis_conv_id)

        if not math_data:
            return None

        pca_wrapper = math_data.get("pca", {})
        pca_data = pca_wrapper.get("asPOJO", {}) if isinstance(pca_wrapper, dict) else {}
        group_clusters = pca_data.get("group-clusters", [])

        # Get pids for this group
        try:
            gid = int(group_id)
            if gid >= len(group_clusters) or not group_clusters[gid]:
                return None
            member_pids = group_clusters[gid].get("members", [])
        except ValueError:
            return None

        if not member_pids:
            return []

        # Map pids to user_ids via polis_participant table
        user_rows = db.execute_query("""
            SELECT DISTINCT user_id
            FROM polis_participant
            WHERE polis_conversation_id = %s
              AND polis_pid = ANY(%s)
        """, (polis_conv_id, member_pids))

        return [str(u["user_id"]) for u in (user_rows or [])]

    except PolisError:
        return None


def _compute_pairwise_rankings(survey_id, user_id_filter=None):
    """Compute win counts for each item in a pairwise survey."""
    # Get all items for this survey
    items = db.execute_query("""
        SELECT id, item_text FROM pairwise_item WHERE survey_id = %s ORDER BY item_order
    """, (survey_id,))

    if not items:
        return []

    # Build rankings with win counts
    rankings = []
    for item in items:
        item_id = str(item['id'])

        # Count wins (where this item was the winner)
        if user_id_filter is not None and len(user_id_filter) > 0:
            # Filter by specific users
            win_count = db.execute_query("""
                SELECT COUNT(*) as count
                FROM pairwise_response
                WHERE survey_id = %s AND winner_item_id = %s AND user_id = ANY(%s::uuid[])
            """, (survey_id, item_id, user_id_filter), fetchone=True)['count']

            # Count total comparisons involving this item
            comparison_count = db.execute_query("""
                SELECT COUNT(*) as count
                FROM pairwise_response
                WHERE survey_id = %s AND (winner_item_id = %s OR loser_item_id = %s) AND user_id = ANY(%s::uuid[])
            """, (survey_id, item_id, item_id, user_id_filter), fetchone=True)['count']
        elif user_id_filter is not None:
            # Empty user list means no responses to count
            win_count = 0
            comparison_count = 0
        else:
            # No filter - count all
            win_count = db.execute_query("""
                SELECT COUNT(*) as count
                FROM pairwise_response
                WHERE survey_id = %s AND winner_item_id = %s
            """, (survey_id, item_id), fetchone=True)['count']

            comparison_count = db.execute_query("""
                SELECT COUNT(*) as count
                FROM pairwise_response
                WHERE survey_id = %s AND (winner_item_id = %s OR loser_item_id = %s)
            """, (survey_id, item_id, item_id), fetchone=True)['count']

        rankings.append({
            "itemId": item_id,
            "itemText": item['item_text'],
            "winCount": win_count,
            "comparisonCount": comparison_count
        })

    # Sort by win count descending and assign ranks
    rankings.sort(key=lambda r: r['winCount'], reverse=True)
    for i, r in enumerate(rankings):
        r['rank'] = i + 1

    return rankings


# ---------------------------------------------------------------------------
# User Search API
# ---------------------------------------------------------------------------

def search_users(search=None, limit=20, offset=0, token_info=None):  # noqa: E501
    """Search users by username or display name.

    GET /admin/users?search=&limit=&offset=
    Auth: facilitator+ (any scoped role holder).
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
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

# Roles admins can assign (at their location or descendants)
_ADMIN_ASSIGNABLE = {'admin', 'moderator', 'facilitator'}
# Roles facilitators can assign (at their location+category)
_FACILITATOR_ASSIGNABLE = {'assistant_moderator', 'expert', 'liaison'}

_ALL_ASSIGNABLE = _ADMIN_ASSIGNABLE | _FACILITATOR_ASSIGNABLE


def _notify_peers(peer_user_ids, requester_name, action, role, target_name):
    """Send push notifications to approval peers about a role change request."""
    try:
        from candid.controllers.helpers.push_notifications import send_or_queue_notification
        action_word = "assign" if action == "assign" else "remove"
        title = "Role change request needs review"
        body = f"{requester_name} requested to {action_word} {role} for {target_name}"
        data = {"action": "open_admin_pending"}
        for peer_id in peer_user_ids:
            send_or_queue_notification(title, body, data, peer_id, db)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error("Failed to notify peers: %s", e)


def _check_auto_approve_expired():
    """Auto-approve any pending requests past their timeout. Check-on-access pattern."""
    from datetime import datetime, timezone, timedelta
    db.execute_query("""
        UPDATE role_change_request
        SET status = 'auto_approved', updated_time = CURRENT_TIMESTAMP
        WHERE status = 'pending' AND auto_approve_at <= CURRENT_TIMESTAMP
    """)


def _apply_role_change(request_row):
    """Apply an approved/auto-approved role change request."""
    if request_row['action'] == 'assign':
        # Check if already exists (idempotent)
        existing = db.execute_query("""
            SELECT id FROM user_role
            WHERE user_id = %s AND role = %s AND location_id = %s
            AND (position_category_id = %s OR (position_category_id IS NULL AND %s IS NULL))
            LIMIT 1
        """, (request_row['target_user_id'], request_row['role'],
              request_row['location_id'],
              request_row['position_category_id'], request_row['position_category_id']),
            fetchone=True)
        if not existing:
            role_id = str(uuid.uuid4())
            db.execute_query("""
                INSERT INTO user_role (id, user_id, role, location_id, position_category_id, assigned_by)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (role_id, request_row['target_user_id'], request_row['role'],
                  request_row['location_id'], request_row['position_category_id'],
                  request_row['requested_by']))
    elif request_row['action'] == 'remove':
        if request_row.get('user_role_id'):
            db.execute_query("""
                DELETE FROM user_role WHERE id = %s
            """, (request_row['user_role_id'],))


def _find_approval_peer(request_row):
    """Find a peer who can approve this request. Returns user_id or None.

    Admin requesting (admin/moderator/facilitator):
      1. Peer admin at same level (requester_authority_location_id)
      2. Admin at target level (if lower)
      3. None → auto-approve

    Facilitator requesting (asst_mod/expert/liaison):
      1. Peer facilitator at same location+category
      2. Location moderator
      3. Location admin
      4. None → auto-approve
    """
    requester_id = str(request_row['requested_by'])
    role = request_row['role']
    target_loc = str(request_row['location_id']) if request_row.get('location_id') else None
    target_cat = str(request_row['position_category_id']) if request_row.get('position_category_id') else None
    authority_loc = str(request_row['requester_authority_location_id'])

    if role in _ADMIN_ASSIGNABLE:
        # Admin requesting: find peer admin at authority location
        rows = db.execute_query("""
            SELECT ur.user_id FROM user_role ur
            JOIN users u ON ur.user_id = u.id
            WHERE ur.role = 'admin' AND ur.location_id = %s AND ur.user_id != %s
            AND u.keycloak_id IS NOT NULL
        """, (authority_loc, requester_id))
        if rows:
            return [str(r['user_id']) for r in rows]

        # No peer at authority level; try admin at target location
        if target_loc and target_loc != authority_loc:
            rows = db.execute_query("""
                SELECT ur.user_id FROM user_role ur
                JOIN users u ON ur.user_id = u.id
                WHERE ur.role = 'admin' AND ur.location_id = %s AND ur.user_id != %s
                AND u.keycloak_id IS NOT NULL
            """, (target_loc, requester_id))
            if rows:
                return [str(r['user_id']) for r in rows]

        return None  # auto-approve

    elif role in _FACILITATOR_ASSIGNABLE:
        # Facilitator requesting: find peer facilitator
        if target_loc and target_cat:
            rows = db.execute_query("""
                SELECT ur.user_id FROM user_role ur
                JOIN users u ON ur.user_id = u.id
                WHERE ur.role = 'facilitator' AND ur.location_id = %s
                AND ur.position_category_id = %s AND ur.user_id != %s
                AND u.keycloak_id IS NOT NULL
            """, (target_loc, target_cat, requester_id))
            if rows:
                return [str(r['user_id']) for r in rows]

        # Fallback: location moderator
        if target_loc:
            ancestors = get_location_ancestors(target_loc)
            if ancestors:
                rows = db.execute_query("""
                    SELECT ur.user_id FROM user_role ur
                    JOIN users u ON ur.user_id = u.id
                    WHERE ur.role = 'moderator' AND ur.location_id = ANY(%s::uuid[]) AND ur.user_id != %s
                    AND u.keycloak_id IS NOT NULL
                """, (ancestors, requester_id))
                if rows:
                    return [str(r['user_id']) for r in rows]

                # Fallback: location admin
                rows = db.execute_query("""
                    SELECT ur.user_id FROM user_role ur
                    JOIN users u ON ur.user_id = u.id
                    WHERE ur.role = 'admin' AND ur.location_id = ANY(%s::uuid[]) AND ur.user_id != %s
                    AND u.keycloak_id IS NOT NULL
                """, (ancestors, requester_id))
                if rows:
                    return [str(r['user_id']) for r in rows]

        return None  # auto-approve

    return None


def _get_requester_authority_location(user_id, role, location_id, category_id=None):
    """Determine the requester's authority location for a role change.

    Returns the location_id where the requester has authority, or None if unauthorized.
    """
    if role in _ADMIN_ASSIGNABLE:
        # Admin must have admin role at target location or ancestor.
        # Walk from target up to root; return first match (deepest authority).
        ancestors = get_location_ancestors(location_id)
        if ancestors:
            # Find all admin locations in the ancestry
            admin_locs = db.execute_query("""
                SELECT location_id FROM user_role
                WHERE user_id = %s AND role = 'admin' AND location_id = ANY(%s::uuid[])
            """, (str(user_id), ancestors))
            if admin_locs:
                admin_set = {str(r['location_id']) for r in admin_locs}
                # Return the deepest (closest to target) admin location
                for anc in ancestors:
                    if anc in admin_set:
                        return anc
        return None

    elif role in _FACILITATOR_ASSIGNABLE:
        # Facilitator must have facilitator role at exact location+category
        if category_id:
            row = db.execute_query("""
                SELECT 1 FROM user_role
                WHERE user_id = %s AND role = 'facilitator'
                AND location_id = %s AND position_category_id = %s
                LIMIT 1
            """, (str(user_id), str(location_id), str(category_id)), fetchone=True)
            if row:
                return str(location_id)
        return None

    return None


def request_role_assignment(body, token_info=None):  # noqa: E501
    """Request a role assignment for a user.

    POST /admin/roles

    Admins can request: admin, moderator, facilitator (at their location or descendants).
    Facilitators can request: assistant_moderator, expert, liaison (at their location+category).
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    target_user_id = body.get('targetUserId')
    role = body.get('role')
    location_id = body.get('locationId')
    category_id = body.get('positionCategoryId')
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

    # Category required for non-hierarchical roles
    if role in _FACILITATOR_ASSIGNABLE and not category_id:
        return ErrorModel(400, "positionCategoryId is required for this role"), 400

    if category_id:
        cat = db.execute_query("SELECT id FROM position_category WHERE id = %s", (category_id,), fetchone=True)
        if not cat:
            return ErrorModel(400, "Category not found"), 400

    # Check authorization: does the requester have authority?
    authority_loc = _get_requester_authority_location(str(user.id), role, location_id, category_id)
    if not authority_loc:
        return ErrorModel(403, "You do not have authority to assign this role at this location"), 403

    # Check if target already has this role
    if category_id:
        existing = db.execute_query("""
            SELECT id FROM user_role
            WHERE user_id = %s AND role = %s AND location_id = %s AND position_category_id = %s
        """, (target_user_id, role, location_id, category_id), fetchone=True)
    else:
        existing = db.execute_query("""
            SELECT id FROM user_role
            WHERE user_id = %s AND role = %s AND location_id = %s AND position_category_id IS NULL
        """, (target_user_id, role, location_id), fetchone=True)
    if existing:
        return ErrorModel(400, "User already has this role"), 400

    # Check for duplicate pending request
    dup_check_params = [target_user_id, role, location_id]
    dup_cat_clause = "AND position_category_id = %s" if category_id else "AND position_category_id IS NULL"
    if category_id:
        dup_check_params.append(category_id)
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
            (id, action, target_user_id, role, location_id, position_category_id,
             requested_by, requester_authority_location_id, request_reason, auto_approve_at)
        VALUES (%s, 'assign', %s, %s, %s, %s, %s, %s, %s, %s)
    """, (request_id, target_user_id, role, location_id, category_id,
          str(user.id), authority_loc, reason, auto_approve_at))

    # Check if auto-approve (no peer available)
    peers = _find_approval_peer({
        'requested_by': str(user.id),
        'role': role,
        'location_id': location_id,
        'position_category_id': category_id,
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
            'position_category_id': category_id,
            'requested_by': str(user.id),
        })
        return {'id': request_id, 'status': 'auto_approved'}, 201

    # Notify approval peers
    target_name = db.execute_query("SELECT display_name FROM users WHERE id = %s",
                                    (target_user_id,), fetchone=True)
    target_display = target_name['display_name'] if target_name else 'a user'
    _notify_peers(peers, user.display_name, 'assign', role, target_display)

    return {'id': request_id, 'status': 'pending'}, 201


def request_role_removal(body, token_info=None):  # noqa: E501
    """Request removal of a user's role.

    POST /admin/roles/remove
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    user_role_id = body.get('userRoleId')
    reason = body.get('reason', '')

    if not user_role_id:
        return ErrorModel(400, "userRoleId is required"), 400

    # Fetch the existing role
    role_row = db.execute_query("""
        SELECT id, user_id, role, location_id, position_category_id
        FROM user_role WHERE id = %s
    """, (user_role_id,), fetchone=True)
    if not role_row:
        return ErrorModel(400, "Role assignment not found"), 400

    role = role_row['role']
    location_id = str(role_row['location_id']) if role_row['location_id'] else None
    category_id = str(role_row['position_category_id']) if role_row['position_category_id'] else None

    # Check authorization
    authority_loc = _get_requester_authority_location(str(user.id), role, location_id, category_id)
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
            (id, action, target_user_id, role, location_id, position_category_id,
             user_role_id, requested_by, requester_authority_location_id, request_reason, auto_approve_at)
        VALUES (%s, 'remove', %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (request_id, str(role_row['user_id']), role, location_id, category_id,
          user_role_id, str(user.id), authority_loc, reason, auto_approve_at))

    # Check auto-approve
    peers = _find_approval_peer({
        'requested_by': str(user.id),
        'role': role,
        'location_id': location_id,
        'position_category_id': category_id,
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
            'position_category_id': category_id,
            'requested_by': str(user.id),
        })
        return {'id': request_id, 'status': 'auto_approved'}, 201

    # Notify approval peers
    target_name = db.execute_query("SELECT display_name FROM users WHERE id = %s",
                                    (str(role_row['user_id']),), fetchone=True)
    target_display = target_name['display_name'] if target_name else 'a user'
    _notify_peers(peers, user.display_name, 'remove', role, target_display)

    return {'id': request_id, 'status': 'pending'}, 201


def get_pending_role_requests(token_info=None):  # noqa: E501
    """Get pending role change requests that the current user can approve.

    GET /admin/roles/pending
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    # First, auto-approve any expired requests
    _check_auto_approve_expired()

    # Get all pending requests
    requests = db.execute_query("""
        SELECT rcr.id, rcr.action, rcr.target_user_id, rcr.role,
               rcr.location_id, rcr.position_category_id, rcr.user_role_id,
               rcr.requested_by, rcr.requester_authority_location_id,
               rcr.request_reason, rcr.auto_approve_at, rcr.created_time,
               u_target.username AS target_username, u_target.display_name AS target_display_name,
               u_req.username AS requester_username, u_req.display_name AS requester_display_name,
               l.name AS location_name, l.code AS location_code,
               pc.label AS category_label
        FROM role_change_request rcr
        JOIN users u_target ON rcr.target_user_id = u_target.id
        JOIN users u_req ON rcr.requested_by = u_req.id
        LEFT JOIN location l ON rcr.location_id = l.id
        LEFT JOIN position_category pc ON rcr.position_category_id = pc.id
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
                },
                'role': r['role'],
                'location': {
                    'id': str(r['location_id']),
                    'name': r['location_name'],
                    'code': r['location_code'],
                } if r.get('location_id') else None,
                'category': {
                    'id': str(r['position_category_id']),
                    'label': r['category_label'],
                } if r.get('position_category_id') else None,
                'requester': {
                    'id': str(r['requested_by']),
                    'username': r['requester_username'],
                    'displayName': r['requester_display_name'],
                },
                'reason': r.get('request_reason'),
                'autoApproveAt': r['auto_approve_at'].isoformat() if r.get('auto_approve_at') else None,
                'createdTime': r['created_time'].isoformat() if r.get('created_time') else None,
            })

    return result


def approve_role_request(request_id, token_info=None):  # noqa: E501
    """Approve a pending role change request.

    POST /admin/roles/requests/{id}/approve
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    # Auto-approve expired first
    _check_auto_approve_expired()

    req = db.execute_query("""
        SELECT * FROM role_change_request WHERE id = %s
    """, (request_id,), fetchone=True)

    if not req:
        return ErrorModel(404, "Request not found"), 404

    if req['status'] != 'pending':
        return ErrorModel(400, f"Request is already {req['status']}"), 400

    # Verify this user can approve
    peers = _find_approval_peer(req)
    if not peers or str(user.id) not in peers:
        return ErrorModel(403, "You are not authorized to approve this request"), 403

    # Approve
    db.execute_query("""
        UPDATE role_change_request
        SET status = 'approved', reviewed_by = %s, updated_time = CURRENT_TIMESTAMP
        WHERE id = %s
    """, (str(user.id), request_id))

    _apply_role_change(req)

    return {'id': str(req['id']), 'status': 'approved'}


def deny_role_request(request_id, body=None, token_info=None):  # noqa: E501
    """Deny a pending role change request.

    POST /admin/roles/requests/{id}/deny
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()
    denial_reason = (body or {}).get('reason', '')

    # Auto-approve expired first
    _check_auto_approve_expired()

    req = db.execute_query("""
        SELECT * FROM role_change_request WHERE id = %s
    """, (request_id,), fetchone=True)

    if not req:
        return ErrorModel(404, "Request not found"), 404

    if req['status'] != 'pending':
        return ErrorModel(400, f"Request is already {req['status']}"), 400

    # Verify this user can approve/deny
    peers = _find_approval_peer(req)
    if not peers or str(user.id) not in peers:
        return ErrorModel(403, "You are not authorized to deny this request"), 403

    db.execute_query("""
        UPDATE role_change_request
        SET status = 'denied', reviewed_by = %s, denial_reason = %s, updated_time = CURRENT_TIMESTAMP
        WHERE id = %s
    """, (str(user.id), denial_reason, request_id))

    return {'id': str(req['id']), 'status': 'denied'}


def _format_role_request(r):
    """Shared serializer for role change request rows (with JOINed fields)."""
    result = {
        'id': str(r['id']),
        'action': r['action'],
        'targetUser': {
            'id': str(r['target_user_id']),
            'username': r['target_username'],
            'displayName': r['target_display_name'],
        },
        'role': r['role'],
        'location': {
            'id': str(r['location_id']),
            'name': r['location_name'],
            'code': r['location_code'],
        } if r.get('location_id') else None,
        'category': {
            'id': str(r['position_category_id']),
            'label': r['category_label'],
        } if r.get('position_category_id') else None,
        'requester': {
            'id': str(r['requested_by']),
            'username': r['requester_username'],
            'displayName': r['requester_display_name'],
        },
        'reason': r.get('request_reason'),
        'autoApproveAt': r['auto_approve_at'].isoformat() if r.get('auto_approve_at') else None,
        'createdTime': r['created_time'].isoformat() if r.get('created_time') else None,
        'status': r['status'],
        'denialReason': r.get('denial_reason'),
        'reviewer': {
            'id': str(r['reviewer_id']),
            'username': r['reviewer_username'],
            'displayName': r['reviewer_display_name'],
        } if r.get('reviewer_id') else None,
        'updatedTime': r['updated_time'].isoformat() if r.get('updated_time') else None,
    }
    return result


_ROLE_REQUEST_SELECT = """
    SELECT rcr.id, rcr.action, rcr.target_user_id, rcr.role,
           rcr.location_id, rcr.position_category_id, rcr.user_role_id,
           rcr.requested_by, rcr.requester_authority_location_id,
           rcr.request_reason, rcr.auto_approve_at, rcr.created_time,
           rcr.status, rcr.denial_reason, rcr.updated_time,
           u_target.username AS target_username, u_target.display_name AS target_display_name,
           u_req.username AS requester_username, u_req.display_name AS requester_display_name,
           l.name AS location_name, l.code AS location_code,
           pc.label AS category_label,
           u_rev.id AS reviewer_id, u_rev.username AS reviewer_username,
           u_rev.display_name AS reviewer_display_name
    FROM role_change_request rcr
    JOIN users u_target ON rcr.target_user_id = u_target.id
    JOIN users u_req ON rcr.requested_by = u_req.id
    LEFT JOIN location l ON rcr.location_id = l.id
    LEFT JOIN position_category pc ON rcr.position_category_id = pc.id
    LEFT JOIN users u_rev ON rcr.reviewed_by = u_rev.id
"""


def get_role_requests(view=None, token_info=None):  # noqa: E501
    """Get role change requests with view filter.

    GET /admin/roles/requests?view=pending|all|mine
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
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
            elif r == 'facilitator':
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


def rescind_role_request(request_id, token_info=None):  # noqa: E501
    """Rescind a pending role change request (requester only).

    POST /admin/roles/requests/{id}/rescind
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    req = db.execute_query("""
        SELECT id, requested_by, status FROM role_change_request WHERE id = %s
    """, (request_id,), fetchone=True)

    if not req:
        return ErrorModel(404, "Request not found"), 404

    if str(req['requested_by']) != str(user.id):
        return ErrorModel(403, "Only the original requester can rescind"), 403

    if req['status'] != 'pending':
        return ErrorModel(400, f"Request is already {req['status']}"), 400

    db.execute_query("""
        UPDATE role_change_request
        SET status = 'rescinded', updated_time = CURRENT_TIMESTAMP
        WHERE id = %s
    """, (request_id,))

    return {'id': str(req['id']), 'status': 'rescinded'}


def list_roles(user_id=None, location_id=None, role=None, token_info=None):  # noqa: E501
    """List roles with optional filters.

    GET /admin/roles
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
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

    where = ""
    if conditions:
        where = "WHERE " + " AND ".join(conditions)

    rows = db.execute_query(f"""
        SELECT ur.id, ur.user_id, ur.role, ur.location_id, ur.position_category_id,
               ur.assigned_by, ur.created_time,
               u.username, u.display_name, u.avatar_icon_url, u.trust_score,
               COALESCE((SELECT COUNT(*) FROM kudos k
                         WHERE k.receiver_user_id = u.id AND k.status = 'sent'), 0) AS kudos_count,
               l.name AS location_name, l.code AS location_code,
               pc.label AS category_label
        FROM user_role ur
        JOIN users u ON ur.user_id = u.id
        LEFT JOIN location l ON ur.location_id = l.id
        LEFT JOIN position_category pc ON ur.position_category_id = pc.id
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
            'category': {
                'id': str(r['position_category_id']),
                'label': r['category_label'],
            } if r.get('position_category_id') else None,
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

    # Reparent children + soft-delete
    parent_id = loc['parent_location_id']
    db.execute_query(
        "UPDATE location SET parent_location_id = %s WHERE parent_location_id = %s AND deleted_at IS NULL",
        (parent_id, location_id))
    db.execute_query(
        "UPDATE location SET deleted_at = NOW() WHERE id = %s",
        (location_id,))

    invalidate_location_cache()

    return '', 204


def get_location_categories(location_id, token_info=None):  # noqa: E501
    """Get categories assigned to a location.

    GET /admin/locations/{id}/categories
    Auth: facilitator+ (any scoped role holder).
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    rows = db.execute_query("""
        SELECT pc.id, pc.label
        FROM location_category lc
        JOIN position_category pc ON lc.position_category_id = pc.id
        WHERE lc.location_id = %s
        ORDER BY pc.label ASC
    """, (location_id,))

    return [{'id': str(r['id']), 'label': r['label']} for r in (rows or [])]


def assign_location_category(location_id, body, token_info=None):  # noqa: E501
    """Assign a category to a location.

    POST /admin/locations/{id}/categories
    Auth: admin at location or ancestor.
    """
    authorized, auth_err = authorization_scoped("admin", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    category_id = body.get('positionCategoryId')
    if not category_id:
        return ErrorModel(400, "positionCategoryId is required"), 400

    # Validate location and category exist (exclude soft-deleted)
    loc = db.execute_query("SELECT id FROM location WHERE id = %s AND deleted_at IS NULL", (location_id,), fetchone=True)
    if not loc:
        return ErrorModel(404, "Location not found"), 404

    if not is_admin_at_location(str(user.id), location_id):
        return ErrorModel(403, "Admin authority at this location is required"), 403

    cat = db.execute_query("SELECT id, label FROM position_category WHERE id = %s",
                           (category_id,), fetchone=True)
    if not cat:
        return ErrorModel(400, "Category not found"), 400

    # Check if already assigned
    existing = db.execute_query("""
        SELECT id FROM location_category
        WHERE location_id = %s AND position_category_id = %s
    """, (location_id, category_id), fetchone=True)
    if existing:
        return ErrorModel(400, "Category already assigned to this location"), 400

    lc_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO location_category (id, location_id, position_category_id)
        VALUES (%s, %s, %s)
    """, (lc_id, location_id, category_id))

    return {
        'id': lc_id,
        'locationId': str(location_id),
        'positionCategoryId': str(category_id),
        'categoryLabel': cat['label'],
    }, 201


def remove_location_category(location_id, category_id, token_info=None):  # noqa: E501
    """Remove a category from a location.

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
        SELECT id FROM location_category
        WHERE location_id = %s AND position_category_id = %s
    """, (location_id, category_id), fetchone=True)
    if not existing:
        return ErrorModel(404, "Category assignment not found"), 404

    db.execute_query("""
        DELETE FROM location_category
        WHERE location_id = %s AND position_category_id = %s
    """, (location_id, category_id))

    return '', 204


# ---------------------------------------------------------------------------
# Category Management API
# ---------------------------------------------------------------------------

def create_category(body, token_info=None):  # noqa: E501
    """Create a new position category.

    POST /admin/categories
    Auth: site admin.
    """
    authorized, auth_err = authorization_site_admin(token_info)
    if not authorized:
        return auth_err, auth_err.code

    if connexion.request.is_json:
        body = connexion.request.get_json()

    label = (body.get('label') or '').strip()
    parent_id = body.get('parentPositionCategoryId')

    if not label:
        return ErrorModel(400, "Category label is required"), 400

    # Check for duplicate (case-insensitive)
    existing = db.execute_query("""
        SELECT id FROM position_category WHERE LOWER(label) = LOWER(%s)
    """, (label,), fetchone=True)
    if existing:
        return ErrorModel(400, "A category with this label already exists"), 400

    if parent_id:
        parent = db.execute_query(
            "SELECT id FROM position_category WHERE id = %s", (parent_id,), fetchone=True)
        if not parent:
            return ErrorModel(400, "Parent category not found"), 400

    category_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO position_category (id, label, parent_position_category_id)
        VALUES (%s, %s, %s)
    """, (category_id, label, parent_id))

    result = {
        'id': category_id,
        'label': label,
        'parentPositionCategoryId': parent_id,
    }

    # Optionally create a label survey at category creation time
    create_label_survey = body.get('createLabelSurvey', False)
    if create_label_survey:
        label_items = body.get('labelSurveyItems', [])
        label_items = [i.strip() for i in label_items if i.strip()]
        if len(label_items) >= 2:
            user = token_to_user(token_info)
            comp_question = (body.get('labelSurveyComparisonQuestion') or '').strip() or "Which better describes this group's views?"
            survey_id = str(uuid.uuid4())
            db.execute_query("""
                INSERT INTO survey (id, creator_user_id, survey_title, survey_type, comparison_question,
                                   position_category_id, is_group_labeling, status)
                VALUES (%s, %s, %s, 'pairwise', %s, %s, true, 'active')
            """, (survey_id, user.id, f"Label Survey: {label}", comp_question, category_id))
            for i, item_text in enumerate(label_items):
                item_id = str(uuid.uuid4())
                db.execute_query("""
                    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
                    VALUES (%s, %s, %s, %s)
                """, (item_id, survey_id, item_text, i))
            result['labelSurvey'] = _build_pairwise_survey(survey_id)

    return result, 201


def get_category_label_survey(category_id, token_info=None):  # noqa: E501
    """Get the label survey for a category.

    GET /admin/categories/{categoryId}/label-survey
    Auth: facilitator+ (scoped).
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    row = db.execute_query("""
        SELECT id FROM survey
        WHERE position_category_id = %s AND is_group_labeling = true AND status != 'deleted'
        ORDER BY created_time DESC LIMIT 1
    """, (category_id,), fetchone=True)

    if row:
        return {"labelSurvey": _build_pairwise_survey(row['id'])}
    return {"labelSurvey": None}


# ---------------------------------------------------------------------------
# User Ban/Unban API
# ---------------------------------------------------------------------------

def ban_user(user_id, body=None, token_info=None):  # noqa: E501
    """Ban a user.

    POST /admin/users/{userId}/ban
    Auth: facilitator+ (scoped).
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    acting_user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    reason = (body.get('reason') or '').strip() if body else ''
    if not reason:
        return ErrorModel(400, "Reason is required for banning a user"), 400

    user = db.execute_query("""
        SELECT id, status FROM users WHERE id = %s
    """, (user_id,), fetchone=True)

    if not user:
        return ErrorModel(404, "User not found"), 404

    if user['status'] == 'banned':
        return ErrorModel(400, "User is already banned"), 400

    if user['status'] == 'deleted':
        return ErrorModel(400, "Cannot ban a deleted user"), 400

    db.execute_query("""
        UPDATE users SET status = 'banned' WHERE id = %s
    """, (user_id,))
    invalidate_ban_cache(user_id)

    db.execute_query("""
        INSERT INTO admin_action_log (id, action, target_user_id, performed_by, reason)
        VALUES (%s, 'ban', %s, %s, %s)
    """, (str(uuid.uuid4()), user_id, acting_user.id, reason))

    return {'id': str(user_id), 'status': 'banned'}


def unban_user(user_id, body=None, token_info=None):  # noqa: E501
    """Unban a user.

    POST /admin/users/{userId}/unban
    Auth: facilitator+ (scoped).
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    acting_user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    reason = (body.get('reason') or '').strip() if body else ''
    if not reason:
        return ErrorModel(400, "Reason is required for unbanning a user"), 400

    user = db.execute_query("""
        SELECT id, status FROM users WHERE id = %s
    """, (user_id,), fetchone=True)

    if not user:
        return ErrorModel(404, "User not found"), 404

    if user['status'] != 'banned':
        return ErrorModel(400, "User is not banned"), 400

    db.execute_query("""
        UPDATE users SET status = 'active' WHERE id = %s
    """, (user_id,))
    invalidate_ban_cache(user_id)

    db.execute_query("""
        INSERT INTO admin_action_log (id, action, target_user_id, performed_by, reason)
        VALUES (%s, 'unban', %s, %s, %s)
    """, (str(uuid.uuid4()), user_id, acting_user.id, reason))

    return {'id': str(user_id), 'status': 'active'}


def get_admin_actions(token_info=None):  # noqa: E501
    """Get admin action log (ban/unban audit trail).

    GET /admin/actions
    Auth: facilitator+ (scoped).
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    rows = db.execute_query("""
        SELECT aal.id, aal.action, aal.target_user_id, aal.performed_by, aal.reason, aal.created_time,
               u_target.username AS target_username, u_target.display_name AS target_display_name,
               u_target.avatar_icon_url AS target_avatar_icon_url,
               u_performer.username AS performer_username, u_performer.display_name AS performer_display_name
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
                'avatarIconUrl': r.get('target_avatar_icon_url'),
            },
            'performedBy': {
                'id': str(r['performed_by']),
                'username': r['performer_username'],
                'displayName': r['performer_display_name'],
            },
            'reason': r['reason'],
            'createdTime': r['created_time'].isoformat() if r.get('created_time') else None,
        }
        for r in (rows or [])
    ]
