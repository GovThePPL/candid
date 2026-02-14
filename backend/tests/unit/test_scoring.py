"""Unit tests for scoring.py — pure math, no mocks needed."""

import math
from datetime import datetime, timezone, timedelta

import pytest

from candid.controllers.helpers.scoring import (
    wilson_score,
    hot_score,
    controversial_score,
    vote_weight,
    ideological_distance,
    compute_max_distance,
)

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# wilson_score
# ---------------------------------------------------------------------------

class TestWilsonScore:
    def test_zero_votes(self):
        assert wilson_score(0, 0) == 0.0

    def test_all_upvotes(self):
        score = wilson_score(10, 0)
        assert 0.0 < score <= 1.0
        # With 10 upvotes and 0 downvotes, should be high
        assert score > 0.7

    def test_all_downvotes(self):
        score = wilson_score(0, 10)
        assert score < 0.1

    def test_mixed_votes(self):
        score = wilson_score(7, 3)
        assert 0.0 < score < 1.0
        # 70% positive should score moderately
        assert 0.3 < score < 0.9

    def test_more_votes_tighter_confidence(self):
        """More votes -> score closer to the true proportion."""
        score_10 = wilson_score(7, 3)     # 70% positive, 10 votes
        score_100 = wilson_score(70, 30)  # 70% positive, 100 votes
        # Both have same proportion, but 100 votes is more confident
        assert score_100 > score_10

    def test_weighted_equivalence(self):
        """Weighted and unweighted produce same result with weight=1."""
        score_unweighted = wilson_score(5, 5)
        score_weighted = wilson_score(5.0, 5.0)
        assert score_unweighted == score_weighted

    def test_higher_weighted_upvotes_score_higher(self):
        """Cross-ideology upvotes (higher weight) should score higher."""
        score_normal = wilson_score(5.0, 2.0)       # raw count weights
        score_bridging = wilson_score(8.5, 2.0)      # bridging-weighted upvotes
        assert score_bridging > score_normal

    def test_single_vote(self):
        score = wilson_score(1, 0)
        assert 0.0 < score < 1.0
        # Single vote should have low confidence
        assert score < 0.5

    def test_custom_z_score(self):
        """Higher z (wider CI) produces lower Wilson score."""
        score_default = wilson_score(7, 3, z=1.96)
        score_wide = wilson_score(7, 3, z=2.576)  # 99% CI
        assert score_wide < score_default

    def test_custom_z_zero(self):
        """z=0 should produce the raw proportion."""
        score = wilson_score(7, 3, z=0.0)
        assert abs(score - 0.7) < 1e-9


# ---------------------------------------------------------------------------
# hot_score
# ---------------------------------------------------------------------------

class TestHotScore:
    def _now(self):
        return datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)

    def test_time_decay(self):
        """Older posts should score lower."""
        now = self._now()
        recent = now - timedelta(hours=1)
        older = now - timedelta(hours=24)

        score_recent = hot_score(10, 0, recent, now=now)
        score_older = hot_score(10, 0, older, now=now)
        assert score_recent > score_older

    def test_negative_score(self):
        """Posts with more downvotes than upvotes get negative hot score."""
        now = self._now()
        created = now - timedelta(hours=1)
        score = hot_score(2, 10, created, now=now)
        assert score < 0

    def test_zero_score(self):
        """Zero net score should produce zero hot score."""
        now = self._now()
        created = now - timedelta(hours=1)
        score = hot_score(5, 5, created, now=now)
        assert score == 0.0

    def test_no_votes(self):
        """No votes should produce zero hot score."""
        now = self._now()
        created = now - timedelta(hours=1)
        score = hot_score(0, 0, created, now=now)
        assert score == 0.0

    def test_bridging_boost(self):
        """Higher weights (bridging) should produce higher hot scores."""
        now = self._now()
        created = now - timedelta(hours=2)

        # Same "5 upvotes" but bridging votes have higher total weight
        score_normal = hot_score(5.0, 0, created, now=now)
        score_bridging = hot_score(8.5, 0, created, now=now)
        assert score_bridging > score_normal

    def test_logarithmic_scaling(self):
        """Vote impact is logarithmic (first 10 ~ next 100)."""
        now = self._now()
        created = now - timedelta(hours=1)

        score_10 = hot_score(10, 0, created, now=now)
        score_100 = hot_score(100, 0, created, now=now)

        # 100 votes should NOT be 10x the score of 10 votes
        assert score_100 < score_10 * 5
        # But should be more
        assert score_100 > score_10

    def test_naive_datetime(self):
        """Naive datetimes should be handled (treated as UTC)."""
        now = datetime(2026, 1, 15, 12, 0, 0)
        created = datetime(2026, 1, 15, 10, 0, 0)
        score = hot_score(10, 0, created, now=now)
        assert score > 0

    def test_custom_gravity(self):
        """Higher gravity -> faster time decay."""
        now = self._now()
        created = now - timedelta(hours=6)
        score_low_g = hot_score(10, 0, created, now=now, gravity=1.0)
        score_high_g = hot_score(10, 0, created, now=now, gravity=2.5)
        assert score_low_g > score_high_g

    def test_zero_gravity(self):
        """Gravity=0 means no time decay (score stays constant)."""
        now = self._now()
        recent = now - timedelta(hours=1)
        older = now - timedelta(hours=100)
        score_recent = hot_score(10, 0, recent, now=now, gravity=0.0)
        score_older = hot_score(10, 0, older, now=now, gravity=0.0)
        # Without gravity, both have same sign*order; denominator is (h+2)^0 = 1
        assert abs(score_recent - score_older) < 1e-9


