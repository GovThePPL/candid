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
from camel_converter import dict_to_camel


def _get_user_card(user_id):
    """Helper to fetch and return a User model for API responses."""
    user = db.execute_query("""
        SELECT id, username, display_name, status
        FROM users WHERE id = %s
    """, (user_id,), fetchone=True)
    if user is not None:
        return User.from_dict(dict_to_camel(user))
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
