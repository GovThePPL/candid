"""
Stats Controller

Handles Polis opinion group statistics and visualization data.
"""
import math
from typing import Dict, List, Tuple, Union, Optional, Any

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
        groups = _extract_groups(math_data)
        user_position = _extract_user_position(math_data, xid)
        positions = _extract_positions(math_data, category_id, polis_conv_id)

        # If Polis hasn't computed any meaningful data yet, use fallback
        # This happens when there aren't enough votes for clustering
        if not groups and not positions:
            fallback = _get_fallback_stats(location_id, category_id, user_id)
            # Preserve the conversation ID so frontend knows Polis is connected
            fallback.conversation_id = polis_conv_id
            return fallback

        return StatsResponse(
            conversation_id=polis_conv_id,
            groups=groups,
            user_position=user_position,
            positions=positions
        )

    except PolisError as e:
        print(f"Polis error getting stats: {e}", flush=True)
        return _get_fallback_stats(location_id, category_id, user_id)


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
        groups = _extract_groups(math_data)
        user_position = _extract_user_position(math_data, xid)
        positions = _extract_positions(math_data, None, polis_conv_id)

        # If Polis hasn't computed any meaningful data yet, use fallback
        if not groups and not positions:
            fallback = _get_fallback_stats(location_id, None, user_id)
            fallback.conversation_id = polis_conv_id
            return fallback

        return StatsResponse(
            conversation_id=polis_conv_id,
            groups=groups,
            user_position=user_position,
            positions=positions
        )

    except PolisError as e:
        print(f"Polis error getting location stats: {e}", flush=True)
        return _get_fallback_stats(location_id, None, user_id)


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
                   COALESCE(SUM(CASE WHEN r.response = 'agree' THEN 1 ELSE 0 END), 0) as agree_count,
                   COALESCE(SUM(CASE WHEN r.response = 'disagree' THEN 1 ELSE 0 END), 0) as disagree_count,
                   COALESCE(SUM(CASE WHEN r.response = 'pass' THEN 1 ELSE 0 END), 0) as pass_count
            FROM position p
            LEFT JOIN response r ON p.id = r.position_id
            WHERE p.location_id = %s AND p.category_id = %s AND p.status = 'active'
            GROUP BY p.id, p.statement
            ORDER BY (COALESCE(SUM(CASE WHEN r.response = 'agree' THEN 1 ELSE 0 END), 0) +
                      COALESCE(SUM(CASE WHEN r.response = 'disagree' THEN 1 ELSE 0 END), 0)) DESC
            LIMIT 50
        """, (location_id, category_id))
    else:
        # All categories for this location
        positions = db.execute_query("""
            SELECT p.id, p.statement,
                   COALESCE(SUM(CASE WHEN r.response = 'agree' THEN 1 ELSE 0 END), 0) as agree_count,
                   COALESCE(SUM(CASE WHEN r.response = 'disagree' THEN 1 ELSE 0 END), 0) as disagree_count,
                   COALESCE(SUM(CASE WHEN r.response = 'pass' THEN 1 ELSE 0 END), 0) as pass_count
            FROM position p
            LEFT JOIN response r ON p.id = r.position_id
            WHERE p.location_id = %s AND p.status = 'active'
            GROUP BY p.id, p.statement
            ORDER BY (COALESCE(SUM(CASE WHEN r.response = 'agree' THEN 1 ELSE 0 END), 0) +
                      COALESCE(SUM(CASE WHEN r.response = 'disagree' THEN 1 ELSE 0 END), 0)) DESC
            LIMIT 50
        """, (location_id,))

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

        group_positions.append(GroupPosition(
            id=str(p["id"]),
            statement=p["statement"],
            group_id="majority",
            vote_distribution=vote_dist,
            is_defining=False,
            representativeness=0.5
        ))

    return StatsResponse(
        conversation_id=None,
        groups=[],
        user_position=None,
        positions=group_positions
    )


def _extract_groups(math_data: Dict[str, Any]) -> List[OpinionGroup]:
    """
    Extract opinion groups from Polis math data.

    Polis provides:
    - group-clusters: Array of group info with members
    - pca: PCA coordinates for positioning

    We compute convex hulls from member positions.
    """
    groups = []

    group_clusters = math_data.get("group-clusters", [])
    pca = math_data.get("pca", {})
    base_clusters = math_data.get("base-clusters", {})

    # Get participant positions from PCA
    # pca.comps contains [x_coords, y_coords] for all participants
    comps = pca.get("comps", [[], []])
    x_coords = comps[0] if len(comps) > 0 else []
    y_coords = comps[1] if len(comps) > 1 else []

    # Group labels (A, B, C, ...)
    labels = ["A", "B", "C", "D", "E", "F", "G", "H"]

    for i, cluster in enumerate(group_clusters):
        if not cluster:
            continue

        group_id = str(i)
        label = labels[i] if i < len(labels) else f"Group {i+1}"

        # Get member indices for this group
        members = cluster.get("members", [])
        member_count = len(members)

        if member_count == 0:
            continue

        # Extract positions for group members
        member_positions = []
        for member_idx in members:
            if member_idx < len(x_coords) and member_idx < len(y_coords):
                x = x_coords[member_idx]
                y = y_coords[member_idx]
                if x is not None and y is not None:
                    member_positions.append({"x": x, "y": y})

        # Compute convex hull from member positions
        hull = _compute_convex_hull(member_positions)

        # Compute centroid
        centroid = _compute_centroid(member_positions)

        groups.append(OpinionGroup(
            id=group_id,
            label=label,
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
    """
    if not xid:
        return None

    ptpt = math_data.get("ptpt", {})
    if not ptpt:
        return None

    # Get user's PCA projection
    projection = ptpt.get("projection", {})
    if not projection:
        return None

    x = projection.get("0")  # First component
    y = projection.get("1")  # Second component

    if x is None or y is None:
        return None

    # Get user's group assignment
    group_id = str(ptpt.get("group_id", ""))

    return {
        "x": float(x),
        "y": float(y),
        "groupId": group_id
    }


