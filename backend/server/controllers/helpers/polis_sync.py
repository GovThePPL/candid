"""
Polis Sync Service

Handles async syncing of positions and votes to Polis conversations.
Uses a queue-based approach for reliability and graceful degradation.
"""

import json
import uuid
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from typing import Optional, List, Dict, Any, Tuple

from candid.controllers import db, config
from candid.controllers.helpers.polis_client import (
    PolisClient, PolisError, PolisUnavailableError, get_client
)


# Vote mapping: Candid response -> Polis vote value
# agree = -1 (pull toward), disagree = 1 (push away), pass = 0 (neutral)
VOTE_MAPPING = {
    "agree": -1,
    "disagree": 1,
    "pass": 0,
}


def generate_xid(user_id: str) -> str:
    """Generate Polis XID from Candid user ID."""
    return f"candid:{user_id}"


# ========== Queue Operations (called from controllers) ==========

def queue_position_sync(
    position_id: str,
    statement: str,
    category_id: str,
    location_id: str,
    creator_user_id: str
) -> bool:
    """
    Queue a position for async sync to Polis.
    Called immediately after position is created in DB.

    Returns True if queued successfully (always succeeds locally).
    """
    if not config.POLIS_ENABLED:
        return False

    payload = {
        "position_id": position_id,
        "statement": statement,
        "category_id": category_id,
        "location_id": location_id,
        "creator_user_id": creator_user_id,
    }

    try:
        db.execute_query("""
            INSERT INTO polis_sync_queue (id, operation_type, payload, status)
            VALUES (%s, 'position', %s, 'pending')
        """, (str(uuid.uuid4()), json.dumps(payload)))
        return True
    except Exception:
        return False


def queue_vote_sync(position_id: str, user_id: str, response: str) -> bool:
    """
    Queue a vote for async sync to Polis.
    Called immediately after response is recorded in DB.

    Returns True if queued successfully.
    """
    if not config.POLIS_ENABLED:
        return False

    # Skip chat responses - they don't map to Polis votes
    if response == "chat":
        return False

    polis_vote = VOTE_MAPPING.get(response)
    if polis_vote is None:
        return False

    payload = {
        "position_id": position_id,
        "user_id": user_id,
        "response": response,
        "polis_vote": polis_vote,
    }

    try:
        db.execute_query("""
            INSERT INTO polis_sync_queue (id, operation_type, payload, status)
            VALUES (%s, 'vote', %s, 'pending')
        """, (str(uuid.uuid4()), json.dumps(payload)))
        return True
    except Exception:
        return False


# ========== Time-Window Management ==========

def get_active_window_dates() -> Tuple[date, date]:
    """Get the active_from and active_until dates for a new conversation."""
    today = date.today()
    active_from = today.replace(day=1)  # First of current month
    active_until = active_from + relativedelta(months=config.POLIS_CONVERSATION_WINDOW_MONTHS)
    return active_from, active_until


