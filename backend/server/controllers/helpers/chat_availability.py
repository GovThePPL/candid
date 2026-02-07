"""
Batch availability checker for chat matching.

Determines whether positions have available chat partners by checking:
1. Online adopters (swiping or in-app) — checks ALL adopters via lightweight ID query + Redis pipeline
2. Notifiable adopters (push notification eligible) — only checked for positions with no online adopter
3. Falls back to agree-voters if no adopters at all
"""

import random
from datetime import datetime
from zoneinfo import ZoneInfo

from . import presence

# Maps notification_frequency (0-5) to daily cap
FREQUENCY_CAPS = {
    0: 0,       # off
    1: 2,       # rarely
    2: 5,       # less
    3: 10,      # normal
    4: 20,      # more
    5: 999999,  # often (effectively unlimited)
}


def get_batch_availability(position_ids, requesting_user_id, db):
    """Check availability of chat partners for a batch of positions.

    Strategy: we only need ONE match per card, and online user count is small.
    So we fetch ALL adopter IDs (lightweight), check ALL against Redis, and
    only query full user details for notification eligibility on the remainder.

    Returns: {position_id: {"availability": "online"|"notifiable"|"none", "userPositionId": str|None}}
    """
    if not position_ids:
        return {}

    result = {pid: {"availability": "none", "userPositionId": None} for pid in position_ids}

    # Step 1: Get ALL active adopter IDs for all positions (lightweight: just IDs)
    adopters = db.execute_query("""
        SELECT up.position_id, up.id as user_position_id, up.user_id
        FROM user_position up
        WHERE up.position_id = ANY(%s::uuid[])
          AND up.status = 'active'
          AND up.user_id != %s
    """, (list(position_ids), requesting_user_id))

    if not adopters:
        adopters = []

    # Step 2: Batch check ALL unique user IDs against Redis (very fast pipeline)
    all_user_ids = list({str(a["user_id"]) for a in adopters})
    swiping_users = presence.get_swiping_users(all_user_ids)
    in_app_users = presence.get_in_app_users(all_user_ids)

    # Step 3: Group by position and find online adopters
    by_position = {}
    for a in adopters:
        pid = str(a["position_id"])
        if pid not in by_position:
            by_position[pid] = []
        by_position[pid].append(a)

    positions_needing_notification_check = []

    for pid in position_ids:
        candidates = by_position.get(pid, [])
        if not candidates:
            continue

        # Find swiping adopters first (best match)
        swiping = [c for c in candidates if str(c["user_id"]) in swiping_users]
        if swiping:
            pick = random.choice(swiping)
            result[pid] = {"availability": "online", "userPositionId": str(pick["user_position_id"])}
            continue

        # Then in-app adopters
        in_app = [c for c in candidates if str(c["user_id"]) in in_app_users]
        if in_app:
            pick = random.choice(in_app)
            result[pid] = {"availability": "online", "userPositionId": str(pick["user_position_id"])}
            continue

        # No online adopter — remember for notification check
        positions_needing_notification_check.append(pid)

    # Step 4: For positions with no online adopter, check notification eligibility
    # This requires full user columns, so we sample to keep the query bounded
    if positions_needing_notification_check:
        notif_adopters = db.execute_query("""
            SELECT sub.position_id, sub.user_position_id, sub.user_id,
                   u.notifications_enabled, u.quiet_hours_start, u.quiet_hours_end,
                   u.timezone, u.notification_frequency, u.notifications_sent_today,
                   u.notifications_sent_date
            FROM (
                SELECT up.position_id, up.id as user_position_id, up.user_id,
                       ROW_NUMBER() OVER (PARTITION BY up.position_id ORDER BY RANDOM()) as rn
                FROM user_position up
                WHERE up.position_id = ANY(%s::uuid[])
                  AND up.status = 'active'
                  AND up.user_id != %s
            ) sub
            JOIN users u ON sub.user_id = u.id
            WHERE sub.rn <= 10
              AND u.status = 'active'
              AND u.notifications_enabled = true
        """, (positions_needing_notification_check, requesting_user_id))

        if notif_adopters:
            notif_by_pos = {}
            for a in notif_adopters:
                pid = str(a["position_id"])
                if pid not in notif_by_pos:
                    notif_by_pos[pid] = []
                notif_by_pos[pid].append(a)

            for pid in positions_needing_notification_check:
                candidates = notif_by_pos.get(pid, [])
                notifiable = [c for c in candidates if _is_notifiable(c)]
                if notifiable:
                    pick = random.choice(notifiable)
                    result[pid] = {"availability": "notifiable", "userPositionId": str(pick["user_position_id"])}

    # Step 5: For positions still "none", check agree-voters as fallback
    none_positions = [pid for pid in position_ids if result[pid]["availability"] == "none"]
    if none_positions:
        # Get all agree-voter user IDs (lightweight)
        voters = db.execute_query("""
            SELECT r.position_id, r.user_id
            FROM response r
            JOIN users u ON r.user_id = u.id
            WHERE r.position_id = ANY(%s::uuid[])
              AND r.response = 'agree'
              AND r.user_id != %s
              AND u.status = 'active'
        """, (none_positions, requesting_user_id))

        if voters:
            voter_user_ids = list({str(v["user_id"]) for v in voters})
            voter_swiping = presence.get_swiping_users(voter_user_ids)
            voter_in_app = presence.get_in_app_users(voter_user_ids)

            voters_by_pos = {}
            for v in voters:
                pid = str(v["position_id"])
                if pid not in voters_by_pos:
                    voters_by_pos[pid] = []
                voters_by_pos[pid].append(v)

            for pid in none_positions:
                vcandidates = voters_by_pos.get(pid, [])

                swiping_v = [v for v in vcandidates if str(v["user_id"]) in voter_swiping]
                if swiping_v:
                    # Voters don't have user_position_id, keep existing
                    result[pid]["availability"] = "online"
                    continue

                in_app_v = [v for v in vcandidates if str(v["user_id"]) in voter_in_app]
                if in_app_v:
                    result[pid]["availability"] = "online"

    return result


