"""Unit tests for build_user_summary helper."""
from unittest.mock import MagicMock, patch
from decimal import Decimal

import pytest

MODULE = "candid.controllers.helpers.user_summary"


class TestBuildUserSummary:
    def _call(self, mock_db, user_id):
        with patch(f"{MODULE}.db", mock_db):
            from candid.controllers.helpers.user_summary import build_user_summary
            return build_user_summary(user_id)

    def test_returns_none_for_null_id(self):
        mock_db = MagicMock()
        result = self._call(mock_db, None)
        assert result is None
        mock_db.execute_query.assert_not_called()

    def test_returns_none_for_empty_string(self):
        mock_db = MagicMock()
        result = self._call(mock_db, '')
        assert result is None
        mock_db.execute_query.assert_not_called()

    def test_returns_none_when_user_not_found(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = None
        result = self._call(mock_db, 'some-uuid')
        assert result is None

    def test_returns_full_user_dict(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {
            'id': 'abc-123',
            'username': 'alice',
            'display_name': 'Alice',
            'status': 'active',
            'trust_score': 0.85,
            'avatar_url': 'http://img/full.png',
            'avatar_icon_url': 'http://img/icon.png',
            'kudos_count': 7,
        }
        result = self._call(mock_db, 'abc-123')
        assert result == {
            'id': 'abc-123',
            'username': 'alice',
            'displayName': 'Alice',
            'status': 'active',
            'trustScore': 0.85,
            'avatarUrl': 'http://img/full.png',
            'avatarIconUrl': 'http://img/icon.png',
            'kudosCount': 7,
        }

    def test_none_trust_score(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {
            'id': 'abc-123',
            'username': 'bob',
            'display_name': 'Bob',
            'status': 'active',
            'trust_score': None,
            'avatar_url': None,
            'avatar_icon_url': None,
            'kudos_count': 0,
        }
        result = self._call(mock_db, 'abc-123')
        assert result['trustScore'] is None
        assert result['avatarUrl'] is None

    def test_trust_score_is_float(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {
            'id': 'abc-123',
            'username': 'carol',
            'display_name': 'Carol',
            'status': 'active',
            'trust_score': Decimal('0.50000'),
            'avatar_url': None,
            'avatar_icon_url': None,
            'kudos_count': 3,
        }
        result = self._call(mock_db, 'abc-123')
        assert isinstance(result['trustScore'], float)
        assert result['trustScore'] == 0.5
