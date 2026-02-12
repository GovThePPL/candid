"""
Ideological coordinate computation and caching.

Lazily computes per-user (x, y) coordinates in PCA space from their
Polis position votes. Coordinates are cached in the DB (user_ideological_coords)
and refreshed when the Polis math tick advances or the user casts new votes.

Blending: effective coords smoothly transition from Polis PCA (position votes)
to matrix-factorization coords (comment votes) as the user accumulates comment
votes. While the MF stub returns None, blending degrades gracefully to pure
Polis coords.
"""

import json
import logging
import math

from candid.controllers import db
from candid.controllers.helpers.polis_client import get_client
from candid.controllers.helpers.redis_pool import get_redis
from candid.controllers.helpers.scoring import compute_max_distance
from candid.controllers.helpers import matrix_factorization as mf

logger = logging.getLogger(__name__)

# Redis cache TTL for PCA components (seconds)
PCA_CACHE_TTL = 300  # 5 minutes


# ---------------------------------------------------------------------------
# PCA projection
# ---------------------------------------------------------------------------

def project_user(user_votes, comps, center):
    """Reproduce Polis's sparsity-aware-project-ptpt in Python.

    Args:
        user_votes: Dict mapping TID (int) -> vote_value (-1, 0, 1).
                    Only positions the user voted on.
        comps: List of 2 principal component vectors (from pca.asPOJO.comps).
        center: Centering vector (from pca.asPOJO.center).

    Returns:
        (x, y) tuple — coordinates in PCA space.
    """
    if not user_votes or not comps or not center:
        return (0.0, 0.0)

    pc1, pc2 = comps
    n_total = len(center)
    n_votes = 0
    p1, p2 = 0.0, 0.0

    for tid, vote in user_votes.items():
        tid = int(tid)
        if tid >= n_total:
            continue
        centered = vote - center[tid]
        p1 += centered * pc1[tid]
        p2 += centered * pc2[tid]
        n_votes += 1

    if n_votes == 0:
        return (0.0, 0.0)

    # Sparsity scaling: push out from center proportional to missing votes
    scale = math.sqrt(n_total / max(n_votes, 1))
    return (p1 * scale, p2 * scale)


# ---------------------------------------------------------------------------
# PCA cache (Redis layer 1)
# ---------------------------------------------------------------------------

def get_pca_cache(conversation_id):
    """Get cached PCA components for a conversation.

    Returns dict with keys: comps, center, max_distance, math_tick.
    Refreshes from Polis API if cache is missing or stale.

    Args:
        conversation_id: Polis conversation ID string.

    Returns:
        Dict with PCA data, or None if Polis has no math data yet.
    """
    r = get_redis()
    cache_key = f"pca:{conversation_id}"

    # Check Redis cache
    cached = r.get(cache_key)
    if cached:
        try:
            return json.loads(cached)
        except (json.JSONDecodeError, TypeError):
            pass

    # Cache miss — fetch from Polis
    return _refresh_pca_cache(conversation_id)


def _refresh_pca_cache(conversation_id):
    """Fetch PCA data from Polis and cache in Redis.

    Returns:
        Dict with PCA data, or None if unavailable.
    """
    try:
        client = get_client()
        math_data = client.get_math_data(conversation_id)
    except Exception as e:
        logger.warning(f"Failed to fetch Polis math data for {conversation_id}: {e}")
        return None

    pca = math_data.get("pca", {})
    pca_pojo = pca.get("asPOJO", {}) if pca else {}

    comps = pca_pojo.get("comps")
    center = pca_pojo.get("center")

    if not comps or not center:
        return None

    base_clusters = pca_pojo.get("base-clusters", {})
    max_dist = compute_max_distance(base_clusters)

    math_tick = math_data.get("math_tick")

    cache_data = {
        "comps": comps,
        "center": center,
        "max_distance": max_dist,
        "math_tick": math_tick,
    }

    # Store in Redis with TTL
    r = get_redis()
    cache_key = f"pca:{conversation_id}"
    r.setex(cache_key, PCA_CACHE_TTL, json.dumps(cache_data))

    return cache_data


# ---------------------------------------------------------------------------
# User coordinate computation (DB layer 2)
# ---------------------------------------------------------------------------

def get_or_compute_coords(user_id, conversation_id):
    """Get user's ideological coordinates, computing lazily if needed.

    Checks the user_ideological_coords table for current math_tick.
    If stale or missing, fetches the user's position votes, projects
    via PCA, and upserts to DB.

    Args:
        user_id: Candid user UUID string.
        conversation_id: Polis conversation ID string.

    Returns:
        Dict with x, y, n_position_votes, math_tick — or None if
        insufficient data.
    """
    pca_cache = get_pca_cache(conversation_id)
    if pca_cache is None:
        return None

    current_tick = pca_cache.get("math_tick")

    # Check DB for cached coords
    row = db.execute_query("""
        SELECT x, y, n_position_votes, math_tick
        FROM user_ideological_coords
        WHERE user_id = %s AND polis_conversation_id = %s
    """, (user_id, conversation_id), fetchone=True)

    if row and row.get("math_tick") == current_tick:
        return {
            "x": row["x"],
            "y": row["y"],
            "n_position_votes": row["n_position_votes"],
            "math_tick": row["math_tick"],
        }

    # Stale or missing — recompute
    return _compute_and_cache_coords(user_id, conversation_id, pca_cache)