def _weighted_random_select(candidates):
    """Select a candidate using weighted random selection with jitter."""
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    weights = []
    for c in candidates:
        w = c["weight"] * random.uniform(0.7, 1.3)  # +/-30% jitter
        weights.append(max(w, 0.01))

    total = sum(weights)
    r = random.uniform(0, total)
    cumulative = 0
    for c, w in zip(candidates, weights):
        cumulative += w
        if r <= cumulative:
            return c
    return candidates[-1]  # fallback


def _is_notifiable(user_row):
    """Check if a user is eligible for push notifications right now."""
    if not user_row.get("notifications_enabled"):
        return False

    freq = user_row.get("notification_frequency", 3)
    cap = FREQUENCY_CAPS.get(freq, 10)
    if cap == 0:
        return False

    # Check daily cap (reset if date changed)
    today = datetime.now().date()
    sent_date = user_row.get("notifications_sent_date")
    sent_today = user_row.get("notifications_sent_today", 0)

    if sent_date and sent_date == today:
        if sent_today >= cap:
            return False
    # If different date, counter is effectively 0

    # Check quiet hours
    tz_name = user_row.get("timezone") or "America/New_York"
    quiet_start = user_row.get("quiet_hours_start")
    quiet_end = user_row.get("quiet_hours_end")

    if quiet_start is not None and quiet_end is not None:
        try:
            tz = ZoneInfo(tz_name)
            now_local = datetime.now(tz)
            current_hour = now_local.hour

            if quiet_start <= quiet_end:
                # Simple range (e.g., 8-22 means quiet during 8-22)
                if quiet_start <= current_hour < quiet_end:
                    return False
            else:
                # Wraps midnight (e.g., 22-7 means 22,23,0,1,2,3,4,5,6)
                if current_hour >= quiet_start or current_hour < quiet_end:
                    return False
        except Exception:
            pass  # Invalid timezone, skip quiet hours check

    return True
