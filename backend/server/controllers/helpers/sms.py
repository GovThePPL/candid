"""SMS phone verification via Twilio + Redis.

Flow:
1. send_verification_code(phone) → generates 6-digit code, stores in Redis, sends SMS
2. verify_code(phone, code) → checks code, returns (success, verify_token_or_error)
3. check_phone_verified(phone, verify_token) → validates + consumes token during registration
"""

import logging
import secrets
import re

from candid.controllers import config, db
from candid.controllers.helpers.redis_pool import get_redis

logger = logging.getLogger(__name__)

# Redis key prefixes and TTLs
_CODE_PREFIX = "phone_verify:"         # code storage
_ATTEMPTS_PREFIX = "phone_attempts:"   # attempt counter
_TOKEN_PREFIX = "phone_verified:"      # post-verification token
_CODE_TTL = 300          # 5 minutes
_TOKEN_TTL = 600         # 10 minutes
_MAX_ATTEMPTS = 5


def normalize_phone(phone):
    """Normalize a phone number to E.164 format.

    Strips non-digit characters. Assumes US (+1) if 10 digits.
    Returns the normalized number or None if invalid.
    """
    digits = re.sub(r"\D", "", phone)

    # Remove leading 1 if 11 digits (US with country code)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]

    # US number: 10 digits → +1XXXXXXXXXX
    if len(digits) == 10:
        return f"+1{digits}"

    # Already has country code (11+ digits)
    if len(digits) >= 11:
        return f"+{digits}"

    return None


def send_verification_code(phone):
    """Generate and send a 6-digit verification code via SMS.

    Args:
        phone: Phone number (will be normalized)

    Returns:
        (success: bool, normalized_phone_or_error: str)
    """
    normalized = normalize_phone(phone)
    if not normalized:
        return False, "Invalid phone number format"

    code = f"{secrets.randbelow(1000000):06d}"
    r = get_redis()

    # Store code in Redis
    key = f"{_CODE_PREFIX}{normalized}"
    r.setex(key, _CODE_TTL, code)

    # Reset attempt counter
    attempts_key = f"{_ATTEMPTS_PREFIX}{normalized}"
    r.delete(attempts_key)

    # Send via Twilio
    if not config.SMS_VERIFICATION_ENABLED:
        # In dev mode, log the code instead of sending
        logger.info("SMS verification disabled — code for %s: %s", normalized, code)
        return True, normalized

    try:
        from twilio.rest import Client
        client = Client(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
        client.messages.create(
            body=f"Your Candid verification code is: {code}",
            from_=config.TWILIO_PHONE_NUMBER,
            to=normalized,
        )
        return True, normalized
    except Exception as e:
        logger.error("Failed to send SMS to %s: %s", normalized, e)
        return False, "Failed to send verification code"


def verify_code(phone, code):
    """Verify a phone verification code.

    Args:
        phone: Phone number (will be normalized)
        code: The 6-digit code entered by the user

    Returns:
        (success: bool, verify_token_or_error: str)
        On success, returns a one-time verify_token to pass during registration.
    """
    normalized = normalize_phone(phone)
    if not normalized:
        return False, "Invalid phone number format"

    r = get_redis()
    key = f"{_CODE_PREFIX}{normalized}"
    attempts_key = f"{_ATTEMPTS_PREFIX}{normalized}"

    # Check attempt count
    attempts = int(r.get(attempts_key) or 0)
    if attempts >= _MAX_ATTEMPTS:
        return False, "Too many attempts. Please request a new code."

    # Increment attempts
    r.incr(attempts_key)
    r.expire(attempts_key, _CODE_TTL)

    stored_code = r.get(key)
    if stored_code is None:
        return False, "Verification code expired. Please request a new one."

    if isinstance(stored_code, bytes):
        stored_code = stored_code.decode("utf-8")

    if stored_code != code.strip():
        return False, "Incorrect verification code"

    # Code is correct — clean up and create verification token
    r.delete(key)
    r.delete(attempts_key)

    verify_token = secrets.token_urlsafe(32)
    token_key = f"{_TOKEN_PREFIX}{normalized}"
    r.setex(token_key, _TOKEN_TTL, verify_token)

    return True, verify_token


def check_phone_verified(phone, verify_token):
    """Validate and consume a phone verification token.

    Called during registration to confirm the phone was verified.

    Args:
        phone: Phone number (will be normalized)
        verify_token: Token returned by verify_code()

    Returns:
        (valid: bool, normalized_phone_or_error: str)
    """
    normalized = normalize_phone(phone)
    if not normalized:
        return False, "Invalid phone number format"

    r = get_redis()
    token_key = f"{_TOKEN_PREFIX}{normalized}"
    stored_token = r.get(token_key)

    if stored_token is None:
        return False, "Phone verification expired. Please verify again."

    if isinstance(stored_token, bytes):
        stored_token = stored_token.decode("utf-8")

    if stored_token != verify_token:
        return False, "Invalid verification token"

    # Consume the token (one-time use)
    r.delete(token_key)
    return True, normalized


def is_phone_registered(phone):
    """Check if a phone number is already registered to an account.

    Args:
        phone: Phone number (will be normalized)

    Returns:
        bool
    """
    normalized = normalize_phone(phone)
    if not normalized:
        return False

    existing = db.execute_query(
        "SELECT 1 FROM users WHERE phone_number = %s LIMIT 1",
        (normalized,), fetchone=True
    )
    return existing is not None
