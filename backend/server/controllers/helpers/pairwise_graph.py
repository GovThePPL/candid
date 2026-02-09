"""Graph algorithms for smart pairwise comparisons.

Pure functions (no DB access) operating on item ID lists and response dicts.
Used by cards_controller for smart pair selection and surveys_controller for
Ranked Pairs rankings.
"""

import math
from collections import defaultdict, deque


# ---------------------------------------------------------------------------
# Single-user functions (for card generation)
# ---------------------------------------------------------------------------

def build_preference_graph(items, responses):
    """Build directed adjacency dict from pairwise responses.

    :param items: list of item ID strings
    :param responses: list of dicts with 'winner_item_id' and 'loser_item_id'
    :returns: dict where graph[winner][loser] = True
    """
    item_set = set(items)
    graph = {item: {} for item in items}
    for r in responses:
        w = str(r["winner_item_id"])
        l = str(r["loser_item_id"])
        if w in item_set and l in item_set:
            graph[w][l] = True
    return graph


def compute_transitive_closure(items, graph):
    """Floyd-Warshall transitive closure on boolean preference matrix.

    If A>B and B>C, infers A>C. Returns extended graph (new dict, does not
    mutate input).

    :param items: list of item ID strings
    :param graph: adjacency dict from build_preference_graph
    :returns: new adjacency dict with transitive edges added
    """
    # Build boolean matrix
    idx = {item: i for i, item in enumerate(items)}
    n = len(items)
    reach = [[False] * n for _ in range(n)]

    for a in items:
        for b in graph.get(a, {}):
            if b in idx:
                reach[idx[a]][idx[b]] = True

    # Floyd-Warshall
    for k in range(n):
        for i in range(n):
            for j in range(n):
                if reach[i][k] and reach[k][j]:
                    reach[i][j] = True

    # Build closure dict
    closure = {item: {} for item in items}
    for i, a in enumerate(items):
        for j, b in enumerate(items):
            if reach[i][j]:
                closure[a][b] = True
    return closure


def find_cycles(items, graph):
    """Find strongly connected components with size > 1 (preference cycles).

    Uses Tarjan's SCC algorithm.

    :param items: list of item ID strings
    :param graph: adjacency dict
    :returns: list of cycles, each cycle is a list of item IDs
    """
    index_counter = [0]
    stack = []
    lowlink = {}
    index = {}
    on_stack = {}
    sccs = []

    def strongconnect(v):
        index[v] = index_counter[0]
        lowlink[v] = index_counter[0]
        index_counter[0] += 1
        stack.append(v)
        on_stack[v] = True

        for w in graph.get(v, {}):
            if w not in index:
                strongconnect(w)
                lowlink[v] = min(lowlink[v], lowlink[w])
            elif on_stack.get(w, False):
                lowlink[v] = min(lowlink[v], index[w])

        if lowlink[v] == index[v]:
            scc = []
            while True:
                w = stack.pop()
                on_stack[w] = False
                scc.append(w)
                if w == v:
                    break
            if len(scc) > 1:
                sccs.append(scc)

    for v in items:
        if v not in index:
            strongconnect(v)

    return sccs


def is_complete(items, closure, cycles):
    """Check if all pairs are known (directly or transitively) with no cycles.

    :param items: list of item ID strings
    :param closure: transitive closure graph
    :param cycles: list of cycles from find_cycles
    :returns: True if ordering is fully determined
    """
    if cycles:
        return False

    n = len(items)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = items[i], items[j]
            if not closure.get(a, {}).get(b) and not closure.get(b, {}).get(a):
                return False
    return True


def get_unknown_pairs(items, closure):
    """Get all pairs where neither direction is known.

    :param items: list of item ID strings
    :param closure: transitive closure graph
    :returns: list of (item_a, item_b) tuples
    """
    unknown = []
    n = len(items)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = items[i], items[j]
            if not closure.get(a, {}).get(b) and not closure.get(b, {}).get(a):
                unknown.append((a, b))
    return unknown


