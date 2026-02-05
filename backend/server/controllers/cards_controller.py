import connexion
from typing import Dict, List, Tuple, Union

from candid import util

from candid.controllers import db
from candid.controllers.helpers.config import Config
from candid.controllers.helpers.auth import authorization, token_to_user
from candid.controllers.helpers import polis_sync

import random
from itertools import combinations


# Demographic field questions (options come from the database schema)
DEMOGRAPHIC_QUESTIONS = {
    'lean': 'What is your political lean?',
    'education': 'What is your highest level of education?',
    'geo_locale': 'How would you describe where you live?',
    'sex': 'What is your sex?',
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


def get_card_queue(limit=None, token_info=None):  # noqa: E501
    """Get mixed queue of positions, surveys, chat requests, kudos, and demographics

     # noqa: E501

    :param limit: Maximum number of cards to return
    :type limit: int

    :rtype: Union[List[GetCardQueue200ResponseInner], Tuple[List[GetCardQueue200ResponseInner], int], Tuple[List[GetCardQueue200ResponseInner], int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)
    if limit is None:
        limit = 10

    # 1. Priority cards - kudos appear at front, chat requests inserted after first position card
    priority_cards = []

    # Kudos cards first (only where other participant sent kudos first)
    kudos_prompts = _get_pending_kudos_cards(user.id, limit=2)
    for kudos in kudos_prompts:
        priority_cards.append(_kudos_to_card(kudos, user.id))

    # Chat requests will be inserted as "next card" after we have position cards
    chat_requests = _get_pending_chat_requests(user.id, limit=2)
    chat_request_cards = [_chat_request_to_card(chat_req) for chat_req in chat_requests]

    # 2. Get positions first to determine if we need to fill with other content
    position_cards = []

    # Get user's category priorities
    priorities = _get_user_category_priorities(user.id)
    # Get user's location
    location_id = _get_user_location(user.id)

    # If user has no priorities, default to all categories with equal priority
    if not priorities:
        priorities = _get_default_category_priorities()

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

    # 2b. Get chatting list cards (positions user wants to continue chatting about)
    # Mix ~1 chatting list card per ~5 regular position cards
    chatting_list_limit = max(1, len(position_cards) // 5 + 1)
    chatting_list_positions = _get_chatting_list_cards(str(user.id), limit=chatting_list_limit)
    chatting_list_cards = [_chatting_list_position_to_card(pos) for pos in chatting_list_positions]

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

    # 5. Insert chat request cards as "next card" (position index 1)
    # This ensures they don't replace the current top card
    if chat_request_cards and len(all_cards) > 0:
        # Insert after the first card
        all_cards = all_cards[:1] + chat_request_cards + all_cards[1:]
    elif chat_request_cards:
        # No other cards, just use chat requests
        all_cards = chat_request_cards

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


def _get_user_category_priorities(user_id: str) -> Dict[str, int]:
    """Get user's category priorities as dict of category_id -> priority."""
    priorities = db.execute_query("""
        SELECT position_category_id, priority
        FROM user_position_categories
        WHERE user_id = %s
    """, (user_id,))

    result = {}
    for p in (priorities or []):
        result[str(p["position_category_id"])] = p["priority"]

    return result


def _get_default_category_priorities() -> Dict[str, int]:
    """Get all categories with equal priority (3) for users without preferences."""
    categories = db.execute_query("""
        SELECT id FROM position_category
    """)

    result = {}
    for c in (categories or []):
        result[str(c["id"])] = 3  # Medium priority for all

    return result


def _get_user_location(user_id: str) -> str:
    """Get user's primary location (first one found)."""
    location = db.execute_query("""
        SELECT location_id
        FROM user_location
        WHERE user_id = %s
        ORDER BY created_time ASC
        LIMIT 1
    """, (user_id,), fetchone=True)

    if location:
        return str(location["location_id"])
    return None


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


def _get_pending_surveys(user_id: str, limit: int = 2) -> List[dict]:
    """Get survey questions the user hasn't answered yet."""
    surveys = db.execute_query("""
        SELECT
            sq.id as question_id,
            sq.survey_question as question,
            s.id as survey_id,
            s.survey_title
        FROM survey_question sq
        JOIN survey s ON sq.survey_id = s.id
        WHERE s.status = 'active'
          AND (s.start_time IS NULL OR s.start_time <= CURRENT_TIMESTAMP)
          AND (s.end_time IS NULL OR s.end_time > CURRENT_TIMESTAMP)
          AND NOT EXISTS (
              SELECT 1 FROM survey_question_response sqr
              JOIN survey_question_option sqo ON sqr.survey_question_option_id = sqo.id
              WHERE sqo.survey_question_id = sq.id AND sqr.user_id = %s
          )
        ORDER BY s.created_time DESC
        LIMIT %s
    """, (user_id, limit))

    result = []
    for s in (surveys or []):
        # Get options for this question
        options = db.execute_query("""
            SELECT id, survey_question_option
            FROM survey_question_option
            WHERE survey_question_id = %s
        """, (s["question_id"],))

        result.append({
            "question_id": str(s["question_id"]),
            "question": s["question"],
            "survey_id": str(s["survey_id"]),
            "survey_title": s["survey_title"],
            "options": options or []
        })

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
        "field": field,
        "question": question,
        "options": field_options
    }

    return {"type": "demographic", "data": data}


