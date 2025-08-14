import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from candid.models.create_survey_request import CreateSurveyRequest  # noqa: E501
from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.survey import Survey  # noqa: E501
from candid import util


def create_survey(body):  # noqa: E501
    """Create a new survey

     # noqa: E501

    :param create_survey_request: 
    :type create_survey_request: dict | bytes

    :rtype: Union[Survey, Tuple[Survey, int], Tuple[Survey, int, Dict[str, str]]
    """
    create_survey_request = body
    if connexion.request.is_json:
        create_survey_request = CreateSurveyRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'


def delete_survey(survey_id):  # noqa: E501
    """Delete a survey

     # noqa: E501

    :param survey_id: 
    :type survey_id: str
    :type survey_id: str

    :rtype: Union[None, Tuple[None, int], Tuple[None, int, Dict[str, str]]
    """
    return 'do some magic!'


def get_survey_by_id_admin(survey_id):  # noqa: E501
    """Get a specific survey (admin access)

     # noqa: E501

    :param survey_id: 
    :type survey_id: str
    :type survey_id: str

    :rtype: Union[Survey, Tuple[Survey, int], Tuple[Survey, int, Dict[str, str]]
    """
    return 'do some magic!'


def get_surveys(title=None, status=None, created_after=None, created_before=None):  # noqa: E501
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
    created_after = util.deserialize_datetime(created_after)
    created_before = util.deserialize_datetime(created_before)
    return 'do some magic!'


def update_survey(survey_id, body):  # noqa: E501
    """Update a survey

     # noqa: E501

    :param survey_id: 
    :type survey_id: str
    :type survey_id: str
    :param survey: 
    :type survey: dict | bytes

    :rtype: Union[Survey, Tuple[Survey, int], Tuple[Survey, int, Dict[str, str]]
    """
    survey = body
    if connexion.request.is_json:
        survey = Survey.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'
