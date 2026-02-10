import json
import connexion
from typing import Dict, Tuple, Union

from flask import jsonify

from candid.models.error_model import ErrorModel
from candid.models.bug_report import BugReport

from candid.controllers import db
from candid.controllers.helpers.auth import authorization_allow_banned


def create_bug_report(body, token_info=None):
    """Submit a bug report or diagnostics data

    Manual reports (source=user) require a description.
    Auto-reports (source=auto/crash) require errorMetrics.
    Banned users can submit reports.

    :param body: Bug report data
    :type body: dict
    :param token_info: JWT token info
    :type token_info: dict

    :rtype: Union[BugReport, Tuple[ErrorModel, int]]
    """
    authorized, auth_err = authorization_allow_banned("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    user_id = token_info['sub']

    source = body.get('source', 'user')
    description = body.get('description')
    error_metrics = body.get('error_metrics') or body.get('errorMetrics')
    client_context = body.get('client_context') or body.get('clientContext')

    # Validate based on source
    if source == 'user':
        if not description or not description.strip():
            return ErrorModel(400, "Description is required for manual bug reports"), 400
    elif source in ('auto', 'crash'):
        if not error_metrics:
            return ErrorModel(400, "Error metrics are required for auto/crash reports"), 400
    else:
        return ErrorModel(400, "Invalid source. Must be one of: user, auto, crash"), 400

    # Cleanup: delete old reports (30-day retention)
    db.execute_query("""
        DELETE FROM bug_report
        WHERE created_time < NOW() - INTERVAL '30 days'
    """)

    # Cleanup: enforce per-user cap of 50 auto-reports
    if source in ('auto', 'crash'):
        db.execute_query("""
            DELETE FROM bug_report
            WHERE id IN (
                SELECT id FROM bug_report
                WHERE user_id = %s AND source IN ('auto', 'crash')
                ORDER BY created_time DESC
                OFFSET 49
            )
        """, (user_id,))

    # Insert
    result = db.execute_query("""
        INSERT INTO bug_report (user_id, description, error_metrics, client_context, source)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, TO_CHAR(created_time, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_time
    """, (
        user_id,
        description.strip() if description else None,
        json.dumps(error_metrics) if error_metrics else None,
        json.dumps(client_context) if client_context else None,
        source,
    ), fetchone=True)

    return BugReport(
        id=str(result['id']),
        user_id=user_id,
        description=description.strip() if description else None,
        error_metrics=error_metrics,
        client_context=client_context,
        source=source,
        created_time=result['created_time'],
    ), 201
