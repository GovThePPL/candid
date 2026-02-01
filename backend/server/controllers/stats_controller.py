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
        user_votes = _get_user_votes(user_id, category_id, location_id) if user_id else None
        user_position_ids = _get_user_position_ids(user_id, category_id, location_id) if user_id else None
        positions = _extract_positions(math_data, category_id, polis_conv_id, user_position_ids)

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
            positions=positions,
            user_votes=user_votes,
            user_position_ids=user_position_ids
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
        user_votes = _get_user_votes(user_id, None, location_id) if user_id else None
        user_position_ids = _get_user_position_ids(user_id, None, location_id) if user_id else None
        positions = _extract_positions(math_data, None, polis_conv_id, user_position_ids)

        # If Polis hasn't computed any meaningful data yet, use fallback
        if not groups and not positions:
            fallback = _get_fallback_stats(location_id, None, user_id)
            fallback.conversation_id = polis_conv_id
            return fallback

        return StatsResponse(
            conversation_id=polis_conv_id,
            groups=groups,
            user_position=user_position,
            positions=positions,
            user_votes=user_votes,
            user_position_ids=user_position_ids
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


def _extract_groups(math_data: Dict[str, Any]) -> List[OpinionGroup]:
    """
    Extract opinion groups from Polis math data.

    Polis provides:
    - group-clusters: Array of group info with members and centers
    - base-clusters: Contains x, y, id arrays for visualization coordinates

    We compute convex hulls from member positions using base-clusters coordinates.
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
            u.user_type as creator_user_type,
            u.trust_score as creator_trust_score
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
                "userType": mapping.get("creator_user_type", "normal"),
                "trustScore": float(mapping.get("creator_trust_score", 0) or 0)
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
                "shortCode": mapping.get("location_short_code", "")
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
                    u.user_type as creator_user_type,
                    u.trust_score as creator_trust_score,
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
                        "userType": up.get("creator_user_type", "normal"),
                        "trustScore": float(up.get("creator_trust_score", 0) or 0)
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
                        "shortCode": up.get("location_short_code", "")
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
