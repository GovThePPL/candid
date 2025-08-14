import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.respond_to_survey_question_request import RespondToSurveyQuestionRequest  # noqa: E501
from candid.models.survey import Survey  # noqa: E501
from candid.models.survey_question_response import SurveyQuestionResponse  # noqa: E501
from candid import util


def get_active_surveys():  # noqa: E501
    """Get a list of currently active surveys

     # noqa: E501


    :rtype: Union[List[Survey], Tuple[List[Survey], int], Tuple[List[Survey], int, Dict[str, str]]
    """
    return 'do some magic!'


def get_survey_by_id(survey_id):  # noqa: E501
    """Get a specific survey

     # noqa: E501

    :param survey_id: 
    :type survey_id: str
    :type survey_id: str

    :rtype: Union[Survey, Tuple[Survey, int], Tuple[Survey, int, Dict[str, str]]
    """
    return 'do some magic!'


def respond_to_survey_question(survey_id, question_id, body):  # noqa: E501
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
    respond_to_survey_question_request = body
    if connexion.request.is_json:
        respond_to_survey_question_request = RespondToSurveyQuestionRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'
