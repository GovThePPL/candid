"""Unit tests for chat_availability.py — matching logic."""

import random
import pytest
from datetime import datetime, date
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# _filter_by_likelihood
# ---------------------------------------------------------------------------

class TestFilterByLikelihood:
    def test_excludes_likelihood_zero(self):
        from candid.controllers.helpers.chat_availability import _filter_by_likelihood
        candidates = [{"user_id": "u1"}, {"user_id": "u2"}]
        likelihoods = {"u1": 0, "u2": 3}
        result = _filter_by_likelihood(candidates, likelihoods, {1: 0.20, 2: 0.50})
        assert len(result) == 1
        assert result[0]["user_id"] == "u2"

    def test_always_includes_likelihood_3_plus(self):
        from candid.controllers.helpers.chat_availability import _filter_by_likelihood
        candidates = [{"user_id": "u1"}, {"user_id": "u2"}]
        likelihoods = {"u1": 3, "u2": 5}
        result = _filter_by_likelihood(candidates, likelihoods, {1: 0.20, 2: 0.50})
        assert len(result) == 2

    def test_probability_threshold_for_low_likelihood(self):
        from candid.controllers.helpers.chat_availability import _filter_by_likelihood
        candidates = [{"user_id": f"u{i}"} for i in range(100)]
        likelihoods = {f"u{i}": 1 for i in range(100)}

        random.seed(42)
        result = _filter_by_likelihood(candidates, likelihoods, {1: 0.20, 2: 0.50})
        # With 20% threshold, roughly 20 of 100 should pass
        assert 5 < len(result) < 50

    def test_defaults_to_3_for_missing_users(self):
        from candid.controllers.helpers.chat_availability import _filter_by_likelihood
        candidates = [{"user_id": "u_unknown"}]
        likelihoods = {}  # missing
        result = _filter_by_likelihood(candidates, likelihoods, {1: 0.20})
        assert len(result) == 1  # default is 3, always included


# ---------------------------------------------------------------------------
# _pick_by_likelihood
# ---------------------------------------------------------------------------

class TestPickByLikelihood:
    def test_single_candidate(self):
        from candid.controllers.helpers.chat_availability import _pick_by_likelihood
        c = [{"user_id": "u1", "user_position_id": "up1"}]
        assert _pick_by_likelihood(c, {"u1": 3}) == c[0]

    def test_empty_returns_none(self):
        from candid.controllers.helpers.chat_availability import _pick_by_likelihood
        assert _pick_by_likelihood([], {}) is None

    def test_higher_likelihood_picked_more_often(self):
        from candid.controllers.helpers.chat_availability import _pick_by_likelihood
        candidates = [
            {"user_id": "heavy", "user_position_id": "up1"},
            {"user_id": "light", "user_position_id": "up2"},
        ]
        likelihoods = {"heavy": 5, "light": 1}

        random.seed(0)
        picks = {"heavy": 0, "light": 0}
        for _ in range(1000):
            pick = _pick_by_likelihood(candidates, likelihoods)
            picks[pick["user_id"]] += 1

        # heavy should be picked ~5x more often
        assert picks["heavy"] > picks["light"] * 2


# ---------------------------------------------------------------------------
# _is_notifiable
# ---------------------------------------------------------------------------

