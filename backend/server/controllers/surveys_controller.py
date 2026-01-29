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


def get_active_surveys(token_info=None):  # noqa: E501
    """Get a list of currently active surveys

     # noqa: E501


    :rtype: Union[List[Survey], Tuple[List[Survey], int], Tuple[List[Survey], int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    # Get surveys that are active and within their time window
    survey_rows = db.execute_query("""
        SELECT id FROM survey
        WHERE status = 'active'
          AND start_time <= CURRENT_TIMESTAMP
          AND end_time >= CURRENT_TIMESTAMP
        ORDER BY start_time DESC
    """)

    if survey_rows is None:
        survey_rows = []

    surveys = []
    for row in survey_rows:
        survey = _build_survey_with_nested_data(row['id'])
        if survey:
            surveys.append(survey)

    return surveys


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
