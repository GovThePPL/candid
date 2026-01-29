import connexion
from typing import Dict, List, Tuple, Union

from candid.models.get_card_queue200_response_inner import GetCardQueue200ResponseInner  # noqa: E501
from candid.models.get_card_queue200_response_inner_data import GetCardQueue200ResponseInnerData  # noqa: E501
from candid.models.user import User
from candid.models.survey_question_option import SurveyQuestionOption
from candid.models.error_model import ErrorModel
from candid import util

from candid.controllers import db
from candid.controllers.helpers.config import Config
from candid.controllers.helpers.auth import authorization, token_to_user
from candid.controllers.helpers import polis_sync

from camel_converter import dict_to_camel
import random


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

    # 1. Priority cards (not shuffled, appear at front)
    priority_cards = []

    # Chat requests at front (highest priority)
    chat_requests = _get_pending_chat_requests(user.id, limit=2)
    for chat_req in chat_requests:
        priority_cards.append(_chat_request_to_card(chat_req))

    # Kudos cards second (only where other participant sent kudos first)
    kudos_prompts = _get_pending_kudos_cards(user.id, limit=2)
    for kudos in kudos_prompts:
        priority_cards.append(_kudos_to_card(kudos, user.id))

    # 2. Shuffled cards pool
    shuffled_cards = []

    # Demographics (20% chance to appear, up to 1)
    if random.random() < 0.20:
        demographics = _get_unanswered_demographics(user.id, limit=1)
        for field in demographics:
            shuffled_cards.append(_demographic_to_card(field))

    # Surveys (30% chance to appear, up to 1)
    if random.random() < 0.30:
        surveys = _get_pending_surveys(user.id, limit=1)
        for survey in surveys:
            shuffled_cards.append(_survey_to_card(survey))

    # Positions (fill remaining slots)
    # Calculate how many positions we need
    remaining_slots = max(1, limit - len(priority_cards) - len(shuffled_cards))

    # Get user's category priorities
    priorities = _get_user_category_priorities(user.id)
    # Get user's location
    location_id = _get_user_location(user.id)

    # Fetch unvoted positions (using Polis if enabled, otherwise DB)
    if location_id and priorities:
        positions = polis_sync.get_unvoted_positions_for_user(
            user_id=str(user.id),
            location_id=str(location_id),
            category_priorities=priorities,
            limit=remaining_slots
        )
        for pos in positions:
            shuffled_cards.append(_position_to_card(pos))
    elif location_id:
        # User has no category priorities set, fall back to all categories
        positions = _get_unvoted_positions_fallback(user.id, location_id, limit=remaining_slots)
        for pos in positions:
            shuffled_cards.append(_position_to_card(pos))

    # 3. Shuffle the shuffled pool
    random.shuffle(shuffled_cards)

    # 4. Combine: priority cards first, then shuffled
    all_cards = priority_cards + shuffled_cards
    return all_cards[:limit]


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
    """Fallback: get unvoted positions directly from DB (no category weighting)."""
    positions = db.execute_query("""
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
            u.status as creator_status
        FROM position p
        JOIN users u ON p.creator_user_id = u.id
        LEFT JOIN response r ON r.position_id = p.id AND r.user_id = %s
        WHERE p.location_id = %s
          AND p.status = 'active'
          AND r.id IS NULL
          AND p.creator_user_id != %s
        ORDER BY p.created_time DESC
        LIMIT %s
    """, (Config.TIMESTAMP_FORMAT, user_id, location_id, user_id, limit))

    result = []
    for p in (positions or []):
        result.append({
            "id": str(p["id"]),
            "statement": p["statement"],
            "category_id": str(p["category_id"]),
            "creator_user_id": str(p["creator_user_id"]),
            "creator_display_name": p["creator_display_name"],
            "creator_username": p["creator_username"],
            "creator_id": str(p["creator_id"]),
            "creator_status": p["creator_status"],
            "agree_count": p["agree_count"],
            "disagree_count": p["disagree_count"],
            "pass_count": p["pass_count"],
            "chat_count": p["chat_count"],
            "status": p["status"],
            "created_time": p["created_time"],
        })

    return result


