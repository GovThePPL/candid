"""Trust score computation from pro-social signals.

Computes a raw score per user from weighted behavioral signals, then ranks
all users by percentile.  The percentile (0-1) is stored as ``trust_score``
in the ``users`` table.

Two-phase approach:
  A) ``_compute_raw_score`` — weighted combination of per-engagement rates
  B) ``recalculate_all_trust_scores`` — batch percentile ranking via SQL
"""

import logging
from typing import Optional

from candid.controllers.helpers.database import Database

logger = logging.getLogger(__name__)

# Positive reaction emojis that count for the reaction-rate signal
POSITIVE_REACTIONS = frozenset(
    {"agree", "appreciate", "grateful", "considering", "respect"}
)

# Toxicity threshold — messages at or above this score count as toxic
TOXICITY_THRESHOLD = 0.7

# Moderation penalties (count-based, not rate-based)
MOD_PENALTY_WARNING = 0.10
MOD_PENALTY_BAN = 0.25

# Minimum users needed before percentile ranking is meaningful
MIN_USERS_FOR_PERCENTILE = 10


def _get_forum_signals(user_id: str, db: Database) -> dict:
    """Extract discussion-forum signals for a user.

    Returns dict with keys:
        total_eligible_content, bridging_awards, avg_bridging,
        total_weighted_up, total_weighted_down
    """
    result = {
        "total_eligible_content": 0,
        "bridging_awards": 0,
        "avg_bridging": 0.0,
        "total_weighted_up": 0.0,
        "total_weighted_down": 0.0,
    }

    # Bridging awards received
    row = db.execute_query(
        "SELECT COUNT(*) AS cnt FROM bridging_award WHERE user_id = %s",
        (user_id,),
        fetchone=True,
    )
    if row:
        result["bridging_awards"] = row["cnt"]

    # Posts with >= 5 votes (eligible for bridging)
    posts = db.execute_query(
        """
        SELECT COALESCE(AVG(p.mf_intercept), 0) AS avg_mfi,
               COALESCE(SUM(p.weighted_upvotes), 0) AS wu,
               COALESCE(SUM(p.weighted_downvotes), 0) AS wd,
               COUNT(*) AS cnt
        FROM post p
        WHERE p.creator_user_id = %s
          AND p.status = 'active'
          AND (p.upvote_count + p.downvote_count) >= 5
        """,
        (user_id,),
        fetchone=True,
    )

    # Comments with >= 5 votes
    comments = db.execute_query(
        """
        SELECT COALESCE(AVG(c.mf_intercept), 0) AS avg_mfi,
               COALESCE(SUM(c.weighted_upvotes), 0) AS wu,
               COALESCE(SUM(c.weighted_downvotes), 0) AS wd,
               COUNT(*) AS cnt
        FROM comment c
        WHERE c.creator_user_id = %s
          AND c.status = 'active'
          AND (c.upvote_count + c.downvote_count) >= 5
        """,
        (user_id,),
        fetchone=True,
    )

    p_cnt = posts["cnt"] if posts else 0
    c_cnt = comments["cnt"] if comments else 0
    total = p_cnt + c_cnt
    result["total_eligible_content"] = total

    if total > 0:
        # Weighted average of mf_intercept across posts and comments
        p_avg = float(posts["avg_mfi"]) if posts else 0.0
        c_avg = float(comments["avg_mfi"]) if comments else 0.0
        result["avg_bridging"] = (p_avg * p_cnt + c_avg * c_cnt) / total

    p_wu = float(posts["wu"]) if posts else 0.0
    p_wd = float(posts["wd"]) if posts else 0.0
    c_wu = float(comments["wu"]) if comments else 0.0
    c_wd = float(comments["wd"]) if comments else 0.0
    result["total_weighted_up"] = p_wu + c_wu
    result["total_weighted_down"] = p_wd + c_wd

    return result


