"""Admin helper functions extracted from admin_controller.py.

These are data-fetching, logic, and formatting helpers used by admin endpoints.
They have no request/response handling and can be reused across controllers.
"""

import uuid
import logging

from candid.controllers import db
from candid.controllers.helpers.auth import get_location_ancestors
from candid.models.user import User
from candid.models.survey import Survey
from candid.models.survey_question import SurveyQuestion
from candid.models.survey_question_option import SurveyQuestionOption

logger = logging.getLogger(__name__)

# Roles admins can assign (at their location or descendants)
ADMIN_ASSIGNABLE = {'admin', 'moderator', 'facilitator'}
# Roles facilitators can assign (at their location+category)
FACILITATOR_ASSIGNABLE = {'assistant_moderator', 'expert', 'liaison'}

ALL_ASSIGNABLE = ADMIN_ASSIGNABLE | FACILITATOR_ASSIGNABLE


def get_user_card(user_id):
    """Helper to fetch and return a User model for API responses."""
    user = db.execute_query("""
        SELECT id, username, display_name, status
        FROM users WHERE id = %s
    """, (user_id,), fetchone=True)
    if user is not None:
        return User(
            id=str(user['id']),
            username=user['username'],
            display_name=user['display_name'],
            status=user['status'],
        )
    return None


def build_survey_with_nested_data(survey_id):
    """Fetch survey with creator User, questions, and options nested."""
    survey_row = db.execute_query("""
        SELECT s.id, s.creator_user_id, s.position_category_id, s.location_id,
               s.survey_title, s.survey_type, s.created_time, s.start_time, s.end_time, s.status,
               l.name AS location_name, l.code AS location_code,
               pc.label AS category_name
        FROM survey s
        LEFT JOIN location l ON s.location_id = l.id
        LEFT JOIN position_category pc ON s.position_category_id = pc.id
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
        position_category_id=str(survey_row['position_category_id']) if survey_row['position_category_id'] else None,
        survey_title=survey_row['survey_title'],
        survey_type=survey_row['survey_type'],
        location_id=str(survey_row['location_id']) if survey_row['location_id'] else None,
        location_code=survey_row['location_code'],
        location_name=survey_row['location_name'],
        category_id=str(survey_row['position_category_id']) if survey_row['position_category_id'] else None,
        category_name=survey_row['category_name'],
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
               s.location_id, s.position_category_id,
               s.start_time, s.end_time, s.status, s.created_time,
               s.is_group_labeling,
               l.name AS location_name, l.code AS location_code,
               pc.label AS category_name
        FROM survey s
        LEFT JOIN location l ON s.location_id = l.id
        LEFT JOIN position_category pc ON s.position_category_id = pc.id
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
        "categoryId": str(survey_row['position_category_id']) if survey_row['position_category_id'] else None,
        "categoryName": survey_row['category_name'],
        "isGroupLabeling": bool(survey_row.get('is_group_labeling')),
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


def notify_peers(peer_user_ids, requester_name, action, role, target_name):
    """Send push notifications to approval peers about a role change request."""
    try:
        from candid.controllers.helpers.push_notifications import send_or_queue_notification
        action_word = "assign" if action == "assign" else "remove"
        title = "Role change request needs review"
        body = f"{requester_name} requested to {action_word} {role} for {target_name}"
        data = {"action": "open_admin_pending"}
        for peer_id in peer_user_ids:
            send_or_queue_notification(title, body, data, peer_id, db)
    except Exception as e:
        logger.error("Failed to notify peers: %s", e)


def check_auto_approve_expired():
    """Auto-approve any pending requests past their timeout. Check-on-access pattern."""
    db.execute_query("""
        UPDATE role_change_request
        SET status = 'auto_approved', updated_time = CURRENT_TIMESTAMP
        WHERE status = 'pending' AND auto_approve_at <= CURRENT_TIMESTAMP
    """)


def apply_role_change(request_row):
    """Apply an approved/auto-approved role change request."""
    if request_row['action'] == 'assign':
        # Check if already exists (idempotent)
        existing = db.execute_query("""
            SELECT id FROM user_role
            WHERE user_id = %s AND role = %s AND location_id = %s
            AND (position_category_id = %s OR (position_category_id IS NULL AND %s IS NULL))
            LIMIT 1
        """, (request_row['target_user_id'], request_row['role'],
              request_row['location_id'],
              request_row['position_category_id'], request_row['position_category_id']),
            fetchone=True)
        if not existing:
            role_id = str(uuid.uuid4())
            db.execute_query("""
                INSERT INTO user_role (id, user_id, role, location_id, position_category_id, assigned_by)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (role_id, request_row['target_user_id'], request_row['role'],
                  request_row['location_id'], request_row['position_category_id'],
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
      1. Peer facilitator at same location+category
      2. Location moderator
      3. Location admin
      4. None -> auto-approve
    """
    requester_id = str(request_row['requested_by'])
    role = request_row['role']
    target_loc = str(request_row['location_id']) if request_row.get('location_id') else None
    target_cat = str(request_row['position_category_id']) if request_row.get('position_category_id') else None
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
                AND ur.position_category_id = %s AND ur.user_id != %s
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


def get_requester_authority_location(user_id, role, location_id, category_id=None):
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
        # Facilitator must have facilitator role at exact location+category
        if category_id:
            row = db.execute_query("""
                SELECT 1 FROM user_role
                WHERE user_id = %s AND role = 'facilitator'
                AND location_id = %s AND position_category_id = %s
                LIMIT 1
            """, (str(user_id), str(location_id), str(category_id)), fetchone=True)
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
        },
        'role': r['role'],
        'location': {
            'id': str(r['location_id']),
            'name': r['location_name'],
            'code': r['location_code'],
        } if r.get('location_id') else None,
        'category': {
            'id': str(r['position_category_id']),
            'label': r['category_label'],
        } if r.get('position_category_id') else None,
        'requester': {
            'id': str(r['requested_by']),
            'username': r['requester_username'],
            'displayName': r['requester_display_name'],
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
        } if r.get('reviewer_id') else None,
        'updatedTime': r['updated_time'].isoformat() if r.get('updated_time') else None,
    }
    return result
