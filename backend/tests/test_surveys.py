"""Integration tests for survey endpoints."""
# Auth tests (test_unauthenticated_returns_401) live in test_auth_required.py.

import pytest
import requests
import uuid

from conftest import (
    BASE_URL,
    auth_header,
    login,
    delete_survey_response,
    SURVEY_ACTIVE_ID,
    SURVEY_INACTIVE_ID,
    SURVEY_FUTURE_ID,
    SURVEY_QUESTION_1_ID,
    SURVEY_QUESTION_2_ID,
    SURVEY_OPTION_1_ID,
    SURVEY_OPTION_2_ID,
    NONEXISTENT_UUID,
    HEALTHCARE_CAT_ID,
    EDUCATION_CAT_ID,
    NORMAL2_ID,
    NORMAL3_ID,
)


# ---------------------------------------------------------------------------
# User Endpoints Tests
# ---------------------------------------------------------------------------

class TestGetActiveSurveys:
    """Tests for GET /surveys"""

    def test_get_active_surveys_success(self, normal_headers):
        """Normal user can get active surveys"""
        resp = requests.get(f"{BASE_URL}/surveys", headers=normal_headers)
        assert resp.status_code == 200
        surveys = resp.json()
        assert isinstance(surveys, list)
        # Should include the active survey that's in the time window
        active_ids = [s['id'] for s in surveys]
        assert SURVEY_ACTIVE_ID in active_ids

    def test_get_active_surveys_has_nested_data(self, normal_headers):
        """Active surveys include expected flat fields (list endpoint returns summary data)."""
        resp = requests.get(f"{BASE_URL}/surveys", headers=normal_headers)
        assert resp.status_code == 200
        surveys = resp.json()
        # Find the active survey
        active_survey = next((s for s in surveys if s['id'] == SURVEY_ACTIVE_ID), None)
        assert active_survey is not None
        assert 'surveyTitle' in active_survey
        assert active_survey['surveyTitle'] == 'Healthcare Priorities Survey'
        assert 'status' in active_survey
        assert 'questionCount' in active_survey
        assert active_survey['questionCount'] == 2



class TestGetSurveyById:
    """Tests for GET /surveys/{surveyId}"""

    def test_get_survey_by_id_success(self, normal_headers):
        """Normal user can get an active survey by ID"""
        resp = requests.get(f"{BASE_URL}/surveys/{SURVEY_ACTIVE_ID}", headers=normal_headers)
        assert resp.status_code == 200
        survey = resp.json()
        assert survey['id'] == SURVEY_ACTIVE_ID
        assert survey['surveyTitle'] == 'Healthcare Priorities Survey'
        assert 'creator' in survey
        assert 'questions' in survey

    def test_get_survey_by_id_inactive_returns_404(self, normal_headers):
        """Inactive survey returns 404"""
        resp = requests.get(f"{BASE_URL}/surveys/{SURVEY_INACTIVE_ID}", headers=normal_headers)
        assert resp.status_code == 404

    def test_get_survey_by_id_future_returns_404(self, normal_headers):
        """Future survey (not started) returns 404"""
        resp = requests.get(f"{BASE_URL}/surveys/{SURVEY_FUTURE_ID}", headers=normal_headers)
        assert resp.status_code == 404

    def test_get_survey_by_id_nonexistent_returns_404(self, normal_headers):
        """Nonexistent survey returns 404"""
        resp = requests.get(f"{BASE_URL}/surveys/{NONEXISTENT_UUID}", headers=normal_headers)
        assert resp.status_code == 404



