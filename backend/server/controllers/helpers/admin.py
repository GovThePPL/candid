"""Admin helper functions extracted from admin_controller.py.

These are data-fetching, logic, and formatting helpers used by admin endpoints.
They have no request/response handling and can be reused across controllers.
"""

import json
import uuid
import logging

from candid.controllers import db
from candid.controllers.helpers.auth import (
    get_location_ancestors, get_root_location_id,
)
from candid.controllers.helpers.serializers import get_user_card
from candid.models.user import User
from candid.models.survey import Survey
from candid.models.survey_question import SurveyQuestion
from candid.models.survey_question_option import SurveyQuestionOption

logger = logging.getLogger(__name__)

VALID_CONTENT_TYPES = {'position', 'chat_log', 'post', 'comment'}
VALID_POST_TYPES = {'discussion', 'question', 'proposal'}

# Roles admins can assign (at their location or descendants)
ADMIN_ASSIGNABLE = {'admin', 'moderator', 'facilitator'}
# Roles facilitators can assign (at their location+session)
FACILITATOR_ASSIGNABLE = {'assistant_moderator', 'expert', 'liaison'}

ALL_ASSIGNABLE = ADMIN_ASSIGNABLE | FACILITATOR_ASSIGNABLE


def build_survey_with_nested_data(survey_id):
    """Fetch survey with creator User, questions, and options nested."""
    survey_row = db.execute_query("""
        SELECT s.id, s.creator_user_id, s.session_id, s.location_id,
               s.survey_title, s.survey_type, s.created_time, s.start_time, s.end_time, s.status,
               l.name AS location_name, l.code AS location_code,
               pc.label AS session_name
        FROM survey s
        LEFT JOIN location l ON s.location_id = l.id
        LEFT JOIN session pc ON s.session_id = pc.id
        WHERE s.id = %s
    """, (survey_id,), fetchone=True)

    if survey_row is None:
        return None

    # Get creator
    creator = get_user_card(survey_row['creator_user_id'])

    # Get questions
    question_rows = db.execute_query("""
        SELECT id, survey_id, survey_question
        FROM survey_question WHERE survey_id = %s
        ORDER BY id
    """, (survey_id,))

    questions = []
    if question_rows:
        for q_row in question_rows:
            # Get options for this question
            option_rows = db.execute_query("""
                SELECT id, survey_question_id, survey_question_option
                FROM survey_question_option WHERE survey_question_id = %s
                ORDER BY id
            """, (q_row['id'],))

            options = []
            if option_rows:
                for o_row in option_rows:
                    options.append(SurveyQuestionOption(
                        id=str(o_row['id']),
                        survey_question_id=str(o_row['survey_question_id']),
                        option=o_row['survey_question_option']
                    ))

            questions.append(SurveyQuestion(
                id=str(q_row['id']),
                survey_id=str(q_row['survey_id']),
                question=q_row['survey_question'],
                options=options
            ))

    return Survey(
        id=str(survey_row['id']),
        creator=creator,
        session_id=str(survey_row['session_id']) if survey_row['session_id'] else None,
        survey_title=survey_row['survey_title'],
        survey_type=survey_row['survey_type'],
        location_id=str(survey_row['location_id']) if survey_row['location_id'] else None,
        location_code=survey_row['location_code'],
        location_name=survey_row['location_name'],
        session_name=survey_row['session_name'],
        created_time=survey_row['created_time'],
        start_time=survey_row['start_time'],
        end_time=survey_row['end_time'],
        questions=questions
    )


