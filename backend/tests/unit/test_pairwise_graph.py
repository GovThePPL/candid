"""Unit tests for pairwise_graph.py — pure graph algorithms, no mocks needed."""

import math
import pytest
from collections import defaultdict

from candid.controllers.helpers.pairwise_graph import (
    build_preference_graph,
    compute_transitive_closure,
    find_cycles,
    is_complete,
    get_unknown_pairs,
    compute_pair_entropy,
    select_next_pair,
    build_victory_matrix,
    find_condorcet_winner,
    ranked_pairs_ordering,
    _topological_sort,
)

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# build_preference_graph
# ---------------------------------------------------------------------------

class TestBuildPreferenceGraph:
    def test_basic(self):
        items = ["A", "B", "C"]
        responses = [{"winner_item_id": "A", "loser_item_id": "B"}]
        g = build_preference_graph(items, responses)
        assert g["A"]["B"] is True
        assert "B" not in g["B"]  # B didn't beat anything

    def test_empty_responses(self):
        g = build_preference_graph(["A", "B"], [])
        assert g == {"A": {}, "B": {}}

    def test_ignores_unknown_items(self):
        g = build_preference_graph(["A", "B"], [{"winner_item_id": "X", "loser_item_id": "A"}])
        assert g == {"A": {}, "B": {}}

    def test_multiple_responses(self):
        items = ["A", "B", "C"]
        responses = [
            {"winner_item_id": "A", "loser_item_id": "B"},
            {"winner_item_id": "B", "loser_item_id": "C"},
            {"winner_item_id": "A", "loser_item_id": "C"},
        ]
        g = build_preference_graph(items, responses)
        assert g["A"]["B"] is True
        assert g["A"]["C"] is True
        assert g["B"]["C"] is True

    def test_str_coercion(self):
        """winner/loser IDs are coerced to str."""
        items = ["1", "2"]
        g = build_preference_graph(items, [{"winner_item_id": 1, "loser_item_id": 2}])
        assert g["1"]["2"] is True


# ---------------------------------------------------------------------------
# compute_transitive_closure
# ---------------------------------------------------------------------------

class TestTransitiveClosure:
    def test_simple_chain(self):
        items = ["A", "B", "C"]
        graph = {"A": {"B": True}, "B": {"C": True}, "C": {}}
        closure = compute_transitive_closure(items, graph)
        assert closure["A"]["C"] is True  # transitive: A>B>C => A>C

    def test_no_transitive_edges(self):
        items = ["A", "B", "C"]
        graph = {"A": {"B": True}, "B": {}, "C": {}}
        closure = compute_transitive_closure(items, graph)
        assert "C" not in closure["A"]

    def test_does_not_mutate_input(self):
        items = ["A", "B", "C"]
        graph = {"A": {"B": True}, "B": {"C": True}, "C": {}}
        original_a = dict(graph["A"])
        compute_transitive_closure(items, graph)
        assert graph["A"] == original_a

    def test_long_chain(self):
        items = [str(i) for i in range(5)]
        graph = {items[i]: {items[i + 1]: True} for i in range(4)}
        graph[items[4]] = {}
        closure = compute_transitive_closure(items, graph)
        # First should beat last
        assert closure["0"]["4"] is True


# ---------------------------------------------------------------------------
# find_cycles (Tarjan's SCC)
# ---------------------------------------------------------------------------

class TestFindCycles:
    def test_no_cycles(self):
        items = ["A", "B", "C"]
        graph = {"A": {"B": True}, "B": {"C": True}, "C": {}}
        assert find_cycles(items, graph) == []

    def test_simple_cycle(self):
        items = ["A", "B", "C"]
        graph = {"A": {"B": True}, "B": {"C": True}, "C": {"A": True}}
        cycles = find_cycles(items, graph)
        assert len(cycles) == 1
        assert set(cycles[0]) == {"A", "B", "C"}

    def test_two_node_cycle(self):
        items = ["A", "B"]
        graph = {"A": {"B": True}, "B": {"A": True}}
        cycles = find_cycles(items, graph)
        assert len(cycles) == 1
        assert set(cycles[0]) == {"A", "B"}

    def test_no_items(self):
        assert find_cycles([], {}) == []

    def test_disconnected_graph(self):
        items = ["A", "B", "C", "D"]
        graph = {"A": {"B": True}, "B": {}, "C": {"D": True}, "D": {}}
        assert find_cycles(items, graph) == []


# ---------------------------------------------------------------------------
# is_complete / get_unknown_pairs
# ---------------------------------------------------------------------------