def _get_pending_pairwise(user_id: str, limit: int = 2) -> List[dict]:
    """
    Get random pairwise comparisons for a user.
    Selects pairs the user hasn't compared yet from active pairwise surveys.
    """
    # Get active pairwise surveys with location and category data (directly from survey table)
    surveys = db.execute_query("""
        SELECT s.id, s.survey_title, s.comparison_question,
               loc.code as location_code, loc.name as location_name,
               cat.label as category_name
        FROM survey s
        LEFT JOIN location loc ON s.location_id = loc.id
        LEFT JOIN position_category cat ON s.position_category_id = cat.id
        WHERE s.survey_type = 'pairwise'
          AND s.status = 'active'
          AND (s.start_time IS NULL OR s.start_time <= CURRENT_TIMESTAMP)
          AND (s.end_time IS NULL OR s.end_time > CURRENT_TIMESTAMP)
    """)

    cards = []
    for survey in (surveys or []):
        # Get items for this survey
        items = db.execute_query("""
            SELECT id, item_text FROM pairwise_item
            WHERE survey_id = %s
            ORDER BY item_order
        """, (survey["id"],))

        if not items or len(items) < 2:
            continue

        # Get pairs user has already compared (in either direction)
        compared = db.execute_query("""
            SELECT winner_item_id, loser_item_id FROM pairwise_response
            WHERE survey_id = %s AND user_id = %s
        """, (survey["id"], user_id))

        compared_set = set()
        for r in (compared or []):
            # Add both orderings to the set
            pair = tuple(sorted([str(r["winner_item_id"]), str(r["loser_item_id"])]))
            compared_set.add(pair)

        # Generate all possible pairs and filter out already compared
        all_pairs = list(combinations(items, 2))
        available = []
        for item_a, item_b in all_pairs:
            pair = tuple(sorted([str(item_a["id"]), str(item_b["id"])]))
            if pair not in compared_set:
                available.append((item_a, item_b))

        # Shuffle and pick up to `limit` pairs
        random.shuffle(available)
        for item_a, item_b in available[:limit - len(cards)]:
            # Randomize which option appears as A vs B
            if random.random() > 0.5:
                item_a, item_b = item_b, item_a

            card_data = {
                "surveyId": str(survey["id"]),
                "surveyTitle": survey["survey_title"],
                "question": survey["comparison_question"] or "Which do you prefer?",
                "optionA": {"id": str(item_a["id"]), "text": item_a["item_text"]},
                "optionB": {"id": str(item_b["id"]), "text": item_b["item_text"]},
            }
            # Include location if available
            if survey.get("location_code"):
                card_data["location"] = {
                    "code": survey["location_code"],
                    "name": survey.get("location_name")
                }
            # Include category if available
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

        if len(cards) >= limit:
            break

    return cards[:limit]


def _pairwise_to_card(pairwise: dict) -> dict:
    """Convert a pairwise comparison dict to a card response (passthrough)."""
    # Already in card format from _get_pending_pairwise
    return pairwise
