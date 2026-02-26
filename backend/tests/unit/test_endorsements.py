"""Unit tests for endorsement validation logic in sessions_controller."""

import pytest
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit

SESSION_ID = "aaaaaaaa-1111-2222-3333-444444444444"
VR_ID = "bbbbbbbb-1111-2222-3333-444444444444"
USER_ID = "cccccccc-1111-2222-3333-444444444444"
POST_ID = "dddddddd-1111-2222-3333-444444444444"
ENDORSEMENT_ID = "eeeeeeee-1111-2222-3333-444444444444"
LOCATION_ID = "ffffffff-1111-2222-3333-444444444444"


def _mock_token(user_id=USER_ID):
    return {"sub": user_id}


class TestEndorsementStatusGating:
    """Endorsements only allowed during proposals_open or finalization_open."""

    def test_proposals_open_allowed(self):
        from candid.controllers.sessions_controller import ENDORSEMENT_STATUSES
        assert 'proposals_open' in ENDORSEMENT_STATUSES

    def test_finalization_open_allowed(self):
        from candid.controllers.sessions_controller import ENDORSEMENT_STATUSES
        assert 'finalization_open' in ENDORSEMENT_STATUSES

    def test_proposals_closed_not_allowed(self):
        from candid.controllers.sessions_controller import ENDORSEMENT_STATUSES
        assert 'proposals_closed' not in ENDORSEMENT_STATUSES

    def test_voting_open_not_allowed(self):
        from candid.controllers.sessions_controller import ENDORSEMENT_STATUSES
        assert 'voting_open' not in ENDORSEMENT_STATUSES

    def test_voting_closed_not_allowed(self):
        from candid.controllers.sessions_controller import ENDORSEMENT_STATUSES
        assert 'voting_closed' not in ENDORSEMENT_STATUSES


class TestMaxEndorsements:
    """MAX_ENDORSEMENTS_PER_USER is 3."""

    def test_max_endorsements_is_3(self):
        from candid.controllers.helpers.constants import MAX_ENDORSEMENTS_PER_USER
        assert MAX_ENDORSEMENTS_PER_USER == 3


class TestStageToRoundType:
    """Mapping from session stage to voting round type."""

    def test_proposal_qualify_maps_to_issue_selection(self):
        from candid.controllers.sessions_controller import STAGE_TO_ROUND_TYPE
        assert STAGE_TO_ROUND_TYPE['proposal_qualify'] == 'issue_selection'

    def test_opinion_proposals_maps_to_policy_selection(self):
        from candid.controllers.sessions_controller import STAGE_TO_ROUND_TYPE
        assert STAGE_TO_ROUND_TYPE['opinion_proposals'] == 'policy_selection'

    def test_other_stages_not_mapped(self):
        from candid.controllers.sessions_controller import STAGE_TO_ROUND_TYPE
        assert 'proposal_issue' not in STAGE_TO_ROUND_TYPE
        assert 'opinion_discussion' not in STAGE_TO_ROUND_TYPE
        assert 'reflection' not in STAGE_TO_ROUND_TYPE


class TestVotingRoundToDict:
    """Tests for _voting_round_to_dict helper."""

    def test_converts_row_to_dict(self):
        from candid.controllers.sessions_controller import _voting_round_to_dict
        from datetime import datetime, timezone

        row = {
            'id': VR_ID,
            'session_id': SESSION_ID,
            'round_type': 'issue_selection',
            'status': 'proposals_open',
            'ballot_size': 5,
            'winner_count': 1,
            'created_time': datetime(2026, 1, 1, tzinfo=timezone.utc),
        }

        result = _voting_round_to_dict(row)
        assert result['id'] == VR_ID
        assert result['sessionId'] == SESSION_ID
        assert result['roundType'] == 'issue_selection'
        assert result['status'] == 'proposals_open'
        assert result['ballotSize'] == 5
        assert result['winnerCount'] == 1
        assert '2026-01-01' in result['createdTime']

    def test_handles_none_created_time(self):
        from candid.controllers.sessions_controller import _voting_round_to_dict

        row = {
            'id': VR_ID,
            'session_id': SESSION_ID,
            'round_type': 'issue_selection',
            'status': 'proposals_open',
            'ballot_size': 7,
            'winner_count': 1,
            'created_time': None,
        }

        result = _voting_round_to_dict(row)
        assert result['createdTime'] is None


class TestVotingRoundStatusOrder:
    """Tests for status order constants."""

    def test_status_order_length(self):
        from candid.controllers.sessions_controller import VOTING_ROUND_STATUS_ORDER
        assert len(VOTING_ROUND_STATUS_ORDER) == 5

    def test_status_order_sequence(self):
        from candid.controllers.sessions_controller import VOTING_ROUND_STATUS_ORDER
        assert VOTING_ROUND_STATUS_ORDER == [
            'proposals_open', 'finalization_open', 'proposals_closed',
            'voting_open', 'voting_closed',
        ]

    def test_status_index_maps_correctly(self):
        from candid.controllers.sessions_controller import VOTING_ROUND_STATUS_INDEX
        assert VOTING_ROUND_STATUS_INDEX['proposals_open'] == 0
        assert VOTING_ROUND_STATUS_INDEX['voting_closed'] == 4
