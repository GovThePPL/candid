import connexion
from typing import Dict
from typing import Tuple
from typing import Union
import uuid

from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.respond_to_survey_question_request import RespondToSurveyQuestionRequest  # noqa: E501
from candid.models.survey import Survey  # noqa: E501
from candid.models.survey_question import SurveyQuestion  # noqa: E501
from candid.models.survey_question_option import SurveyQuestionOption  # noqa: E501
from candid.models.survey_question_response import SurveyQuestionResponse  # noqa: E501
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


def _get_group_member_user_ids(polis_conversation_id, group_id):
    """
    Get user IDs for members of a specific Polis group.

    :param polis_conversation_id: The Polis conversation ID
    :param group_id: The group index (0, 1, 2, etc.)
    :return: List of user_id strings, or None if group not found
    """
    if not polis_conversation_id or group_id is None:
        return None

    # Skip if "majority" or invalid group_id
    if str(group_id).lower() == "majority":
        return None

    try:
        group_idx = int(group_id)
    except (ValueError, TypeError):
        return None

    try:
        from candid.controllers.helpers.polis_client import get_client
        client = get_client()
        math_data = client.get_math_data(polis_conversation_id)

        if not math_data:
            return None

        pca_wrapper = math_data.get("pca", {})
        pca_data = pca_wrapper.get("asPOJO", {}) if isinstance(pca_wrapper, dict) else {}
        group_clusters = pca_data.get("group-clusters", [])

        if group_idx >= len(group_clusters) or not group_clusters[group_idx]:
            return None

        pids = group_clusters[group_idx].get("members", [])
        if not pids:
            return None

        # Get user_ids for these pids
        user_ids = db.execute_query("""
            SELECT user_id FROM polis_participant
            WHERE polis_conversation_id = %s AND polis_pid = ANY(%s)
        """, (polis_conversation_id, pids))

        return [str(u["user_id"]) for u in (user_ids or [])]

    except Exception as e:
        print(f"Error getting group members: {e}", flush=True)
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


