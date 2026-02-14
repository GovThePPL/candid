"""
Matrix factorization for post+comment vote ideological coordinates.

Community Notes-style factorization on the unified vote matrix:
  r_ui = mu + i_u + i_i + f_u . f_i

- f_u = user's latent ideological factor (discovered from post+comment votes)
- i_i = item's "genuine quality" intercept (bridging score)
- Polis regularization anchors f_u toward PCA coords

Items are posts and comments pooled into one matrix. Item IDs are prefixed
with 'p:' or 'c:' to keep namespaces separate.
"""

import logging
import time

import numpy as np

from candid.controllers import db, config

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal: data loading
# ---------------------------------------------------------------------------

def _load_vote_matrix(conversation_id):
    """Load post+comment votes for a conversation as a sparse list.

    UNIONs comment_vote and post_vote, prefixing item IDs with 'c:' or 'p:'
    to keep namespaces separate.

    Returns:
        Dict with keys: votes (list of (user_idx, item_idx, rating)),
        user_id_to_idx, idx_to_user_id, item_id_to_idx, idx_to_item_id,
        n_users, n_items.
        Returns None if below MF_MIN_VOTERS or MF_MIN_VOTES thresholds.
    """
    rows = db.execute_query("""
        SELECT cv.user_id::text AS user_id,
               ('c:' || cv.comment_id::text) AS item_id,
               CASE cv.vote_type
                   WHEN 'upvote' THEN 1
                   WHEN 'downvote' THEN -1
               END AS rating
        FROM comment_vote cv
        JOIN comment c ON cv.comment_id = c.id
        JOIN post p ON c.post_id = p.id
        JOIN polis_conversation pc ON p.location_id = pc.location_id
             AND COALESCE(p.category_id::text, '') = COALESCE(pc.category_id::text, '')
        WHERE pc.polis_conversation_id = %s
          AND pc.status = 'active'
          AND c.status = 'active'

        UNION ALL

        SELECT pv.user_id::text AS user_id,
               ('p:' || pv.post_id::text) AS item_id,
               CASE pv.vote_type
                   WHEN 'upvote' THEN 1
                   WHEN 'downvote' THEN -1
               END AS rating
        FROM post_vote pv
        JOIN post p ON pv.post_id = p.id
        JOIN polis_conversation pc ON p.location_id = pc.location_id
             AND COALESCE(p.category_id::text, '') = COALESCE(pc.category_id::text, '')
        WHERE pc.polis_conversation_id = %s
          AND pc.status = 'active'
          AND p.status = 'active'
    """, (conversation_id, conversation_id))

    if not rows:
        return None

    # Build index maps
    user_ids = sorted(set(r["user_id"] for r in rows))
    item_ids = sorted(set(r["item_id"] for r in rows))

    if len(user_ids) < config.MF_MIN_VOTERS or len(rows) < config.MF_MIN_VOTES:
        return None

    user_id_to_idx = {uid: i for i, uid in enumerate(user_ids)}
    item_id_to_idx = {iid: i for i, iid in enumerate(item_ids)}

    votes = [
        (user_id_to_idx[r["user_id"]], item_id_to_idx[r["item_id"]], r["rating"])
        for r in rows
    ]

    return {
        "votes": votes,
        "user_id_to_idx": user_id_to_idx,
        "idx_to_user_id": {i: uid for uid, i in user_id_to_idx.items()},
        "item_id_to_idx": item_id_to_idx,
        "idx_to_item_id": {i: iid for iid, i in item_id_to_idx.items()},
        "n_users": len(user_ids),
        "n_items": len(item_ids),
    }