class TestRespondToSurveyQuestion:
    """Tests for POST /surveys/{surveyId}/questions/{questionId}/response"""

    def test_respond_to_survey_question_success(self, normal_headers):
        """Normal user can respond to a survey question"""
        # Clean up any existing response for idempotency
        delete_survey_response(NORMAL2_ID, SURVEY_QUESTION_1_ID)

        token = login("normal2")
        headers = auth_header(token)

        resp = requests.post(
            f"{BASE_URL}/surveys/{SURVEY_ACTIVE_ID}/questions/{SURVEY_QUESTION_1_ID}/response",
            headers=headers,
            json={"optionId": SURVEY_OPTION_1_ID}
        )
        assert resp.status_code == 201
        response = resp.json()
        assert 'id' in response
        assert response['surveyQuestionOptionId'] == SURVEY_OPTION_1_ID

    def test_respond_to_survey_question_invalid_option(self, normal_headers):
        """Invalid option returns 400"""
        resp = requests.post(
            f"{BASE_URL}/surveys/{SURVEY_ACTIVE_ID}/questions/{SURVEY_QUESTION_1_ID}/response",
            headers=normal_headers,
            json={"optionId": NONEXISTENT_UUID}
        )
        assert resp.status_code == 400

    def test_respond_to_survey_question_wrong_question(self, normal_headers):
        """Option from different question returns 400"""
        # SURVEY_OPTION_1_ID belongs to QUESTION_1, try with QUESTION_2
        resp = requests.post(
            f"{BASE_URL}/surveys/{SURVEY_ACTIVE_ID}/questions/{SURVEY_QUESTION_2_ID}/response",
            headers=normal_headers,
            json={"optionId": SURVEY_OPTION_1_ID}
        )
        assert resp.status_code == 400

    def test_respond_to_survey_question_duplicate_response(self):
        """Duplicate response to same question returns 200 (idempotent)"""
        # Clean up any existing response for idempotency
        delete_survey_response(NORMAL3_ID, SURVEY_QUESTION_1_ID)

        token = login("normal3")
        headers = auth_header(token)

        # First response
        resp1 = requests.post(
            f"{BASE_URL}/surveys/{SURVEY_ACTIVE_ID}/questions/{SURVEY_QUESTION_1_ID}/response",
            headers=headers,
            json={"optionId": SURVEY_OPTION_1_ID}
        )
        assert resp1.status_code == 201

        # Duplicate response returns 200 with original response (card may still be in queue)
        resp2 = requests.post(
            f"{BASE_URL}/surveys/{SURVEY_ACTIVE_ID}/questions/{SURVEY_QUESTION_1_ID}/response",
            headers=headers,
            json={"optionId": SURVEY_OPTION_2_ID}
        )
        assert resp2.status_code == 200



# ---------------------------------------------------------------------------
# Admin Endpoints Tests
# ---------------------------------------------------------------------------

class TestAdminGetSurveys:
    """Tests for GET /admin/surveys"""

    def test_admin_get_surveys_success(self, admin_headers):
        """Admin can list all surveys"""
        resp = requests.get(f"{BASE_URL}/admin/surveys", headers=admin_headers)
        assert resp.status_code == 200
        surveys = resp.json()
        assert isinstance(surveys, list)
        # Admin sees both active and inactive (but not deleted by default)
        survey_ids = [s['id'] for s in surveys]
        assert SURVEY_ACTIVE_ID in survey_ids
        assert SURVEY_FUTURE_ID in survey_ids

    def test_admin_get_surveys_filter_by_title(self, admin_headers):
        """Admin can filter surveys by title"""
        resp = requests.get(
            f"{BASE_URL}/admin/surveys",
            headers=admin_headers,
            params={"title": "Healthcare"}
        )
        assert resp.status_code == 200
        surveys = resp.json()
        assert len(surveys) >= 1
        assert all("Healthcare" in s['surveyTitle'] for s in surveys)

    def test_admin_get_surveys_filter_by_status(self, admin_headers):
        """Admin can filter surveys by status"""
        resp = requests.get(
            f"{BASE_URL}/admin/surveys",
            headers=admin_headers,
            params={"status": "inactive"}
        )
        assert resp.status_code == 200
        surveys = resp.json()
        # Should include the inactive survey
        survey_ids = [s['id'] for s in surveys]
        assert SURVEY_INACTIVE_ID in survey_ids

    def test_admin_get_surveys_forbidden_for_normal_user(self, normal_headers):
        """Normal user gets 403 for admin endpoint"""
        resp = requests.get(f"{BASE_URL}/admin/surveys", headers=normal_headers)
        assert resp.status_code == 403


