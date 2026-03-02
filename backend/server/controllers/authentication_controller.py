import re
import logging
import connexion
import requests as http_requests
import jwt
import time

from candid.controllers.helpers import keycloak
from candid.controllers.helpers import social_auth
from candid.controllers.helpers import sms
from candid.controllers.helpers.email_validation import (
    validate_email_for_registration, is_disposable_domain, normalize_email,
)
from candid.controllers import config, db
from candid.controllers.helpers.rate_limiting import check_rate_limit_for

logger = logging.getLogger(__name__)


def get_token():
    """Proxy ROPC token request to Keycloak (avoids browser CORS issues)."""
    # Rate limit by IP
    client_ip = connexion.request.remote_addr or "unknown"
    allowed, _ = check_rate_limit_for(client_ip, "login")
    if not allowed:
        return {"detail": "Too many login attempts. Please try again later."}, 429

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

    if resp.status_code in (400, 401):
        error_data = resp.json()
        if error_data.get("error") == "invalid_grant":
            return {"detail": "Invalid username or password"}, 401
        return {"detail": error_data.get("error_description", "Authentication failed")}, 401

    try:
        resp.raise_for_status()
    except http_requests.HTTPError:
        logger.error(f"Keycloak returned {resp.status_code} during login")
        return {"detail": "Authentication service unavailable"}, 502

    data = resp.json()

    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token"),
    }, 200


def refresh_token():
    """Proxy token refresh to Keycloak (keeps issuer consistent with login proxy)."""
    client_ip = connexion.request.remote_addr or "unknown"
    allowed, _ = check_rate_limit_for(client_ip, "refresh")
    if not allowed:
        return {"detail": "Too many refresh attempts. Please try again later."}, 429

    body = connexion.request.get_json()
    if not body:
        return {"detail": "Request body is required"}, 400

    refresh = body.get("refresh_token", "")
    if not refresh:
        return {"detail": "refresh_token is required"}, 400

    token_url = f"{config.KEYCLOAK_URL}/realms/{config.KEYCLOAK_REALM}/protocol/openid-connect/token"
    resp = http_requests.post(token_url, data={
        "grant_type": "refresh_token",
        "client_id": "candid-app",
        "refresh_token": refresh,
    }, timeout=10)

    if resp.status_code in (400, 401):
        return {"detail": "Refresh token expired or invalid"}, 401

    try:
        resp.raise_for_status()
    except http_requests.HTTPError:
        logger.error(f"Keycloak returned {resp.status_code} during token refresh")
        return {"detail": "Authentication service unavailable"}, 502

    data = resp.json()

    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token"),
    }, 200


def logout_token():
    """Proxy session logout to Keycloak (keeps issuer consistent)."""
    client_ip = connexion.request.remote_addr or "unknown"
    allowed, _ = check_rate_limit_for(client_ip, "logout")
    if not allowed:
        return {"detail": "Too many logout attempts. Please try again later."}, 429

    body = connexion.request.get_json()
    if not body:
        return "", 204

    refresh = body.get("refresh_token", "")
    if not refresh:
        return "", 204

    logout_url = f"{config.KEYCLOAK_URL}/realms/{config.KEYCLOAK_REALM}/protocol/openid-connect/logout"
    try:
        http_requests.post(logout_url, data={
            "client_id": "candid-app",
            "refresh_token": refresh,
        }, timeout=10)
    except Exception:
        pass  # Best-effort — local cleanup on the client is what matters

    return "", 204


