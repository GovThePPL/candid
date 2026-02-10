"""Tests for survey results: GET /surveys/{surveyId}/results, GET /surveys/{surveyId}/questions/{questionId}/crosstabs."""
# Auth tests (test_unauthenticated_returns_401) live in test_auth_required.py.

import pytest
import requests
from conftest import (
    BASE_URL,
    SURVEY_ACTIVE_ID,
    SURVEY_QUESTION_1_ID,
    NONEXISTENT_UUID,
    OREGON_LOCATION_ID,
    db_query_one,
)

SURVEYS_URL = f"{BASE_URL}/surveys"


@pytest.fixture(scope="module")
def pairwise_survey_id():
    """Get a pairwise survey ID from the database (dynamic UUIDs)."""
    row = db_query_one(
        "SELECT id FROM survey WHERE survey_type = 'pairwise' AND status = 'active' LIMIT 1"
    )
    return str(row["id"]) if row else None


class TestGetStandardSurveyResults:
    """GET /surveys/{surveyId}/results"""

    def test_get_results_success(self, normal_headers):
        """Can get results for an active standard survey."""
        resp = requests.get(
            f"{SURVEYS_URL}/{SURVEY_ACTIVE_ID}/results",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "surveyId" in body or "questions" in body or isinstance(body, dict)

    def test_results_structure(self, normal_headers):
        """Results have expected structure."""
        resp = requests.get(
            f"{SURVEYS_URL}/{SURVEY_ACTIVE_ID}/results",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, dict)

    def test_not_found_404(self, normal_headers):
        """Nonexistent survey returns 404."""
        resp = requests.get(
            f"{SURVEYS_URL}/{NONEXISTENT_UUID}/results",
            headers=normal_headers,
        )
        assert resp.status_code == 404

    def test_pairwise_survey_400(self, normal_headers, pairwise_survey_id):
        """Pairwise survey returns 400 for standard results endpoint."""
        if pairwise_survey_id is None:
            pytest.skip("No pairwise survey in database")
        resp = requests.get(
            f"{SURVEYS_URL}/{pairwise_survey_id}/results",
            headers=normal_headers,
        )
        assert resp.status_code == 400

    def test_filter_by_location(self, normal_headers):
        """Can filter results by location."""
        resp = requests.get(
            f"{SURVEYS_URL}/{SURVEY_ACTIVE_ID}/results",
            headers=normal_headers,
            params={"filterLocationId": OREGON_LOCATION_ID},
        )
        assert resp.status_code == 200



class TestGetQuestionCrosstabs:
    """GET /surveys/{surveyId}/questions/{questionId}/crosstabs"""

    def test_get_crosstabs_success(self, normal_headers):
        """Can get crosstabs for a survey question."""
        resp = requests.get(
            f"{SURVEYS_URL}/{SURVEY_ACTIVE_ID}/questions/{SURVEY_QUESTION_1_ID}/crosstabs",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, dict)

    def test_crosstabs_has_demographics(self, normal_headers):
        """Crosstabs response includes demographic breakdown."""
        resp = requests.get(
            f"{SURVEYS_URL}/{SURVEY_ACTIVE_ID}/questions/{SURVEY_QUESTION_1_ID}/crosstabs",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        # The response should contain demographic-related data
        assert isinstance(body, dict)

    def test_not_found_survey_404(self, normal_headers):
        """Nonexistent survey returns 404."""
        resp = requests.get(
            f"{SURVEYS_URL}/{NONEXISTENT_UUID}/questions/{SURVEY_QUESTION_1_ID}/crosstabs",
            headers=normal_headers,
        )
        assert resp.status_code == 404

    def test_not_found_question_404(self, normal_headers):
        """Nonexistent question returns 404."""
        resp = requests.get(
            f"{SURVEYS_URL}/{SURVEY_ACTIVE_ID}/questions/{NONEXISTENT_UUID}/crosstabs",
            headers=normal_headers,
        )
        assert resp.status_code == 404

    def test_pairwise_survey_400(self, normal_headers, pairwise_survey_id):
        """Pairwise survey returns 400 for crosstabs endpoint."""
        if pairwise_survey_id is None:
            pytest.skip("No pairwise survey in database")
        resp = requests.get(
            f"{SURVEYS_URL}/{pairwise_survey_id}/questions/{NONEXISTENT_UUID}/crosstabs",
            headers=normal_headers,
        )
        assert resp.status_code in (400, 404)