# ---------------------------------------------------------------------------
# controversial_score
# ---------------------------------------------------------------------------

class TestControversialScore:
    def test_even_split_high(self):
        """Evenly split high-engagement should score high."""
        score = controversial_score(50, 50)
        assert score == 100.0

    def test_lopsided_low(self):
        """Lopsided votes should score lower."""
        even = controversial_score(50, 50)
        lopsided = controversial_score(90, 10)
        assert even > lopsided

    def test_zero_votes(self):
        assert controversial_score(0, 0) == 0.0

    def test_one_sided(self):
        """Completely one-sided should still score > 0 (balance = 0)."""
        score = controversial_score(10, 0)
        assert score == 0.0

    def test_more_engagement_higher_score(self):
        """Same balance ratio but more votes = higher controversial score."""
        small = controversial_score(5, 5)
        large = controversial_score(50, 50)
        assert large > small


# ---------------------------------------------------------------------------
# vote_weight
# ---------------------------------------------------------------------------

class TestVoteWeight:
    def test_same_coords(self):
        """Same position -> minimum weight (1.0)."""
        a = {"x": 1.0, "y": 2.0}
        b = {"x": 1.0, "y": 2.0}
        assert vote_weight(a, b, 5.0, weight_min=1.0, weight_max=2.0) == 1.0

    def test_max_distance(self):
        """At max distance -> weight 2.0."""
        a = {"x": 0.0, "y": 0.0}
        b = {"x": 3.0, "y": 4.0}  # distance = 5.0
        w = vote_weight(a, b, 5.0, weight_min=1.0, weight_max=2.0)
        assert abs(w - 2.0) < 1e-9

    def test_partial_distance(self):
        """Partial distance -> weight between 1.0 and 2.0."""
        a = {"x": 0.0, "y": 0.0}
        b = {"x": 1.5, "y": 2.0}  # distance = 2.5, max_distance = 5.0
        w = vote_weight(a, b, 5.0, weight_min=1.0, weight_max=2.0)
        assert 1.0 < w < 2.0
        assert abs(w - 1.5) < 1e-9

    def test_beyond_max_distance_capped(self):
        """Distance exceeding max_distance is capped at 2.0."""
        a = {"x": 0.0, "y": 0.0}
        b = {"x": 10.0, "y": 0.0}  # distance = 10, max = 5
        w = vote_weight(a, b, 5.0, weight_min=1.0, weight_max=2.0)
        assert abs(w - 2.0) < 1e-9

    def test_no_voter_coords_fallback(self):
        """None voter coords -> weight_min (cold start)."""
        assert vote_weight(None, {"x": 1, "y": 2}, 5.0, weight_min=1.0, weight_max=2.0) == 1.0

    def test_no_author_coords_fallback(self):
        """None author coords -> weight_min (cold start)."""
        assert vote_weight({"x": 1, "y": 2}, None, 5.0, weight_min=1.0, weight_max=2.0) == 1.0

    def test_no_max_distance_fallback(self):
        """None max_distance -> weight_min (< 2 clusters)."""
        a = {"x": 0.0, "y": 0.0}
        b = {"x": 3.0, "y": 4.0}
        assert vote_weight(a, b, None, weight_min=1.0, weight_max=2.0) == 1.0

    def test_zero_max_distance_fallback(self):
        """Zero max_distance -> weight_min (degenerate)."""
        a = {"x": 0.0, "y": 0.0}
        b = {"x": 3.0, "y": 4.0}
        assert vote_weight(a, b, 0, weight_min=1.0, weight_max=2.0) == 1.0

    def test_custom_weight_range(self):
        """Custom min/max range (0.5 to 3.0)."""
        a = {"x": 0.0, "y": 0.0}
        b = {"x": 3.0, "y": 4.0}  # distance = 5.0 = max_distance
        w = vote_weight(a, b, 5.0, weight_min=0.5, weight_max=3.0)
        assert abs(w - 3.0) < 1e-9

    def test_custom_weight_range_partial(self):
        """Custom range, partial distance: 50% of (0.5 -> 3.0) = 1.75."""
        a = {"x": 0.0, "y": 0.0}
        b = {"x": 1.5, "y": 2.0}  # distance = 2.5, max = 5.0 => 50%
        w = vote_weight(a, b, 5.0, weight_min=0.5, weight_max=3.0)
        assert abs(w - 1.75) < 1e-9

    def test_cold_start_custom_min(self):
        """Cold start returns custom weight_min."""
        assert vote_weight(None, None, None, weight_min=0.5, weight_max=3.0) == 0.5


