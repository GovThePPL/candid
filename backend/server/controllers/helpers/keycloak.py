"""
Keycloak integration helpers.

- validate_token(): RS256 JWKS validation for incoming bearer tokens
- Admin REST API helpers for seed script user creation
- Auto-registration: if Keycloak token is valid but no users row, create one
- Bootstrap: Keycloak 'admin' realm role auto-creates admin at root location
"""

import logging
import requests
from jwt import PyJWKClient, decode as jwt_decode
from jwt.exceptions import PyJWTError

from candid.controllers import config, db

logger = logging.getLogger(__name__)

# JWKS client with caching (PyJWT handles key rotation automatically)
_jwks_client = None


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{config.KEYCLOAK_URL}/realms/{config.KEYCLOAK_REALM}/protocol/openid-connect/certs"
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True)
    return _jwks_client


# Map Keycloak realm roles to Candid user_type
_ROLE_PRIORITY = {"admin": 4, "moderator": 3, "normal": 2, "guest": 1}


def _extract_role(token_payload):
    """Extract the highest-priority Candid role from Keycloak realm roles."""
    realm_access = token_payload.get("realm_access", {})
    roles = realm_access.get("roles", [])
    best_role = "normal"  # default
    best_priority = 0
    for role in roles:
        p = _ROLE_PRIORITY.get(role, 0)
        if p > best_priority:
            best_priority = p
            best_role = role
    return best_role


def _map_keycloak_role_to_user_type(keycloak_role):
    """Map Keycloak realm role to user_type (only 'normal' or 'guest')."""
    if keycloak_role == "guest":
        return "guest"
    return "normal"  # admin, moderator, normal all map to 'normal'


def _ensure_root_admin_role(user_id):
    """Auto-create admin role at root location if not already present.

    Called when a Keycloak user with 'admin' realm role logs in.
    """
    from candid.controllers.helpers.auth import get_root_location_id
    root_id = get_root_location_id()
    if not root_id:
        logger.warning("No root location found — cannot auto-create admin role")
        return

    existing = db.execute_query("""
        SELECT 1 FROM user_role
        WHERE user_id = %s AND role = 'admin' AND location_id = %s
        LIMIT 1
    """, (str(user_id), root_id), fetchone=True)

    if not existing:
        db.execute_query("""
            INSERT INTO user_role (user_id, role, location_id)
            VALUES (%s, 'admin', %s)
        """, (str(user_id), root_id))
        logger.info(f"Auto-created admin role at root location for user {user_id}")


def validate_token(token):
    """
    Validate a Keycloak RS256 JWT and return token info dict.

    Returns {'sub': candid_user_uuid} on success (for compatibility with
    the existing authorization() system which reads token_info['sub']).

    If the Keycloak user doesn't have a Candid users row yet, auto-creates one.
    If the Keycloak user has 'admin' realm role, auto-creates admin at root location.

    Returns None on any validation failure.
    """
    try:
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        payload = jwt_decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},  # Keycloak tokens use azp, not aud
        )

        keycloak_id = payload.get("sub")
        if not keycloak_id:
            return None

        keycloak_role = _extract_role(payload)

        # Look up user by keycloak_id
        user = db.execute_query(
            "SELECT id FROM users WHERE keycloak_id = %s",
            (keycloak_id,), fetchone=True
        )

        if user:
            # Bootstrap: ensure admin at root for Keycloak admin users
            if keycloak_role == "admin":
                _ensure_root_admin_role(user["id"])
            return {"sub": str(user["id"])}

        # Auto-register or link: create Candid user or link existing one
        username = payload.get("preferred_username", keycloak_id)
        email = payload.get("email")
        display_name = payload.get("name") or username
        user_type = _map_keycloak_role_to_user_type(keycloak_role)

        # Try linking an existing user by username first (e.g. pre-seeded users)
        linked_user = db.execute_query("""
            UPDATE users SET keycloak_id = %s
            WHERE username = %s AND keycloak_id IS NULL
            RETURNING id
        """, (keycloak_id, username), fetchone=True)

        if linked_user:
            logger.info(f"Linked existing user {username} to keycloak_id={keycloak_id}")
            if keycloak_role == "admin":
                _ensure_root_admin_role(linked_user["id"])
            return {"sub": str(linked_user["id"])}

        # Create a new user
        new_user = db.execute_query("""
            INSERT INTO users (username, email, keycloak_id, display_name, user_type)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
        """, (username, email, keycloak_id, display_name, user_type), fetchone=True)

        if new_user:
            logger.info(f"Auto-registered user {username} (keycloak_id={keycloak_id})")
            if keycloak_role == "admin":
                _ensure_root_admin_role(new_user["id"])
            return {"sub": str(new_user["id"])}

        return None

    except PyJWTError as e:
        logger.warning(f"Token validation failed: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error validating token: {e}")
        return None