def compute_pair_entropy(item_a, item_b, matrix):
    """Compute entropy of a pair based on a victory matrix.

    :param item_a: item ID string
    :param item_b: item ID string
    :param matrix: victory matrix from build_victory_matrix
    :returns: float 0.0 (all agree) to 1.0 (50/50 split), 0.5 if no data
    """
    wins_a = matrix.get(item_a, {}).get(item_b, 0)
    wins_b = matrix.get(item_b, {}).get(item_a, 0)
    total = wins_a + wins_b
    if total == 0:
        return 0.5  # neutral — no data

    p = wins_a / total
    if p == 0.0 or p == 1.0:
        return 0.0  # complete agreement
    # Binary entropy: -p*log2(p) - (1-p)*log2(1-p), normalized to [0, 1]
    return -p * math.log2(p) - (1 - p) * math.log2(1 - p)


def select_next_pair(items, graph, closure, cycles, group_matrix=None):
    """Select the most informative unknown pair to ask next.

    Priority:
    1. If cycles exist, return an edge from the cycle as tiebreaker
    2. Score unknown pairs by adjacency + optional group entropy
    3. Return highest-scoring pair, or None if complete

    :param items: list of item ID strings
    :param graph: direct preference graph
    :param closure: transitive closure graph
    :param cycles: list of cycles from find_cycles
    :param group_matrix: optional victory matrix for entropy scoring
    :returns: (item_a, item_b) tuple, or None if complete
    """
    # 1. Cycle tiebreaker: pick an edge within the cycle that exists
    if cycles:
        cycle = cycles[0]
        # Find a pair in the cycle that we can ask about as a tiebreaker.
        # Pick two adjacent items in the cycle for a direct re-comparison.
        for i in range(len(cycle)):
            a = cycle[i]
            b = cycle[(i + 1) % len(cycle)]
            return (a, b)

    # 2. Score unknown pairs
    unknown = get_unknown_pairs(items, closure)
    if not unknown:
        return None

    # Build partial ordering depth for adjacency scoring
    depth = _compute_depth(items, closure)

    best_pair = None
    best_score = -1.0

    for a, b in unknown:
        # Adjacency score: prefer pairs close in partial ordering
        depth_diff = abs(depth.get(a, 0) - depth.get(b, 0))
        max_depth = max(len(items) - 1, 1)
        adjacency_score = 1.0 - (depth_diff / max_depth)

        # Group entropy score
        entropy_score = 0.5  # neutral default
        if group_matrix:
            entropy_score = compute_pair_entropy(a, b, group_matrix)

        # Combined score (equal weighting)
        score = 0.5 * adjacency_score + 0.5 * entropy_score

        if score > best_score:
            best_score = score
            best_pair = (a, b)

    return best_pair


def _compute_depth(items, closure):
    """Compute topological depth of each item in the closure graph.

    Depth = number of items that this item beats (transitively).
    Items with more wins have higher depth.
    """
    depth = {}
    for item in items:
        depth[item] = sum(1 for other in items if closure.get(item, {}).get(other))
    return depth


# ---------------------------------------------------------------------------
# Aggregate functions (for rankings endpoint)
# ---------------------------------------------------------------------------

def build_victory_matrix(items, all_responses):
    """Build victory matrix from all users' responses.

    :param items: list of item ID strings
    :param all_responses: list of dicts with 'winner_item_id' and 'loser_item_id'
    :returns: dict where matrix[A][B] = number of users who chose A over B
    """
    item_set = set(items)
    matrix = {item: defaultdict(int) for item in items}
    for r in all_responses:
        w = str(r["winner_item_id"])
        l = str(r["loser_item_id"])
        if w in item_set and l in item_set:
            matrix[w][l] += 1
    return matrix


def find_condorcet_winner(items, matrix):
    """Find the Condorcet winner — item that beats every other by strict majority.

    :param items: list of item ID strings
    :param matrix: victory matrix from build_victory_matrix
    :returns: item ID string, or None if no Condorcet winner
    """
    for candidate in items:
        is_winner = True
        for other in items:
            if other == candidate:
                continue
            wins = matrix.get(candidate, {}).get(other, 0)
            losses = matrix.get(other, {}).get(candidate, 0)
            if wins <= losses:
                is_winner = False
                break
        if is_winner:
            return candidate
    return None