def social_login(body):
    """Exchange a social identity token (Apple/Google) for Candid tokens."""
    # Rate limit by IP
    client_ip = connexion.request.remote_addr or "unknown"
    allowed, _ = check_rate_limit_for(client_ip, "social_login")
    if not allowed:
        return {"detail": "Too many login attempts. Please try again later."}, 429

    body = connexion.request.get_json()
    if not body:
        return {"detail": "Request body is required"}, 400

    provider = body.get("provider", "")
    identity_token = body.get("identityToken", "")
    user_info = body.get("userInfo") or {}

    if provider not in ("apple", "google"):
        return {"detail": "Provider must be 'apple' or 'google'"}, 400
    if not identity_token:
        return {"detail": "identityToken is required"}, 400

    # 1. Validate the identity token against the provider's JWKS
    try:
        if provider == "google":
            claims = social_auth.validate_google_token(identity_token)
        else:
            claims = social_auth.validate_apple_token(identity_token)
    except ValueError as e:
        logger.warning(f"Social login token validation failed ({provider}): {e}")
        return {"detail": str(e)}, 401

    provider_sub = claims["sub"]
    email = claims.get("email") or user_info.get("email")
    display_name = claims.get("name") or user_info.get("displayName")

    # Check disposable email
    if email and "@" in email:
        domain = email.rsplit("@", 1)[1]
        if is_disposable_domain(domain):
            return {"detail": "Disposable email addresses are not allowed. Please use a permanent email."}, 400

    # 2. Check if user already exists (by federated identity or email in Candid DB)
    existing_kc_id = keycloak.find_user_by_federated_identity(provider, provider_sub)
    if not existing_kc_id and email:
        existing_kc_id = keycloak.find_user_by_email(email)

    if existing_kc_id:
        # Existing user — link identity if needed and return tokens
        if not keycloak.find_user_by_federated_identity(provider, provider_sub):
            keycloak.add_federated_identity_link(
                existing_kc_id, provider, provider_sub, email or provider_sub,
            )
        try:
            tokens = keycloak.exchange_for_user_tokens(existing_kc_id)
        except http_requests.HTTPError as e:
            logger.error(f"Token exchange failed for {existing_kc_id}: {e}")
            return {"detail": "Authentication service unavailable"}, 502

        return {
            "access_token": tokens["access_token"],
            "refresh_token": tokens.get("refresh_token"),
        }, 200

    # 3. New user — check if phone verification is required
    if config.SMS_VERIFICATION_ENABLED:
        # Return 202 with a pending token; frontend must complete phone verification
        pending_token = jwt.encode(
            {
                "provider": provider,
                "provider_sub": provider_sub,
                "email": email,
                "display_name": display_name,
                "exp": int(time.time()) + 600,  # 10 min
            },
            config.SECRET_KEY,
            algorithm="HS256",
        )
        return {
            "phoneVerificationRequired": True,
            "pendingToken": pending_token,
        }, 202

    # SMS disabled — create user immediately (original flow)
    try:
        kc_user_id = keycloak.create_social_user(
            provider=provider,
            provider_user_id=provider_sub,
            email=email,
            display_name=display_name,
        )
    except Exception as e:
        logger.error(f"Social user creation failed ({provider}): {e}")
        return {"detail": "Account creation failed"}, 502

    try:
        tokens = keycloak.exchange_for_user_tokens(kc_user_id)
    except http_requests.HTTPError as e:
        logger.error(f"Token exchange failed for {kc_user_id}: {e}")
        return {"detail": "Authentication service unavailable"}, 502

    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token"),
    }, 200


def create_social_registration(body):
    """Create a social registration — completes social signup after phone verification."""
    client_ip = connexion.request.remote_addr or "unknown"
    allowed, _ = check_rate_limit_for(client_ip, "register")
    if not allowed:
        return {"detail": "Too many registration attempts. Please try again later."}, 429

    body = connexion.request.get_json()
    if not body:
        return {"detail": "Request body is required"}, 400

    pending_token = body.get("pendingToken", "")
    phone_number = body.get("phoneNumber", "")
    phone_verify_token = body.get("phoneVerifyToken", "")

    if not pending_token or not phone_number or not phone_verify_token:
        return {"detail": "pendingToken, phoneNumber, and phoneVerifyToken are required"}, 400

    # Validate the pending JWT
    try:
        pending = jwt.decode(pending_token, config.SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return {"detail": "Pending social login has expired. Please try again."}, 400
    except jwt.InvalidTokenError:
        return {"detail": "Invalid pending token"}, 400

    # Validate phone verification
    valid, normalized_or_err = sms.check_phone_verified(phone_number, phone_verify_token)
    if not valid:
        return {"detail": normalized_or_err}, 400

    normalized_phone = normalized_or_err

    # Check phone uniqueness
    if sms.is_phone_registered(phone_number):
        return {"detail": "This phone number is already associated with an account"}, 409

    # Create the Keycloak user
    provider = pending["provider"]
    provider_sub = pending["provider_sub"]
    email = pending.get("email")
    display_name = pending.get("display_name")

    try:
        kc_user_id = keycloak.create_social_user(
            provider=provider,
            provider_user_id=provider_sub,
            email=email,
            display_name=display_name,
        )
    except Exception as e:
        logger.error(f"Social user creation failed ({provider}): {e}")
        return {"detail": "Account creation failed"}, 502

    # Pre-create Candid DB user with phone + normalized email
    normalized = normalize_email(email) if email else None
    username = email.split("@")[0] if email else f"{provider}_{provider_sub[:8]}"
    username = f"{provider}_{username}"

    # Get Keycloak ID for the user
    try:
        db.execute_query("""
            INSERT INTO users (username, email, keycloak_id, display_name, phone_number, phone_verified, normalized_email)
            VALUES (%s, %s, %s, %s, %s, true, %s)
            ON CONFLICT (keycloak_id) DO UPDATE SET phone_number = %s, phone_verified = true, normalized_email = %s
        """, (username, email, kc_user_id, display_name, normalized_phone, normalized,
              normalized_phone, normalized))
    except Exception as e:
        logger.error(f"Failed to create Candid user for social registration: {e}")
        # Continue — auto-registration in validate_token will create the user on first login

    # Exchange for tokens
    try:
        tokens = keycloak.exchange_for_user_tokens(kc_user_id)
    except http_requests.HTTPError as e:
        logger.error(f"Token exchange failed for {kc_user_id}: {e}")
        return {"detail": "Authentication service unavailable"}, 502

    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token"),
    }, 200


