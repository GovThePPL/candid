"""Sessions controller — CRUD and stage management for sessions."""

import logging

import connexion
from typing import Dict, List
from typing import Tuple
from typing import Union

from flask import make_response, jsonify

from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.session import Session  # noqa: E501
from candid import util

from candid.controllers import db
from candid.controllers.helpers.auth import (
    authorization, authorization_allow_banned, authorization_scoped,
    require_auth, validate_stage_advance, check_session_stage,
    is_facilitator_for,
)
from candid.controllers.helpers.serializers import clamp_pagination
from candid.controllers.helpers import nlp
from candid.controllers.helpers.cache_headers import add_cache_headers
from candid.controllers.helpers.push_notifications import send_or_queue_notification
from candid.controllers.helpers.polis_sync import get_or_create_conversation
from candid.controllers.helpers.constants import MAX_ENDORSEMENTS_PER_USER
from candid.controllers.helpers.rcv_tally import tally_results

logger = logging.getLogger(__name__)

# Cache sessions for 5 minutes (300 seconds)
SESSIONS_CACHE_MAX_AGE = 300


def _row_to_session(row):
    """Convert a DB row to a Session response dict."""
    result = {
        'id': str(row['id']),
        'label': row['label'],
        'description': row.get('description'),
        'locationId': str(row['location_id']) if row.get('location_id') else None,
        'stage': row.get('stage'),
        'stageChangedAt': row['stage_changed_at'].isoformat() if row.get('stage_changed_at') else None,
        'stageChangedBy': str(row['stage_changed_by']) if row.get('stage_changed_by') else None,
        'facilitatorUserId': str(row['facilitator_user_id']) if row.get('facilitator_user_id') else None,
        'status': row.get('status'),
        'createdBy': str(row['created_by']) if row.get('created_by') else None,
        'proposalMethod': row.get('proposal_method', 'user_driven'),
    }
    # Include location details if joined
    if row.get('location_code') is not None:
        result['locationCode'] = row['location_code']
        result['locationName'] = row['location_name']
    # Include accepted proposal title if joined
    if row.get('accepted_proposal_title') is not None:
        result['acceptedProposalTitle'] = row['accepted_proposal_title']
    return result


SESSION_SELECT = """
    SELECT s.id, s.label, s.description, s.location_id, s.stage,
           s.stage_changed_at, s.stage_changed_by, s.facilitator_user_id,
           s.status, s.created_by, s.proposal_method,
           l.code AS location_code, l.name AS location_name,
           ap.title AS accepted_proposal_title
    FROM session s
    LEFT JOIN location l ON l.id = s.location_id
    LEFT JOIN LATERAL (
        SELECT p.title FROM post p
        WHERE p.session_id = s.id
          AND p.post_type = 'proposal'
          AND p.proposal_status = 'finalized'
        ORDER BY p.upvote_count DESC NULLS LAST
        LIMIT 1
    ) ap ON true
"""


@require_auth("normal", allow_banned=True)
def get_all_sessions(location_id=None, offset=0, limit=50, token_info=None, user_id=None):  # noqa: E501
    """Get all sessions

     # noqa: E501


    :rtype: Union[List[Session], Tuple[List[Session], int], Tuple[List[Session], int, Dict[str, str]]
    """
    _limit, _offset = clamp_pagination(limit, offset, default_limit=50)

    if location_id:
        rows = db.execute_query(
            SESSION_SELECT +
            " WHERE s.id IN (SELECT session_id FROM location_session WHERE location_id = %s)"
            " ORDER BY s.label LIMIT %s OFFSET %s",
            (str(location_id), _limit, _offset))
    else:
        rows = db.execute_query(
            SESSION_SELECT + " ORDER BY s.label LIMIT %s OFFSET %s",
            (_limit, _offset))

    if rows is None:
        rows = []

    sessions = [_row_to_session(row) for row in rows]

    response = make_response(jsonify(sessions), 200)
    response = add_cache_headers(response, max_age=SESSIONS_CACHE_MAX_AGE)
    return response


@require_auth("normal", allow_banned=True)
def get_session(session_id, token_info=None, user_id=None):  # noqa: E501
    """Get session details."""
    row = db.execute_query(
        SESSION_SELECT + " WHERE s.id = %s",
        (str(session_id),), fetchone=True,
    )

    if not row:
        return ErrorModel(404, "Session not found"), 404

    return _row_to_session(row), 200


