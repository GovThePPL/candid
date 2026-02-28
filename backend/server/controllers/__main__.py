#!/usr/bin/env python3

import logging
import os
import connexion
from flask import request, Response, jsonify
from flask_cors import CORS
import requests

from candid import encoder
from candid.controllers import config
from candid.controllers.helpers.keycloak import validate_token

logger = logging.getLogger(__name__)


def create_app():
    """Create and configure the Connexion/Flask application."""
    app = connexion.App(__name__, specification_dir='./openapi/')
    app.app.json_encoder = encoder.JSONEncoder
    app.add_api('openapi.yaml',
                arguments={'title': 'Candid API'},
                pythonic_params=True)

    flask_app = app.app

    # Add clean report route that Polis JavaScript expects
    @flask_app.route('/report/<conversation_id>')
    def serve_polis_report(conversation_id):
        """Serve Polis report at a clean URL that matches Polis's expected format."""
        from candid.controllers.stats_controller import get_polis_report
        return get_polis_report(conversation_id)

    # Read-only Polis API paths the report bundle needs (GET, no auth).
    # These return only aggregate data — no personal information.
    POLIS_REPORT_PREFIXES = (
        'reports', 'math/pca2', 'math/correlationMatrix',
        'comments', 'conversations', 'ptptois', 'delphi',
    )

    # Proxy Polis API calls through /polis-api/ so they don't collide
    # with our own API.  The report bundle's JS is patched to rewrite
    # /api/v3/ → /polis-api/ (see asset proxy in stats_controller).
    @flask_app.route('/polis-api/<path:path>', methods=['GET'])
    def proxy_polis_api(path):
        """Read-only proxy for Polis API data needed by the report bundle."""
        if not config.POLIS_ENABLED:
            return {"error": "Polis is not enabled"}, 404

        # Validate path
        if '..' in path or path.startswith('/'):
            return jsonify({"code": 400, "detail": "Invalid path"}), 400
        if not any(path.startswith(prefix) for prefix in POLIS_REPORT_PREFIXES):
            return jsonify({"code": 403, "detail": "Path not allowed"}), 403

        try:
            polis_api_url = f"{config.POLIS_API_URL}/{path}"
            if request.query_string:
                polis_api_url += f"?{request.query_string.decode('utf-8')}"

            response = requests.get(polis_api_url, timeout=config.POLIS_TIMEOUT)

            return Response(
                response.content,
                status=response.status_code,
                content_type=response.headers.get('Content-Type', 'application/json')
            )

        except requests.Timeout:
            return {"error": "Polis API request timed out"}, 502
        except requests.RequestException as e:
            logger.error("Error proxying Polis API: %s", e)
            return {"error": "Failed to connect to Polis"}, 502

    # Enable CORS for all routes
    CORS(flask_app, resources={
        r"/.*": {
            "origins": config.CORS_ORIGINS,
            "methods": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With", "User-Agent"],
            "supports_credentials": True
        }
    })

    # Security response headers
    @flask_app.after_request
    def add_security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        if not config.DEV:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        return response

    # Catch-all error handler — prevent internal details from leaking in production
    @flask_app.errorhandler(500)
    def handle_internal_error(e):
        logger.exception("Unhandled server error")
        return jsonify({"code": 500, "detail": "Internal server error"}), 500

    return app


def create_wsgi_app():
    """Factory function for gunicorn. Returns the Flask WSGI app."""
    return create_app().app


def main():
    app = create_app()
    app.run(port=8000, host='0.0.0.0')


if __name__ == '__main__':
    main()