def get_active_surveys(location_id=None, category_id=None, token_info=None):  # noqa: E501
    """Get a list of standard surveys

    Returns standard surveys for the given location and all parent locations.
    Includes both active and completed surveys.

    :param location_id: Filter by location ID (includes parent locations)
    :type location_id: str
    :param category_id: Filter by category ID
    :type category_id: str

    :rtype: Union[List[dict], Tuple[List[dict], int]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    # Build location hierarchy (this location and all parent locations)
    location_ids = []
    if location_id:
        hierarchy = db.execute_query("""
            WITH RECURSIVE location_hierarchy AS (
                SELECT id, parent_location_id, code, name FROM location WHERE id = %s
                UNION ALL
                SELECT l.id, l.parent_location_id, l.code, l.name
                FROM location l
                JOIN location_hierarchy lh ON l.id = lh.parent_location_id
            )
            SELECT id, code, name FROM location_hierarchy
        """, (location_id,))
        location_ids = [str(h["id"]) for h in (hierarchy or [])]

    # Get standard surveys (both active and inactive, exclude deleted)
    # Standard surveys are shown regardless of category - they are general purpose surveys
    # When a specific category is provided, filter to surveys matching that category OR with no category
    if location_ids:
        query = """
            SELECT DISTINCT s.id, s.survey_title, s.survey_type,
                   s.start_time, s.end_time, s.status, s.created_time,
                   s.location_id, s.position_category_id,
                   loc.code as location_code, loc.name as location_name,
                   pc.label as category_name
            FROM survey s
            LEFT JOIN location loc ON s.location_id = loc.id
            LEFT JOIN position_category pc ON s.position_category_id = pc.id
            WHERE s.survey_type = 'standard'
              AND s.status != 'deleted'
              AND s.location_id = ANY(%s::uuid[])
        """
        params = [location_ids]

        if category_id and category_id != 'all':
            # Show surveys for this category OR surveys with no category
            query += " AND (s.position_category_id = %s OR s.position_category_id IS NULL)"
            params.append(category_id)
        # When viewing "all", show all standard surveys (no category filter)

        # Order by end_time desc (active surveys with future end_time first)
        query += " ORDER BY s.end_time DESC NULLS LAST, s.created_time DESC"
        survey_rows = db.execute_query(query, tuple(params))
    else:
        query = """
            SELECT DISTINCT s.id, s.survey_title, s.survey_type,
                   s.start_time, s.end_time, s.status, s.created_time,
                   s.location_id, s.position_category_id,
                   loc.code as location_code, loc.name as location_name,
                   pc.label as category_name
            FROM survey s
            LEFT JOIN location loc ON s.location_id = loc.id
            LEFT JOIN position_category pc ON s.position_category_id = pc.id
            WHERE s.survey_type = 'standard'
              AND s.status != 'deleted'
        """
        params = []
        if category_id and category_id != 'all':
            query += " AND (s.position_category_id = %s OR s.position_category_id IS NULL)"
            params.append(category_id)
        query += " ORDER BY s.end_time DESC NULLS LAST, s.created_time DESC"
        survey_rows = db.execute_query(query, tuple(params) if params else None)

    result = []
    for s in (survey_rows or []):
        # Get question count for this survey
        questions = db.execute_query("""
            SELECT COUNT(*) as count FROM survey_question WHERE survey_id = %s
        """, (s["id"],), fetchone=True)

        # Compute status info
        status_info = _compute_survey_status_info(s["start_time"], s["end_time"], s["status"])

        result.append({
            "id": str(s["id"]),
            "surveyTitle": s["survey_title"],
            "surveyType": "standard",
            "locationId": str(s["location_id"]) if s["location_id"] else None,
            "locationCode": s["location_code"],
            "locationName": s["location_name"],
            "categoryId": str(s["position_category_id"]) if s["position_category_id"] else None,
            "categoryName": s["category_name"],
            "questionCount": questions["count"] if questions else 0,
            "startTime": s["start_time"].isoformat() if s["start_time"] else None,
            "endTime": s["end_time"].isoformat() if s["end_time"] else None,
            "status": s["status"],
            "isActive": status_info["isActive"],
            "daysRemaining": status_info["daysRemaining"],
            "dateRange": status_info["dateRange"],
            "createdTime": s["created_time"].isoformat() if s["created_time"] else None
        })

    return result


def get_survey_by_id(survey_id, token_info=None):  # noqa: E501
    """Get a specific survey

     # noqa: E501

    :param survey_id:
    :type survey_id: str
    :type survey_id: str

    :rtype: Union[Survey, Tuple[Survey, int], Tuple[Survey, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    # Check if survey exists and is accessible (active and within time window)
    survey_check = db.execute_query("""
        SELECT id, status, start_time, end_time FROM survey WHERE id = %s
    """, (survey_id,), fetchone=True)

    if survey_check is None:
        return ErrorModel(404, "Survey not found"), 404

    if survey_check['status'] != 'active':
        return ErrorModel(404, "Survey not found"), 404

    # Check time window
    now_check = db.execute_query("""
        SELECT CURRENT_TIMESTAMP AS now
    """, fetchone=True)

    if survey_check['start_time'] > now_check['now'] or survey_check['end_time'] < now_check['now']:
        return ErrorModel(404, "Survey not found"), 404

    survey = _build_survey_with_nested_data(survey_id)
    if survey is None:
        return ErrorModel(404, "Survey not found"), 404

    return survey


def respond_to_survey_question(survey_id, question_id, body, token_info=None):  # noqa: E501
    """Respond to a survey question

     # noqa: E501

    :param survey_id:
    :type survey_id: str
    :type survey_id: str
    :param question_id:
    :type question_id: str
    :type question_id: str
    :param respond_to_survey_question_request:
    :type respond_to_survey_question_request: dict | bytes

    :rtype: Union[SurveyQuestionResponse, Tuple[SurveyQuestionResponse, int], Tuple[SurveyQuestionResponse, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    respond_to_survey_question_request = body
    if connexion.request.is_json:
        respond_to_survey_question_request = RespondToSurveyQuestionRequest.from_dict(connexion.request.get_json())  # noqa: E501

    option_id = respond_to_survey_question_request.option_id

    # Validate survey is active and in time window
    survey_check = db.execute_query("""
        SELECT id, status, start_time, end_time FROM survey WHERE id = %s
    """, (survey_id,), fetchone=True)

    if survey_check is None:
        return ErrorModel(400, "Survey not found"), 400

    if survey_check['status'] != 'active':
        return ErrorModel(400, "Survey is not active"), 400

    # Check time window
    now_check = db.execute_query("""
        SELECT CURRENT_TIMESTAMP AS now
    """, fetchone=True)

    if survey_check['start_time'] > now_check['now']:
        return ErrorModel(400, "Survey has not started yet"), 400

    if survey_check['end_time'] < now_check['now']:
        return ErrorModel(400, "Survey has ended"), 400

    # Validate question belongs to survey
    question_check = db.execute_query("""
        SELECT id, survey_id FROM survey_question WHERE id = %s
    """, (question_id,), fetchone=True)

    if question_check is None:
        return ErrorModel(400, "Question not found"), 400

    if str(question_check['survey_id']) != str(survey_id):
        return ErrorModel(400, "Question does not belong to this survey"), 400

    # Validate option belongs to question
    option_check = db.execute_query("""
        SELECT id, survey_question_id FROM survey_question_option WHERE id = %s
    """, (option_id,), fetchone=True)

    if option_check is None:
        return ErrorModel(400, "Option not found"), 400

    if str(option_check['survey_question_id']) != str(question_id):
        return ErrorModel(400, "Option does not belong to this question"), 400

    # Check if user has already responded to this question (any option for this question)
    existing_response = db.execute_query("""
        SELECT sqr.id
        FROM survey_question_response sqr
        JOIN survey_question_option sqo ON sqr.survey_question_option_id = sqo.id
        WHERE sqo.survey_question_id = %s AND sqr.user_id = %s
    """, (question_id, user.id), fetchone=True)

    if existing_response:
        return ErrorModel(400, "You have already responded to this question"), 400

    # Create the response
    response_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO survey_question_response (id, survey_question_option_id, user_id)
        VALUES (%s, %s, %s)
    """, (response_id, option_id, user.id))

    # Fetch the created response
    response_row = db.execute_query("""
        SELECT id, survey_question_option_id, user_id, created_time
        FROM survey_question_response WHERE id = %s
    """, (response_id,), fetchone=True)

    return SurveyQuestionResponse(
        id=str(response_row['id']),
        survey_question_option_id=str(response_row['survey_question_option_id']),
        user_id=str(response_row['user_id']),
        response_time=response_row['created_time']
    ), 201


def _compute_survey_status_info(start_time, end_time, status):
    """Compute active/inactive status and date information for a survey."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)

    # Determine if survey is currently active
    is_active = status == 'active'
    if start_time and now < start_time:
        is_active = False
    if end_time and now > end_time:
        is_active = False

    result = {
        "isActive": is_active,
        "daysRemaining": None,
        "dateRange": None
    }

    if is_active and end_time:
        # Calculate days remaining
        delta = end_time - now
        result["daysRemaining"] = max(0, delta.days)
    elif not is_active and start_time and end_time:
        # Show date range for inactive surveys
        result["dateRange"] = {
            "start": start_time.strftime("%b %d, %Y"),
            "end": end_time.strftime("%b %d, %Y")
        }

    return result


def get_pairwise_surveys(location_id=None, category_id=None, token_info=None):  # noqa: E501
    """Get list of pairwise surveys

    Returns pairwise surveys for the given location and all parent locations.
    Includes both active and completed surveys.

    :param location_id: Filter by location ID (includes parent locations)
    :type location_id: str
    :param category_id: Filter by category ID
    :type category_id: str

    :rtype: Union[List[dict], Tuple[List[dict], int]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    # Build location hierarchy (this location and all parent locations)
    location_ids = []
    if location_id:
        hierarchy = db.execute_query("""
            WITH RECURSIVE location_hierarchy AS (
                SELECT id, parent_location_id, code, name FROM location WHERE id = %s
                UNION ALL
                SELECT l.id, l.parent_location_id, l.code, l.name
                FROM location l
                JOIN location_hierarchy lh ON l.id = lh.parent_location_id
            )
            SELECT id, code, name FROM location_hierarchy
        """, (location_id,))
        location_ids = [str(h["id"]) for h in (hierarchy or [])]

    # Get pairwise surveys (both active and inactive, exclude deleted)
    # When viewing "all" categories, exclude category-specific surveys
    # When viewing a specific category, include surveys for that category OR surveys with no category
    if location_ids:
        query = """
            SELECT DISTINCT s.id, s.survey_title, s.comparison_question, s.survey_type,
                   s.polis_conversation_id, s.start_time, s.end_time, s.status, s.created_time,
                   s.location_id, s.position_category_id,
                   loc.code as location_code, loc.name as location_name,
                   pc.label as category_name
            FROM survey s
            LEFT JOIN location loc ON s.location_id = loc.id
            LEFT JOIN position_category pc ON s.position_category_id = pc.id
            WHERE s.survey_type = 'pairwise'
              AND s.status != 'deleted'
              AND s.location_id = ANY(%s::uuid[])
        """
        params = [location_ids]

        if category_id and category_id != 'all':
            # Show surveys for this category OR surveys with no category
            query += " AND (s.position_category_id = %s OR s.position_category_id IS NULL)"
            params.append(category_id)
        else:
            # When viewing "all", only show surveys without a category
            query += " AND s.position_category_id IS NULL"

        # Order by end_time desc (active surveys with future end_time first)
        query += " ORDER BY s.end_time DESC NULLS LAST, s.created_time DESC"
        surveys = db.execute_query(query, tuple(params))
    else:
        query = """
            SELECT DISTINCT s.id, s.survey_title, s.comparison_question, s.survey_type,
                   s.polis_conversation_id, s.start_time, s.end_time, s.status, s.created_time,
                   s.location_id, s.position_category_id,
                   loc.code as location_code, loc.name as location_name,
                   pc.label as category_name
            FROM survey s
            LEFT JOIN location loc ON s.location_id = loc.id
            LEFT JOIN position_category pc ON s.position_category_id = pc.id
            WHERE s.survey_type = 'pairwise'
              AND s.status != 'deleted'
        """
        params = []
        if category_id and category_id != 'all':
            query += " AND (s.position_category_id = %s OR s.position_category_id IS NULL)"
            params.append(category_id)
        else:
            query += " AND s.position_category_id IS NULL"
        query += " ORDER BY s.end_time DESC NULLS LAST, s.created_time DESC"
        surveys = db.execute_query(query, tuple(params) if params else None)

    result = []
    for s in (surveys or []):
        # Get items for this survey
        items = db.execute_query("""
            SELECT id, item_text, item_order
            FROM pairwise_item
            WHERE survey_id = %s
            ORDER BY item_order
        """, (s["id"],))

        # Compute status info
        status_info = _compute_survey_status_info(s["start_time"], s["end_time"], s["status"])

        result.append({
            "id": str(s["id"]),
            "surveyTitle": s["survey_title"],
            "surveyType": "pairwise",
            "comparisonQuestion": s["comparison_question"],
            "polisConversationId": s["polis_conversation_id"],
            "locationId": str(s["location_id"]) if s["location_id"] else None,
            "locationCode": s["location_code"],
            "locationName": s["location_name"],
            "categoryId": str(s["position_category_id"]) if s["position_category_id"] else None,
            "categoryName": s["category_name"],
            "items": [
                {"id": str(i["id"]), "text": i["item_text"], "order": i["item_order"]}
                for i in (items or [])
            ],
            "startTime": s["start_time"].isoformat() if s["start_time"] else None,
            "endTime": s["end_time"].isoformat() if s["end_time"] else None,
            "status": s["status"],
            "isActive": status_info["isActive"],
            "daysRemaining": status_info["daysRemaining"],
            "dateRange": status_info["dateRange"],
            "createdTime": s["created_time"].isoformat() if s["created_time"] else None
        })

    return result


def get_survey_rankings(survey_id, filter_location_id=None, group_id=None, polis_conversation_id=None, token_info=None):  # noqa: E501
    """Get rankings from a pairwise survey

    Returns overall rankings and per-group rankings if the survey is linked
    to a Polis conversation. If filter_location_id is provided, only includes
    responses from users in that location. If group_id is provided, filters
    to users in that Polis group.

    :param survey_id: Survey ID
    :type survey_id: str
    :param filter_location_id: Only include responses from users in this location
    :type filter_location_id: str
    :param group_id: Filter to users in this Polis group (0, 1, 2, etc.)
    :type group_id: str
    :param polis_conversation_id: Polis conversation ID for group membership lookup
    :type polis_conversation_id: str

    :rtype: Union[dict, Tuple[dict, int]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    # Get survey info
    survey = db.execute_query("""
        SELECT s.id, s.survey_title, s.polis_conversation_id, s.survey_type,
               loc.code as location_code, loc.name as location_name
        FROM survey s
        LEFT JOIN location loc ON s.location_id = loc.id
        WHERE s.id = %s
    """, (survey_id,), fetchone=True)

    if not survey:
        return ErrorModel(404, "Survey not found"), 404

    if survey["survey_type"] != "pairwise":
        return ErrorModel(400, "Survey is not a pairwise survey"), 400

    # Get all items for this survey
    items = db.execute_query("""
        SELECT id, item_text FROM pairwise_item
        WHERE survey_id = %s
        ORDER BY item_order
    """, (survey_id,))

    item_dict = {str(i["id"]): i["item_text"] for i in (items or [])}

    # Build user filter based on location and/or group
    user_filter_clause = ""
    user_filter_params = []

    # Get group member user IDs if group_id is provided
    group_user_ids = None
    if group_id and str(group_id).lower() != "majority":
        # Use provided polis_conversation_id or fall back to survey's linked conversation
        conv_id = polis_conversation_id or survey.get("polis_conversation_id")
        if conv_id:
            group_user_ids = _get_group_member_user_ids(conv_id, group_id)

    if filter_location_id and group_user_ids:
        # Filter by both location AND group membership
        user_filter_clause = """
            AND pr.user_id IN (
                SELECT user_id FROM user_location WHERE location_id = %s
            )
            AND pr.user_id = ANY(%s::uuid[])
        """
        user_filter_params = [filter_location_id, group_user_ids]
    elif filter_location_id:
        # Filter by location only
        user_filter_clause = """
            AND pr.user_id IN (
                SELECT user_id FROM user_location WHERE location_id = %s
            )
        """
        user_filter_params = [filter_location_id]
    elif group_user_ids:
        # Filter by group only
        user_filter_clause = """
            AND pr.user_id = ANY(%s::uuid[])
        """
        user_filter_params = [group_user_ids]

    # Get overall rankings (win counts, filtered by location if specified)
    overall_rankings = db.execute_query(f"""
        SELECT pi.id as item_id, pi.item_text, COUNT(pr.id) as win_count
        FROM pairwise_item pi
        LEFT JOIN pairwise_response pr ON pr.winner_item_id = pi.id
            {user_filter_clause}
        WHERE pi.survey_id = %s::uuid
        GROUP BY pi.id, pi.item_text
        ORDER BY win_count DESC
    """, tuple(user_filter_params + [survey_id]))

    # Count total responses and unique respondents (filtered by location if specified)
    counts = db.execute_query(f"""
        SELECT COUNT(*) as total_responses, COUNT(DISTINCT user_id) as total_respondents
        FROM pairwise_response pr
        WHERE pr.survey_id = %s::uuid
            {user_filter_clause.replace('AND pr.user_id', 'AND pr.user_id') if user_filter_clause else ''}
    """, tuple([survey_id] + user_filter_params), fetchone=True)

    total_responses = counts["total_responses"] if counts else 0
    total_respondents = counts["total_respondents"] if counts else 0

    # Build overall rankings list
    rankings_list = []
    for i, r in enumerate(overall_rankings or []):
        rankings_list.append({
            "itemId": str(r["item_id"]),
            "itemText": r["item_text"],
            "rank": i + 1,
            "winCount": r["win_count"]
        })

    result = {
        "surveyId": str(survey["id"]),
        "surveyTitle": survey["survey_title"],
        "surveyLocationCode": survey["location_code"],
        "surveyLocationName": survey["location_name"],
        "totalResponses": total_responses,
        "totalRespondents": total_respondents,
        "rankings": rankings_list,
        "groupRankings": {}
    }

    # If linked to Polis conversation, compute per-group rankings
    polis_conv_id = survey["polis_conversation_id"]
    if polis_conv_id:
        try:
            from candid.controllers.helpers.polis_client import get_client, PolisError
            client = get_client()
            math_data = client.get_math_data(polis_conv_id)

            if math_data:
                pca_wrapper = math_data.get("pca", {})
                pca_data = pca_wrapper.get("asPOJO", {}) if isinstance(pca_wrapper, dict) else {}
                group_clusters = pca_data.get("group-clusters", [])
                labels = ["A", "B", "C", "D", "E", "F", "G", "H"]

                for group_idx, cluster in enumerate(group_clusters):
                    if not cluster:
                        continue

                    group_id = str(group_idx)
                    group_label = labels[group_idx] if group_idx < len(labels) else f"Group {group_idx + 1}"
                    pids = cluster.get("members", [])

                    if not pids:
                        continue

                    # Get user_ids for this group's members
                    user_ids = db.execute_query("""
                        SELECT user_id FROM polis_participant
                        WHERE polis_conversation_id = %s AND polis_pid = ANY(%s)
                    """, (polis_conv_id, pids))

                    user_id_list = [str(u["user_id"]) for u in (user_ids or [])]

                    if not user_id_list:
                        continue

                    # Get rankings for this group
                    group_rankings = db.execute_query("""
                        SELECT pi.id as item_id, pi.item_text, COUNT(pr.id) as win_count
                        FROM pairwise_item pi
                        LEFT JOIN pairwise_response pr ON pr.winner_item_id = pi.id
                            AND pr.user_id = ANY(%s::uuid[])
                        WHERE pi.survey_id = %s::uuid
                        GROUP BY pi.id, pi.item_text
                        ORDER BY win_count DESC
                    """, (user_id_list, survey_id))

                    group_rankings_list = []
                    for i, r in enumerate(group_rankings or []):
                        group_rankings_list.append({
                            "itemId": str(r["item_id"]),
                            "itemText": r["item_text"],
                            "rank": i + 1,
                            "winCount": r["win_count"]
                        })

                    result["groupRankings"][group_id] = {
                        "groupLabel": group_label,
                        "memberCount": len(pids),
                        "rankings": group_rankings_list
                    }

        except Exception as e:
            print(f"Error getting Polis group data for rankings: {e}", flush=True)
            # Continue without group rankings

    return result


def respond_to_pairwise(survey_id, body, token_info=None):  # noqa: E501
    """Submit a pairwise comparison response

     # noqa: E501

    :param survey_id: Survey ID
    :type survey_id: str
    :param body: Request body with winnerItemId and loserItemId
    :type body: dict | bytes

    :rtype: Union[dict, Tuple[dict, int], Tuple[dict, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    # Parse request body
    if connexion.request.is_json:
        body = connexion.request.get_json()

    winner_item_id = body.get('winnerItemId')
    loser_item_id = body.get('loserItemId')

    if not winner_item_id or not loser_item_id:
        return ErrorModel(400, "winnerItemId and loserItemId are required"), 400

    if winner_item_id == loser_item_id:
        return ErrorModel(400, "Winner and loser cannot be the same item"), 400

    # Validate survey exists, is pairwise type, and is active
    survey = db.execute_query("""
        SELECT id, survey_type, status, start_time, end_time
        FROM survey WHERE id = %s
    """, (survey_id,), fetchone=True)

    if survey is None:
        return ErrorModel(404, "Survey not found"), 404

    if survey['survey_type'] != 'pairwise':
        return ErrorModel(400, "Survey is not a pairwise survey"), 400

    if survey['status'] != 'active':
        return ErrorModel(400, "Survey is not active"), 400

    # Check time window
    now_check = db.execute_query("""
        SELECT CURRENT_TIMESTAMP AS now
    """, fetchone=True)

    if survey['start_time'] and survey['start_time'] > now_check['now']:
        return ErrorModel(400, "Survey has not started yet"), 400

    if survey['end_time'] and survey['end_time'] < now_check['now']:
        return ErrorModel(400, "Survey has ended"), 400

    # Validate both items belong to this survey
    winner_check = db.execute_query("""
        SELECT id FROM pairwise_item WHERE id = %s AND survey_id = %s
    """, (winner_item_id, survey_id), fetchone=True)

    if winner_check is None:
        return ErrorModel(400, "Winner item not found in this survey"), 400

    loser_check = db.execute_query("""
        SELECT id FROM pairwise_item WHERE id = %s AND survey_id = %s
    """, (loser_item_id, survey_id), fetchone=True)

    if loser_check is None:
        return ErrorModel(400, "Loser item not found in this survey"), 400

    # Check if user has already compared this pair (in either direction)
    existing = db.execute_query("""
        SELECT id FROM pairwise_response
        WHERE survey_id = %s AND user_id = %s
          AND ((winner_item_id = %s AND loser_item_id = %s)
               OR (winner_item_id = %s AND loser_item_id = %s))
    """, (survey_id, user.id, winner_item_id, loser_item_id, loser_item_id, winner_item_id),
        fetchone=True)

    if existing:
        # Already compared, just return success (idempotent)
        return {"success": True}

    # Insert the response
    response_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO pairwise_response (id, survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (%s, %s, %s, %s, %s)
    """, (response_id, survey_id, user.id, winner_item_id, loser_item_id))

    return {"success": True}


def get_standard_survey_results(survey_id, filter_location_id=None, group_id=None, polis_conversation_id=None, token_info=None):  # noqa: E501
    """Get results from a standard survey

    Returns response counts per option for each question. If filter_location_id
    is provided, only includes responses from users in that location. If group_id
    is provided, filters to users in that Polis group.

    :param survey_id: Survey ID
    :type survey_id: str
    :param filter_location_id: Only include responses from users in this location
    :type filter_location_id: str
    :param group_id: Filter to users in this Polis group (0, 1, 2, etc.)
    :type group_id: str
    :param polis_conversation_id: Polis conversation ID for group membership lookup
    :type polis_conversation_id: str

    :rtype: Union[dict, Tuple[dict, int]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    # Get survey info
    survey = db.execute_query("""
        SELECT s.id, s.survey_title, s.survey_type,
               loc.code as location_code, loc.name as location_name
        FROM survey s
        LEFT JOIN location loc ON s.location_id = loc.id
        WHERE s.id = %s
    """, (survey_id,), fetchone=True)

    if not survey:
        return ErrorModel(404, "Survey not found"), 404

    if survey["survey_type"] != "standard":
        return ErrorModel(400, "Survey is not a standard survey"), 400

    # Build user filter based on location and/or group
    user_filter_clause = ""
    user_filter_params = []

    # Get group member user IDs if group_id is provided
    group_user_ids = None
    if group_id and str(group_id).lower() != "majority":
        # polis_conversation_id must be provided for standard surveys
        if polis_conversation_id:
            group_user_ids = _get_group_member_user_ids(polis_conversation_id, group_id)

    if filter_location_id and group_user_ids:
        # Filter by both location AND group membership
        user_filter_clause = """
            AND sqr.user_id IN (
                SELECT user_id FROM user_location WHERE location_id = %s
            )
            AND sqr.user_id = ANY(%s::uuid[])
        """
        user_filter_params = [filter_location_id, group_user_ids]
    elif filter_location_id:
        # Filter by location only
        user_filter_clause = """
            AND sqr.user_id IN (
                SELECT user_id FROM user_location WHERE location_id = %s
            )
        """
        user_filter_params = [filter_location_id]
    elif group_user_ids:
        # Filter by group only
        user_filter_clause = """
            AND sqr.user_id = ANY(%s::uuid[])
        """
        user_filter_params = [group_user_ids]

    # Get questions with their options and response counts
    questions = db.execute_query("""
        SELECT id, survey_question FROM survey_question
        WHERE survey_id = %s
        ORDER BY id
    """, (survey_id,))

    questions_data = []
    total_respondents = 0

    for q in (questions or []):
        # Get options with response counts
        options = db.execute_query(f"""
            SELECT sqo.id, sqo.survey_question_option as option_text,
                   COUNT(sqr.id) as response_count
            FROM survey_question_option sqo
            LEFT JOIN survey_question_response sqr ON sqr.survey_question_option_id = sqo.id
                {user_filter_clause}
            WHERE sqo.survey_question_id = %s
            GROUP BY sqo.id, sqo.survey_question_option
            ORDER BY response_count DESC
        """, tuple(user_filter_params + [q["id"]]))

        options_data = []
        question_total = 0
        for o in (options or []):
            options_data.append({
                "optionId": str(o["id"]),
                "optionText": o["option_text"],
                "responseCount": o["response_count"]
            })
            question_total += o["response_count"]

        questions_data.append({
            "questionId": str(q["id"]),
            "question": q["survey_question"],
            "totalResponses": question_total,
            "options": options_data
        })

        if question_total > total_respondents:
            total_respondents = question_total

    return {
        "surveyId": str(survey["id"]),
        "surveyTitle": survey["survey_title"],
        "surveyLocationCode": survey["location_code"],
        "surveyLocationName": survey["location_name"],
        "totalRespondents": total_respondents,
        "questions": questions_data
    }


# Human-readable labels for demographic values
DEMOGRAPHIC_LABELS = {
    "lean": {
        "very_liberal": "Very Liberal",
        "liberal": "Liberal",
        "moderate": "Moderate",
        "conservative": "Conservative",
        "very_conservative": "Very Conservative",
    },
    "education": {
        "less_than_high_school": "Less than High School",
        "high_school": "High School",
        "some_college": "Some College",
        "associates": "Associate's Degree",
        "bachelors": "Bachelor's Degree",
        "masters": "Master's Degree",
        "doctorate": "Doctorate",
        "professional": "Professional Degree",
    },
    "geo_locale": {
        "urban": "Urban",
        "suburban": "Suburban",
        "rural": "Rural",
    },
    "sex": {
        "male": "Male",
        "female": "Female",
        "other": "Other",
    },
    "age_range": {
        "18-24": "18-24",
        "25-34": "25-34",
        "35-44": "35-44",
        "45-54": "45-54",
        "55-64": "55-64",
        "65+": "65+",
    },
    "race": {
        "white": "White",
        "black": "Black",
        "hispanic": "Hispanic/Latino",
        "asian": "Asian",
        "native_american": "Native American",
        "pacific_islander": "Pacific Islander",
        "multiracial": "Multiracial",
        "other": "Other",
    },
    "income_range": {
        "under_25k": "Under $25K",
        "25k-50k": "$25K-$50K",
        "50k-75k": "$50K-$75K",
        "75k-100k": "$75K-$100K",
        "100k-150k": "$100K-$150K",
        "150k-200k": "$150K-$200K",
        "over_200k": "Over $200K",
    },
}


def get_question_crosstabs(survey_id, question_id, filter_location_id=None, group_id=None, polis_conversation_id=None, token_info=None):  # noqa: E501
    """Get demographic crosstabs for a survey question

    Returns response counts broken down by demographic categories.

    :param survey_id: Survey ID
    :type survey_id: str
    :param question_id: Question ID
    :type question_id: str
    :param filter_location_id: Only include responses from users in this location
    :type filter_location_id: str
    :param group_id: Filter to users in this Polis group
    :type group_id: str
    :param polis_conversation_id: Polis conversation ID for group membership lookup
    :type polis_conversation_id: str

    :rtype: Union[dict, Tuple[dict, int]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    # Validate survey exists
    survey = db.execute_query("""
        SELECT id, survey_type FROM survey WHERE id = %s
    """, (survey_id,), fetchone=True)

    if not survey:
        return ErrorModel(404, "Survey not found"), 404

    if survey["survey_type"] != "standard":
        return ErrorModel(400, "Crosstabs only available for standard surveys"), 400

    # Validate question belongs to survey
    question = db.execute_query("""
        SELECT id, survey_question FROM survey_question
        WHERE id = %s AND survey_id = %s
    """, (question_id, survey_id), fetchone=True)

    if not question:
        return ErrorModel(404, "Question not found"), 404

    # Get options for this question
    options = db.execute_query("""
        SELECT id, survey_question_option FROM survey_question_option
        WHERE survey_question_id = %s
        ORDER BY id
    """, (question_id,))

    option_list = [{"optionId": str(o["id"]), "optionText": o["survey_question_option"]} for o in (options or [])]
    option_ids = [str(o["id"]) for o in (options or [])]

    # Build user filter based on location and/or group
    user_filter_conditions = []
    user_filter_params = []

    # Get group member user IDs if group_id is provided
    group_user_ids = None
    if group_id and str(group_id).lower() != "majority":
        if polis_conversation_id:
            group_user_ids = _get_group_member_user_ids(polis_conversation_id, group_id)

    if filter_location_id:
        user_filter_conditions.append("sqr.user_id IN (SELECT user_id FROM user_location WHERE location_id = %s)")
        user_filter_params.append(filter_location_id)

    if group_user_ids:
        user_filter_conditions.append("sqr.user_id = ANY(%s::uuid[])")
        user_filter_params.append(group_user_ids)

    user_filter_clause = ""
    if user_filter_conditions:
        user_filter_clause = " AND " + " AND ".join(user_filter_conditions)

    # Get total responses for this question (with filters)
    total_query = f"""
        SELECT COUNT(*) as total
        FROM survey_question_response sqr
        JOIN survey_question_option sqo ON sqr.survey_question_option_id = sqo.id
        WHERE sqo.survey_question_id = %s
        {user_filter_clause}
    """
    total_result = db.execute_query(total_query, tuple([question_id] + user_filter_params), fetchone=True)
    total_responses = total_result["total"] if total_result else 0

    # Get option counts
    for opt in option_list:
        count_query = f"""
            SELECT COUNT(*) as count
            FROM survey_question_response sqr
            WHERE sqr.survey_question_option_id = %s
            {user_filter_clause}
        """
        count_result = db.execute_query(count_query, tuple([opt["optionId"]] + user_filter_params), fetchone=True)
        opt["totalCount"] = count_result["count"] if count_result else 0

    # Build demographic crosstabs
    demographics = {}

    # Helper function to get crosstab for a demographic field
    def get_crosstab(demo_field, demo_table_field, labels_dict):
        crosstab_data = []

        # Get distinct values for this demographic (with responses)
        values_query = f"""
            SELECT DISTINCT ud.{demo_table_field} as value
            FROM survey_question_response sqr
            JOIN user_demographics ud ON sqr.user_id = ud.user_id
            JOIN survey_question_option sqo ON sqr.survey_question_option_id = sqo.id
            WHERE sqo.survey_question_id = %s
              AND ud.{demo_table_field} IS NOT NULL
            {user_filter_clause}
            ORDER BY ud.{demo_table_field}
        """
        values = db.execute_query(values_query, tuple([question_id] + user_filter_params))

        for v in (values or []):
            value = v["value"]
            if not value:
                continue

            # Get total in this demographic category
            total_in_cat_query = f"""
                SELECT COUNT(DISTINCT sqr.user_id) as total
                FROM survey_question_response sqr
                JOIN user_demographics ud ON sqr.user_id = ud.user_id
                JOIN survey_question_option sqo ON sqr.survey_question_option_id = sqo.id
                WHERE sqo.survey_question_id = %s
                  AND ud.{demo_table_field} = %s
                {user_filter_clause}
            """
            total_in_cat = db.execute_query(total_in_cat_query, tuple([question_id, value] + user_filter_params), fetchone=True)
            total_in_category = total_in_cat["total"] if total_in_cat else 0

            # Get breakdown by option
            option_breakdown = []
            for opt in option_list:
                count_query = f"""
                    SELECT COUNT(*) as count
                    FROM survey_question_response sqr
                    JOIN user_demographics ud ON sqr.user_id = ud.user_id
                    WHERE sqr.survey_question_option_id = %s
                      AND ud.{demo_table_field} = %s
                    {user_filter_clause}
                """
                count_result = db.execute_query(count_query, tuple([opt["optionId"], value] + user_filter_params), fetchone=True)
                count = count_result["count"] if count_result else 0
                percentage = round((count / total_in_category * 100), 1) if total_in_category > 0 else 0

                option_breakdown.append({
                    "optionId": opt["optionId"],
                    "count": count,
                    "percentage": percentage
                })

            crosstab_data.append({
                "category": value,
                "categoryLabel": labels_dict.get(value, value.replace("_", " ").title()),
                "totalInCategory": total_in_category,
                "optionBreakdown": option_breakdown
            })

        return crosstab_data

    # Get crosstabs for each demographic
    demographics["politicalLean"] = get_crosstab("lean", "lean", DEMOGRAPHIC_LABELS["lean"])
    demographics["education"] = get_crosstab("education", "education", DEMOGRAPHIC_LABELS["education"])
    demographics["geoLocale"] = get_crosstab("geo_locale", "geo_locale", DEMOGRAPHIC_LABELS["geo_locale"])
    demographics["sex"] = get_crosstab("sex", "sex", DEMOGRAPHIC_LABELS["sex"])
    demographics["ageRange"] = get_crosstab("age_range", "age_range", DEMOGRAPHIC_LABELS["age_range"])
    demographics["race"] = get_crosstab("race", "race", DEMOGRAPHIC_LABELS["race"])
    demographics["incomeRange"] = get_crosstab("income_range", "income_range", DEMOGRAPHIC_LABELS["income_range"])

    # Get affiliation crosstab (need to join with affiliation table for names)
    affiliation_data = []
    aff_values_query = f"""
        SELECT DISTINCT a.id, a.name
        FROM survey_question_response sqr
        JOIN user_demographics ud ON sqr.user_id = ud.user_id
        JOIN affiliation a ON ud.affiliation_id = a.id
        JOIN survey_question_option sqo ON sqr.survey_question_option_id = sqo.id
        WHERE sqo.survey_question_id = %s
        {user_filter_clause}
        ORDER BY a.name
    """
    aff_values = db.execute_query(aff_values_query, tuple([question_id] + user_filter_params))

    for aff in (aff_values or []):
        aff_id = str(aff["id"])
        aff_name = aff["name"]

        # Get total in this affiliation
        total_aff_query = f"""
            SELECT COUNT(DISTINCT sqr.user_id) as total
            FROM survey_question_response sqr
            JOIN user_demographics ud ON sqr.user_id = ud.user_id
            JOIN survey_question_option sqo ON sqr.survey_question_option_id = sqo.id
            WHERE sqo.survey_question_id = %s
              AND ud.affiliation_id = %s
            {user_filter_clause}
        """
        total_aff = db.execute_query(total_aff_query, tuple([question_id, aff_id] + user_filter_params), fetchone=True)
        total_in_aff = total_aff["total"] if total_aff else 0

        # Get breakdown by option
        option_breakdown = []
        for opt in option_list:
            count_query = f"""
                SELECT COUNT(*) as count
                FROM survey_question_response sqr
                JOIN user_demographics ud ON sqr.user_id = ud.user_id
                WHERE sqr.survey_question_option_id = %s
                  AND ud.affiliation_id = %s
                {user_filter_clause}
            """
            count_result = db.execute_query(count_query, tuple([opt["optionId"], aff_id] + user_filter_params), fetchone=True)
            count = count_result["count"] if count_result else 0
            percentage = round((count / total_in_aff * 100), 1) if total_in_aff > 0 else 0

            option_breakdown.append({
                "optionId": opt["optionId"],
                "count": count,
                "percentage": percentage
            })

        affiliation_data.append({
            "category": aff_id,
            "categoryLabel": aff_name,
            "totalInCategory": total_in_aff,
            "optionBreakdown": option_breakdown
        })

    demographics["affiliation"] = affiliation_data

    return {
        "questionId": str(question["id"]),
        "questionText": question["survey_question"],
        "totalResponses": total_responses,
        "options": option_list,
        "demographics": demographics
    }
