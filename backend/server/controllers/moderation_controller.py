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
from candid.controllers.helpers.constants import ROLE_HIERARCHY
from candid.controllers.helpers.rate_limiting import check_rate_limit_for
from candid.controllers.helpers.auth import (
    authorization, authorization_allow_banned, authorization_scoped,
    token_to_user, invalidate_ban_cache,
    is_admin_anywhere, is_moderator_anywhere, get_facilitator_scopes,
    is_admin_at_location, is_moderator_at_location,
    get_highest_role_at_location, get_location_ancestors,
)
from candid.controllers.helpers.user_summary import build_user_summary as _build_user_summary
from candid.controllers.helpers.moderation import (
    get_user_card as _get_user_card,
    map_db_report_to_model as _map_db_report_to_model,
    get_user_info as _get_user_info,
    get_reported_user_role as _get_reported_user_role,
    get_reported_user_ids as _get_reported_user_ids,
    get_content_scope as _get_content_scope,
    determine_actioner_role_level as _determine_actioner_role_level,
    find_appeal_reviewers as _find_appeal_reviewers,
    find_peer_reviewers as _find_peer_reviewers,
    can_review_appeal_at_scope as _can_review_appeal_at_scope,
    get_rule_info as _get_rule_info,
    get_target_content as _get_target_content,
    reverse_mod_action as _reverse_mod_action,
    get_user_polis_group as _get_user_polis_group,
    should_show_escalated_appeal as _should_show_escalated_appeal,
    should_show_appeal_to_reviewer as _should_show_appeal_to_reviewer,
    get_admin_response_notifications as _get_admin_response_notifications,
    get_target_users as _get_target_users,
)