def _get_chat_signals(user_id: str, db: Database) -> dict:
    """Extract all chat-derived signals for a user from exported chat logs.

    Returns dict with both numerators and denominators for rate calculations:
        total_completed_chats, total_messages_sent,
        agreed_closures, kudos_received,
        agreed_statements, good_faith_explanations,
        resolved_definitions, positive_reactions_sent,
        toxic_messages, abandonments
    """
    result = {
        "total_completed_chats": 0,
        "total_messages_sent": 0,
        "agreed_closures": 0,
        "kudos_received": 0,
        "agreed_statements": 0,
        "good_faith_explanations": 0,
        "resolved_definitions": 0,
        "positive_reactions_sent": 0,
        "toxic_messages": 0,
        "abandonments": 0,
    }

    # Kudos received (from kudos table, not JSONB)
    kudos_row = db.execute_query(
        "SELECT COUNT(*) AS cnt FROM kudos WHERE receiver_user_id = %s AND status = 'sent'",
        (user_id,),
        fetchone=True,
    )
    if kudos_row:
        result["kudos_received"] = kudos_row["cnt"]

    # Get all completed chat logs where this user was a participant.
    # A user participates as either initiator or responder (via user_position).
    chat_logs = db.execute_query(
        """
        SELECT cl.id, cl.end_type, cl.log
        FROM chat_log cl
        JOIN chat_request cr ON cl.chat_request_id = cr.id
        JOIN user_position up ON cr.user_position_id = up.id
        WHERE cl.status != 'deleted'
          AND cl.log IS NOT NULL
          AND (cr.initiator_user_id = %s OR up.user_id = %s)
        """,
        (user_id, user_id),
    )
    if not chat_logs:
        return result

    result["total_completed_chats"] = len(chat_logs)

    for chat in chat_logs:
        log = chat["log"]
        if not isinstance(log, dict):
            continue

        end_type = chat["end_type"]

        # Agreed closures
        if end_type == "agreed_closure":
            result["agreed_closures"] += 1

        # Abandonment (check JSONB field first, fall back to end_type)
        if log.get("abandonedByUserId") == user_id:
            result["abandonments"] += 1
        elif end_type == "abandoned":
            # JSONB field missing but end_type indicates abandonment —
            # count it if this user ended the chat
            if log.get("endedByUserId") == user_id:
                result["abandonments"] += 1

        # Messages sent by this user
        messages = log.get("messages", [])
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            if msg.get("senderId") != user_id:
                continue
            result["total_messages_sent"] += 1

            # Toxicity check
            tox = msg.get("toxicityScore")
            if tox is not None and tox >= TOXICITY_THRESHOLD:
                result["toxic_messages"] += 1

        # Agreed positions with status 'accepted'
        agreed_positions = log.get("agreedPositions", [])
        for ap in agreed_positions:
            if isinstance(ap, dict) and ap.get("status") == "accepted":
                result["agreed_statements"] += 1

        # Explanations with good-faith status where user was the explainer
        explanations = log.get("explanations", [])
        for exp in explanations:
            if not isinstance(exp, dict):
                continue
            if exp.get("status") in ("good_faith", "completed", "corrected"):
                if exp.get("explainerId") == user_id:
                    result["good_faith_explanations"] += 1

        # Definitions resolved (accepted or both_defined)
        definitions = log.get("definitions", [])
        for defn in definitions:
            if not isinstance(defn, dict):
                continue
            if defn.get("status") in ("accepted", "both_defined"):
                result["resolved_definitions"] += 1

        # Positive reactions sent by this user
        reactions = log.get("reactions", {})
        if isinstance(reactions, dict):
            for _msg_id, reaction_list in reactions.items():
                if not isinstance(reaction_list, list):
                    continue
                for rxn in reaction_list:
                    if not isinstance(rxn, dict):
                        continue
                    if (
                        rxn.get("userId") == user_id
                        and rxn.get("emoji") in POSITIVE_REACTIONS
                    ):
                        result["positive_reactions_sent"] += 1

    return result


def _get_moderation_signals(user_id: str, db: Database) -> dict:
    """Get moderation actions taken against a user.

    Returns dict with keys: warnings, bans
    """
    rows = db.execute_query(
        """
        SELECT mac.action, COUNT(*) AS cnt
        FROM mod_action_target mat
        JOIN mod_action_class mac ON mat.mod_action_class_id = mac.id
        WHERE mat.user_id = %s
          AND mac.class = 'reported'
          AND mac.action IN ('warning', 'temporary_ban', 'permanent_ban')
        GROUP BY mac.action
        """,
        (user_id,),
    )

    result = {"warnings": 0, "bans": 0}
    if rows:
        for row in rows:
            if row["action"] == "warning":
                result["warnings"] += row["cnt"]
            elif row["action"] in ("temporary_ban", "permanent_ban"):
                result["bans"] += row["cnt"]
    return result


