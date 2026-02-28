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
    """Endorsements only allowed during finalization_open."""

    def test_proposals_open_not_allowed(self):
        from candid.controllers.sessions_controller import ENDORSEMENT_STATUSES
        assert 'proposals_open' not in ENDORSEMENT_STATUSES

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

    def test_reflection_proposals_maps_to_policy_selection(self):
        from candid.controllers.sessions_controller import STAGE_TO_ROUND_TYPE
        assert STAGE_TO_ROUND_TYPE['reflection_proposals'] == 'policy_selection'

    def test_other_stages_not_mapped(self):
        from candid.controllers.sessions_controller import STAGE_TO_ROUND_TYPE
        assert 'proposal_issue' not in STAGE_TO_ROUND_TYPE
        assert 'opinion_discussion' not in STAGE_TO_ROUND_TYPE
        assert 'consensus' not in STAGE_TO_ROUND_TYPE


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


class TestFinalizedOnlyEndorsement:
    """Only finalized proposals can be endorsed.

    The create_endorsement() function checks proposal_status == 'finalized'
    and rejects draft proposals with 400.  These tests validate the guard
    logic by calling the controller with a mocked DB.
    """

    @patch("candid.controllers.helpers.auth.authorization", return_value=(True, None))
    @patch("candid.controllers.sessions_controller.db")
    @patch("connexion.request")
    def test_draft_proposal_rejected(self, mock_request, mock_db, mock_auth):
        from candid.controllers.sessions_controller import create_endorsement

        mock_request.get_json.return_value = {"proposalPostId": POST_ID}

        # DB responses in call order: session, voting round, post
        mock_db.execute_query.side_effect = [
            {"id": SESSION_ID, "location_id": LOCATION_ID, "stage": "proposal_qualify"},
            {"id": VR_ID, "status": "finalization_open"},
            {"id": POST_ID, "session_id": SESSION_ID, "post_type": "proposal", "proposal_status": "draft"},
        ]

        result, status = create_endorsement(SESSION_ID, {}, token_info=_mock_token(), user_id=USER_ID)
        assert status == 400
        assert "finalized" in str(result.message).lower()

    @patch("candid.controllers.helpers.auth.authorization", return_value=(True, None))
    @patch("candid.controllers.sessions_controller.db")
    @patch("connexion.request")
    def test_finalized_proposal_allowed(self, mock_request, mock_db, mock_auth):
        from candid.controllers.sessions_controller import create_endorsement
        from datetime import datetime, timezone

        mock_request.get_json.return_value = {"proposalPostId": POST_ID}

        created = datetime(2026, 1, 1, tzinfo=timezone.utc)
        # DB responses: session, voting round, post, count, duplicate check, insert
        mock_db.execute_query.side_effect = [
            {"id": SESSION_ID, "location_id": LOCATION_ID, "stage": "proposal_qualify"},
            {"id": VR_ID, "status": "finalization_open"},
            {"id": POST_ID, "session_id": SESSION_ID, "post_type": "proposal", "proposal_status": "finalized"},
            {"cnt": 0},
            None,  # no duplicate
            {"id": ENDORSEMENT_ID, "proposal_post_id": POST_ID, "created_time": created},
        ]

        result, status = create_endorsement(SESSION_ID, {}, token_info=_mock_token(), user_id=USER_ID)
        assert status == 201
        assert result["proposalPostId"] == POST_ID


class TestHideEndorsementCounts:
    """Endorsement counts hidden from non-facilitators."""

    @patch("candid.controllers.helpers.auth.authorization", return_value=(True, None))
    @patch("candid.controllers.sessions_controller.is_facilitator_for", return_value=False)
    @patch("candid.controllers.sessions_controller.db")
    def test_non_facilitator_gets_empty_counts(self, mock_db, mock_is_fac, mock_auth):
        from candid.controllers.sessions_controller import get_endorsements
        from datetime import datetime, timezone

        created = datetime(2026, 1, 1, tzinfo=timezone.utc)
        # DB responses: voting round, my endorsements, session (for location_id)
        mock_db.execute_query.side_effect = [
            {"id": VR_ID, "session_id": SESSION_ID, "round_type": "issue_selection",
             "status": "proposals_open", "ballot_size": 5, "winner_count": 1,
             "created_time": created, "results_json": None},
            [{"id": ENDORSEMENT_ID, "proposal_post_id": POST_ID, "created_time": created}],
            {"location_id": LOCATION_ID},
        ]

        result, status = get_endorsements(SESSION_ID, round_type="issue_selection",
                                          token_info=_mock_token(), user_id=USER_ID)
        assert status == 200
        assert result["proposalCounts"] == []
        assert len(result["myEndorsements"]) == 1

    @patch("candid.controllers.helpers.auth.authorization", return_value=(True, None))
    @patch("candid.controllers.sessions_controller.is_facilitator_for", return_value=True)
    @patch("candid.controllers.sessions_controller.db")
    def test_facilitator_gets_counts(self, mock_db, mock_is_fac, mock_auth):
        from candid.controllers.sessions_controller import get_endorsements
        from datetime import datetime, timezone

        created = datetime(2026, 1, 1, tzinfo=timezone.utc)
        # DB responses: voting round, my endorsements, session, count query
        mock_db.execute_query.side_effect = [
            {"id": VR_ID, "session_id": SESSION_ID, "round_type": "issue_selection",
             "status": "proposals_open", "ballot_size": 5, "winner_count": 1,
             "created_time": created, "results_json": None},
            [{"id": ENDORSEMENT_ID, "proposal_post_id": POST_ID, "created_time": created}],
            {"location_id": LOCATION_ID},
            [{"proposal_post_id": POST_ID, "count": 5}],
        ]

        result, status = get_endorsements(SESSION_ID, round_type="issue_selection",
                                          token_info=_mock_token(), user_id=USER_ID)
        assert status == 200
        assert len(result["proposalCounts"]) == 1
        assert result["proposalCounts"][0]["count"] == 5


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
