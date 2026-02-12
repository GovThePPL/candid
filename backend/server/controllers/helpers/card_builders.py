"""Card builder functions — pure dict transformers for card queue responses.

Each function takes raw data (from DB queries or Polis) and produces the
JSON-serializable card dict returned by the card queue API.
"""

from typing import Any, Dict, List, Optional


# Demographic field questions (options come from the database schema)
# Keys are DB column names (snake_case)
DEMOGRAPHIC_QUESTIONS = {
    'lean': 'What is your political lean?',
    'education': 'What is your highest level of education?',
    'geo_locale': 'How would you describe where you live?',
    'sex': 'What is your sex?',
}

# Map DB column names to camelCase API field names for card responses
DB_TO_API_FIELD = {
    'lean': 'lean',
    'education': 'education',
    'geo_locale': 'geoLocale',
    'sex': 'sex',
}


def value_to_label(value: str) -> str:
    """Convert a snake_case value to a human-readable label."""
    return value.replace('_', ' ').title()


def position_to_card(pos: dict) -> dict:
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
    }

    return {"type": "position", "data": data}


def chatting_list_position_to_card(pos: dict) -> dict:
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


def survey_to_card(survey: dict) -> dict:
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


def chat_request_to_card(chat_req: dict) -> dict:
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


def kudos_to_card(kudos_data: dict, user_id: str) -> dict:
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


def demographic_to_card(field: str, demographic_options: dict) -> dict:
    """Convert a demographic field to a card response.

    Args:
        field: DB column name (e.g. 'lean', 'sex')
        demographic_options: Dict mapping field names to option lists
    """
    question = DEMOGRAPHIC_QUESTIONS.get(field, f"What is your {field.replace('_', ' ')}?")
    field_options = demographic_options.get(field, [])

    data = {
        "field": DB_TO_API_FIELD.get(field, field),
        "question": question,
        "options": field_options
    }

    return {"type": "demographic", "data": data}
