"""Moderation helper functions extracted from moderation_controller.py.

These are pure data-fetching and logic helpers used by moderation endpoints.
They have no request/response handling and can be reused across controllers.
"""

from candid.controllers import db
from candid.controllers.helpers.constants import ROLE_HIERARCHY
from candid.controllers.helpers.auth import (
    get_highest_role_at_location, get_location_ancestors,
    is_admin_anywhere, invalidate_ban_cache,
)
from candid.models.user import User
from candid.models.report import Report
from candid.models.error_model import ErrorModel  # noqa: F401 – re-exported for callers


def get_user_card(user_id):
    """Helper to fetch and return a User model for API responses."""
    user = db.execute_query("""
        SELECT
            id,
            username,
            display_name,
            status
        FROM users
        WHERE id = %s
    """, (user_id,), fetchone=True)
    if user is not None:
        return User(
            id=str(user['id']),
            username=user['username'],
            display_name=user['display_name'],
            status=user['status'],
        )
    return None


def map_db_report_to_model(row):
    """Map a database report row to a Report model."""
    return Report(
        id=str(row['id']),
        report_type=row['target_object_type'],
        target_id=str(row['target_object_id']),
        submitter_id=str(row['submitter_user_id']),
        rule_id=str(row['rule_id']),
        status=row['status'],
        submitter_comment=row.get('submitter_comment')
    )


def get_user_info(user_id):
    """Fetch basic user info dict for queue enrichment."""
    row = db.execute_query("""
        SELECT u.id, u.username, u.display_name, u.status,
               u.trust_score, u.avatar_url, u.avatar_icon_url,
               COALESCE((SELECT COUNT(*) FROM kudos k WHERE k.receiver_user_id = u.id), 0) AS kudos_count
        FROM users u WHERE u.id = %s
    """, (user_id,), fetchone=True)
    if row:
        return {
            'id': str(row['id']),
            'username': row['username'],
            'displayName': row['display_name'],
            'status': row['status'],
            'kudosCount': row['kudos_count'],
            'trustScore': float(row['trust_score']) if row.get('trust_score') else None,
            'avatarUrl': row.get('avatar_url'),
            'avatarIconUrl': row.get('avatar_icon_url'),
        }
    return None


def get_reported_user_role(target_object_type, target_object_id):
    """Determine the highest scoped role among the 'reported' users for a report.

    Returns a role string: 'admin', 'moderator', 'facilitator', or 'normal'.
    Checks the user_role table (not user_type, which is only 'normal'/'guest').
    """
    role_hierarchy = ROLE_HIERARCHY

    def _highest_role_for_user(user_id):
        """Get the highest scoped role for a single user."""
        row = db.execute_query("""
            SELECT role FROM user_role
            WHERE user_id = %s AND role IN ('admin', 'moderator', 'facilitator')
            ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 WHEN 'facilitator' THEN 3 END
            LIMIT 1
        """, (str(user_id),), fetchone=True)
        return row['role'] if row else 'normal'

    highest_role = 'normal'

    if target_object_type == 'position':
        row = db.execute_query("""
            SELECT p.creator_user_id FROM position p WHERE p.id = %s
        """, (target_object_id,), fetchone=True)
        if row:
            highest_role = _highest_role_for_user(row['creator_user_id'])

    elif target_object_type == 'chat_log':
        rows = db.execute_query("""
            SELECT cr.initiator_user_id, up.user_id AS position_holder_user_id
            FROM chat_log cl
            JOIN chat_request cr ON cl.chat_request_id = cr.id
            JOIN user_position up ON cr.user_position_id = up.id
            WHERE cl.id = %s
        """, (target_object_id,), fetchone=True)
        if rows:
            for uid in (rows['initiator_user_id'], rows['position_holder_user_id']):
                role = _highest_role_for_user(uid)
                if role_hierarchy.get(role, 0) > role_hierarchy.get(highest_role, 0):
                    highest_role = role

    return highest_role