def _load_polis_coords(user_id_to_idx, conversation_id):
    """Load PCA coordinates for users in the vote matrix.

    Normalizes by max_distance so Polis coords are on a similar scale
    to MF factors.

    Returns:
        Dict mapping user_idx -> np.array([x, y]), or empty dict.
    """
    # Lazy import to avoid circular dependency with ideological_coords
    from candid.controllers.helpers.ideological_coords import get_pca_cache
    pca_cache = get_pca_cache(conversation_id)
    if pca_cache is None:
        return {}

    max_dist = pca_cache.get("max_distance")
    if not max_dist or max_dist <= 0:
        max_dist = 1.0

    user_ids = list(user_id_to_idx.keys())
    if not user_ids:
        return {}

    rows = db.execute_query("""
        SELECT user_id::text AS user_id, x, y
        FROM user_ideological_coords
        WHERE polis_conversation_id = %s
          AND user_id = ANY(%s::uuid[])
    """, (conversation_id, user_ids))

    if not rows:
        return {}

    coords = {}
    for r in rows:
        uid = r["user_id"]
        if uid in user_id_to_idx:
            coords[user_id_to_idx[uid]] = np.array([
                r["x"] / max_dist,
                r["y"] / max_dist,
            ])

    return coords


# ---------------------------------------------------------------------------
# Internal: SGD fitting
# ---------------------------------------------------------------------------

def _fit_mf_model(votes, n_users, n_items, polis_coords, cfg=None):
    """Fit the MF model via SGD.

    Model: r_ui = mu + i_u + i_i + f_u . f_i

    Args:
        votes: List of (user_idx, item_idx, rating) tuples.
        n_users: Number of unique users.
        n_items: Number of unique items (posts + comments).
        polis_coords: Dict mapping user_idx -> np.array([x, y]).
        cfg: Config dict overrides (for testing). Keys: latent_dim,
             learning_rate, lambda_reg, lambda_polis, max_epochs,
             convergence_tol.

    Returns:
        Dict with: mu, user_intercepts, item_intercepts,
        user_factors, item_factors, final_loss, epochs.
    """
    if cfg is None:
        cfg = {}

    dim = cfg.get("latent_dim", config.MF_LATENT_DIM)
    lr = cfg.get("learning_rate", config.MF_LEARNING_RATE)
    lam = cfg.get("lambda_reg", config.MF_LAMBDA_REG)
    lam_polis = cfg.get("lambda_polis", config.MF_LAMBDA_POLIS)
    max_epochs = cfg.get("max_epochs", config.MF_MAX_EPOCHS)
    tol = cfg.get("convergence_tol", config.MF_CONVERGENCE_TOL)

    # Convert to numpy arrays for vectorized access
    vote_arr = np.array(votes, dtype=np.float64)  # (N, 3)
    n_votes = len(votes)

    # Initialize
    ratings = vote_arr[:, 2]
    mu = float(np.mean(ratings))
    i_u = np.zeros(n_users)
    i_c = np.zeros(n_items)

    # User factors: init from Polis coords where available, else small random
    rng = np.random.RandomState(42)
    f_u = rng.randn(n_users, dim) * 0.01
    for u_idx, polis_xy in polis_coords.items():
        f_u[u_idx] = polis_xy

    f_c = rng.randn(n_items, dim) * 0.01

    prev_loss = float("inf")
    indices = np.arange(n_votes)

    for epoch in range(max_epochs):
        rng.shuffle(indices)

        for idx in indices:
            u = int(vote_arr[idx, 0])
            c = int(vote_arr[idx, 1])
            r = vote_arr[idx, 2]

            pred = mu + i_u[u] + i_c[c] + f_u[u] @ f_c[c]
            err = r - pred

            # Update global mean
            mu += lr * err

            # Update intercepts with L2
            i_u[u] += lr * (err - lam * i_u[u])
            i_c[c] += lr * (err - lam * i_c[c])

            # Update factors with L2
            f_u_old = f_u[u].copy()
            f_u[u] += lr * (err * f_c[c] - lam * f_u[u])
            f_c[c] += lr * (err * f_u_old - lam * f_c[c])

            # Polis regularization: pull user factors toward PCA coords
            if u in polis_coords:
                f_u[u] -= lr * lam_polis * (f_u[u] - polis_coords[u])

        # Compute loss
        loss = 0.0
        for idx in range(n_votes):
            u = int(vote_arr[idx, 0])
            c = int(vote_arr[idx, 1])
            r = vote_arr[idx, 2]
            pred = mu + i_u[u] + i_c[c] + f_u[u] @ f_c[c]
            loss += (r - pred) ** 2

        loss /= n_votes

        # Add regularization terms to loss
        loss += lam * (np.sum(i_u ** 2) + np.sum(i_c ** 2) +
                       np.sum(f_u ** 2) + np.sum(f_c ** 2)) / n_votes

        # Convergence check
        if abs(prev_loss - loss) < tol * max(abs(prev_loss), 1e-10):
            return {
                "mu": mu,
                "user_intercepts": i_u,
                "item_intercepts": i_c,
                "user_factors": f_u,
                "item_factors": f_c,
                "final_loss": loss,
                "epochs": epoch + 1,
            }

        prev_loss = loss

    return {
        "mu": mu,
        "user_intercepts": i_u,
        "item_intercepts": i_c,
        "user_factors": f_u,
        "item_factors": f_c,
        "final_loss": prev_loss,
        "epochs": max_epochs,
    }


