"""Unit tests for post creation and voting guards in posts_controller."""

import pytest
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit

USER_ID = "aaaaaaaa-1111-2222-3333-444444444444"
POST_ID = "bbbbbbbb-1111-2222-3333-444444444444"
SESSION_ID = "cccccccc-1111-2222-3333-444444444444"
LOCATION_ID = "dddddddd-1111-2222-3333-444444444444"


def _mock_token(user_id=USER_ID):
    return {"sub": user_id}


class TestFinalizedProposalVoteBlocked:
    """Votes on finalized proposals should be rejected with 400."""

    @patch("candid.controllers.helpers.auth.authorization", return_value=(True, None))
    @patch("candid.controllers.posts_controller.check_rate_limit_for", return_value=(True, 0))
    @patch("candid.controllers.posts_controller.db")
    @patch("connexion.request")
    def test_vote_on_finalized_proposal_returns_400(self, mock_request, mock_db, mock_rate, mock_auth):
        from candid.controllers.posts_controller import vote_on_post

        mock_request.get_json.return_value = {"voteType": "upvote"}

        mock_db.execute_query.return_value = {
            "id": POST_ID,
            "session_id": SESSION_ID,
            "creator_user_id": "other-user",
            "post_type": "proposal",
            "proposal_status": "finalized",
            "location_id": LOCATION_ID,
            "status": "active",
        }

        result, status = vote_on_post(POST_ID, {}, token_info=_mock_token(), user_id=USER_ID)
        assert status == 400
        assert "finalized" in str(result.message).lower()

    @patch("candid.controllers.helpers.auth.authorization", return_value=(True, None))
    @patch("candid.controllers.posts_controller.check_rate_limit_for", return_value=(True, 0))
    @patch("candid.controllers.posts_controller.check_session_stage", return_value=(True, None))
    @patch("candid.controllers.posts_controller.db")
    @patch("connexion.request")
    def test_vote_on_draft_proposal_allowed(self, mock_request, mock_db, mock_stage, mock_rate, mock_auth):
        from candid.controllers.posts_controller import vote_on_post

        mock_request.get_json.return_value = {"voteType": "upvote"}

        # First call: get post; second call: check existing vote
        mock_db.execute_query.side_effect = [
            {
                "id": POST_ID,
                "session_id": SESSION_ID,
                "creator_user_id": "other-user",
                "post_type": "proposal",
                "proposal_status": "draft",
                "location_id": LOCATION_ID,
                "status": "active",
            },
            None,  # no existing vote
        ]

        # Will fail later (no get_conversation_for_post mock) but should get past the guard
        try:
            vote_on_post(POST_ID, {}, token_info=_mock_token(), user_id=USER_ID)
        except Exception:
            pass
        # The finalized guard should NOT have triggered — verify db was called at least twice
        assert mock_db.execute_query.call_count >= 2


class TestOneProposalPerStage:
    """Users can only create one proposal per session per stage."""

    @patch("candid.controllers.helpers.auth.authorization", return_value=(True, None))
    @patch("candid.controllers.posts_controller.get_session_stage", return_value="proposal_issue")
    @patch("candid.controllers.posts_controller.check_session_stage", return_value=(True, None))
    @patch("candid.controllers.posts_controller.check_rate_limit_for", return_value=(True, 0))
    @patch("candid.controllers.posts_controller.db")
    @patch("connexion.request")
    def test_second_proposal_same_stage_returns_409(self, mock_request, mock_db, mock_rate, mock_stage, mock_get_stage, mock_auth):
        from candid.controllers.posts_controller import create_post

        mock_request.get_json.return_value = {
            "title": "Second Proposal",
            "body": "This is a duplicate",
            "locationId": LOCATION_ID,
            "sessionId": SESSION_ID,
            "postType": "proposal",
        }

        # DB calls: existing proposal check returns a hit
        mock_db.execute_query.return_value = {"id": "existing-proposal-id"}

        result, status = create_post(
            {"glossary_highlight": True},
            token_info=_mock_token(),
            user_id=USER_ID,
        )
        assert status == 409
        assert "already" in str(result.message).lower()

    @patch("candid.controllers.helpers.auth.authorization", return_value=(True, None))
    @patch("candid.controllers.posts_controller.get_session_stage", return_value="proposal_issue")
    @patch("candid.controllers.posts_controller.check_session_stage", return_value=(True, None))
    @patch("candid.controllers.posts_controller.check_rate_limit_for", return_value=(True, 0))
    @patch("candid.controllers.posts_controller.db")
    @patch("connexion.request")
    def test_first_proposal_allowed(self, mock_request, mock_db, mock_rate, mock_stage, mock_get_stage, mock_auth):
        from candid.controllers.posts_controller import create_post

        mock_request.get_json.return_value = {
            "title": "First Proposal",
            "body": "This should work",
            "locationId": LOCATION_ID,
            "sessionId": SESSION_ID,
            "postType": "proposal",
        }

        # DB calls: existing proposal check returns None (no existing), then location, session, insert, fetch
        mock_db.execute_query.side_effect = [
            None,  # no existing proposal
            {"id": LOCATION_ID},  # location exists
            {"id": SESSION_ID},  # session exists
        ]

        # Will fail later (INSERT) but should get past the guard
        try:
            create_post(
                {"glossary_highlight": True},
                token_info=_mock_token(),
                user_id=USER_ID,
            )
        except Exception:
            pass

        # Verify it got past the 409 guard (at least 3 db calls: proposal check + location + session)
        assert mock_db.execute_query.call_count >= 2