def get_reported_user_ids(target_object_type, target_object_id):
    """Get user IDs of users who are the 'reported' party in a report target."""
    if target_object_type == 'position':
        row = db.execute_query("""
            SELECT creator_user_id FROM position WHERE id = %s
        """, (target_object_id,), fetchone=True)
        if row and row['creator_user_id']:
            return [str(row['creator_user_id'])]
    elif target_object_type == 'chat_log':
        row = db.execute_query("""
            SELECT cr.initiator_user_id, up.user_id AS position_holder_user_id
            FROM chat_log cl
            JOIN chat_request cr ON cl.chat_request_id = cr.id
            JOIN user_position up ON cr.user_position_id = up.id
            WHERE cl.id = %s
        """, (target_object_id,), fetchone=True)
        if row:
            return [str(row['initiator_user_id']), str(row['position_holder_user_id'])]
    return []


def get_content_scope(report_id):
    """Get the location_id and category_id of a report's target content.

    Returns (location_id, category_id) or (None, None).
    """
    report = db.execute_query("""
        SELECT target_object_type, target_object_id FROM report WHERE id = %s
    """, (str(report_id),), fetchone=True)
    if not report:
        return None, None

    if report['target_object_type'] == 'position':
        row = db.execute_query("""
            SELECT location_id, category_id FROM position WHERE id = %s
        """, (report['target_object_id'],), fetchone=True)
        if row:
            return (str(row['location_id']) if row.get('location_id') else None,
                    str(row['category_id']) if row.get('category_id') else None)

    elif report['target_object_type'] == 'chat_log':
        # Chat's scope comes from the underlying position
        row = db.execute_query("""
            SELECT p.location_id, p.category_id
            FROM chat_log cl
            JOIN chat_request cr ON cl.chat_request_id = cr.id
            JOIN user_position up ON cr.user_position_id = up.id
            JOIN position p ON up.position_id = p.id
            WHERE cl.id = %s
        """, (report['target_object_id'],), fetchone=True)
        if row:
            return (str(row['location_id']) if row.get('location_id') else None,
                    str(row['category_id']) if row.get('category_id') else None)

    return None, None


def determine_actioner_role_level(user_id, content_loc, content_cat):
    """Determine the actioner's highest role relevant to the content scope.

    Returns one of: 'admin', 'moderator', 'facilitator', 'assistant_moderator', or None.
    """
    if content_loc:
        role = get_highest_role_at_location(user_id, content_loc, content_cat)
        if role:
            return role
    # Fallback: check if they have any role at all
    row = db.execute_query("""
        SELECT role FROM user_role WHERE user_id = %s
        ORDER BY CASE role
            WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2
            WHEN 'facilitator' THEN 3 WHEN 'assistant_moderator' THEN 4
            WHEN 'expert' THEN 5 WHEN 'liaison' THEN 6
        END
        LIMIT 1
    """, (str(user_id),), fetchone=True)
    return row['role'] if row else None


