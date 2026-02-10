import connexion
import time
from typing import Dict, List, Tuple, Union

from candid import util

from candid.controllers import db
from candid.controllers.helpers.config import Config
from candid.controllers.helpers.auth import authorization, authorization_allow_banned, token_to_user
from candid.controllers.helpers import polis_sync
from candid.controllers.helpers import presence
from candid.controllers.helpers.chat_availability import get_batch_availability
from candid.controllers.moderation_controller import _get_target_content
import itertools
import random


# Demographic field questions (options come from the database schema)
# Keys are DB column names (snake_case)
DEMOGRAPHIC_QUESTIONS = {
    'lean': 'What is your political lean?',
    'education': 'What is your highest level of education?',
    'geo_locale': 'How would you describe where you live?',
    'sex': 'What is your sex?',
}

# Map DB column names to camelCase API field names for card responses
_DB_TO_API_FIELD = {
    'lean': 'lean',
    'education': 'education',
    'geo_locale': 'geoLocale',
    'sex': 'sex',
}

# Cached demographic options from database schema
_demographic_options_cache = None


def _get_demographic_options():
    """Get demographic field options from database schema CHECK constraints."""
    global _demographic_options_cache
    if _demographic_options_cache is not None:
        return _demographic_options_cache

    # Query the database to get CHECK constraint values for each demographic column
    result = db.execute_query("""
        SELECT
            a.attname as column_name,
            pg_get_constraintdef(c.oid) as constraint_def
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
        WHERE t.relname = 'user_demographics'
          AND c.contype = 'c'
          AND a.attname IN ('lean', 'education', 'geo_locale', 'sex')
    """)

    options = {}
    import re

    for row in (result or []):
        col_name = row['column_name']
        constraint_def = row['constraint_def']

        # Parse CHECK constraint to extract values
        # Format: CHECK (((column_name)::text = ANY ((ARRAY['val1'::character varying, 'val2'::character varying, ...])::text[])))
        match = re.search(r"ARRAY\[([^\]]+)\]", constraint_def)
        if match:
            values_str = match.group(1)
            # Extract values from 'value'::character varying format
            values = re.findall(r"'([^']+)'", values_str)
            options[col_name] = [
                {'value': v, 'label': _value_to_label(v)}
                for v in values
            ]

    _demographic_options_cache = options
    return options


def _value_to_label(value: str) -> str:
    """Convert a snake_case value to a human-readable label."""
    return value.replace('_', ' ').title()


def _get_ban_notification(user_id):
    """Check if user is banned and return a ban notification card."""
    # Combined query: user status + ban details + active appeal in one round-trip
    # For non-banned users (99%+), the LEFT JOINs return NULLs and we bail out early
    ban_info = db.execute_query("""
        SELECT u.status,
               mac.action, mac.action_end_time, mac.action_start_time,
               ma.mod_response_text, ma.id as mod_action_id,
               r.title as rule_title,
               rp.target_object_type, rp.target_object_id,
               appeal.id as appeal_id
        FROM users u
        LEFT JOIN LATERAL (
            SELECT mat.id, mat.mod_action_class_id FROM mod_action_target mat
            WHERE mat.user_id = u.id
            ORDER BY mat.id DESC LIMIT 1
        ) mat ON u.status = 'banned'
        LEFT JOIN mod_action_class mac ON mat.mod_action_class_id = mac.id
            AND mac.action IN ('permanent_ban', 'temporary_ban')
        LEFT JOIN mod_action ma ON mac.mod_action_id = ma.id
        LEFT JOIN report rp ON ma.report_id = rp.id
        LEFT JOIN rule r ON rp.rule_id = r.id
        LEFT JOIN mod_action_appeal appeal
            ON appeal.mod_action_id = ma.id AND appeal.user_id = u.id AND appeal.status = 'active'
        WHERE u.id = %s
    """, (user_id,), fetchone=True)

    if not ban_info or ban_info['status'] != 'banned':
        return None

    has_appealed = ban_info.get('appeal_id') is not None

    # Fetch target content (the position/chat that caused the ban)
    target_content = None
    if ban_info and ban_info.get('target_object_type') and ban_info.get('target_object_id'):
        target_content = _get_target_content(
            ban_info['target_object_type'], str(ban_info['target_object_id'])
        )

    # Build action chain (privacy-filtered, no moderator/reporter names)
    action_chain = None
    if ban_info:
        # Compute duration for temporary bans
        duration_days = None
        if ban_info['action'] == 'temporary_ban' and ban_info.get('action_start_time') and ban_info.get('action_end_time'):
            delta = ban_info['action_end_time'] - ban_info['action_start_time']
            duration_days = max(1, round(delta.total_seconds() / 86400))

        action_chain = {
            'actionType': ban_info['action'],
            'actionDate': ban_info['action_start_time'].isoformat() if ban_info.get('action_start_time') else None,
            'durationDays': duration_days,
            'ruleTitle': ban_info.get('rule_title'),
            'moderatorComment': ban_info.get('mod_response_text'),
        }

        # Fetch appeal info + responses + responder roles in combined queries
        if ban_info.get('appeal_id') and ban_info.get('mod_action_id'):
            appeal = db.execute_query("""
                SELECT id, appeal_state, appeal_text
                FROM mod_action_appeal
                WHERE id = %s
            """, (ban_info['appeal_id'],), fetchone=True)

            if appeal:
                action_chain['appealState'] = appeal['appeal_state']
                action_chain['appealText'] = appeal['appeal_text']

                # Fetch appeal responses with responder roles and original mod in one query
                responses = db.execute_query("""
                    SELECT r.appeal_response_text, r.created_time,
                           r.responder_user_id, u.user_type,
                           ma.responder_user_id as original_mod_id
                    FROM mod_action_appeal_response r
                    JOIN users u ON r.responder_user_id = u.id
                    CROSS JOIN mod_action ma
                    WHERE r.mod_action_appeal_id = %s AND ma.id = %s
                    ORDER BY r.created_time ASC
                """, (appeal['id'], ban_info['mod_action_id']))

                appeal_responses = []
                resp_list = responses or []
                for idx, resp in enumerate(resp_list):
                    responder_id = str(resp['responder_user_id'])
                    original_mod_id = str(resp['original_mod_id']) if resp.get('original_mod_id') else None
                    is_admin = resp.get('user_type') == 'admin'

                    if is_admin:
                        role = 'Admin'
                    elif responder_id == original_mod_id:
                        role = 'Original Moderator'
                    else:
                        role = 'Second Moderator'

                    outcome = None
                    if appeal['appeal_state'] in ('overruled', 'escalated', 'denied', 'approved', 'modified'):
                        if len(resp_list) >= 2 and idx == 0:
                            outcome = 'overruled'
                        elif len(resp_list) >= 2 and idx == 1:
                            outcome = 'escalated'
                        elif len(resp_list) >= 3 and idx == 2:
                            outcome = 'admin_decision'
                        elif len(resp_list) == 1:
                            outcome = 'admin_decision' if appeal['appeal_state'] in ('approved', 'denied', 'modified') else None

                    appeal_responses.append({
                        'role': role,
                        'responseText': resp.get('appeal_response_text'),
                        'outcome': outcome,
                    })

                action_chain['appealResponses'] = appeal_responses if appeal_responses else None

    data = {
        'banType': ban_info['action'] if ban_info else 'permanent_ban',
        'reason': ban_info.get('mod_response_text') if ban_info else None,
        'ruleTitle': ban_info.get('rule_title') if ban_info else None,
        'modActionId': str(ban_info['mod_action_id']) if ban_info else None,
        'hasAppealed': has_appealed,
        'targetContent': target_content,
        'actionChain': action_chain,
    }
    if ban_info and ban_info.get('action_end_time'):
        data['expiresAt'] = ban_info['action_end_time'].isoformat()

    return {'type': 'ban_notification', 'data': data}