def build_pairwise_survey(survey_id):
    """Build a pairwise survey response object."""
    survey_row = db.execute_query("""
        SELECT s.id, s.creator_user_id, s.survey_title, s.survey_type,
               s.comparison_question, s.polis_conversation_id,
               s.location_id, s.session_id,
               s.start_time, s.end_time, s.status, s.created_time,
               s.is_group_labeling, s.phase,
               l.name AS location_name, l.code AS location_code,
               pc.label AS session_name
        FROM survey s
        LEFT JOIN location l ON s.location_id = l.id
        LEFT JOIN session pc ON s.session_id = pc.id
        WHERE s.id = %s
    """, (survey_id,), fetchone=True)

    if survey_row is None:
        return None

    # Get items
    item_rows = db.execute_query("""
        SELECT id, item_text, item_order
        FROM pairwise_item WHERE survey_id = %s
        ORDER BY item_order
    """, (survey_id,))

    items = []
    for row in (item_rows or []):
        items.append({
            "id": str(row['id']),
            "text": row['item_text'],
            "order": row['item_order']
        })

    return {
        "id": str(survey_row['id']),
        "surveyTitle": survey_row['survey_title'],
        "surveyType": survey_row['survey_type'] or 'pairwise',
        "comparisonQuestion": survey_row['comparison_question'],
        "polisConversationId": survey_row['polis_conversation_id'],
        "locationId": str(survey_row['location_id']) if survey_row['location_id'] else None,
        "locationCode": survey_row['location_code'],
        "locationName": survey_row['location_name'],
        "sessionId": str(survey_row['session_id']) if survey_row['session_id'] else None,
        "sessionName": survey_row['session_name'],
        "isGroupLabeling": bool(survey_row.get('is_group_labeling')),
        "phase": survey_row.get('phase'),
        "items": items,
        "startTime": survey_row['start_time'].isoformat() if survey_row['start_time'] else None,
        "endTime": survey_row['end_time'].isoformat() if survey_row['end_time'] else None,
        "status": survey_row['status'],
        "createdTime": survey_row['created_time'].isoformat() if survey_row['created_time'] else None
    }


def get_group_user_ids(polis_conv_id, group_id):
    """Get user IDs for members of a specific Polis group."""
    from candid.controllers.helpers.polis_client import get_client, PolisError

    try:
        client = get_client()
        math_data = client.get_math_data(polis_conv_id)

        if not math_data:
            return None

        pca_wrapper = math_data.get("pca", {})
        pca_data = pca_wrapper.get("asPOJO", {}) if isinstance(pca_wrapper, dict) else {}
        group_clusters = pca_data.get("group-clusters", [])

        # Get pids for this group
        try:
            gid = int(group_id)
            if gid >= len(group_clusters) or not group_clusters[gid]:
                return None
            member_pids = group_clusters[gid].get("members", [])
        except ValueError:
            return None

        if not member_pids:
            return []

        # Map pids to user_ids via polis_participant table
        user_rows = db.execute_query("""
            SELECT DISTINCT user_id
            FROM polis_participant
            WHERE polis_conversation_id = %s
              AND polis_pid = ANY(%s)
        """, (polis_conv_id, member_pids))

        return [str(u["user_id"]) for u in (user_rows or [])]

    except PolisError:
        return None


def compute_pairwise_rankings(survey_id, user_id_filter=None):
    """Compute win counts for each item in a pairwise survey."""
    # Get all items for this survey
    items = db.execute_query("""
        SELECT id, item_text FROM pairwise_item WHERE survey_id = %s ORDER BY item_order
    """, (survey_id,))

    if not items:
        return []

    # Build rankings with win counts
    rankings = []
    for item in items:
        item_id = str(item['id'])

        # Count wins (where this item was the winner)
        if user_id_filter is not None and len(user_id_filter) > 0:
            # Filter by specific users
            win_count = db.execute_query("""
                SELECT COUNT(*) as count
                FROM pairwise_response
                WHERE survey_id = %s AND winner_item_id = %s AND user_id = ANY(%s::uuid[])
            """, (survey_id, item_id, user_id_filter), fetchone=True)['count']

            # Count total comparisons involving this item
            comparison_count = db.execute_query("""
                SELECT COUNT(*) as count
                FROM pairwise_response
                WHERE survey_id = %s AND (winner_item_id = %s OR loser_item_id = %s) AND user_id = ANY(%s::uuid[])
            """, (survey_id, item_id, item_id, user_id_filter), fetchone=True)['count']
        elif user_id_filter is not None:
            # Empty user list means no responses to count
            win_count = 0
            comparison_count = 0
        else:
            # No filter - count all
            win_count = db.execute_query("""
                SELECT COUNT(*) as count
                FROM pairwise_response
                WHERE survey_id = %s AND winner_item_id = %s
            """, (survey_id, item_id), fetchone=True)['count']

            comparison_count = db.execute_query("""
                SELECT COUNT(*) as count
                FROM pairwise_response
                WHERE survey_id = %s AND (winner_item_id = %s OR loser_item_id = %s)
            """, (survey_id, item_id, item_id), fetchone=True)['count']

        rankings.append({
            "itemId": item_id,
            "itemText": item['item_text'],
            "winCount": win_count,
            "comparisonCount": comparison_count
        })

    # Sort by win count descending and assign ranks
    rankings.sort(key=lambda r: r['winCount'], reverse=True)
    for i, r in enumerate(rankings):
        r['rank'] = i + 1

    return rankings


