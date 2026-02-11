import connexion
from typing import Dict
from typing import Tuple
from typing import Union
import uuid

from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.mod_action import ModAction  # noqa: E501
from candid.models.mod_action_appeal_response import ModActionAppealResponse  # noqa: E501
from candid.models.mod_action_request import ModActionRequest  # noqa: E501
from candid.models.report import Report  # noqa: E501
from candid.models.report_position_request import ReportPositionRequest  # noqa: E501
from candid.models.respond_to_appeal_request import RespondToAppealRequest  # noqa: E501
from candid.models.user import User
from candid import util

from candid.controllers import db
from candid.controllers.helpers.auth import (
    authorization, authorization_allow_banned, authorization_scoped,
    token_to_user, invalidate_ban_cache,
    is_admin_anywhere, is_moderator_anywhere,
    is_admin_at_location, is_moderator_at_location,
    get_highest_role_at_location, get_location_ancestors,
)


def get_user_moderation_history(user_id, token_info=None):  # noqa: E501
    """Get moderation history for a user

     # noqa: E501

    :param user_id:
    :type user_id: str

    :rtype: Union[List[ModerationHistoryEvent], Tuple[List[ModerationHistoryEvent], int]]
    """
    authorized, auth_err = authorization_scoped("moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    rows = db.execute_query("""
        SELECT
            ma.id AS mod_action_id,
            mac.action,
            mac.action_start_time,
            mac.action_end_time,
            ma.created_time AS action_date,
            ma.mod_response_text,
            r.rule_id,
            r.submitter_comment,
            r.submitter_user_id,
            r.target_object_type,
            r.target_object_id,
            ma.responder_user_id
        FROM mod_action_target mat
        JOIN mod_action_class mac ON mat.mod_action_class_id = mac.id
        JOIN mod_action ma ON mac.mod_action_id = ma.id
        JOIN report r ON ma.report_id = r.id
        WHERE mat.user_id = %s
        ORDER BY ma.created_time DESC
    """, (user_id,))

    def _user_brief(uid):
        """Fetch displayName + username for a user ID."""
        if not uid:
            return None
        u = db.execute_query("""
            SELECT display_name, username FROM users WHERE id = %s
        """, (uid,), fetchone=True)
        if u:
            return {'displayName': u['display_name'], 'username': u['username']}
        return None

    # Deduplicate by mod_action_id (a user may appear in multiple action classes)
    seen_actions = set()
    events = []
    for row in (rows or []):
        if str(row['mod_action_id']) in seen_actions:
            continue
        seen_actions.add(str(row['mod_action_id']))

        action_type = row['action']

        # Compute duration in days for temporary bans
        duration_days = None
        if action_type == 'temporary_ban' and row.get('action_start_time') and row.get('action_end_time'):
            delta = row['action_end_time'] - row['action_start_time']
            duration_days = max(1, round(delta.total_seconds() / 86400))

        # Get rule info
        rule = _get_rule_info(row['rule_id']) if row.get('rule_id') else None

        # Get target content text
        target_text = None
        if row['target_object_type'] == 'position':
            pos = db.execute_query("""
                SELECT statement FROM position WHERE id = %s
            """, (row['target_object_id'],), fetchone=True)
            if pos:
                target_text = pos['statement']

        # Reporter info
        reporter = _user_brief(row.get('submitter_user_id'))

        # Moderator info
        moderator = _user_brief(row['responder_user_id'])

        # Get appeal info if any
        appeal = db.execute_query("""
            SELECT id, appeal_state, appeal_text, user_id
            FROM mod_action_appeal
            WHERE mod_action_id = %s AND status = 'active'
            ORDER BY created_time DESC LIMIT 1
        """, (row['mod_action_id'],), fetchone=True)

        appeal_user = None
        appeal_responses = []
        if appeal:
            appeal_user = _user_brief(appeal['user_id'])

            # Get all appeal responses
            responses = db.execute_query("""
                SELECT responder_user_id, appeal_response_text
                FROM mod_action_appeal_response
                WHERE mod_action_appeal_id = %s
                ORDER BY created_time ASC
            """, (appeal['id'],))
            resp_list = responses or []
            for idx, resp in enumerate(resp_list):
                # Determine outcome based on appeal state and position
                if appeal['appeal_state'] in ('overruled', 'escalated', 'denied', 'approved', 'modified'):
                    if len(resp_list) >= 2 and idx == 0:
                        outcome = 'overruled'
                    elif len(resp_list) >= 2 and idx == 1:
                        outcome = 'escalated'
                    elif len(resp_list) >= 3 and idx == 2:
                        outcome = 'admin_decision'
                    elif len(resp_list) == 1:
                        outcome = 'admin_decision' if appeal['appeal_state'] in ('approved', 'denied', 'modified') else None
                    else:
                        outcome = None
                else:
                    outcome = None
                appeal_responses.append({
                    'responder': _user_brief(resp['responder_user_id']),
                    'responseText': resp.get('appeal_response_text'),
                    'outcome': outcome,
                })

        event = {
            'id': str(row['mod_action_id']),
            'actionType': action_type,
            'actionDate': row['action_date'].isoformat() if row.get('action_date') else None,
            'durationDays': duration_days,
            'rule': {'id': str(rule['id']), 'title': rule['title']} if rule else None,
            'targetContent': target_text,
            'reporter': reporter,
            'reportReason': row.get('submitter_comment'),
            'moderator': moderator,
            'moderatorComment': row.get('mod_response_text'),
            'appealState': appeal['appeal_state'] if appeal else None,
            'appealUser': appeal_user,
            'appealText': appeal['appeal_text'] if appeal else None,
            'appealResponses': appeal_responses if appeal_responses else None,
        }
        events.append(event)

    return events


def get_rules(token_info=None):  # noqa: E501
    """Get all active community rules

     # noqa: E501

    :rtype: Union[List[Rule], Tuple[List[Rule], int], Tuple[List[Rule], int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    rules = db.execute_query("""
        SELECT id, title, text, severity, default_actions, sentencing_guidelines
        FROM rule
        WHERE status = 'active'
        ORDER BY created_time ASC
    """)

    result = []
    for r in (rules or []):
        rule_dict = {'id': str(r['id']), 'title': r['title'], 'text': r['text']}
        if r.get('severity') is not None:
            rule_dict['severity'] = r['severity']
        if r.get('default_actions') is not None:
            rule_dict['defaultActions'] = r['default_actions']
        if r.get('sentencing_guidelines') is not None:
            rule_dict['sentencingGuidelines'] = r['sentencing_guidelines']
        result.append(rule_dict)
    return result


def _get_user_card(user_id):
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


def _map_db_report_to_model(row):
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


def _get_user_info(user_id):
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


def _get_reported_user_role(target_object_type, target_object_id):
    """Determine the highest scoped role among the 'reported' users for a report.

    Returns a role string: 'admin', 'moderator', or 'normal'.
    Checks the user_role table (not user_type, which is only 'normal'/'guest').
    """
    role_hierarchy = {'normal': 0, 'moderator': 1, 'admin': 2}

    def _highest_role_for_user(user_id):
        """Get the highest scoped role for a single user."""
        row = db.execute_query("""
            SELECT role FROM user_role
            WHERE user_id = %s AND role IN ('admin', 'moderator')
            ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 END
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


def _get_reported_user_ids(target_object_type, target_object_id):
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


def _get_content_scope(report_id):
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


def _determine_actioner_role_level(user_id, content_loc, content_cat):
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


def _find_appeal_reviewers(actioner_level, content_loc, content_cat, exclude_user_id):
    """Find eligible reviewers for an appeal based on hierarchical escalation.

    Routes to next tier up:
      assistant_moderator → facilitator (same location+category)
      facilitator → moderator (same location, walk ancestors)
      moderator → admin (same location, walk ancestors)
      admin → parent location admin

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


def _find_peer_reviewers(actioner_level, content_loc, content_cat, exclude_user_id):
    """Find peer reviewers at the same role level as the original actioner.

    Peers are others with the same role at the same scope:
      admin: other admins with authority at content location
      moderator: other moderators with authority at content location
      facilitator: other facilitators at same location+category
      assistant_moderator: other assistant_moderators at same location+category

    If no peers found, falls through to _find_appeal_reviewers (next tier up).
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
    return _find_appeal_reviewers(actioner_level, content_loc, content_cat, exclude_user_id)


def _can_review_appeal_at_scope(user_id, content_loc, content_cat, actioner_level):
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


def _get_rule_info(rule_id):
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


def _get_target_content(target_type, target_id):
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
            creator = _get_user_info(row['creator_user_id'])
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
            initiator = _get_user_info(row['initiator_user_id'])
            holder = _get_user_info(row['position_holder_user_id'])
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


def create_appeal(action_id, body, token_info=None):  # noqa: E501
    """Create an appeal for a moderation action

     # noqa: E501

    :param action_id:
    :type action_id: str
    :param body:
    :type body: dict | bytes

    :rtype: Union[ModActionAppeal, Tuple[ModActionAppeal, int]]
    """
    authorized, auth_err = authorization_allow_banned("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    appeal_text = body.get('appealText') or body.get('appeal_text', '')
    if not appeal_text or len(appeal_text) > 1000:
        return ErrorModel(400, "Appeal text is required and must be under 1000 characters"), 400

    # Validate mod_action exists
    mod_action = db.execute_query("""
        SELECT id FROM mod_action WHERE id = %s
    """, (action_id,), fetchone=True)
    if mod_action is None:
        return ErrorModel(400, "Moderation action not found"), 400

    # Validate user is a target of the action
    is_target = db.execute_query("""
        SELECT 1 FROM mod_action_target mat
        JOIN mod_action_class mac ON mat.mod_action_class_id = mac.id
        WHERE mac.mod_action_id = %s AND mat.user_id = %s
        LIMIT 1
    """, (action_id, user.id), fetchone=True)
    if is_target is None:
        return ErrorModel(403, "You are not a target of this moderation action"), 403

    # Check no active appeal already exists
    existing = db.execute_query("""
        SELECT id FROM mod_action_appeal
        WHERE mod_action_id = %s AND user_id = %s AND status = 'active'
    """, (action_id, user.id), fetchone=True)
    if existing:
        return ErrorModel(400, "An active appeal already exists for this action"), 400

    # Create the appeal
    appeal_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO mod_action_appeal (id, user_id, mod_action_id, appeal_text)
        VALUES (%s, %s, %s, %s)
    """, (appeal_id, user.id, action_id, appeal_text))

    return {
        'id': appeal_id,
        'userId': str(user.id),
        'modActionId': action_id,
        'appealText': appeal_text,
        'appealState': 'pending',
    }, 201


def _reverse_mod_action(mod_action_id):
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


def _get_user_polis_group(user_id, report):
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


def _should_show_escalated_appeal(appeal_row, current_user_id):
    """Determine if an escalated appeal should be shown to the current user.

    Escalated appeals route to the next tier above the original actioner:
      assistant_moderator → facilitator
      facilitator → moderator
      moderator → admin
      admin → parent location admin
    """
    mod_action = db.execute_query("""
        SELECT report_id, responder_user_id FROM mod_action WHERE id = %s
    """, (str(appeal_row['mod_action_id']),), fetchone=True)
    if not mod_action:
        return False

    content_loc, content_cat = _get_content_scope(mod_action['report_id'])
    actioner_level = _determine_actioner_role_level(
        mod_action['responder_user_id'], content_loc, content_cat)

    if not actioner_level or not content_loc:
        # Fallback: show to any admin
        return is_admin_anywhere(current_user_id)

    # Find eligible reviewers for the escalated appeal
    reviewers = _find_appeal_reviewers(actioner_level, content_loc, content_cat,
                                        mod_action['responder_user_id'])
    return current_user_id in reviewers


def _should_show_appeal_to_reviewer(appeal_data, current_user_id, appeal_row):
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

    content_loc, content_cat = _get_content_scope(mod_action['report_id'])
    actioner_level = _determine_actioner_role_level(
        mod_action['responder_user_id'], content_loc, content_cat)

    if not actioner_level or not content_loc:
        return True  # Fallback: show to any eligible reviewer

    # Check if this user is among the eligible peer reviewers
    reviewers = _find_peer_reviewers(actioner_level, content_loc, content_cat,
                                      mod_action['responder_user_id'])
    return str(current_user_id) in reviewers


def _get_admin_response_notifications(user_id):
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
                    'rule': _get_rule_info(report_row['rule_id']),
                    'targetContent': _get_target_content(
                        report_row['target_object_type'],
                        report_row['target_object_id']
                    ),
                    'submitter': _get_user_info(report_row['submitter_user_id']),
                    'submitterComment': report_row.get('submitter_comment'),
                }

        prior_responses = []
        for pr in (all_responses or []):
            # Skip the admin's final response (already shown separately)
            if admin_response and str(pr['responder_user_id']) == str(admin_response['responder_user_id']) \
                    and pr['created_time'] == admin_response['created_time']:
                continue
            prior_responses.append({
                'responder': _get_user_info(pr['responder_user_id']),
                'responseText': pr.get('appeal_response_text'),
            })

        original_action = None
        if mod_action:
            original_action = {
                'responder': _get_user_info(mod_action['responder_user_id']),
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
                'adminResponder': _get_user_info(admin_response['responder_user_id']) if admin_response else None,
                'appealText': n.get('appeal_text'),
                'appealUser': _get_user_info(n['appeal_user_id']),
                'originalAction': original_action,
                'originalReport': original_report,
                'priorResponses': prior_responses,
            },
            '_created_time': n['created_time'],
        })

    return items