class TestCompleteness:
    def test_complete_ordering(self):
        items = ["A", "B", "C"]
        closure = {"A": {"B": True, "C": True}, "B": {"C": True}, "C": {}}
        assert is_complete(items, closure, []) is True

    def test_incomplete_ordering(self):
        items = ["A", "B", "C"]
        closure = {"A": {"B": True}, "B": {}, "C": {}}
        assert is_complete(items, closure, []) is False

    def test_not_complete_with_cycles(self):
        items = ["A", "B"]
        closure = {"A": {"B": True}, "B": {"A": True}}
        assert is_complete(items, closure, [["A", "B"]]) is False

    def test_get_unknown_pairs(self):
        items = ["A", "B", "C"]
        closure = {"A": {"B": True}, "B": {}, "C": {}}
        unknown = get_unknown_pairs(items, closure)
        # A vs C unknown, B vs C unknown
        assert ("A", "C") in unknown
        assert ("B", "C") in unknown
        assert ("A", "B") not in unknown

    def test_no_unknown_pairs(self):
        items = ["A", "B"]
        closure = {"A": {"B": True}, "B": {}}
        assert get_unknown_pairs(items, closure) == []


# ---------------------------------------------------------------------------
# compute_pair_entropy
# ---------------------------------------------------------------------------

class TestComputePairEntropy:
    def test_no_data_returns_neutral(self):
        assert compute_pair_entropy("A", "B", {}) == 0.5

    def test_all_agree_returns_zero(self):
        matrix = {"A": defaultdict(int, {"B": 10}), "B": defaultdict(int)}
        assert compute_pair_entropy("A", "B", matrix) == 0.0

    def test_split_returns_one(self):
        matrix = {"A": defaultdict(int, {"B": 5}), "B": defaultdict(int, {"A": 5})}
        entropy = compute_pair_entropy("A", "B", matrix)
        assert abs(entropy - 1.0) < 0.001

    def test_entropy_bounds(self):
        """Entropy should always be in [0.0, 1.0]."""
        for a_wins in range(0, 11):
            b_wins = 10 - a_wins
            matrix = {"A": defaultdict(int, {"B": a_wins}), "B": defaultdict(int, {"A": b_wins})}
            e = compute_pair_entropy("A", "B", matrix)
            assert 0.0 <= e <= 1.0

    def test_symmetry(self):
        """entropy(A,B) == entropy(B,A)."""
        matrix = {"A": defaultdict(int, {"B": 7}), "B": defaultdict(int, {"A": 3})}
        assert compute_pair_entropy("A", "B", matrix) == compute_pair_entropy("B", "A", matrix)


# ---------------------------------------------------------------------------
# select_next_pair
# ---------------------------------------------------------------------------

class TestSelectNextPair:
    def test_returns_none_when_complete(self):
        items = ["A", "B"]
        graph = {"A": {"B": True}, "B": {}}
        closure = {"A": {"B": True}, "B": {}}
        result = select_next_pair(items, graph, closure, [])
        assert result is None

    def test_returns_pair_when_incomplete(self):
        items = ["A", "B", "C"]
        graph = {"A": {"B": True}, "B": {}, "C": {}}
        closure = {"A": {"B": True}, "B": {}, "C": {}}
        result = select_next_pair(items, graph, closure, [])
        assert result is not None
        assert len(result) == 2

    def test_cycle_tiebreaker(self):
        items = ["A", "B", "C"]
        graph = {"A": {"B": True}, "B": {"C": True}, "C": {"A": True}}
        closure = compute_transitive_closure(items, graph)
        cycles = find_cycles(items, graph)
        result = select_next_pair(items, graph, closure, cycles)
        # Should return a pair from within the cycle
        assert result is not None
        assert result[0] in items and result[1] in items

    def test_with_group_matrix(self):
        items = ["A", "B", "C"]
        graph = {"A": {}, "B": {}, "C": {}}
        closure = {"A": {}, "B": {}, "C": {}}
        group_matrix = {"A": defaultdict(int, {"B": 5}), "B": defaultdict(int, {"A": 5}), "C": defaultdict(int)}
        result = select_next_pair(items, graph, closure, [], group_matrix)
        assert result is not None


# ---------------------------------------------------------------------------
# build_victory_matrix
# ---------------------------------------------------------------------------

class TestBuildVictoryMatrix:
    def test_basic(self):
        items = ["A", "B"]
        responses = [
            {"winner_item_id": "A", "loser_item_id": "B"},
            {"winner_item_id": "A", "loser_item_id": "B"},
            {"winner_item_id": "B", "loser_item_id": "A"},
        ]
        matrix = build_victory_matrix(items, responses)
        assert matrix["A"]["B"] == 2
        assert matrix["B"]["A"] == 1

    def test_empty(self):
        matrix = build_victory_matrix(["A", "B"], [])
        assert matrix["A"]["B"] == 0


# ---------------------------------------------------------------------------
# find_condorcet_winner
# ---------------------------------------------------------------------------