def notify_peers(peer_user_ids, requester_name, action, role, target_name,
                 requester_user_id=None):
    """Send push notifications to approval peers about a role change request."""
    try:
        from candid.controllers.helpers.push_notifications import send_or_queue_notification
        action_word = "assign" if action == "assign" else "remove"
        title = "Role change request needs review"
        body = f"{requester_name} requested to {action_word} {role} for {target_name}"
        data = {"action": "open_admin_pending"}
        for peer_id in peer_user_ids:
            send_or_queue_notification(title, body, data, peer_id, db,
                                       notification_type='role_change',
                                       actor_user_id=requester_user_id)
    except Exception as e:
        logger.error("Failed to notify peers: %s", e)


def check_auto_approve_expired():
    """Auto-approve any pending requests past their timeout. Check-on-access pattern."""
    rows = db.execute_query("""
        UPDATE role_change_request
        SET status = 'auto_approved', updated_time = CURRENT_TIMESTAMP
        WHERE status = 'pending' AND auto_approve_at <= CURRENT_TIMESTAMP
        RETURNING *
    """)
    for row in (rows or []):
        apply_role_change(row)
        # Build description for notification
        loc = db.execute_query(
            "SELECT name FROM location WHERE id = %s",
            (str(row['location_id']),), fetchone=True) if row.get('location_id') else None
        location_name = loc['name'] if loc else 'Unknown'
        desc = f"{row['action']} {row['role']} at {location_name}"
        # Notify requester
        notify_request_outcome(
            str(row['requested_by']), None, 'auto_approved',
            desc, 'role_change')
        # Notify role target
        notify_role_target(
            str(row['target_user_id']), row['action'], row['role'],
            location_name)