def _get_position_removed_notifications(user_id):
    """Get notification cards for positions that were removed."""
    removed = db.execute_query("""
        SELECT up.id as user_position_id, up.position_id,
               p.statement, pc.label as category_name,
               l.name as location_name
        FROM user_position up
        JOIN position p ON up.position_id = p.id
        LEFT JOIN position_category pc ON p.category_id = pc.id
        LEFT JOIN location l ON p.location_id = l.id
        WHERE up.user_id = %s
          AND up.status = 'removed'
          AND COALESCE(up.notified_removed, FALSE) = FALSE
    """, (user_id,))

    cards = []
    for r in (removed or []):
        cards.append({
            'type': 'position_removed_notification',
            'data': {
                'userPositionId': str(r['user_position_id']),
                'positionId': str(r['position_id']),
                'statement': r['statement'],
                'category': r.get('category_name'),
                'location': r.get('location_name'),
            }
        })
    return cards


def dismiss_position_removed_notification(position_id, token_info=None):
    """Dismiss a position removed notification."""
    authorized, auth_err = authorization_allow_banned("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)
    db.execute_query("""
        UPDATE user_position SET notified_removed = TRUE
        WHERE position_id = %s AND user_id = %s
    """, (position_id, user.id))

    return {'status': 'ok'}



def get_card_queue(limit=None, token_info=None):  # noqa: E501
    """Get mixed queue of positions, surveys, kudos, and demographics

     # noqa: E501

    :param limit: Maximum number of cards to return
    :type limit: int

    :rtype: Union[List[GetCardQueue200ResponseInner], Tuple[List[GetCardQueue200ResponseInner], int], Tuple[List[GetCardQueue200ResponseInner], int, Dict[str, str]]
    """
    authorized, auth_err = authorization_allow_banned("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)
    if limit is None:
        limit = 10

    # Record presence: user is on card queue = swiping
    presence.record_swiping(str(user.id))

    # Check if user is banned - return only ban notification
    ban_card = _get_ban_notification(str(user.id))
    if ban_card:
        return [ban_card]

    # Check for position removal notifications - prepend to queue
    removal_cards = _get_position_removed_notifications(str(user.id))

    # 1. Priority cards - kudos appear at front
    priority_cards = list(removal_cards)

    # Kudos cards first (only where other participant sent kudos first)
    kudos_prompts = _get_pending_kudos_cards(user.id, limit=2)
    for kudos in kudos_prompts:
        priority_cards.append(_kudos_to_card(kudos, user.id))

    # 2. Get positions first to determine if we need to fill with other content
    position_cards = []

    # Get user's location, category priorities, and chatting list likelihood (cached)
    location_id, priorities, chatting_list_likelihood = _get_user_context(user.id)

    # Fetch unvoted positions (using Polis if enabled, otherwise DB)
    remaining_slots = max(1, limit - len(priority_cards))

    if location_id:
        positions = polis_sync.get_unvoted_positions_for_user(
            user_id=str(user.id),
            location_id=str(location_id),
            category_priorities=priorities,
            limit=remaining_slots
        )
        for pos in positions:
            position_cards.append(_position_to_card(pos))

    # Enrich position cards with availability info
    if position_cards:
        pos_ids = [card["data"]["id"] for card in position_cards]
        availability = get_batch_availability(pos_ids, str(user.id), db)
        for card in position_cards:
            pid = card["data"]["id"]
            avail_info = availability.get(pid, {})
            card["data"]["availability"] = avail_info.get("availability", "none")
            # Override userPositionId with best online target if available
            if avail_info.get("userPositionId"):
                card["data"]["userPositionId"] = avail_info["userPositionId"]

    # 2b. Get chatting list cards (positions user wants to continue chatting about)
    # Scale by user's chatting_list_likelihood preference (0=off, 3=normal, 5=often)
    if chatting_list_likelihood == 0:
        chatting_list_limit = 0
    else:
        base = max(1, len(position_cards) // 5 + 1)
        chatting_list_limit = max(1, round(base * chatting_list_likelihood / 3))
    chatting_list_positions = _get_chatting_list_cards(str(user.id), limit=chatting_list_limit)
    chatting_list_cards = [_chatting_list_position_to_card(pos) for pos in chatting_list_positions]

    # Filter chatting list: only show cards where at least one adopter is online
    if chatting_list_cards:
        cl_pos_ids = [card["data"]["id"] for card in chatting_list_cards]
        cl_availability = get_batch_availability(cl_pos_ids, str(user.id), db)
        filtered_cl_cards = []
        for card in chatting_list_cards:
            pid = card["data"]["id"]
            avail_info = cl_availability.get(pid, {})
            if avail_info.get("availability") == "online":
                card["data"]["availability"] = "online"
                if avail_info.get("userPositionId"):
                    card["data"]["userPositionId"] = avail_info["userPositionId"]
                filtered_cl_cards.append(card)
        chatting_list_cards = filtered_cl_cards

    # 3. Get demographics and surveys
    # If no positions available, guarantee these appear; otherwise use probability
    shuffled_cards = []
    has_positions = len(position_cards) > 0

    if has_positions:
        # Normal behavior: 20% chance for demographics, 30% for surveys, 25% for pairwise
        if random.random() < 0.20:
            demographics = _get_unanswered_demographics(user.id, limit=1)
            for field in demographics:
                shuffled_cards.append(_demographic_to_card(field))

        if random.random() < 0.30:
            surveys = _get_pending_surveys(user.id, limit=1)
            for survey in surveys:
                shuffled_cards.append(_survey_to_card(survey))

        if random.random() < 0.25:
            pairwise_cards = _get_pending_pairwise(user.id, limit=1)
            shuffled_cards.extend(pairwise_cards)
    else:
        # No positions available: guarantee demographics, surveys, and pairwise appear
        # Get more of them to fill the queue
        fill_limit = max(3, limit - len(priority_cards))

        demographics = _get_unanswered_demographics(user.id, limit=fill_limit)
        for field in demographics:
            shuffled_cards.append(_demographic_to_card(field))

        surveys = _get_pending_surveys(user.id, limit=fill_limit)
        for survey in surveys:
            shuffled_cards.append(_survey_to_card(survey))

        pairwise_cards = _get_pending_pairwise(user.id, limit=fill_limit)
        shuffled_cards.extend(pairwise_cards)

    # Add position cards and chatting list cards to shuffled pool
    shuffled_cards.extend(position_cards)
    shuffled_cards.extend(chatting_list_cards)

    # 3. Shuffle the shuffled pool
    random.shuffle(shuffled_cards)

    # 4. Combine: priority cards first, then shuffled
    all_cards = priority_cards + shuffled_cards

    return all_cards[:limit]


def _get_chatting_list_cards(user_id: str, limit: int = 3) -> List[dict]:
    """Get position cards from the user's chatting list.

    Returns positions that the user has previously swiped up on and wants
    to continue chatting about. These are reintroduced into the card queue.
    """
    items = db.execute_query("""
        SELECT
            ucl.id as chatting_list_id,
            ucl.position_id,
            ucl.chat_count,
            -- Position data
            p.id,
            p.statement,
            p.category_id,
            p.creator_user_id,
            p.agree_count,
            p.disagree_count,
            p.pass_count,
            p.chat_count as position_chat_count,
            p.status,
            TO_CHAR(p.created_time, %s) as created_time,
            -- Creator data
            u.display_name as creator_display_name,
            u.username as creator_username,
            u.id as creator_id,
            u.status as creator_status,
            u.trust_score as creator_trust_score,
            u.avatar_url as creator_avatar_url,
            u.avatar_icon_url as creator_avatar_icon_url,
            COALESCE((
                SELECT COUNT(*) FROM kudos k
                WHERE k.receiver_user_id = u.id AND k.status = 'sent'
            ), 0) as creator_kudos_count,
            -- Category
            pc.label as category_name,
            -- Location
            l.code as location_code,
            l.name as location_name,
            -- Get an active user_position for chat requests
            (
                SELECT up.id FROM user_position up
                WHERE up.position_id = p.id AND up.status = 'active'
                ORDER BY CASE WHEN up.user_id = p.creator_user_id THEN 0 ELSE 1 END
                LIMIT 1
            ) as user_position_id,
            -- Pending request count (requests from this user on this position)
            (
                SELECT COUNT(*)
                FROM chat_request cr
                JOIN user_position up ON cr.user_position_id = up.id
                WHERE up.position_id = ucl.position_id
                  AND cr.initiator_user_id = %s
                  AND cr.response = 'pending'
            ) as pending_request_count
        FROM user_chatting_list ucl
        JOIN position p ON ucl.position_id = p.id
        JOIN users u ON p.creator_user_id = u.id
        LEFT JOIN position_category pc ON p.category_id = pc.id
        LEFT JOIN location l ON p.location_id = l.id
        WHERE ucl.user_id = %s
          AND ucl.is_active = true
          AND p.status = 'active'
        ORDER BY RANDOM()
        LIMIT %s
    """, (Config.TIMESTAMP_FORMAT, user_id, user_id, limit))

    result = []
    for item in (items or []):
        result.append({
            "id": str(item["id"]),
            "statement": item["statement"],
            "category_id": str(item["category_id"]) if item.get("category_id") else None,
            "category_name": item["category_name"],
            "location_code": item["location_code"],
            "location_name": item["location_name"],
            "creator_user_id": str(item["creator_user_id"]),
            "creator_display_name": item["creator_display_name"],
            "creator_username": item["creator_username"],
            "creator_id": str(item["creator_id"]),
            "creator_status": item["creator_status"],
            "creator_kudos_count": item["creator_kudos_count"],
            "creator_trust_score": float(item["creator_trust_score"]) if item.get("creator_trust_score") else None,
            "creator_avatar_url": item.get("creator_avatar_url"),
            "creator_avatar_icon_url": item.get("creator_avatar_icon_url"),
            "agree_count": item["agree_count"],
            "disagree_count": item["disagree_count"],
            "pass_count": item["pass_count"],
            "chat_count": item["position_chat_count"],
            "status": item["status"],
            "created_time": item["created_time"],
            "user_position_id": str(item["user_position_id"]) if item.get("user_position_id") else None,
            # Chatting list specific fields
            "chatting_list_id": str(item["chatting_list_id"]),
            "source": "chatting_list",
            "has_pending_requests": item["pending_request_count"] > 0,
        })

    return result


def _chatting_list_position_to_card(pos: dict) -> dict:
    """Convert a chatting list position to a card response with source info."""
    creator = {
        "id": pos.get("creator_id") or pos.get("creator_user_id"),
        "displayName": pos.get("creator_display_name"),
        "username": pos.get("creator_username"),
        "status": pos.get("creator_status", "active"),
        "kudosCount": pos.get("creator_kudos_count", 0),
        "trustScore": pos.get("creator_trust_score"),
        "avatarUrl": pos.get("creator_avatar_url"),
        "avatarIconUrl": pos.get("creator_avatar_icon_url")
    }

    category = None
    if pos.get("category_name"):
        category = {
            "id": pos.get("category_id"),
            "label": pos.get("category_name")
        }

    location = None
    if pos.get("location_code"):
        location = {
            "code": pos.get("location_code"),
            "name": pos.get("location_name")
        }

    data = {
        "id": pos["id"],
        "creator": creator,
        "statement": pos["statement"],
        "categoryId": pos.get("category_id"),
        "category": category,
        "location": location,
        "createdTime": pos.get("created_time"),
        "agreeCount": pos.get("agree_count", 0),
        "disagreeCount": pos.get("disagree_count", 0),
        "passCount": pos.get("pass_count", 0),
        "chatCount": pos.get("chat_count", 0),
        "status": pos.get("status", "active"),
        "userPositionId": pos.get("user_position_id"),
        # Chatting list specific fields
        "source": "chatting_list",
        "hasPendingRequests": pos.get("has_pending_requests", False),
        "chattingListId": pos.get("chatting_list_id"),
    }

    return {"type": "position", "data": data}


# Per-user context cache: location + category priorities
_user_context_cache = {}  # {user_id: {"location_id": str, "priorities": dict, "time": float}}
USER_CONTEXT_TTL = 300  # 5 minutes


def invalidate_user_context_cache(user_id: str):
    """Invalidate cached context for a user. Call after settings/location changes."""
    _user_context_cache.pop(str(user_id), None)


def _get_user_context(user_id: str):
    """Get user's location, category priorities, and chatting list likelihood (cached per-user).

    Returns (location_id, priorities, chatting_list_likelihood).
    """
    uid = str(user_id)
    cached = _user_context_cache.get(uid)
    if cached and (time.time() - cached["time"]) < USER_CONTEXT_TTL:
        return cached["location_id"], cached["priorities"], cached["chatting_list_likelihood"]

    # Fetch location
    location = db.execute_query("""
        SELECT location_id FROM user_location
        WHERE user_id = %s ORDER BY created_time ASC LIMIT 1
    """, (user_id,), fetchone=True)
    location_id = str(location["location_id"]) if location else None

    # Fetch category priorities
    priorities_rows = db.execute_query("""
        SELECT position_category_id, priority
        FROM user_position_categories WHERE user_id = %s
    """, (user_id,))

    priorities = {}
    for p in (priorities_rows or []):
        priorities[str(p["position_category_id"])] = p["priority"]

    # If no priorities set, default all categories to 3
    if not priorities:
        categories = db.execute_query("SELECT id FROM position_category")
        for c in (categories or []):
            priorities[str(c["id"])] = 3

    # Fetch chatting list likelihood from users table
    user_row = db.execute_query("""
        SELECT chatting_list_likelihood FROM users WHERE id = %s
    """, (user_id,), fetchone=True)
    chatting_list_likelihood = user_row["chatting_list_likelihood"] if user_row and user_row.get("chatting_list_likelihood") is not None else 3

    _user_context_cache[uid] = {
        "location_id": location_id,
        "priorities": priorities,
        "chatting_list_likelihood": chatting_list_likelihood,
        "time": time.time()
    }
    return location_id, priorities, chatting_list_likelihood


def _get_unvoted_positions_fallback(user_id: str, location_id: str, limit: int = 10) -> List[dict]:
    """Fallback: get unvoted positions directly from DB (no category weighting).

    Includes positions from the user's location and all parent locations.
    """
    positions = db.execute_query("""
        WITH RECURSIVE location_hierarchy AS (
            -- Start with user's location
            SELECT id, parent_location_id FROM location WHERE id = %s
            UNION ALL
            -- Recursively get parent locations
            SELECT l.id, l.parent_location_id
            FROM location l
            JOIN location_hierarchy lh ON l.id = lh.parent_location_id
        )
        SELECT
            p.id,
            p.statement,
            p.category_id,
            p.creator_user_id,
            p.agree_count,
            p.disagree_count,
            p.pass_count,
            p.chat_count,
            p.status,
            TO_CHAR(p.created_time, %s) as created_time,
            u.display_name as creator_display_name,
            u.username as creator_username,
            u.id as creator_id,
            u.status as creator_status,
            u.trust_score as creator_trust_score,
            u.avatar_url as creator_avatar_url,
            u.avatar_icon_url as creator_avatar_icon_url,
            COALESCE((
                SELECT COUNT(*) FROM kudos k
                WHERE k.receiver_user_id = u.id AND k.status = 'sent'
            ), 0) as creator_kudos_count,
            pc.label as category_name,
            l.code as location_code,
            l.name as location_name,
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
          AND p.status = 'active'
          AND r.id IS NULL
          AND p.creator_user_id != %s
        ORDER BY p.created_time DESC
        LIMIT %s
    """, (location_id, Config.TIMESTAMP_FORMAT, user_id, user_id, limit))

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
            "creator_id": str(p["creator_id"]),
            "creator_status": p["creator_status"],
            "creator_kudos_count": p["creator_kudos_count"],
            "creator_trust_score": float(p["creator_trust_score"]) if p.get("creator_trust_score") is not None else None,
            "creator_avatar_url": p.get("creator_avatar_url"),
            "creator_avatar_icon_url": p.get("creator_avatar_icon_url"),
            "agree_count": p["agree_count"],
            "disagree_count": p["disagree_count"],
            "pass_count": p["pass_count"],
            "chat_count": p["chat_count"],
            "status": p["status"],
            "created_time": p["created_time"],
            "user_position_id": str(p["user_position_id"]) if p.get("user_position_id") else None,
        })

    return result


def _position_to_card(pos: dict) -> dict:
    """Convert a position dict to a card response."""
    creator = {
        "id": pos.get("creator_id") or pos.get("creator_user_id"),
        "displayName": pos.get("creator_display_name"),
        "username": pos.get("creator_username"),
        "status": pos.get("creator_status", "active"),
        "kudosCount": pos.get("creator_kudos_count", 0),
        "trustScore": pos.get("creator_trust_score"),
        "avatarUrl": pos.get("creator_avatar_url"),
        "avatarIconUrl": pos.get("creator_avatar_icon_url")
    }

    # Build category object if we have category data
    category = None
    if pos.get("category_name"):
        category = {
            "id": pos.get("category_id"),
            "label": pos.get("category_name")
        }

    # Build location object if we have location data
    location = None
    if pos.get("location_code"):
        location = {
            "code": pos.get("location_code"),
            "name": pos.get("location_name")
        }

    data = {
        "id": pos["id"],
        "creator": creator,
        "statement": pos["statement"],
        "categoryId": pos.get("category_id"),
        "category": category,
        "location": location,
        "createdTime": pos.get("created_time"),
        "agreeCount": pos.get("agree_count", 0),
        "disagreeCount": pos.get("disagree_count", 0),
        "passCount": pos.get("pass_count", 0),
        "chatCount": pos.get("chat_count", 0),
        "status": pos.get("status", "active"),
        "userPositionId": pos.get("user_position_id"),
    }

    return {"type": "position", "data": data}


# In-memory survey cache: all active surveys with questions and options
_survey_cache = None
_survey_cache_time = 0
SURVEY_CACHE_TTL = 3600  # 1 hour


def _get_cached_surveys():
    """Get all active surveys with questions and options (cached in-memory)."""
    global _survey_cache, _survey_cache_time
    now = time.time()
    if _survey_cache is not None and (now - _survey_cache_time) < SURVEY_CACHE_TTL:
        return _survey_cache

    rows = db.execute_query("""
        SELECT sq.id as question_id, sq.survey_question as question,
               s.id as survey_id, s.survey_title, s.end_time,
               sqo.id as option_id, sqo.survey_question_option as option_text
        FROM survey_question sq
        JOIN survey s ON sq.survey_id = s.id
        LEFT JOIN survey_question_option sqo ON sqo.survey_question_id = sq.id
        WHERE s.status = 'active'
          AND s.survey_type != 'pairwise'
          AND (s.start_time IS NULL OR s.start_time <= CURRENT_TIMESTAMP)
          AND (s.end_time IS NULL OR s.end_time > CURRENT_TIMESTAMP)
        ORDER BY s.created_time DESC, sq.id, sqo.id
    """)

    # Group into questions with their options
    questions = {}
    for row in (rows or []):
        qid = str(row["question_id"])
        if qid not in questions:
            questions[qid] = {
                "question_id": qid,
                "question": row["question"],
                "survey_id": str(row["survey_id"]),
                "survey_title": row["survey_title"],
                "options": []
            }
        if row.get("option_id"):
            questions[qid]["options"].append({
                "id": row["option_id"],
                "survey_question_option": row["option_text"]
            })

    _survey_cache = list(questions.values())
    _survey_cache_time = now
    return _survey_cache


def _get_pending_surveys(user_id: str, limit: int = 2) -> List[dict]:
    """Get survey questions the user hasn't answered yet."""
    all_surveys = _get_cached_surveys()
    if not all_surveys:
        return []

    # Get question IDs the user has already answered (single query)
    answered = db.execute_query("""
        SELECT DISTINCT sqo.survey_question_id
        FROM survey_question_response sqr
        JOIN survey_question_option sqo ON sqr.survey_question_option_id = sqo.id
        WHERE sqr.user_id = %s
    """, (user_id,))

    answered_ids = {str(r["survey_question_id"]) for r in (answered or [])}

    # Filter to unanswered questions
    result = []
    for survey in all_surveys:
        if survey["question_id"] not in answered_ids:
            result.append(survey)
            if len(result) >= limit:
                break

    return result


def _survey_to_card(survey: dict) -> dict:
    """Convert a survey dict to a card response."""
    options = [
        {"id": str(opt["id"]), "option": opt["survey_question_option"]}
        for opt in survey.get("options", [])
    ]

    data = {
        "id": survey["question_id"],
        "surveyId": survey["survey_id"],
        "question": survey["question"],
        "options": options,
        "surveyTitle": survey.get("survey_title")
    }

    return {"type": "survey", "data": data}


def _get_pending_chat_requests(user_id: str, limit: int = 2) -> List[dict]:
    """Get pending chat requests for the user (where they hold the position)."""
    requests = db.execute_query("""
        SELECT
            cr.id,
            cr.user_position_id,
            cr.response,
            TO_CHAR(cr.created_time, %s) as created_time,
            u.id as initiator_id,
            u.display_name as initiator_display_name,
            u.username as initiator_username,
            u.status as initiator_status,
            u.trust_score as initiator_trust_score,
            u.avatar_url as initiator_avatar_url,
            u.avatar_icon_url as initiator_avatar_icon_url,
            COALESCE((
                SELECT COUNT(*) FROM kudos k
                WHERE k.receiver_user_id = u.id AND k.status = 'sent'
            ), 0) as initiator_kudos_count,
            -- Position details
            p.id as position_id,
            p.statement as position_statement,
            pc.label as position_category_name,
            loc.code as position_location_code,
            loc.name as position_location_name,
            -- Position author (responder)
            author.id as author_id,
            author.display_name as author_display_name,
            author.username as author_username,
            author.status as author_status,
            author.trust_score as author_trust_score,
            author.avatar_url as author_avatar_url,
            author.avatar_icon_url as author_avatar_icon_url,
            COALESCE((
                SELECT COUNT(*) FROM kudos k
                WHERE k.receiver_user_id = author.id AND k.status = 'sent'
            ), 0) as author_kudos_count
        FROM chat_request cr
        JOIN user_position up ON cr.user_position_id = up.id
        JOIN users u ON cr.initiator_user_id = u.id
        JOIN position p ON up.position_id = p.id
        JOIN users author ON up.user_id = author.id
        LEFT JOIN position_category pc ON p.category_id = pc.id
        LEFT JOIN location loc ON p.location_id = loc.id
        WHERE up.user_id = %s
          AND cr.response = 'pending'
        ORDER BY cr.created_time DESC
        LIMIT %s
    """, (Config.TIMESTAMP_FORMAT, user_id, limit))

    return [dict(r) for r in (requests or [])]


def _chat_request_to_card(chat_req: dict) -> dict:
    """Convert a chat request dict to a card response."""
    initiator = {
        "id": str(chat_req["initiator_id"]),
        "displayName": chat_req["initiator_display_name"],
        "username": chat_req["initiator_username"],
        "status": chat_req["initiator_status"],
        "kudosCount": chat_req.get("initiator_kudos_count", 0),
        "trustScore": float(chat_req["initiator_trust_score"]) if chat_req.get("initiator_trust_score") is not None else None,
        "avatarUrl": chat_req.get("initiator_avatar_url"),
        "avatarIconUrl": chat_req.get("initiator_avatar_icon_url")
    }

    # Build position creator
    creator = {
        "id": str(chat_req["author_id"]),
        "displayName": chat_req["author_display_name"],
        "username": chat_req["author_username"],
        "status": chat_req["author_status"],
        "kudosCount": chat_req.get("author_kudos_count", 0),
        "trustScore": float(chat_req["author_trust_score"]) if chat_req.get("author_trust_score") is not None else None,
        "avatarUrl": chat_req.get("author_avatar_url"),
        "avatarIconUrl": chat_req.get("author_avatar_icon_url")
    }

    # Build position with category and location
    position = {
        "id": str(chat_req["position_id"]),
        "statement": chat_req["position_statement"],
        "creator": creator
    }

    if chat_req.get("position_category_name"):
        position["category"] = {"label": chat_req["position_category_name"]}

    if chat_req.get("position_location_code"):
        position["location"] = {
            "code": chat_req["position_location_code"],
            "name": chat_req.get("position_location_name")
        }

    data = {
        "id": str(chat_req["id"]),
        "requester": initiator,
        "userPositionId": str(chat_req["user_position_id"]),
        "position": position,
        "response": chat_req["response"]
    }

    return {"type": "chat_request", "data": data}


def _get_pending_kudos_cards(user_id: str, limit: int = 2) -> List[dict]:
    """Get kudos prompts for the user where the other participant sent kudos first.

    Returns chats where:
    - User was a participant
    - Chat ended with agreed_closure
    - Other participant has sent kudos to this user (status='sent')
    - This user hasn't responded yet (no kudos record from this user for this chat)
    """
    kudos_prompts = db.execute_query("""
        SELECT
            cl.id as chat_log_id,
            cl.end_time,
            cl.log->'agreedClosure' as closing_statement,
            cr.initiator_user_id,
            up.user_id as responder_user_id,
            -- Get the other participant's info
            CASE
                WHEN cr.initiator_user_id = %s THEN up.user_id
                ELSE cr.initiator_user_id
            END as other_user_id,
            CASE
                WHEN cr.initiator_user_id = %s THEN responder.display_name
                ELSE initiator.display_name
            END as other_display_name,
            CASE
                WHEN cr.initiator_user_id = %s THEN responder.username
                ELSE initiator.username
            END as other_username,
            CASE
                WHEN cr.initiator_user_id = %s THEN responder.status
                ELSE initiator.status
            END as other_status,
            CASE
                WHEN cr.initiator_user_id = %s THEN responder.trust_score
                ELSE initiator.trust_score
            END as other_trust_score,
            CASE
                WHEN cr.initiator_user_id = %s THEN (
                    SELECT COUNT(*) FROM kudos k WHERE k.receiver_user_id = responder.id AND k.status = 'sent'
                )
                ELSE (
                    SELECT COUNT(*) FROM kudos k WHERE k.receiver_user_id = initiator.id AND k.status = 'sent'
                )
            END as other_kudos_count,
            CASE
                WHEN cr.initiator_user_id = %s THEN responder.avatar_url
                ELSE initiator.avatar_url
            END as other_avatar_url,
            CASE
                WHEN cr.initiator_user_id = %s THEN responder.avatar_icon_url
                ELSE initiator.avatar_icon_url
            END as other_avatar_icon_url,
            -- Position data
            p.id as position_id,
            p.statement as position_statement,
            pc.id as position_category_id,
            pc.label as position_category_name,
            loc.code as position_location_code,
            loc.name as position_location_name,
            -- Position author (the responder who owns the user_position)
            responder.id as position_author_id,
            responder.display_name as position_author_display_name,
            responder.username as position_author_username,
            responder.status as position_author_status,
            responder.trust_score as position_author_trust_score,
            responder.avatar_url as position_author_avatar_url,
            responder.avatar_icon_url as position_author_avatar_icon_url,
            (SELECT COUNT(*) FROM kudos k WHERE k.receiver_user_id = responder.id AND k.status = 'sent') as position_author_kudos_count
        FROM chat_log cl
        JOIN chat_request cr ON cl.chat_request_id = cr.id
        JOIN user_position up ON cr.user_position_id = up.id
        JOIN position p ON up.position_id = p.id
        JOIN users initiator ON cr.initiator_user_id = initiator.id
        JOIN users responder ON up.user_id = responder.id
        LEFT JOIN position_category pc ON p.category_id = pc.id
        LEFT JOIN location loc ON p.location_id = loc.id
        WHERE cl.end_type = 'agreed_closure'
          AND cl.log->'agreedClosure' IS NOT NULL
          AND (cr.initiator_user_id = %s OR up.user_id = %s)
          -- Other participant has sent kudos to this user
          AND EXISTS (
              SELECT 1 FROM kudos k
              WHERE k.chat_log_id = cl.id
                AND k.receiver_user_id = %s
                AND k.status = 'sent'
          )
          -- This user hasn't responded yet (no kudos record at all from this user)
          AND NOT EXISTS (
              SELECT 1 FROM kudos k
              WHERE k.chat_log_id = cl.id
                AND k.sender_user_id = %s
          )
        ORDER BY cl.end_time DESC
        LIMIT %s
    """, (user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id, limit))

    return [dict(r) for r in (kudos_prompts or [])]


def _kudos_to_card(kudos_data: dict, user_id: str) -> dict:
    """Convert a kudos prompt dict to a card response."""
    other_participant = {
        "id": str(kudos_data["other_user_id"]),
        "displayName": kudos_data["other_display_name"],
        "username": kudos_data["other_username"],
        "status": kudos_data["other_status"],
        "kudosCount": kudos_data.get("other_kudos_count", 0),
        "trustScore": float(kudos_data["other_trust_score"]) if kudos_data.get("other_trust_score") is not None else None,
        "avatarUrl": kudos_data.get("other_avatar_url"),
        "avatarIconUrl": kudos_data.get("other_avatar_icon_url")
    }

    # Build position creator
    position_creator = {
        "id": str(kudos_data["position_author_id"]),
        "displayName": kudos_data["position_author_display_name"],
        "username": kudos_data["position_author_username"],
        "status": kudos_data["position_author_status"],
        "kudosCount": kudos_data.get("position_author_kudos_count", 0),
        "trustScore": float(kudos_data["position_author_trust_score"]) if kudos_data.get("position_author_trust_score") is not None else None,
        "avatarUrl": kudos_data.get("position_author_avatar_url"),
        "avatarIconUrl": kudos_data.get("position_author_avatar_icon_url")
    }

    # Build position with category and location
    position = {
        "id": str(kudos_data["position_id"]),
        "statement": kudos_data["position_statement"],
        "creator": position_creator
    }

    if kudos_data.get("position_category_name"):
        position["category"] = {
            "id": str(kudos_data["position_category_id"]) if kudos_data.get("position_category_id") else None,
            "label": kudos_data["position_category_name"]
        }

    if kudos_data.get("position_location_code"):
        position["location"] = {
            "code": kudos_data["position_location_code"],
            "name": kudos_data["position_location_name"]
        }

    data = {
        "id": str(kudos_data["chat_log_id"]),
        "otherParticipant": other_participant,
        "position": position,
        "closingStatement": kudos_data["closing_statement"],
        "chatEndTime": kudos_data["end_time"].isoformat() if kudos_data["end_time"] else None
    }

    return {"type": "kudos", "data": data}


def _get_unanswered_demographics(user_id: str, limit: int = 1) -> List[str]:
    """Get unanswered demographic fields for the user."""
    # Get current demographics
    demographics = db.execute_query("""
        SELECT lean, education, geo_locale, sex
        FROM user_demographics
        WHERE user_id = %s
    """, (user_id,), fetchone=True)

    unanswered = []

    if not demographics:
        # No demographics record, all fields are unanswered
        unanswered = list(DEMOGRAPHIC_QUESTIONS.keys())
    else:
        # Check which fields are NULL
        for field in DEMOGRAPHIC_QUESTIONS.keys():
            if demographics.get(field) is None:
                unanswered.append(field)

    # Return up to limit unanswered fields
    return unanswered[:limit]


def _demographic_to_card(field: str) -> dict:
    """Convert a demographic field to a card response."""
    options = _get_demographic_options()
    question = DEMOGRAPHIC_QUESTIONS.get(field, f"What is your {field.replace('_', ' ')}?")
    field_options = options.get(field, [])

    data = {
        "field": _DB_TO_API_FIELD.get(field, field),
        "question": question,
        "options": field_options
    }

    return {"type": "demographic", "data": data}


# In-memory pairwise survey cache: all active pairwise surveys with items
_pairwise_cache = None
_pairwise_cache_time = 0
PAIRWISE_CACHE_TTL = 3600  # 1 hour


def _get_cached_pairwise_surveys():
    """Get all active pairwise surveys with items (cached in-memory)."""
    global _pairwise_cache, _pairwise_cache_time
    now = time.time()
    if _pairwise_cache is not None and (now - _pairwise_cache_time) < PAIRWISE_CACHE_TTL:
        return _pairwise_cache

    rows = db.execute_query("""
        SELECT s.id, s.survey_title, s.comparison_question,
               loc.code as location_code, loc.name as location_name,
               cat.label as category_name,
               pi.id as item_id, pi.item_text, pi.item_order
        FROM survey s
        LEFT JOIN location loc ON s.location_id = loc.id
        LEFT JOIN position_category cat ON s.position_category_id = cat.id
        LEFT JOIN pairwise_item pi ON pi.survey_id = s.id
        WHERE s.survey_type = 'pairwise'
          AND s.status = 'active'
          AND (s.start_time IS NULL OR s.start_time <= CURRENT_TIMESTAMP)
          AND (s.end_time IS NULL OR s.end_time > CURRENT_TIMESTAMP)
        ORDER BY s.id, pi.item_order
    """)

    # Group into surveys with items
    surveys = {}
    for row in (rows or []):
        sid = str(row["id"])
        if sid not in surveys:
            surveys[sid] = {
                "id": sid,
                "survey_title": row["survey_title"],
                "comparison_question": row["comparison_question"],
                "location_code": row.get("location_code"),
                "location_name": row.get("location_name"),
                "category_name": row.get("category_name"),
                "items": []
            }
        if row.get("item_id"):
            surveys[sid]["items"].append({
                "id": row["item_id"],
                "item_text": row["item_text"]
            })

    _pairwise_cache = [s for s in surveys.values() if len(s["items"]) >= 2]
    _pairwise_cache_time = now
    return _pairwise_cache


def _get_pending_pairwise(user_id: str, limit: int = 2) -> List[dict]:
    """Get smart pairwise comparisons using transitivity and graph algorithms.

    Uses preference graph to:
    - Skip pairs that can be inferred transitively (A>B, B>C → A>C)
    - Detect completion (stop sending cards when ordering is determined)
    - Resolve cycles via tiebreaker comparisons
    - Prioritize informative pairs (adjacency + optional group entropy)
    """
    all_surveys = _get_cached_pairwise_surveys()
    if not all_surveys:
        return []

    # Get all of this user's pairwise responses in one query
    compared = db.execute_query("""
        SELECT survey_id, winner_item_id, loser_item_id FROM pairwise_response
        WHERE user_id = %s
    """, (user_id,))

    responses_by_survey = {}
    for r in (compared or []):
        sid = str(r["survey_id"])
        if sid not in responses_by_survey:
            responses_by_survey[sid] = []
        responses_by_survey[sid].append(r)

    cards = []
    for survey in all_surveys:
        item_ids = [str(item["id"]) for item in survey["items"]]
        item_lookup = {str(item["id"]): item for item in survey["items"]}
        user_responses = responses_by_survey.get(survey["id"], [])

        # Build set of already-compared pairs (unordered)
        compared_pairs = set()
        for r in user_responses:
            a, b = str(r["winner_item_id"]), str(r["loser_item_id"])
            compared_pairs.add((min(a, b), max(a, b)))

        # All possible pairs minus already-compared
        all_pairs = set(itertools.combinations(sorted(item_ids), 2))
        uncompared = list(all_pairs - compared_pairs)

        # Skip survey if all pairs have been compared
        if not uncompared:
            continue

        # Pick a random uncompared pair
        item_a_id, item_b_id = random.choice(uncompared)

        item_a = item_lookup[item_a_id]
        item_b = item_lookup[item_b_id]

        # Randomize which option appears as A vs B
        if random.random() > 0.5:
            item_a, item_b = item_b, item_a

        card_data = {
            "surveyId": survey["id"],
            "surveyTitle": survey["survey_title"],
            "question": survey["comparison_question"] or "Which do you prefer?",
            "optionA": {"id": str(item_a["id"]), "text": item_a["item_text"]},
            "optionB": {"id": str(item_b["id"]), "text": item_b["item_text"]},
        }
        if survey.get("location_code"):
            card_data["location"] = {
                "code": survey["location_code"],
                "name": survey.get("location_name")
            }
        if survey.get("category_name"):
            card_data["category"] = {
                "label": survey["category_name"]
            }
        cards.append({
            "type": "pairwise",
            "data": card_data
        })

        if len(cards) >= limit:
            break

    return cards[:limit]


def _pairwise_to_card(pairwise: dict) -> dict:
    """Convert a pairwise comparison dict to a card response (passthrough)."""
    # Already in card format from _get_pending_pairwise
    return pairwise