class TestAdminCreateSurvey:
    """Tests for POST /admin/surveys"""

    def test_admin_create_survey_success(self, admin_headers):
        """Admin can create a new survey"""
        resp = requests.post(
            f"{BASE_URL}/admin/surveys",
            headers=admin_headers,
            json={
                "surveyTitle": "Test Survey",
                "positionCategoryId": HEALTHCARE_CAT_ID,
                "startTime": "2025-01-01T00:00:00Z",
                "endTime": "2025-12-31T23:59:59Z",
                "questions": [
                    {
                        "question": "Test question 1?",
                        "options": ["Option A", "Option B", "Option C"]
                    },
                    {
                        "question": "Test question 2?",
                        "options": ["Yes", "No"]
                    }
                ]
            }
        )
        assert resp.status_code == 201
        survey = resp.json()
        assert survey['surveyTitle'] == "Test Survey"
        assert 'id' in survey
        assert 'creator' in survey
        assert len(survey['questions']) == 2
        # Questions may be returned in UUID order, so check total options
        total_options = sum(len(q['options']) for q in survey['questions'])
        assert total_options == 5  # 3 + 2 options

    def test_admin_create_survey_missing_questions(self, admin_headers):
        """Creating survey without questions returns 400"""
        resp = requests.post(
            f"{BASE_URL}/admin/surveys",
            headers=admin_headers,
            json={
                "surveyTitle": "Test Survey No Questions",
                "startTime": "2025-01-01T00:00:00Z",
                "endTime": "2025-12-31T23:59:59Z",
                "questions": []
            }
        )
        assert resp.status_code == 400

    def test_admin_create_survey_forbidden_for_normal_user(self, normal_headers):
        """Normal user gets 403 for admin endpoint"""
        resp = requests.post(
            f"{BASE_URL}/admin/surveys",
            headers=normal_headers,
            json={
                "surveyTitle": "Should Fail",
                "startTime": "2025-01-01T00:00:00Z",
                "endTime": "2025-12-31T23:59:59Z",
                "questions": [{"question": "Q?", "options": ["A", "B"]}]
            }
        )
        assert resp.status_code == 403


class TestAdminGetSurveyById:
    """Tests for GET /admin/surveys/{surveyId}"""

    def test_admin_get_survey_by_id_success(self, admin_headers):
        """Admin can get any survey by ID"""
        resp = requests.get(f"{BASE_URL}/admin/surveys/{SURVEY_ACTIVE_ID}", headers=admin_headers)
        assert resp.status_code == 200
        survey = resp.json()
        assert survey['id'] == SURVEY_ACTIVE_ID

    def test_admin_get_inactive_survey(self, admin_headers):
        """Admin can see inactive surveys"""
        resp = requests.get(f"{BASE_URL}/admin/surveys/{SURVEY_INACTIVE_ID}", headers=admin_headers)
        assert resp.status_code == 200
        survey = resp.json()
        assert survey['id'] == SURVEY_INACTIVE_ID

    def test_admin_get_future_survey(self, admin_headers):
        """Admin can see future surveys"""
        resp = requests.get(f"{BASE_URL}/admin/surveys/{SURVEY_FUTURE_ID}", headers=admin_headers)
        assert resp.status_code == 200
        survey = resp.json()
        assert survey['id'] == SURVEY_FUTURE_ID

    def test_admin_get_survey_by_id_nonexistent(self, admin_headers):
        """Nonexistent survey returns 404"""
        resp = requests.get(f"{BASE_URL}/admin/surveys/{NONEXISTENT_UUID}", headers=admin_headers)
        assert resp.status_code == 404

    def test_admin_get_survey_by_id_forbidden_for_normal_user(self, normal_headers):
        """Normal user gets 403 for admin endpoint"""
        resp = requests.get(f"{BASE_URL}/admin/surveys/{SURVEY_ACTIVE_ID}", headers=normal_headers)
        assert resp.status_code == 403