def get_user_moderation_history(user_id, token_info=None):  # noqa: E501
    """Get moderation history for a user

     # noqa: E501

    :param user_id:
    :type user_id: str

    :rtype: Union[List[ModerationHistoryEvent], Tuple[List[ModerationHistoryEvent], int]]
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
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
        reporter = _build_user_summary(row.get('submitter_user_id'))

        # Moderator info
        moderator = _build_user_summary(row['responder_user_id'])

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
            appeal_user = _build_user_summary(appeal['user_id'])

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
                    'responder': _build_user_summary(resp['responder_user_id']),
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


def delete_admin_response_notification(appeal_id, token_info=None):
    """Delete an admin response notification."""
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)
    db.execute_query("""
        UPDATE mod_appeal_response_notification SET dismissed = TRUE
        WHERE mod_action_appeal_id = %s AND user_id = %s
    """, (appeal_id, user.id))

    return '', 204


def update_report(report_id, body, token_info=None):  # noqa: E501
    """Update a report (claim or release)

    :param report_id:
    :type report_id: str
    :param body: Request body with claimedBy field
    :type body: dict

    :rtype: Union[dict, Tuple[dict, int]]
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    if connexion.request.is_json:
        body = connexion.request.get_json()

    # Facilitator scope check: verify report is within their scope
    if not is_admin_anywhere(user.id) and not is_moderator_anywhere(user.id):
        scopes = get_facilitator_scopes(user.id)
        if not scopes:
            return ErrorModel(403, "Unauthorized"), 403
        content_loc, content_cat = _get_content_scope(report_id)
        if not content_loc or not content_cat or (content_loc, content_cat) not in scopes:
            return ErrorModel(403, "Report is outside your facilitator scope"), 403

    # Check report exists
    report = db.execute_query("""
        SELECT id, claimed_by_user_id, claimed_at FROM report WHERE id = %s
    """, (report_id,), fetchone=True)

    if report is None:
        return ErrorModel(400, "Report not found"), 400

    claimed_by = body.get('claimedBy')

    if claimed_by is not None:
        # Claiming the report
        if (report['claimed_by_user_id'] is not None
                and str(report['claimed_by_user_id']) != str(claimed_by)):
            from datetime import datetime, timezone, timedelta
            if report['claimed_at'] and report['claimed_at'].replace(tzinfo=timezone.utc) > datetime.now(timezone.utc) - timedelta(minutes=15):
                return ErrorModel(409, "Report is already claimed by another moderator"), 409

        db.execute_query("""
            UPDATE report SET claimed_by_user_id = %s, claimed_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (str(claimed_by), report_id))

        return {
            'status': 'claimed',
            'claimedBy': str(claimed_by),
        }
    else:
        # Releasing the report
        db.execute_query("""
            UPDATE report SET claimed_by_user_id = NULL, claimed_at = NULL
            WHERE id = %s
        """, (report_id,))

        return {'status': 'released', 'claimedBy': None}


def get_moderation_queue(token_info=None):  # noqa: E501
    """Get unified moderation queue with all items requiring moderator attention

     # noqa: E501


    :rtype: Union[List[GetModerationQueue200ResponseInner], Tuple[List[GetModerationQueue200ResponseInner], int], Tuple[List[GetModerationQueue200ResponseInner], int, Dict[str, str]]
    """
    authorized, auth_err = authorization_scoped("facilitator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)
    is_admin = is_admin_anywhere(user.id)
    is_mod = is_moderator_anywhere(user.id)

    # Determine facilitator scopes (None = no facilitator filtering for admin/mod)
    facilitator_scopes = None
    if not is_admin and not is_mod:
        facilitator_scopes = get_facilitator_scopes(user.id)
        if not facilitator_scopes:
            return []

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
    role_hierarchy = ROLE_HIERARCHY
    if reports:
        for r in reports:
            # Role-based routing: determine reported user's role
            reported_role = _get_reported_user_role(r['target_object_type'], r['target_object_id'])
            reported_role_level = role_hierarchy.get(reported_role, 0)

            # Facilitator scope filtering
            if facilitator_scopes is not None:
                # Facilitators cannot moderate facilitator+ users
                if reported_role_level >= role_hierarchy['facilitator']:
                    continue
                # Must match exact location+category scope
                content_loc, content_cat = _get_content_scope(r['id'])
                if not content_loc or not content_cat:
                    continue
                if (content_loc, content_cat) not in facilitator_scopes:
                    continue
            else:
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

    # Rate limit reports (all report types share one key per user)
    allowed, _ = check_rate_limit_for(str(user.id), "report")
    if not allowed:
        return ErrorModel(429, "Rate limit exceeded"), 429

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

    # Rate limit reports (all report types share one key per user)
    allowed, _ = check_rate_limit_for(str(user.id), "report")
    if not allowed:
        return ErrorModel(429, "Rate limit exceeded"), 429

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


def report_post(post_id, body, token_info=None):  # noqa: E501
    """Report a post."""
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    # Rate limit reports (all report types share one key per user)
    allowed, _ = check_rate_limit_for(str(user.id), "report")
    if not allowed:
        return ErrorModel(429, "Rate limit exceeded"), 429

    report_request = body
    if connexion.request.is_json:
        report_request = ReportPositionRequest.from_dict(connexion.request.get_json())

    # Validate post exists
    post = db.execute_query(
        "SELECT id FROM post WHERE id = %s AND status IN ('active', 'locked')",
        (post_id,), fetchone=True,
    )
    if post is None:
        return ErrorModel(400, "Post not found"), 400

    # Validate rule exists and is active
    rule = db.execute_query(
        "SELECT id FROM rule WHERE id = %s AND status = 'active'",
        (report_request.rule_id,), fetchone=True,
    )
    if rule is None:
        return ErrorModel(400, "Rule not found or inactive"), 400

    report_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO report (id, target_object_type, target_object_id, submitter_user_id, rule_id, submitter_comment)
        VALUES (%s, 'post', %s, %s, %s, %s)
    """, (
        report_id,
        post_id,
        user.id,
        report_request.rule_id,
        report_request.comment,
    ))

    report_row = db.execute_query("""
        SELECT id, target_object_type, target_object_id, submitter_user_id, rule_id, status, submitter_comment
        FROM report WHERE id = %s
    """, (report_id,), fetchone=True)

    return _map_db_report_to_model(report_row), 201


def report_comment(comment_id, body, token_info=None):  # noqa: E501
    """Report a comment."""
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    # Rate limit reports (all report types share one key per user)
    allowed, _ = check_rate_limit_for(str(user.id), "report")
    if not allowed:
        return ErrorModel(429, "Rate limit exceeded"), 429

    report_request = body
    if connexion.request.is_json:
        report_request = ReportPositionRequest.from_dict(connexion.request.get_json())

    # Validate comment exists
    comment = db.execute_query(
        "SELECT id FROM comment WHERE id = %s AND status = 'active'",
        (comment_id,), fetchone=True,
    )
    if comment is None:
        return ErrorModel(400, "Comment not found"), 400

    # Validate rule exists and is active
    rule = db.execute_query(
        "SELECT id FROM rule WHERE id = %s AND status = 'active'",
        (report_request.rule_id,), fetchone=True,
    )
    if rule is None:
        return ErrorModel(400, "Rule not found or inactive"), 400

    report_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO report (id, target_object_type, target_object_id, submitter_user_id, rule_id, submitter_comment)
        VALUES (%s, 'comment', %s, %s, %s, %s)
    """, (
        report_id,
        comment_id,
        user.id,
        report_request.rule_id,
        report_request.comment,
    ))

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
    authorized, auth_err = authorization_scoped("facilitator", token_info)
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
    authorized, auth_err = authorization_scoped("facilitator", token_info)
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

    # Role-based check with 4-tier hierarchy
    is_admin = is_admin_anywhere(user.id)
    is_mod = is_moderator_anywhere(user.id)
    reported_role = _get_reported_user_role(report['target_object_type'], report['target_object_id'])
    role_hierarchy = ROLE_HIERARCHY

    # Facilitator scope check
    if not is_admin and not is_mod:
        scopes = get_facilitator_scopes(user.id)
        if not scopes:
            return ErrorModel(403, "Unauthorized"), 403
        content_loc, content_cat = _get_content_scope(report_id)
        if not content_loc or not content_cat or (content_loc, content_cat) not in scopes:
            return ErrorModel(403, "Report is outside your facilitator scope"), 403
        # Facilitators cannot action reports against facilitator+ users
        if role_hierarchy.get(reported_role, 0) >= role_hierarchy['facilitator']:
            return ErrorModel(403, "Reports against facilitators or above require higher privileges"), 403
    elif not is_admin and role_hierarchy.get(reported_role, 0) >= role_hierarchy['moderator']:
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
