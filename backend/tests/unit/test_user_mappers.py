"""Unit tests for helpers/user_mappers.py — row converters, settings constants, location levels."""

import pytest
from datetime import datetime

from candid.controllers.helpers.user_mappers import (
    WEIGHT_TO_PRIORITY,
    PRIORITY_TO_WEIGHT,
    LIKELIHOOD_TO_INT,
    INT_TO_LIKELIHOOD,
    NOTIFICATION_FREQ_TO_INT,
    NOTIFICATION_FREQ_TO_LABEL,
    DEMOGRAPHICS_API_TO_DB,
    row_to_current_user,
    row_to_user_position,
    row_to_user_demographics,
    compute_location_levels,
)

pytestmark = pytest.mark.unit


# --- Constants ---

class TestSettingsConstants:
    def test_weight_roundtrip(self):
        for label, priority in WEIGHT_TO_PRIORITY.items():
            assert PRIORITY_TO_WEIGHT[priority] == label

    def test_likelihood_roundtrip(self):
        for label, val in LIKELIHOOD_TO_INT.items():
            assert INT_TO_LIKELIHOOD[val] == label

    def test_notification_freq_roundtrip(self):
        for label, val in NOTIFICATION_FREQ_TO_INT.items():
            assert NOTIFICATION_FREQ_TO_LABEL[val] == label

    def test_weight_range(self):
        assert WEIGHT_TO_PRIORITY['none'] == 0
        assert WEIGHT_TO_PRIORITY['most'] == 5

    def test_likelihood_range(self):
        assert LIKELIHOOD_TO_INT['off'] == 0
        assert LIKELIHOOD_TO_INT['often'] == 5

    def test_demographics_api_to_db_keys(self):
        assert DEMOGRAPHICS_API_TO_DB['geoLocale'] == 'geo_locale'
        assert DEMOGRAPHICS_API_TO_DB['ageRange'] == 'age_range'
        assert DEMOGRAPHICS_API_TO_DB['incomeRange'] == 'income_range'


# --- Row converters ---

class TestRowToCurrentUser:
    def _base_row(self):
        return {
            'id': 'u1',
            'username': 'alice',
            'display_name': 'Alice',
            'email': 'alice@example.com',
            'avatar_url': 'http://img/a.png',
            'avatar_icon_url': 'http://img/a_icon.png',
            'user_type': 'normal',
            'status': 'active',
            'join_time': datetime(2026, 1, 1),
            'trust_score': 0.85,
            'kudos_count': 5,
            'diagnostics_consent': True,
        }

    def test_basic_conversion(self):
        user = row_to_current_user(self._base_row())
        assert user.id == 'u1'
        assert user.username == 'alice'
        assert user.display_name == 'Alice'
        assert user.user_type == 'normal'

    def test_trust_score_float(self):
        user = row_to_current_user(self._base_row())
        assert user.trust_score == 0.85
        assert isinstance(user.trust_score, float)

    def test_none_trust_score(self):
        row = self._base_row()
        row['trust_score'] = None
        user = row_to_current_user(row)
        assert user.trust_score is None

    def test_missing_optional_fields(self):
        row = {
            'id': 'u1', 'username': 'a', 'display_name': 'A',
            'user_type': 'normal', 'status': 'active',
        }
        user = row_to_current_user(row)
        assert user.email is None
        assert user.avatar_url is None
        assert user.kudos_count == 0


class TestRowToUserPosition:
    def test_basic_conversion(self):
        row = {
            'id': 'up1', 'user_id': 'u1', 'position_id': 'p1',
            'location_id': 'loc1', 'category_id': 'cat1',
            'category_name': 'Policy', 'location_name': 'Oregon',
            'location_code': 'OR', 'statement': 'Test',
            'status': 'active', 'agree_count': 5,
            'disagree_count': 2, 'pass_count': 1, 'chat_count': 3,
        }
        pos = row_to_user_position(row)
        assert pos.id == 'up1'
        assert pos.statement == 'Test'
        assert pos.agree_count == 5

    def test_null_location(self):
        row = {
            'id': 'up1', 'user_id': 'u1', 'position_id': 'p1',
            'statement': 'S', 'status': 'active',
        }
        pos = row_to_user_position(row)
        assert pos.location_id is None
        assert pos.category_id is None


class TestRowToUserDemographics:
    def test_basic_conversion(self):
        row = {
            'location_id': 'loc1', 'lean': 'left',
            'affiliation': 'aff1', 'education': 'college',
            'geo_locale': 'urban', 'race': None,
            'sex': 'male', 'age_range': '25-34',
            'income_range': '50k-75k',
            'created_time': datetime(2026, 1, 1),
        }
        demo = row_to_user_demographics(row)
        assert demo.lean == 'left'
        assert demo.education == 'college'
        assert demo.sex == 'male'

    def test_all_none(self):
        row = {}
        demo = row_to_user_demographics(row)
        assert demo.location_id is None
        assert demo.lean is None


# --- Location levels ---

class TestComputeLocationLevels:
    def test_empty(self):
        assert compute_location_levels([]) == []

    def test_single_root(self):
        locs = [{'id': '1', 'name': 'US', 'code': 'US', 'parent_location_id': None}]
        result = compute_location_levels(locs)
        assert len(result) == 1
        assert result[0]['level'] == 0
        assert result[0]['parentLocationId'] is None

    def test_parent_child(self):
        locs = [
            {'id': '1', 'name': 'US', 'code': 'US', 'parent_location_id': None},
            {'id': '2', 'name': 'Oregon', 'code': 'OR', 'parent_location_id': '1'},
        ]
        result = compute_location_levels(locs)
        assert result[0]['level'] == 0
        assert result[0]['name'] == 'US'
        assert result[1]['level'] == 1
        assert result[1]['name'] == 'Oregon'

    def test_three_levels(self):
        locs = [
            {'id': '1', 'name': 'US', 'code': 'US', 'parent_location_id': None},
            {'id': '2', 'name': 'Oregon', 'code': 'OR', 'parent_location_id': '1'},
            {'id': '3', 'name': 'Portland', 'code': 'PDX', 'parent_location_id': '2'},
        ]
        result = compute_location_levels(locs)
        levels = {r['name']: r['level'] for r in result}
        assert levels == {'US': 0, 'Oregon': 1, 'Portland': 2}

    def test_sorted_by_level_then_name(self):
        locs = [
            {'id': '1', 'name': 'US', 'code': 'US', 'parent_location_id': None},
            {'id': '2', 'name': 'Oregon', 'code': 'OR', 'parent_location_id': '1'},
            {'id': '3', 'name': 'California', 'code': 'CA', 'parent_location_id': '1'},
        ]
        result = compute_location_levels(locs)
        assert result[0]['name'] == 'US'
        assert result[1]['name'] == 'California'
        assert result[2]['name'] == 'Oregon'

    def test_ids_are_strings(self):
        locs = [{'id': 1, 'name': 'X', 'code': 'X', 'parent_location_id': None}]
        result = compute_location_levels(locs)
        assert result[0]['id'] == '1'
