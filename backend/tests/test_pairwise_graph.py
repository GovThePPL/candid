"""Unit tests for pairwise graph algorithms.

Pure algorithm tests — no server or database required.
"""

import sys
import os
import importlib
import pytest

# Import the module directly (bypassing controllers/__init__.py which needs the full app)
_module_path = os.path.join(
    os.path.dirname(__file__), "..", "server", "controllers", "helpers", "pairwise_graph.py"
)
_spec = importlib.util.spec_from_file_location("pairwise_graph", _module_path)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

build_preference_graph = _mod.build_preference_graph
compute_transitive_closure = _mod.compute_transitive_closure
find_cycles = _mod.find_cycles
is_complete = _mod.is_complete
get_unknown_pairs = _mod.get_unknown_pairs
compute_pair_entropy = _mod.compute_pair_entropy
select_next_pair = _mod.select_next_pair
build_victory_matrix = _mod.build_victory_matrix
find_condorcet_winner = _mod.find_condorcet_winner
ranked_pairs_ordering = _mod.ranked_pairs_ordering


class TestBuildPreferenceGraph:
    """Tests for build_preference_graph."""

    def test_empty_responses(self):
        items = ["a", "b", "c"]
        graph = build_preference_graph(items, [])
        assert graph == {"a": {}, "b": {}, "c": {}}

    def test_single_response(self):
        items = ["a", "b"]
        responses = [{"winner_item_id": "a", "loser_item_id": "b"}]
        graph = build_preference_graph(items, responses)
        assert graph["a"]["b"] is True
        assert "a" not in graph["b"]

    def test_multiple_responses(self):
        items = ["a", "b", "c"]
        responses = [
            {"winner_item_id": "a", "loser_item_id": "b"},
            {"winner_item_id": "b", "loser_item_id": "c"},
        ]
        graph = build_preference_graph(items, responses)
        assert graph["a"]["b"] is True
        assert graph["b"]["c"] is True
        assert "c" not in graph["a"]  # no direct edge yet

    def test_ignores_items_not_in_list(self):
        items = ["a", "b"]
        responses = [{"winner_item_id": "a", "loser_item_id": "x"}]
        graph = build_preference_graph(items, responses)
        assert graph == {"a": {}, "b": {}}


class TestTransitiveClosure:
    """Tests for compute_transitive_closure."""

    def test_chain_infers_transitive(self):
        """A>B and B>C implies A>C."""
        items = ["a", "b", "c"]
        graph = {"a": {"b": True}, "b": {"c": True}, "c": {}}
        closure = compute_transitive_closure(items, graph)
        assert closure["a"]["c"] is True

    def test_longer_chain(self):
        """A>B>C>D implies A>D."""
        items = ["a", "b", "c", "d"]
        graph = {"a": {"b": True}, "b": {"c": True}, "c": {"d": True}, "d": {}}
        closure = compute_transitive_closure(items, graph)
        assert closure["a"]["d"] is True
        assert closure["a"]["c"] is True
        assert closure["b"]["d"] is True

    def test_no_false_inferences(self):
        """Disconnected items remain unknown."""
        items = ["a", "b", "c", "d"]
        graph = {"a": {"b": True}, "b": {}, "c": {"d": True}, "d": {}}
        closure = compute_transitive_closure(items, graph)
        assert not closure["a"].get("c")
        assert not closure["a"].get("d")

    def test_empty_graph(self):
        items = ["a", "b"]
        graph = {"a": {}, "b": {}}
        closure = compute_transitive_closure(items, graph)
        assert closure == {"a": {}, "b": {}}


class TestFindCycles:
    """Tests for find_cycles."""

    def test_no_cycles(self):
        items = ["a", "b", "c"]
        graph = {"a": {"b": True}, "b": {"c": True}, "c": {}}
        cycles = find_cycles(items, graph)
        assert cycles == []

    def test_three_cycle(self):
        """A>B, B>C, C>A is a cycle."""
        items = ["a", "b", "c"]
        graph = {"a": {"b": True}, "b": {"c": True}, "c": {"a": True}}
        cycles = find_cycles(items, graph)
        assert len(cycles) == 1
        assert set(cycles[0]) == {"a", "b", "c"}

    def test_partial_cycle(self):
        """Cycle in subset, rest is acyclic."""
        items = ["a", "b", "c", "d"]
        graph = {
            "a": {"b": True},
            "b": {"c": True},
            "c": {"a": True},
            "d": {},
        }
        cycles = find_cycles(items, graph)
        assert len(cycles) == 1
        assert set(cycles[0]) == {"a", "b", "c"}

    def test_multiple_cycles(self):
        """Two independent cycles."""
        items = ["a", "b", "c", "d"]
        graph = {
            "a": {"b": True},
            "b": {"a": True},
            "c": {"d": True},
            "d": {"c": True},
        }
        cycles = find_cycles(items, graph)
        assert len(cycles) == 2