def _compute_and_cache_coords(user_id, conversation_id, pca_cache):
    """Compute user's PCA projection and cache in DB.

    Returns:
        Dict with x, y, n_position_votes, math_tick — or None.
    """
    # Fetch user's position votes mapped to TIDs
    votes_rows = db.execute_query("""
        SELECT pc.polis_comment_tid AS tid,
               CASE r.response
                   WHEN 'agree' THEN -1
                   WHEN 'disagree' THEN 1
                   WHEN 'pass' THEN 0
               END AS vote_value
        FROM response r
        JOIN polis_comment pc ON r.position_id = pc.position_id
        WHERE pc.polis_conversation_id = %s AND r.user_id = %s
          AND r.response IN ('agree', 'disagree', 'pass')
    """, (conversation_id, user_id))

    if not votes_rows:
        return None

    # Build vote vector: tid -> vote_value
    user_votes = {row["tid"]: row["vote_value"] for row in votes_rows}

    if not user_votes:
        return None

    comps = pca_cache["comps"]
    center = pca_cache["center"]
    math_tick = pca_cache.get("math_tick")

    x, y = project_user(user_votes, comps, center)

    # Look up location_id and category_id for this conversation
    conv_row = db.execute_query("""
        SELECT location_id, category_id
        FROM polis_conversation
        WHERE polis_conversation_id = %s
    """, (conversation_id,), fetchone=True)

    location_id = conv_row["location_id"] if conv_row else None
    category_id = conv_row.get("category_id") if conv_row else None

    # Upsert to DB
    db.execute_query("""
        INSERT INTO user_ideological_coords
            (user_id, polis_conversation_id, location_id, category_id,
             x, y, n_position_votes, math_tick, computed_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, polis_conversation_id) DO UPDATE SET
            x = EXCLUDED.x,
            y = EXCLUDED.y,
            n_position_votes = EXCLUDED.n_position_votes,
            math_tick = EXCLUDED.math_tick,
            location_id = EXCLUDED.location_id,
            category_id = EXCLUDED.category_id,
            computed_at = CURRENT_TIMESTAMP
    """, (user_id, conversation_id, location_id, category_id,
          x, y, len(user_votes), math_tick))

    return {
        "x": x,
        "y": y,
        "n_position_votes": len(user_votes),
        "math_tick": math_tick,
    }


# ---------------------------------------------------------------------------
# Blending: Polis PCA + Matrix Factorization
# ---------------------------------------------------------------------------

def blended_coords(polis_coords, mf_coords, n_comment_votes, threshold=30):
    """Blend Polis PCA coords with matrix-factorization coords.

    Pure math — no DB access.

    Args:
        polis_coords: Tuple (x, y) from PCA projection.
        mf_coords: Tuple (x, y) from MF, or None if MF not available.
        n_comment_votes: Number of comment votes cast by this user.
        threshold: Number of comment votes for full MF weight.

    Returns:
        (x, y) tuple of blended coordinates.
    """
    if mf_coords is None:
        return polis_coords

    alpha = min(n_comment_votes / threshold, 1.0)
    bx = (1 - alpha) * polis_coords[0] + alpha * mf_coords[0]
    by = (1 - alpha) * polis_coords[1] + alpha * mf_coords[1]
    return (bx, by)


def get_effective_coords(user_id, conversation_id):
    """Get user's effective ideological coordinates (blended).

    Orchestrator: fetches Polis PCA coords and MF coords, calls
    blended_coords(). Falls back to None if no Polis coords exist.

    Args:
        user_id: Candid user UUID string.
        conversation_id: Polis conversation ID string.

    Returns:
        Dict with x, y keys, or None if no coords available.
    """
    polis = get_or_compute_coords(user_id, conversation_id)
    if polis is None:
        return None

    polis_xy = (polis["x"], polis["y"])

    # Get MF coords (stub returns None in Phase 1)
    mf_coords = mf.get_mf_coords(user_id, conversation_id)

    # Get n_comment_votes from DB
    row = db.execute_query("""
        SELECT n_comment_votes
        FROM user_ideological_coords
        WHERE user_id = %s AND polis_conversation_id = %s
    """, (user_id, conversation_id), fetchone=True)

    n_comment_votes = row["n_comment_votes"] if row else 0

    bx, by = blended_coords(polis_xy, mf_coords, n_comment_votes)

    return {"x": bx, "y": by}


# ---------------------------------------------------------------------------
# Cache invalidation
# ---------------------------------------------------------------------------

def invalidate_coords(user_id, conversation_id):
    """Delete cached coords for a user (called when user casts new position vote).

    Args:
        user_id: Candid user UUID string.
        conversation_id: Polis conversation ID string.
    """
    db.execute_query("""
        DELETE FROM user_ideological_coords
        WHERE user_id = %s AND polis_conversation_id = %s
    """, (user_id, conversation_id))


# ---------------------------------------------------------------------------
# Conversation lookup
# ---------------------------------------------------------------------------

def get_conversation_for_post(location_id, category_id):
    """Look up the active Polis conversation for a location+category.

    Uses the polis_conversation table directly (same data as
    polis_sync.get_active_conversations but returns just the
    conversation_id string).

    Args:
        location_id: Location UUID string.
        category_id: Category UUID string, or None.

    Returns:
        Polis conversation_id string, or None if none active.
    """
    if category_id:
        row = db.execute_query("""
            SELECT polis_conversation_id
            FROM polis_conversation
            WHERE location_id = %s
              AND category_id = %s
              AND status = 'active'
              AND active_from <= CURRENT_DATE
              AND active_until > CURRENT_DATE
            ORDER BY active_from DESC
            LIMIT 1
        """, (location_id, category_id), fetchone=True)
    else:
        row = db.execute_query("""
            SELECT polis_conversation_id
            FROM polis_conversation
            WHERE location_id = %s
              AND category_id IS NULL
              AND status = 'active'
              AND active_from <= CURRENT_DATE
              AND active_until > CURRENT_DATE
            ORDER BY active_from DESC
            LIMIT 1
        """, (location_id,), fetchone=True)

    return row["polis_conversation_id"] if row else None
