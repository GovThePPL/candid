"""Unit tests for get_user_by_username in users_controller.py."""

import pytest
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit


@pytest.fixture
def mock_auth():
    """Patch authorization and token_to_user for all tests."""
    with patch('candid.controllers.users_controller.authorization') as mock_authz:
        mock_authz.return_value = (True, None)
        yield mock_authz


@pytest.fixture
def mock_db():
    """Patch db.execute_query."""
    with patch('candid.controllers.users_controller.db') as mock:
        yield mock


@pytest.fixture
def mock_roles():
    """Patch get_user_roles."""
    with patch('candid.controllers.users_controller.get_user_roles') as mock:
        mock.return_value = []
        yield mock


SAMPLE_USER_ROW = {
    'id': 'aaaa-bbbb-cccc',
    'username': 'Normal2',
    'display_name': 'Normal Two',
    'status': 'active',
    'trust_score': 0.75,
    'avatar_url': None,
    'avatar_icon_url': None,
    'kudos_count': 5,
}


class TestGetUserByUsername:
    def test_returns_user_when_found(self, mock_auth, mock_db, mock_roles):
        mock_db.execute_query.return_value = SAMPLE_USER_ROW

        from candid.controllers.users_controller import get_user_by_username
        result = get_user_by_username('normal2', token_info={'sub': 'x'})

        # Should query with LOWER()
        call_args = mock_db.execute_query.call_args
        assert 'LOWER' in call_args[0][0]
        assert call_args[0][1] == ('normal2',)
        assert call_args[1] == {'fetchone': True}

        # Result should be a User object
        assert result.username == 'Normal2'
        assert result.display_name == 'Normal Two'
        assert result.id == 'aaaa-bbbb-cccc'
        assert result.kudos_count == 5

    def test_returns_404_when_not_found(self, mock_auth, mock_db, mock_roles):
        mock_db.execute_query.return_value = None

        from candid.controllers.users_controller import get_user_by_username
        result = get_user_by_username('nonexistent', token_info={'sub': 'x'})

        assert isinstance(result, tuple)
        error, status = result
        assert status == 404

    def test_case_insensitive_lookup(self, mock_auth, mock_db, mock_roles):
        mock_db.execute_query.return_value = SAMPLE_USER_ROW

        from candid.controllers.users_controller import get_user_by_username
        get_user_by_username('NORMAL2', token_info={'sub': 'x'})

        call_args = mock_db.execute_query.call_args
        assert call_args[0][1] == ('NORMAL2',)
        # The SQL uses LOWER() on both sides so this will match

    def test_includes_roles(self, mock_auth, mock_db, mock_roles):
        mock_db.execute_query.return_value = SAMPLE_USER_ROW
        mock_roles.return_value = [{
            'role': 'moderator',
            'location_id': 'loc1',
            'position_category_id': None,
            'location_name': 'Oregon',
            'location_code': 'OR',
            'category_label': None,
        }]

        from candid.controllers.users_controller import get_user_by_username
        result = get_user_by_username('normal2', token_info={'sub': 'x'})

        assert len(result.roles) == 1
        assert result.roles[0]['role'] == 'moderator'

    def test_returns_auth_error_when_unauthorized(self, mock_db, mock_roles):
        from candid.models.error_model import ErrorModel
        with patch('candid.controllers.users_controller.authorization') as mock_authz:
            err = ErrorModel(401, "Unauthorized")
            err.code = 401
            mock_authz.return_value = (False, err)

            from candid.controllers.users_controller import get_user_by_username
            result = get_user_by_username('normal2', token_info=None)

            assert isinstance(result, tuple)
            assert result[1] == 401