def register_user():
    """Register a new user account via Keycloak Admin REST API."""
    # Rate limit by IP
    client_ip = connexion.request.remote_addr or "unknown"
    allowed, _ = check_rate_limit_for(client_ip, "register")
    if not allowed:
        return {"detail": "Too many registration attempts. Please try again later."}, 429

    body = connexion.request.get_json()
    if not body:
        return {"detail": "Request body is required"}, 400

    username = (body.get("username") or "").strip()
    email = (body.get("email") or "").strip()
    password = body.get("password") or ""
    phone_number = (body.get("phoneNumber") or "").strip()
    phone_verify_token = (body.get("phoneVerifyToken") or "").strip()

    # Validate required fields
    errors = []
    if not username or len(username) < 3:
        errors.append("Username must be at least 3 characters")
    if config.EMAIL_REQUIRED:
        if not email or not re.match(r"[^@]+@[^@]+\.[^@]+", email):
            errors.append("A valid email is required")
    elif email and not re.match(r"[^@]+@[^@]+\.[^@]+", email):
        errors.append("A valid email is required")
    if len(password) < 8:
        errors.append("Password must be at least 8 characters")

    if errors:
        return {"detail": "; ".join(errors)}, 400

    # Email validation (disposable + normalized uniqueness) — only when email is provided
    if email:
        ok, email_err = validate_email_for_registration(email)
        if not ok:
            return {"detail": email_err}, 400

    # Phone verification (when enabled)
    normalized_phone = None
    if config.SMS_VERIFICATION_ENABLED:
        if not phone_number or not phone_verify_token:
            return {"detail": "Phone verification is required"}, 400

        valid, result = sms.check_phone_verified(phone_number, phone_verify_token)
        if not valid:
            return {"detail": result}, 400
        normalized_phone = result

        # Check phone uniqueness
        if sms.is_phone_registered(phone_number):
            return {"detail": "This phone number is already associated with an account"}, 409

    try:
        kc_user_id = keycloak.create_user(
            username=username,
            email=email,
            password=password,
            raise_on_conflict=True,
        )
    except ValueError as e:
        return {"detail": str(e)}, 409
    except Exception as e:
        logger.error(f"Registration failed: {e}")
        return {"detail": "Registration failed"}, 500

    # Pre-create Candid DB user with phone + normalized email
    normalized = normalize_email(email) if email else None
    try:
        db.execute_query("""
            INSERT INTO users (username, email, keycloak_id, display_name, phone_number, phone_verified, normalized_email)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (keycloak_id) DO UPDATE SET
                phone_number = EXCLUDED.phone_number,
                phone_verified = EXCLUDED.phone_verified,
                normalized_email = EXCLUDED.normalized_email
        """, (username, email or None, kc_user_id, username, normalized_phone,
              normalized_phone is not None, normalized))
    except Exception as e:
        logger.error(f"Failed to pre-create Candid user: {e}")
        # Continue — auto-registration in validate_token will create the user on first login

    return {"message": "User created"}, 201


def create_phone_verification(body):
    """Create a phone verification — sends an SMS code."""
    client_ip = connexion.request.remote_addr or "unknown"

    # Rate limit by IP
    allowed, _ = check_rate_limit_for(client_ip, "sms_send_ip")
    if not allowed:
        return {"detail": "Too many verification requests. Please try again later."}, 429

    body = connexion.request.get_json()
    if not body:
        return {"detail": "Request body is required"}, 400

    phone_number = (body.get("phoneNumber") or "").strip()
    if not phone_number:
        return {"detail": "phoneNumber is required"}, 400

    # Normalize and validate
    normalized = sms.normalize_phone(phone_number)
    if not normalized:
        return {"detail": "Invalid phone number format"}, 400

    # Rate limit by phone number
    allowed, _ = check_rate_limit_for(normalized, "sms_send")
    if not allowed:
        return {"detail": "Too many verification requests for this number. Please try again later."}, 429

    # Check if phone is already registered
    if sms.is_phone_registered(phone_number):
        return {"detail": "This phone number is already associated with an account"}, 409

    # Send the code
    ok, result = sms.send_verification_code(phone_number)
    if not ok:
        return {"detail": result}, 400

    return {"message": "Verification code sent"}, 201


def create_phone_confirmation(body):
    """Create a phone confirmation — validates an SMS code and returns a verify token."""
    client_ip = connexion.request.remote_addr or "unknown"

    body = connexion.request.get_json()
    if not body:
        return {"detail": "Request body is required"}, 400

    phone_number = (body.get("phoneNumber") or "").strip()
    code = (body.get("code") or "").strip()

    if not phone_number or not code:
        return {"detail": "phoneNumber and code are required"}, 400

    normalized = sms.normalize_phone(phone_number)
    if not normalized:
        return {"detail": "Invalid phone number format"}, 400

    # Rate limit by phone
    allowed, _ = check_rate_limit_for(normalized, "sms_verify")
    if not allowed:
        return {"detail": "Too many verification attempts. Please try again later."}, 429

    ok, result = sms.verify_code(phone_number, code)
    if not ok:
        return {"detail": result}, 400

    return {"verifyToken": result}, 201