def update_session(session_id, body, token_info=None):  # noqa: E501
    """Update a session (including stage advance)."""
    if not token_info:
        return ErrorModel(401, "Authentication Required"), 401

    user_id = token_info["sub"]

    # Fetch session
    session = db.execute_query(
        SESSION_SELECT + " WHERE s.id = %s",
        (str(session_id),), fetchone=True,
    )

    if not session:
        return ErrorModel(404, "Session not found"), 404

    location_id = str(session['location_id']) if session.get('location_id') else None

    # Authorization: facilitator, moderator, or admin at this location
    authorized, auth_err = authorization_scoped(
        "facilitator", token_info=token_info,
        location_id=location_id, session_id=str(session_id),
    )
    if not authorized:
        return auth_err, auth_err.code

    data = connexion.request.get_json()
    requested_stage = data.get("stage")
    requested_label = data.get("label")
    requested_status = data.get("status")
    reason = data.get("reason")

    if not requested_stage and requested_label is None and requested_status is None:
        return ErrorModel(400, "No fields to update"), 400

    # Validate label if provided
    label = None
    if requested_label is not None:
        label = requested_label.strip()
        if not label:
            return ErrorModel(400, "Label cannot be empty"), 400
        if len(label) > 255:
            return ErrorModel(400, "Label must be 255 characters or fewer"), 400

    # Validate status if provided
    if requested_status is not None:
        if requested_status != "archived":
            return ErrorModel(400, "Status can only be set to 'archived'"), 400
        if session.get("status") and session["status"] != "active":
            return ErrorModel(400, "Only active sessions can be archived"), 400

    # Block stage advances on non-active sessions
    current_stage = session['stage']
    if requested_stage and session.get("status") and session["status"] != "active":
        return ErrorModel(400, "Cannot advance stage on a non-active session"), 400

    # Validate stage transition if stage provided
    if requested_stage:
        valid, err_msg = validate_stage_advance(current_stage, requested_stage)
        if not valid:
            return ErrorModel(400, err_msg), 400

        # Block advancement if this stage has a voting round that isn't finished
        round_type = STAGE_TO_ROUND_TYPE.get(current_stage)
        if round_type:
            vr = _get_voting_round_row(session_id, round_type)
            if not vr or vr['status'] != 'voting_closed':
                return ErrorModel(400, "Cannot advance: voting round must be completed first"), 400

    # Atomically update label + status + stage + record history
    with db.transaction() as tx:
        # Update status if provided
        if requested_status is not None:
            tx.execute("""
                UPDATE session SET status = %s, updated_time = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (requested_status, str(session_id)))

        # Update label if provided
        if label is not None:
            tx.execute("""
                UPDATE session SET label = %s, updated_time = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (label, str(session_id)))

        # Stage advance logic
        if requested_stage:
            tx.execute("""
                UPDATE session
                SET stage = %s, stage_changed_at = CURRENT_TIMESTAMP, stage_changed_by = %s,
                    updated_time = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (requested_stage, user_id, str(session_id)))

            tx.execute("""
                INSERT INTO session_stage_history (session_id, from_stage, to_stage, changed_by, reason)
                VALUES (%s, %s, %s, %s, %s)
            """, (str(session_id), current_stage, requested_stage, user_id, reason))

            # Auto-pin RCV-winning proposal when entering opinion phase
            # Triggers for all proposal methods (user_driven, admin_provided)
            if requested_stage == 'opinion_discussion':
                # Find the rank-1 winner from the completed voting round
                accepted = None
                issue_vr = _get_voting_round_row(session_id, 'issue_selection')
                if issue_vr and issue_vr.get('results_json'):
                    import json
                    rcv_results = issue_vr['results_json']
                    if isinstance(rcv_results, str):
                        rcv_results = json.loads(rcv_results)
                    winners = rcv_results.get('winners', [])
                    rank1 = next((w for w in winners if w.get('rank') == 1), None)
                    if rank1:
                        accepted = {'id': rank1['proposalPostId']}

                if accepted:
                    post_id = str(accepted['id'])
                    for pin_stage in (
                        'opinion_discussion', 'reflection_curation', 'reflection_proposals',
                        'consensus',
                    ):
                        tx.execute("""
                            INSERT INTO pinned_post (post_id, session_id, stage, post_type, pinned_by)
                            VALUES (%s, %s, %s, 'discussion', %s)
                            ON CONFLICT (session_id, stage, post_type, post_id) DO NOTHING
                        """, (post_id, str(session_id), pin_stage, user_id))

        # Fetch updated session within same transaction
        updated = tx.execute(
            SESSION_SELECT + " WHERE s.id = %s",
            (str(session_id),), fetchone=True,
        )

    # Post-commit side effects (only when stage changes)
    if requested_stage:
        # Notify session members (after commit)
        _notify_stage_advance(session, requested_stage, user_id)

        # Create opinion-phase Polis conversation when entering opinion phase
        if requested_stage == 'opinion_discussion':
            if location_id:
                loc_row = db.execute_query(
                    "SELECT name FROM location WHERE id = %s",
                    (location_id,), fetchone=True,
                )
                if loc_row:
                    try:
                        get_or_create_conversation(
                            location_id, str(session_id),
                            loc_row["name"], session["label"],
                            phase="opinion",
                        )
                    except Exception as e:
                        logger.error("Failed to create opinion Polis conversation: %s", e)

        # Create reflection-phase Polis conversation when entering reflection phase
        if current_stage == 'opinion_discussion' and requested_stage == 'reflection_curation':
            if location_id:
                loc_row = db.execute_query(
                    "SELECT name FROM location WHERE id = %s",
                    (location_id,), fetchone=True,
                )
                if loc_row:
                    try:
                        get_or_create_conversation(
                            location_id, str(session_id),
                            loc_row["name"], session["label"],
                            phase="reflection",
                        )
                    except Exception as e:
                        logger.error("Failed to create reflection Polis conversation: %s", e)

    return _row_to_session(updated), 200


def _notify_stage_advance(session, new_stage, actor_user_id):
    """Send push notification to all session members about stage advance."""
    session_id = str(session['id'])
    session_label = session['label']
    location_id = str(session['location_id']) if session.get('location_id') else None

    # Get display name for the stage
    stage_display = new_stage.replace('_', ' ').title()

    title = f"{session_label}"
    body = f"Session advanced to {stage_display}"
    data = {
        "type": "stage_advance",
        "sessionId": session_id,
        "stage": new_stage,
    }

    # Get all users who have interacted with this session
    # (have positions, posts, or responses in this session)
    members = db.execute_query("""
        SELECT DISTINCT user_id FROM (
            SELECT creator_user_id AS user_id FROM position WHERE session_id = %s
            UNION
            SELECT creator_user_id AS user_id FROM post WHERE session_id = %s
            UNION
            SELECT user_id FROM user_session_preferences WHERE session_id = %s
        ) AS members
        WHERE user_id != %s
    """, (session_id, session_id, session_id, actor_user_id))

    if not members:
        return

    for member in members:
        try:
            send_or_queue_notification(
                title, body, data,
                recipient_user_id=str(member['user_id']),
                db=db,
                notification_type='stage_advance',
                actor_user_id=actor_user_id,
            )
        except Exception as e:
            logger.error("Failed to notify user %s of stage advance: %s", member['user_id'], e)


VOTING_ROUND_STATUS_ORDER = [
    'proposals_open', 'finalization_open', 'proposals_closed',
    'voting_open', 'voting_closed',
]
VOTING_ROUND_STATUS_INDEX = {s: i for i, s in enumerate(VOTING_ROUND_STATUS_ORDER)}

ENDORSEMENT_STATUSES = {'finalization_open'}
STAGE_TO_ROUND_TYPE = {
    'proposal_qualify': 'issue_selection',
    'reflection_proposals': 'policy_selection',
}


def _get_voting_round_row(session_id, round_type=None):
    """Fetch a voting_round row, optionally filtering by round_type."""
    if round_type:
        return db.execute_query("""
            SELECT id, session_id, round_type, status, ballot_size, winner_count,
                   created_time, results_json
            FROM voting_round WHERE session_id = %s AND round_type = %s
            LIMIT 1
        """, (str(session_id), round_type), fetchone=True)
    return db.execute_query("""
        SELECT id, session_id, round_type, status, ballot_size, winner_count,
               created_time, results_json
        FROM voting_round WHERE session_id = %s
        ORDER BY created_time DESC LIMIT 1
    """, (str(session_id),), fetchone=True)


def _voting_round_to_dict(row):
    """Convert a voting_round DB row to response dict."""
    return {
        "id": str(row["id"]),
        "sessionId": str(row["session_id"]),
        "roundType": row["round_type"],
        "status": row["status"],
        "ballotSize": row["ballot_size"],
        "winnerCount": row["winner_count"],
        "createdTime": row["created_time"].isoformat() if row.get("created_time") else None,
    }


@require_auth("normal", allow_banned=True)
def get_voting_round(session_id, round_type=None, token_info=None, user_id=None):  # noqa: E501
    """Get the current voting round for a session."""
    logger.error('DEBUG get_voting_round: session_id=%s, round_type=%r, type=%s', session_id, round_type, type(round_type))
    row = _get_voting_round_row(session_id, round_type)

    if not row:
        return ErrorModel(404, "No voting round found for this session"), 404

    return _voting_round_to_dict(row), 200


def advance_voting_round(session_id, body=None, token_info=None):  # noqa: E501
    """Advance the voting round to the next status (facilitator/moderator/admin only)."""
    if not token_info:
        return ErrorModel(401, "Authentication Required"), 401

    user_id = token_info["sub"]

    # Get session for location-based auth
    session = db.execute_query(
        "SELECT id, location_id FROM session WHERE id = %s",
        (str(session_id),), fetchone=True,
    )
    if not session:
        return ErrorModel(404, "Session not found"), 404

    location_id = str(session["location_id"])

    # Authorization: facilitator, moderator, or admin
    authorized, auth_err = authorization_scoped(
        "facilitator", token_info=token_info,
        location_id=location_id, session_id=str(session_id),
    )
    if not authorized:
        return auth_err, auth_err.code

    # Get current voting round
    vr = db.execute_query("""
        SELECT id, status FROM voting_round
        WHERE session_id = %s
        ORDER BY created_time DESC LIMIT 1
    """, (str(session_id),), fetchone=True)

    if not vr:
        return ErrorModel(404, "No voting round found for this session"), 404

    current_status = vr["status"]
    current_idx = VOTING_ROUND_STATUS_INDEX.get(current_status)
    if current_idx is None or current_idx >= len(VOTING_ROUND_STATUS_ORDER) - 1:
        return ErrorModel(400, f"Cannot advance past '{current_status}'"), 400

    next_status = VOTING_ROUND_STATUS_ORDER[current_idx + 1]

    vr_id = str(vr["id"])

    with db.transaction() as tx:
        tx.execute("UPDATE voting_round SET status = %s WHERE id = %s",
                   (next_status, vr_id))

        # When transitioning to voting_open, qualify top proposals as candidates
        if next_status == 'voting_open':
            ballot_size = vr.get("ballot_size", 7)
            if ballot_size is None:
                ballot_size_row = tx.execute(
                    "SELECT ballot_size FROM voting_round WHERE id = %s",
                    (vr_id,), fetchone=True,
                )
                ballot_size = ballot_size_row["ballot_size"] if ballot_size_row else 7

            # Get top endorsed proposals
            top_proposals = tx.execute("""
                SELECT proposal_post_id, COUNT(*) AS cnt
                FROM proposal_endorsement
                WHERE voting_round_id = %s
                GROUP BY proposal_post_id
                ORDER BY cnt DESC, proposal_post_id
                LIMIT %s
            """, (vr_id, ballot_size))

            # Clear any existing candidates and insert new ones
            tx.execute("DELETE FROM voting_round_candidate WHERE voting_round_id = %s",
                       (vr_id,))
            for i, row in enumerate(top_proposals or []):
                tx.execute("""
                    INSERT INTO voting_round_candidate
                        (voting_round_id, proposal_post_id, endorsement_count, display_order)
                    VALUES (%s, %s, %s, %s)
                """, (vr_id, str(row['proposal_post_id']), row['cnt'], i))

        # When transitioning to voting_closed, compute and cache results
        if next_status == 'voting_closed':
            tx.execute("UPDATE voting_round SET closed_at = CURRENT_TIMESTAMP WHERE id = %s",
                       (vr_id,))

    # Compute results after commit (needs to read from DB)
    if next_status == 'voting_closed':
        try:
            results = tally_results(vr_id, db)
            if results:
                import json
                db.execute_query(
                    "UPDATE voting_round SET results_json = %s WHERE id = %s",
                    (json.dumps(results), vr_id),
                )
        except Exception as e:
            logger.error("Failed to compute RCV results: %s", e)

    # Fetch and return updated round
    updated = db.execute_query("""
        SELECT id, session_id, round_type, status, ballot_size, winner_count, created_time
        FROM voting_round WHERE id = %s
    """, (vr_id,), fetchone=True)

    return _voting_round_to_dict(updated), 200


@require_auth("normal")
def get_session_suggestions(statement, limit=3, token_info=None, user_id=None):  # noqa: E501
    """Suggest sessions based on a position statement

    Uses semantic similarity to rank sessions by relevance to the given statement.

    :param statement: The position statement to match
    :type statement: str
    :param limit: Max suggestions to return
    :type limit: int

    :rtype: Union[List[dict], Tuple[List[dict], int], Tuple[List[dict], int, Dict[str, str]]
    """
    statement = statement or ''
    limit = min(limit or 3, 10)

    # Validate statement length
    if len(statement.strip()) < 10:
        return ErrorModel(400, "Statement must be at least 10 characters"), 400

    # Get all sessions
    rows = db.execute_query("""
        SELECT id, label
        FROM session
        ORDER BY label
    """)

    if not rows:
        return [], 200

    # Get session labels for similarity comparison
    session_labels = [row['label'] for row in rows]

    # Compute similarity between statement and session names
    scores = nlp.compute_similarity(statement.strip(), session_labels)

    if scores is None:
        return ErrorModel(503, "NLP service unavailable"), 503

    # Combine sessions with scores and sort by score
    results = []
    for i, row in enumerate(rows):
        results.append({
            'session': {
                'id': str(row['id']),
                'label': row['label']
            },
            'score': round(float(scores[i]), 4)
        })

    # Sort by score descending and limit
    results.sort(key=lambda x: x['score'], reverse=True)
    return results[:limit], 200


# ---------------------------------------------------------------------------
# Voting Round Creation
# ---------------------------------------------------------------------------

def create_voting_round(session_id, body=None, token_info=None):  # noqa: E501
    """Create a new voting round for a session (facilitator/moderator/admin)."""
    if not token_info:
        return ErrorModel(401, "Authentication Required"), 401

    user_id = token_info["sub"]

    session = db.execute_query(
        "SELECT id, location_id, stage FROM session WHERE id = %s",
        (str(session_id),), fetchone=True,
    )
    if not session:
        return ErrorModel(404, "Session not found"), 404

    location_id = str(session["location_id"])
    stage = session["stage"]

    # Authorization
    authorized, auth_err = authorization_scoped(
        "facilitator", token_info=token_info,
        location_id=location_id, session_id=str(session_id),
    )
    if not authorized:
        return auth_err, auth_err.code

    # Determine round_type from current stage
    round_type = STAGE_TO_ROUND_TYPE.get(stage)
    if not round_type:
        return ErrorModel(400, f"Cannot create voting round in stage '{stage}'"), 400

    data = connexion.request.get_json() or {}
    ballot_size = data.get('ballotSize', 7)
    winner_count = data.get('winnerCount', 1)

    # Check for existing round of this type
    existing = db.execute_query(
        "SELECT id FROM voting_round WHERE session_id = %s AND round_type = %s",
        (str(session_id), round_type), fetchone=True,
    )
    if existing:
        return ErrorModel(400, f"Voting round of type '{round_type}' already exists for this session"), 400

    row = db.execute_query("""
        INSERT INTO voting_round (session_id, round_type, ballot_size, winner_count, opened_by)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, session_id, round_type, status, ballot_size, winner_count, created_time
    """, (str(session_id), round_type, ballot_size, winner_count, user_id), fetchone=True)

    return _voting_round_to_dict(row), 201


# ---------------------------------------------------------------------------
# Endorsements
# ---------------------------------------------------------------------------

@require_auth("normal")
def get_endorsements(session_id, round_type=None, token_info=None, user_id=None):  # noqa: E501
    """Get endorsements for current user and proposal counts."""
    user_id = token_info["sub"]

    vr = _get_voting_round_row(session_id, round_type)

    if not vr:
        return ErrorModel(404, "No voting round found for this session"), 404

    vr_id = str(vr["id"])

    # User's own endorsements
    my_rows = db.execute_query("""
        SELECT id, proposal_post_id, created_time
        FROM proposal_endorsement
        WHERE voting_round_id = %s AND user_id = %s
        ORDER BY created_time
    """, (vr_id, user_id))

    my_endorsements = [
        {
            "id": str(r["id"]),
            "proposalPostId": str(r["proposal_post_id"]),
            "createdTime": r["created_time"].isoformat(),
        }
        for r in (my_rows or [])
    ]

    # Per-proposal counts — only visible to facilitators+
    session_row = db.execute_query(
        "SELECT location_id FROM session WHERE id = %s",
        (str(session_id),), fetchone=True,
    )
    is_priv = session_row and is_facilitator_for(
        user_id, str(session_row["location_id"]), str(session_id),
    )

    proposal_counts = []
    if is_priv:
        count_rows = db.execute_query("""
            SELECT proposal_post_id, COUNT(*) AS count
            FROM proposal_endorsement
            WHERE voting_round_id = %s
            GROUP BY proposal_post_id
        """, (vr_id,))

        proposal_counts = [
            {
                "proposalPostId": str(r["proposal_post_id"]),
                "count": r["count"],
            }
            for r in (count_rows or [])
        ]

    return {"myEndorsements": my_endorsements, "proposalCounts": proposal_counts}, 200


@require_auth("normal")
def create_endorsement(session_id, body, token_info=None, user_id=None):  # noqa: E501
    """Endorse a proposal in the current voting round."""
    user_id = token_info["sub"]
    data = connexion.request.get_json()
    proposal_post_id = data.get("proposalPostId")

    if not proposal_post_id:
        return ErrorModel(400, "proposalPostId is required"), 400

    # Get session for stage check
    session = db.execute_query(
        "SELECT id, location_id, stage FROM session WHERE id = %s",
        (str(session_id),), fetchone=True,
    )
    if not session:
        return ErrorModel(404, "Session not found"), 404

    # Get voting round
    vr = db.execute_query("""
        SELECT id, status FROM voting_round
        WHERE session_id = %s
        ORDER BY created_time DESC LIMIT 1
    """, (str(session_id),), fetchone=True)

    if not vr:
        return ErrorModel(404, "No voting round found for this session"), 404

    vr_id = str(vr["id"])

    # Check voting round status allows endorsements
    if vr["status"] not in ENDORSEMENT_STATUSES:
        return ErrorModel(400, f"Endorsements not allowed in status '{vr['status']}'"), 400

    # Check session stage allows endorsements
    stage = session["stage"]
    from candid.controllers.helpers.constants import WRITE_STAGES
    if stage not in WRITE_STAGES.get('endorsement', set()):
        return ErrorModel(403, f"Endorsements not allowed in stage '{stage}'"), 403

    # Verify proposal post exists and belongs to this session
    post = db.execute_query("""
        SELECT id, session_id, post_type, proposal_status FROM post
        WHERE id = %s AND status IN ('active', 'locked')
    """, (str(proposal_post_id),), fetchone=True)

    if not post:
        return ErrorModel(404, "Proposal post not found"), 404
    if post["post_type"] != "proposal":
        return ErrorModel(400, "Can only endorse proposal posts"), 400
    if post.get("proposal_status") != "finalized":
        return ErrorModel(400, "Can only endorse finalized proposals"), 400
    if str(post["session_id"]) != str(session_id):
        return ErrorModel(400, "Proposal does not belong to this session"), 400

    # Check endorsement limit
    count = db.execute_query("""
        SELECT COUNT(*) AS cnt FROM proposal_endorsement
        WHERE voting_round_id = %s AND user_id = %s
    """, (vr_id, user_id), fetchone=True)

    if count and count["cnt"] >= MAX_ENDORSEMENTS_PER_USER:
        return ErrorModel(400, f"Maximum {MAX_ENDORSEMENTS_PER_USER} endorsements reached"), 400

    # Check for duplicate
    existing = db.execute_query("""
        SELECT id FROM proposal_endorsement
        WHERE voting_round_id = %s AND proposal_post_id = %s AND user_id = %s
    """, (vr_id, str(proposal_post_id), user_id), fetchone=True)

    if existing:
        return ErrorModel(409, "Already endorsed this proposal"), 409

    # Create endorsement
    row = db.execute_query("""
        INSERT INTO proposal_endorsement (voting_round_id, proposal_post_id, user_id)
        VALUES (%s, %s, %s)
        RETURNING id, proposal_post_id, created_time
    """, (vr_id, str(proposal_post_id), user_id), fetchone=True)

    return {
        "id": str(row["id"]),
        "proposalPostId": str(row["proposal_post_id"]),
        "createdTime": row["created_time"].isoformat(),
    }, 201


@require_auth("normal")
def delete_endorsement(session_id, endorsement_id, token_info=None, user_id=None):  # noqa: E501
    """Remove an endorsement."""
    user_id = token_info["sub"]

    # Get the endorsement
    endorsement = db.execute_query("""
        SELECT pe.id, pe.user_id, pe.voting_round_id, vr.status
        FROM proposal_endorsement pe
        JOIN voting_round vr ON vr.id = pe.voting_round_id
        WHERE pe.id = %s
    """, (str(endorsement_id),), fetchone=True)

    if not endorsement:
        return ErrorModel(404, "Endorsement not found"), 404

    if str(endorsement["user_id"]) != user_id:
        return ErrorModel(403, "Cannot delete another user's endorsement"), 403

    if endorsement["status"] not in ENDORSEMENT_STATUSES:
        return ErrorModel(400, f"Cannot remove endorsement in status '{endorsement['status']}'"), 400

    db.execute_query("DELETE FROM proposal_endorsement WHERE id = %s",
                     (str(endorsement_id),))

    return '', 204


# ---------------------------------------------------------------------------
# Ballot
# ---------------------------------------------------------------------------

@require_auth("normal")
def get_ballot(session_id, round_type=None, token_info=None, user_id=None):  # noqa: E501
    """Get the current user's ballot."""
    user_id = token_info["sub"]

    vr = _get_voting_round_row(session_id, round_type)

    if not vr:
        return ErrorModel(404, "No voting round found for this session"), 404

    vr_id = str(vr["id"])

    ballot = db.execute_query("""
        SELECT id, created_time, updated_time FROM rcv_ballot
        WHERE voting_round_id = %s AND voter_user_id = %s
    """, (vr_id, user_id), fetchone=True)

    if not ballot:
        return {"id": None, "rankings": []}, 200

    rankings = db.execute_query("""
        SELECT proposal_post_id, rank FROM rcv_ranking
        WHERE ballot_id = %s
        ORDER BY rank
    """, (str(ballot["id"]),))

    return {
        "id": str(ballot["id"]),
        "rankings": [
            {"proposalPostId": str(r["proposal_post_id"]), "rank": r["rank"]}
            for r in (rankings or [])
        ],
        "createdTime": ballot["created_time"].isoformat() if ballot.get("created_time") else None,
        "updatedTime": ballot["updated_time"].isoformat() if ballot.get("updated_time") else None,
    }, 200


@require_auth("normal")
def submit_ballot(session_id, body, token_info=None, user_id=None):  # noqa: E501
    """Submit or update a ranked ballot."""
    user_id = token_info["sub"]
    data = connexion.request.get_json()
    rankings = data.get("rankings", [])

    if not rankings:
        return ErrorModel(400, "Rankings cannot be empty"), 400

    # Get voting round
    vr = db.execute_query("""
        SELECT id, status FROM voting_round
        WHERE session_id = %s
        ORDER BY created_time DESC LIMIT 1
    """, (str(session_id),), fetchone=True)

    if not vr:
        return ErrorModel(404, "No voting round found for this session"), 404

    vr_id = str(vr["id"])

    if vr["status"] != 'voting_open':
        return ErrorModel(400, f"Ballots not allowed in status '{vr['status']}'"), 400

    # Validate rankings
    ranks = [r["rank"] for r in rankings]
    proposal_ids = [r["proposalPostId"] for r in rankings]

    # Check for duplicate ranks
    if len(set(ranks)) != len(ranks):
        return ErrorModel(400, "Duplicate ranks are not allowed"), 400

    # Check for duplicate proposals
    if len(set(proposal_ids)) != len(proposal_ids):
        return ErrorModel(400, "Duplicate proposals are not allowed"), 400

    # Check ranks are sequential starting at 1
    sorted_ranks = sorted(ranks)
    if sorted_ranks != list(range(1, len(ranks) + 1)):
        return ErrorModel(400, "Ranks must be sequential starting at 1 with no gaps"), 400

    # Validate all proposals are valid candidates
    candidates = db.execute_query("""
        SELECT proposal_post_id FROM voting_round_candidate
        WHERE voting_round_id = %s
    """, (vr_id,))
    valid_ids = {str(c["proposal_post_id"]) for c in (candidates or [])}

    for pid in proposal_ids:
        if pid not in valid_ids:
            return ErrorModel(400, f"Proposal {pid} is not a valid candidate"), 400

    # Upsert ballot within transaction
    with db.transaction() as tx:
        # Get or create ballot
        ballot = tx.execute("""
            SELECT id FROM rcv_ballot
            WHERE voting_round_id = %s AND voter_user_id = %s
        """, (vr_id, user_id), fetchone=True)

        if ballot:
            ballot_id = str(ballot["id"])
            tx.execute("DELETE FROM rcv_ranking WHERE ballot_id = %s", (ballot_id,))
            tx.execute("""
                UPDATE rcv_ballot SET updated_time = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (ballot_id,))
        else:
            new_ballot = tx.execute("""
                INSERT INTO rcv_ballot (voting_round_id, voter_user_id)
                VALUES (%s, %s)
                RETURNING id
            """, (vr_id, user_id), fetchone=True)
            ballot_id = str(new_ballot["id"])

        # Insert rankings
        for r in rankings:
            tx.execute("""
                INSERT INTO rcv_ranking (ballot_id, proposal_post_id, rank)
                VALUES (%s, %s, %s)
            """, (ballot_id, r["proposalPostId"], r["rank"]))

    # Fetch result
    ballot_row = db.execute_query("""
        SELECT id, created_time, updated_time FROM rcv_ballot WHERE id = %s
    """, (ballot_id,), fetchone=True)

    ranking_rows = db.execute_query("""
        SELECT proposal_post_id, rank FROM rcv_ranking
        WHERE ballot_id = %s ORDER BY rank
    """, (ballot_id,))

    return {
        "id": ballot_id,
        "rankings": [
            {"proposalPostId": str(r["proposal_post_id"]), "rank": r["rank"]}
            for r in (ranking_rows or [])
        ],
        "createdTime": ballot_row["created_time"].isoformat() if ballot_row.get("created_time") else None,
        "updatedTime": ballot_row["updated_time"].isoformat() if ballot_row.get("updated_time") else None,
    }, 200


# ---------------------------------------------------------------------------
# Candidates & Results
# ---------------------------------------------------------------------------

@require_auth("normal", allow_banned=True)
def get_candidates(session_id, round_type=None, token_info=None, user_id=None):  # noqa: E501
    """Get qualified ballot candidates for a voting round."""
    vr = _get_voting_round_row(session_id, round_type)

    if not vr:
        return ErrorModel(404, "No voting round found for this session"), 404

    rows = db.execute_query("""
        SELECT vrc.proposal_post_id, vrc.endorsement_count, vrc.display_order,
               p.title
        FROM voting_round_candidate vrc
        JOIN post p ON p.id = vrc.proposal_post_id
        WHERE vrc.voting_round_id = %s
        ORDER BY vrc.display_order
    """, (str(vr["id"]),))

    return [
        {
            "proposalPostId": str(r["proposal_post_id"]),
            "title": r["title"],
            "endorsementCount": r["endorsement_count"],
            "displayOrder": r["display_order"],
        }
        for r in (rows or [])
    ], 200


@require_auth("normal", allow_banned=True)
def get_results(session_id, round_type=None, token_info=None, user_id=None):  # noqa: E501
    """Get election results (only when voting_closed)."""
    vr = _get_voting_round_row(session_id, round_type)

    if not vr:
        return ErrorModel(404, "No voting round found for this session"), 404

    if vr["status"] != 'voting_closed':
        return ErrorModel(400, "Results only available after voting is closed"), 400

    # Return cached results if available
    if vr["results_json"]:
        import json
        results = vr["results_json"]
        if isinstance(results, str):
            results = json.loads(results)
        return results, 200

    # Compute on-the-fly if not cached
    results = tally_results(str(vr["id"]), db)
    if not results:
        return ErrorModel(500, "Failed to compute results"), 500

    # Cache for future requests
    import json
    db.execute_query(
        "UPDATE voting_round SET results_json = %s WHERE id = %s",
        (json.dumps(results), str(vr["id"])),
    )

    return results, 200