def dismiss_admin_response_notification(appeal_id, token_info=None):
    """Dismiss an admin response notification."""
    authorized, auth_err = authorization_scoped("moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)
    db.execute_query("""
        UPDATE mod_appeal_response_notification SET dismissed = TRUE
        WHERE mod_action_appeal_id = %s AND user_id = %s
    """, (appeal_id, user.id))

    return {'status': 'ok'}


def claim_report(report_id, token_info=None):  # noqa: E501
    """Claim a report for review

    :param report_id:
    :type report_id: str

    :rtype: Union[dict, Tuple[dict, int]]
    """
    authorized, auth_err = authorization_scoped("moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    # Check report exists
    report = db.execute_query("""
        SELECT id, claimed_by_user_id, claimed_at FROM report WHERE id = %s
    """, (report_id,), fetchone=True)

    if report is None:
        return ErrorModel(400, "Report not found"), 400

    # Check if already claimed by another user with an active claim
    if (report['claimed_by_user_id'] is not None
            and str(report['claimed_by_user_id']) != str(user.id)):
        from datetime import datetime, timezone, timedelta
        if report['claimed_at'] and report['claimed_at'].replace(tzinfo=timezone.utc) > datetime.now(timezone.utc) - timedelta(minutes=15):
            return ErrorModel(409, "Report is already claimed by another moderator"), 409

    # Claim it
    db.execute_query("""
        UPDATE report SET claimed_by_user_id = %s, claimed_at = CURRENT_TIMESTAMP
        WHERE id = %s
    """, (str(user.id), report_id))

    return {
        'status': 'claimed',
        'claimedBy': str(user.id),
    }


def release_report(report_id, token_info=None):  # noqa: E501
    """Release a claimed report

    :param report_id:
    :type report_id: str

    :rtype: Union[dict, Tuple[dict, int]]
    """
    authorized, auth_err = authorization_scoped("moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    # Check report exists
    report = db.execute_query("""
        SELECT id, claimed_by_user_id FROM report WHERE id = %s
    """, (report_id,), fetchone=True)

    if report is None:
        return ErrorModel(400, "Report not found"), 400

    # Clear the claim
    db.execute_query("""
        UPDATE report SET claimed_by_user_id = NULL, claimed_at = NULL
        WHERE id = %s
    """, (report_id,))

    return {'status': 'released'}


def get_moderation_queue(token_info=None):  # noqa: E501
    """Get unified moderation queue with all items requiring moderator attention

     # noqa: E501


    :rtype: Union[List[GetModerationQueue200ResponseInner], Tuple[List[GetModerationQueue200ResponseInner], int], Tuple[List[GetModerationQueue200ResponseInner], int, Dict[str, str]]
    """
    authorized, auth_err = authorization_scoped("moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)
    is_admin = is_admin_anywhere(user.id)

    # Get pending reports (exclude those claimed by other users with active claims)
    reports = db.execute_query("""
        SELECT id, target_object_type, target_object_id, submitter_user_id,
               rule_id, status, submitter_comment, created_time,
               claimed_by_user_id, claimed_at
        FROM report
        WHERE status = 'pending'
          AND (
            claimed_by_user_id IS NULL
            OR claimed_by_user_id = %s
            OR claimed_at < NOW() - INTERVAL '15 minutes'
          )
        ORDER BY created_time ASC
    """, (str(user.id),))

    # Get active appeals needing review (all states; per-appeal filtering in the loop)
    appeal_states = ['pending', 'overruled', 'escalated']

    appeals = db.execute_query("""
        SELECT id, user_id, mod_action_id, appeal_text, appeal_state, created_time
        FROM mod_action_appeal
        WHERE status = 'active' AND appeal_state = ANY(%s)
        ORDER BY created_time ASC
    """, (appeal_states,))

    queue = []

    # Add admin response notifications (for moderators who were involved in escalated appeals)
    admin_notifications = _get_admin_response_notifications(str(user.id))
    queue.extend(admin_notifications)

    # Add enriched reports to queue (with role-based routing)
    role_hierarchy = {'normal': 0, 'moderator': 1, 'admin': 2}
    if reports:
        for r in reports:
            # Role-based routing: determine reported user's role
            reported_role = _get_reported_user_role(r['target_object_type'], r['target_object_id'])
            reported_role_level = role_hierarchy.get(reported_role, 0)

            # Moderators cannot see reports against moderators or admins
            if not is_admin and reported_role_level >= role_hierarchy['moderator']:
                continue

            # Admins cannot see reports against themselves
            if is_admin and reported_role_level >= role_hierarchy['admin']:
                reported_ids = _get_reported_user_ids(r['target_object_type'], r['target_object_id'])
                if str(user.id) in reported_ids:
                    continue

            rule = _get_rule_info(r['rule_id'])
            submitter = _get_user_info(r['submitter_user_id'])
            target_content = _get_target_content(r['target_object_type'], r['target_object_id'])

            queue.append({
                'type': 'report',
                'data': {
                    'id': str(r['id']),
                    'reportType': r['target_object_type'],
                    'targetId': str(r['target_object_id']),
                    'submitterId': str(r['submitter_user_id']),
                    'ruleId': str(r['rule_id']),
                    'status': r['status'],
                    'submitterComment': r.get('submitter_comment'),
                    'rule': rule,
                    'submitter': submitter,
                    'targetContent': target_content,
                },
                '_created_time': r['created_time']
            })

    # Add enriched appeals to queue
    if appeals:
        for a in appeals:
            # Fetch original mod action and report context
            mod_action = db.execute_query("""
                SELECT ma.id, ma.report_id, ma.responder_user_id,
                       ma.mod_response, ma.mod_response_text
                FROM mod_action ma
                WHERE ma.id = %s
            """, (a['mod_action_id'],), fetchone=True)

            original_report = None
            original_action = None
            if mod_action:
                # Fetch action classes (what actions were taken)
                action_classes = db.execute_query("""
                    SELECT class, action, action_start_time, action_end_time FROM mod_action_class
                    WHERE mod_action_id = %s
                """, (mod_action['id'],))

                original_action = {
                    'id': str(mod_action['id']),
                    'modResponse': mod_action['mod_response'],
                    'modResponseText': mod_action.get('mod_response_text'),
                    'responder': _get_user_info(mod_action['responder_user_id']),
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
                        'rule': _get_rule_info(report_row['rule_id']),
                        'targetContent': _get_target_content(
                            report_row['target_object_type'],
                            report_row['target_object_id']
                        ),
                        'submitter': _get_user_info(report_row['submitter_user_id']),
                        'submitterComment': report_row.get('submitter_comment'),
                    }

            appealing_user = _get_user_info(a['user_id'])

            # Determine the appealer's role in the original action
            appealer_class = db.execute_query("""
                SELECT mac.class FROM mod_action_target mat
                JOIN mod_action_class mac ON mat.mod_action_class_id = mac.id
                WHERE mac.mod_action_id = %s AND mat.user_id = %s
                LIMIT 1
            """, (a['mod_action_id'], a['user_id']), fetchone=True)

            # Fetch prior appeal responses (e.g. the second moderator who escalated)
            prior_responses = db.execute_query("""
                SELECT responder_user_id, appeal_response_text, created_time
                FROM mod_action_appeal_response
                WHERE mod_action_appeal_id = %s
                ORDER BY created_time ASC
            """, (a['id'],))
            responses_list = []
            # Enrich prior responses with outcome context
            for idx, pr in enumerate(prior_responses or []):
                if a['appeal_state'] in ('overruled', 'escalated'):
                    if idx == 0:
                        # First response: the second mod who overruled
                        outcome = 'overruled'
                    elif idx == 1:
                        # Second response: the original mod who escalated
                        outcome = 'escalated'
                    else:
                        outcome = None
                else:
                    outcome = None
                responses_list.append({
                    'responder': _get_user_info(pr['responder_user_id']),
                    'responseText': pr.get('appeal_response_text'),
                    'outcome': outcome,
                })

            appeal_item = {
                'type': 'appeal',
                'data': {
                    'id': str(a['id']),
                    'userId': str(a['user_id']),
                    'modActionId': str(a['mod_action_id']),
                    'appealText': a['appeal_text'],
                    'appealState': a['appeal_state'],
                    'userClass': appealer_class['class'] if appealer_class else None,
                    'user': appealing_user,
                    'originalAction': original_action,
                    'originalReport': original_report,
                    'priorResponses': responses_list,
                },
                '_created_time': a['created_time']
            }

            # Filter: pending appeals shown to peer reviewers (hierarchical routing)
            if a['appeal_state'] == 'pending':
                if not _should_show_appeal_to_reviewer(appeal_item['data'], str(user.id), a):
                    continue

            # Overruled appeals: ONLY show to the original actioner
            if a['appeal_state'] == 'overruled':
                original_mod_id = (appeal_item['data'].get('originalAction') or {}).get('responder', {}).get('id')
                if str(user.id) != str(original_mod_id):
                    continue

            # Escalated appeals: show to next tier up (hierarchical routing)
            if a['appeal_state'] == 'escalated':
                if not _should_show_escalated_appeal(a, str(user.id)):
                    continue

            queue.append(appeal_item)

    # Sort by created_time (oldest first)
    queue.sort(key=lambda x: x['_created_time'])

    # Remove the _created_time key before returning
    for item in queue:
        del item['_created_time']

    return queue


def report_chat(chat_id, body, token_info=None):  # noqa: E501
    """Report a chat

     # noqa: E501

    :param chat_id:
    :type chat_id: str
    :type chat_id: str
    :param report_position_request:
    :type report_position_request: dict | bytes

    :rtype: Union[Report, Tuple[Report, int], Tuple[Report, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    report_position_request = body
    if connexion.request.is_json:
        report_position_request = ReportPositionRequest.from_dict(connexion.request.get_json())  # noqa: E501

    # Validate chat_log exists and check if user is a participant
    chat_info = db.execute_query("""
        SELECT cl.id, cr.initiator_user_id, up.user_id AS position_holder_user_id
        FROM chat_log cl
        JOIN chat_request cr ON cl.chat_request_id = cr.id
        JOIN user_position up ON cr.user_position_id = up.id
        WHERE cl.id = %s
    """, (chat_id,), fetchone=True)

    if chat_info is None:
        return ErrorModel(400, "Chat not found"), 400

    # Check if user is a participant (either initiator or position holder)
    if str(user.id) != str(chat_info['initiator_user_id']) and str(user.id) != str(chat_info['position_holder_user_id']):
        return ErrorModel(403, "You must be a participant in this chat to report it"), 403

    # Validate rule exists and is active
    rule = db.execute_query("""
        SELECT id FROM rule WHERE id = %s AND status = 'active'
    """, (report_position_request.rule_id,), fetchone=True)

    if rule is None:
        return ErrorModel(400, "Rule not found or inactive"), 400

    # Generate UUID and insert report
    report_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO report (id, target_object_type, target_object_id, submitter_user_id, rule_id, submitter_comment)
        VALUES (%s, 'chat_log', %s, %s, %s, %s)
    """, (
        report_id,
        chat_id,
        user.id,
        report_position_request.rule_id,
        report_position_request.comment
    ))

    # Fetch the created report
    report_row = db.execute_query("""
        SELECT id, target_object_type, target_object_id, submitter_user_id, rule_id, status, submitter_comment
        FROM report WHERE id = %s
    """, (report_id,), fetchone=True)

    return _map_db_report_to_model(report_row), 201


def report_position(position_id, body, token_info=None):  # noqa: E501
    """Report a position statement

     # noqa: E501

    :param position_id:
    :type position_id: str
    :type position_id: str
    :param report_position_request:
    :type report_position_request: dict | bytes

    :rtype: Union[Report, Tuple[Report, int], Tuple[Report, int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    report_position_request = body
    if connexion.request.is_json:
        report_position_request = ReportPositionRequest.from_dict(connexion.request.get_json())  # noqa: E501

    # Validate position exists
    position = db.execute_query("""
        SELECT id FROM position WHERE id = %s
    """, (position_id,), fetchone=True)

    if position is None:
        return ErrorModel(400, "Position not found"), 400

    # Validate rule exists and is active
    rule = db.execute_query("""
        SELECT id FROM rule WHERE id = %s AND status = 'active'
    """, (report_position_request.rule_id,), fetchone=True)

    if rule is None:
        return ErrorModel(400, "Rule not found or inactive"), 400

    # Generate UUID and insert report
    report_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO report (id, target_object_type, target_object_id, submitter_user_id, rule_id, submitter_comment)
        VALUES (%s, 'position', %s, %s, %s, %s)
    """, (
        report_id,
        position_id,
        user.id,
        report_position_request.rule_id,
        report_position_request.comment
    ))

    # Fetch the created report
    report_row = db.execute_query("""
        SELECT id, target_object_type, target_object_id, submitter_user_id, rule_id, status, submitter_comment
        FROM report WHERE id = %s
    """, (report_id,), fetchone=True)

    return _map_db_report_to_model(report_row), 201


def respond_to_appeal(appeal_id, body, token_info=None):  # noqa: E501
    """Respond to a moderation appeal

     # noqa: E501

    :param appeal_id:
    :type appeal_id: str
    :type appeal_id: str
    :param respond_to_appeal_request:
    :type respond_to_appeal_request: dict | bytes

    :rtype: Union[ModActionAppealResponse, Tuple[ModActionAppealResponse, int], Tuple[ModActionAppealResponse, int, Dict[str, str]]
    """
    authorized, auth_err = authorization_scoped("moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    # Access raw JSON body for fields the generated model may not have (e.g. actions)
    raw_body = connexion.request.get_json() if connexion.request.is_json else (body if isinstance(body, dict) else {})

    respond_to_appeal_request = body
    if connexion.request.is_json:
        respond_to_appeal_request = RespondToAppealRequest.from_dict(raw_body)  # noqa: E501

    response_type = raw_body.get('response', getattr(respond_to_appeal_request, 'response', ''))

    # Validate appeal exists and is active
    appeal = db.execute_query("""
        SELECT id, appeal_state, status, mod_action_id
        FROM mod_action_appeal
        WHERE id = %s
    """, (appeal_id,), fetchone=True)

    if appeal is None:
        return ErrorModel(400, "Appeal not found"), 400

    if appeal['status'] != 'active':
        return ErrorModel(400, "Appeal is not active"), 400

    if appeal['appeal_state'] not in ('pending', 'escalated', 'overruled'):
        return ErrorModel(400, "Appeal has already been responded to"), 400

    # Escalated appeals: verify this user is an eligible reviewer (next tier up)
    is_admin = is_admin_anywhere(user.id)
    if appeal['appeal_state'] == 'escalated':
        mod_action_row = db.execute_query("""
            SELECT report_id, responder_user_id FROM mod_action WHERE id = %s
        """, (appeal['mod_action_id'],), fetchone=True)
        if mod_action_row:
            content_loc, content_cat = _get_content_scope(mod_action_row['report_id'])
            actioner_level = _determine_actioner_role_level(
                mod_action_row['responder_user_id'], content_loc, content_cat)
            if actioner_level and content_loc:
                reviewers = _find_appeal_reviewers(
                    actioner_level, content_loc, content_cat,
                    mod_action_row['responder_user_id'])
                if str(user.id) not in reviewers:
                    return ErrorModel(403, "You are not authorized to handle this escalated appeal"), 403
            elif not is_admin:
                return ErrorModel(403, "Only admins can handle escalated appeals"), 403
        elif not is_admin:
            return ErrorModel(403, "Only admins can handle escalated appeals"), 403

    # Overruled appeals can only be handled by the original moderator
    if appeal['appeal_state'] == 'overruled':
        if response_type not in ('accept', 'escalate'):
            return ErrorModel(400, "Overruled appeals can only be accepted or escalated"), 400
        original_mod = db.execute_query("""
            SELECT responder_user_id FROM mod_action WHERE id = %s
        """, (appeal['mod_action_id'],), fetchone=True)
        if not original_mod or str(original_mod['responder_user_id']) != str(user.id):
            return ErrorModel(403, "Only the original moderator can respond to overruled appeals"), 403

    # accept/escalate only valid for overruled appeals
    if response_type in ('accept', 'escalate') and appeal['appeal_state'] != 'overruled':
        return ErrorModel(400, "Accept and escalate are only valid for overruled appeals"), 400

    is_modifying = response_type == 'modify'
    is_approving = response_type == 'approve'

    # Validate modify request has actions
    modify_actions = raw_body.get('actions', [])
    if is_modifying and not modify_actions:
        return ErrorModel(400, "Actions are required when modifying"), 400

    # Determine final appeal state
    if response_type == 'accept':
        # Original mod accepting overruled appeal → final approval
        db_appeal_state = 'approved'
    elif response_type == 'escalate':
        # Original actioner escalating overruled appeal → next tier up reviews
        db_appeal_state = 'escalated'
    elif is_modifying:
        db_appeal_state = 'modified'
    elif not is_approving:
        # Deny: original decision stands regardless of who responds
        db_appeal_state = 'denied'
    elif appeal['appeal_state'] == 'escalated':
        # Escalated appeal: reviewer at next tier has final authority
        db_appeal_state = 'approved'
    else:
        # Pending appeal: peer reviewer approving → overruled, goes to original actioner
        db_appeal_state = 'overruled'

    response_text = raw_body.get('responseText', '') or ''

    # Generate UUID and insert appeal response
    response_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO mod_action_appeal_response (id, mod_action_appeal_id, responder_user_id, appeal_response_text)
        VALUES (%s, %s, %s, %s)
    """, (
        response_id,
        appeal_id,
        user.id,
        response_text
    ))

    # Update the appeal state
    db.execute_query("""
        UPDATE mod_action_appeal
        SET appeal_state = %s, updated_time = CURRENT_TIMESTAMP
        WHERE id = %s
    """, (db_appeal_state, appeal_id))

    # If approved by admin, reverse the original moderation action
    if db_appeal_state == 'approved':
        _reverse_mod_action(appeal['mod_action_id'])

    # If modifying, reverse the original action and apply new ones
    if db_appeal_state == 'modified':
        _reverse_mod_action(appeal['mod_action_id'])

        # Get original report info for target identification
        original_mod = db.execute_query("""
            SELECT report_id FROM mod_action WHERE id = %s
        """, (appeal['mod_action_id'],), fetchone=True)
        if original_mod:
            report = db.execute_query("""
                SELECT target_object_type, target_object_id FROM report WHERE id = %s
            """, (original_mod['report_id'],), fetchone=True)
            if report:
                # Create new mod_action for the modified actions
                new_mod_action_id = str(uuid.uuid4())
                db.execute_query("""
                    INSERT INTO mod_action (id, report_id, responder_user_id, mod_response, mod_response_text)
                    VALUES (%s, %s, %s, 'take_action', %s)
                """, (new_mod_action_id, original_mod['report_id'], user.id, response_text or None))

                # Link the appeal to the replacement action for audit trail
                db.execute_query("""
                    UPDATE mod_action_appeal SET modified_mod_action_id = %s WHERE id = %s
                """, (new_mod_action_id, appeal_id))

                for action_item in modify_actions:
                    action_class_id = str(uuid.uuid4())
                    user_class = action_item.get('userClass', 'submitter')
                    action = action_item.get('action', 'removed')

                    if action == 'temporary_ban':
                        duration = action_item.get('duration', 7)
                        db.execute_query("""
                            INSERT INTO mod_action_class (id, mod_action_id, class, action, action_start_time, action_end_time)
                            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '%s days')
                        """, (action_class_id, new_mod_action_id, user_class, action, duration))
                    else:
                        db.execute_query("""
                            INSERT INTO mod_action_class (id, mod_action_id, class, action, action_start_time)
                            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
                        """, (action_class_id, new_mod_action_id, user_class, action))

                    # Identify and record target users
                    target_user_ids = _get_target_users(
                        user_class, report['target_object_type'], report['target_object_id'],
                        report_id=original_mod['report_id']
                    )
                    for target_user_id in target_user_ids:
                        target_id = str(uuid.uuid4())
                        db.execute_query("""
                            INSERT INTO mod_action_target (id, user_id, mod_action_class_id)
                            VALUES (%s, %s, %s)
                        """, (target_id, target_user_id, action_class_id))

                    # Enforce bans
                    if action in ('permanent_ban', 'temporary_ban'):
                        for target_user_id in target_user_ids:
                            db.execute_query("""
                                UPDATE users SET status = 'banned' WHERE id = %s
                            """, (target_user_id,))
                            invalidate_ban_cache(target_user_id)

                    # Enforce content removal
                    if action == 'removed' and report['target_object_type'] == 'position':
                        db.execute_query("""
                            UPDATE position SET status = 'removed' WHERE id = %s
                        """, (report['target_object_id'],))
                        db.execute_query("""
                            UPDATE user_position SET status = 'removed'
                            WHERE position_id = %s AND status = 'active'
                        """, (report['target_object_id'],))

    # When escalation reviewer resolves an escalated appeal, notify prior responders
    if appeal['appeal_state'] == 'escalated' and db_appeal_state in ('approved', 'denied', 'modified'):
        # Get the original actioner (who took the initial action)
        orig_mod = db.execute_query("""
            SELECT responder_user_id FROM mod_action WHERE id = %s
        """, (appeal['mod_action_id'],), fetchone=True)
        # Get the peer reviewer (first appeal responder who overruled)
        second_mod = db.execute_query("""
            SELECT responder_user_id FROM mod_action_appeal_response
            WHERE mod_action_appeal_id = %s
            ORDER BY created_time ASC LIMIT 1
        """, (appeal_id,), fetchone=True)

        mod_ids_to_notify = set()
        if orig_mod:
            mod_ids_to_notify.add(str(orig_mod['responder_user_id']))
        if second_mod:
            mod_ids_to_notify.add(str(second_mod['responder_user_id']))

        for mod_id in mod_ids_to_notify:
            db.execute_query("""
                INSERT INTO mod_appeal_response_notification (id, mod_action_appeal_id, user_id)
                VALUES (%s, %s, %s)
                ON CONFLICT (mod_action_appeal_id, user_id) DO NOTHING
            """, (str(uuid.uuid4()), appeal_id, mod_id))

    # Build response
    responder = _get_user_card(user.id)

    return ModActionAppealResponse(
        id=response_id,
        mod_action_appeal_id=appeal_id,
        responder=responder,
        appeal_response_text=respond_to_appeal_request.response_text,
        response=respond_to_appeal_request.response
    )


def take_moderator_action(report_id, body, token_info=None):  # noqa: E501
    """Take action on a report

     # noqa: E501

    :param report_id:
    :type report_id: str
    :type report_id: str
    :param mod_action_request:
    :type mod_action_request: dict | bytes

    :rtype: Union[ModAction, Tuple[ModAction, int], Tuple[ModAction, int, Dict[str, str]]
    """
    authorized, auth_err = authorization_scoped("moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    mod_action_request = body
    if connexion.request.is_json:
        mod_action_request = ModActionRequest.from_dict(connexion.request.get_json())  # noqa: E501

    # Validate report exists and is pending
    report = db.execute_query("""
        SELECT id, target_object_type, target_object_id, status
        FROM report
        WHERE id = %s
    """, (report_id,), fetchone=True)

    if report is None:
        return ErrorModel(400, "Report not found"), 400

    if report['status'] != 'pending':
        return ErrorModel(400, "Report has already been processed"), 400

    # Role-based check: moderators cannot action reports against moderators+
    is_admin = is_admin_anywhere(user.id)
    reported_role = _get_reported_user_role(report['target_object_type'], report['target_object_id'])
    role_hierarchy = {'normal': 0, 'moderator': 1, 'admin': 2}
    if not is_admin and role_hierarchy.get(reported_role, 0) >= role_hierarchy['moderator']:
        return ErrorModel(403, "Reports against moderators or admins require admin privileges"), 403
    if is_admin and role_hierarchy.get(reported_role, 0) >= role_hierarchy['admin']:
        reported_ids = _get_reported_user_ids(report['target_object_type'], report['target_object_id'])
        if str(user.id) in reported_ids:
            return ErrorModel(403, "You cannot take action on reports against yourself"), 403

    # Auto-claim if unclaimed
    db.execute_query("""
        UPDATE report SET claimed_by_user_id = %s, claimed_at = CURRENT_TIMESTAMP
        WHERE id = %s AND (claimed_by_user_id IS NULL OR claimed_at < NOW() - INTERVAL '15 minutes')
    """, (str(user.id), report_id))

    # Validate request based on mod_response
    if mod_action_request.mod_response == 'take_action':
        if not mod_action_request.actions or len(mod_action_request.actions) == 0:
            return ErrorModel(400, "Actions are required when taking action"), 400

        # Check for temp bans requiring duration
        for action in mod_action_request.actions:
            if action.action == 'temporary_ban' and (action.duration is None or action.duration <= 0):
                return ErrorModel(400, "Duration is required for temporary bans and must be > 0"), 400

    # Generate UUID and insert mod_action
    mod_action_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO mod_action (id, report_id, responder_user_id, mod_response, mod_response_text)
        VALUES (%s, %s, %s, %s, %s)
    """, (
        mod_action_id,
        report_id,
        user.id,
        mod_action_request.mod_response,
        mod_action_request.mod_response_text
    ))

    # Update report status based on mod_response
    report_status_map = {
        'dismiss': 'dismissed',
        'take_action': 'action_taken',
        'mark_spurious': 'spurious'
    }
    new_report_status = report_status_map[mod_action_request.mod_response]

    db.execute_query("""
        UPDATE report SET status = %s, updated_time = CURRENT_TIMESTAMP WHERE id = %s
    """, (new_report_status, report_id))

    # If taking action, create action classes and targets
    if mod_action_request.mod_response == 'take_action' and mod_action_request.actions:
        for action in mod_action_request.actions:
            # Generate UUID for mod_action_class
            action_class_id = str(uuid.uuid4())

            # Compute action_end_time for temp bans
            if action.action == 'temporary_ban':
                db.execute_query("""
                    INSERT INTO mod_action_class (id, mod_action_id, class, action, action_start_time, action_end_time)
                    VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '%s days')
                """, (
                    action_class_id,
                    mod_action_id,
                    action.user_class,
                    action.action,
                    action.duration
                ))
            else:
                db.execute_query("""
                    INSERT INTO mod_action_class (id, mod_action_id, class, action, action_start_time)
                    VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
                """, (
                    action_class_id,
                    mod_action_id,
                    action.user_class,
                    action.action
                ))

            # Auto-identify target users based on user_class and report target
            target_user_ids = _get_target_users(
                action.user_class,
                report['target_object_type'],
                report['target_object_id'],
                report_id=report_id
            )

            # Insert mod_action_target for each identified user
            for target_user_id in target_user_ids:
                target_id = str(uuid.uuid4())
                db.execute_query("""
                    INSERT INTO mod_action_target (id, user_id, mod_action_class_id)
                    VALUES (%s, %s, %s)
                """, (target_id, target_user_id, action_class_id))

            # Enforce bans on target users
            if action.action in ('permanent_ban', 'temporary_ban'):
                for target_user_id in target_user_ids:
                    db.execute_query("""
                        UPDATE users SET status = 'banned' WHERE id = %s
                    """, (target_user_id,))
                    invalidate_ban_cache(target_user_id)

            # Enforce content removal
            if action.action == 'removed' and report['target_object_type'] == 'position':
                db.execute_query("""
                    UPDATE position SET status = 'removed' WHERE id = %s
                """, (report['target_object_id'],))
                db.execute_query("""
                    UPDATE user_position SET status = 'removed'
                    WHERE position_id = %s AND status = 'active'
                """, (report['target_object_id'],))

    # Build response
    responder = _get_user_card(user.id)

    return ModAction(
        id=mod_action_id,
        report_id=report_id,
        responder=responder,
        mod_response=mod_action_request.mod_response,
        mod_response_text=mod_action_request.mod_response_text
    )


def _get_target_users(user_class, target_object_type, target_object_id, report_id=None):
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