def find_appeal_reviewers(actioner_level, content_loc, content_cat, exclude_user_id):
    """Find eligible reviewers for an appeal based on hierarchical escalation.

    Routes to next tier up:
      assistant_moderator -> facilitator (same location+category)
      facilitator -> moderator (same location, walk ancestors)
      moderator -> admin (same location, walk ancestors)
      admin -> parent location admin

    Returns list of user_id strings, or empty list if no eligible reviewers.
    """
    exclude = str(exclude_user_id) if exclude_user_id else None

    if actioner_level == 'assistant_moderator' and content_loc and content_cat:
        # Route to facilitator for this location+category
        rows = db.execute_query("""
            SELECT user_id FROM user_role
            WHERE role = 'facilitator' AND location_id = %s AND position_category_id = %s
        """, (content_loc, content_cat))
        targets = [str(r['user_id']) for r in (rows or []) if str(r['user_id']) != exclude]
        if targets:
            return targets
        # Fall through: if no facilitator, route to moderator
        actioner_level = 'facilitator'

    if actioner_level == 'facilitator' and content_loc:
        # Route to moderator at this location (walk ancestors for hierarchical)
        ancestors = get_location_ancestors(content_loc)
        if ancestors:
            rows = db.execute_query("""
                SELECT user_id FROM user_role
                WHERE role IN ('moderator') AND location_id = ANY(%s::uuid[])
            """, (ancestors,))
            targets = [str(r['user_id']) for r in (rows or []) if str(r['user_id']) != exclude]
            if targets:
                return targets
        # Fall through: if no moderator, route to admin
        actioner_level = 'moderator'

    if actioner_level == 'moderator' and content_loc:
        # Route to admin at this location (walk ancestors)
        ancestors = get_location_ancestors(content_loc)
        if ancestors:
            rows = db.execute_query("""
                SELECT user_id FROM user_role
                WHERE role = 'admin' AND location_id = ANY(%s::uuid[])
            """, (ancestors,))
            targets = [str(r['user_id']) for r in (rows or []) if str(r['user_id']) != exclude]
            if targets:
                return targets
        # Fall through: no admin found
        return []

    if actioner_level == 'admin' and content_loc:
        # Route to parent location admin
        # Get the actioner's admin locations within the content ancestry
        ancestors = get_location_ancestors(content_loc)
        if ancestors:
            actioner_admin_locs = db.execute_query("""
                SELECT location_id FROM user_role
                WHERE user_id = %s AND role = 'admin' AND location_id = ANY(%s::uuid[])
            """, (exclude, ancestors))
            # Find the most specific (deepest) admin location
            ancestor_set = {a: i for i, a in enumerate(ancestors)}
            if actioner_admin_locs:
                deepest = min(actioner_admin_locs,
                              key=lambda r: ancestor_set.get(str(r['location_id']), 999))
                deepest_loc = str(deepest['location_id'])
                # Get ancestors of the actioner's admin location; [1] is parent
                admin_loc_ancestors = get_location_ancestors(deepest_loc)
                if len(admin_loc_ancestors) > 1:
                    parent_loc = admin_loc_ancestors[1]
                    rows = db.execute_query("""
                        SELECT user_id FROM user_role
                        WHERE role = 'admin' AND location_id = %s
                    """, (parent_loc,))
                    targets = [str(r['user_id']) for r in (rows or []) if str(r['user_id']) != exclude]
                    if targets:
                        return targets

    return []


def find_peer_reviewers(actioner_level, content_loc, content_cat, exclude_user_id):
    """Find peer reviewers at the same role level as the original actioner.

    Peers are others with the same role at the same scope:
      admin: other admins with authority at content location
      moderator: other moderators with authority at content location
      facilitator: other facilitators at same location+category
      assistant_moderator: other assistant_moderators at same location+category

    If no peers found, falls through to find_appeal_reviewers (next tier up).
    Returns list of user_id strings.
    """
    exclude = str(exclude_user_id) if exclude_user_id else None

    if actioner_level in ('admin', 'moderator') and content_loc:
        # Hierarchical roles: find peers at this location or ancestors
        ancestors = get_location_ancestors(content_loc)
        if ancestors:
            rows = db.execute_query("""
                SELECT user_id FROM user_role
                WHERE role = %s AND location_id = ANY(%s::uuid[])
            """, (actioner_level, ancestors))
            targets = [str(r['user_id']) for r in (rows or []) if str(r['user_id']) != exclude]
            if targets:
                return targets

    elif actioner_level in ('facilitator', 'assistant_moderator') and content_loc:
        # Category-scoped roles: find peers at exact location+category
        if content_cat:
            rows = db.execute_query("""
                SELECT user_id FROM user_role
                WHERE role = %s AND location_id = %s AND position_category_id = %s
            """, (actioner_level, content_loc, content_cat))
        else:
            rows = db.execute_query("""
                SELECT user_id FROM user_role
                WHERE role = %s AND location_id = %s AND position_category_id IS NULL
            """, (actioner_level, content_loc))
        targets = [str(r['user_id']) for r in (rows or []) if str(r['user_id']) != exclude]
        if targets:
            return targets

    # No peers found: fall through to next tier up
    return find_appeal_reviewers(actioner_level, content_loc, content_cat, exclude_user_id)