def _extract_positions(
    math_data: Dict[str, Any],
    category_id: str,
    polis_conv_id: str
) -> List[GroupPosition]:
    """
    Extract representative positions for each group from Polis math data.

    Uses the repness (representativeness) data to find defining positions.
    """
    positions = []

    repness = math_data.get("repness", {})
    group_votes = math_data.get("group-votes", {})
    comments = math_data.get("comments", [])

    # Build a lookup from tid to comment text
    tid_to_comment = {}
    for comment in comments:
        tid = comment.get("tid")
        if tid is not None:
            tid_to_comment[tid] = comment.get("txt", "")

    # Get our position mappings for this conversation
    position_mappings = db.execute_query("""
        SELECT pc.polis_comment_tid, pc.position_id, p.statement
        FROM polis_comment pc
        JOIN position p ON pc.position_id = p.id
        WHERE pc.polis_conversation_id = %s
    """, (polis_conv_id,))

    tid_to_position = {}
    for mapping in (position_mappings or []):
        tid_to_position[mapping["polis_comment_tid"]] = {
            "id": str(mapping["position_id"]),
            "statement": mapping["statement"]
        }

    # Process each group's representative comments
    for group_id, rep_comments in repness.items():
        group_vote_data = group_votes.get(group_id, {})

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
                    "statement": statement
                }

            # Get vote distribution for this comment in this group
            vote_data = group_vote_data.get(str(tid), {})
            total_votes = vote_data.get("A", 0) + vote_data.get("D", 0) + vote_data.get("S", 0)

            if total_votes > 0:
                vote_dist = {
                    "agree": round(vote_data.get("A", 0) / total_votes, 3),
                    "disagree": round(vote_data.get("D", 0) / total_votes, 3),
                    "pass": round(vote_data.get("S", 0) / total_votes, 3)
                }
            else:
                vote_dist = {"agree": 0, "disagree": 0, "pass": 0}

            representativeness = rep.get("repness", 0)

            positions.append(GroupPosition(
                id=position_info["id"],
                statement=position_info["statement"],
                group_id=group_id,
                vote_distribution=vote_dist,
                is_defining=representativeness > 0.5,
                representativeness=round(representativeness, 3)
            ))

    # Sort by representativeness descending
    positions.sort(key=lambda p: p.representativeness, reverse=True)

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
