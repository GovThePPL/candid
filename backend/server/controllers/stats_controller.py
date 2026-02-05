"""
Stats Controller

Handles Polis opinion group statistics and visualization data.
"""
import math
import time
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Union, Optional, Any

from flask import make_response, jsonify

from candid.models.error_model import ErrorModel
from candid.models.stats_response import StatsResponse
from candid.models.opinion_group import OpinionGroup
from candid.models.group_position import GroupPosition

from candid.controllers import db, config
from candid.controllers.helpers.auth import authorization
from candid.controllers.helpers.polis_sync import (
    get_oldest_active_conversation,
    generate_xid,
)
from candid.controllers.helpers.polis_client import get_client, PolisError
from candid.controllers.helpers.cache_headers import add_cache_headers

# Simple in-memory cache for group labels with TTL
_label_cache = {}
LABEL_CACHE_TTL = 300  # 5 minutes

# Stats cache max-age in seconds (5 minutes - matches Polis backend cache)
STATS_CACHE_MAX_AGE = 300


def _add_stats_cache_headers(stats: StatsResponse):
    """Add caching headers and computedAt timestamp to stats response.

    Stats data is computed from Polis (which has its own 5-minute cache),
    so we add a computedAt timestamp and appropriate cache headers.

    :param stats: StatsResponse object
    :return: Flask response with cache headers
    """
    computed_at = datetime.now(timezone.utc)

    # Build camelCase dict from Model using attribute_map (same logic as JSONEncoder)
    stats_dict = {}
    for attr in stats.openapi_types:
        value = getattr(stats, attr)
        if value is not None:
            stats_dict[stats.attribute_map[attr]] = value
    stats_dict['computedAt'] = computed_at.isoformat()

    response = make_response(jsonify(stats_dict), 200)
    # Add Last-Modified header (current time since data is computed fresh)
    # Also add Cache-Control with max-age to allow client caching
    response = add_cache_headers(
        response,
        last_modified=computed_at,
        max_age=STATS_CACHE_MAX_AGE
    )
    return response


def _build_report_url(conversation_id: str) -> Optional[str]:
    """Build the URL for the Polis report proxy endpoint.

    Gets or creates a Polis report for the conversation and returns the URL.
    """
    if not conversation_id:
        return None

    if not config.POLIS_ENABLED:
        return None

    try:
        client = get_client()
        report_id = client.get_or_create_report(conversation_id)
        if report_id:
            # Use API path that we proxy
            return f"/api/v1/stats/report/{report_id}"
    except Exception as e:
        print(f"Error getting/creating report: {e}", flush=True)

    return None