def can_review_appeal_at_scope(user_id, content_loc, content_cat, actioner_level):
    """Check if a user is eligible to review an appeal at the given scope.

    Returns True if the user has a role at the appropriate tier above the actioner.
    """
    _TIER_ORDER = ['assistant_moderator', 'facilitator', 'moderator', 'admin']
    if actioner_level not in _TIER_ORDER:
        return False

    actioner_idx = _TIER_ORDER.index(actioner_level)

    # Check if user has a role at any tier above the actioner
    if content_loc:
        user_role = get_highest_role_at_location(user_id, content_loc, content_cat)
        if user_role and user_role in _TIER_ORDER:
            user_idx = _TIER_ORDER.index(user_role)
            return user_idx > actioner_idx

    return False


def get_rule_info(rule_id):
    """Fetch rule info dict for queue enrichment."""
    row = db.execute_query("""
        SELECT id, title, text, severity, default_actions, sentencing_guidelines
        FROM rule WHERE id = %s
    """, (rule_id,), fetchone=True)
    if row:
        result = {'id': str(row['id']), 'title': row['title'], 'text': row['text']}
        if row.get('severity') is not None:
            result['severity'] = row['severity']
        if row.get('default_actions') is not None:
            result['defaultActions'] = row['default_actions']
        if row.get('sentencing_guidelines') is not None:
            result['sentencingGuidelines'] = row['sentencing_guidelines']
        return result
    return None


def get_target_content(target_type, target_id):
    """Fetch target content details for a report."""
    if target_type == 'position':
        row = db.execute_query("""
            SELECT p.id, p.statement, p.creator_user_id,
                   pc.id AS category_id, pc.label AS category_label,
                   l.id AS location_id, l.name AS location_name, l.code AS location_code
            FROM position p
            LEFT JOIN position_category pc ON p.category_id = pc.id
            LEFT JOIN location l ON p.location_id = l.id
            WHERE p.id = %s
        """, (target_id,), fetchone=True)
        if row:
            creator = get_user_info(row['creator_user_id'])
            return {
                'type': 'position',
                'statement': row['statement'],
                'category': {'id': str(row['category_id']), 'label': row['category_label']} if row.get('category_id') else None,
                'location': {'code': row['location_code'], 'name': row['location_name']} if row.get('location_id') else None,
                'creator': creator,
            }
    elif target_type == 'chat_log':
        row = db.execute_query("""
            SELECT cl.id, cl.start_time, cl.end_time, cl.log,
                   cr.initiator_user_id, up.user_id AS position_holder_user_id,
                   p.statement AS position_statement
            FROM chat_log cl
            JOIN chat_request cr ON cl.chat_request_id = cr.id
            JOIN user_position up ON cr.user_position_id = up.id
            JOIN position p ON up.position_id = p.id
            WHERE cl.id = %s
        """, (target_id,), fetchone=True)
        if row:
            initiator = get_user_info(row['initiator_user_id'])
            holder = get_user_info(row['position_holder_user_id'])
            result = {
                'type': 'chat_log',
                'positionStatement': row['position_statement'],
                'participants': [initiator, holder],
            }
            # Include chat messages from the log JSONB column
            log_data = row.get('log')
            if log_data and isinstance(log_data, dict):
                result['messages'] = log_data.get('messages', [])
            elif log_data and isinstance(log_data, str):
                import json as json_module
                try:
                    parsed = json_module.loads(log_data)
                    result['messages'] = parsed.get('messages', [])
                except (ValueError, TypeError):
                    pass
            return result
    return None


def reverse_mod_action(mod_action_id):
    """Reverse the effects of a moderation action (unban users, restore positions)."""
    # Find all action classes and targets for this mod action
    targets = db.execute_query("""
        SELECT mac.action, mat.user_id, mac.class,
               r.target_object_type, r.target_object_id
        FROM mod_action_class mac
        JOIN mod_action_target mat ON mat.mod_action_class_id = mac.id
        JOIN mod_action ma ON mac.mod_action_id = ma.id
        JOIN report r ON ma.report_id = r.id
        WHERE mac.mod_action_id = %s
    """, (mod_action_id,))

    for t in (targets or []):
        # Reverse bans
        if t['action'] in ('permanent_ban', 'temporary_ban'):
            db.execute_query("""
                UPDATE users SET status = 'active' WHERE id = %s
            """, (t['user_id'],))
            invalidate_ban_cache(t['user_id'])

        # Reverse content removal
        if t['action'] == 'removed' and t['target_object_type'] == 'position':
            db.execute_query("""
                UPDATE position SET status = 'active' WHERE id = %s
            """, (t['target_object_id'],))
            db.execute_query("""
                UPDATE user_position SET status = 'active'
                WHERE position_id = %s AND status = 'removed'
            """, (t['target_object_id'],))