class TestIsComplete:
    """Tests for is_complete."""

    def test_complete_3_items(self):
        """Full ordering of 3 items is complete."""
        items = ["a", "b", "c"]
        closure = {"a": {"b": True, "c": True}, "b": {"c": True}, "c": {}}
        assert is_complete(items, closure, []) is True

    def test_missing_pair(self):
        items = ["a", "b", "c"]
        closure = {"a": {"b": True}, "b": {}, "c": {}}
        assert is_complete(items, closure, []) is False

    def test_not_complete_with_cycles(self):
        items = ["a", "b", "c"]
        closure = {"a": {"b": True, "c": True}, "b": {"c": True}, "c": {}}
        cycles = [["a", "b", "c"]]
        assert is_complete(items, closure, cycles) is False

    def test_single_item_is_complete(self):
        items = ["a"]
        closure = {"a": {}}
        assert is_complete(items, closure, []) is True

    def test_two_items_one_edge(self):
        items = ["a", "b"]
        closure = {"a": {"b": True}, "b": {}}
        assert is_complete(items, closure, []) is True


class TestGetUnknownPairs:
    """Tests for get_unknown_pairs."""

    def test_all_unknown(self):
        items = ["a", "b", "c"]
        closure = {"a": {}, "b": {}, "c": {}}
        unknown = get_unknown_pairs(items, closure)
        assert len(unknown) == 3

    def test_all_known(self):
        items = ["a", "b", "c"]
        closure = {"a": {"b": True, "c": True}, "b": {"c": True}, "c": {}}
        unknown = get_unknown_pairs(items, closure)
        assert len(unknown) == 0

    def test_partial(self):
        items = ["a", "b", "c"]
        closure = {"a": {"b": True}, "b": {}, "c": {}}
        unknown = get_unknown_pairs(items, closure)
        # a-c and b-c are unknown
        assert len(unknown) == 2


class TestComputePairEntropy:
    """Tests for compute_pair_entropy."""

    def test_fifty_fifty_is_max(self):
        """50/50 split = 1.0 entropy."""
        matrix = {"a": {"b": 5}, "b": {"a": 5}}
        result = compute_pair_entropy("a", "b", matrix)
        assert abs(result - 1.0) < 0.001

    def test_all_agree_is_zero(self):
        """100/0 split = 0.0 entropy."""
        matrix = {"a": {"b": 10}, "b": {}}
        result = compute_pair_entropy("a", "b", matrix)
        assert abs(result - 0.0) < 0.001

    def test_no_data_is_neutral(self):
        """No data = 0.5 (neutral)."""
        matrix = {"a": {}, "b": {}}
        result = compute_pair_entropy("a", "b", matrix)
        assert abs(result - 0.5) < 0.001

    def test_uneven_split(self):
        """75/25 split has entropy between 0 and 1."""
        matrix = {"a": {"b": 3}, "b": {"a": 1}}
        result = compute_pair_entropy("a", "b", matrix)
        assert 0.0 < result < 1.0


class TestSelectNextPair:
    """Tests for select_next_pair."""

    def test_returns_none_when_complete(self):
        items = ["a", "b", "c"]
        graph = {"a": {"b": True, "c": True}, "b": {"c": True}, "c": {}}
        closure = compute_transitive_closure(items, graph)
        cycles = find_cycles(items, graph)
        result = select_next_pair(items, graph, closure, cycles)
        assert result is None

    def test_returns_unknown_pair(self):
        items = ["a", "b", "c"]
        graph = {"a": {"b": True}, "b": {}, "c": {}}
        closure = compute_transitive_closure(items, graph)
        cycles = find_cycles(items, graph)
        result = select_next_pair(items, graph, closure, cycles)
        assert result is not None
        assert len(result) == 2

    def test_prioritizes_cycle_tiebreaker(self):
        """When cycles exist, returns an edge from the cycle."""
        items = ["a", "b", "c"]
        graph = {"a": {"b": True}, "b": {"c": True}, "c": {"a": True}}
        closure = compute_transitive_closure(items, graph)
        cycles = find_cycles(items, graph)
        assert len(cycles) > 0
        result = select_next_pair(items, graph, closure, cycles)
        assert result is not None
        # Result should be from the cycle
        cycle_set = set(cycles[0])
        assert result[0] in cycle_set and result[1] in cycle_set

    def test_with_group_matrix_prefers_high_entropy(self):
        """With group_matrix, pairs with higher entropy score better."""
        items = ["a", "b", "c", "d"]
        graph = {"a": {}, "b": {}, "c": {}, "d": {}}
        closure = compute_transitive_closure(items, graph)
        cycles = find_cycles(items, graph)

        # Group matrix: a-b is 50/50 (high entropy), c-d is 100/0 (low entropy)
        group_matrix = {
            "a": {"b": 5, "c": 3, "d": 3},
            "b": {"a": 5, "c": 3, "d": 3},
            "c": {"d": 10, "a": 3, "b": 3},
            "d": {"a": 3, "b": 3},
        }

        result = select_next_pair(items, graph, closure, cycles, group_matrix=group_matrix)
        assert result is not None