# ========== Admin REST API helpers (for seed script) ==========

def get_admin_token():
    """Get an admin access token using candid-backend service account client credentials."""
    token_url = f"{config.KEYCLOAK_URL}/realms/{config.KEYCLOAK_REALM}/protocol/openid-connect/token"
    resp = requests.post(token_url, data={
        "grant_type": "client_credentials",
        "client_id": config.KEYCLOAK_BACKEND_CLIENT_ID,
        "client_secret": config.KEYCLOAK_BACKEND_CLIENT_SECRET,
    }, timeout=10)
    resp.raise_for_status()
    return resp.json()["access_token"]


def create_user(username, email, password, display_name=None, roles=None, raise_on_conflict=False):
    """Create a user in Keycloak via Admin REST API. Returns the Keycloak user ID.

    If raise_on_conflict is True and the user already exists (409), raises ValueError.
    Otherwise silently returns the existing user's ID.
    """
    admin_token = get_admin_token()
    base = f"{config.KEYCLOAK_URL}/admin/realms/{config.KEYCLOAK_REALM}"
    headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

    # Keycloak 26 User Profile requires firstName and lastName
    first_name = username
    last_name = "User"
    if display_name:
        name_parts = display_name.rsplit(" ", 1)
        first_name = name_parts[0] if len(name_parts) > 1 else display_name
        last_name = name_parts[1] if len(name_parts) > 1 else "User"

    user_data = {
        "username": username,
        "email": email,
        "emailVerified": True,
        "enabled": True,
        "firstName": first_name,
        "lastName": last_name,
        "credentials": [{
            "type": "password",
            "value": password,
            "temporary": False,
        }],
        "requiredActions": [],
    }
    resp = requests.post(f"{base}/users", json=user_data, headers=headers, timeout=10)

    if resp.status_code == 409:
        if raise_on_conflict:
            raise ValueError("Username or email already exists")
        # User already exists - look up their ID
        existing = get_user_by_username(username)
        return existing

    resp.raise_for_status()

    # Get the created user's ID from Location header
    location = resp.headers.get("Location", "")
    keycloak_user_id = location.split("/")[-1]

    # Assign realm roles if specified
    if roles:
        _assign_roles(keycloak_user_id, roles, admin_token, base, headers)

    return keycloak_user_id


def _assign_roles(user_id, role_names, admin_token, base, headers):
    """Assign realm roles to a Keycloak user."""
    # Get available realm roles
    resp = requests.get(f"{base}/roles", headers=headers, timeout=10)
    resp.raise_for_status()
    all_roles = resp.json()

    roles_to_assign = [r for r in all_roles if r["name"] in role_names]
    if roles_to_assign:
        requests.post(
            f"{base}/users/{user_id}/role-mappings/realm",
            json=roles_to_assign, headers=headers, timeout=10
        )


def get_user_by_username(username):
    """Look up a Keycloak user by username. Returns the Keycloak user ID or None."""
    admin_token = get_admin_token()
    base = f"{config.KEYCLOAK_URL}/admin/realms/{config.KEYCLOAK_REALM}"
    headers = {"Authorization": f"Bearer {admin_token}"}

    resp = requests.get(f"{base}/users", params={"username": username, "exact": "true"},
                        headers=headers, timeout=10)
    resp.raise_for_status()
    users = resp.json()
    if users:
        return users[0]["id"]
    return None


def delete_user(keycloak_user_id):
    """Delete a user from Keycloak via Admin REST API."""
    admin_token = get_admin_token()
    base = f"{config.KEYCLOAK_URL}/admin/realms/{config.KEYCLOAK_REALM}"
    headers = {"Authorization": f"Bearer {admin_token}"}

    resp = requests.delete(f"{base}/users/{keycloak_user_id}", headers=headers, timeout=10)
    if resp.status_code == 404:
        logger.warning(f"Keycloak user {keycloak_user_id} not found for deletion")
        return
    resp.raise_for_status()
