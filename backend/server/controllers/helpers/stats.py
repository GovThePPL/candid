"""Stats helper functions extracted from stats_controller.py.

Data-fetching and aggregation helpers for stats endpoints.
"""

from typing import Any, Dict, List, Optional

from candid.controllers import db


def empty_demographics(
    group_id: str, group_label: str = "All", member_count: int = 0
) -> Dict[str, Any]:
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
        "incomeRange": {},
    }


def aggregate_demographics(
    demographics: List[Dict],
    group_id: str,
    group_label: str,
    member_count: int,
) -> Dict[str, Any]:
    """Aggregate demographic data into counts per category."""
    lean_counts: Dict[str, int] = {}
    education_counts: Dict[str, int] = {}
    geo_locale_counts: Dict[str, int] = {}
    sex_counts: Dict[str, int] = {}
    race_counts: Dict[str, int] = {}
    age_range_counts: Dict[str, int] = {}
    income_range_counts: Dict[str, int] = {}

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
        "incomeRange": income_range_counts,
    }


def get_user_votes(
    user_id: str,
    category_id: Optional[str],
    location_id: str,
) -> Dict[str, str]:
    """Get the user's votes on positions for this location/category.

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

    result: Dict[str, str] = {}
    for vote in (votes or []):
        result[str(vote["position_id"])] = vote["response"]

    return result


def get_user_position_ids(
    user_id: str,
    category_id: Optional[str],
    location_id: str,
) -> List[str]:
    """Get IDs of positions created by the user for this location/category."""
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


def get_vote_dist_for_group(group_votes: Dict, tid: int, gid: str) -> Dict[str, float]:
    """Compute vote distribution for a tid in a specific group.

    In Polis: A=Agree, D=Disagree, S=Saw (total who saw the comment).
    Pass/Skip = S - A - D.
    """
    gv_data = group_votes.get(gid, {})
    vote_data = gv_data.get("votes", {}).get(str(tid), {})

    agree_count = vote_data.get("A", 0)
    disagree_count = vote_data.get("D", 0)
    saw_count = vote_data.get("S", 0)
    pass_count = max(0, saw_count - agree_count - disagree_count)

    if saw_count > 0:
        return {
            "agree": round(agree_count / saw_count, 3),
            "disagree": round(disagree_count / saw_count, 3),
            "pass": round(pass_count / saw_count, 3),
        }
    return {"agree": 0, "disagree": 0, "pass": 0}


def get_overall_vote_dist(
    votes_base: Dict, group_votes: Dict, tid: int
) -> tuple:
    """Compute overall vote distribution and total vote count across all participants.

    Uses votes-base (all participants) rather than summing group-votes (only clustered users).
    Returns (vote_dist_dict, total_votes).
    """
    vb = votes_base.get(str(tid))
    if vb:
        total_a = sum(vb.get("A", []))
        total_d = sum(vb.get("D", []))
        total_saw = sum(vb.get("S", []))
    else:
        # Fallback to summing group-votes if votes-base is unavailable
        total_a, total_d, total_saw = 0, 0, 0
        for gid, gv_data in group_votes.items():
            votes = gv_data.get("votes", {}).get(str(tid), {})
            total_a += votes.get("A", 0)
            total_d += votes.get("D", 0)
            total_saw += votes.get("S", 0)

    total_pass = max(0, total_saw - total_a - total_d)
    total_votes = total_a + total_d + total_pass

    if total_saw > 0:
        return {
            "agree": round(total_a / total_saw, 3),
            "disagree": round(total_d / total_saw, 3),
            "pass": round(total_pass / total_saw, 3),
        }, total_votes
    return {"agree": 0, "disagree": 0, "pass": 0}, total_votes