def ranked_pairs_ordering(items, matrix):
    """Tideman's Ranked Pairs algorithm for aggregate ranking.

    1. Compute margin for each pair
    2. Sort by margin descending
    3. Lock in each pair unless it creates a cycle
    4. Topological sort the resulting DAG

    :param items: list of item ID strings
    :param matrix: victory matrix from build_victory_matrix
    :returns: ordered list of item IDs, best to worst
    """
    if not items:
        return []

    # 1. Compute margins for all pairs
    margins = []
    n = len(items)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = items[i], items[j]
            wins_a = matrix.get(a, {}).get(b, 0)
            wins_b = matrix.get(b, {}).get(a, 0)
            margin = wins_a - wins_b
            if margin > 0:
                margins.append((a, b, margin))
            elif margin < 0:
                margins.append((b, a, -margin))
            # margin == 0: tied, skip (no edge to lock)

    # 2. Sort by margin descending (stable sort preserves order for equal margins)
    margins.sort(key=lambda x: x[2], reverse=True)

    # 3. Lock in edges, skip if would create cycle
    locked = {item: set() for item in items}

    for winner, loser, margin in margins:
        # Check if adding winner->loser creates a cycle (loser can reach winner)
        if not _can_reach(locked, loser, winner, items):
            locked[winner].add(loser)

    # 4. Topological sort (Kahn's algorithm)
    return _topological_sort(items, locked, matrix)


def _can_reach(graph, start, target, items):
    """BFS to check if start can reach target in directed graph."""
    visited = set()
    queue = deque([start])
    while queue:
        node = queue.popleft()
        if node == target:
            return True
        if node in visited:
            continue
        visited.add(node)
        for neighbor in graph.get(node, set()):
            if neighbor not in visited:
                queue.append(neighbor)
    return False


def _topological_sort(items, graph, matrix=None):
    """Kahn's algorithm for topological sort.

    Returns items ordered from most wins (fewest incoming) to least.
    When multiple items have equal in-degree, breaks ties by total wins
    descending so well-evidenced items rank above sparsely-compared ones.
    Items with no comparisons at all are placed at the bottom.
    """
    # Compute win rate per item for tiebreaking
    win_rate = {}
    total_comparisons = {}
    if matrix:
        for item in items:
            wins = sum(
                matrix.get(item, {}).get(other, 0)
                for other in items if other != item
            )
            comps = sum(
                matrix.get(item, {}).get(other, 0) + matrix.get(other, {}).get(item, 0)
                for other in items if other != item
            )
            win_rate[item] = wins / comps if comps > 0 else 0.0
            total_comparisons[item] = comps
    # Tiebreaker: higher win rate first, then more comparisons (more evidence)
    def by_wins(item):
        return (-win_rate.get(item, 0.0), -total_comparisons.get(item, 0))

    # Identify items with no comparisons (isolated nodes)
    isolated = set()
    if matrix:
        for item in items:
            total = sum(
                matrix.get(item, {}).get(other, 0) + matrix.get(other, {}).get(item, 0)
                for other in items if other != item
            )
            if total == 0:
                isolated.add(item)

    active_items = [item for item in items if item not in isolated]

    # Compute in-degrees
    in_degree = {item: 0 for item in active_items}
    for node in active_items:
        for neighbor in graph.get(node, set()):
            if neighbor in in_degree:
                in_degree[neighbor] = in_degree.get(neighbor, 0) + 1

    # Start with nodes that have no incoming edges (top-ranked)
    # Sort by total wins descending so well-evidenced items come first
    queue = deque(sorted([item for item in active_items if in_degree[item] == 0], key=by_wins))
    result = []

    while queue:
        node = queue.popleft()
        result.append(node)
        newly_free = []
        for neighbor in graph.get(node, set()):
            if neighbor in in_degree:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    newly_free.append(neighbor)
        # Insert newly freed nodes in wins-descending order
        for item in sorted(newly_free, key=by_wins):
            queue.append(item)

    # Add any active items that weren't reached (disconnected but have comparisons)
    remaining_active = sorted([item for item in active_items if item not in set(result)], key=by_wins)
    result.extend(remaining_active)

    # Isolated items (no comparisons) go at the bottom
    result.extend(sorted(isolated, key=by_wins))

    return result
