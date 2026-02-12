"""Unit tests for helpers/card_builders.py — pure card transformation functions."""

import pytest
from datetime import datetime

from candid.controllers.helpers.card_builders import (
    DEMOGRAPHIC_QUESTIONS,
    DB_TO_API_FIELD,
    value_to_label,
    position_to_card,
    chatting_list_position_to_card,
    survey_to_card,
    chat_request_to_card,
    kudos_to_card,
    demographic_to_card,
)

pytestmark = pytest.mark.unit


# --- value_to_label ---

class TestValueToLabel:
    def test_single_word(self):
        assert value_to_label("male") == "Male"

    def test_snake_case(self):
        assert value_to_label("some_college") == "Some College"

    def test_already_title(self):
        assert value_to_label("Left") == "Left"

    def test_multi_underscore(self):
        assert value_to_label("high_school_diploma") == "High School Diploma"


# --- position_to_card ---

class TestPositionToCard:
    def _base_pos(self):
        return {
            "id": "p1",
            "statement": "Test statement",
            "creator_id": "u1",
            "creator_display_name": "Alice",
            "creator_username": "alice",
            "creator_status": "active",
            "creator_kudos_count": 5,
            "creator_trust_score": 0.8,
            "creator_avatar_url": "http://img/a.png",
            "creator_avatar_icon_url": "http://img/a_icon.png",
            "category_id": "c1",
            "category_name": "Policy",
            "location_code": "US",
            "location_name": "United States",
            "created_time": "2026-01-01T00:00:00",
            "agree_count": 10,
            "disagree_count": 3,
            "pass_count": 2,
            "chat_count": 1,
            "status": "active",
            "user_position_id": "up1",
        }

    def test_basic_card(self):
        card = position_to_card(self._base_pos())
        assert card["type"] == "position"
        assert card["data"]["id"] == "p1"
        assert card["data"]["statement"] == "Test statement"
        assert card["data"]["creator"]["id"] == "u1"
        assert card["data"]["creator"]["displayName"] == "Alice"
        assert card["data"]["agreeCount"] == 10
        assert card["data"]["userPositionId"] == "up1"

    def test_category_included(self):
        card = position_to_card(self._base_pos())
        assert card["data"]["category"] == {"id": "c1", "label": "Policy"}

    def test_location_included(self):
        card = position_to_card(self._base_pos())
        assert card["data"]["location"] == {"code": "US", "name": "United States"}

    def test_no_category(self):
        pos = self._base_pos()
        pos["category_name"] = None
        card = position_to_card(pos)
        assert card["data"]["category"] is None

    def test_no_location(self):
        pos = self._base_pos()
        pos["location_code"] = None
        card = position_to_card(pos)
        assert card["data"]["location"] is None

    def test_fallback_creator_user_id(self):
        pos = self._base_pos()
        pos["creator_user_id"] = "u1"
        del pos["creator_id"]
        card = position_to_card(pos)
        assert card["data"]["creator"]["id"] == "u1"  # falls back to creator_user_id

    def test_defaults_for_missing_counts(self):
        pos = {"id": "p1", "statement": "S"}
        card = position_to_card(pos)
        assert card["data"]["agreeCount"] == 0
        assert card["data"]["disagreeCount"] == 0
        assert card["data"]["passCount"] == 0
        assert card["data"]["chatCount"] == 0
        assert card["data"]["status"] == "active"


# --- chatting_list_position_to_card ---

class TestChattingListPositionToCard:
    def _base_pos(self):
        return {
            "id": "p2",
            "statement": "Chatting list statement",
            "creator_id": "u2",
            "creator_display_name": "Bob",
            "creator_username": "bob",
            "category_name": "Economy",
            "category_id": "c2",
            "location_code": "OR",
            "location_name": "Oregon",
            "chatting_list_id": "cl1",
            "has_pending_requests": True,
        }

    def test_source_field(self):
        card = chatting_list_position_to_card(self._base_pos())
        assert card["data"]["source"] == "chatting_list"

    def test_chatting_list_id(self):
        card = chatting_list_position_to_card(self._base_pos())
        assert card["data"]["chattingListId"] == "cl1"

    def test_has_pending_requests(self):
        card = chatting_list_position_to_card(self._base_pos())
        assert card["data"]["hasPendingRequests"] is True

    def test_type_is_position(self):
        card = chatting_list_position_to_card(self._base_pos())
        assert card["type"] == "position"


# --- survey_to_card ---

class TestSurveyToCard:
    def test_basic_survey(self):
        survey = {
            "question_id": "q1",
            "survey_id": "s1",
            "question": "What matters most?",
            "survey_title": "Priority Survey",
            "options": [
                {"id": 1, "survey_question_option": "Education"},
                {"id": 2, "survey_question_option": "Healthcare"},
            ]
        }
        card = survey_to_card(survey)
        assert card["type"] == "survey"
        assert card["data"]["id"] == "q1"
        assert card["data"]["surveyId"] == "s1"
        assert card["data"]["question"] == "What matters most?"
        assert len(card["data"]["options"]) == 2
        assert card["data"]["options"][0] == {"id": "1", "option": "Education"}

    def test_no_options(self):
        survey = {"question_id": "q1", "survey_id": "s1", "question": "Q?"}
        card = survey_to_card(survey)
        assert card["data"]["options"] == []


# --- chat_request_to_card ---

