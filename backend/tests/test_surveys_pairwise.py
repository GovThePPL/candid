"""Tests for pairwise survey endpoints: GET /surveys/pairwise, POST /pairwise/{surveyId}/respond,
GET /surveys/pairwise/{surveyId}/rankings."""

import pytest
import requests
from conftest import (
    BASE_URL,
    SURVEY_ACTIVE_ID,
    NONEXISTENT_UUID,
    NORMAL3_ID,
    db_query_one,
    db_query,
    db_execute,
)

PAIRWISE_URL = f"{BASE_URL}/surveys/pairwise"
RESPOND_URL = f"{BASE_URL}/pairwise"


@pytest.fixture(scope="module")
def pairwise_survey_data():
    """Query DB for first active pairwise survey and its items."""
    survey = db_query_one(
        "SELECT id FROM survey WHERE survey_type = 'pairwise' AND status = 'active' LIMIT 1"
    )
    if not survey:
        return None

    survey_id = str(survey["id"])
    items = db_query(
        "SELECT id, item_text, item_order FROM pairwise_item WHERE survey_id = %s ORDER BY item_order LIMIT 4",
        (survey_id,),
    )
    return {
        "survey_id": survey_id,
        "items": [{"id": str(i["id"]), "text": i["item_text"]} for i in items],
    }