class TestBuildVictoryMatrix:
    """Tests for build_victory_matrix."""

    def test_counts_wins_correctly(self):
        items = ["a", "b"]
        responses = [
            {"winner_item_id": "a", "loser_item_id": "b"},
            {"winner_item_id": "a", "loser_item_id": "b"},
            {"winner_item_id": "b", "loser_item_id": "a"},
        ]
        matrix = build_victory_matrix(items, responses)
        assert matrix["a"]["b"] == 2
        assert matrix["b"]["a"] == 1

    def test_empty_responses(self):
        items = ["a", "b"]
        matrix = build_victory_matrix(items, [])
        assert matrix["a"]["b"] == 0
        assert matrix["b"]["a"] == 0

    def test_multiple_items(self):
        items = ["a", "b", "c"]
        responses = [
            {"winner_item_id": "a", "loser_item_id": "b"},
            {"winner_item_id": "b", "loser_item_id": "c"},
            {"winner_item_id": "a", "loser_item_id": "c"},
        ]
        matrix = build_victory_matrix(items, responses)
        assert matrix["a"]["b"] == 1
        assert matrix["b"]["c"] == 1
        assert matrix["a"]["c"] == 1


class TestFindCondorcetWinner:
    """Tests for find_condorcet_winner."""

    def test_clear_winner(self):
        """Item that beats all others."""
        items = ["a", "b", "c"]
        matrix = {
            "a": {"b": 3, "c": 3},
            "b": {"a": 1, "c": 3},
            "c": {"a": 1, "b": 1},
        }
        assert find_condorcet_winner(items, matrix) == "a"

    def test_no_winner_rock_paper_scissors(self):
        """Cycle: A>B, B>C, C>A — no Condorcet winner."""
        items = ["a", "b", "c"]
        matrix = {
            "a": {"b": 3, "c": 1},
            "b": {"a": 1, "c": 3},
            "c": {"a": 3, "b": 1},
        }
        assert find_condorcet_winner(items, matrix) is None

    def test_incomplete_data_no_winner(self):
        """If any pair has 0 comparisons, can't have a Condorcet winner unless wins>0."""
        items = ["a", "b", "c"]
        matrix = {
            "a": {"b": 3},
            "b": {"a": 1},
            "c": {},
        }
        # a beats b, but no data for a-c or b-c
        # a has wins=0 against c, losses=0 from c → wins(0) <= losses(0), not strict majority
        assert find_condorcet_winner(items, matrix) is None

    def test_tie_no_winner(self):
        """Tied items don't produce a winner."""
        items = ["a", "b"]
        matrix = {"a": {"b": 3}, "b": {"a": 3}}
        assert find_condorcet_winner(items, matrix) is None


class TestRankedPairs:
    """Tests for ranked_pairs_ordering."""

    def test_simple_ordering(self):
        """Clear preference: A>B>C."""
        items = ["a", "b", "c"]
        matrix = {
            "a": {"b": 3, "c": 3},
            "b": {"a": 1, "c": 3},
            "c": {"a": 1, "b": 1},
        }
        ordering = ranked_pairs_ordering(items, matrix)
        assert ordering == ["a", "b", "c"]

    def test_cycle_resolution(self):
        """Ranked Pairs resolves cycle by locking strongest edges first."""
        items = ["a", "b", "c"]
        # A beats B by 5, B beats C by 3, C beats A by 1
        # Strongest: A>B (margin 5), then B>C (margin 3), C>A (margin 1) skipped (cycle)
        matrix = {
            "a": {"b": 5, "c": 0},
            "b": {"a": 0, "c": 3},
            "c": {"a": 1, "b": 0},
        }
        ordering = ranked_pairs_ordering(items, matrix)
        # A>B locked, B>C locked, C>A skipped → A first, B second, C third
        assert ordering[0] == "a"
        assert ordering[1] == "b"
        assert ordering[2] == "c"

    def test_empty_items(self):
        assert ranked_pairs_ordering([], {}) == []

    def test_single_item(self):
        items = ["a"]
        matrix = {"a": {}}
        assert ranked_pairs_ordering(items, matrix) == ["a"]

    def test_all_tied(self):
        """All pairs tied — returns items in stable order."""
        items = ["a", "b", "c"]
        matrix = {
            "a": {"b": 2, "c": 2},
            "b": {"a": 2, "c": 2},
            "c": {"a": 2, "b": 2},
        }
        ordering = ranked_pairs_ordering(items, matrix)
        # All tied, no edges locked, should return in sorted order
        assert len(ordering) == 3
        assert set(ordering) == {"a", "b", "c"}
