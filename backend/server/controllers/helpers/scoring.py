"""
Scoring and vote-weighting functions for posts and comments.

Pure math — no DB, no network. All functions are deterministic
(hot_score accepts an optional `now` for testability).
"""

import math
from datetime import datetime, timezone


def wilson_score(weighted_up, weighted_down):
    """Lower bound of Wilson score confidence interval on weighted votes.

    Used as the "Best" sort for comments and posts. A comment upvoted by
    people across the ideological spectrum (higher weights) scores higher
    than one upvoted by same-ideology voters (lower weights).

    Args:
        weighted_up: Sum of vote weights for upvotes.
        weighted_down: Sum of vote weights for downvotes.

    Returns:
        Wilson score lower bound (float in [0, 1]).
    """
    n = weighted_up + weighted_down
    if n == 0:
        return 0.0

    p = weighted_up / n
    z = 1.96  # 95% confidence

    denominator = 1 + z * z / n
    center = p + z * z / (2 * n)
    spread = z * math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)

    return (center - spread) / denominator


def hot_score(weighted_up, weighted_down, created_time, now=None):
    """Time-decaying score with bridging weighting.

    Used as the default feed sort for posts. Cross-ideology support
    naturally boosts the score because those votes carry higher weights.

    Args:
        weighted_up: Sum of vote weights for upvotes.
        weighted_down: Sum of vote weights for downvotes.
        created_time: Post creation time (datetime, should be timezone-aware).
        now: Current time for testing (defaults to UTC now).

    Returns:
        Hot score (float). Higher = more prominent in feed.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    score = weighted_up - weighted_down
    sign = 1 if score > 0 else -1 if score < 0 else 0
    order = math.log10(max(abs(score), 1))

    # Ensure both datetimes are comparable
    if created_time.tzinfo is None:
        created_time = created_time.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    hours = (now - created_time).total_seconds() / 3600
    gravity = 1.5

    return sign * order / (hours + 2) ** gravity


def controversial_score(weighted_up, weighted_down):
    """High engagement + near-even split = controversial.

    Args:
        weighted_up: Sum of vote weights for upvotes.
        weighted_down: Sum of vote weights for downvotes.

    Returns:
        Controversial score (float). Higher when many votes AND evenly split.
    """
    total = weighted_up + weighted_down
    if total == 0:
        return 0.0

    balance = min(weighted_up, weighted_down) / max(weighted_up, weighted_down)
    return total * balance


def vote_weight(voter_coords, author_coords, max_distance):
    """Weight a vote by ideological distance between voter and author.

    Cross-ideology votes count more (up to 2x). Same-ideology votes
    count at baseline (1x).

    Args:
        voter_coords: Dict with 'x', 'y' keys, or None (cold start).
        author_coords: Dict with 'x', 'y' keys, or None (cold start).
        max_distance: Max pairwise distance between cluster centroids,
                      or None if < 2 clusters.

    Returns:
        Weight in [1.0, 2.0]. Returns 1.0 for cold start (missing coords
        or max_distance).
    """
    if voter_coords is None or author_coords is None or max_distance is None:
        return 1.0
    if max_distance <= 0:
        return 1.0

    distance = ideological_distance(voter_coords, author_coords)
    normalized = min(distance / max_distance, 1.0)

    return 1.0 + normalized


def ideological_distance(coords_a, coords_b):
    """Euclidean distance in PCA space.

    Args:
        coords_a: Dict with 'x', 'y' keys.
        coords_b: Dict with 'x', 'y' keys.

    Returns:
        Distance (float >= 0).
    """
    dx = coords_a['x'] - coords_b['x']
    dy = coords_a['y'] - coords_b['y']
    return math.sqrt(dx * dx + dy * dy)


def compute_max_distance(base_clusters):
    """Compute max pairwise distance between Polis cluster centroids.

    This gives a conversation-specific normalization scale for vote
    weighting — "how far apart are the most opposed groups."

    Args:
        base_clusters: Dict with 'x' and 'y' arrays from
                       pca.asPOJO.base-clusters.

    Returns:
        Max distance (float), or None if < 2 clusters.
    """
    xs = base_clusters.get('x', [])
    ys = base_clusters.get('y', [])
    n = min(len(xs), len(ys))
    if n < 2:
        return None

    max_dist = 0.0
    for i in range(n):
        for j in range(i + 1, n):
            dx = xs[i] - xs[j]
            dy = ys[i] - ys[j]
            d = math.sqrt(dx * dx + dy * dy)
            max_dist = max(max_dist, d)

    return max_dist if max_dist > 0 else None