def _position_to_card(pos: dict) -> GetCardQueue200ResponseInner:
    """Convert a position dict to a card response."""
    creator = User(
        id=pos.get("creator_id") or pos.get("creator_user_id"),
        display_name=pos.get("creator_display_name"),
        username=pos.get("creator_username"),
        status=pos.get("creator_status", "active")
    )

    data = GetCardQueue200ResponseInnerData(
        id=pos["id"],
        creator=creator,
        statement=pos["statement"],
        category_id=pos["category_id"],
        created_time=pos.get("created_time"),
        agree_count=pos.get("agree_count", 0),
        disagree_count=pos.get("disagree_count", 0),
        pass_count=pos.get("pass_count", 0),
        chat_count=pos.get("chat_count", 0),
        status=pos.get("status", "active")
    )

    return GetCardQueue200ResponseInner(type="position", data=data)


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


def _survey_to_card(survey: dict) -> GetCardQueue200ResponseInner:
    """Convert a survey dict to a card response."""
    options = [
        SurveyQuestionOption(
            id=str(opt["id"]),
            option=opt["survey_question_option"]
        )
        for opt in survey.get("options", [])
    ]

    data = GetCardQueue200ResponseInnerData(
        id=survey["question_id"],
        survey_id=survey["survey_id"],
        question=survey["question"],
        options=options,
        survey_title=survey.get("survey_title")
    )

    return GetCardQueue200ResponseInner(type="survey", data=data)


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
            u.status as initiator_status
        FROM chat_request cr
        JOIN user_position up ON cr.user_position_id = up.id
        JOIN users u ON cr.initiator_user_id = u.id
        WHERE up.user_id = %s
          AND cr.response = 'pending'
        ORDER BY cr.created_time DESC
        LIMIT %s
    """, (Config.TIMESTAMP_FORMAT, user_id, limit))

    return [dict(r) for r in (requests or [])]


def _chat_request_to_card(chat_req: dict) -> GetCardQueue200ResponseInner:
    """Convert a chat request dict to a card response."""
    initiator = User(
        id=str(chat_req["initiator_id"]),
        display_name=chat_req["initiator_display_name"],
        username=chat_req["initiator_username"],
        status=chat_req["initiator_status"]
    )

    data = GetCardQueue200ResponseInnerData(
        id=str(chat_req["id"]),
        initiator=initiator,
        user_position_id=str(chat_req["user_position_id"]),
        response=chat_req["response"]
    )

    return GetCardQueue200ResponseInner(type="chat_request", data=data)


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
            cl.log->>'agreed_closure' as closing_statement,
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
            END as other_status
        FROM chat_log cl
        JOIN chat_request cr ON cl.chat_request_id = cr.id
        JOIN user_position up ON cr.user_position_id = up.id
        JOIN users initiator ON cr.initiator_user_id = initiator.id
        JOIN users responder ON up.user_id = responder.id
        WHERE cl.end_type = 'agreed_closure'
          AND cl.log->>'agreed_closure' IS NOT NULL
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
    """, (user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id, limit))

    return [dict(r) for r in (kudos_prompts or [])]


def _kudos_to_card(kudos_data: dict, user_id: str) -> GetCardQueue200ResponseInner:
    """Convert a kudos prompt dict to a card response."""
    other_participant = User(
        id=str(kudos_data["other_user_id"]),
        display_name=kudos_data["other_display_name"],
        username=kudos_data["other_username"],
        status=kudos_data["other_status"]
    )

    data = GetCardQueue200ResponseInnerData(
        id=str(kudos_data["chat_log_id"]),
        other_participant=other_participant,
        closing_statement=kudos_data["closing_statement"],
        chat_end_time=kudos_data["end_time"].isoformat() if kudos_data["end_time"] else None
    )

    return GetCardQueue200ResponseInner(type="kudos", data=data)


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


def _demographic_to_card(field: str) -> GetCardQueue200ResponseInner:
    """Convert a demographic field to a card response."""
    options = _get_demographic_options()
    question = DEMOGRAPHIC_QUESTIONS.get(field, f"What is your {field.replace('_', ' ')}?")
    field_options = options.get(field, [])

    data = GetCardQueue200ResponseInnerData(
        _field=field,
        question=question,
        options=field_options
    )

    return GetCardQueue200ResponseInner(type="demographic", data=data)
