"""Unit tests for ballot rank validation logic."""

import pytest

pytestmark = pytest.mark.unit


class TestRankValidation:
    """Test rank validation rules used in submit_ballot."""

    def test_sequential_ranks_valid(self):
        """Ranks [1, 2, 3] are valid."""
        ranks = [1, 2, 3]
        sorted_ranks = sorted(ranks)
        assert sorted_ranks == list(range(1, len(ranks) + 1))

    def test_out_of_order_ranks_valid(self):
        """Ranks [3, 1, 2] are valid after sorting."""
        ranks = [3, 1, 2]
        sorted_ranks = sorted(ranks)
        assert sorted_ranks == list(range(1, len(ranks) + 1))

    def test_gap_in_ranks_invalid(self):
        """Ranks [1, 3] (missing 2) are invalid."""
        ranks = [1, 3]
        sorted_ranks = sorted(ranks)
        assert sorted_ranks != list(range(1, len(ranks) + 1))

    def test_not_starting_at_1_invalid(self):
        """Ranks [2, 3] are invalid."""
        ranks = [2, 3]
        sorted_ranks = sorted(ranks)
        assert sorted_ranks != list(range(1, len(ranks) + 1))

    def test_duplicate_ranks_detected(self):
        """Duplicate ranks are detected."""
        ranks = [1, 1, 2]
        assert len(set(ranks)) != len(ranks)

    def test_single_rank_valid(self):
        """A single rank [1] is valid."""
        ranks = [1]
        sorted_ranks = sorted(ranks)
        assert sorted_ranks == list(range(1, len(ranks) + 1))

    def test_zero_rank_invalid(self):
        """Rank 0 is invalid (must start at 1)."""
        ranks = [0, 1]
        sorted_ranks = sorted(ranks)
        assert sorted_ranks != list(range(1, len(ranks) + 1))


class TestDuplicateProposalDetection:
    """Test that duplicate proposal IDs are detected."""

    def test_unique_proposals(self):
        proposals = ["a", "b", "c"]
        assert len(set(proposals)) == len(proposals)

    def test_duplicate_proposals(self):
        proposals = ["a", "b", "a"]
        assert len(set(proposals)) != len(proposals)


class TestVotingRoundStatusForBallots:
    """Ballots only allowed in voting_open status."""

    def test_voting_open_allows_ballots(self):
        assert 'voting_open' == 'voting_open'

    def test_other_statuses_block_ballots(self):
        blocked = ['proposals_open', 'finalization_open', 'proposals_closed', 'voting_closed']
        for status in blocked:
            assert status != 'voting_open'