# ---------------------------------------------------------------------------
# ideological_distance
# ---------------------------------------------------------------------------

class TestIdeologicalDistance:
    def test_zero_distance(self):
        a = {"x": 1.0, "y": 2.0}
        assert ideological_distance(a, a) == 0.0

    def test_known_triangle(self):
        """3-4-5 right triangle."""
        a = {"x": 0.0, "y": 0.0}
        b = {"x": 3.0, "y": 4.0}
        assert abs(ideological_distance(a, b) - 5.0) < 1e-9

    def test_symmetry(self):
        a = {"x": 1.0, "y": 2.0}
        b = {"x": 4.0, "y": 6.0}
        assert ideological_distance(a, b) == ideological_distance(b, a)

    def test_negative_coords(self):
        a = {"x": -3.0, "y": -4.0}
        b = {"x": 0.0, "y": 0.0}
        assert abs(ideological_distance(a, b) - 5.0) < 1e-9


# ---------------------------------------------------------------------------
# compute_max_distance
# ---------------------------------------------------------------------------

class TestComputeMaxDistance:
    def test_two_clusters(self):
        clusters = {"x": [0.0, 3.0], "y": [0.0, 4.0]}
        d = compute_max_distance(clusters)
        assert abs(d - 5.0) < 1e-9

    def test_three_clusters(self):
        """Max distance among 3 clusters."""
        clusters = {"x": [0.0, 3.0, 6.0], "y": [0.0, 0.0, 0.0]}
        d = compute_max_distance(clusters)
        assert abs(d - 6.0) < 1e-9

    def test_single_cluster_none(self):
        clusters = {"x": [1.0], "y": [2.0]}
        assert compute_max_distance(clusters) is None

    def test_empty_clusters_none(self):
        assert compute_max_distance({"x": [], "y": []}) is None
        assert compute_max_distance({}) is None

    def test_coincident_clusters_none(self):
        """All clusters at same point -> max_distance 0 -> None."""
        clusters = {"x": [1.0, 1.0], "y": [2.0, 2.0]}
        assert compute_max_distance(clusters) is None

    def test_mismatched_lengths(self):
        """Uses min(len(x), len(y))."""
        clusters = {"x": [0.0, 3.0, 999.0], "y": [0.0, 4.0]}
        d = compute_max_distance(clusters)
        assert abs(d - 5.0) < 1e-9