# ---------------------------------------------------------------------------
# Internal: store results
# ---------------------------------------------------------------------------

def _store_mf_results(conversation_id, model, idx_maps):
    """Write MF results to database.

    Updates user_ideological_coords.mf_x/mf_y/mf_computed_at,
    comment.mf_intercept and post.mf_intercept, and
    user_ideological_coords.n_comment_votes.
    Logs to mf_training_log.
    """
    idx_to_user_id = idx_maps["idx_to_user_id"]
    idx_to_item_id = idx_maps["idx_to_item_id"]
    user_factors = model["user_factors"]
    item_intercepts = model["item_intercepts"]

    # Update user MF coordinates
    for u_idx, user_id in idx_to_user_id.items():
        db.execute_query("""
            UPDATE user_ideological_coords
            SET mf_x = %s, mf_y = %s, mf_computed_at = CURRENT_TIMESTAMP
            WHERE user_id = %s AND polis_conversation_id = %s
        """, (float(user_factors[u_idx, 0]), float(user_factors[u_idx, 1]),
              user_id, conversation_id))

    # Update item MF intercepts (comments and posts)
    for i_idx, item_id in idx_to_item_id.items():
        intercept = float(item_intercepts[i_idx])
        if item_id.startswith("c:"):
            db.execute_query("""
                UPDATE comment SET mf_intercept = %s WHERE id = %s
            """, (intercept, item_id[2:]))
        elif item_id.startswith("p:"):
            db.execute_query("""
                UPDATE post SET mf_intercept = %s WHERE id = %s
            """, (intercept, item_id[2:]))

    # Bulk update n_comment_votes from actual vote counts (comment + post votes)
    db.execute_query("""
        UPDATE user_ideological_coords uic
        SET n_comment_votes = sub.vote_count
        FROM (
            SELECT user_id, SUM(cnt) AS vote_count FROM (
                SELECT cv.user_id, COUNT(*) AS cnt
                FROM comment_vote cv
                JOIN comment c ON cv.comment_id = c.id
                JOIN post p ON c.post_id = p.id
                JOIN polis_conversation pc ON p.location_id = pc.location_id
                     AND COALESCE(p.category_id::text, '') = COALESCE(pc.category_id::text, '')
                WHERE pc.polis_conversation_id = %s
                  AND pc.status = 'active'
                GROUP BY cv.user_id

                UNION ALL

                SELECT pv.user_id, COUNT(*) AS cnt
                FROM post_vote pv
                JOIN post p ON pv.post_id = p.id
                JOIN polis_conversation pc ON p.location_id = pc.location_id
                     AND COALESCE(p.category_id::text, '') = COALESCE(pc.category_id::text, '')
                WHERE pc.polis_conversation_id = %s
                  AND pc.status = 'active'
                GROUP BY pv.user_id
            ) combined
            GROUP BY user_id
        ) sub
        WHERE uic.user_id = sub.user_id
          AND uic.polis_conversation_id = %s
    """, (conversation_id, conversation_id, conversation_id))

    # Log training
    conv_row = db.execute_query("""
        SELECT location_id, category_id
        FROM polis_conversation
        WHERE polis_conversation_id = %s
    """, (conversation_id,), fetchone=True)

    location_id = conv_row["location_id"] if conv_row else None
    category_id = conv_row.get("category_id") if conv_row else None

    db.execute_query("""
        INSERT INTO mf_training_log
            (polis_conversation_id, location_id, category_id,
             n_users, n_comments, n_votes, final_loss, epochs_run,
             duration_seconds)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (conversation_id, location_id, category_id,
          len(idx_to_user_id), len(idx_to_item_id),
          idx_maps["n_votes"],
          model["final_loss"], model["epochs"],
          idx_maps.get("duration_seconds")))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_factorization(conversation_id):
    """Fit MF model on post+comment vote matrix for a conversation.

    Orchestrates: load vote matrix -> load Polis coords -> fit -> store.

    Args:
        conversation_id: Polis conversation ID string.

    Returns:
        Dict with training stats, or None if below thresholds.
    """
    start = time.monotonic()

    vote_data = _load_vote_matrix(conversation_id)
    if vote_data is None:
        return None

    polis_coords = _load_polis_coords(vote_data["user_id_to_idx"], conversation_id)

    model = _fit_mf_model(
        vote_data["votes"],
        vote_data["n_users"],
        vote_data["n_items"],
        polis_coords,
    )

    duration = time.monotonic() - start

    idx_maps = {
        "idx_to_user_id": vote_data["idx_to_user_id"],
        "idx_to_item_id": vote_data["idx_to_item_id"],
        "n_votes": len(vote_data["votes"]),
        "duration_seconds": duration,
    }

    _store_mf_results(conversation_id, model, idx_maps)

    stats = {
        "conversation_id": conversation_id,
        "n_users": vote_data["n_users"],
        "n_items": vote_data["n_items"],
        "n_votes": len(vote_data["votes"]),
        "final_loss": model["final_loss"],
        "epochs": model["epochs"],
        "duration_seconds": duration,
    }

    logger.info(
        "MF training completed for conversation %s: %d users, %d items, "
        "%d votes, loss=%.4f, epochs=%d, %.1fs",
        conversation_id, stats["n_users"], stats["n_items"],
        stats["n_votes"], stats["final_loss"], stats["epochs"],
        stats["duration_seconds"],
    )

    return stats


def get_mf_coords(user_id, conversation_id):
    """Get user's MF-derived ideological coordinates.

    Args:
        user_id: Candid user UUID string.
        conversation_id: Polis conversation ID string.

    Returns:
        Tuple (mf_x, mf_y), or None if MF not yet available.
    """
    row = db.execute_query("""
        SELECT mf_x, mf_y
        FROM user_ideological_coords
        WHERE user_id = %s AND polis_conversation_id = %s
    """, (user_id, conversation_id), fetchone=True)

    if row and row.get("mf_x") is not None and row.get("mf_y") is not None:
        return (row["mf_x"], row["mf_y"])

    return None


def get_comment_intercept(comment_id):
    """Get a comment's bridging quality intercept from MF.

    High values indicate cross-ideology approval.

    Args:
        comment_id: Comment UUID string.

    Returns:
        Bridging score (float), or None if MF not yet available.
    """
    row = db.execute_query("""
        SELECT mf_intercept FROM comment WHERE id = %s
    """, (comment_id,), fetchone=True)

    if row and row.get("mf_intercept") is not None:
        return row["mf_intercept"]

    return None
