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
from candid.controllers.helpers.auth import authorization, token_to_user
from camel_converter import dict_to_camel


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
        return User.from_dict(dict_to_camel(user))
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


def get_moderation_queue(token_info=None):  # noqa: E501
    """Get unified moderation queue with all items requiring moderator attention

     # noqa: E501


    :rtype: Union[List[GetModerationQueue200ResponseInner], Tuple[List[GetModerationQueue200ResponseInner], int], Tuple[List[GetModerationQueue200ResponseInner], int, Dict[str, str]]
    """
    authorized, auth_err = authorization("moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    # Get pending reports
    reports = db.execute_query("""
        SELECT id, target_object_type, target_object_id, submitter_user_id,
               rule_id, status, submitter_comment, created_time
        FROM report
        WHERE status = 'pending'
        ORDER BY created_time ASC
    """)

    # Get active pending appeals
    appeals = db.execute_query("""
        SELECT id, user_id, mod_action_id, appeal_text, appeal_state, created_time
        FROM mod_action_appeal
        WHERE status = 'active' AND appeal_state = 'pending'
        ORDER BY created_time ASC
    """)

    queue = []

    # Add reports to queue
    if reports:
        for r in reports:
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
                },
                '_created_time': r['created_time']
            })

    # Add appeals to queue
    if appeals:
        for a in appeals:
            queue.append({
                'type': 'appeal',
                'data': {
                    'id': str(a['id']),
                    'userId': str(a['user_id']),
                    'modActionId': str(a['mod_action_id']),
                    'appealText': a['appeal_text'],
                    'appealState': a['appeal_state'],
                },
                '_created_time': a['created_time']
            })

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
    authorized, auth_err = authorization("moderator", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user = token_to_user(token_info)

    respond_to_appeal_request = body
    if connexion.request.is_json:
        respond_to_appeal_request = RespondToAppealRequest.from_dict(connexion.request.get_json())  # noqa: E501

    # Validate appeal exists, is active, and pending
    appeal = db.execute_query("""
        SELECT id, appeal_state, status
        FROM mod_action_appeal
        WHERE id = %s
    """, (appeal_id,), fetchone=True)

    if appeal is None:
        return ErrorModel(400, "Appeal not found"), 400

    if appeal['status'] != 'active':
        return ErrorModel(400, "Appeal is not active"), 400

    if appeal['appeal_state'] != 'pending':
        return ErrorModel(400, "Appeal has already been responded to"), 400

    # Map API response to DB state: approve -> approved, deny -> denied
    db_appeal_state = 'approved' if respond_to_appeal_request.response == 'approve' else 'denied'

    # Generate UUID and insert appeal response
    response_id = str(uuid.uuid4())
    db.execute_query("""
        INSERT INTO mod_action_appeal_response (id, mod_action_appeal_id, responder_user_id, appeal_response_text)
        VALUES (%s, %s, %s, %s)
    """, (
        response_id,
        appeal_id,
        user.id,
        respond_to_appeal_request.response_text
    ))

    # Update the appeal state
    db.execute_query("""
        UPDATE mod_action_appeal
        SET appeal_state = %s, updated_time = CURRENT_TIMESTAMP
        WHERE id = %s
    """, (db_appeal_state, appeal_id))

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
    authorized, auth_err = authorization("moderator", token_info)
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
                report['target_object_id']
            )

            # Insert mod_action_target for each identified user
            for target_user_id in target_user_ids:
                target_id = str(uuid.uuid4())
                db.execute_query("""
                    INSERT INTO mod_action_target (id, user_id, mod_action_class_id)
                    VALUES (%s, %s, %s)
                """, (target_id, target_user_id, action_class_id))

    # Build response
    responder = _get_user_card(user.id)

    return ModAction(
        id=mod_action_id,
        report_id=report_id,
        responder=responder,
        mod_response=mod_action_request.mod_response,
        mod_response_text=mod_action_request.mod_response_text
    )


def _get_target_users(user_class, target_object_type, target_object_id):
    """
    Auto-identify target users based on user_class and the report's target.

    For position reports:
    - submitter: the creator of the position
    - active_adopter: users with active user_position for this position
    - passive_adopter: users with non-active user_position for this position

    For chat_log reports:
    - submitter: both chat participants (initiator and position holder)
    - active_adopter/passive_adopter: no targets (chats don't have adopters)
    """
    user_ids = []

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