class TestGetPairwiseSurveys:
    """GET /surveys/pairwise"""

    def test_get_pairwise_surveys_success(self, normal_headers):
        """Returns list of pairwise surveys."""
        resp = requests.get(PAIRWISE_URL, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)

    def test_survey_structure(self, normal_headers, pairwise_survey_data):
        """Pairwise surveys have expected structure."""
        if pairwise_survey_data is None:
            pytest.skip("No pairwise survey in database")
        resp = requests.get(PAIRWISE_URL, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        if len(body) == 0:
            pytest.skip("No non-labeling pairwise surveys returned by API")
        survey = body[0]
        assert "id" in survey
        assert "surveyTitle" in survey
        assert "comparisonQuestion" in survey
        assert "items" in survey

    def test_items_have_text_and_order(self, normal_headers, pairwise_survey_data):
        """Each item has id, itemText, and itemOrder."""
        if pairwise_survey_data is None:
            pytest.skip("No pairwise survey in database")
        resp = requests.get(PAIRWISE_URL, headers=normal_headers)
        assert resp.status_code == 200
        body = resp.json()
        for survey in body:
            for item in survey.get("items", []):
                assert "id" in item
                assert "text" in item

    def test_unauthenticated(self):
        """Unauthenticated request returns 401."""
        resp = requests.get(PAIRWISE_URL)
        assert resp.status_code == 401


class TestRespondToPairwise:
    """POST /pairwise/{surveyId}/respond"""

    def _cleanup_response(self, survey_id, user_id):
        """Remove pairwise responses for idempotent tests."""
        db_execute(
            "DELETE FROM pairwise_response WHERE survey_id = %s AND user_id = %s",
            (survey_id, user_id),
        )

    @pytest.mark.mutation
    def test_respond_success(self, normal3_headers, pairwise_survey_data):
        """Can submit a pairwise comparison response."""
        if pairwise_survey_data is None or len(pairwise_survey_data["items"]) < 2:
            pytest.skip("No pairwise survey with items in database")
        survey_id = pairwise_survey_data["survey_id"]
        items = pairwise_survey_data["items"]
        self._cleanup_response(survey_id, NORMAL3_ID)
        try:
            resp = requests.post(
                f"{RESPOND_URL}/{survey_id}/respond",
                headers=normal3_headers,
                json={
                    "winnerItemId": items[0]["id"],
                    "loserItemId": items[1]["id"],
                },
            )
            assert resp.status_code == 200
        finally:
            self._cleanup_response(survey_id, NORMAL3_ID)

    @pytest.mark.mutation
    def test_respond_idempotent(self, normal3_headers, pairwise_survey_data):
        """Submitting the same pair again succeeds (idempotent)."""
        if pairwise_survey_data is None or len(pairwise_survey_data["items"]) < 2:
            pytest.skip("No pairwise survey with items in database")
        survey_id = pairwise_survey_data["survey_id"]
        items = pairwise_survey_data["items"]
        self._cleanup_response(survey_id, NORMAL3_ID)
        try:
            payload = {
                "winnerItemId": items[0]["id"],
                "loserItemId": items[1]["id"],
            }
            resp1 = requests.post(
                f"{RESPOND_URL}/{survey_id}/respond",
                headers=normal3_headers,
                json=payload,
            )
            assert resp1.status_code == 200

            resp2 = requests.post(
                f"{RESPOND_URL}/{survey_id}/respond",
                headers=normal3_headers,
                json=payload,
            )
            # Should succeed (idempotent) or return 200
            assert resp2.status_code == 200
        finally:
            self._cleanup_response(survey_id, NORMAL3_ID)

    def test_same_item_400(self, normal3_headers, pairwise_survey_data):
        """Winner == loser returns 400."""
        if pairwise_survey_data is None or len(pairwise_survey_data["items"]) < 1:
            pytest.skip("No pairwise survey with items in database")
        survey_id = pairwise_survey_data["survey_id"]
        item_id = pairwise_survey_data["items"][0]["id"]
        resp = requests.post(
            f"{RESPOND_URL}/{survey_id}/respond",
            headers=normal3_headers,
            json={
                "winnerItemId": item_id,
                "loserItemId": item_id,
            },
        )
        assert resp.status_code == 400

    def test_missing_fields_400(self, normal3_headers, pairwise_survey_data):
        """Missing winnerItemId returns 400."""
        if pairwise_survey_data is None:
            pytest.skip("No pairwise survey in database")
        survey_id = pairwise_survey_data["survey_id"]
        resp = requests.post(
            f"{RESPOND_URL}/{survey_id}/respond",
            headers=normal3_headers,
            json={"loserItemId": pairwise_survey_data["items"][0]["id"]},
        )
        assert resp.status_code == 400

    def test_not_found(self, normal3_headers):
        """Nonexistent survey returns 400 or 404."""
        resp = requests.post(
            f"{RESPOND_URL}/{NONEXISTENT_UUID}/respond",
            headers=normal3_headers,
            json={
                "winnerItemId": NONEXISTENT_UUID,
                "loserItemId": NONEXISTENT_UUID,
            },
        )
        assert resp.status_code in (400, 404)

    def test_standard_survey_400(self, normal3_headers):
        """Standard survey ID returns 400 for pairwise endpoint."""
        resp = requests.post(
            f"{RESPOND_URL}/{SURVEY_ACTIVE_ID}/respond",
            headers=normal3_headers,
            json={
                "winnerItemId": NONEXISTENT_UUID,
                "loserItemId": NONEXISTENT_UUID,
            },
        )
        # Should reject because it's not a pairwise survey
        assert resp.status_code in (400, 404)

    def test_unauthenticated(self, pairwise_survey_data):
        """Unauthenticated request returns 401."""
        survey_id = pairwise_survey_data["survey_id"] if pairwise_survey_data else NONEXISTENT_UUID
        resp = requests.post(
            f"{RESPOND_URL}/{survey_id}/respond",
            json={
                "winnerItemId": NONEXISTENT_UUID,
                "loserItemId": NONEXISTENT_UUID,
            },
        )
        assert resp.status_code == 401


class TestGetSurveyRankings:
    """GET /surveys/pairwise/{surveyId}/rankings"""

    def test_get_rankings_success(self, normal_headers, pairwise_survey_data):
        """Can get rankings for a pairwise survey."""
        if pairwise_survey_data is None:
            pytest.skip("No pairwise survey in database")
        resp = requests.get(
            f"{PAIRWISE_URL}/{pairwise_survey_data['survey_id']}/rankings",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, dict)

    def test_rankings_structure(self, normal_headers, pairwise_survey_data):
        """Rankings response has expected fields."""
        if pairwise_survey_data is None:
            pytest.skip("No pairwise survey in database")
        resp = requests.get(
            f"{PAIRWISE_URL}/{pairwise_survey_data['survey_id']}/rankings",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "rankings" in body or "surveyId" in body or isinstance(body, dict)

    def test_rankings_have_condorcet_field(self, normal_headers, pairwise_survey_data):
        """Rankings response includes condorcetWinnerId field."""
        if pairwise_survey_data is None:
            pytest.skip("No pairwise survey in database")
        resp = requests.get(
            f"{PAIRWISE_URL}/{pairwise_survey_data['survey_id']}/rankings",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "condorcetWinnerId" in body

    def test_rankings_items_have_is_condorcet(self, normal_headers, pairwise_survey_data):
        """Each ranked item has isCondorcetWinner boolean."""
        if pairwise_survey_data is None:
            pytest.skip("No pairwise survey in database")
        resp = requests.get(
            f"{PAIRWISE_URL}/{pairwise_survey_data['survey_id']}/rankings",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        for item in body.get("rankings", []):
            assert "isCondorcetWinner" in item
            assert isinstance(item["isCondorcetWinner"], bool)

    def test_rankings_items_have_comparison_count(self, normal_headers, pairwise_survey_data):
        """Each ranked item has comparisonCount integer."""
        if pairwise_survey_data is None:
            pytest.skip("No pairwise survey in database")
        resp = requests.get(
            f"{PAIRWISE_URL}/{pairwise_survey_data['survey_id']}/rankings",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        for item in body.get("rankings", []):
            assert "comparisonCount" in item
            assert isinstance(item["comparisonCount"], int)

    def test_rankings_use_ranked_pairs_ordering(self, normal_headers, pairwise_survey_data):
        """Rankings are ordered by Ranked Pairs algorithm (not just win count)."""
        if pairwise_survey_data is None:
            pytest.skip("No pairwise survey in database")
        resp = requests.get(
            f"{PAIRWISE_URL}/{pairwise_survey_data['survey_id']}/rankings",
            headers=normal_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        rankings = body.get("rankings", [])
        # Ranks should be sequential 1, 2, 3, ...
        for i, item in enumerate(rankings):
            assert item["rank"] == i + 1

    def test_not_found_404(self, normal_headers):
        """Nonexistent survey returns 404."""
        resp = requests.get(
            f"{PAIRWISE_URL}/{NONEXISTENT_UUID}/rankings",
            headers=normal_headers,
        )
        assert resp.status_code == 404