def _compute_raw_score(user_id: str, db: Database) -> Optional[float]:
    """Compute raw trust score for a single user.

    All positive components are rates (per-engagement ratios), not raw counts.
    This prevents users from inflating trust by sheer volume.

    Returns raw weighted score, or None if the user has zero activity.
    """
    forum = _get_forum_signals(user_id, db)
    chat = _get_chat_signals(user_id, db)
    mod = _get_moderation_signals(user_id, db)

    # Check if user has any activity at all
    has_forum = forum["total_eligible_content"] > 0 or forum["bridging_awards"] > 0
    has_chat = chat["total_completed_chats"] > 0
    has_mod = mod["warnings"] > 0 or mod["bans"] > 0

    if not has_forum and not has_chat and not has_mod:
        return None

    # --- Forum signals (per-content rates) ---
    eligible = max(1, forum["total_eligible_content"])
    bridging_rate = forum["bridging_awards"] / eligible
    avg_bridging = forum["avg_bridging"]
    w_up = forum["total_weighted_up"]
    w_down = forum["total_weighted_down"]
    weighted_ratio = w_up / max(1, w_up + w_down)

    # --- Chat signals (per-chat or per-message rates) ---
    chats = max(1, chat["total_completed_chats"])
    msgs = max(1, chat["total_messages_sent"])

    kudos_rate = chat["kudos_received"] / chats
    closure_rate = chat["agreed_closures"] / chats
    agreed_stmt_component = min(1.0, chat["agreed_statements"] / chats)
    explanation_component = min(1.0, chat["good_faith_explanations"] / chats)
    definition_component = min(1.0, chat["resolved_definitions"] / chats)
    reaction_rate = chat["positive_reactions_sent"] / msgs
    toxicity_rate = chat["toxic_messages"] / msgs
    abandonment_rate = chat["abandonments"] / chats

    # --- Moderation penalty (count-based) ---
    mod_penalty = (
        mod["warnings"] * MOD_PENALTY_WARNING + mod["bans"] * MOD_PENALTY_BAN
    )

    # Weighted combination
    raw = (
        0.20 * bridging_rate
        + 0.18 * avg_bridging
        + 0.08 * weighted_ratio
        + 0.10 * kudos_rate
        + 0.10 * closure_rate
        + 0.08 * agreed_stmt_component
        + 0.08 * explanation_component
        + 0.05 * definition_component
        + 0.04 * reaction_rate
        + 0.02 * 0.5  # base
        - 0.15 * toxicity_rate
        - 0.12 * abandonment_rate
        - mod_penalty
    )

    return max(0.0, raw)


def recalculate_all_trust_scores(db: Database) -> int:
    """Batch recalculate trust scores for all active non-guest users.

    Phase A: compute raw scores for every eligible user.
    Phase B: convert to percentile ranks and store in ``users.trust_score``.

    If fewer than MIN_USERS_FOR_PERCENTILE users have raw scores, stores
    clamped raw scores directly instead of percentiles.

    Returns count of users updated.
    """
    # Get all active non-guest users
    users = db.execute_query(
        """
        SELECT id FROM users
        WHERE status = 'active' AND user_type = 'normal'
        """,
    )
    if not users:
        return 0

    # Phase A: compute raw scores
    scored: list[tuple[str, float]] = []
    for u in users:
        uid = str(u["id"])
        raw = _compute_raw_score(uid, db)
        if raw is not None:
            scored.append((uid, raw))

    if not scored:
        return 0

    # Phase B: percentile ranking
    # NOTE: trust_score is DECIMAL(5,5) — max value 0.99999, not 1.0
    max_score = 0.99999

    if len(scored) >= MIN_USERS_FOR_PERCENTILE:
        # Sort by raw score ascending for percentile calculation
        scored.sort(key=lambda x: x[1])
        n = len(scored)
        for rank, (uid, _raw) in enumerate(scored):
            # PERCENT_RANK formula: (rank) / (n - 1), with n-1 >= 1
            percentile = min(max_score, rank / max(1, n - 1))
            db.execute_query(
                "UPDATE users SET trust_score = %s WHERE id = %s::uuid",
                (round(percentile, 5), uid),
            )
    else:
        # Too few users — store clamped raw scores directly
        for uid, raw in scored:
            clamped = min(max_score, max(0.0, raw))
            db.execute_query(
                "UPDATE users SET trust_score = %s WHERE id = %s::uuid",
                (round(clamped, 5), uid),
            )

    # NULL out scores for users who had no activity
    scored_ids = [uid for uid, _ in scored]
    if scored_ids:
        db.execute_query(
            """
            UPDATE users SET trust_score = NULL
            WHERE status = 'active' AND user_type = 'normal'
              AND id != ALL(%s::uuid[])
              AND trust_score IS NOT NULL
            """,
            (scored_ids,),
        )

    logger.info("Trust scores recalculated for %d users", len(scored))
    return len(scored)