class TestChatRequestToCard:
    def _base_req(self):
        return {
            "id": 101,
            "initiator_id": 10,
            "initiator_display_name": "Charlie",
            "initiator_username": "charlie",
            "initiator_status": "active",
            "initiator_kudos_count": 3,
            "initiator_trust_score": 0.9,
            "initiator_avatar_url": None,
            "initiator_avatar_icon_url": None,
            "author_id": 20,
            "author_display_name": "Dana",
            "author_username": "dana",
            "author_status": "active",
            "author_kudos_count": 7,
            "author_trust_score": 0.75,
            "author_avatar_url": None,
            "author_avatar_icon_url": None,
            "user_position_id": 50,
            "position_id": 30,
            "position_statement": "We should improve transit",
            "position_category_name": "Infrastructure",
            "position_location_code": "PDX",
            "position_location_name": "Portland",
            "response": "pending",
        }

    def test_basic_card(self):
        card = chat_request_to_card(self._base_req())
        assert card["type"] == "chat_request"
        assert card["data"]["id"] == "101"
        assert card["data"]["requester"]["id"] == "10"
        assert card["data"]["requester"]["displayName"] == "Charlie"
        assert card["data"]["position"]["statement"] == "We should improve transit"
        assert card["data"]["response"] == "pending"

    def test_position_category(self):
        card = chat_request_to_card(self._base_req())
        assert card["data"]["position"]["category"] == {"label": "Infrastructure"}

    def test_position_location(self):
        card = chat_request_to_card(self._base_req())
        assert card["data"]["position"]["location"] == {"code": "PDX", "name": "Portland"}

    def test_no_category(self):
        req = self._base_req()
        req["position_category_name"] = None
        card = chat_request_to_card(req)
        assert "category" not in card["data"]["position"]

    def test_no_location(self):
        req = self._base_req()
        req["position_location_code"] = None
        card = chat_request_to_card(req)
        assert "location" not in card["data"]["position"]

    def test_null_trust_score(self):
        req = self._base_req()
        req["initiator_trust_score"] = None
        card = chat_request_to_card(req)
        assert card["data"]["requester"]["trustScore"] is None


# --- kudos_to_card ---

class TestKudosToCard:
    def _base_kudos(self):
        return {
            "chat_log_id": 200,
            "other_user_id": 5,
            "other_display_name": "Eve",
            "other_username": "eve",
            "other_status": "active",
            "other_kudos_count": 2,
            "other_trust_score": 0.6,
            "other_avatar_url": None,
            "other_avatar_icon_url": None,
            "position_id": 40,
            "position_statement": "Climate action now",
            "position_author_id": 6,
            "position_author_display_name": "Frank",
            "position_author_username": "frank",
            "position_author_status": "active",
            "position_author_kudos_count": 10,
            "position_author_trust_score": 0.95,
            "position_author_avatar_url": None,
            "position_author_avatar_icon_url": None,
            "position_category_id": "c3",
            "position_category_name": "Environment",
            "position_location_code": "US",
            "position_location_name": "United States",
            "closing_statement": "We agree!",
            "end_time": datetime(2026, 1, 15, 12, 0, 0),
        }

    def test_basic_card(self):
        card = kudos_to_card(self._base_kudos(), "u1")
        assert card["type"] == "kudos"
        assert card["data"]["id"] == "200"
        assert card["data"]["otherParticipant"]["id"] == "5"
        assert card["data"]["closingStatement"] == "We agree!"

    def test_chat_end_time_iso(self):
        card = kudos_to_card(self._base_kudos(), "u1")
        assert card["data"]["chatEndTime"] == "2026-01-15T12:00:00"

    def test_null_end_time(self):
        kudos = self._base_kudos()
        kudos["end_time"] = None
        card = kudos_to_card(kudos, "u1")
        assert card["data"]["chatEndTime"] is None

    def test_position_category(self):
        card = kudos_to_card(self._base_kudos(), "u1")
        assert card["data"]["position"]["category"] == {"id": "c3", "label": "Environment"}

    def test_no_category(self):
        kudos = self._base_kudos()
        kudos["position_category_name"] = None
        card = kudos_to_card(kudos, "u1")
        assert "category" not in card["data"]["position"]

    def test_no_location(self):
        kudos = self._base_kudos()
        kudos["position_location_code"] = None
        card = kudos_to_card(kudos, "u1")
        assert "location" not in card["data"]["position"]


# --- demographic_to_card ---

class TestDemographicToCard:
    def test_known_field(self):
        options = {"lean": [{"value": "left", "label": "Left"}, {"value": "right", "label": "Right"}]}
        card = demographic_to_card("lean", options)
        assert card["type"] == "demographic"
        assert card["data"]["field"] == "lean"
        assert card["data"]["question"] == "What is your political lean?"
        assert len(card["data"]["options"]) == 2

    def test_geo_locale_field_mapping(self):
        options = {"geo_locale": [{"value": "urban", "label": "Urban"}]}
        card = demographic_to_card("geo_locale", options)
        assert card["data"]["field"] == "geoLocale"

    def test_unknown_field_fallback(self):
        card = demographic_to_card("hair_color", {})
        assert card["data"]["field"] == "hair_color"
        assert "hair color" in card["data"]["question"]
        assert card["data"]["options"] == []

    def test_empty_options(self):
        card = demographic_to_card("sex", {})
        assert card["data"]["options"] == []


# --- Constants ---

class TestConstants:
    def test_demographic_questions_keys(self):
        assert set(DEMOGRAPHIC_QUESTIONS.keys()) == {"lean", "education", "geo_locale", "sex"}

    def test_db_to_api_field_mapping(self):
        assert DB_TO_API_FIELD["geo_locale"] == "geoLocale"
        assert DB_TO_API_FIELD["lean"] == "lean"
