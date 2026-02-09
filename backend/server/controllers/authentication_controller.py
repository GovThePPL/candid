import re
import logging
import connexion
import requests as http_requests

from candid.controllers.helpers import keycloak
from candid.controllers import config  # initialized Config object

logger = logging.getLogger(__name__)


def get_token():
    """Proxy ROPC token request to Keycloak (avoids browser CORS issues)."""
    body = connexion.request.get_json()
    if not body:
        return {"detail": "Request body is required"}, 400

    username = body.get("username", "")
    password = body.get("password", "")

    if not username or not password:
        return {"detail": "Username and password are required"}, 400

    token_url = f"{config.KEYCLOAK_URL}/realms/{config.KEYCLOAK_REALM}/protocol/openid-connect/token"
    resp = http_requests.post(token_url, data={
        "grant_type": "password",
        "client_id": "candid-app",
        "username": username,
        "password": password,
        "scope": "openid profile email",
    }, timeout=10)

    if resp.status_code == 401 or resp.status_code == 400:
        error_data = resp.json()
        if error_data.get("error") == "invalid_grant":
            return {"detail": "Invalid username or password"}, 401
        return {"detail": error_data.get("error_description", "Authentication failed")}, 401

    resp.raise_for_status()
    data = resp.json()

    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token"),
    }, 200


def register_user():
    """Register a new user account via Keycloak Admin REST API."""
    body = connexion.request.get_json()
    if not body:
        return {"detail": "Request body is required"}, 400

    username = (body.get("username") or "").strip()
    email = (body.get("email") or "").strip()
    password = body.get("password") or ""

    # Validate required fields
    errors = []
    if not username or len(username) < 3:
        errors.append("Username must be at least 3 characters")
    if not email or not re.match(r"[^@]+@[^@]+\.[^@]+", email):
        errors.append("A valid email is required")
    if len(password) < 8:
        errors.append("Password must be at least 8 characters")

    if errors:
        return {"detail": "; ".join(errors)}, 400

    try:
        keycloak.create_user(
            username=username,
            email=email,
            password=password,
            raise_on_conflict=True,
        )
        return {"message": "User created"}, 201
    except ValueError as e:
        return {"detail": str(e)}, 409
    except Exception as e:
        logger.error(f"Registration failed: {e}")
        return {"detail": "Registration failed"}, 500