def get_group_demographics(location_id: str, category_id: str, group_id: str, token_info=None):
    """Get demographic breakdown for an opinion group.

    Aggregates demographic data for all members of the specified group.

    :param location_id: UUID of the location
    :param category_id: UUID of the category (or 'all' for all categories)
    :param group_id: Group ID (0, 1, 2, etc.) or 'all' for all groups
    :param token_info: JWT token info from authentication
    :rtype: Union[Dict, Tuple[ErrorModel, int]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    # Validate location exists
    location = db.execute_query(
        "SELECT id, name FROM location WHERE id = %s",
        (location_id,),
        fetchone=True
    )
    if not location:
        return ErrorModel(404, "Location not found"), 404

    # Get the Polis conversation
    if category_id == 'all':
        conversation = get_oldest_active_conversation(location_id, None)
    else:
        # Validate category exists
        category = db.execute_query(
            "SELECT id, label FROM position_category WHERE id = %s",
            (category_id,),
            fetchone=True
        )
        if not category:
            return ErrorModel(404, "Category not found"), 404
        conversation = get_oldest_active_conversation(location_id, category_id)

    if not config.POLIS_ENABLED or not conversation:
        # Return empty demographics if no Polis data
        return _empty_demographics(group_id)

    polis_conv_id = conversation["polis_conversation_id"]

    try:
        client = get_client()
        math_data = client.get_math_data(polis_conv_id)

        if not math_data:
            return _empty_demographics(group_id)

        # Extract group member pids
        pca_wrapper = math_data.get("pca", {})
        pca_data = pca_wrapper.get("asPOJO", {}) if isinstance(pca_wrapper, dict) else {}
        group_clusters = pca_data.get("group-clusters", [])

        # Collect pids based on group_id
        member_pids = []
        group_label = "All"

        if group_id == 'all':
            # Get all pids from all groups
            for cluster in group_clusters:
                if cluster:
                    member_pids.extend(cluster.get("members", []))
        else:
            # Get pids from specific group
            try:
                gid = int(group_id)
                if gid < len(group_clusters) and group_clusters[gid]:
                    member_pids = group_clusters[gid].get("members", [])
                    labels = ["A", "B", "C", "D", "E", "F", "G", "H"]
                    group_label = labels[gid] if gid < len(labels) else f"Group {gid + 1}"
                else:
                    return ErrorModel(404, "Group not found"), 404
            except ValueError:
                return ErrorModel(400, "Invalid group ID"), 400

        if not member_pids:
            return _empty_demographics(group_id, group_label)

        # Map pids to user_ids via polis_participant table
        user_ids = db.execute_query("""
            SELECT DISTINCT user_id
            FROM polis_participant
            WHERE polis_conversation_id = %s
              AND polis_pid = ANY(%s)
        """, (polis_conv_id, member_pids))

        user_id_list = [str(u["user_id"]) for u in (user_ids or [])]

        if not user_id_list:
            return _empty_demographics(group_id, group_label, len(member_pids))

        # Get demographics for these users
        placeholders = ",".join(["%s"] * len(user_id_list))
        demographics = db.execute_query(f"""
            SELECT lean, education, geo_locale, sex, race, age_range, income_range
            FROM user_demographics
            WHERE user_id IN ({placeholders})
        """, tuple(user_id_list))

        # Aggregate demographics
        return _aggregate_demographics(
            demographics or [],
            group_id,
            group_label,
            len(member_pids)
        )

    except PolisError as e:
        print(f"Polis error getting group demographics: {e}", flush=True)
        return _empty_demographics(group_id)


def _empty_demographics(group_id: str, group_label: str = "All", member_count: int = 0):
    """Return empty demographics response."""
    return {
        "groupId": group_id,
        "groupLabel": group_label,
        "memberCount": member_count,
        "respondentCount": 0,
        "lean": {},
        "education": {},
        "geoLocale": {},
        "sex": {},
        "race": {},
        "ageRange": {},
        "incomeRange": {}
    }


def _aggregate_demographics(
    demographics: List[Dict],
    group_id: str,
    group_label: str,
    member_count: int
) -> Dict[str, Any]:
    """Aggregate demographic data into counts per category."""
    lean_counts = {}
    education_counts = {}
    geo_locale_counts = {}
    sex_counts = {}
    race_counts = {}
    age_range_counts = {}
    income_range_counts = {}

    for d in demographics:
        if d.get("lean"):
            lean_counts[d["lean"]] = lean_counts.get(d["lean"], 0) + 1
        if d.get("education"):
            education_counts[d["education"]] = education_counts.get(d["education"], 0) + 1
        if d.get("geo_locale"):
            geo_locale_counts[d["geo_locale"]] = geo_locale_counts.get(d["geo_locale"], 0) + 1
        if d.get("sex"):
            sex_counts[d["sex"]] = sex_counts.get(d["sex"], 0) + 1
        if d.get("race"):
            race_counts[d["race"]] = race_counts.get(d["race"], 0) + 1
        if d.get("age_range"):
            age_range_counts[d["age_range"]] = age_range_counts.get(d["age_range"], 0) + 1
        if d.get("income_range"):
            income_range_counts[d["income_range"]] = income_range_counts.get(d["income_range"], 0) + 1

    return {
        "groupId": group_id,
        "groupLabel": group_label,
        "memberCount": member_count,
        "respondentCount": len(demographics),
        "lean": lean_counts,
        "education": education_counts,
        "geoLocale": geo_locale_counts,
        "sex": sex_counts,
        "race": race_counts,
        "ageRange": age_range_counts,
        "incomeRange": income_range_counts
    }


def _get_cached_group_labels(polis_conv_id: str, math_data: Dict) -> Dict[str, Dict]:
    """
    Compute group labels from pairwise surveys, with caching.
    Returns {group_id: {"label": label_text, "wins": win_count, "rankings": [{"label": str, "wins": int}, ...]}}
    """
    cache_key = f"labels:{polis_conv_id}"
    now = time.time()

    # Check cache
    if cache_key in _label_cache:
        cached, timestamp = _label_cache[cache_key]
        if now - timestamp < LABEL_CACHE_TTL:
            return cached

    # Find pairwise survey linked to this conversation
    survey = db.execute_query("""
        SELECT id FROM survey
        WHERE polis_conversation_id = %s
          AND survey_type = 'pairwise'
          AND status = 'active'
        ORDER BY created_time DESC LIMIT 1
    """, (polis_conv_id,), fetchone=True)

    if not survey:
        _label_cache[cache_key] = ({}, now)
        return {}

    survey_id = str(survey["id"])
    labels = {}

    # Get PCA data for group membership
    pca_wrapper = math_data.get("pca", {})
    pca_data = pca_wrapper.get("asPOJO", {}) if isinstance(pca_wrapper, dict) else {}
    group_clusters = pca_data.get("group-clusters", [])

    # For each group, compute all labels ranked by wins
    for group_idx, cluster in enumerate(group_clusters):
        if not cluster:
            continue

        group_id = str(group_idx)
        pids = cluster.get("members", [])

        if not pids:
            continue

        # Get user_ids for this group's members
        user_ids = db.execute_query("""
            SELECT user_id FROM polis_participant
            WHERE polis_conversation_id = %s AND polis_pid = ANY(%s)
        """, (polis_conv_id, pids))

        user_id_list = [str(u["user_id"]) for u in (user_ids or [])]

        if not user_id_list:
            continue

        # Get ALL items ranked by win count for these users
        all_items = db.execute_query("""
            SELECT pi.item_text, COUNT(pr.id) as wins
            FROM pairwise_item pi
            LEFT JOIN pairwise_response pr ON pr.winner_item_id = pi.id
                AND pr.user_id = ANY(%s::uuid[])
            WHERE pi.survey_id = %s::uuid
            GROUP BY pi.id, pi.item_text
            ORDER BY wins DESC
        """, (user_id_list, survey_id))

        # Build rankings list (only items with votes)
        rankings = [
            {"label": item["item_text"], "wins": item["wins"]}
            for item in (all_items or [])
            if item["wins"] > 0
        ]

        if rankings:
            labels[group_id] = {
                "label": rankings[0]["label"],
                "wins": rankings[0]["wins"],
                "rankings": rankings
            }

    # Update cache
    _label_cache[cache_key] = (labels, now)
    return labels


def get_stats(location_id: str, category_id: str, token_info=None):
    """Get Polis opinion group statistics for a location/category combination.

    Fetches PCA data, group clusters, and representative positions from Polis
    and transforms them into the StatsResponse format.

    :param location_id: UUID of the location
    :param category_id: UUID of the category
    :param token_info: JWT token info from authentication
    :rtype: Union[StatsResponse, Tuple[ErrorModel, int]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user_id = token_info.get("sub") if token_info else None

    # Validate location exists
    location = db.execute_query(
        "SELECT id, name FROM location WHERE id = %s",
        (location_id,),
        fetchone=True
    )
    if not location:
        return ErrorModel(404, "Location not found"), 404

    # Validate category exists
    category = db.execute_query(
        "SELECT id, label FROM position_category WHERE id = %s",
        (category_id,),
        fetchone=True
    )
    if not category:
        return ErrorModel(404, "Category not found"), 404

    # Get the active Polis conversation for this location/category
    conversation = get_oldest_active_conversation(location_id, category_id)

    # If Polis is disabled or no conversation exists, use fallback stats
    if not config.POLIS_ENABLED or not conversation:
        return _get_fallback_stats(location_id, category_id, user_id)

    polis_conv_id = conversation["polis_conversation_id"]

    try:
        client = get_client()
        xid = generate_xid(user_id) if user_id else None
        math_data = client.get_math_data(polis_conv_id, xid)

        if not math_data:
            return _get_fallback_stats(location_id, category_id, user_id)

        # Transform Polis data to our format
        groups = _extract_groups(math_data, polis_conv_id)
        user_position = _extract_user_position(math_data, xid)
        user_votes = _get_user_votes(user_id, category_id, location_id) if user_id else None
        user_position_ids = _get_user_position_ids(user_id, category_id, location_id) if user_id else None
        positions = _extract_positions(math_data, category_id, polis_conv_id, user_position_ids)

        # If Polis hasn't computed any meaningful data yet, use fallback
        # This happens when there aren't enough votes for clustering
        if not groups and not positions:
            fallback = _get_fallback_stats(location_id, category_id, user_id)
            # Preserve the conversation ID so frontend knows Polis is connected
            fallback.conversation_id = polis_conv_id
            fallback.polis_report_url = _build_report_url(polis_conv_id)
            return _add_stats_cache_headers(fallback)

        stats = StatsResponse(
            conversation_id=polis_conv_id,
            polis_report_url=_build_report_url(polis_conv_id),
            groups=groups,
            user_position=user_position,
            positions=positions,
            user_votes=user_votes,
            user_position_ids=user_position_ids
        )
        return _add_stats_cache_headers(stats)

    except PolisError as e:
        print(f"Polis error getting stats: {e}", flush=True)
        return _add_stats_cache_headers(_get_fallback_stats(location_id, category_id, user_id))


def get_location_stats(location_id: str, token_info=None):
    """Get Polis opinion group statistics for all categories in a location.

    Uses the location-wide Polis conversation that aggregates all positions.

    :param location_id: UUID of the location
    :param token_info: JWT token info from authentication
    :rtype: Union[StatsResponse, Tuple[ErrorModel, int]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user_id = token_info.get("sub") if token_info else None

    # Validate location exists
    location = db.execute_query(
        "SELECT id, name FROM location WHERE id = %s",
        (location_id,),
        fetchone=True
    )
    if not location:
        return ErrorModel(404, "Location not found"), 404

    # Get the location-wide Polis conversation (category_id = None)
    conversation = get_oldest_active_conversation(location_id, None)

    # If Polis is disabled or no conversation exists, use fallback stats
    if not config.POLIS_ENABLED or not conversation:
        return _get_fallback_stats(location_id, None, user_id)

    polis_conv_id = conversation["polis_conversation_id"]

    try:
        client = get_client()
        xid = generate_xid(user_id) if user_id else None
        math_data = client.get_math_data(polis_conv_id, xid)

        if not math_data:
            return _get_fallback_stats(location_id, None, user_id)

        # Transform Polis data to our format
        groups = _extract_groups(math_data, polis_conv_id)
        user_position = _extract_user_position(math_data, xid)
        user_votes = _get_user_votes(user_id, None, location_id) if user_id else None
        user_position_ids = _get_user_position_ids(user_id, None, location_id) if user_id else None
        positions = _extract_positions(math_data, None, polis_conv_id, user_position_ids)

        # If Polis hasn't computed any meaningful data yet, use fallback
        if not groups and not positions:
            fallback = _get_fallback_stats(location_id, None, user_id)
            fallback.conversation_id = polis_conv_id
            fallback.polis_report_url = _build_report_url(polis_conv_id)
            return _add_stats_cache_headers(fallback)

        stats = StatsResponse(
            conversation_id=polis_conv_id,
            polis_report_url=_build_report_url(polis_conv_id),
            groups=groups,
            user_position=user_position,
            positions=positions,
            user_votes=user_votes,
            user_position_ids=user_position_ids
        )
        return _add_stats_cache_headers(stats)

    except PolisError as e:
        print(f"Polis error getting location stats: {e}", flush=True)
        return _add_stats_cache_headers(_get_fallback_stats(location_id, None, user_id))


def _get_fallback_stats(
    location_id: str,
    category_id: Optional[str],
    user_id: Optional[str]
) -> StatsResponse:
    """
    Generate fallback stats from local database when Polis is unavailable.

    Returns position data without clustering (no groups/hulls).
    If category_id is None, returns positions from all categories.
    """
    # Get positions with vote counts for this location/category
    if category_id:
        positions = db.execute_query("""
            SELECT p.id, p.statement,
                   p.category_id,
                   cat.label as category_label,
                   p.location_id,
                   loc.name as location_name,
                   loc.code as location_code,
                   p.creator_user_id,
                   u.display_name as creator_display_name,
                   u.username as creator_username,
                   u.user_type as creator_user_type,
                   u.trust_score as creator_trust_score,
                   u.avatar_url as creator_avatar_url,
                   u.avatar_icon_url as creator_avatar_icon_url,
                   COALESCE((
                       SELECT COUNT(*) FROM kudos k
                       WHERE k.receiver_user_id = u.id AND k.status = 'sent'
                   ), 0) as creator_kudos_count,
                   COALESCE(SUM(CASE WHEN r.response = 'agree' THEN 1 ELSE 0 END), 0) as agree_count,
                   COALESCE(SUM(CASE WHEN r.response = 'disagree' THEN 1 ELSE 0 END), 0) as disagree_count,
                   COALESCE(SUM(CASE WHEN r.response = 'pass' THEN 1 ELSE 0 END), 0) as pass_count
            FROM position p
            LEFT JOIN response r ON p.id = r.position_id
            LEFT JOIN position_category cat ON p.category_id = cat.id
            LEFT JOIN location loc ON p.location_id = loc.id
            LEFT JOIN users u ON p.creator_user_id = u.id
            WHERE p.location_id = %s AND p.category_id = %s AND p.status = 'active'
            GROUP BY p.id, p.statement, p.category_id, cat.label, p.location_id,
                     loc.name, loc.code, p.creator_user_id, u.id, u.display_name,
                     u.username, u.user_type, u.trust_score, u.avatar_url, u.avatar_icon_url
            ORDER BY (COALESCE(SUM(CASE WHEN r.response = 'agree' THEN 1 ELSE 0 END), 0) +
                      COALESCE(SUM(CASE WHEN r.response = 'disagree' THEN 1 ELSE 0 END), 0)) DESC
            LIMIT 50
        """, (location_id, category_id))
    else:
        # All categories for this location
        positions = db.execute_query("""
            SELECT p.id, p.statement,
                   p.category_id,
                   cat.label as category_label,
                   p.location_id,
                   loc.name as location_name,
                   loc.code as location_code,
                   p.creator_user_id,
                   u.display_name as creator_display_name,
                   u.username as creator_username,
                   u.user_type as creator_user_type,
                   u.trust_score as creator_trust_score,
                   u.avatar_url as creator_avatar_url,
                   u.avatar_icon_url as creator_avatar_icon_url,
                   COALESCE((
                       SELECT COUNT(*) FROM kudos k
                       WHERE k.receiver_user_id = u.id AND k.status = 'sent'
                   ), 0) as creator_kudos_count,
                   COALESCE(SUM(CASE WHEN r.response = 'agree' THEN 1 ELSE 0 END), 0) as agree_count,
                   COALESCE(SUM(CASE WHEN r.response = 'disagree' THEN 1 ELSE 0 END), 0) as disagree_count,
                   COALESCE(SUM(CASE WHEN r.response = 'pass' THEN 1 ELSE 0 END), 0) as pass_count
            FROM position p
            LEFT JOIN response r ON p.id = r.position_id
            LEFT JOIN position_category cat ON p.category_id = cat.id
            LEFT JOIN location loc ON p.location_id = loc.id
            LEFT JOIN users u ON p.creator_user_id = u.id
            WHERE p.location_id = %s AND p.status = 'active'
            GROUP BY p.id, p.statement, p.category_id, cat.label, p.location_id,
                     loc.name, loc.code, p.creator_user_id, u.id, u.display_name,
                     u.username, u.user_type, u.trust_score, u.avatar_url, u.avatar_icon_url
            ORDER BY (COALESCE(SUM(CASE WHEN r.response = 'agree' THEN 1 ELSE 0 END), 0) +
                      COALESCE(SUM(CASE WHEN r.response = 'disagree' THEN 1 ELSE 0 END), 0)) DESC
            LIMIT 50
        """, (location_id,))

    # Get closure counts for all positions
    position_ids = [str(p["id"]) for p in (positions or [])]
    closure_counts = {}
    if position_ids:
        placeholders = ",".join(["%s"] * len(position_ids))
        counts = db.execute_query(f"""
            SELECT up.position_id, COUNT(cl.id) as closure_count
            FROM chat_log cl
            JOIN chat_request cr ON cl.chat_request_id = cr.id
            JOIN user_position up ON cr.user_position_id = up.id
            WHERE up.position_id IN ({placeholders})
              AND cl.end_type = 'agreed_closure'
              AND cl.status != 'deleted'
            GROUP BY up.position_id
        """, tuple(position_ids))
        for row in (counts or []):
            closure_counts[str(row["position_id"])] = row["closure_count"]

    group_positions = []
    for p in (positions or []):
        total = p["agree_count"] + p["disagree_count"] + p["pass_count"]
        if total > 0:
            vote_dist = {
                "agree": round(p["agree_count"] / total, 3),
                "disagree": round(p["disagree_count"] / total, 3),
                "pass": round(p["pass_count"] / total, 3)
            }
        else:
            vote_dist = {"agree": 0, "disagree": 0, "pass": 0}

        creator = None
        if p.get("creator_user_id"):
            creator = {
                "id": str(p["creator_user_id"]),
                "displayName": p.get("creator_display_name", "Anonymous"),
                "username": p.get("creator_username"),
                "userType": p.get("creator_user_type", "normal"),
                "trustScore": float(p.get("creator_trust_score", 0) or 0),
                "avatarUrl": p.get("creator_avatar_url"),
                "avatarIconUrl": p.get("creator_avatar_icon_url"),
                "kudosCount": p.get("creator_kudos_count", 0)
            }

        group_positions.append({
            "id": str(p["id"]),
            "statement": p["statement"],
            "category": {
                "id": str(p["category_id"]) if p.get("category_id") else None,
                "label": p.get("category_label", "Uncategorized")
            },
            "location": {
                "id": str(p["location_id"]) if p.get("location_id") else None,
                "name": p.get("location_name", "Unknown"),
                "code": p.get("location_code", "")
            },
            "creator": creator,
            "groupId": "majority",
            "voteDistribution": vote_dist,
            "totalVotes": total,
            "isDefining": False,
            "representativeness": 0.5,
            "closureCount": closure_counts.get(str(p["id"]), 0)
        })

    user_votes = _get_user_votes(user_id, category_id, location_id) if user_id else None
    user_position_ids = _get_user_position_ids(user_id, category_id, location_id) if user_id else None

    return StatsResponse(
        conversation_id=None,
        groups=[],
        user_position=None,
        positions=group_positions,
        user_votes=user_votes,
        user_position_ids=user_position_ids
    )


def _get_user_votes(
    user_id: str,
    category_id: Optional[str],
    location_id: str
) -> Dict[str, str]:
    """
    Get the user's votes on positions for this location/category.

    Returns a dict mapping position IDs to vote types (agree/disagree/pass).
    """
    if category_id:
        votes = db.execute_query("""
            SELECT r.position_id, r.response
            FROM response r
            JOIN position p ON r.position_id = p.id
            WHERE r.user_id = %s
              AND p.location_id = %s
              AND p.category_id = %s
        """, (user_id, location_id, category_id))
    else:
        votes = db.execute_query("""
            SELECT r.position_id, r.response
            FROM response r
            JOIN position p ON r.position_id = p.id
            WHERE r.user_id = %s
              AND p.location_id = %s
        """, (user_id, location_id))

    result = {}
    for vote in (votes or []):
        result[str(vote["position_id"])] = vote["response"]

    return result


def _get_user_position_ids(
    user_id: str,
    category_id: Optional[str],
    location_id: str
) -> List[str]:
    """
    Get IDs of positions created by the user for this location/category.

    Returns a list of position IDs.
    """
    if category_id:
        positions = db.execute_query("""
            SELECT id FROM position
            WHERE creator_user_id = %s
              AND location_id = %s
              AND category_id = %s
              AND status = 'active'
        """, (user_id, location_id, category_id))
    else:
        positions = db.execute_query("""
            SELECT id FROM position
            WHERE creator_user_id = %s
              AND location_id = %s
              AND status = 'active'
        """, (user_id, location_id))

    return [str(p["id"]) for p in (positions or [])]


def _extract_groups(math_data: Dict[str, Any], polis_conv_id: Optional[str] = None) -> List[OpinionGroup]:
    """
    Extract opinion groups from Polis math data.

    Polis provides:
    - group-clusters: Array of group info with members and centers
    - base-clusters: Contains x, y, id arrays for visualization coordinates

    We compute convex hulls from member positions using base-clusters coordinates.
    If polis_conv_id is provided, also fetches custom labels from pairwise surveys.
    """
    groups = []

    # Polis returns nested structure: pca.asPOJO contains the actual math data
    pca_wrapper = math_data.get("pca", {})
    pca_data = pca_wrapper.get("asPOJO", {}) if isinstance(pca_wrapper, dict) else {}

    group_clusters = pca_data.get("group-clusters", [])
    base_clusters = pca_data.get("base-clusters", {})

    # Get visualization coordinates from base-clusters (NOT pca.comps)
    # base-clusters has: x[], y[], id[] arrays where id[i] maps to (x[i], y[i])
    base_x = base_clusters.get("x", [])
    base_y = base_clusters.get("y", [])
    base_ids = base_clusters.get("id", [])

    # Create mapping from member ID to coordinates
    id_to_coords = {}
    for i, member_id in enumerate(base_ids):
        if i < len(base_x) and i < len(base_y):
            id_to_coords[member_id] = (base_x[i], base_y[i])

    # Group labels (A, B, C, ...)
    labels = ["A", "B", "C", "D", "E", "F", "G", "H"]

    # Get custom labels from pairwise surveys if available
    custom_labels = {}
    if polis_conv_id:
        custom_labels = _get_cached_group_labels(polis_conv_id, math_data)

    for i, cluster in enumerate(group_clusters):
        if not cluster:
            continue

        group_id = str(i)
        label = labels[i] if i < len(labels) else f"Group {i+1}"
        label_info = custom_labels.get(group_id, {})
        custom_label = label_info.get("label") if label_info else None
        label_wins = label_info.get("wins") if label_info else None
        label_rankings = label_info.get("rankings") if label_info else None

        # Get member indices for this group
        members = cluster.get("members", [])
        member_count = len(members)

        if member_count == 0:
            continue

        # Extract positions for group members from base-clusters coordinates
        member_positions = []
        for member_id in members:
            if member_id in id_to_coords:
                x, y = id_to_coords[member_id]
                if x is not None and y is not None:
                    member_positions.append({"x": x, "y": y})

        # Compute convex hull from member positions
        hull = _compute_convex_hull(member_positions)

        # Use Polis-provided center if available, otherwise compute centroid
        polis_center = cluster.get("center", [])
        if polis_center and len(polis_center) >= 2:
            centroid = {"x": round(polis_center[0], 4), "y": round(polis_center[1], 4)}
        else:
            centroid = _compute_centroid(member_positions)

        groups.append(OpinionGroup(
            id=group_id,
            label=label,
            custom_label=custom_label,
            label_wins=label_wins,
            label_rankings=label_rankings,
            member_count=member_count,
            hull=hull,
            centroid=centroid
        ))

    return groups


def _extract_user_position(
    math_data: Dict[str, Any],
    xid: Optional[str]
) -> Optional[Dict[str, Any]]:
    """
    Extract the current user's position from Polis math data.

    Returns x, y coordinates and group membership.

    The user's position comes from base-clusters:
    - base-clusters.members[i] contains participant IDs in each cluster
    - base-clusters.x[i] and y[i] are the cluster coordinates
    - We find which cluster contains the user's pid and return those coordinates
    """
    if not xid:
        return None

    # Get user's participant data which contains their pid
    ptpt = math_data.get("ptpt", {})
    if not ptpt:
        return None

    # Get user's participant ID
    pid = ptpt.get("pid")
    if pid is None:
        return None

    # Get PCA data - Polis returns it wrapped in asPOJO
    pca = math_data.get("pca", {})
    pca_pojo = pca.get("asPOJO", {}) if pca else {}

    # Find user in base-clusters by searching the members arrays
    # base-clusters structure:
    #   id: [cluster_id, ...]    - cluster IDs (NOT participant IDs!)
    #   x: [x1, x2, ...]         - cluster x coordinates
    #   y: [y1, y2, ...]         - cluster y coordinates
    #   members: [[pid1, pid2], [pid3], ...]  - participants in each cluster
    base_clusters = pca_pojo.get("base-clusters", {})
    base_x = base_clusters.get("x", [])
    base_y = base_clusters.get("y", [])
    base_members = base_clusters.get("members", [])

    x, y = None, None
    for i, member_list in enumerate(base_members):
        if pid in member_list:
            if i < len(base_x) and i < len(base_y):
                x = base_x[i]
                y = base_y[i]
            break

    if x is None or y is None:
        return None

    # Get user's group assignment from group-clusters
    # group-clusters is a list of group objects with 'members' arrays
    group_id = ""
    group_clusters = pca_pojo.get("group-clusters", [])
    if isinstance(group_clusters, list):
        for gid, cluster in enumerate(group_clusters):
            if cluster:
                members = cluster.get("members", [])
                if pid in members:
                    group_id = str(gid)
                    break

    return {
        "x": float(x),
        "y": float(y),
        "groupId": group_id
    }


def _extract_positions(
    math_data: Dict[str, Any],
    category_id: str,
    polis_conv_id: str,
    user_position_ids: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Extract representative positions for each group from Polis math data.

    Uses the repness (representativeness) data to find defining positions.
    Also includes consensus data for majority opinion positions.
    Also includes user's own positions for the "My Positions" tab.
    Returns positions with vote distributions for ALL groups.
    """
    # Polis returns nested structure: pca.asPOJO contains the actual math data
    pca_wrapper = math_data.get("pca", {})
    pca_data = pca_wrapper.get("asPOJO", {}) if isinstance(pca_wrapper, dict) else {}

    repness = pca_data.get("repness", {})
    group_votes = pca_data.get("group-votes", {})

    # Get consensus data - positions where most users agree or disagree
    consensus = pca_data.get("consensus", {})
    consensus_agree = {item["tid"]: item["p-success"] for item in consensus.get("agree", [])}
    consensus_disagree = {item["tid"]: item["p-success"] for item in consensus.get("disagree", [])}
    comments = math_data.get("comments", [])

    # Build a lookup from tid to comment text
    tid_to_comment = {}
    for comment in comments:
        tid = comment.get("tid")
        if tid is not None:
            tid_to_comment[tid] = comment.get("txt", "")

    # Get our position mappings for this conversation with category, location, and creator info
    position_mappings = db.execute_query("""
        SELECT
            pc.polis_comment_tid,
            pc.position_id,
            p.statement,
            p.category_id,
            cat.label as category_label,
            p.location_id,
            loc.name as location_name,
            loc.code as location_short_code,
            p.creator_user_id,
            u.display_name as creator_display_name,
            u.username as creator_username,
            u.user_type as creator_user_type,
            u.trust_score as creator_trust_score,
            u.avatar_url as creator_avatar_url,
            u.avatar_icon_url as creator_avatar_icon_url,
            COALESCE((
                SELECT COUNT(*) FROM kudos k
                WHERE k.receiver_user_id = u.id AND k.status = 'sent'
            ), 0) as creator_kudos_count
        FROM polis_comment pc
        JOIN position p ON pc.position_id = p.id
        LEFT JOIN position_category cat ON p.category_id = cat.id
        LEFT JOIN location loc ON p.location_id = loc.id
        LEFT JOIN users u ON p.creator_user_id = u.id
        WHERE pc.polis_conversation_id = %s
    """, (polis_conv_id,))

    tid_to_position = {}
    for mapping in (position_mappings or []):
        creator = None
        if mapping.get("creator_user_id"):
            creator = {
                "id": str(mapping["creator_user_id"]),
                "displayName": mapping.get("creator_display_name", "Anonymous"),
                "username": mapping.get("creator_username"),
                "userType": mapping.get("creator_user_type", "normal"),
                "trustScore": float(mapping.get("creator_trust_score", 0) or 0),
                "avatarUrl": mapping.get("creator_avatar_url"),
                "avatarIconUrl": mapping.get("creator_avatar_icon_url"),
                "kudosCount": mapping.get("creator_kudos_count", 0)
            }

        tid_to_position[mapping["polis_comment_tid"]] = {
            "id": str(mapping["position_id"]),
            "statement": mapping["statement"],
            "category": {
                "id": str(mapping["category_id"]) if mapping.get("category_id") else None,
                "label": mapping.get("category_label", "Uncategorized")
            },
            "location": {
                "id": str(mapping["location_id"]) if mapping.get("location_id") else None,
                "name": mapping.get("location_name", "Unknown"),
                "code": mapping.get("location_short_code", "")
            },
            "creator": creator
        }

    # Collect unique positions with their best representativeness and primary group
    # Key: position_id or "polis:tid", Value: position data
    unique_positions = {}

    # First, add positions from repness (group-defining positions)
    for group_id, rep_comments in repness.items():
        for rep in rep_comments:
            tid = rep.get("tid")
            if tid is None:
                continue

            # Get position info
            position_info = tid_to_position.get(tid)
            if not position_info:
                # Use Polis comment text as fallback
                statement = tid_to_comment.get(tid, f"Comment {tid}")
                position_info = {
                    "id": f"polis:{tid}",
                    "statement": statement,
                    "category": None,
                    "location": None,
                    "creator": None
                }

            pos_id = position_info["id"]
            representativeness = rep.get("repness", 0)

            # Track the highest representativeness and associated group for each position
            if pos_id not in unique_positions or representativeness > unique_positions[pos_id]["representativeness"]:
                unique_positions[pos_id] = {
                    "id": pos_id,
                    "tid": tid,
                    "statement": position_info["statement"],
                    "category": position_info.get("category"),
                    "location": position_info.get("location"),
                    "creator": position_info.get("creator"),
                    "groupId": group_id,
                    "representativeness": representativeness,
                    "isDefining": representativeness > 0.5,
                }

    # Also add consensus positions (majority opinion positions)
    # These are positions where most users agree or disagree
    for consensus_type, consensus_items in consensus.items():
        for item in consensus_items:
            tid = item.get("tid")
            if tid is None:
                continue

            # Skip if already added from repness
            position_info = tid_to_position.get(tid)
            if position_info:
                pos_id = position_info["id"]
            else:
                pos_id = f"polis:{tid}"

            if pos_id in unique_positions:
                continue

            # Get position info
            if not position_info:
                statement = tid_to_comment.get(tid, f"Comment {tid}")
                position_info = {
                    "id": pos_id,
                    "statement": statement,
                    "category": None,
                    "location": None,
                    "creator": None
                }

            unique_positions[pos_id] = {
                "id": pos_id,
                "tid": tid,
                "statement": position_info["statement"],
                "category": position_info.get("category"),
                "location": position_info.get("location"),
                "creator": position_info.get("creator"),
                "groupId": "majority",  # Consensus positions belong to majority
                "representativeness": item.get("p-success", 0),
                "isDefining": False,  # Not defining for a specific group
            }

    # Helper to compute vote distribution for a tid in a specific group
    # In Polis: A=Agree, D=Disagree, S=Saw (total who saw the comment)
    # Pass/Skip = S - A - D (saw but didn't vote agree/disagree)
    # Unanswered = n_members - S (haven't seen it yet)
    def get_vote_dist_for_group(tid, gid):
        gv_data = group_votes.get(gid, {})
        n_members = gv_data.get("n-members", 0)
        vote_data = gv_data.get("votes", {}).get(str(tid), {})

        agree_count = vote_data.get("A", 0)
        disagree_count = vote_data.get("D", 0)
        saw_count = vote_data.get("S", 0)
        pass_count = max(0, saw_count - agree_count - disagree_count)

        if n_members > 0:
            return {
                "agree": round(agree_count / n_members, 3),
                "disagree": round(disagree_count / n_members, 3),
                "pass": round(pass_count / n_members, 3)
                # unanswered is implicit: 1 - (agree + disagree + pass)
            }
        return {"agree": 0, "disagree": 0, "pass": 0}

    # Helper to compute overall vote distribution and total vote count across all groups
    def get_overall_vote_dist_and_count(tid):
        total_a, total_d, total_pass, total_members = 0, 0, 0, 0
        for gid, gv_data in group_votes.items():
            votes = gv_data.get("votes", {}).get(str(tid), {})
            a = votes.get("A", 0)
            d = votes.get("D", 0)
            s = votes.get("S", 0)
            total_a += a
            total_d += d
            total_pass += max(0, s - a - d)
            total_members += gv_data.get("n-members", 0)

        total_votes = total_a + total_d + total_pass

        if total_members > 0:
            return {
                "agree": round(total_a / total_members, 3),
                "disagree": round(total_d / total_members, 3),
                "pass": round(total_pass / total_members, 3)
                # unanswered is implicit: 1 - (agree + disagree + pass)
            }, total_votes
        return {"agree": 0, "disagree": 0, "pass": 0}, total_votes

    # Build final positions list with groupVotes for all groups
    positions = []
    all_group_ids = list(group_votes.keys())

    for pos_data in unique_positions.values():
        tid = pos_data["tid"]

        # Compute vote distributions for each group
        group_votes_dict = {}
        for gid in all_group_ids:
            group_votes_dict[gid] = get_vote_dist_for_group(tid, gid)

        # Check if this position has consensus (majority opinion)
        consensus_type = None
        consensus_score = None
        if tid in consensus_agree:
            consensus_type = "agree"
            consensus_score = consensus_agree[tid]
        elif tid in consensus_disagree:
            consensus_type = "disagree"
            consensus_score = consensus_disagree[tid]

        vote_dist, total_votes = get_overall_vote_dist_and_count(tid)

        positions.append({
            "id": pos_data["id"],
            "statement": pos_data["statement"],
            "category": pos_data.get("category"),
            "location": pos_data.get("location"),
            "creator": pos_data.get("creator"),
            "groupId": pos_data["groupId"],
            "voteDistribution": vote_dist,
            "totalVotes": total_votes,
            "groupVotes": group_votes_dict,
            "isDefining": pos_data["isDefining"],
            "representativeness": round(pos_data["representativeness"], 3),
            "consensusType": consensus_type,
            "consensusScore": round(consensus_score, 3) if consensus_score else None
        })

    # Add user's own positions if not already included
    # These are needed for the "My Positions" tab
    if user_position_ids:
        existing_ids = {p["id"] for p in positions}
        missing_user_position_ids = [pid for pid in user_position_ids if pid not in existing_ids]

        if missing_user_position_ids:
            # Fetch user positions from database
            placeholders = ",".join(["%s"] * len(missing_user_position_ids))
            user_positions_data = db.execute_query(f"""
                SELECT
                    p.id as position_id,
                    p.statement,
                    p.category_id,
                    cat.label as category_label,
                    p.location_id,
                    loc.name as location_name,
                    loc.code as location_short_code,
                    p.creator_user_id,
                    u.display_name as creator_display_name,
                    u.username as creator_username,
                    u.user_type as creator_user_type,
                    u.trust_score as creator_trust_score,
                    u.avatar_url as creator_avatar_url,
                    u.avatar_icon_url as creator_avatar_icon_url,
                    COALESCE((
                        SELECT COUNT(*) FROM kudos k
                        WHERE k.receiver_user_id = u.id AND k.status = 'sent'
                    ), 0) as creator_kudos_count,
                    pc.polis_comment_tid
                FROM position p
                LEFT JOIN position_category cat ON p.category_id = cat.id
                LEFT JOIN location loc ON p.location_id = loc.id
                LEFT JOIN users u ON p.creator_user_id = u.id
                LEFT JOIN polis_comment pc ON pc.position_id = p.id
                    AND pc.polis_conversation_id = %s
                WHERE p.id IN ({placeholders})
            """, (polis_conv_id, *missing_user_position_ids))

            for up in (user_positions_data or []):
                tid = up.get("polis_comment_tid")

                creator = None
                if up.get("creator_user_id"):
                    creator = {
                        "id": str(up["creator_user_id"]),
                        "displayName": up.get("creator_display_name", "Anonymous"),
                        "username": up.get("creator_username"),
                        "userType": up.get("creator_user_type", "normal"),
                        "trustScore": float(up.get("creator_trust_score", 0) or 0),
                        "avatarUrl": up.get("creator_avatar_url"),
                        "avatarIconUrl": up.get("creator_avatar_icon_url"),
                        "kudosCount": up.get("creator_kudos_count", 0)
                    }

                # Get vote distributions if we have a tid
                vote_dist = {"agree": 0, "disagree": 0, "pass": 0}
                total_votes = 0
                group_votes_dict = {}
                if tid is not None:
                    vote_dist, total_votes = get_overall_vote_dist_and_count(tid)
                    for gid in all_group_ids:
                        group_votes_dict[gid] = get_vote_dist_for_group(tid, gid)

                positions.append({
                    "id": str(up["position_id"]),
                    "statement": up["statement"],
                    "category": {
                        "id": str(up["category_id"]) if up.get("category_id") else None,
                        "label": up.get("category_label", "Uncategorized")
                    },
                    "location": {
                        "id": str(up["location_id"]) if up.get("location_id") else None,
                        "name": up.get("location_name", "Unknown"),
                        "code": up.get("location_short_code", "")
                    },
                    "creator": creator,
                    "groupId": None,
                    "voteDistribution": vote_dist,
                    "totalVotes": total_votes,
                    "groupVotes": group_votes_dict,
                    "isDefining": False,
                    "representativeness": 0,
                    "consensusType": None,
                    "consensusScore": None
                })

    # Add closure counts for all positions
    real_position_ids = [p["id"] for p in positions if not p["id"].startswith("polis:")]
    closure_counts = {}
    if real_position_ids:
        placeholders = ",".join(["%s"] * len(real_position_ids))
        counts = db.execute_query(f"""
            SELECT up.position_id, COUNT(cl.id) as closure_count
            FROM chat_log cl
            JOIN chat_request cr ON cl.chat_request_id = cr.id
            JOIN user_position up ON cr.user_position_id = up.id
            WHERE up.position_id IN ({placeholders})
              AND cl.end_type = 'agreed_closure'
              AND cl.status != 'deleted'
            GROUP BY up.position_id
        """, tuple(real_position_ids))
        for row in (counts or []):
            closure_counts[str(row["position_id"])] = row["closure_count"]

    for p in positions:
        p["closureCount"] = closure_counts.get(p["id"], 0)

    # Sort by representativeness descending
    positions.sort(key=lambda p: p["representativeness"], reverse=True)

    return positions


def _compute_convex_hull(points: List[Dict[str, float]]) -> List[Dict[str, float]]:
    """
    Compute the convex hull of a set of 2D points using Graham scan.

    Returns points in counter-clockwise order.
    """
    if len(points) < 3:
        return points

    # Find the point with lowest y (and leftmost if tied)
    def bottom_left(p):
        return (p["y"], p["x"])

    points = sorted(points, key=bottom_left)
    start = points[0]

    # Sort remaining points by polar angle from start point
    def polar_angle(p):
        dx = p["x"] - start["x"]
        dy = p["y"] - start["y"]
        return math.atan2(dy, dx)

    rest = sorted(points[1:], key=polar_angle)

    # Build hull using Graham scan
    hull = [start]

    for p in rest:
        while len(hull) > 1:
            # Check if we make a left turn
            o = hull[-2]
            a = hull[-1]
            cross = (a["x"] - o["x"]) * (p["y"] - o["y"]) - (a["y"] - o["y"]) * (p["x"] - o["x"])
            if cross <= 0:
                hull.pop()
            else:
                break
        hull.append(p)

    return hull


def _compute_centroid(points: List[Dict[str, float]]) -> Dict[str, float]:
    """
    Compute the centroid (center of mass) of a set of points.
    """
    if not points:
        return {"x": 0, "y": 0}

    x_sum = sum(p["x"] for p in points)
    y_sum = sum(p["y"] for p in points)
    n = len(points)

    return {
        "x": round(x_sum / n, 4),
        "y": round(y_sum / n, 4)
    }


def get_polis_report(conversation_id: str, token_info=None):
    """Proxy the Polis report page for a conversation or report.

    Fetches the report from the internal Polis server and returns the HTML.
    This endpoint is publicly accessible since Polis reports contain only
    aggregate data (vote distributions, group summaries) and no personal info.

    :param conversation_id: The Polis conversation ID or report ID (starts with 'r')
    :param token_info: JWT token info from authentication
    :rtype: Union[str, Tuple[ErrorModel, int]]
    """
    import re
    import requests
    from flask import Response

    # Reports are public - they contain only aggregate data, no personal info

    if not config.POLIS_ENABLED:
        return ErrorModel(404, "Polis is not enabled"), 404

    # Determine if this is a report_id (starts with 'r') or conversation_id
    if conversation_id.startswith('r'):
        # It's already a report_id - use it directly
        polis_id = conversation_id
    else:
        # It's a conversation_id - validate it exists in our database
        conversation = db.execute_query(
            "SELECT polis_conversation_id FROM polis_conversation WHERE polis_conversation_id = %s",
            (conversation_id,),
            fetchone=True
        )
        if not conversation:
            return ErrorModel(404, "Conversation not found"), 404

        # Get or create a report for this conversation
        try:
            client = get_client()
            report_id = client.get_or_create_report(conversation_id)
            if report_id:
                polis_id = report_id
                print(f"[POLIS REPORT] Using report_id {report_id} for conversation {conversation_id}", flush=True)
            else:
                # Fall back to conversation_id if report creation fails
                polis_id = conversation_id
                print(f"[POLIS REPORT] Failed to get/create report, using conversation_id {conversation_id}", flush=True)
        except Exception as e:
            print(f"[POLIS REPORT] Error getting/creating report: {e}", flush=True)
            polis_id = conversation_id

    try:
        # Fetch the report from internal Polis
        polis_report_url = f"{config.POLIS_BASE_URL}/report/{polis_id}"
        response = requests.get(polis_report_url, timeout=config.POLIS_TIMEOUT)

        if response.status_code == 404:
            return ErrorModel(404, "Report not found"), 404

        if response.status_code != 200:
            return ErrorModel(502, f"Failed to fetch report: {response.status_code}"), 502

        # Rewrite relative URLs to go through our asset proxy
        html_content = response.content.decode('utf-8')

        # Rewrite src="/..." and href="/..." to use our proxy
        # But keep external URLs (https://, http://) unchanged
        html_content = re.sub(
            r'(src|href)="(/[^"]+)"',
            r'\1="/api/v1/polis-asset\2"',
            html_content
        )

        # Inject script to set correct path context for Polis JavaScript
        # The Polis JS parses window.location.pathname expecting /report/{id}
        # but we serve at /api/v1/stats/report/{id}, so we need to provide the
        # correct values via global variables that we'll use in a patched bundle
        # For now, we inject a script that patches the path before the bundle runs
        path_fix_script = f'''
<script>
// Fix path parsing for proxied Polis report
// The bundle expects /report/{{id}} but we're at /api/v1/stats/report/{{id}}
window.__POLIS_PROXY_REPORT_ID__ = "{polis_id}";
window.__POLIS_PROXY_ROUTE_TYPE__ = "report";
</script>
'''
        # Insert the fix script before </head>
        html_content = html_content.replace('</head>', path_fix_script + '</head>')

        return Response(
            html_content,
            status=200,
            content_type=response.headers.get('Content-Type', 'text/html')
        )

    except requests.Timeout:
        return ErrorModel(502, "Polis report request timed out"), 502
    except requests.RequestException as e:
        print(f"Error fetching Polis report: {e}", flush=True)
        return ErrorModel(502, "Failed to connect to Polis"), 502


def get_polis_asset(path: str):
    """Proxy Polis static assets (JS, CSS, images).

    This allows the Polis report to load its assets through our API
    without exposing the Polis server directly.

    :param path: The asset path (e.g., "report_bundle.js")
    :rtype: Response
    """
    import re
    import requests
    from flask import Response, request

    if not config.POLIS_ENABLED:
        return ErrorModel(404, "Polis is not enabled"), 404

    try:
        # Fetch the asset from internal Polis
        polis_asset_url = f"{config.POLIS_BASE_URL}/{path}"

        # Forward query string if present
        if request.query_string:
            polis_asset_url += f"?{request.query_string.decode('utf-8')}"

        response = requests.get(polis_asset_url, timeout=config.POLIS_TIMEOUT)

        if response.status_code == 404:
            return ErrorModel(404, "Asset not found"), 404

        if response.status_code != 200:
            return ErrorModel(502, f"Failed to fetch asset: {response.status_code}"), 502

        content = response.content
        content_type = response.headers.get('Content-Type', 'application/octet-stream')

        # Patch the report bundle JavaScript to use our proxy path fix
        # The Polis JS parses window.location.pathname expecting /report/{id}
        # but we serve at /api/v1/stats/report/{id}
        print(f"[POLIS ASSET] path={path}, is_report_bundle={'report_bundle' in path and path.endswith('.js')}", flush=True)
        if 'report_bundle' in path and path.endswith('.js'):
            js_content = content.decode('utf-8')

            # Prepend a helper function that returns the correct pathname
            # This gets called instead of directly accessing window.location.pathname
            path_fix = '''
(function(){
  // Polis proxy path fix: provide correct pathname for path parsing
  if(window.__POLIS_PROXY_REPORT_ID__){
    window.__getPolisPathname=function(){return"/report/"+window.__POLIS_PROXY_REPORT_ID__};
  }else{
    window.__getPolisPathname=function(){return window.location.pathname};
  }
})();
'''
            # Replace window.location.pathname with our helper function call
            # Handle various forms: window.location.pathname, self.location.pathname
            js_content = re.sub(
                r'\bwindow\.location\.pathname\b',
                'window.__getPolisPathname()',
                js_content
            )
            js_content = re.sub(
                r'\bself\.location\.pathname\b',
                '(window.__getPolisPathname?window.__getPolisPathname():self.location.pathname)',
                js_content
            )

            content = (path_fix + js_content).encode('utf-8')
            print(f"[POLIS ASSET] Patched report bundle, added {len(path_fix)} bytes", flush=True)

        return Response(
            content,
            status=200,
            content_type=content_type
        )

    except requests.Timeout:
        return ErrorModel(502, "Polis asset request timed out"), 502
    except requests.RequestException as e:
        print(f"Error fetching Polis asset: {e}", flush=True)
        return ErrorModel(502, "Failed to connect to Polis"), 502


def proxy_polis_api(path: str):
    """Proxy Polis API calls.

    This allows the Polis report to make API calls through our API
    without exposing the Polis server directly.

    :param path: The API path (e.g., "math/pca2")
    :rtype: Response
    """
    import requests
    from flask import Response, request

    if not config.POLIS_ENABLED:
        return ErrorModel(404, "Polis is not enabled"), 404

    try:
        # Build the Polis API URL
        polis_api_url = f"{config.POLIS_API_URL}/{path}"

        # Forward query string if present
        if request.query_string:
            polis_api_url += f"?{request.query_string.decode('utf-8')}"

        # Forward the request method and body
        if request.method == 'POST':
            response = requests.post(
                polis_api_url,
                json=request.get_json(silent=True),
                timeout=config.POLIS_TIMEOUT
            )
        else:
            response = requests.get(polis_api_url, timeout=config.POLIS_TIMEOUT)

        return Response(
            response.content,
            status=response.status_code,
            content_type=response.headers.get('Content-Type', 'application/json')
        )

    except requests.Timeout:
        return ErrorModel(502, "Polis API request timed out"), 502
    except requests.RequestException as e:
        print(f"Error proxying Polis API: {e}", flush=True)
        return ErrorModel(502, "Failed to connect to Polis"), 502