class TestIsNotifiable:
    def test_disabled_notifications(self):
        from candid.controllers.helpers.chat_availability import _is_notifiable
        row = {"notifications_enabled": False}
        assert _is_notifiable(row) is False

    def test_frequency_zero_cap(self):
        from candid.controllers.helpers.chat_availability import _is_notifiable
        row = {"notifications_enabled": True, "notification_frequency": 0}
        assert _is_notifiable(row) is False

    def test_under_daily_cap(self):
        from candid.controllers.helpers.chat_availability import _is_notifiable
        row = {
            "notifications_enabled": True,
            "notification_frequency": 3,
            "notifications_sent_today": 5,
            "notifications_sent_date": datetime.now().date(),
        }
        assert _is_notifiable(row) is True

    def test_over_daily_cap(self):
        from candid.controllers.helpers.chat_availability import _is_notifiable
        row = {
            "notifications_enabled": True,
            "notification_frequency": 3,  # cap = 10
            "notifications_sent_today": 10,
            "notifications_sent_date": datetime.now().date(),
        }
        assert _is_notifiable(row) is False

    def test_different_date_resets_counter(self):
        from candid.controllers.helpers.chat_availability import _is_notifiable
        row = {
            "notifications_enabled": True,
            "notification_frequency": 3,
            "notifications_sent_today": 999,
            "notifications_sent_date": date(2020, 1, 1),  # old date
        }
        assert _is_notifiable(row) is True

    def test_quiet_hours_simple_range(self):
        from candid.controllers.helpers.chat_availability import _is_notifiable
        # Mock current time to be during quiet hours
        row = {
            "notifications_enabled": True,
            "notification_frequency": 3,
            "notifications_sent_today": 0,
            "notifications_sent_date": None,
            "timezone": "UTC",
            "quiet_hours_start": 0,
            "quiet_hours_end": 23,  # quiet all day
        }
        # Current hour UTC will be within 0-23
        assert _is_notifiable(row) is False

    def test_no_quiet_hours(self):
        from candid.controllers.helpers.chat_availability import _is_notifiable
        row = {
            "notifications_enabled": True,
            "notification_frequency": 3,
            "notifications_sent_today": 0,
            "notifications_sent_date": None,
            "quiet_hours_start": None,
            "quiet_hours_end": None,
        }
        assert _is_notifiable(row) is True

    def test_quiet_hours_wrap_midnight(self):
        """Quiet hours 22-7 wraps midnight."""
        from candid.controllers.helpers.chat_availability import _is_notifiable
        with patch("candid.controllers.helpers.chat_availability.datetime") as mock_dt:
            from zoneinfo import ZoneInfo
            # Simulate it being 23:00 UTC
            mock_now = MagicMock()
            mock_now.hour = 23
            mock_dt.now = MagicMock(return_value=mock_now)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)

            row = {
                "notifications_enabled": True,
                "notification_frequency": 3,
                "notifications_sent_today": 0,
                "notifications_sent_date": None,
                "timezone": "UTC",
                "quiet_hours_start": 22,
                "quiet_hours_end": 7,
            }
            assert _is_notifiable(row) is False


# ---------------------------------------------------------------------------
# FREQUENCY_CAPS mapping
# ---------------------------------------------------------------------------

class TestFrequencyCaps:
    def test_all_levels_defined(self):
        from candid.controllers.helpers.chat_availability import FREQUENCY_CAPS
        for level in range(6):
            assert level in FREQUENCY_CAPS

    def test_zero_is_off(self):
        from candid.controllers.helpers.chat_availability import FREQUENCY_CAPS
        assert FREQUENCY_CAPS[0] == 0

    def test_five_is_effectively_unlimited(self):
        from candid.controllers.helpers.chat_availability import FREQUENCY_CAPS
        assert FREQUENCY_CAPS[5] > 100000


# ---------------------------------------------------------------------------
# Benchmarks
# ---------------------------------------------------------------------------

@pytest.mark.benchmark(group="filter_by_likelihood")
@pytest.mark.parametrize("n", [100, 500, 1000])
def test_bench_filter_by_likelihood(benchmark, n):
    from candid.controllers.helpers.chat_availability import _filter_by_likelihood
    random.seed(42)
    candidates = [{"user_id": f"u{i}"} for i in range(n)]
    likelihoods = {f"u{i}": random.randint(0, 5) for i in range(n)}
    benchmark(_filter_by_likelihood, candidates, likelihoods, {1: 0.20, 2: 0.50})
