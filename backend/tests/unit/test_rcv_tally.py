"""Unit tests for RCV tally algorithm — Condorcet with IRV fallback."""

import pytest

from candid.controllers.helpers.rcv_tally import (
    build_pairwise_matrix,
    find_condorcet_winner,
    run_irv,
)

pytestmark = pytest.mark.unit

# Candidate IDs
A = "aaaa-1111"
B = "bbbb-2222"
C = "cccc-3333"
D = "dddd-4444"
E = "eeee-5555"


class TestBuildPairwiseMatrix:
    """Tests for pairwise preference matrix construction."""

    def test_simple_two_candidates(self):
        """Two candidates, two ballots: A>B on both."""
        ballots = [
            [(A, 1), (B, 2)],
            [(A, 1), (B, 2)],
        ]
        matrix = build_pairwise_matrix(ballots, {A, B})
        assert matrix[(A, B)] == 2
        assert matrix.get((B, A), 0) == 0

    def test_split_preferences(self):
        """Split preferences: one for A>B, one for B>A."""
        ballots = [
            [(A, 1), (B, 2)],
            [(B, 1), (A, 2)],
        ]
        matrix = build_pairwise_matrix(ballots, {A, B})
        assert matrix[(A, B)] == 1
        assert matrix[(B, A)] == 1

    def test_three_candidates(self):
        """Three candidates with varied rankings."""
        ballots = [
            [(A, 1), (B, 2), (C, 3)],  # A>B, A>C, B>C
            [(B, 1), (C, 2), (A, 3)],  # B>C, B>A, C>A
            [(A, 1), (C, 2), (B, 3)],  # A>C, A>B, C>B
        ]
        matrix = build_pairwise_matrix(ballots, {A, B, C})
        # A beats B: ballot 1 + ballot 3 = 2
        assert matrix[(A, B)] == 2
        # B beats A: ballot 2 = 1
        assert matrix[(B, A)] == 1
        # A beats C: ballot 1 + ballot 3 = 2
        assert matrix[(A, C)] == 2
        # C beats A: ballot 2 = 1
        assert matrix[(C, A)] == 1

    def test_unranked_candidates_lose(self):
        """Unranked candidates are less preferred than ranked ones."""
        ballots = [
            [(A, 1)],  # Only ranks A — A beats B and C
        ]
        matrix = build_pairwise_matrix(ballots, {A, B, C})
        assert matrix[(A, B)] == 1
        assert matrix[(A, C)] == 1
        assert matrix.get((B, A), 0) == 0
        assert matrix.get((C, A), 0) == 0
        # B vs C: both unranked, so tie (no preference)
        assert matrix.get((B, C), 0) == 0
        assert matrix.get((C, B), 0) == 0

    def test_empty_ballots(self):
        """Empty ballot list produces empty matrix."""
        matrix = build_pairwise_matrix([], {A, B})
        assert matrix.get((A, B), 0) == 0
        assert matrix.get((B, A), 0) == 0

    def test_single_candidate(self):
        """Single candidate produces empty matrix."""
        ballots = [[(A, 1)]]
        matrix = build_pairwise_matrix(ballots, {A})
        assert len(matrix) == 0


class TestFindCondorcetWinner:
    """Tests for Condorcet winner detection."""

    def test_clear_condorcet_winner(self):
        """A beats both B and C → A is Condorcet winner."""
        matrix = {
            (A, B): 3, (B, A): 1,
            (A, C): 3, (C, A): 1,
            (B, C): 2, (C, B): 2,
        }
        assert find_condorcet_winner(matrix, {A, B, C}) == A

    def test_no_condorcet_winner_cycle(self):
        """Rock-paper-scissors cycle: A>B>C>A → no winner."""
        matrix = {
            (A, B): 2, (B, A): 1,
            (B, C): 2, (C, B): 1,
            (C, A): 2, (A, C): 1,
        }
        assert find_condorcet_winner(matrix, {A, B, C}) is None

    def test_two_candidate_winner(self):
        """Two candidates, clear winner."""
        matrix = {(A, B): 5, (B, A): 3}
        assert find_condorcet_winner(matrix, {A, B}) == A

    def test_two_candidate_tie(self):
        """Two candidates tied → no Condorcet winner."""
        matrix = {(A, B): 3, (B, A): 3}
        assert find_condorcet_winner(matrix, {A, B}) is None

    def test_single_candidate(self):
        """Single candidate is automatically the Condorcet winner."""
        matrix = {}
        assert find_condorcet_winner(matrix, {A}) == A


