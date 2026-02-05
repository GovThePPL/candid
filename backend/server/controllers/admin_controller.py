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

from candid.controllers import db
from candid.controllers.helpers.auth import authorization, token_to_user
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
        SELECT id, creator_user_id, position_category_id, survey_title,
               created_time, start_time, end_time, status
        FROM survey WHERE id = %s
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
    authorized, auth_err = authorization("admin", token_info)
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
        INSERT INTO survey (id, creator_user_id, position_category_id, survey_title, start_time, end_time, status)
        VALUES (%s, %s, %s, %s, %s, %s, 'active')
    """, (
        survey_id,
        user.id,
        create_survey_request.position_category_id,
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
    authorized, auth_err = authorization("admin", token_info)
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
    authorized, auth_err = authorization("admin", token_info)
    if not authorized:
        return auth_err, auth_err.code

    survey = _build_survey_with_nested_data(survey_id)
    if survey is None:
        return ErrorModel(404, "Survey not found"), 404

    return survey


def get_surveys(title=None, status=None, created_after=None, created_before=None, token_info=None):  # noqa: E501
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
    authorized, auth_err = authorization("admin", token_info)
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

    # Date filters
    if created_after:
        conditions.append("created_time >= %s")
        params.append(created_after)

    if created_before:
        conditions.append("created_time <= %s")
        params.append(created_before)

    # Build query
    query = "SELECT id FROM survey"
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY created_time DESC"

    survey_rows = db.execute_query(query, tuple(params) if params else None)

    if survey_rows is None:
        survey_rows = []

    surveys = []
    for row in survey_rows:
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
    authorized, auth_err = authorization("admin", token_info)
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
    authorized, auth_err = authorization("admin", token_info)
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
    start_time = body.get('startTime')
    end_time = body.get('endTime')

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
                           polis_conversation_id, start_time, end_time, status)
        VALUES (%s, %s, %s, 'pairwise', %s, %s, %s, %s, 'active')
    """, (
        survey_id,
        user.id,
        survey_title,
        comparison_question,
        polis_conversation_id,
        start_time,
        end_time
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
        SELECT id, survey_title, comparison_question, polis_conversation_id,
               start_time, end_time, status, created_time
        FROM survey WHERE id = %s
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
        "comparisonQuestion": survey_row['comparison_question'],
        "polisConversationId": survey_row['polis_conversation_id'],
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
    authorized, auth_err = authorization("admin", token_info)
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
                WHERE survey_id = %s AND winner_item_id = %s AND user_id = ANY(%s)
            """, (survey_id, item_id, user_id_filter), fetchone=True)['count']

            # Count total comparisons involving this item
            comparison_count = db.execute_query("""
                SELECT COUNT(*) as count
                FROM pairwise_response
                WHERE survey_id = %s AND (winner_item_id = %s OR loser_item_id = %s) AND user_id = ANY(%s)
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