def get_user_polis_group(user_id, report):
    """Get the Polis group of a user for the category/location of a report's target.

    Returns the group ID (int) or None if not determinable.
    """
    try:
        from candid.controllers.helpers.polis_client import get_client, PolisError

        # Get the position's category and location from the report target
        if report.get('target_object_type') != 'position':
            return None

        pos = db.execute_query("""
            SELECT p.category_id, p.location_id
            FROM position p WHERE p.id = %s
        """, (report['target_object_id'],), fetchone=True)
        if not pos or not pos.get('category_id') or not pos.get('location_id'):
            return None

        # Find the polis conversation for this category+location
        conv = db.execute_query("""
            SELECT polis_conversation_id FROM polis_conversation
            WHERE position_category_id = %s AND location_id = %s
            LIMIT 1
        """, (pos['category_id'], pos['location_id']), fetchone=True)
        if not conv or not conv.get('polis_conversation_id'):
            return None

        polis_conv_id = conv['polis_conversation_id']

        # Get the user's PID in this conversation
        participant = db.execute_query("""
            SELECT polis_pid FROM polis_participant
            WHERE user_id = %s AND polis_conversation_id = %s
        """, (user_id, polis_conv_id), fetchone=True)
        if not participant or participant.get('polis_pid') is None:
            return None

        user_pid = participant['polis_pid']

        # Get math data to find group membership
        client = get_client()
        math_data = client.get_math_data(polis_conv_id)
        if not math_data:
            return None

        pca = math_data.get('pca', {})
        as_pojo = pca.get('asPOJO', {})
        group_clusters = as_pojo.get('group-clusters', [])

        for gid, cluster in enumerate(group_clusters):
            members = cluster.get('members', [])
            if user_pid in members:
                return gid

        return None
    except Exception:
        return None


def should_show_escalated_appeal(appeal_row, current_user_id):
    """Determine if an escalated appeal should be shown to the current user.

    Escalated appeals route to the next tier above the original actioner:
      assistant_moderator -> facilitator
      facilitator -> moderator
      moderator -> admin
      admin -> parent location admin
    """
    mod_action = db.execute_query("""
        SELECT report_id, responder_user_id FROM mod_action WHERE id = %s
    """, (str(appeal_row['mod_action_id']),), fetchone=True)
    if not mod_action:
        return False

    content_loc, content_cat = get_content_scope(mod_action['report_id'])
    actioner_level = determine_actioner_role_level(
        mod_action['responder_user_id'], content_loc, content_cat)

    if not actioner_level or not content_loc:
        # Fallback: show to any admin
        return is_admin_anywhere(current_user_id)

    # Find eligible reviewers for the escalated appeal
    reviewers = find_appeal_reviewers(actioner_level, content_loc, content_cat,
                                      mod_action['responder_user_id'])
    return current_user_id in reviewers


def should_show_appeal_to_reviewer(appeal_data, current_user_id, appeal_row):
    """Determine if a pending appeal should be shown to the current user.

    Uses hierarchical routing: the appeal is shown to peers at the same role
    level as the original actioner, or to the next tier up if no peers exist.
    Never shown to the original actioner.
    """
    original_action = appeal_data.get('originalAction') or {}
    original_responder = original_action.get('responder') or {}
    original_mod_id = original_responder.get('id')

    # Never show to the original actioner
    if str(current_user_id) == str(original_mod_id):
        return False

    # Get content scope from the original report
    mod_action_id = appeal_row.get('mod_action_id') or appeal_data.get('modActionId')
    if not mod_action_id:
        return True  # Fallback: show to any eligible reviewer

    mod_action = db.execute_query("""
        SELECT report_id, responder_user_id FROM mod_action WHERE id = %s
    """, (str(mod_action_id),), fetchone=True)
    if not mod_action:
        return True

    content_loc, content_cat = get_content_scope(mod_action['report_id'])
    actioner_level = determine_actioner_role_level(
        mod_action['responder_user_id'], content_loc, content_cat)

    if not actioner_level or not content_loc:
        return True  # Fallback: show to any eligible reviewer

    # Check if this user is among the eligible peer reviewers
    reviewers = find_peer_reviewers(actioner_level, content_loc, content_cat,
                                    mod_action['responder_user_id'])
    return str(current_user_id) in reviewers