class TestRunIRV:
    """Tests for Instant Runoff Voting."""

    def test_majority_first_round(self):
        """Candidate with >50% first preferences wins immediately."""
        ballots = [
            [(A, 1), (B, 2)],
            [(A, 1), (B, 2)],
            [(A, 1), (C, 2)],
            [(B, 1), (A, 2)],
        ]
        winner, rounds = run_irv(ballots, {A, B, C})
        assert winner == A
        assert len(rounds) == 1
        assert rounds[0]['counts'][A] == 3

    def test_irv_with_elimination(self):
        """No first-round majority; elimination needed."""
        # A gets 2, B gets 2, C gets 1 → C eliminated → C's voter prefers A
        ballots = [
            [(A, 1), (B, 2), (C, 3)],
            [(A, 1), (C, 2), (B, 3)],
            [(B, 1), (A, 2), (C, 3)],
            [(B, 1), (C, 2), (A, 3)],
            [(C, 1), (A, 2), (B, 3)],
        ]
        winner, rounds = run_irv(ballots, {A, B, C})
        assert winner == A
        assert len(rounds) >= 2
        # Round 1: C eliminated (fewest first preferences)
        assert rounds[0]['eliminated'] == C

    def test_single_candidate(self):
        """Single candidate wins immediately."""
        ballots = [[(A, 1)]]
        winner, rounds = run_irv(ballots, {A})
        assert winner == A

    def test_all_equal_first_preferences(self):
        """When all candidates tied, one is eliminated deterministically."""
        ballots = [
            [(A, 1), (B, 2)],
            [(B, 1), (A, 2)],
        ]
        winner, rounds = run_irv(ballots, {A, B})
        # One must win — deterministic tiebreak via sorted order
        assert winner in {A, B}

    def test_empty_ballots(self):
        """Empty ballots with candidates — random selection."""
        winner, rounds = run_irv([], {A, B})
        assert winner in {A, B}

    def test_four_candidates_multi_round(self):
        """Four candidates requiring multiple elimination rounds."""
        ballots = [
            [(A, 1), (B, 2), (C, 3), (D, 4)],
            [(A, 1), (C, 2), (B, 3), (D, 4)],
            [(A, 1), (D, 2), (B, 3), (C, 4)],
            [(B, 1), (D, 2), (C, 3), (A, 4)],
            [(B, 1), (C, 2), (D, 3), (A, 4)],
            [(C, 1), (D, 2), (A, 3), (B, 4)],
            [(C, 1), (A, 2), (D, 3), (B, 4)],
            [(D, 1), (A, 2), (B, 3), (C, 4)],
        ]
        winner, rounds = run_irv(ballots, {A, B, C, D})
        assert winner is not None
        assert len(rounds) >= 2