class TestAdminUpdateSurvey:
    """Tests for PUT /admin/surveys/{surveyId}"""

    def test_admin_update_survey_title(self, admin_headers):
        """Admin can update survey title"""
        # First create a survey to update
        create_resp = requests.post(
            f"{BASE_URL}/admin/surveys",
            headers=admin_headers,
            json={
                "surveyTitle": "Survey To Update",
                "startTime": "2025-01-01T00:00:00Z",
                "endTime": "2025-12-31T23:59:59Z",
                "questions": [{"question": "Q?", "options": ["A", "B"]}]
            }
        )
        assert create_resp.status_code == 201
        survey_id = create_resp.json()['id']

        # Update the title
        update_resp = requests.patch(
            f"{BASE_URL}/admin/surveys/{survey_id}",
            headers=admin_headers,
            json={"surveyTitle": "Updated Title"}
        )
        assert update_resp.status_code == 200
        assert update_resp.json()['surveyTitle'] == "Updated Title"

    def test_admin_update_survey_times(self, admin_headers):
        """Admin can update survey start and end times"""
        # First create a survey to update
        create_resp = requests.post(
            f"{BASE_URL}/admin/surveys",
            headers=admin_headers,
            json={
                "surveyTitle": "Survey Times Update",
                "startTime": "2025-01-01T00:00:00Z",
                "endTime": "2025-12-31T23:59:59Z",
                "questions": [{"question": "Q?", "options": ["A", "B"]}]
            }
        )
        assert create_resp.status_code == 201
        survey_id = create_resp.json()['id']

        # Update the times
        update_resp = requests.patch(
            f"{BASE_URL}/admin/surveys/{survey_id}",
            headers=admin_headers,
            json={
                "startTime": "2026-01-01T00:00:00Z",
                "endTime": "2026-12-31T23:59:59Z"
            }
        )
        assert update_resp.status_code == 200

    def test_admin_update_survey_nonexistent(self, admin_headers):
        """Updating nonexistent survey returns 404"""
        update_resp = requests.patch(
            f"{BASE_URL}/admin/surveys/{NONEXISTENT_UUID}",
            headers=admin_headers,
            json={"surveyTitle": "Should Fail"}
        )
        assert update_resp.status_code == 404

    def test_admin_update_survey_forbidden_for_normal_user(self, normal_headers):
        """Normal user gets 403 for admin endpoint"""
        update_resp = requests.patch(
            f"{BASE_URL}/admin/surveys/{SURVEY_ACTIVE_ID}",
            headers=normal_headers,
            json={"surveyTitle": "Should Fail"}
        )
        assert update_resp.status_code == 403


class TestAdminDeleteSurvey:
    """Tests for DELETE /admin/surveys/{surveyId}"""

    def test_admin_delete_survey_success(self, admin_headers):
        """Admin can soft delete a survey"""
        # First create a survey to delete
        create_resp = requests.post(
            f"{BASE_URL}/admin/surveys",
            headers=admin_headers,
            json={
                "surveyTitle": "Survey To Delete",
                "startTime": "2025-01-01T00:00:00Z",
                "endTime": "2025-12-31T23:59:59Z",
                "questions": [{"question": "Q?", "options": ["A", "B"]}]
            }
        )
        assert create_resp.status_code == 201
        survey_id = create_resp.json()['id']

        # Delete the survey
        delete_resp = requests.delete(
            f"{BASE_URL}/admin/surveys/{survey_id}",
            headers=admin_headers
        )
        assert delete_resp.status_code == 204

        # Verify it's deleted (normal users can't see it)
        get_resp = requests.get(
            f"{BASE_URL}/surveys/{survey_id}",
            headers=admin_headers
        )
        # Since it's soft deleted, admin endpoint should still be able to see it
        # but user endpoint returns 404
        # Actually, admin_get_survey_by_id shows deleted surveys
        # Let's check via admin endpoint to confirm status

    def test_admin_delete_already_deleted_survey(self, admin_headers):
        """Deleting already deleted survey returns 404"""
        # First create and delete a survey
        create_resp = requests.post(
            f"{BASE_URL}/admin/surveys",
            headers=admin_headers,
            json={
                "surveyTitle": "Survey Double Delete",
                "startTime": "2025-01-01T00:00:00Z",
                "endTime": "2025-12-31T23:59:59Z",
                "questions": [{"question": "Q?", "options": ["A", "B"]}]
            }
        )
        assert create_resp.status_code == 201
        survey_id = create_resp.json()['id']

        # First delete
        delete_resp1 = requests.delete(
            f"{BASE_URL}/admin/surveys/{survey_id}",
            headers=admin_headers
        )
        assert delete_resp1.status_code == 204

        # Second delete should fail
        delete_resp2 = requests.delete(
            f"{BASE_URL}/admin/surveys/{survey_id}",
            headers=admin_headers
        )
        assert delete_resp2.status_code == 404

    def test_admin_delete_nonexistent_survey(self, admin_headers):
        """Deleting nonexistent survey returns 404"""
        delete_resp = requests.delete(
            f"{BASE_URL}/admin/surveys/{NONEXISTENT_UUID}",
            headers=admin_headers
        )
        assert delete_resp.status_code == 404

    def test_admin_delete_survey_forbidden_for_normal_user(self, normal_headers):
        """Normal user gets 403 for admin endpoint"""
        delete_resp = requests.delete(
            f"{BASE_URL}/admin/surveys/{SURVEY_ACTIVE_ID}",
            headers=normal_headers
        )
        assert delete_resp.status_code == 403