def get_admin_response_notifications(user_id):
    """Get admin response notification items for a moderator's moderation queue."""
    notifications = db.execute_query("""
        SELECT n.mod_action_appeal_id,
               a.appeal_state, a.mod_action_id, a.user_id as appeal_user_id,
               a.appeal_text, n.created_time
        FROM mod_appeal_response_notification n
        JOIN mod_action_appeal a ON n.mod_action_appeal_id = a.id
        WHERE n.user_id = %s AND n.dismissed = FALSE
        ORDER BY n.created_time DESC
    """, (user_id,))

    items = []
    for n in (notifications or []):
        # Get admin's response (the last response on the appeal)
        admin_response = db.execute_query("""
            SELECT responder_user_id, appeal_response_text, created_time
            FROM mod_action_appeal_response
            WHERE mod_action_appeal_id = %s
            ORDER BY created_time DESC LIMIT 1
        """, (n['mod_action_appeal_id'],), fetchone=True)

        # Get all prior responses for context
        all_responses = db.execute_query("""
            SELECT responder_user_id, appeal_response_text, created_time
            FROM mod_action_appeal_response
            WHERE mod_action_appeal_id = %s
            ORDER BY created_time ASC
        """, (n['mod_action_appeal_id'],))

        # Get original mod action context
        mod_action = db.execute_query("""
            SELECT ma.responder_user_id, ma.mod_response, ma.mod_response_text, ma.report_id
            FROM mod_action ma WHERE ma.id = %s
        """, (n['mod_action_id'],), fetchone=True)

        # Get action classes
        action_classes = db.execute_query("""
            SELECT class, action, action_start_time, action_end_time FROM mod_action_class
            WHERE mod_action_id = %s
        """, (n['mod_action_id'],))

        # Get original report context (rule + target content)
        original_report = None
        if mod_action and mod_action.get('report_id'):
            report_row = db.execute_query("""
                SELECT id, target_object_type, target_object_id, rule_id,
                       submitter_user_id, submitter_comment
                FROM report WHERE id = %s
            """, (mod_action['report_id'],), fetchone=True)
            if report_row:
                original_report = {
                    'id': str(report_row['id']),
                    'reportType': report_row['target_object_type'],
                    'targetId': str(report_row['target_object_id']),
                    'rule': get_rule_info(report_row['rule_id']),
                    'targetContent': get_target_content(
                        report_row['target_object_type'],
                        report_row['target_object_id']
                    ),
                    'submitter': get_user_info(report_row['submitter_user_id']),
                    'submitterComment': report_row.get('submitter_comment'),
                }

        prior_responses = []
        for pr in (all_responses or []):
            # Skip the admin's final response (already shown separately)
            if admin_response and str(pr['responder_user_id']) == str(admin_response['responder_user_id']) \
                    and pr['created_time'] == admin_response['created_time']:
                continue
            prior_responses.append({
                'responder': get_user_info(pr['responder_user_id']),
                'responseText': pr.get('appeal_response_text'),
            })

        original_action = None
        if mod_action:
            original_action = {
                'responder': get_user_info(mod_action['responder_user_id']),
                'modResponse': mod_action['mod_response'],
                'modResponseText': mod_action.get('mod_response_text'),
                'actions': [
                    {
                        'userClass': ac['class'],
                        'action': ac['action'],
                        'durationDays': max(1, round((ac['action_end_time'] - ac['action_start_time']).total_seconds() / 86400))
                            if ac['action'] == 'temporary_ban' and ac.get('action_start_time') and ac.get('action_end_time')
                            else None,
                    }
                    for ac in (action_classes or [])
                ],
            }

        items.append({
            'type': 'admin_response_notification',
            'data': {
                'modActionAppealId': str(n['mod_action_appeal_id']),
                'appealState': n['appeal_state'],
                'adminResponseText': admin_response.get('appeal_response_text') if admin_response else None,
                'adminResponder': get_user_info(admin_response['responder_user_id']) if admin_response else None,
                'appealText': n.get('appeal_text'),
                'appealUser': get_user_info(n['appeal_user_id']),
                'originalAction': original_action,
                'originalReport': original_report,
                'priorResponses': prior_responses,
            },
            '_created_time': n['created_time'],
        })

    return items


