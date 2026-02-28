"""Email validation helpers for registration anti-abuse.

- Disposable domain blocking (loaded from vendored blocklist)
- Email normalization (strips plus-aliases, dots for Gmail)
- Normalized-email uniqueness checks against the database
"""

import os
import re
import logging

from candid.controllers import db

logger = logging.getLogger(__name__)

# Load disposable domains once at import time
_DISPOSABLE_DOMAINS = frozenset()
_blocklist_path = os.path.join(os.path.dirname(__file__), "disposable_domains.txt")
try:
    with open(_blocklist_path, "r") as f:
        _DISPOSABLE_DOMAINS = frozenset(
            line.strip().lower() for line in f if line.strip() and not line.startswith("#")
        )
    logger.info("Loaded %d disposable email domains", len(_DISPOSABLE_DOMAINS))
except FileNotFoundError:
    logger.warning("disposable_domains.txt not found at %s — disposable check disabled", _blocklist_path)


def is_disposable_domain(domain):
    """Check if an email domain is a known disposable/throwaway provider."""
    return domain.lower() in _DISPOSABLE_DOMAINS


def normalize_email(email):
    """Normalize an email address for duplicate detection.

    Rules:
    - Lowercase everything
    - Strip '+' suffixes (user+tag@domain → user@domain) for all providers
    - Strip dots from local part for Gmail/Googlemail
    - Alias googlemail.com → gmail.com
    """
    email = email.strip().lower()
    if "@" not in email:
        return email

    local, domain = email.rsplit("@", 1)

    # Strip plus-addressing for all providers
    if "+" in local:
        local = local.split("+", 1)[0]

    # Gmail-specific normalization
    if domain in ("gmail.com", "googlemail.com"):
        local = local.replace(".", "")
        domain = "gmail.com"

    return f"{local}@{domain}"


def validate_email_for_registration(email):
    """Validate an email address for new account registration.

    Checks:
    1. Basic format validation
    2. Not a disposable email domain
    3. Normalized email not already registered

    Returns:
        (ok: bool, error_message: str | None)
    """
    email = email.strip().lower()

    # Format check
    if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
        return False, "A valid email is required"

    # Extract domain
    domain = email.rsplit("@", 1)[1]

    # Disposable check
    if is_disposable_domain(domain):
        return False, "Disposable email addresses are not allowed. Please use a permanent email."

    # Normalized uniqueness check
    normalized = normalize_email(email)
    existing = db.execute_query(
        "SELECT 1 FROM users WHERE normalized_email = %s LIMIT 1",
        (normalized,), fetchone=True
    )
    if existing:
        return False, "An account with this email already exists"

    return True, None