def get_active_conversations(
    location_id: str,
    category_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get all active conversations for a location+category combination.
    Returns up to 6 conversations (one per month in the window).

    Args:
        location_id: The location UUID
        category_id: The category UUID (None for location-only conversations)
    """
    today = date.today()

    if category_id:
        result = db.execute_query("""
            SELECT id, polis_conversation_id, active_from, active_until
            FROM polis_conversation
            WHERE location_id = %s
              AND category_id = %s
              AND status = 'active'
              AND active_from <= %s
              AND active_until > %s
            ORDER BY active_from ASC
        """, (location_id, category_id, today, today))
    else:
        result = db.execute_query("""
            SELECT id, polis_conversation_id, active_from, active_until
            FROM polis_conversation
            WHERE location_id = %s
              AND category_id IS NULL
              AND conversation_type = 'location_all'
              AND status = 'active'
              AND active_from <= %s
              AND active_until > %s
            ORDER BY active_from ASC
        """, (location_id, today, today))

    return result or []


def get_oldest_active_conversation(
    location_id: str,
    category_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Get the oldest active conversation for reads (broadest range of positions).
    """
    conversations = get_active_conversations(location_id, category_id)
    return conversations[0] if conversations else None


def get_or_create_conversation(
    location_id: str,
    category_id: Optional[str],
    location_name: str,
    category_name: Optional[str] = None
) -> Optional[str]:
    """
    Get or create a Polis conversation for the current month.

    Args:
        location_id: The location UUID
        category_id: The category UUID (None for location-only)
        location_name: Human-readable location name
        category_name: Human-readable category name (None for location-only)

    Returns:
        The polis_conversation_id, or None if creation failed
    """
    active_from, active_until = get_active_window_dates()

    # Check if conversation already exists for this month
    if category_id:
        existing = db.execute_query("""
            SELECT polis_conversation_id FROM polis_conversation
            WHERE location_id = %s AND category_id = %s AND active_from = %s
        """, (location_id, category_id, active_from), fetchone=True)
    else:
        existing = db.execute_query("""
            SELECT polis_conversation_id FROM polis_conversation
            WHERE location_id = %s AND category_id IS NULL AND active_from = %s
        """, (location_id, active_from), fetchone=True)

    if existing:
        return existing["polis_conversation_id"]

    # Create new Polis conversation
    try:
        client = get_client()

        if category_id:
            topic = f"{location_name}: {category_name}"
            conversation_type = "category"
        else:
            topic = f"{location_name}: All Topics"
            conversation_type = "location_all"

        description = f"Active from {active_from} to {active_until}"
        polis_conv_id = client.create_conversation(topic, description)

        if not polis_conv_id:
            return None

        # Store mapping
        db.execute_query("""
            INSERT INTO polis_conversation
            (id, location_id, category_id, polis_conversation_id, conversation_type, active_from, active_until)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            str(uuid.uuid4()),
            location_id,
            category_id,
            polis_conv_id,
            conversation_type,
            active_from,
            active_until
        ))

        return polis_conv_id

    except PolisError as e:
        print(f"Failed to create Polis conversation: {e}", flush=True)
        return None


# ========== Sync Operations (called by worker) ==========

def sync_position(payload: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Sync a position to all active Polis conversations.

    Returns (success, error_message)
    """
    position_id = payload["position_id"]
    statement = payload["statement"]
    category_id = payload["category_id"]
    location_id = payload["location_id"]
    creator_user_id = payload["creator_user_id"]

    # Get location and category names for conversation titles
    location = db.execute_query(
        "SELECT name FROM location WHERE id = %s",
        (location_id,), fetchone=True
    )
    category = db.execute_query(
        "SELECT label FROM position_category WHERE id = %s",
        (category_id,), fetchone=True
    )

    if not location or not category:
        return False, "Location or category not found"

    location_name = location["name"]
    category_name = category["label"]

    xid = generate_xid(creator_user_id)
    client = get_client()

    synced_count = 0
    errors = []

    # Sync to category+location conversations (up to 6)
    category_convs = get_active_conversations(location_id, category_id)
    for conv in category_convs:
        try:
            tid = client.create_comment(conv["polis_conversation_id"], statement, xid)
            if tid is not None:
                db.execute_query("""
                    INSERT INTO polis_comment (id, position_id, polis_conversation_id, polis_comment_tid)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (position_id, polis_conversation_id) DO NOTHING
                """, (str(uuid.uuid4()), position_id, conv["polis_conversation_id"], tid))
                synced_count += 1
        except PolisError as e:
            errors.append(f"Category conv {conv['polis_conversation_id']}: {e}")

    # If no category conversations exist, create one for current month
    if not category_convs:
        polis_conv_id = get_or_create_conversation(
            location_id, category_id, location_name, category_name
        )
        if polis_conv_id:
            try:
                tid = client.create_comment(polis_conv_id, statement, xid)
                if tid is not None:
                    db.execute_query("""
                        INSERT INTO polis_comment (id, position_id, polis_conversation_id, polis_comment_tid)
                        VALUES (%s, %s, %s, %s)
                    """, (str(uuid.uuid4()), position_id, polis_conv_id, tid))
                    synced_count += 1
            except PolisError as e:
                errors.append(f"New category conv: {e}")

    # Sync to location-only conversations (up to 6)
    location_convs = get_active_conversations(location_id, None)
    for conv in location_convs:
        try:
            tid = client.create_comment(conv["polis_conversation_id"], statement, xid)
            if tid is not None:
                db.execute_query("""
                    INSERT INTO polis_comment (id, position_id, polis_conversation_id, polis_comment_tid)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (position_id, polis_conversation_id) DO NOTHING
                """, (str(uuid.uuid4()), position_id, conv["polis_conversation_id"], tid))
                synced_count += 1
        except PolisError as e:
            errors.append(f"Location conv {conv['polis_conversation_id']}: {e}")

    # If no location-only conversations exist, create one
    if not location_convs:
        polis_conv_id = get_or_create_conversation(location_id, None, location_name)
        if polis_conv_id:
            try:
                tid = client.create_comment(polis_conv_id, statement, xid)
                if tid is not None:
                    db.execute_query("""
                        INSERT INTO polis_comment (id, position_id, polis_conversation_id, polis_comment_tid)
                        VALUES (%s, %s, %s, %s)
                    """, (str(uuid.uuid4()), position_id, polis_conv_id, tid))
                    synced_count += 1
            except PolisError as e:
                errors.append(f"New location conv: {e}")

    if synced_count > 0:
        if errors:
            return True, f"Partial sync ({synced_count} succeeded): {'; '.join(errors)}"
        return True, None
    else:
        return False, "; ".join(errors) if errors else "No conversations available"


def sync_vote(payload: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Sync a vote to all active Polis conversations where the position exists.

    Returns (success, error_message)
    """
    position_id = payload["position_id"]
    user_id = payload["user_id"]
    polis_vote = payload["polis_vote"]

    xid = generate_xid(user_id)
    client = get_client()

    # Get all Polis comments for this position
    comments = db.execute_query("""
        SELECT pc.polis_conversation_id, pc.polis_comment_tid
        FROM polis_comment pc
        JOIN polis_conversation pconv ON pc.polis_conversation_id = pconv.polis_conversation_id
        WHERE pc.position_id = %s AND pconv.status = 'active'
    """, (position_id,))

    if not comments:
        return True, None  # No Polis comments to vote on (position not synced yet)

    synced_count = 0
    errors = []

    for comment in comments:
        try:
            success = client.submit_vote(
                comment["polis_conversation_id"],
                comment["polis_comment_tid"],
                polis_vote,
                xid
            )
            if success:
                synced_count += 1
            else:
                errors.append(f"Conv {comment['polis_conversation_id']}: vote submission failed")
        except PolisError as e:
            errors.append(f"Conv {comment['polis_conversation_id']}: {e}")

    if synced_count > 0:
        if errors:
            return True, f"Partial sync ({synced_count}/{len(comments)}): {'; '.join(errors)}"
        return True, None
    else:
        return False, "; ".join(errors) if errors else "No votes synced"


# ========== Read Operations (for card queue) ==========

def get_unvoted_positions_for_user(
    user_id: str,
    location_id: str,
    category_priorities: Dict[str, int],
    limit: int = 10
) -> List[Dict[str, Any]]:
    """
    Get positions the user hasn't voted on, weighted by category priority.
    Reads from the oldest active conversation for broadest range.

    Args:
        user_id: The Candid user UUID
        location_id: The user's location UUID
        category_priorities: Dict of category_id -> priority (0-5)
        limit: Maximum positions to return

    Returns:
        List of position dicts with id, statement, category_id, creator info
    """
    if not config.POLIS_ENABLED:
        return _get_unvoted_positions_from_db(user_id, location_id, category_priorities, limit)

    xid = generate_xid(user_id)
    client = get_client()
    positions = []

    # Get positions from each category based on priority
    for category_id, priority in category_priorities.items():
        if priority == 0:
            continue  # Skip categories with no priority

        conv = get_oldest_active_conversation(location_id, category_id)
        if not conv:
            # No Polis conversation exists yet, fall back to DB for this category
            db_positions = _get_unvoted_positions_from_db(
                user_id, location_id, {category_id: priority}, limit=5
            )
            positions.extend(db_positions)
            continue

        try:
            unvoted = client.get_unvoted_comments(conv["polis_conversation_id"], xid)

            # Map back to Candid positions
            for comment in unvoted:
                position = _polis_comment_to_position(comment, category_id)
                if position:
                    position["weight"] = priority
                    positions.append(position)

        except PolisError as e:
            print(f"Error fetching unvoted from Polis: {e}", flush=True)
            # Fall back to DB query for this category
            db_positions = _get_unvoted_positions_from_db(
                user_id, location_id, {category_id: priority}, limit=5
            )
            positions.extend(db_positions)

    # Weight and select positions
    return _weighted_sample(positions, limit)


def _get_unvoted_positions_from_db(
    user_id: str,
    location_id: str,
    category_priorities: Dict[str, int],
    limit: int = 10
) -> List[Dict[str, Any]]:
    """Fallback: Get unvoted positions directly from Candid DB.

    Includes positions from the user's location and all parent locations.
    """
    category_ids = [cid for cid, priority in category_priorities.items() if priority > 0]

    if not category_ids:
        return []

    positions = db.execute_query("""
        WITH RECURSIVE location_hierarchy AS (
            -- Start with user's location
            SELECT id, parent_location_id FROM location WHERE id = %s::uuid
            UNION ALL
            -- Recursively get parent locations
            SELECT l.id, l.parent_location_id
            FROM location l
            JOIN location_hierarchy lh ON l.id = lh.parent_location_id
        )
        SELECT p.id, p.statement, p.category_id, p.creator_user_id,
               u.display_name as creator_display_name, u.username as creator_username,
               u.status as creator_status, u.trust_score as creator_trust_score,
               COALESCE((
                   SELECT COUNT(*) FROM kudos k
                   WHERE k.receiver_user_id = u.id AND k.status = 'sent'
               ), 0) as creator_kudos_count,
               pc.label as category_name, l.code as location_code, l.name as location_name,
               up.id as user_position_id
        FROM position p
        JOIN users u ON p.creator_user_id = u.id
        LEFT JOIN position_category pc ON p.category_id = pc.id
        LEFT JOIN location l ON p.location_id = l.id
        LEFT JOIN response r ON r.position_id = p.id AND r.user_id = %s
        -- Get an active user_position for chat requests (prefer creator's)
        LEFT JOIN LATERAL (
            SELECT up.id FROM user_position up
            WHERE up.position_id = p.id AND up.status = 'active'
            ORDER BY CASE WHEN up.user_id = p.creator_user_id THEN 0 ELSE 1 END
            LIMIT 1
        ) up ON true
        WHERE p.location_id IN (SELECT id FROM location_hierarchy)
          AND p.category_id = ANY(%s::uuid[])
          AND p.status = 'active'
          AND r.id IS NULL
          AND p.creator_user_id != %s
        ORDER BY p.created_time DESC
        LIMIT %s
    """, (location_id, user_id, category_ids, user_id, limit))

    result = []
    for p in (positions or []):
        result.append({
            "id": str(p["id"]),
            "statement": p["statement"],
            "category_id": str(p["category_id"]),
            "category_name": p["category_name"],
            "location_code": p["location_code"],
            "location_name": p["location_name"],
            "creator_user_id": str(p["creator_user_id"]),
            "creator_display_name": p["creator_display_name"],
            "creator_username": p["creator_username"],
            "creator_status": p["creator_status"],
            "creator_kudos_count": p["creator_kudos_count"],
            "creator_trust_score": float(p["creator_trust_score"]) if p.get("creator_trust_score") is not None else None,
            "user_position_id": str(p["user_position_id"]) if p.get("user_position_id") else None,
            "weight": category_priorities.get(str(p["category_id"]), 1),
        })

    return result


def _polis_comment_to_position(
    comment: Dict[str, Any],
    category_id: str
) -> Optional[Dict[str, Any]]:
    """Map a Polis comment back to a Candid position."""
    tid = comment.get("tid")
    if tid is None:
        return None

    # Look up the position from our mapping table
    mapping = db.execute_query("""
        SELECT pc.position_id, p.statement, p.creator_user_id,
               u.display_name, u.username, u.status, u.trust_score,
               COALESCE((
                   SELECT COUNT(*) FROM kudos k
                   WHERE k.receiver_user_id = u.id AND k.status = 'sent'
               ), 0) as kudos_count,
               pcat.label as category_name, l.code as location_code, l.name as location_name,
               up.id as user_position_id
        FROM polis_comment pc
        JOIN position p ON pc.position_id = p.id
        JOIN users u ON p.creator_user_id = u.id
        LEFT JOIN position_category pcat ON p.category_id = pcat.id
        LEFT JOIN location l ON p.location_id = l.id
        -- Get an active user_position for chat requests (prefer creator's)
        LEFT JOIN LATERAL (
            SELECT up.id FROM user_position up
            WHERE up.position_id = p.id AND up.status = 'active'
            ORDER BY CASE WHEN up.user_id = p.creator_user_id THEN 0 ELSE 1 END
            LIMIT 1
        ) up ON true
        WHERE pc.polis_comment_tid = %s AND p.category_id = %s
        LIMIT 1
    """, (tid, category_id), fetchone=True)

    if not mapping:
        return None

    return {
        "id": str(mapping["position_id"]),
        "statement": mapping["statement"],
        "category_id": category_id,
        "category_name": mapping["category_name"],
        "location_code": mapping["location_code"],
        "location_name": mapping["location_name"],
        "creator_user_id": str(mapping["creator_user_id"]),
        "creator_display_name": mapping["display_name"],
        "creator_username": mapping["username"],
        "creator_status": mapping["status"],
        "creator_kudos_count": mapping["kudos_count"],
        "creator_trust_score": float(mapping["trust_score"]) if mapping.get("trust_score") is not None else None,
        "user_position_id": str(mapping["user_position_id"]) if mapping.get("user_position_id") else None,
    }


def _weighted_sample(positions: List[Dict], limit: int) -> List[Dict]:
    """Sample positions weighted by their priority."""
    import random

    if len(positions) <= limit:
        return positions

    # Use weights for random selection
    weights = [p.get("weight", 1) for p in positions]
    total = sum(weights)
    if total == 0:
        return positions[:limit]

    # Normalize weights
    probs = [w / total for w in weights]

    # Weighted sampling without replacement
    selected = []
    available = list(range(len(positions)))

    for _ in range(min(limit, len(positions))):
        if not available:
            break

        # Calculate remaining probabilities
        remaining_probs = [probs[i] for i in available]
        total_prob = sum(remaining_probs)
        if total_prob == 0:
            break
        normalized = [p / total_prob for p in remaining_probs]

        # Select one
        r = random.random()
        cumulative = 0
        for idx, prob in enumerate(normalized):
            cumulative += prob
            if r <= cumulative:
                selected_idx = available[idx]
                selected.append(positions[selected_idx])
                available.remove(selected_idx)
                break

    return selected


# ========== Position Adoption ==========

def sync_adopted_position(user_id: str, position_id: str) -> bool:
    """
    Sync an adopted position to current active conversations.
    Called when a user adopts an old position from an expired conversation.
    """
    # Get position details
    position = db.execute_query("""
        SELECT p.statement, p.category_id, p.location_id
        FROM position p
        WHERE p.id = %s
    """, (position_id,), fetchone=True)

    if not position:
        return False

    # Queue for async sync
    return queue_position_sync(
        position_id=position_id,
        statement=position["statement"],
        category_id=str(position["category_id"]),
        location_id=str(position["location_id"]),
        creator_user_id=user_id  # The adopter becomes the creator in new conversations
    )
