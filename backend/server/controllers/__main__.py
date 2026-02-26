#!/usr/bin/env python3

import os
import connexion
from flask import request, Response, jsonify
from flask_cors import CORS
import requests

from candid import encoder
from candid.controllers import config
from candid.controllers.helpers.keycloak import validate_token


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

    # Allowed Polis API path prefixes (restrict proxy surface)
    POLIS_ALLOWED_PREFIXES = (
        'participationInit', 'votes', 'comments', 'math/pca2',
        'conversations', 'reports',
    )

    # Add Polis API proxy route (outside of OpenAPI spec to avoid /api/v1 prefix)
    @flask_app.route('/api/v3/<path:path>', methods=['GET', 'POST'])
    def proxy_polis_api(path):
        """Proxy Polis API calls to protect the Polis server from direct exposure."""
        if not config.POLIS_ENABLED:
            return {"error": "Polis is not enabled"}, 404

        # Require JWT authentication
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({"code": 401, "detail": "Authentication required"}), 401
        token = auth_header[7:]
        token_info = validate_token(token)
        if not token_info:
            return jsonify({"code": 401, "detail": "Invalid token"}), 401

        # Validate path: block traversal and restrict to allowed prefixes
        if '..' in path or path.startswith('/'):
            return jsonify({"code": 400, "detail": "Invalid path"}), 400
        if not any(path.startswith(prefix) for prefix in POLIS_ALLOWED_PREFIXES):
            return jsonify({"code": 403, "detail": "Path not allowed"}), 403

        try:
            # Build the Polis API URL
            polis_api_url = f"{config.POLIS_API_URL}/{path}"

            # Forward query string if present
            if request.query_string:
                polis_api_url += f"?{request.query_string.decode('utf-8')}"

            # Forward the request
            if request.method == 'POST':
                response = requests.post(
                    polis_api_url,
                    json=request.get_json(silent=True),
                    headers={'Content-Type': 'application/json'},
                    timeout=config.POLIS_TIMEOUT
                )
            else:
                response = requests.get(polis_api_url, timeout=config.POLIS_TIMEOUT)

            return Response(
                response.content,
                status=response.status_code,
                content_type=response.headers.get('Content-Type', 'application/json')
            )

        except requests.Timeout:
            return {"error": "Polis API request timed out"}, 502
        except requests.RequestException as e:
            print(f"Error proxying Polis API: {e}", flush=True)
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

    return app


def create_wsgi_app():
    """Factory function for gunicorn. Returns the Flask WSGI app."""
    return create_app().app


def main():
    app = create_app()
    app.run(port=8000, host='0.0.0.0')


if __name__ == '__main__':
    main()