class TestFindCondorcetWinner:
    def test_clear_winner(self):
        items = ["A", "B", "C"]
        matrix = {
            "A": defaultdict(int, {"B": 3, "C": 3}),
            "B": defaultdict(int, {"A": 1, "C": 3}),
            "C": defaultdict(int, {"A": 1, "B": 1}),
        }
        assert find_condorcet_winner(items, matrix) == "A"

    def test_no_winner(self):
        items = ["A", "B", "C"]
        matrix = {
            "A": defaultdict(int, {"B": 3, "C": 1}),
            "B": defaultdict(int, {"A": 1, "C": 3}),
            "C": defaultdict(int, {"A": 3, "B": 1}),
        }
        assert find_condorcet_winner(items, matrix) is None

    def test_tied(self):
        items = ["A", "B"]
        matrix = {"A": defaultdict(int, {"B": 5}), "B": defaultdict(int, {"A": 5})}
        assert find_condorcet_winner(items, matrix) is None


# ---------------------------------------------------------------------------
# ranked_pairs_ordering
# ---------------------------------------------------------------------------

class TestRankedPairsOrdering:
    def test_empty(self):
        assert ranked_pairs_ordering([], {}) == []

    def test_single_item(self):
        assert ranked_pairs_ordering(["A"], {}) == ["A"]

    def test_clear_ordering(self):
        items = ["A", "B", "C"]
        matrix = {
            "A": defaultdict(int, {"B": 5, "C": 5}),
            "B": defaultdict(int, {"C": 5}),
            "C": defaultdict(int),
        }
        order = ranked_pairs_ordering(items, matrix)
        assert order.index("A") < order.index("B") < order.index("C")

    def test_cycle_breaking(self):
        """Ranked pairs should break cycles by margin strength."""
        items = ["A", "B", "C"]
        matrix = {
            "A": defaultdict(int, {"B": 7, "C": 3}),
            "B": defaultdict(int, {"A": 3, "C": 5}),
            "C": defaultdict(int, {"A": 5, "B": 3}),
        }
        order = ranked_pairs_ordering(items, matrix)
        # Should produce a valid total ordering despite the cycle
        assert len(order) == 3
        assert set(order) == {"A", "B", "C"}

    def test_isolated_items_at_bottom(self):
        items = ["A", "B", "C"]
        # C has no comparisons
        matrix = {
            "A": defaultdict(int, {"B": 5}),
            "B": defaultdict(int),
            "C": defaultdict(int),
        }
        order = ranked_pairs_ordering(items, matrix)
        assert order[-1] == "C"


# ---------------------------------------------------------------------------
# _topological_sort
# ---------------------------------------------------------------------------

class TestTopologicalSort:
    def test_linear_chain(self):
        items = ["A", "B", "C"]
        graph = {"A": {"B"}, "B": {"C"}, "C": set()}
        result = _topological_sort(items, graph)
        assert result == ["A", "B", "C"]

    def test_tiebreaking_by_wins(self):
        items = ["A", "B", "C"]
        graph = {"A": {"C"}, "B": {"C"}, "C": set()}
        matrix = {
            "A": defaultdict(int, {"C": 10}),
            "B": defaultdict(int, {"C": 2}),
            "C": defaultdict(int),
        }
        result = _topological_sort(items, graph, matrix)
        # A has more wins so should come before B
        assert result.index("A") < result.index("B")


# ---------------------------------------------------------------------------
# Benchmarks (only run with --benchmark-only)
# ---------------------------------------------------------------------------

def _make_items(n):
    return [str(i) for i in range(n)]


def _make_chain_graph(items):
    graph = {items[i]: {items[i + 1]: True} for i in range(len(items) - 1)}
    graph[items[-1]] = {}
    return graph


def _make_random_matrix(items):
    import random
    random.seed(42)
    matrix = {item: defaultdict(int) for item in items}
    for i, a in enumerate(items):
        for b in items[i + 1:]:
            matrix[a][b] = random.randint(0, 10)
            matrix[b][a] = random.randint(0, 10)
    return matrix


@pytest.mark.benchmark(group="transitive_closure")
@pytest.mark.parametrize("n", [10, 50, 100])
def test_bench_transitive_closure(benchmark, n):
    items = _make_items(n)
    graph = _make_chain_graph(items)
    benchmark(compute_transitive_closure, items, graph)


@pytest.mark.benchmark(group="ranked_pairs")
@pytest.mark.parametrize("n", [10, 25, 50, 100])
def test_bench_ranked_pairs(benchmark, n):
    items = _make_items(n)
    matrix = _make_random_matrix(items)
    benchmark(ranked_pairs_ordering, items, matrix)


@pytest.mark.benchmark(group="find_cycles")
@pytest.mark.parametrize("n", [10, 50, 100])
def test_bench_find_cycles_dense(benchmark, n):
    """Dense graph: every adjacent pair has a bidirectional edge."""
    items = _make_items(n)
    graph = {item: {} for item in items}
    for i in range(n - 1):
        graph[items[i]][items[i + 1]] = True
        graph[items[i + 1]][items[i]] = True
    benchmark(find_cycles, items, graph)


@pytest.mark.benchmark(group="select_next_pair")
@pytest.mark.parametrize("n", [10, 50])
def test_bench_select_next_pair(benchmark, n):
    items = _make_items(n)
    graph = {item: {} for item in items}
    closure = {item: {} for item in items}
    benchmark(select_next_pair, items, graph, closure, [])