class TestTallyResultsIntegration:
    """Tests for the tally_results orchestrator using mocked DB."""

    def _make_db(self, vr_row, candidate_rows, ballot_rows):
        """Create a mock DB that returns canned results."""
        db = MagicMock()
        call_count = [0]

        def mock_query(sql, params=None, fetchone=False):
            call_count[0] += 1
            sql_upper = sql.strip().upper()
            if 'WINNER_COUNT' in sql_upper and fetchone:
                return vr_row
            if 'VOTING_ROUND_CANDIDATE' in sql_upper and 'SELECT' in sql_upper:
                return candidate_rows
            if 'RCV_BALLOT' in sql_upper and 'RCV_RANKING' in sql_upper:
                return ballot_rows
            return None

        db.execute_query = mock_query
        return db

    def test_empty_candidates(self):
        """No candidates → empty results."""
        from candid.controllers.helpers.rcv_tally import tally_results

        db = self._make_db(
            vr_row={'winner_count': 1},
            candidate_rows=[],
            ballot_rows=[],
        )
        result = tally_results("vr-1", db)
        assert result['winners'] == []
        assert result['totalBallots'] == 0

    def test_condorcet_winner(self):
        """Three candidates, one clear Condorcet winner."""
        from candid.controllers.helpers.rcv_tally import tally_results
        import uuid

        candidates = [
            {'proposal_post_id': A, 'endorsement_count': 3, 'display_order': 0, 'title': 'Proposal A'},
            {'proposal_post_id': B, 'endorsement_count': 2, 'display_order': 1, 'title': 'Proposal B'},
            {'proposal_post_id': C, 'endorsement_count': 1, 'display_order': 2, 'title': 'Proposal C'},
        ]

        # 3 ballots: all rank A first
        b1, b2, b3 = 'bal-1', 'bal-2', 'bal-3'
        ballot_rows = [
            {'ballot_id': b1, 'proposal_post_id': A, 'rank': 1},
            {'ballot_id': b1, 'proposal_post_id': B, 'rank': 2},
            {'ballot_id': b2, 'proposal_post_id': A, 'rank': 1},
            {'ballot_id': b2, 'proposal_post_id': C, 'rank': 2},
            {'ballot_id': b3, 'proposal_post_id': A, 'rank': 1},
            {'ballot_id': b3, 'proposal_post_id': B, 'rank': 2},
        ]

        db = self._make_db(
            vr_row={'winner_count': 1},
            candidate_rows=candidates,
            ballot_rows=ballot_rows,
        )
        result = tally_results("vr-1", db)
        assert result['method'] == 'condorcet'
        assert len(result['winners']) == 1
        assert result['winners'][0]['proposalPostId'] == A
        assert result['totalBallots'] == 3

    def test_irv_fallback(self):
        """Cycle among candidates triggers IRV fallback."""
        from candid.controllers.helpers.rcv_tally import tally_results

        candidates = [
            {'proposal_post_id': A, 'endorsement_count': 2, 'display_order': 0, 'title': 'A'},
            {'proposal_post_id': B, 'endorsement_count': 2, 'display_order': 1, 'title': 'B'},
            {'proposal_post_id': C, 'endorsement_count': 2, 'display_order': 2, 'title': 'C'},
        ]

        # Rock-paper-scissors: A>B>C>A
        b1, b2, b3 = 'bal-1', 'bal-2', 'bal-3'
        ballot_rows = [
            {'ballot_id': b1, 'proposal_post_id': A, 'rank': 1},
            {'ballot_id': b1, 'proposal_post_id': B, 'rank': 2},
            {'ballot_id': b1, 'proposal_post_id': C, 'rank': 3},
            {'ballot_id': b2, 'proposal_post_id': B, 'rank': 1},
            {'ballot_id': b2, 'proposal_post_id': C, 'rank': 2},
            {'ballot_id': b2, 'proposal_post_id': A, 'rank': 3},
            {'ballot_id': b3, 'proposal_post_id': C, 'rank': 1},
            {'ballot_id': b3, 'proposal_post_id': A, 'rank': 2},
            {'ballot_id': b3, 'proposal_post_id': B, 'rank': 3},
        ]

        db = self._make_db(
            vr_row={'winner_count': 1},
            candidate_rows=candidates,
            ballot_rows=ballot_rows,
        )
        result = tally_results("vr-1", db)
        assert result['method'] == 'irv'
        assert len(result['winners']) == 1
        assert result['winners'][0]['proposalPostId'] in {A, B, C}

    def test_multi_winner(self):
        """Multi-winner election returns multiple winners."""
        from candid.controllers.helpers.rcv_tally import tally_results

        candidates = [
            {'proposal_post_id': A, 'endorsement_count': 3, 'display_order': 0, 'title': 'A'},
            {'proposal_post_id': B, 'endorsement_count': 2, 'display_order': 1, 'title': 'B'},
            {'proposal_post_id': C, 'endorsement_count': 1, 'display_order': 2, 'title': 'C'},
        ]

        b1, b2, b3 = 'bal-1', 'bal-2', 'bal-3'
        ballot_rows = [
            {'ballot_id': b1, 'proposal_post_id': A, 'rank': 1},
            {'ballot_id': b1, 'proposal_post_id': B, 'rank': 2},
            {'ballot_id': b1, 'proposal_post_id': C, 'rank': 3},
            {'ballot_id': b2, 'proposal_post_id': A, 'rank': 1},
            {'ballot_id': b2, 'proposal_post_id': B, 'rank': 2},
            {'ballot_id': b3, 'proposal_post_id': B, 'rank': 1},
            {'ballot_id': b3, 'proposal_post_id': A, 'rank': 2},
        ]

        db = self._make_db(
            vr_row={'winner_count': 2},
            candidate_rows=candidates,
            ballot_rows=ballot_rows,
        )
        result = tally_results("vr-1", db)
        assert len(result['winners']) == 2
        # A should win first (beats both pairwise), B should win second
        assert result['winners'][0]['rank'] == 1
        assert result['winners'][1]['rank'] == 2

    def test_no_voting_round(self):
        """Non-existent voting round returns None."""
        from candid.controllers.helpers.rcv_tally import tally_results

        db = MagicMock()
        db.execute_query = MagicMock(return_value=None)
        assert tally_results("nonexistent", db) is None


from unittest.mock import MagicMock