def get_target_users(user_class, target_object_type, target_object_id, report_id=None):
    """
    Auto-identify target users based on user_class and the report's target.

    For position reports:
    - submitter: the creator of the position
    - active_adopter: users with active user_position for this position
    - passive_adopter: users with non-active user_position for this position

    For chat_log reports:
    - submitter: both chat participants (initiator and position holder)
    - reporter: the user who submitted the report
    - reported: the other participant (not the reporter) in a chat
    - active_adopter/passive_adopter: no targets (chats don't have adopters)
    """
    user_ids = []

    # Handle reporter/reported classes (work for both position and chat_log)
    if user_class == 'reporter' and report_id:
        report_row = db.execute_query("""
            SELECT submitter_user_id FROM report WHERE id = %s
        """, (report_id,), fetchone=True)
        if report_row and report_row['submitter_user_id']:
            return [str(report_row['submitter_user_id'])]
        return []

    if user_class == 'reported' and report_id:
        if target_object_type == 'chat_log':
            # The 'reported' user is the participant who is NOT the reporter
            report_row = db.execute_query("""
                SELECT submitter_user_id FROM report WHERE id = %s
            """, (report_id,), fetchone=True)
            chat_row = db.execute_query("""
                SELECT cr.initiator_user_id, up.user_id AS position_holder_user_id
                FROM chat_log cl
                JOIN chat_request cr ON cl.chat_request_id = cr.id
                JOIN user_position up ON cr.user_position_id = up.id
                WHERE cl.id = %s
            """, (target_object_id,), fetchone=True)
            if report_row and chat_row:
                reporter_id = str(report_row['submitter_user_id'])
                participants = [str(chat_row['initiator_user_id']), str(chat_row['position_holder_user_id'])]
                return [uid for uid in participants if uid != reporter_id]
        elif target_object_type == 'position':
            # For positions, 'reported' is the same as 'submitter' (the creator)
            result = db.execute_query("""
                SELECT creator_user_id FROM position WHERE id = %s
            """, (target_object_id,), fetchone=True)
            if result and result['creator_user_id']:
                return [str(result['creator_user_id'])]
        return []

    if target_object_type == 'position':
        if user_class == 'submitter':
            result = db.execute_query("""
                SELECT creator_user_id FROM position WHERE id = %s
            """, (target_object_id,), fetchone=True)
            if result and result['creator_user_id']:
                user_ids.append(str(result['creator_user_id']))

        elif user_class == 'active_adopter':
            results = db.execute_query("""
                SELECT user_id FROM user_position WHERE position_id = %s AND status = 'active'
            """, (target_object_id,))
            if results:
                user_ids = [str(r['user_id']) for r in results]

        elif user_class == 'passive_adopter':
            results = db.execute_query("""
                SELECT user_id FROM user_position WHERE position_id = %s AND status != 'active'
            """, (target_object_id,))
            if results:
                user_ids = [str(r['user_id']) for r in results]

    elif target_object_type == 'chat_log':
        if user_class == 'submitter':
            # Both participants are considered "submitters" for a chat
            result = db.execute_query("""
                SELECT cr.initiator_user_id, up.user_id AS position_holder_user_id
                FROM chat_log cl
                JOIN chat_request cr ON cl.chat_request_id = cr.id
                JOIN user_position up ON cr.user_position_id = up.id
                WHERE cl.id = %s
            """, (target_object_id,), fetchone=True)
            if result:
                user_ids.append(str(result['initiator_user_id']))
                user_ids.append(str(result['position_holder_user_id']))
        # active_adopter and passive_adopter have no targets for chats

    return user_ids
