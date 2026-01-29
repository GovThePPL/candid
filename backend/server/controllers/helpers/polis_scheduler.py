"""
Polis Scheduler

Handles time-windowed conversation lifecycle:
- Monthly creation of new conversations
- Daily expiration of old conversations
- Cleanup of expired data
"""

import uuid
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from typing import List, Dict, Any

from candid.controllers import db, config
from candid.controllers.helpers.polis_client import get_client, PolisError


def create_monthly_conversations() -> Dict[str, Any]:
    """
    Create new Polis conversations for the current month.
    Should be run on the 1st of each month via cron.

    Creates conversations for all active location+category combinations
    that have had activity in the past 6 months.

    Returns summary of created conversations.
    """
    today = date.today()
    active_from = today.replace(day=1)
    active_until = active_from + relativedelta(months=config.POLIS_CONVERSATION_WINDOW_MONTHS)

    # Find location+category combos with recent positions
    lookback = today - relativedelta(months=6)

    active_combos = db.execute_query("""
        SELECT DISTINCT
            p.location_id,
            p.category_id,
            l.name as location_name,
            pc.label as category_name
        FROM position p
        JOIN location l ON p.location_id = l.id
        JOIN position_category pc ON p.category_id = pc.id
        WHERE p.created_time >= %s
          AND p.status = 'active'
    """, (lookback,))

    if not active_combos:
        return {"created": 0, "errors": []}

    client = get_client()
    created = 0
    errors = []

    for combo in active_combos:
        location_id = str(combo["location_id"])
        category_id = str(combo["category_id"])
        location_name = combo["location_name"]
        category_name = combo["category_name"]

        # Check if conversation already exists for this month
        existing = db.execute_query("""
            SELECT id FROM polis_conversation
            WHERE location_id = %s AND category_id = %s AND active_from = %s
        """, (location_id, category_id, active_from), fetchone=True)

        if existing:
            continue

        # Create category+location conversation
        try:
            topic = f"{location_name}: {category_name}"
            description = f"Active from {active_from} to {active_until}"
            polis_conv_id = client.create_conversation(topic, description)

            if polis_conv_id:
                db.execute_query("""
                    INSERT INTO polis_conversation
                    (id, location_id, category_id, polis_conversation_id, conversation_type, active_from, active_until)
                    VALUES (%s, %s, %s, %s, 'category', %s, %s)
                """, (str(uuid.uuid4()), location_id, category_id, polis_conv_id, active_from, active_until))
                created += 1
        except PolisError as e:
            errors.append(f"{location_name}/{category_name}: {e}")

    # Create location-only conversations for active locations
    active_locations = db.execute_query("""
        SELECT DISTINCT
            p.location_id,
            l.name as location_name
        FROM position p
        JOIN location l ON p.location_id = l.id
        WHERE p.created_time >= %s
          AND p.status = 'active'
    """, (lookback,))

    for loc in (active_locations or []):
        location_id = str(loc["location_id"])
        location_name = loc["location_name"]

        # Check if location-only conversation exists
        existing = db.execute_query("""
            SELECT id FROM polis_conversation
            WHERE location_id = %s AND category_id IS NULL AND active_from = %s
        """, (location_id, active_from), fetchone=True)

        if existing:
            continue

        try:
            topic = f"{location_name}: All Topics"
            description = f"Active from {active_from} to {active_until}"
            polis_conv_id = client.create_conversation(topic, description)

            if polis_conv_id:
                db.execute_query("""
                    INSERT INTO polis_conversation
                    (id, location_id, category_id, polis_conversation_id, conversation_type, active_from, active_until)
                    VALUES (%s, %s, NULL, %s, 'location_all', %s, %s)
                """, (str(uuid.uuid4()), location_id, polis_conv_id, active_from, active_until))
                created += 1
        except PolisError as e:
            errors.append(f"{location_name}/All: {e}")

    return {
        "created": created,
        "errors": errors,
        "active_from": str(active_from),
        "active_until": str(active_until),
    }


def expire_old_conversations() -> Dict[str, Any]:
    """
    Mark conversations past their active_until date as expired.
    Should be run daily via cron.

    Returns summary of expired conversations.
    """
    today = date.today()

    # Find and expire old conversations
    expired = db.execute_query("""
        UPDATE polis_conversation
        SET status = 'expired'
        WHERE status = 'active'
          AND active_until <= %s
        RETURNING id, polis_conversation_id, location_id, category_id
    """, (today,))

    # Note: We don't deactivate conversations in Polis itself,
    # as historical data should remain accessible

    return {
        "expired_count": len(expired) if expired else 0,
        "conversations": [str(e["id"]) for e in (expired or [])],
    }


def cleanup_expired_data(days_after_expiry: int = 30) -> Dict[str, Any]:
    """
    Optional cleanup of Polis mappings for long-expired conversations.
    Removes polis_comment and polis_participant records for conversations
    that expired more than N days ago.

    This is optional - expired data can be kept indefinitely for historical reference.

    Returns summary of cleaned up data.
    """
    cutoff = date.today() - timedelta(days=days_after_expiry)

    # Get expired conversation IDs
    expired_convs = db.execute_query("""
        SELECT polis_conversation_id
        FROM polis_conversation
        WHERE status = 'expired'
          AND active_until < %s
    """, (cutoff,))

    if not expired_convs:
        return {"cleaned_comments": 0, "cleaned_participants": 0}

    conv_ids = [c["polis_conversation_id"] for c in expired_convs]

    # Clean up comments
    db.execute_query("""
        DELETE FROM polis_comment
        WHERE polis_conversation_id = ANY(%s)
    """, (conv_ids,))

    # Clean up participants
    db.execute_query("""
        DELETE FROM polis_participant
        WHERE polis_conversation_id = ANY(%s)
    """, (conv_ids,))

    return {
        "cleaned_conversations": len(conv_ids),
        "cutoff_date": str(cutoff),
    }


def get_conversation_stats() -> Dict[str, Any]:
    """Get statistics about Polis conversations."""
    stats = db.execute_query("""
        SELECT
            status,
            conversation_type,
            COUNT(*) as count
        FROM polis_conversation
        GROUP BY status, conversation_type
        ORDER BY status, conversation_type
    """)

    active_count = db.execute_query("""
        SELECT COUNT(DISTINCT location_id) as locations,
               COUNT(DISTINCT category_id) as categories
        FROM polis_conversation
        WHERE status = 'active'
    """, fetchone=True)

    return {
        "by_status_and_type": [dict(s) for s in (stats or [])],
        "active_locations": active_count["locations"] if active_count else 0,
        "active_categories": active_count["categories"] if active_count else 0,
    }


def get_conversations_for_location(location_id: str) -> List[Dict[str, Any]]:
    """Get all conversations for a location (for admin/debugging)."""
    convs = db.execute_query("""
        SELECT
            pc.id,
            pc.polis_conversation_id,
            pc.conversation_type,
            pc.active_from,
            pc.active_until,
            pc.status,
            cat.label as category_name
        FROM polis_conversation pc
        LEFT JOIN position_category cat ON pc.category_id = cat.id
        WHERE pc.location_id = %s
        ORDER BY pc.active_from DESC, pc.conversation_type
    """, (location_id,))

    return [dict(c) for c in (convs or [])]