def apply_role_change(request_row):
    """Apply an approved/auto-approved role change request."""
    if request_row['action'] == 'assign':
        # Check if already exists (idempotent)
        existing = db.execute_query("""
            SELECT id FROM user_role
            WHERE user_id = %s AND role = %s AND location_id = %s
            AND (session_id = %s OR (session_id IS NULL AND %s IS NULL))
            LIMIT 1
        """, (request_row['target_user_id'], request_row['role'],
              request_row['location_id'],
              request_row['session_id'], request_row['session_id']),
            fetchone=True)
        if not existing:
            role_id = str(uuid.uuid4())
            db.execute_query("""
                INSERT INTO user_role (id, user_id, role, location_id, session_id, assigned_by)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (role_id, request_row['target_user_id'], request_row['role'],
                  request_row['location_id'], request_row['session_id'],
                  request_row['requested_by']))
    elif request_row['action'] == 'remove':
        if request_row.get('user_role_id'):
            db.execute_query("""
                DELETE FROM user_role WHERE id = %s
            """, (request_row['user_role_id'],))


def find_approval_peer(request_row):
    """Find a peer who can approve this request. Returns user_id or None.

    Admin requesting (admin/moderator/facilitator):
      1. Peer admin at same level (requester_authority_location_id)
      2. Admin at target level (if lower)
      3. None -> auto-approve

    Facilitator requesting (asst_mod/expert/liaison):
      1. Peer facilitator at same location+session
      2. Location moderator
      3. Location admin
      4. None -> auto-approve
    """
    requester_id = str(request_row['requested_by'])
    role = request_row['role']
    target_loc = str(request_row['location_id']) if request_row.get('location_id') else None
    target_cat = str(request_row['session_id']) if request_row.get('session_id') else None
    authority_loc = str(request_row['requester_authority_location_id'])

    if role in ADMIN_ASSIGNABLE:
        # Admin requesting: find peer admin at authority location
        rows = db.execute_query("""
            SELECT ur.user_id FROM user_role ur
            JOIN users u ON ur.user_id = u.id
            WHERE ur.role = 'admin' AND ur.location_id = %s AND ur.user_id != %s
            AND u.keycloak_id IS NOT NULL
        """, (authority_loc, requester_id))
        if rows:
            return [str(r['user_id']) for r in rows]

        # No peer at authority level; try admin at target location
        if target_loc and target_loc != authority_loc:
            rows = db.execute_query("""
                SELECT ur.user_id FROM user_role ur
                JOIN users u ON ur.user_id = u.id
                WHERE ur.role = 'admin' AND ur.location_id = %s AND ur.user_id != %s
                AND u.keycloak_id IS NOT NULL
            """, (target_loc, requester_id))
            if rows:
                return [str(r['user_id']) for r in rows]

        return None  # auto-approve

    elif role in FACILITATOR_ASSIGNABLE:
        # Facilitator requesting: find peer facilitator
        if target_loc and target_cat:
            rows = db.execute_query("""
                SELECT ur.user_id FROM user_role ur
                JOIN users u ON ur.user_id = u.id
                WHERE ur.role = 'facilitator' AND ur.location_id = %s
                AND ur.session_id = %s AND ur.user_id != %s
                AND u.keycloak_id IS NOT NULL
            """, (target_loc, target_cat, requester_id))
            if rows:
                return [str(r['user_id']) for r in rows]

        # Fallback: location moderator
        if target_loc:
            ancestors = get_location_ancestors(target_loc)
            if ancestors:
                rows = db.execute_query("""
                    SELECT ur.user_id FROM user_role ur
                    JOIN users u ON ur.user_id = u.id
                    WHERE ur.role = 'moderator' AND ur.location_id = ANY(%s::uuid[]) AND ur.user_id != %s
                    AND u.keycloak_id IS NOT NULL
                """, (ancestors, requester_id))
                if rows:
                    return [str(r['user_id']) for r in rows]

                # Fallback: location admin
                rows = db.execute_query("""
                    SELECT ur.user_id FROM user_role ur
                    JOIN users u ON ur.user_id = u.id
                    WHERE ur.role = 'admin' AND ur.location_id = ANY(%s::uuid[]) AND ur.user_id != %s
                    AND u.keycloak_id IS NOT NULL
                """, (ancestors, requester_id))
                if rows:
                    return [str(r['user_id']) for r in rows]

        return None  # auto-approve

    return None


def get_requester_authority_location(user_id, role, location_id, session_id=None):
    """Determine the requester's authority location for a role change.

    Returns the location_id where the requester has authority, or None if unauthorized.
    """
    if role in ADMIN_ASSIGNABLE:
        # Admin must have admin role at target location or ancestor.
        # Walk from target up to root; return first match (deepest authority).
        ancestors = get_location_ancestors(location_id)
        if ancestors:
            # Find all admin locations in the ancestry
            admin_locs = db.execute_query("""
                SELECT location_id FROM user_role
                WHERE user_id = %s AND role = 'admin' AND location_id = ANY(%s::uuid[])
            """, (str(user_id), ancestors))
            if admin_locs:
                admin_set = {str(r['location_id']) for r in admin_locs}
                # Return the deepest (closest to target) admin location
                for anc in ancestors:
                    if anc in admin_set:
                        return anc
        return None

    elif role in FACILITATOR_ASSIGNABLE:
        # Facilitator must have facilitator role at exact location+session
        if session_id:
            row = db.execute_query("""
                SELECT 1 FROM user_role
                WHERE user_id = %s AND role = 'facilitator'
                AND location_id = %s AND session_id = %s
                LIMIT 1
            """, (str(user_id), str(location_id), str(session_id)), fetchone=True)
            if row:
                return str(location_id)
        return None

    return None


def format_role_request(r):
    """Shared serializer for role change request rows (with JOINed fields)."""
    result = {
        'id': str(r['id']),
        'action': r['action'],
        'targetUser': {
            'id': str(r['target_user_id']),
            'username': r['target_username'],
            'displayName': r['target_display_name'],
            'status': r.get('target_status', 'active'),
            'avatarIconUrl': r.get('target_avatar_icon_url'),
            'trustScore': float(r['target_trust_score']) if r.get('target_trust_score') is not None else None,
            'kudosCount': r.get('target_kudos_count', 0),
        },
        'role': r['role'],
        'location': {
            'id': str(r['location_id']),
            'name': r['location_name'],
            'code': r['location_code'],
        } if r.get('location_id') else None,
        'session': {
            'id': str(r['session_id']),
            'label': r['session_label'],
        } if r.get('session_id') else None,
        'requester': {
            'id': str(r['requested_by']),
            'username': r['requester_username'],
            'displayName': r['requester_display_name'],
            'status': r.get('requester_status', 'active'),
            'avatarIconUrl': r.get('requester_avatar_icon_url'),
            'trustScore': float(r['requester_trust_score']) if r.get('requester_trust_score') is not None else None,
            'kudosCount': r.get('requester_kudos_count', 0),
        },
        'reason': r.get('request_reason'),
        'autoApproveAt': r['auto_approve_at'].isoformat() if r.get('auto_approve_at') else None,
        'createdTime': r['created_time'].isoformat() if r.get('created_time') else None,
        'status': r['status'],
        'denialReason': r.get('denial_reason'),
        'reviewer': {
            'id': str(r['reviewer_id']),
            'username': r['reviewer_username'],
            'displayName': r['reviewer_display_name'],
            'status': r.get('reviewer_status', 'active'),
            'avatarIconUrl': r.get('reviewer_avatar_icon_url'),
            'trustScore': float(r['reviewer_trust_score']) if r.get('reviewer_trust_score') is not None else None,
            'kudosCount': r.get('reviewer_kudos_count', 0),
        } if r.get('reviewer_id') else None,
        'updatedTime': r['updated_time'].isoformat() if r.get('updated_time') else None,
    }
    return result


# ---------------------------------------------------------------------------
# Rule Management Helpers
# ---------------------------------------------------------------------------


def build_rule_response(row):
    """Maps a DB rule row (with JOINed location/session names) to API response dict."""
    content_types = row.get('applicable_content_types')
    if content_types is None:
        content_types = ['position', 'chat_log', 'post', 'comment']
    elif isinstance(content_types, str):
        # PG text[] comes as Python list via psycopg2, but handle string just in case
        content_types = [ct.strip() for ct in content_types.strip('{}').split(',') if ct.strip()]

    post_types = row.get('applicable_post_types')
    if post_types is not None:
        if isinstance(post_types, str):
            post_types = [pt.strip() for pt in post_types.strip('{}').split(',') if pt.strip()]
        else:
            post_types = list(post_types)

    result = {
        'id': str(row['id']),
        'title': row['title'],
        'text': row['text'],
        'status': row.get('status', 'active'),
        'applicableContentTypes': list(content_types),
        'applicablePostTypes': post_types,
    }
    if row.get('severity') is not None:
        result['severity'] = row['severity']
    if row.get('default_actions') is not None:
        result['defaultActions'] = row['default_actions']
    if row.get('sentencing_guidelines') is not None:
        result['sentencingGuidelines'] = row['sentencing_guidelines']
    if row.get('location_id'):
        result['locationId'] = str(row['location_id'])
        result['locationName'] = row.get('location_name')
    else:
        result['locationId'] = None
        result['locationName'] = None
    if row.get('session_id'):
        result['sessionId'] = str(row['session_id'])
        result['sessionLabel'] = row.get('session_label')
    else:
        result['sessionId'] = None
        result['sessionLabel'] = None
    if row.get('creator_user_id'):
        result['creatorUserId'] = str(row['creator_user_id'])
    else:
        result['creatorUserId'] = None
    result['createdTime'] = row['created_time'].isoformat() if row.get('created_time') else None
    result['updatedTime'] = row['updated_time'].isoformat() if row.get('updated_time') else None
    return result


def get_rule_authority_location(user_id, location_id, session_id):
    """Determine the requester's authority location for a rule scope.

    Returns the location_id where the requester has authority, or None if unauthorized.

    - Global rule (location_id=None): must be root admin -> return root location ID
    - Location-scoped: admin at target location or ancestor -> return deepest admin location
    - Location+session: above checks OR facilitator at exact scope -> return that location
    """
    user_id_str = str(user_id)

    if location_id is None:
        # Global rule: must be root admin
        root_id = get_root_location_id()
        if not root_id:
            return None
        row = db.execute_query("""
            SELECT 1 FROM user_role
            WHERE user_id = %s AND role = 'admin' AND location_id = %s
            LIMIT 1
        """, (user_id_str, root_id), fetchone=True)
        return root_id if row else None

    loc_str = str(location_id)

    # Check admin authority (at target location or ancestor)
    ancestors = get_location_ancestors(loc_str)
    if ancestors:
        admin_locs = db.execute_query("""
            SELECT location_id FROM user_role
            WHERE user_id = %s AND role = 'admin' AND location_id = ANY(%s::uuid[])
        """, (user_id_str, ancestors))
        if admin_locs:
            admin_set = {str(r['location_id']) for r in admin_locs}
            for anc in ancestors:
                if anc in admin_set:
                    return anc

    # Check moderator authority (at target location or ancestor)
    if ancestors:
        mod_locs = db.execute_query("""
            SELECT location_id FROM user_role
            WHERE user_id = %s AND role = 'moderator' AND location_id = ANY(%s::uuid[])
        """, (user_id_str, ancestors))
        if mod_locs:
            mod_set = {str(r['location_id']) for r in mod_locs}
            for anc in ancestors:
                if anc in mod_set:
                    return anc

    # If session-scoped, check facilitator at exact location+session
    if session_id:
        row = db.execute_query("""
            SELECT 1 FROM user_role
            WHERE user_id = %s AND role = 'facilitator'
            AND location_id = %s AND session_id = %s
            LIMIT 1
        """, (user_id_str, loc_str, str(session_id)), fetchone=True)
        if row:
            return loc_str

    return None


def find_rule_approval_peer(request_row):
    """Find peers who can approve a rule change request. Returns list of user_ids or None.

    Mirrors find_approval_peer() logic but uses rule scope from proposed_rule:
    - Global rule change: find peer root admin -> None = auto-approve
    - Location-scoped: find peer admin at authority location -> admin at rule's location -> None
    - Location+session (facilitator): peer facilitator -> location moderator -> location admin -> None
    """
    requester_id = str(request_row['requested_by'])
    authority_loc = str(request_row['requester_authority_location_id'])

    # Extract scope from proposed_rule JSONB
    proposed = request_row.get('proposed_rule') or {}
    if isinstance(proposed, str):
        proposed = json.loads(proposed)

    rule_location_id = proposed.get('locationId')
    rule_session_id = proposed.get('sessionId')

    if rule_location_id is None:
        # Global rule: find peer root admin
        rows = db.execute_query("""
            SELECT ur.user_id FROM user_role ur
            JOIN users u ON ur.user_id = u.id
            WHERE ur.role = 'admin' AND ur.location_id = %s AND ur.user_id != %s
            AND u.keycloak_id IS NOT NULL
        """, (authority_loc, requester_id))
        if rows:
            return [str(r['user_id']) for r in rows]
        return None  # auto-approve

    # Location-scoped: find peer admin at authority location
    rows = db.execute_query("""
        SELECT ur.user_id FROM user_role ur
        JOIN users u ON ur.user_id = u.id
        WHERE ur.role = 'admin' AND ur.location_id = %s AND ur.user_id != %s
        AND u.keycloak_id IS NOT NULL
    """, (authority_loc, requester_id))
    if rows:
        return [str(r['user_id']) for r in rows]

    # No peer at authority level; try admin at rule's location
    if str(rule_location_id) != authority_loc:
        rows = db.execute_query("""
            SELECT ur.user_id FROM user_role ur
            JOIN users u ON ur.user_id = u.id
            WHERE ur.role = 'admin' AND ur.location_id = %s AND ur.user_id != %s
            AND u.keycloak_id IS NOT NULL
        """, (str(rule_location_id), requester_id))
        if rows:
            return [str(r['user_id']) for r in rows]

    # If session-scoped and requester is facilitator, try peer facilitator -> moderator -> admin
    if rule_session_id:
        rows = db.execute_query("""
            SELECT ur.user_id FROM user_role ur
            JOIN users u ON ur.user_id = u.id
            WHERE ur.role = 'facilitator' AND ur.location_id = %s
            AND ur.session_id = %s AND ur.user_id != %s
            AND u.keycloak_id IS NOT NULL
        """, (str(rule_location_id), str(rule_session_id), requester_id))
        if rows:
            return [str(r['user_id']) for r in rows]

        # Fallback: location moderator
        ancestors = get_location_ancestors(str(rule_location_id))
        if ancestors:
            rows = db.execute_query("""
                SELECT ur.user_id FROM user_role ur
                JOIN users u ON ur.user_id = u.id
                WHERE ur.role = 'moderator' AND ur.location_id = ANY(%s::uuid[])
                AND ur.user_id != %s AND u.keycloak_id IS NOT NULL
            """, (ancestors, requester_id))
            if rows:
                return [str(r['user_id']) for r in rows]

            # Fallback: location admin
            rows = db.execute_query("""
                SELECT ur.user_id FROM user_role ur
                JOIN users u ON ur.user_id = u.id
                WHERE ur.role = 'admin' AND ur.location_id = ANY(%s::uuid[])
                AND ur.user_id != %s AND u.keycloak_id IS NOT NULL
            """, (ancestors, requester_id))
            if rows:
                return [str(r['user_id']) for r in rows]

    return None  # auto-approve


def apply_rule_change(request_row):
    """Apply an approved/auto-approved rule change request."""
    proposed = request_row.get('proposed_rule') or {}
    if isinstance(proposed, str):
        proposed = json.loads(proposed)

    action = request_row['action']

    if action == 'create':
        rule_id = str(uuid.uuid4())
        content_types = proposed.get('applicableContentTypes', ['position', 'chat_log', 'post', 'comment'])
        post_types = proposed.get('applicablePostTypes')
        db.execute_query("""
            INSERT INTO rule (id, creator_user_id, title, text, severity,
                             default_actions, sentencing_guidelines,
                             location_id, session_id, applicable_content_types,
                             applicable_post_types)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            rule_id,
            str(request_row['requested_by']),
            proposed.get('title'),
            proposed.get('text'),
            proposed.get('severity'),
            json.dumps(proposed.get('defaultActions', [])),
            proposed.get('sentencingGuidelines'),
            proposed.get('locationId'),
            proposed.get('sessionId'),
            content_types,
            post_types,
        ))

    elif action == 'update':
        rule_id = request_row.get('rule_id')
        if not rule_id:
            return
        set_clauses = []
        params = []
        if 'title' in proposed:
            set_clauses.append("title = %s")
            params.append(proposed['title'])
        if 'text' in proposed:
            set_clauses.append("text = %s")
            params.append(proposed['text'])
        if 'severity' in proposed:
            set_clauses.append("severity = %s")
            params.append(proposed['severity'])
        if 'defaultActions' in proposed:
            set_clauses.append("default_actions = %s")
            params.append(json.dumps(proposed['defaultActions']))
        if 'sentencingGuidelines' in proposed:
            set_clauses.append("sentencing_guidelines = %s")
            params.append(proposed['sentencingGuidelines'])
        if 'locationId' in proposed:
            set_clauses.append("location_id = %s")
            params.append(proposed['locationId'])
        if 'sessionId' in proposed:
            set_clauses.append("session_id = %s")
            params.append(proposed['sessionId'])
        if 'applicableContentTypes' in proposed:
            set_clauses.append("applicable_content_types = %s")
            params.append(proposed['applicableContentTypes'])
        if 'applicablePostTypes' in proposed:
            set_clauses.append("applicable_post_types = %s")
            params.append(proposed['applicablePostTypes'])
        if set_clauses:
            set_clauses.append("updated_time = CURRENT_TIMESTAMP")
            params.append(str(rule_id))
            db.execute_query(
                f"UPDATE rule SET {', '.join(set_clauses)} WHERE id = %s",
                tuple(params)
            )

    elif action == 'delete':
        rule_id = request_row.get('rule_id')
        if rule_id:
            db.execute_query("""
                UPDATE rule SET status = 'inactive', updated_time = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (str(rule_id),))


def format_rule_request(r):
    """Shared serializer for rule change request rows (with JOINed fields)."""
    proposed = r.get('proposed_rule') or {}
    if isinstance(proposed, str):
        proposed = json.loads(proposed)

    result = {
        'id': str(r['id']),
        'action': r['action'],
        'ruleId': str(r['rule_id']) if r.get('rule_id') else None,
        'proposedRule': proposed,
        'requester': {
            'id': str(r['requested_by']),
            'username': r['requester_username'],
            'displayName': r['requester_display_name'],
            'status': r.get('requester_status', 'active'),
            'avatarIconUrl': r.get('requester_avatar_icon_url'),
            'trustScore': float(r['requester_trust_score']) if r.get('requester_trust_score') is not None else None,
            'kudosCount': r.get('requester_kudos_count', 0),
        },
        'requesterAuthorityLocation': {
            'id': str(r['requester_authority_location_id']),
            'name': r.get('authority_location_name'),
        } if r.get('requester_authority_location_id') else None,
        'reason': r.get('request_reason'),
        'status': r['status'],
        'denialReason': r.get('denial_reason'),
        'autoApproveAt': r['auto_approve_at'].isoformat() if r.get('auto_approve_at') else None,
        'createdTime': r['created_time'].isoformat() if r.get('created_time') else None,
        'updatedTime': r['updated_time'].isoformat() if r.get('updated_time') else None,
        'reviewer': {
            'id': str(r['reviewer_id']),
            'username': r['reviewer_username'],
            'displayName': r['reviewer_display_name'],
            'status': r.get('reviewer_status', 'active'),
            'avatarIconUrl': r.get('reviewer_avatar_icon_url'),
            'trustScore': float(r['reviewer_trust_score']) if r.get('reviewer_trust_score') is not None else None,
            'kudosCount': r.get('reviewer_kudos_count', 0),
        } if r.get('reviewer_id') else None,
    }

    # Include current rule snapshot for update/delete
    if r.get('current_rule_id'):
        result['currentRule'] = {
            'id': str(r['current_rule_id']),
            'title': r.get('current_rule_title'),
            'text': r.get('current_rule_text'),
            'severity': r.get('current_rule_severity'),
            'status': r.get('current_rule_status'),
        }
    else:
        result['currentRule'] = None

    return result


def check_rule_auto_approve_expired():
    """Auto-approve any pending rule change requests past their timeout."""
    rows = db.execute_query("""
        UPDATE rule_change_request
        SET status = 'auto_approved', updated_time = CURRENT_TIMESTAMP
        WHERE status = 'pending' AND auto_approve_at <= CURRENT_TIMESTAMP
        RETURNING *
    """)
    for row in (rows or []):
        apply_rule_change(row)
        # Notify requester of auto-approval
        proposed = row.get('proposed_rule') or {}
        if isinstance(proposed, str):
            proposed = json.loads(proposed)
        desc = proposed.get('title', 'Rule change')
        notify_request_outcome(
            str(row['requested_by']), None, 'auto_approved',
            desc, 'rule_change')


# ---------------------------------------------------------------------------
# Notification Helpers
# ---------------------------------------------------------------------------


def get_admins_at_location(location_id):
    """Return user IDs of admins/moderators at a location or its ancestors."""
    ancestors = get_location_ancestors(location_id)
    if not ancestors:
        return []
    rows = db.execute_query("""
        SELECT DISTINCT ur.user_id FROM user_role ur
        WHERE ur.role IN ('admin', 'moderator')
          AND ur.location_id = ANY(%s::uuid[])
    """, (ancestors,))
    return [str(r['user_id']) for r in (rows or [])]


def notify_request_outcome(recipient_user_id, reviewer_name, status,
                           description, notification_type,
                           actor_user_id=None):
    """Notify a user about a request outcome (approved/denied/rescinded/auto_approved)."""
    titles = {
        'approved': 'Request approved',
        'denied': 'Request denied',
        'rescinded': 'Request rescinded',
        'auto_approved': 'Request auto-approved',
    }
    if status == 'auto_approved':
        body = f"{description} was auto-approved"
    else:
        body = f"{reviewer_name} {status}: {description}"

    title = titles.get(status, 'Request updated')
    data = {"action": "open_admin_request_log"}

    try:
        from candid.controllers.helpers.push_notifications import send_or_queue_notification
        send_or_queue_notification(title, body, data, recipient_user_id, db,
                                   notification_type=notification_type,
                                   actor_user_id=actor_user_id)
    except Exception as e:
        logger.error("Failed to send request outcome notification: %s", e)


def notify_role_target(target_user_id, action, role, location_name,
                       actor_user_id=None):
    """Notify a user that their role was granted or removed."""
    if action == 'assign':
        title = 'Role granted'
        body = f"You have been granted {role} at {location_name}"
    else:
        title = 'Role removed'
        body = f"Your {role} role at {location_name} has been removed"

    data = {"action": "open_admin_roles"}

    try:
        from candid.controllers.helpers.push_notifications import send_or_queue_notification
        send_or_queue_notification(title, body, data, target_user_id, db,
                                   notification_type='role_change',
                                   actor_user_id=actor_user_id)
    except Exception as e:
        logger.error("Failed to send role target notification: %s", e)


def notify_admin_action(recipient_user_ids, title, body, actor_user_id=None):
    """Notify users about a structural admin action."""
    data = {"action": "open_admin"}

    try:
        from candid.controllers.helpers.push_notifications import send_or_queue_notification
        for uid in recipient_user_ids:
            send_or_queue_notification(title, body, data, uid, db,
                                       notification_type='admin_action',
                                       actor_user_id=actor_user_id)
    except Exception as e:
        logger.error("Failed to send admin action notification: %s", e)


def send_auto_approve_reminder(peer_user_ids, description, notification_type,
                               requester_user_id=None):
    """Send a reminder to approval peers about an upcoming auto-approval."""
    title = "Request auto-approving soon"
    body = f"{description} will auto-approve tomorrow if not reviewed"
    data = {"action": "open_admin_pending"}

    try:
        from candid.controllers.helpers.push_notifications import send_or_queue_notification
        for peer_id in peer_user_ids:
            send_or_queue_notification(title, body, data, peer_id, db,
                                       notification_type=notification_type,
                                       actor_user_id=requester_user_id)
    except Exception as e:
        logger.error("Failed to send auto-approve reminder: %s", e)
