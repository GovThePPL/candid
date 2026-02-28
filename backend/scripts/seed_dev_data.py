#!/usr/bin/env python3
"""
Seed rich, realistic dev data via the Candid API.

Creates 150 users across 10 belief systems distributed across 3 states
(Oregon, California, Texas). Content is created stage-by-stage via API
calls so that created_during_stage is correctly set for all positions,
posts, and comments. Sessions are advanced through the 8-stage
deliberation pipeline to their target stages.

Idempotent: safe to run multiple times. Checks for existing data before
creating.

Usage:
    python seed_dev_data.py [--api-url URL] [--dry-run] [--phase PHASE]

Phases (all run by default):
    1  users          Register 150 generated users across OR/CA/TX
    2  demographics   Set demographics for all users
    3  staged_content Positions, posts, comments, votes via stage loop (replaces old 3/4/12)
    4  votes          No-op (merged into phase 3)
    5  adoptions      Users adopt positions they agree with (same-state)
    6  chats          Create chat requests, accept some, inject messages
    7  kudos          Send kudos between agreed_closure participants
    8  moderation     Reports, actions, bans (normal4), appeals
    9  surveys        Respond to healthcare survey
   10  pairwise       Respond to pairwise comparisons
   11  admin          Role requests, bans, admin surveys
   12  posts          No-op (merged into phase 3)
   13  notifications  Populate notification inbox from seeded data
   14  glossary       Glossary terms with scopes
   15  wiki_pages     Standalone wiki pages with scopes
   16  suggestions    Wiki suggestions (pending, approved, denied, various scopes)
"""

import argparse
import json
import os
import random
import sys
import time
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
import psycopg2
from psycopg2.extras import RealDictCursor
import requests
from datetime import datetime, timedelta, timezone

# Add seed_data package to path
sys.path.insert(0, os.path.dirname(__file__))
from seed_data import load_all_sessions

WORKERS = 12  # Thread pool size for parallel API calls
MAX_RETRIES = 3  # Retry count for API calls (login, create_post, create_comment)
RETRY_BACKOFF = 0.5  # Base backoff in seconds (multiplied by attempt number)
print_lock = threading.Lock()

# Shared admin token cache to avoid concurrent client_credentials requests
# which cause 409 Conflict in Keycloak
_admin_token_lock = threading.Lock()
_admin_token_cache = {"token": None, "expires_at": 0}

API_URL = os.environ.get('API_URL', 'http://localhost:8000')
DB_URL = os.environ.get('DATABASE_URL', 'postgresql://user:postgres@localhost:5432/candid')
KEYCLOAK_URL = os.environ.get('KEYCLOAK_URL', 'http://localhost:8180')
KEYCLOAK_REALM = os.environ.get('KEYCLOAK_REALM', 'candid')
KEYCLOAK_BACKEND_CLIENT_ID = os.environ.get('KEYCLOAK_BACKEND_CLIENT_ID', 'candid-backend')
KEYCLOAK_BACKEND_CLIENT_SECRET = os.environ.get('KEYCLOAK_BACKEND_CLIENT_SECRET', 'candid-backend-secret')

# ---------------------------------------------------------------------------
# Belief systems & position data
# ---------------------------------------------------------------------------
# 10 groups spanning the political spectrum, bell-curve population distribution
# Vote tuple order: (progressive, liberal, socdem, socialist, moderate, centrist,
#                    libertarian, conservative, populist, traditionalist)
#   1 = agree (maps to Polis -1), -1 = disagree (maps to Polis +1), 0 = pass/skip

BELIEF_SYSTEMS = {
    "progressive":    {"count": 15, "prefix": "prog",  "vote_index": 0, "vote_noise": 0.15, "lean": "very_liberal"},
    "liberal":        {"count": 15, "prefix": "lib",   "vote_index": 1, "vote_noise": 0.18, "lean": "liberal"},
    "social_democrat": {"count": 15, "prefix": "socdem","vote_index": 2, "vote_noise": 0.18, "lean": "liberal"},
    "socialist":      {"count": 15, "prefix": "soc",   "vote_index": 3, "vote_noise": 0.15, "lean": "very_liberal"},
    "moderate":       {"count": 15, "prefix": "mod",   "vote_index": 4, "vote_noise": 0.25, "lean": "moderate"},
    "centrist":       {"count": 15, "prefix": "cen",   "vote_index": 5, "vote_noise": 0.25, "lean": "moderate"},
    "libertarian":    {"count": 15, "prefix": "libt",  "vote_index": 6, "vote_noise": 0.20, "lean": "conservative"},
    "conservative":   {"count": 15, "prefix": "con",   "vote_index": 7, "vote_noise": 0.15, "lean": "conservative"},
    "populist":       {"count": 15, "prefix": "pop",   "vote_index": 8, "vote_noise": 0.15, "lean": "very_conservative"},
    "traditionalist": {"count": 15, "prefix": "trad",  "vote_index": 9, "vote_noise": 0.12, "lean": "very_conservative"},
}

# Positions, posts, and comments are loaded from JSON files in seed_data/sessions/
# via load_all_sessions(). The old inline POSITIONS, STAGED_POSTS, and STAGED_COMMENTS
# lists have been replaced by the template engine in seed_data/.

# Core user lean assignments — each maps to a belief system for voting/survey coherence
CORE_USER_LEANS = {
    "admin1": "liberal",
    "moderator1": "conservative",
    "moderator2": "moderate",
    "normal1": "progressive",
    "normal2": "conservative",
    "normal3": "liberal",
    "normal4": "populist",
    "normal5": None,
    "guest1": None,
    "guest2": "progressive",
}

# Map core users to vote_index based on their belief system
CORE_VOTE_MAP = {}
for _u, _b in CORE_USER_LEANS.items():
    if _b and _b in BELIEF_SYSTEMS:
        CORE_VOTE_MAP[_u] = (BELIEF_SYSTEMS[_b]["vote_index"], BELIEF_SYSTEMS[_b]["vote_noise"])
    elif _b is None:
        CORE_VOTE_MAP[_u] = (4, 0.30)  # moderates with high noise

# Demographics distributions — weighted options per belief system
# Each field: [(value, weight), ...]
DEMO_DISTRIBUTIONS = {
    "progressive": {
        "education": [("bachelors", 3), ("masters", 4), ("doctorate", 2), ("professional", 1)],
        "geo_locale": [("urban", 7), ("suburban", 3)],
        "sex": [("male", 3), ("female", 4), ("other", 3)],
        "age_range": [("18-24", 4), ("25-34", 4), ("35-44", 2)],
        "income_range": [("25k-50k", 2), ("50k-75k", 3), ("75k-100k", 3), ("100k-150k", 2)],
        "race": [("white", 3), ("black", 2), ("hispanic", 2), ("asian", 2), ("multiracial", 2), ("other", 1)],
    },
    "liberal": {
        "education": [("bachelors", 3), ("masters", 5), ("professional", 2), ("doctorate", 2)],
        "geo_locale": [("urban", 5), ("suburban", 4), ("rural", 1)],
        "sex": [("male", 4), ("female", 5), ("other", 2)],
        "age_range": [("25-34", 4), ("35-44", 3), ("45-54", 2), ("55-64", 1)],
        "income_range": [("50k-75k", 2), ("75k-100k", 3), ("100k-150k", 4), ("150k-200k", 2), ("over_200k", 1)],
        "race": [("white", 4), ("black", 2), ("hispanic", 2), ("asian", 3), ("multiracial", 2)],
    },
    "social_democrat": {
        "education": [("some_college", 1), ("bachelors", 4), ("masters", 4), ("doctorate", 1)],
        "geo_locale": [("urban", 6), ("suburban", 3), ("rural", 1)],
        "sex": [("male", 4), ("female", 4), ("other", 2)],
        "age_range": [("18-24", 3), ("25-34", 4), ("35-44", 3)],
        "income_range": [("25k-50k", 2), ("50k-75k", 3), ("75k-100k", 3), ("100k-150k", 2)],
        "race": [("white", 3), ("hispanic", 3), ("black", 2), ("asian", 2), ("multiracial", 2)],
    },
    "socialist": {
        "education": [("high_school", 2), ("some_college", 4), ("bachelors", 3), ("masters", 2)],
        "geo_locale": [("urban", 7), ("suburban", 2), ("rural", 1)],
        "sex": [("male", 3), ("female", 3), ("other", 4)],
        "age_range": [("18-24", 5), ("25-34", 4), ("35-44", 1)],
        "income_range": [("under_25k", 3), ("25k-50k", 4), ("50k-75k", 3)],
        "race": [("white", 3), ("black", 2), ("hispanic", 3), ("asian", 1), ("native_american", 1), ("multiracial", 2)],
    },
    "moderate": {
        "education": [("high_school", 1), ("some_college", 2), ("bachelors", 4), ("masters", 3), ("professional", 1)],
        "geo_locale": [("urban", 3), ("suburban", 5), ("rural", 2)],
        "sex": [("male", 5), ("female", 5), ("other", 1)],
        "age_range": [("25-34", 2), ("35-44", 3), ("45-54", 3), ("55-64", 2)],
        "income_range": [("50k-75k", 3), ("75k-100k", 4), ("100k-150k", 3), ("150k-200k", 1)],
        "race": [("white", 5), ("black", 2), ("hispanic", 2), ("asian", 2), ("multiracial", 1)],
    },
    "centrist": {
        "education": [("some_college", 2), ("bachelors", 4), ("masters", 3), ("professional", 2)],
        "geo_locale": [("urban", 3), ("suburban", 5), ("rural", 2)],
        "sex": [("male", 5), ("female", 5), ("other", 1)],
        "age_range": [("25-34", 3), ("35-44", 3), ("45-54", 2), ("55-64", 2)],
        "income_range": [("50k-75k", 2), ("75k-100k", 3), ("100k-150k", 4), ("150k-200k", 2)],
        "race": [("white", 5), ("black", 1), ("hispanic", 2), ("asian", 2), ("multiracial", 1)],
    },
    "libertarian": {
        "education": [("some_college", 2), ("bachelors", 3), ("masters", 3), ("professional", 2), ("doctorate", 1)],
        "geo_locale": [("urban", 3), ("suburban", 4), ("rural", 3)],
        "sex": [("male", 7), ("female", 3), ("other", 1)],
        "age_range": [("18-24", 2), ("25-34", 4), ("35-44", 3), ("45-54", 2)],
        "income_range": [("50k-75k", 2), ("75k-100k", 3), ("100k-150k", 3), ("150k-200k", 2), ("over_200k", 1)],
        "race": [("white", 6), ("hispanic", 1), ("asian", 2), ("multiracial", 1)],
    },
    "conservative": {
        "education": [("high_school", 2), ("some_college", 3), ("bachelors", 4), ("masters", 2)],
        "geo_locale": [("rural", 2), ("suburban", 6), ("urban", 2)],
        "sex": [("male", 5), ("female", 5), ("other", 1)],
        "age_range": [("35-44", 3), ("45-54", 3), ("55-64", 3), ("65+", 1)],
        "income_range": [("50k-75k", 3), ("75k-100k", 4), ("100k-150k", 3), ("150k-200k", 1)],
        "race": [("white", 6), ("black", 1), ("hispanic", 2), ("asian", 1), ("multiracial", 1)],
    },
    "populist": {
        "education": [("high_school", 3), ("some_college", 4), ("associates", 2), ("bachelors", 2)],
        "geo_locale": [("rural", 5), ("suburban", 4), ("urban", 1)],
        "sex": [("male", 7), ("female", 3), ("other", 1)],
        "age_range": [("35-44", 2), ("45-54", 4), ("55-64", 3), ("65+", 2)],
        "income_range": [("under_25k", 1), ("25k-50k", 3), ("50k-75k", 4), ("75k-100k", 3)],
        "race": [("white", 7), ("hispanic", 2), ("black", 1), ("multiracial", 1)],
    },
    "traditionalist": {
        "education": [("high_school", 3), ("some_college", 3), ("bachelors", 2), ("associates", 2)],
        "geo_locale": [("rural", 6), ("suburban", 3), ("urban", 1)],
        "sex": [("male", 6), ("female", 4)],
        "age_range": [("45-54", 3), ("55-64", 4), ("65+", 3)],
        "income_range": [("25k-50k", 3), ("50k-75k", 4), ("75k-100k", 2), ("100k-150k", 1)],
        "race": [("white", 8), ("hispanic", 1), ("multiracial", 1)],
    },
}


def _weighted_choice(options):
    """Pick a random value from [(value, weight), ...] list."""
    values, weights = zip(*options)
    return random.choices(values, weights=weights, k=1)[0]

# Affiliations by lean
AFFILIATION_MAP = {
    "very_conservative": "Constitution Party of Oregon",
    "conservative": "Oregon Republican Party",
    "moderate": "Independent Party of Oregon",
    "liberal": "Democratic Party of Oregon",
    "very_liberal": "Pacific Green Party of Oregon",
}

STAGE_ORDER = [
    "proposal_issue", "proposal_qualify", "proposal_stakeholders",
    "opinion_discussion", "reflection_curation", "reflection_proposals",
    "consensus",
]

SESSION_CONFIG = {
    "Healthcare Access":   {"location": "OR",   "target": "opinion_discussion"},
    "Living Wage":         {"location": "OR",   "target": "reflection_curation"},
    "Fall 2025":           {"location": "MULT", "target": "proposal_qualify"},
    "Civil Liberties":     {"location": "MULT", "target": "proposal_stakeholders"},
    "Rent Stabilization":  {"location": "PDX",  "target": "consensus"},
    "Climate Action":      {"location": "CA",   "target": "reflection_proposals"},
    "Pacific Defense":     {"location": "CA",   "target": "consensus"},
    "Electoral Reform":    {"location": "LA",   "target": "opinion_discussion"},
    "Spring 2026":         {"location": "LA",   "target": "proposal_issue"},
    "Water Rights":        {"location": "LAX",  "target": "consensus"},
    "Border Communities":  {"location": "TX",   "target": "opinion_discussion"},
    "Criminal Justice":    {"location": "TX",   "target": "proposal_stakeholders"},
    "Family Policy":       {"location": "TRAV", "target": "reflection_curation"},
    "Winter 2025-26":      {"location": "TRAV", "target": "proposal_qualify"},
    "Transit Expansion":   {"location": "AUS",  "target": "reflection_proposals"},
    "School Funding":      {"location": "MULT", "target": "opinion_discussion", "proposal_method": "direct_proposal"},
    "Housing Policy":      {"location": "TRAV", "target": "proposal_qualify",   "proposal_method": "admin_provided"},
}

# Map state codes to user index ranges (within each belief system's 15 users)
# Users 1-5 → Oregon/Portland, 6-10 → California/LA, 11-15 → Texas/Austin
STATE_USER_RANGES = {"OR": (1, 5), "CA": (6, 10), "TX": (11, 15)}

# Map sub-location codes to their parent state (for user selection)
LOCATION_TO_STATE = {
    "OR": "OR", "MULT": "OR", "PDX": "OR",
    "CA": "CA", "LA": "CA", "LAX": "CA",
    "TX": "TX", "TRAV": "TX", "AUS": "TX",
}

# Sub-location UUIDs for user assignment (cities)
CITY_LOCATION_IDS = {
    "OR": "d3c4b5a6-f7e8-9012-cdef-123456789012",  # Portland
    "CA": "a1b2c3d4-e5f6-7890-abcd-100000000003",  # Los Angeles
    "TX": "a1b2c3d4-e5f6-7890-abcd-200000000003",  # Austin
}


# ---------------------------------------------------------------------------
# API client
# ---------------------------------------------------------------------------

class CandidAPI:
    """Simple API client for Candid."""

    def __init__(self, base_url):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.token = None
        self.user_id = None

    def register(self, username, email, password, display_name, roles=None):
        """Create user via Keycloak Admin REST API, then login to get a token."""
        admin_token = self._get_admin_token()
        base = f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}"
        headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

        # Keycloak 26 User Profile requires both firstName and lastName
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
            "credentials": [{"type": "password", "value": password, "temporary": False}],
            "requiredActions": [],
        }
        resp = self.session.post(f"{base}/users", json=user_data, headers=headers, timeout=10)
        if resp.status_code == 409:
            return None  # exists
        elif resp.status_code not in (200, 201):
            print(f"  Register failed ({resp.status_code}): {resp.text[:120]}")
            return None

        # Assign roles if specified
        if roles:
            location = resp.headers.get("Location", "")
            kc_user_id = location.split("/")[-1]
            self._assign_roles(kc_user_id, roles, admin_token, base, headers)

        # Login via ROPC to get a token + resolve Candid user (auto-registration)
        if self.login(username, password):
            return {"user": {"id": self.user_id}}
        return None

    def _get_admin_token(self):
        """Get admin token via candid-backend service account.

        Uses a module-level cache with lock to avoid concurrent
        client_credentials requests which cause 409 in Keycloak.
        """
        global _admin_token_cache
        now = time.time()

        # Fast path: return cached token if still valid (with 30s margin)
        if _admin_token_cache["token"] and now < _admin_token_cache["expires_at"] - 30:
            return _admin_token_cache["token"]

        with _admin_token_lock:
            # Re-check after acquiring lock (another thread may have refreshed)
            now = time.time()
            if _admin_token_cache["token"] and now < _admin_token_cache["expires_at"] - 30:
                return _admin_token_cache["token"]

            token_url = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token"
            for attempt in range(3):
                resp = self.session.post(token_url, data={
                    "grant_type": "client_credentials",
                    "client_id": KEYCLOAK_BACKEND_CLIENT_ID,
                    "client_secret": KEYCLOAK_BACKEND_CLIENT_SECRET,
                }, timeout=10)
                if resp.status_code == 409:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                resp.raise_for_status()
                data = resp.json()
                _admin_token_cache["token"] = data["access_token"]
                _admin_token_cache["expires_at"] = now + data.get("expires_in", 300)
                return data["access_token"]
            # Final attempt failed
            resp.raise_for_status()

    def _assign_roles(self, user_id, role_names, admin_token, base, headers):
        """Assign realm roles to a Keycloak user."""
        resp = self.session.get(f"{base}/roles", headers=headers, timeout=10)
        resp.raise_for_status()
        all_roles = resp.json()
        roles_to_assign = [r for r in all_roles if r["name"] in role_names]
        if roles_to_assign:
            self.session.post(
                f"{base}/users/{user_id}/role-mappings/realm",
                json=roles_to_assign, headers=headers, timeout=10
            )

    def login(self, username, password="password"):
        """Login via Keycloak ROPC grant, then fetch Candid user info."""
        token_url = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token"
        for attempt in range(MAX_RETRIES):
            try:
                resp = self.session.post(token_url, data={
                    "grant_type": "password",
                    "client_id": "candid-app",
                    "username": username,
                    "password": password,
                }, timeout=10)
                if resp.status_code != 200:
                    if attempt < MAX_RETRIES - 1:
                        time.sleep(RETRY_BACKOFF * (attempt + 1))
                        continue
                    return False

                self.token = resp.json().get("access_token")
                self._last_username = username
                self._last_password = password
                # Fetch Candid user profile (triggers auto-registration if needed)
                user_resp = self.session.get(f"{self.base_url}/api/v1/users/me",
                                             headers=self._headers(), timeout=10)
                if user_resp.status_code == 200:
                    self.user_id = user_resp.json().get("id")
                    return True
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_BACKOFF * (attempt + 1))
                    continue
                return False
            except (requests.RequestException, Exception):
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_BACKOFF * (attempt + 1))
                    continue
                return False
        return False

    def _reauth(self):
        """Re-authenticate using the last login credentials (for 401 recovery)."""
        if hasattr(self, '_last_username'):
            self.login(self._last_username, getattr(self, '_last_password', 'password'))

    def _headers(self):
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    def get_sessions(self):
        r = self.session.get(f"{self.base_url}/api/v1/sessions", headers=self._headers())
        return r.json() if r.status_code == 200 else []

    def get_locations(self):
        r = self.session.get(f"{self.base_url}/api/v1/users/me/locations", headers=self._headers())
        return r.json() if r.status_code == 200 else []

    def set_location(self, location_id):
        r = self.session.put(f"{self.base_url}/api/v1/users/me/locations",
                             json={"locationId": location_id}, headers=self._headers())
        return r.status_code in (200, 201, 204)

    def set_demographics(self, data):
        r = self.session.patch(f"{self.base_url}/api/v1/users/me/demographics",
                               json=data, headers=self._headers())
        return r.status_code in (200, 201, 204)

    def set_settings(self, data):
        r = self.session.patch(f"{self.base_url}/api/v1/users/me/settings",
                               json=data, headers=self._headers())
        return r.status_code in (200, 201, 204)

    def create_position(self, statement, session_id, location_id):
        payload = {"statement": statement, "sessionId": session_id,
                   "locationId": location_id}
        for attempt in range(MAX_RETRIES):
            try:
                r = self.session.post(f"{self.base_url}/api/v1/positions",
                                      json=payload, headers=self._headers(),
                                      timeout=15)
                if r.status_code in (200, 201):
                    return r.json()
                if r.status_code == 401 and attempt < MAX_RETRIES - 1:
                    self._reauth()
                    time.sleep(RETRY_BACKOFF * (attempt + 1))
                    continue
                if 400 <= r.status_code < 500:
                    return None
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_BACKOFF * (attempt + 1))
            except (requests.RequestException, Exception):
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_BACKOFF * (attempt + 1))
        return None

    def adopt_position(self, position_id):
        r = self.session.post(f"{self.base_url}/api/v1/users/me/positions",
                              json={"positionId": position_id},
                              headers=self._headers())
        return r.status_code in (200, 201, 204)

    def vote(self, position_id, response_type):
        r = self.session.post(f"{self.base_url}/api/v1/positions/responses",
                              json={"responses": [{"positionId": position_id, "response": response_type}]},
                              headers=self._headers())
        return r.status_code in (200, 201, 204)

    def create_chat_request(self, user_position_id):
        r = self.session.post(f"{self.base_url}/api/v1/chats/requests",
                              json={"userPositionId": user_position_id},
                              headers=self._headers())
        return r.json() if r.status_code in (200, 201) else None

    def respond_chat_request(self, request_id, response):
        r = self.session.patch(f"{self.base_url}/api/v1/chats/requests/{request_id}",
                               json={"response": response}, headers=self._headers())
        return r.status_code in (200, 204)

    def send_kudos(self, chat_id):
        r = self.session.post(f"{self.base_url}/api/v1/chats/{chat_id}/kudos",
                              headers=self._headers())
        return r.status_code in (200, 201)

    def report_position(self, position_id, rule_id, comment=None):
        body = {"ruleId": rule_id}
        if comment:
            body["comment"] = comment
        r = self.session.post(f"{self.base_url}/api/v1/positions/{position_id}/report",
                              json=body, headers=self._headers())
        return r.json() if r.status_code in (200, 201) else None

    def report_chat(self, chat_id, rule_id, comment=None):
        body = {"ruleId": rule_id}
        if comment:
            body["comment"] = comment
        r = self.session.post(f"{self.base_url}/api/v1/chats/{chat_id}/report",
                              json=body, headers=self._headers())
        return r.json() if r.status_code in (200, 201) else None

    def claim_report(self, report_id):
        r = self.session.patch(f"{self.base_url}/api/v1/moderation/reports/{report_id}",
                               json={"claimedBy": self.user_id},
                               headers=self._headers())
        return r.status_code in (200, 204)

    def take_action(self, report_id, mod_response, actions=None, text=None):
        body = {"modResponse": mod_response}
        if actions:
            body["actions"] = actions
        if text:
            body["modResponseText"] = text
        r = self.session.post(f"{self.base_url}/api/v1/moderation/reports/{report_id}/response",
                              json=body, headers=self._headers())
        return r.json() if r.status_code in (200, 201) else None

    def create_appeal(self, action_id, text):
        r = self.session.post(f"{self.base_url}/api/v1/moderation/actions/{action_id}/appeal",
                              json={"appealText": text}, headers=self._headers())
        return r.json() if r.status_code in (200, 201) else None

    def respond_appeal(self, appeal_id, response, response_text, actions=None):
        body = {"response": response, "responseText": response_text}
        if actions:
            body["actions"] = actions
        r = self.session.post(f"{self.base_url}/api/v1/moderation/appeals/{appeal_id}/response",
                              json=body, headers=self._headers())
        return r.json() if r.status_code in (200, 201) else None

    def respond_survey(self, survey_id, question_id, option_id):
        r = self.session.post(
            f"{self.base_url}/api/v1/surveys/{survey_id}/questions/{question_id}/response",
            json={"optionId": option_id}, headers=self._headers())
        return r.status_code in (200, 201, 204)

    def respond_pairwise(self, survey_id, winner_item_id, loser_item_id):
        r = self.session.post(
            f"{self.base_url}/api/v1/pairwise/{survey_id}/respond",
            json={"winnerItemId": winner_item_id, "loserItemId": loser_item_id},
            headers=self._headers())
        return r.status_code in (200, 201, 204)

    def add_to_chatting_list(self, position_id):
        r = self.session.post(f"{self.base_url}/api/v1/users/me/chatting-list",
                              json={"positionId": position_id}, headers=self._headers())
        return r.status_code in (200, 201)

    def create_post(self, title, body, location_id, session_id=None, post_type="discussion"):
        payload = {"title": title, "body": body, "locationId": location_id,
                   "postType": post_type}
        if session_id:
            payload["sessionId"] = session_id
        for attempt in range(MAX_RETRIES):
            try:
                r = self.session.post(f"{self.base_url}/api/v1/posts",
                                      json=payload, headers=self._headers(),
                                      timeout=15)
                if r.status_code in (200, 201):
                    return r.json()
                # Retry on 401 after re-auth
                if r.status_code == 401 and attempt < MAX_RETRIES - 1:
                    self._reauth()
                    time.sleep(RETRY_BACKOFF * (attempt + 1))
                    continue
                # Don't retry other 4xx client errors (e.g. 403 stage restriction)
                if 400 <= r.status_code < 500:
                    with print_lock:
                        print(f"      [create_post {r.status_code}] "
                              f"{title[:40]}...")
                    return None
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_BACKOFF * (attempt + 1))
            except (requests.RequestException, Exception) as e:
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_BACKOFF * (attempt + 1))
                else:
                    with print_lock:
                        print(f"      [create_post exception] {e}")
        return None

    def create_comment(self, post_id, body, parent_comment_id=None):
        payload = {"body": body}
        if parent_comment_id:
            payload["parentCommentId"] = parent_comment_id
        for attempt in range(MAX_RETRIES):
            try:
                r = self.session.post(f"{self.base_url}/api/v1/posts/{post_id}/comments",
                                      json=payload, headers=self._headers(),
                                      timeout=15)
                if r.status_code in (200, 201):
                    return r.json()
                if r.status_code == 401 and attempt < MAX_RETRIES - 1:
                    self._reauth()
                    time.sleep(RETRY_BACKOFF * (attempt + 1))
                    continue
                if 400 <= r.status_code < 500:
                    with print_lock:
                        print(f"      [create_comment {r.status_code}] "
                              f"{body[:40]}...")
                    return None
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_BACKOFF * (attempt + 1))
            except (requests.RequestException, Exception) as e:
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_BACKOFF * (attempt + 1))
                else:
                    with print_lock:
                        print(f"      [create_comment exception] {e}")
        return None

    def vote_on_post(self, post_id, vote_type, downvote_reason=None):
        payload = {"voteType": vote_type}
        if downvote_reason:
            payload["downvoteReason"] = downvote_reason
        r = self.session.post(f"{self.base_url}/api/v1/posts/{post_id}/votes",
                              json=payload, headers=self._headers())
        return r.status_code in (200, 201)

    def vote_on_comment(self, comment_id, vote_type, downvote_reason=None):
        payload = {"voteType": vote_type}
        if downvote_reason:
            payload["downvoteReason"] = downvote_reason
        r = self.session.post(f"{self.base_url}/api/v1/comments/{comment_id}/votes",
                              json=payload, headers=self._headers())
        return r.status_code in (200, 201)

    def advance_session(self, session_id, stage, reason=None):
        payload = {"stage": stage}
        if reason:
            payload["reason"] = reason
        r = self.session.patch(f"{self.base_url}/api/v1/sessions/{session_id}",
                               json=payload, headers=self._headers())
        return r.json() if r.status_code == 200 else None

    # --- Admin: Roles ---

    def request_role_assignment(self, target_user_id, role, location_id,
                                session_id=None, reason=None):
        body = {"action": "assign", "targetUserId": target_user_id,
                "role": role, "locationId": location_id}
        if session_id:
            body["sessionId"] = session_id
        if reason:
            body["reason"] = reason
        r = self.session.post(f"{self.base_url}/api/v1/admin/roles/requests",
                              json=body, headers=self._headers())
        return r.json() if r.status_code in (200, 201) else None

    def request_role_removal(self, user_role_id, reason=None):
        body = {"action": "remove", "userRoleId": user_role_id}
        if reason:
            body["reason"] = reason
        r = self.session.post(f"{self.base_url}/api/v1/admin/roles/requests",
                              json=body, headers=self._headers())
        return r.json() if r.status_code in (200, 201) else None

    def approve_role_request(self, request_id):
        r = self.session.patch(
            f"{self.base_url}/api/v1/admin/roles/requests/{request_id}",
            json={"status": "approved"}, headers=self._headers())
        return r.json() if r.status_code == 200 else None

    def deny_role_request(self, request_id, reason=None):
        body = {"status": "denied"}
        if reason:
            body["reason"] = reason
        r = self.session.patch(
            f"{self.base_url}/api/v1/admin/roles/requests/{request_id}",
            json=body, headers=self._headers())
        return r.json() if r.status_code == 200 else None

    def rescind_role_request(self, request_id):
        r = self.session.patch(
            f"{self.base_url}/api/v1/admin/roles/requests/{request_id}",
            json={"status": "rescinded"}, headers=self._headers())
        return r.json() if r.status_code == 200 else None

    def get_role_requests(self, view='all'):
        r = self.session.get(f"{self.base_url}/api/v1/admin/roles/requests",
                             params={"view": view}, headers=self._headers())
        return r.json() if r.status_code == 200 else []

    # --- Admin: Users ---

    def search_users(self, query):
        r = self.session.get(f"{self.base_url}/api/v1/admin/users",
                             params={"search": query}, headers=self._headers())
        return r.json() if r.status_code == 200 else []

    def ban_user(self, user_id, reason):
        r = self.session.patch(f"{self.base_url}/api/v1/admin/users/{user_id}/status",
                               json={"status": "banned", "reason": reason},
                               headers=self._headers())
        return r.json() if r.status_code == 200 else None

    def unban_user(self, user_id, reason):
        r = self.session.patch(f"{self.base_url}/api/v1/admin/users/{user_id}/status",
                               json={"status": "active", "reason": reason},
                               headers=self._headers())
        return r.json() if r.status_code == 200 else None

    # --- Admin: Surveys ---

    def create_admin_survey(self, title, start_time, end_time, questions,
                            location_id=None, session_id=None):
        body = {
            "surveyTitle": title,
            "startTime": start_time,
            "endTime": end_time,
            "questions": questions,
        }
        if location_id:
            body["locationId"] = location_id
        if session_id:
            body["sessionId"] = session_id
        r = self.session.post(f"{self.base_url}/api/v1/admin/surveys",
                              json=body, headers=self._headers())
        return r.json() if r.status_code in (200, 201) else None

    def create_admin_pairwise_survey(self, title, start_time, end_time, items,
                                     comparison_question=None, location_id=None,
                                     session_id=None):
        body = {
            "surveyTitle": title,
            "startTime": start_time,
            "endTime": end_time,
            "items": items,
        }
        if comparison_question:
            body["comparisonQuestion"] = comparison_question
        if location_id:
            body["locationId"] = location_id
        if session_id:
            body["sessionId"] = session_id
        r = self.session.post(f"{self.base_url}/api/v1/admin/surveys/pairwise",
                              json=body, headers=self._headers())
        return r.json() if r.status_code in (200, 201) else None


def get_vote_response(expected_vote, noise_level):
    if random.random() < noise_level:
        # Noisy votes should still rarely be passes — most people have an opinion
        r = random.random()
        if r < 0.47:
            return "agree"
        elif r < 0.94:
            return "disagree"
        else:
            return "pass"  # ~6% chance
    if expected_vote == 1:
        return "agree"
    elif expected_vote == -1:
        return "disagree"
    return "pass"


def db_conn():
    return psycopg2.connect(DB_URL)



def db_query(query, params=None):
    conn = db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            return cur.fetchall()
    finally:
        conn.close()


def db_query_one(query, params=None):
    conn = db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            return cur.fetchone()
    finally:
        conn.close()


def db_execute(query, params=None):
    conn = db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            conn.commit()
    finally:
        conn.close()


def db_execute_returning(query, params=None):
    """Execute a query with RETURNING clause and return the first row."""
    conn = db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            row = cur.fetchone()
            conn.commit()
            return row
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Phase 1: Register 50 generated users + set locations for all 60
# ---------------------------------------------------------------------------

def _user_state(user_index):
    """Return the state code for a user based on their 1-based index within a belief system.
    Users 1-5 → OR, 6-10 → CA, 11-15 → TX."""
    for code, (lo, hi) in STATE_USER_RANGES.items():
        if lo <= user_index <= hi:
            return code
    return "OR"


def phase_1_users(api, location_ids, dry_run=False):
    """Register 150 generated users distributed across 3 states + set locations for core users.
    location_ids: {"OR": uuid, "CA": uuid, "TX": uuid} mapping state codes to city-level UUIDs.
    """
    print("\n" + "=" * 60)
    print("PHASE 1: Users")
    print("=" * 60)

    all_users = []

    # Build user list — 15 per belief system, 5 per state
    for belief, config in BELIEF_SYSTEMS.items():
        for i in range(config["count"]):
            idx = i + 1
            username = f"{config['prefix']}_user_{idx}"
            email = f"{username}@test.local"
            display_name = f"{belief.replace('_', ' ').title()} User {idx}"
            state = _user_state(idx)
            all_users.append({
                "username": username, "email": email, "password": "password",
                "display_name": display_name, "belief": belief,
                "vote_index": config["vote_index"], "vote_noise": config["vote_noise"],
                "lean": config["lean"], "state": state,
            })

    if dry_run:
        by_state = {}
        for u in all_users:
            by_state.setdefault(u["state"], []).append(u)
        for st, users in by_state.items():
            print(f"  {st}: {len(users)} users")
        print(f"  Total generated: {len(all_users)}")
        return all_users

    def register_and_set_location(user):
        t_api = CandidAPI(api.base_url)
        loc_id = location_ids[user["state"]]
        result = t_api.register(user["username"], user["email"], "password", user["display_name"])
        if result:
            t_api.set_location(loc_id)
            return f"  Created: {user['username']} ({user['state']})"
        elif t_api.login(user["username"]):
            t_api.set_location(loc_id)
            return f"  Exists:  {user['username']} ({user['state']})"
        return f"  ERROR:   {user['username']}"

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for msg in pool.map(register_and_set_location, all_users):
            print(msg)

    # Core users stay at Oregon/Portland
    or_loc_id = location_ids["OR"]

    def set_core_location(username):
        t_api = CandidAPI(api.base_url)
        if t_api.login(username):
            t_api.set_location(or_loc_id)

    core_usernames = [u for u in CORE_USER_LEANS if not u.startswith("guest")]
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        list(pool.map(set_core_location, core_usernames))

    print(f"  Total generated: {len(all_users)}")
    return all_users


# ---------------------------------------------------------------------------
# Phase 2: Demographics
# ---------------------------------------------------------------------------

def phase_2_demographics(api, affiliations, dry_run=False):
    print("\n" + "=" * 60)
    print("PHASE 2: Demographics")
    print("=" * 60)

    # Core users
    core_demos = {
        "admin1": {"lean": "liberal", "education": "masters", "geoLocale": "urban",
                    "race": "white", "sex": "female", "ageRange": "35-44", "incomeRange": "100k-150k"},
        "moderator1": {"lean": "conservative", "education": "bachelors", "geoLocale": "suburban",
                        "sex": "male", "ageRange": "45-54", "incomeRange": "75k-100k"},
        "moderator2": {"lean": "moderate", "education": "doctorate", "ageRange": "55-64",
                        "incomeRange": "150k-200k"},
        "normal1": {"lean": "very_liberal", "education": "some_college", "geoLocale": "urban",
                     "race": "hispanic", "sex": "other", "ageRange": "18-24", "incomeRange": "25k-50k"},
        "normal2": {"lean": "conservative", "education": "high_school", "ageRange": "25-34",
                     "incomeRange": "under_25k"},
        "normal3": {"lean": "liberal", "education": "professional", "geoLocale": "suburban",
                     "race": "asian", "sex": "female", "ageRange": "35-44", "incomeRange": "over_200k"},
        "normal4": {"lean": "very_conservative", "education": "associates", "geoLocale": "rural",
                     "sex": "male", "ageRange": "65+", "incomeRange": "50k-75k"},
        "normal5": {"sex": "male"},
        "guest2": {"lean": "very_liberal", "education": "bachelors", "geoLocale": "urban",
                    "race": "black", "sex": "female", "ageRange": "25-34", "incomeRange": "50k-75k"},
    }

    # Add affiliation IDs
    for username, demo in core_demos.items():
        lean = demo.get("lean")
        if lean and lean in AFFILIATION_MAP:
            aff_name = AFFILIATION_MAP[lean]
            aff_id = affiliations.get(aff_name)
            if aff_id:
                demo["affiliationId"] = aff_id

    if dry_run:
        print(f"  Core users: {len(core_demos)}")
        print(f"  Generated users: 150")
        return

    # Build all (username, demo_data) pairs upfront
    # ~20% of generated users skip demographics entirely; others fill 50-100% of fields
    demo_tasks = list(core_demos.items())  # Core users always get full demographics
    optional_fields = ["education", "geoLocale", "sex", "ageRange", "incomeRange", "race"]
    for belief, config in BELIEF_SYSTEMS.items():
        dist = DEMO_DISTRIBUTIONS[belief]
        for i in range(config["count"]):
            idx = i + 1
            username = f"{config['prefix']}_user_{idx}"
            if random.random() < 0.20:
                continue  # ~20% skip demographics entirely
            demo = {
                "lean": config["lean"],
                "education": _weighted_choice(dist["education"]),
                "geoLocale": _weighted_choice(dist["geo_locale"]),
                "sex": _weighted_choice(dist["sex"]),
                "ageRange": _weighted_choice(dist["age_range"]),
                "incomeRange": _weighted_choice(dist["income_range"]),
                "race": _weighted_choice(dist["race"]),
            }
            # Randomly drop some fields (each user fills 50-100% of optional fields)
            n_to_keep = random.randint(len(optional_fields) // 2, len(optional_fields))
            fields_to_drop = random.sample(optional_fields, len(optional_fields) - n_to_keep)
            for f in fields_to_drop:
                demo.pop(f, None)
            # Only add affiliations for Oregon users (1-5); CA/TX don't have affiliations
            user_state = _user_state(idx)
            if user_state == "OR":
                aff_name = AFFILIATION_MAP.get(config["lean"])
                if aff_name:
                    aff_id = affiliations.get(aff_name)
                    if aff_id:
                        demo["affiliationId"] = aff_id
            demo_tasks.append((username, demo))

    def set_demo(task):
        username, demo = task
        t_api = CandidAPI(api.base_url)
        if t_api.login(username):
            t_api.set_demographics(demo)
            return 1
        return 0

    count = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        count = sum(pool.map(set_demo, demo_tasks))
    print(f"  Core users: {len(core_demos)}")
    print(f"  Generated users: {count - len(core_demos)}")


# ---------------------------------------------------------------------------
# Phase 3: Staged Content (positions, posts, comments, votes via API)
# Replaces old phases 3, 4, and 12.
# ---------------------------------------------------------------------------

# (Staged posts and comments now loaded from JSON via load_all_sessions)


def _get_session_state(session_label):
    """Return the parent state code (OR/CA/TX) for a session based on SESSION_CONFIG."""
    cfg = SESSION_CONFIG.get(session_label)
    if not cfg:
        return "OR"
    return LOCATION_TO_STATE.get(cfg["location"], "OR")


def _users_for_state(all_users, state_code):
    """Return generated users belonging to the given state."""
    return [u for u in all_users if u.get("state") == state_code]


# Map prefixes to a left-right lean score for ideological comment voting
PREFIX_LEAN = {
    "prog": -1.0, "lib": -0.7, "socdem": -0.6, "soc": -0.9,
    "mod": 0.0, "cen": 0.1, "normal": 0.0, "admin": 0.0,
    "moderator": 0.0,
    "libt": 0.5, "con": 0.8, "pop": 0.9, "trad": 1.0,
}


def _load_seed_content():
    """Load and expand all session JSON files into positions, posts, surveys."""
    data = load_all_sessions()
    # Convert position votes from lists to tuples for compatibility
    for p in data["positions"]:
        if isinstance(p["votes"], list):
            p["votes"] = tuple(p["votes"])
    return data


def _simulate_completed_voting_round(sess_id, sess_label, round_type, all_users, state_code):
    """Simulate a full voting round: endorsements → candidates → ballots → RCV tally.

    Creates a voting round, seeds endorsements from state users on existing
    proposal posts, qualifies top-endorsed proposals as ballot candidates,
    creates randomized ballots with rankings, computes the RCV tally, and
    finalizes the winning proposal.  Returns the winner post ID or None.
    """
    # Create voting round (or reset to proposals_open if re-running)
    vr_row = db_execute_returning("""
        INSERT INTO voting_round (id, session_id, round_type, status,
                                   ballot_size, winner_count, created_time)
        VALUES (gen_random_uuid(), %s, %s, 'proposals_open', 7, 1, NOW())
        ON CONFLICT (session_id, round_type) DO UPDATE
            SET status = 'proposals_open'
        RETURNING id
    """, (sess_id, round_type))
    if not vr_row:
        return None
    vr_id = str(vr_row["id"])

    # Find proposal posts in this session
    proposals = db_query("""
        SELECT id, title, upvote_count FROM post
        WHERE session_id = %s AND post_type = 'proposal' AND status = 'active'
        ORDER BY upvote_count DESC, created_time ASC
    """, (sess_id,))
    if not proposals:
        db_execute("UPDATE voting_round SET status = 'voting_closed' WHERE id = %s",
                   (vr_id,))
        return None

    # Finalize proposals that are still draft so they can be endorsed/voted on.
    # In production the facilitator does this; in seed we finalize all of them.
    db_execute("""
        UPDATE post SET proposal_status = 'finalized'
        WHERE session_id = %s AND post_type = 'proposal'
          AND (proposal_status IS NULL OR proposal_status = 'draft')
    """, (sess_id,))

    # Re-fetch so we only work with finalized proposals
    proposals = db_query("""
        SELECT id, title, upvote_count FROM post
        WHERE session_id = %s AND post_type = 'proposal'
          AND status = 'active' AND proposal_status = 'finalized'
        ORDER BY upvote_count DESC, created_time ASC
    """, (sess_id,))
    if not proposals:
        db_execute("UPDATE voting_round SET status = 'voting_closed' WHERE id = %s",
                   (vr_id,))
        return None

    # Gather up to 20 state users for voting
    state_users = _users_for_state(all_users, state_code)
    user_uuids = []
    for u in state_users[:20]:
        row = db_query_one("SELECT id FROM users WHERE username = %s",
                           (u["username"],))
        if row:
            user_uuids.append(str(row["id"]))
    if not user_uuids:
        db_execute("UPDATE voting_round SET status = 'voting_closed' WHERE id = %s",
                   (vr_id,))
        return None

    # -- Finalization: seed endorsements (max 3 per user) --
    db_execute("UPDATE voting_round SET status = 'finalization_open' WHERE id = %s",
               (vr_id,))
    endorsement_counts = {}
    for uid in user_uuids:
        n = random.randint(1, min(3, len(proposals)))
        for prop in random.sample(proposals, n):
            pid = str(prop["id"])
            db_execute("""
                INSERT INTO proposal_endorsement
                       (id, voting_round_id, proposal_post_id, user_id, created_time)
                VALUES (gen_random_uuid(), %s, %s, %s, NOW())
                ON CONFLICT (voting_round_id, proposal_post_id, user_id) DO NOTHING
            """, (vr_id, pid, uid))
            endorsement_counts[pid] = endorsement_counts.get(pid, 0) + 1

    # -- Proposals closed: qualify top-endorsed as ballot candidates --
    db_execute("UPDATE voting_round SET status = 'proposals_closed' WHERE id = %s",
               (vr_id,))
    top_proposals = sorted(
        proposals,
        key=lambda p: endorsement_counts.get(str(p["id"]), 0),
        reverse=True,
    )[:7]
    for i, prop in enumerate(top_proposals):
        pid = str(prop["id"])
        db_execute("""
            INSERT INTO voting_round_candidate
                   (voting_round_id, proposal_post_id, endorsement_count, display_order)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (voting_round_id, proposal_post_id) DO NOTHING
        """, (vr_id, pid, endorsement_counts.get(pid, 0), i))

    # -- Voting open: create ballots with randomized rankings --
    db_execute("UPDATE voting_round SET status = 'voting_open' WHERE id = %s",
               (vr_id,))
    ballot_count = 0
    candidate_ids = [str(p["id"]) for p in top_proposals]
    for uid in user_uuids:
        if random.random() > 0.7:
            continue
        ballot_row = db_execute_returning("""
            INSERT INTO rcv_ballot (id, voting_round_id, voter_user_id, created_time)
            VALUES (gen_random_uuid(), %s, %s, NOW())
            ON CONFLICT (voting_round_id, voter_user_id) DO NOTHING
            RETURNING id
        """, (vr_id, uid))
        if not ballot_row:
            continue
        ballot_id = str(ballot_row["id"])
        n_ranked = random.randint(min(2, len(candidate_ids)), len(candidate_ids))
        for rank, cid in enumerate(random.sample(candidate_ids, n_ranked), 1):
            db_execute("""
                INSERT INTO rcv_ranking (id, ballot_id, proposal_post_id, rank)
                VALUES (gen_random_uuid(), %s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (ballot_id, cid, rank))
        ballot_count += 1

    # -- Voting closed: compute RCV tally --
    db_execute("UPDATE voting_round SET status = 'voting_closed' WHERE id = %s",
               (vr_id,))

    winner_id = None
    tally_msg = ""
    try:
        tally_path = os.path.join(os.path.dirname(__file__),
                                  '..', 'server', 'controllers', 'helpers')
        if tally_path not in sys.path:
            sys.path.insert(0, tally_path)
        from rcv_tally import tally_results as compute_tally

        class _DBAdapter:
            def __init__(self, c):
                self._c = c
            def execute_query(self, query, params=None, fetchone=False, **kw):
                with self._c.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(query, params)
                    return cur.fetchone() if fetchone else cur.fetchall()

        conn = db_conn()
        results = compute_tally(vr_id, _DBAdapter(conn))
        conn.close()
        if results:
            db_execute("UPDATE voting_round SET results_json = %s WHERE id = %s",
                       (json.dumps(results), vr_id))
            winner_id = results.get("winner_id")
            tally_msg = f" ({results.get('method', '?')})"
    except Exception as e:
        tally_msg = f" (tally error: {e})"

    endorse_total = sum(endorsement_counts.values())
    with print_lock:
        print(f"      Voting ({round_type}): {endorse_total} endorsements, "
              f"{len(top_proposals)} candidates, {ballot_count} ballots{tally_msg}")

    # All endorsed/voted proposals stay finalized.
    # Pick winner from tally or fall back to top-endorsed.
    if not winner_id and top_proposals:
        winner_id = str(top_proposals[0]["id"])

    return winner_id


def phase_3_staged_content(api, session_map, location_ids, all_users, dry_run=False):
    """Stage loop: reset sessions to proposal_issue, create content at each stage
    via API, then advance.

    Loads positions, posts, and comments from seed_data/sessions/*.json via
    the template engine. Each post carries its own comments list.

    location_ids: maps location codes (OR, CA, TX, MULT, PDX, LA, LAX, TRAV, AUS) to UUIDs.
    """
    print("\n" + "=" * 60)
    print("PHASE 3: Staged Content (positions + posts + comments + votes)")
    print("=" * 60)

    # Load content from JSON + template engine
    seed_content = _load_seed_content()
    ALL_POSITIONS = seed_content["positions"]
    ALL_POSTS = seed_content["posts"]

    # Idempotency: skip if seed-generated positions already exist
    existing = db_query_one(
        "SELECT count(*) as cnt FROM position WHERE creator_user_id NOT IN "
        "(SELECT id FROM users WHERE username IN "
        "('admin1','moderator1','moderator2','normal1','normal2','normal3','normal4','normal5'))")
    if existing and existing['cnt'] > 10:
        print(f"  Content already exists ({existing['cnt']} positions), skipping")
        # Return existing positions for downstream phases
        positions_created = []
        for pos_data in ALL_POSITIONS:
            row = db_query_one("SELECT id FROM position WHERE statement = %s",
                               (pos_data["statement"],))
            if row:
                positions_created.append({"id": str(row["id"]),
                                          "statement": pos_data["statement"],
                                          "votes": pos_data["votes"],
                                          "session": pos_data["session"]})
        return positions_created

    if dry_run:
        print(f"  Would create {len(ALL_POSITIONS)} positions, {len(ALL_POSTS)} posts")
        return [{"id": f"dry-{i}", "statement": p["statement"], "votes": p["votes"],
                 "session": p["session"]} for i, p in enumerate(ALL_POSITIONS)]

    # --- Step 1: Reset all sessions to proposal_issue ---
    print("  Resetting all sessions to proposal_issue...")
    admin1_id = db_query_one("SELECT id FROM users WHERE username = 'admin1'")
    if admin1_id:
        admin1_uuid = str(admin1_id["id"])
        conn = db_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE session SET stage = 'proposal_issue',
                           stage_changed_at = NOW(),
                           stage_changed_by = %s
                """, (admin1_uuid,))
                # Clear stage history from basic.sql so it doesn't conflict
                cur.execute("DELETE FROM session_stage_history")
                conn.commit()
        finally:
            conn.close()

    # --- Step 2: Build session → state/location mapping ---
    sess_state = {}    # session_label → parent state code (OR/CA/TX) for user selection
    sess_loc = {}      # session_label → actual location code (MULT, PDX, etc.)
    sess_target = {}   # session_label → target stage
    for label, cfg in SESSION_CONFIG.items():
        sess_loc[label] = cfg["location"]
        sess_state[label] = LOCATION_TO_STATE.get(cfg["location"], "OR")
        sess_target[label] = cfg["target"]

    # Creators per belief system per state (user_1 for OR, user_6 for CA, user_11 for TX)
    # Always use the first user index so _user_1 variants get user_positions from
    # creation — CHAT_PAIRINGS depends on _user_1 having positions.
    def _creator_for_session(session_label, pos_index):
        """Pick a creator username from the right state for a session."""
        state = sess_state.get(session_label, "OR")
        lo, _hi = STATE_USER_RANGES[state]
        prefixes = ["prog", "lib", "socdem", "soc", "mod",
                     "cen", "libt", "con", "pop", "trad"]
        prefix = prefixes[pos_index % len(prefixes)]
        return f"{prefix}_user_{lo}"

    # --- Step 3: Stage loop ---
    positions_created = []
    posts_created = []
    post_id_map = {}  # (session, post_index_in_stage) → post_id

    # Login as admin1 for session advancement
    if not api.login("admin1"):
        print("  ERROR: Could not login as admin1")
        return positions_created

    for stage_idx, current_stage in enumerate(STAGE_ORDER):
        # Which sessions are active at this stage?
        active_sessions = [label for label, target in sess_target.items()
                           if STAGE_ORDER.index(target) >= stage_idx]
        stop_here = [label for label, target in sess_target.items()
                     if target == current_stage]

        if not active_sessions:
            break

        print(f"\n  --- Stage: {current_stage} ({len(active_sessions)} active, "
              f"{len(stop_here)} stopping) ---")

        # 3a. Create positions for this stage
        stage_positions = [p for p in ALL_POSITIONS
                           if p.get("stage", "proposal_issue") == current_stage
                           and p["session"] in active_sessions]

        # Track per-state position index so each state cycles through all
        # 10 prefixes independently (prevents cross-state interleaving)
        state_pos_idx = {"OR": 0, "CA": 0, "TX": 0}
        for pos_data in stage_positions:
            sess_id = session_map.get(pos_data["session"])
            if not sess_id:
                continue
            state = sess_state.get(pos_data["session"], "OR")
            loc_code = sess_loc.get(pos_data["session"], state)
            loc_id = location_ids.get(loc_code)
            if not loc_id:
                continue
            creator = _creator_for_session(pos_data["session"],
                                           state_pos_idx[state])
            state_pos_idx[state] += 1

            if api.login(creator):
                result = api.create_position(pos_data["statement"], sess_id, loc_id)
                if result:
                    positions_created.append({
                        "id": result.get("id"),
                        "statement": pos_data["statement"],
                        "votes": pos_data["votes"],
                        "session": pos_data["session"],
                    })
                    with print_lock:
                        print(f"    Position: {pos_data['statement'][:55]}...")

        # 3b. Vote on new positions (same-state users only)
        if stage_positions and positions_created:
            new_pos = positions_created[-len(stage_positions):]
            _vote_on_positions(api, all_users, new_pos, sess_state)

        # 3c. Create posts for this stage
        stage_posts = [p for p in ALL_POSTS
                       if p.get("stage") == current_stage
                       and p["session"] in active_sessions]

        post_idx_counter = {}  # session → count, for creator selection
        for post_data in stage_posts:
            sess_id = session_map.get(post_data["session"])
            if not sess_id:
                continue
            state = sess_state.get(post_data["session"], "OR")
            loc_code = sess_loc.get(post_data["session"], state)
            loc_id = location_ids.get(loc_code)
            if not loc_id:
                continue

            # Pick creator from correct state, cycling through prefixes
            prefixes = ["prog", "lib", "mod", "con", "cen", "libt",
                         "socdem", "pop", "trad", "normal"]
            pidx = post_idx_counter.get(post_data["session"], 0)
            post_idx_counter[post_data["session"]] = pidx + 1
            prefix = prefixes[pidx % len(prefixes)]
            lo, hi = STATE_USER_RANGES[state]
            user_num = lo + (pidx % (hi - lo + 1))
            creator_name = f"{prefix}_user_{user_num}"

            if api.login(creator_name):
                result = api.create_post(post_data["title"], post_data["body"],
                                         loc_id, sess_id, post_data["type"])
                if result:
                    post_id = result.get("id")
                    posts_created.append({
                        "id": post_id, "session": post_data["session"],
                        "type": post_data["type"], "creator": creator_name,
                    })
                    with print_lock:
                        print(f"    Post: {post_data['title'][:55]}...")

                    # 3d. Create comments (embedded in post_data)
                    comments = post_data.get("comments", [])
                    if comments:
                        _insert_comment_tree_api(api, post_id, comments,
                                                 state, post_data["type"])

                    # 3e. Vote on this post and its comments
                    _vote_on_post_and_comments(api, post_id, all_users, state)
                else:
                    with print_lock:
                        print(f"    WARN: Failed to create post: "
                              f"{post_data['title'][:50]}... "
                              f"(session={post_data['session']}, "
                              f"stage={current_stage})")
            else:
                with print_lock:
                    print(f"    WARN: Login failed for {creator_name} "
                          f"(post: {post_data['title'][:40]}...)")

        # 3f. Advance sessions past this stage (except those stopping here)
        # Use direct DB updates to bypass voting-round guards in the API.
        # For stages requiring a voting round, simulate the full workflow.
        SEED_STAGE_TO_ROUND_TYPE = {
            'proposal_qualify': 'issue_selection',
            'reflection_proposals': 'policy_selection',
        }
        advancing = [label for label in active_sessions if label not in stop_here]
        if advancing and stage_idx < len(STAGE_ORDER) - 1:
            next_stage = STAGE_ORDER[stage_idx + 1]
            admin1_row = db_query_one("SELECT id FROM users WHERE username = 'admin1'")
            admin1_id_str = str(admin1_row['id']) if admin1_row else None
            for label in advancing:
                sess_id = session_map.get(label)
                if not sess_id or not admin1_id_str:
                    continue

                # Simulate voting if this stage requires a completed round
                rt = SEED_STAGE_TO_ROUND_TYPE.get(current_stage)
                if rt:
                    cfg = SESSION_CONFIG.get(label, {})
                    method = cfg.get("proposal_method", "user_driven")
                    if method == "direct_proposal":
                        # Direct proposal: no real voting, just close the round
                        db_execute("""
                            INSERT INTO voting_round (session_id, round_type, status)
                            VALUES (%s, %s, 'voting_closed')
                            ON CONFLICT (session_id, round_type) DO UPDATE
                            SET status = 'voting_closed'
                        """, (sess_id, rt))
                    else:
                        state_code = LOCATION_TO_STATE.get(cfg.get("location", "OR"), "OR")
                        winner_id = _simulate_completed_voting_round(
                            sess_id, label, rt, all_users, state_code)
                        # Pin winning proposal to all future stages.
                        # Use 'proposal' type in proposal stages, 'discussion' in
                        # opinion+ so the accepted proposal appears in the discussion
                        # feed (not a separate proposals tab).
                        PROPOSAL_STAGES = {'proposal_issue', 'proposal_qualify',
                                           'proposal_stakeholders'}
                        if winner_id:
                            for fi in range(stage_idx + 1, len(STAGE_ORDER)):
                                future_stage = STAGE_ORDER[fi]
                                pin_type = 'proposal' if future_stage in PROPOSAL_STAGES else 'discussion'
                                db_execute("""
                                    INSERT INTO pinned_post
                                           (id, post_id, session_id, stage,
                                            post_type, pinned_by, pinned_at)
                                    VALUES (gen_random_uuid(), %s, %s, %s,
                                            %s, %s, NOW())
                                    ON CONFLICT (session_id, stage, post_type, post_id)
                                    DO NOTHING
                                """, (winner_id, sess_id, future_stage,
                                      pin_type, admin1_id_str))

                # Advance directly via DB
                db_execute("""
                    UPDATE session SET stage = %s,
                           stage_changed_at = NOW(),
                           stage_changed_by = %s
                    WHERE id = %s
                """, (next_stage, admin1_id_str, sess_id))
                db_execute("""
                    INSERT INTO session_stage_history
                           (session_id, from_stage, to_stage, changed_by, reason)
                    VALUES (%s, %s, %s, %s, %s)
                """, (sess_id, current_stage, next_stage, admin1_id_str,
                      f"Seed advancement: {current_stage} → {next_stage}"))
                with print_lock:
                    print(f"    Advanced: {label} → {next_stage}")

    # --- Phase 3 summary ---
    expected_posts = len(ALL_POSTS)
    expected_positions = len(ALL_POSITIONS)
    print(f"\n  Phase 3 results:")
    print(f"    Positions: {len(positions_created)}/{expected_positions}"
          f" ({len(positions_created)/expected_positions*100:.0f}%)" if expected_positions else "")
    print(f"    Posts:     {len(posts_created)}/{expected_posts}"
          f" ({len(posts_created)/expected_posts*100:.0f}%)" if expected_posts else "")
    if len(posts_created) < expected_posts:
        print(f"    ⚠ {expected_posts - len(posts_created)} posts failed to create")

    # --- Step 4: Compute Wilson scores for all posts and comments ---
    db_execute("""
        UPDATE post SET score = CASE
            WHEN weighted_upvotes + weighted_downvotes = 0 THEN 0
            ELSE (
                (weighted_upvotes / (weighted_upvotes + weighted_downvotes)
                 + 1.9208 / (weighted_upvotes + weighted_downvotes)
                 - 1.96 * sqrt(
                     (weighted_upvotes / (weighted_upvotes + weighted_downvotes)
                      * (1 - weighted_upvotes / (weighted_upvotes + weighted_downvotes))
                      + 0.9604 / (weighted_upvotes + weighted_downvotes))
                     / (weighted_upvotes + weighted_downvotes)
                 ))
                / (1 + 3.8416 / (weighted_upvotes + weighted_downvotes))
            )
        END
    """)
    db_execute("""
        UPDATE comment SET score = CASE
            WHEN weighted_upvotes + weighted_downvotes = 0 THEN 0
            ELSE (
                (weighted_upvotes / (weighted_upvotes + weighted_downvotes)
                 + 1.9208 / (weighted_upvotes + weighted_downvotes)
                 - 1.96 * sqrt(
                     (weighted_upvotes / (weighted_upvotes + weighted_downvotes)
                      * (1 - weighted_upvotes / (weighted_upvotes + weighted_downvotes))
                      + 0.9604 / (weighted_upvotes + weighted_downvotes))
                     / (weighted_upvotes + weighted_downvotes)
                 ))
                / (1 + 3.8416 / (weighted_upvotes + weighted_downvotes))
            )
        END
    """)

    # --- Step 5: Create voting rounds, set proposal statuses, and pin selected proposals ---
    print("\n  Step 5: Setting up voting rounds and proposal statuses...")

    # Determine which stage index is proposal_qualify
    pq_idx = STAGE_ORDER.index("proposal_qualify")

    for label, cfg in SESSION_CONFIG.items():
        target = cfg["target"]
        target_idx = STAGE_ORDER.index(target)
        method = cfg.get("proposal_method", "user_driven")

        # direct_proposal sessions skip standard voting round creation
        if method == "direct_proposal":
            continue

        # Only sessions that reached or passed proposal_qualify
        if target_idx < pq_idx:
            continue

        sess_id = session_map.get(label)
        if not sess_id:
            continue

        # Determine round type and voting round status based on how far past proposals
        # Sessions at proposal_qualify: proposals_open
        # Sessions at proposal_stakeholders: finalization_open
        # Sessions at opinion_* or later: voting_closed (proposals already selected)
        if target == "proposal_qualify":
            vr_status = "proposals_open"
        elif target == "proposal_stakeholders":
            vr_status = "finalization_open"
        elif target == "reflection_proposals":
            vr_status = "proposals_open"  # Second round (policy) just opened
        else:
            vr_status = "voting_closed"  # Past proposal stages

        # Use issue_selection for proposal_qualify targets, policy_selection for reflection_proposals
        round_type = "policy_selection" if target == "reflection_proposals" else "issue_selection"

        db_execute("""
            INSERT INTO voting_round (id, session_id, round_type, status, ballot_size, winner_count, created_time)
            VALUES (gen_random_uuid(), %s, %s, %s, 7, 1, NOW())
            ON CONFLICT (session_id, round_type) DO NOTHING
        """, (sess_id, round_type, vr_status))

        # Set proposal_status = 'draft' on all proposal posts in this session
        db_execute("""
            UPDATE post SET proposal_status = 'draft'
            WHERE session_id = %s AND post_type = 'proposal' AND proposal_status IS NULL
        """, (sess_id,))

        # Finalization and pinning for advanced sessions is handled in step 3f
        # (via _simulate_completed_voting_round). Only set draft status here.

        print(f"    {label}: voting round ({round_type}, {vr_status}) + proposal statuses set")

    # --- Step 5b: Seed proposal-method-specific data ---
    print("\n  Step 5b: Setting up proposal method seed data...")

    for label, cfg in SESSION_CONFIG.items():
        method = cfg.get("proposal_method", "user_driven")
        if method == "user_driven":
            continue

        sess_id = session_map.get(label)
        if not sess_id:
            continue

        loc_code = cfg["location"]
        loc_id = location_ids.get(loc_code)
        if not loc_id:
            continue

        if method == "direct_proposal":
            # Create a single finalized proposal post
            db_execute("""
                INSERT INTO post (id, creator_user_id, location_id, session_id, post_type,
                                  title, body, proposal_status, created_during_stage)
                VALUES (gen_random_uuid(), %s, %s, %s, 'proposal',
                        'Increase School Funding by 15%%',
                        'This proposal calls for a 15%% increase in public school funding, '
                        'allocated primarily to teacher salaries, classroom resources, and '
                        'after-school programs in underserved communities.',
                        'finalized', 'opinion_discussion')
                ON CONFLICT DO NOTHING
            """, (admin1_uuid, loc_id, sess_id))

            # Pin to all opinion+ stages as 'discussion' type so it appears
            # in the discussion feed (not a proposals tab)
            for stage in ['opinion_discussion', 'reflection_curation', 'reflection_proposals',
                          'consensus']:
                db_execute("""
                    INSERT INTO pinned_post (id, post_id, session_id, stage, post_type, pinned_by, pinned_at)
                    SELECT gen_random_uuid(), p.id, %s, %s, 'discussion', %s, NOW()
                    FROM post p
                    WHERE p.session_id = %s AND p.post_type = 'proposal' AND p.proposal_status = 'finalized'
                    LIMIT 1
                    ON CONFLICT (session_id, stage, post_type, post_id) DO NOTHING
                """, (sess_id, stage, admin1_uuid, sess_id))

            print(f"    {label}: direct_proposal — finalized proposal + pinned to opinion+ stages")

        elif method == "admin_provided":
            # Create draft proposal posts
            admin_proposals = [
                ("Rent Control Cap at 5%", "Implement a 5% annual cap on rent increases for all residential properties."),
                ("Tenant Protection Fund", "Establish a $50M fund providing legal aid and emergency housing for displaced tenants."),
                ("Inclusionary Zoning", "Require 20% affordable units in all new developments over 10 units."),
            ]
            for title, body in admin_proposals:
                db_execute("""
                    INSERT INTO post (id, creator_user_id, location_id, session_id, post_type,
                                      title, body, proposal_status, created_during_stage)
                    VALUES (gen_random_uuid(), %s, %s, %s, 'proposal', %s, %s, 'draft', 'proposal_qualify')
                    ON CONFLICT DO NOTHING
                """, (admin1_uuid, loc_id, sess_id, title, body))

            print(f"    {label}: admin_provided — {len(admin_proposals)} draft proposals + voting round")

    # --- Step 6: Seed endorsements for in-progress voting rounds ---
    # Completed (voting_closed) rounds were already fully simulated in step 3f.
    # This step handles rounds that are still in progress (sessions that stopped
    # at proposal_qualify, proposal_stakeholders, etc.).
    print("\n  Step 6: Seeding endorsements for in-progress voting rounds...")

    voting_rounds = db_query("""
        SELECT vr.id, vr.session_id, vr.status, vr.round_type,
               s.label AS session_label
        FROM voting_round vr
        JOIN session s ON s.id = vr.session_id
        WHERE vr.status != 'voting_closed'
    """)

    for vr in voting_rounds:
        vr_id = str(vr["id"])
        vr_sess_id = str(vr["session_id"])
        vr_status = vr["status"]
        sess_label = vr["session_label"]

        # Find proposal posts in this session
        proposals = db_query("""
            SELECT id, title, upvote_count FROM post
            WHERE session_id = %s AND post_type = 'proposal' AND status = 'active'
            ORDER BY upvote_count DESC, created_time ASC
        """, (vr_sess_id,))
        if not proposals:
            continue

        # Find users from this session's state
        sess_cfg = SESSION_CONFIG.get(sess_label)
        if not sess_cfg:
            continue
        state = LOCATION_TO_STATE.get(sess_cfg["location"], "OR")
        state_users = _users_for_state(all_users, state)
        if not state_users:
            continue

        # Get user UUIDs
        user_uuids = []
        for u in state_users[:20]:
            row = db_query_one("SELECT id FROM users WHERE username = %s", (u["username"],))
            if row:
                user_uuids.append(str(row["id"]))

        if not user_uuids:
            continue

        # Seed endorsements for rounds at finalization_open or later
        if vr_status in ("finalization_open", "proposals_closed"):
            endorsement_counts = {}
            for uid in user_uuids:
                n_endorsements = random.randint(1, min(3, len(proposals)))
                for prop in random.sample(proposals, n_endorsements):
                    pid = str(prop["id"])
                    db_execute("""
                        INSERT INTO proposal_endorsement
                               (id, voting_round_id, proposal_post_id, user_id, created_time)
                        VALUES (gen_random_uuid(), %s, %s, %s, NOW())
                        ON CONFLICT (voting_round_id, proposal_post_id, user_id) DO NOTHING
                    """, (vr_id, pid, uid))
                    endorsement_counts[pid] = endorsement_counts.get(pid, 0) + 1

            endorse_total = sum(endorsement_counts.values())
            print(f"    {sess_label}: {endorse_total} endorsements ({vr_status})")
        else:
            print(f"    {sess_label}: {vr_status} — no endorsements yet")

    print(f"\n  Total positions: {len(positions_created)}")
    print(f"  Total posts: {len(posts_created)}")
    return positions_created


def _vote_on_positions(api, all_users, positions, sess_state):
    """Have same-state users vote on positions with belief-coherent patterns."""
    # Include core users (Oregon) with their lean-appropriate vote patterns
    voters = []
    for username, (vidx, vnoise) in CORE_VOTE_MAP.items():
        voters.append({"username": username, "vote_index": vidx,
                       "vote_noise": vnoise, "state": "OR"})
    for u in all_users:
        voters.append(u)

    # Group positions by session → state
    pos_by_state = {}
    for pos in positions:
        state = sess_state.get(pos.get("session", ""), "OR")
        pos_by_state.setdefault(state, []).append(pos)

    voter_tasks = []
    for voter in voters:
        voter_state = voter.get("state", "OR")
        state_positions = pos_by_state.get(voter_state, [])
        if not state_positions:
            continue
        # 60-85% participation
        vote_fraction = random.uniform(0.60, 0.85)
        n_to_vote = max(1, int(len(state_positions) * vote_fraction))
        voter_positions = random.sample(state_positions,
                                        min(n_to_vote, len(state_positions)))
        vote_plan = []
        for pos_data in voter_positions:
            expected = pos_data["votes"][voter["vote_index"]]
            response = get_vote_response(expected, voter["vote_noise"])
            vote_plan.append((pos_data["id"], response))
        if vote_plan:
            voter_tasks.append((voter["username"], vote_plan))

    def cast_votes(task):
        username, vote_plan = task
        t_api = CandidAPI(api.base_url)
        if not t_api.login(username):
            return 0
        count = 0
        for pos_id, response in vote_plan:
            if t_api.vote(pos_id, response):
                count += 1
        return count

    total = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        total = sum(pool.map(cast_votes, voter_tasks))
    print(f"    Position votes: {total}")


def _insert_comment_tree_api(api, post_id, comments, state, post_type,
                              parent_id=None):
    """Recursively create comments via API, picking users from correct state.

    For question posts, top-level comments (answers) require Q&A authority,
    so we use admin1. Replies to those answers can come from normal users.
    """
    for comment_data in comments:
        prefix = comment_data["author_prefix"]

        # Q&A posts: all comments require Q&A authority chain, use admin1
        if post_type == "question":
            creator = "admin1"
        elif prefix in ("moderator", "admin", "normal"):
            if prefix == "moderator":
                creator = "moderator1"
            elif prefix == "admin":
                creator = "admin1"
            else:
                lo, hi = STATE_USER_RANGES.get(state, (1, 5))
                creator = f"mod_user_{lo}"  # use a moderate user as "normal"
        else:
            lo, hi = STATE_USER_RANGES.get(state, (1, 5))
            user_num = random.randint(lo, hi)
            creator = f"{prefix}_user_{user_num}"

        if not api.login(creator):
            with print_lock:
                print(f"      WARN: Comment login failed for {creator}")
            continue

        result = api.create_comment(post_id, comment_data["body"], parent_id)
        if result:
            comment_id = result.get("id")
            # Recurse into replies
            if comment_id and comment_data.get("replies"):
                _insert_comment_tree_api(api, post_id, comment_data["replies"],
                                         state, post_type, comment_id)
        else:
            with print_lock:
                print(f"      WARN: Comment creation failed "
                      f"(user={creator}, body={comment_data['body'][:40]}...)")


def _vote_on_post_and_comments(api, post_id, all_users, state):
    """Have same-state users vote on a post and its comments.
    Ideologically coherent: same-lean upvotes, opposite-lean downvotes.
    """
    # Get post and comment info from DB
    post = db_query_one("SELECT id, creator_user_id FROM post WHERE id = %s",
                        (post_id,))
    if not post:
        return

    comments = db_query(
        "SELECT id, creator_user_id FROM comment WHERE post_id = %s", (post_id,))

    # Get state users (5-15 voters per post)
    state_users = _users_for_state(all_users, state)
    # Add core users for Oregon posts
    if state == "OR":
        for username, (vidx, vnoise) in CORE_VOTE_MAP.items():
            state_users.append({"username": username, "vote_index": vidx,
                                "vote_noise": vnoise, "state": "OR",
                                "lean": BELIEF_SYSTEMS.get(
                                    CORE_USER_LEANS.get(username, ""), {}
                                ).get("lean", "moderate")})

    n_voters = min(random.randint(5, 15), len(state_users))
    voters = random.sample(state_users, n_voters)

    post_creator_id = str(post["creator_user_id"])

    def do_vote(voter):
        t_api = CandidAPI(api.base_url)
        if not t_api.login(voter["username"]):
            return 0
        count = 0
        # Vote on post (70% upvote)
        voter_id = db_query_one("SELECT id FROM users WHERE username = %s",
                                (voter["username"],))
        if voter_id and str(voter_id["id"]) != post_creator_id:
            vote_type = "upvote" if random.random() < 0.7 else "downvote"
            reason = None
            if vote_type == "downvote":
                reason = random.choice(["offtopic", "unkind", "low_effort",
                                        "spam", "misinformation"])
            if t_api.vote_on_post(post_id, vote_type, reason):
                count += 1

        # Vote on comments (ideologically coherent)
        voter_lean = PREFIX_LEAN.get(voter.get("belief", "moderate")[:4], 0.0)
        for pfx, lean_val in PREFIX_LEAN.items():
            if voter["username"].startswith(pfx):
                voter_lean = lean_val
                break

        for comment in (comments or []):
            if str(comment["creator_user_id"]) == str(voter_id["id"] if voter_id else ""):
                continue  # no self-votes
            if random.random() > 0.6:
                continue  # not everyone votes on every comment

            # Get comment author's lean
            author = db_query_one(
                "SELECT username FROM users WHERE id = %s",
                (str(comment["creator_user_id"]),))
            if not author:
                continue
            author_lean = 0.0
            for pfx, lv in PREFIX_LEAN.items():
                if author["username"].startswith(pfx):
                    author_lean = lv
                    break

            lean_diff = abs(voter_lean - author_lean)
            upvote_prob = 0.75 - 0.5 * min(lean_diff / 2.0, 1.0)
            upvote_prob = max(0.1, min(0.9, upvote_prob + random.gauss(0, 0.08)))

            vote_type = "upvote" if random.random() < upvote_prob else "downvote"
            reason = None
            if vote_type == "downvote":
                reason = random.choice(["offtopic", "unkind", "low_effort",
                                        "spam", "misinformation"])
            if t_api.vote_on_comment(str(comment["id"]), vote_type, reason):
                count += 1
        return count

    total = 0
    for voter in voters:
        total += do_vote(voter)
    if total > 0:
        print(f"    Post/comment votes: {total}")


def phase_4_votes(api, all_users, positions, dry_run=False):
    """No-op: voting is now handled in phase_3_staged_content."""
    print("\n" + "=" * 60)
    print("PHASE 4: Votes (merged into phase 3)")
    print("=" * 60)
    print("  Skipped (merged into phase 3)")


# ---------------------------------------------------------------------------
# Phase 5: Adoptions
# ---------------------------------------------------------------------------

def phase_5_adoptions(api, all_users, positions, dry_run=False):
    print("\n" + "=" * 60)
    print("PHASE 5: Adoptions")
    print("=" * 60)

    # Idempotency: skip if seed-generated adoptions already exist
    # basic.sql creates ~10 user_positions; seed creates many more
    existing = db_query_one("SELECT count(*) as cnt FROM user_position")
    if existing and existing['cnt'] > 30:
        print(f"  Adoptions already exist ({existing['cnt']}), skipping")
        return

    adopters = list(all_users)
    # Add core users (Oregon) using CORE_VOTE_MAP for belief-coherent adoptions
    for username in ["normal1", "normal2", "normal3", "normal4", "normal5"]:
        if username in CORE_VOTE_MAP:
            vidx, vnoise = CORE_VOTE_MAP[username]
            adopters.append({"username": username, "vote_index": vidx,
                             "vote_noise": vnoise, "state": "OR"})

    if dry_run:
        print("  Total adoptions: (dry run)")
        return

    # Pre-compute adoption targets per user (same-state only)
    adopt_tasks = []
    for user in adopters:
        user_state = user.get("state", "OR")
        targets = []
        for pos_data in positions:
            # Only adopt positions from same state
            pos_state = _get_session_state(pos_data.get("session", ""))
            if pos_state != user_state:
                continue
            expected = pos_data["votes"][user["vote_index"]]
            if expected == 1 and random.random() < 0.3:
                targets.append(pos_data["id"])
                if len(targets) >= 3:
                    break
        if targets:
            adopt_tasks.append((user["username"], targets))

    def do_adoptions(task):
        username, target_ids = task
        t_api = CandidAPI(api.base_url)
        if not t_api.login(username):
            return 0
        count = 0
        for pid in target_ids:
            if t_api.adopt_position(pid):
                count += 1
        return count

    total = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        total = sum(pool.map(do_adoptions, adopt_tasks))
    print(f"  Total adoptions: {total}")


# ---------------------------------------------------------------------------
# Phase 6: Chats (with injected messages)
# ---------------------------------------------------------------------------

CHAT_MESSAGES = [
    [
        ("initiator", "Hi! I saw your position and wanted to discuss it."),
        ("responder", "Sure, I'm happy to chat about it. What's on your mind?"),
        ("initiator", "I think there's more nuance to this issue than people realize."),
        ("responder", "I agree. Most people seem to pick a side without understanding the trade-offs."),
        ("initiator", "[more nuance to this issue](M3)\nExactly. And I think we can find some common ground here."),
        ("responder", "[pick a side without understanding](M4:42-77)\nLet's try. What aspects do you think we agree on?"),
    ],
    [
        ("initiator", "I wanted to understand your perspective better on this."),
        ("responder", "Thanks for reaching out. I appreciate the open dialogue."),
        ("initiator", "I've been thinking about this issue a lot recently."),
        ("responder", "Same here. It's something that affects all of us."),
    ],
    [
        ("initiator", "Interesting position. I have a different take on it."),
        ("responder", "I'd love to hear it. What do you think?"),
        ("initiator", "I think the core issue is really about priorities, not values."),
        ("responder", "That's a fair point. We might agree on more than we think."),
        ("initiator", "Right. The implementation details are where we differ."),
    ],
    [
        ("initiator", "I disagree with your position but I'm curious why you hold it."),
        ("responder", "Fair enough. I think it comes down to lived experience."),
        ("initiator", "Can you give me an example?"),
        ("responder", "Sure. In my community, this issue plays out very differently than the national debate suggests."),
        ("initiator", "[lived experience](M2)\nThat's eye-opening. I hadn't considered that angle."),
        ("responder", "[I hadn't considered that angle](M5)\nAnd I can see how from your vantage point, the concerns you raise are legitimate too."),
        ("initiator", "Maybe the answer isn't one-size-fits-all."),
    ],
    [
        ("initiator", "Your position caught my eye. I voted differently but I respect the reasoning."),
        ("responder", "Thanks for saying that. What made you vote the other way?"),
        ("initiator", "Mostly practical concerns. The principle is sound but implementation worries me."),
        ("responder", "That's actually my biggest worry too, just from the other direction."),
        ("initiator", "So we both want the same outcome, just disagree on the path?"),
        ("responder", "Exactly. That feels like progress."),
    ],
    [
        ("initiator", "Hey, I noticed we voted on opposite sides of this. Want to talk about it?"),
        ("responder", "Absolutely. I think these conversations are what this platform is for."),
        ("initiator", "For me it's about protecting vulnerable people."),
        ("responder", "Same for me, actually. We just define 'vulnerable' differently in this context."),
        ("initiator", "Huh. When you put it that way, I see your point."),
    ],
    [
        ("initiator", "I've been reading arguments on both sides of this and yours stood out."),
        ("responder", "Oh? What made it stand out?"),
        ("initiator", "You acknowledged the downsides of your own position. That's rare."),
        ("responder", "I try to be honest about trade-offs. Nothing is free."),
        ("initiator", "[honest about trade-offs](M4)\nIf more people thought that way, we'd get better policy."),
        ("responder", "Agreed. The all-or-nothing framing in politics is exhausting."),
        ("initiator", "[all-or-nothing framing](M6:12-43)\nCan we at least agree on what the actual trade-offs are?"),
        ("responder", "Yes, let me propose something."),
    ],
    [
        ("initiator", "I read your take and I think we're using the same words differently."),
        ("responder", "That happens a lot in these debates. Which word specifically?"),
        ("initiator", "The way we each define 'fairness' seems different."),
        ("responder", "Good catch. I mean fairness as equal opportunity, not equal outcome."),
        ("initiator", "[equal opportunity, not equal outcome](M4)\nInteresting — I think of fairness more as proportional to need."),
        ("responder", "That distinction explains most of our disagreement, honestly."),
        ("initiator", "Right. Once we agree on the definition, the policy debate gets clearer."),
        ("responder", "[the policy debate gets clearer](M7)\nExactly. We should do this more often."),
    ],
    [
        ("initiator", "Your position makes me uncomfortable, but I think that's a good thing."),
        ("responder", "How so?"),
        ("initiator", "It challenges assumptions I haven't examined in a while."),
        ("responder", "I feel the same about yours. That's why I accepted this chat."),
        ("initiator", "[challenges assumptions](M3)\nSo we're both here to learn, not to win."),
        ("responder", "[here to learn, not to win](M5:37-63)\nYes. What's the strongest argument against your own position?"),
        ("initiator", "Honestly? Implementation cost. The idea is right but the execution is hard."),
        ("responder", "[Implementation cost](M7)\nThat's exactly my concern too, from the other direction."),
    ],
]


def phase_6_chats(api, all_users, positions, dry_run=False):
    print("\n" + "=" * 60)
    print("PHASE 6: Chats")
    print("=" * 60)

    # Check if chats already exist (beyond the seed data)
    existing_count = db_query_one(
        "SELECT count(*) as cnt FROM chat_log WHERE id NOT IN ('b2222222-2222-2222-2222-222222222222', '1d06bf99-4d87-4700-8806-63de8c905eca', '1e665c62-0dc6-45ff-acde-e32d64e5b2ea')")
    if existing_count and existing_count['cnt'] > 0:
        print(f"  Chats already exist ({existing_count['cnt']}), skipping")
        return

    if dry_run:
        print("  Would create ~8 chats")
        return

    # Pair opposing belief systems for interesting cross-spectrum dialogue
    # First 10 get agreed_closure (with agreed statements), rest get user_exit
    CHAT_PAIRINGS = [
        # Responder must have a user_position (only _user_1 variants do)
        ("prog_user_1", "trad_user_1"),    # Progressive <-> Traditionalist
        ("lib_user_1", "con_user_1"),      # Liberal <-> Conservative
        ("socdem_user_1", "pop_user_1"),   # Social Democrat <-> Populist
        ("soc_user_1", "libt_user_1"),     # Socialist <-> Libertarian
        ("mod_user_1", "cen_user_1"),      # Moderate <-> Centrist (same-ish spectrum)
        ("lib_user_2", "pop_user_1"),      # Liberal <-> Populist
        ("prog_user_2", "con_user_1"),     # Progressive <-> Conservative
        ("socdem_user_2", "trad_user_1"),  # Social Democrat <-> Traditionalist
        ("lib_user_3", "libt_user_1"),     # Liberal <-> Libertarian
        ("prog_user_3", "con_user_1"),     # Progressive <-> Conservative
        ("mod_user_2", "con_user_1"),      # Moderate <-> Conservative
        ("soc_user_2", "trad_user_1"),     # Socialist <-> Traditionalist
        ("lib_user_4", "con_user_1"),      # Liberal <-> Conservative
        ("mod_user_3", "pop_user_1"),      # Moderate <-> Populist
        ("cen_user_2", "prog_user_1"),     # Centrist <-> Progressive
    ]

    chats_created = 0
    for i, (initiator_name, responder_name) in enumerate(CHAT_PAIRINGS):
        # Find a user_position for the responder to chat about
        responder_up = db_query_one("""
            SELECT up.id, up.user_id, u.username
            FROM user_position up
            JOIN users u ON up.user_id = u.id
            WHERE u.username = %s AND up.status = 'active'
            LIMIT 1
        """, (responder_name,))

        if not responder_up:
            print(f"  No position for {responder_name}, skipping")
            continue

        if not api.login(initiator_name):
            continue

        result = api.create_chat_request(str(responder_up["id"]))
        if not result:
            continue

        request_id = result.get("id")
        if not request_id:
            continue

        # Accept the request as the responder
        if not api.login(responder_name):
            continue
        if not api.respond_chat_request(request_id, "accepted"):
            continue

        # Find the chat_log created
        chat_log = db_query_one(
            "SELECT id FROM chat_log WHERE chat_request_id = %s", (request_id,))
        if not chat_log:
            continue

        chat_id = str(chat_log["id"])
        initiator_id = db_query_one("SELECT id FROM users WHERE username = %s",
                                    (initiator_name,))["id"]
        responder_id = responder_up["user_id"]

        # Inject messages
        messages_template = CHAT_MESSAGES[i % len(CHAT_MESSAGES)]
        messages = []
        base_time = datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 48))
        for j, (role, content) in enumerate(messages_template):
            sender = str(initiator_id) if role == "initiator" else str(responder_id)
            msg_time = base_time + timedelta(minutes=j * 3)
            messages.append({
                "id": f"msg{j+1}",
                "senderId": sender,
                "content": content,
                "timestamp": msg_time.isoformat(),
            })

        # First 10 get agreed_closure, rest get user_exit
        if i < 10:
            # Build agreed positions — concrete statements both sides endorsed
            AGREED_STATEMENTS = [
                [
                    "Both sides need to be heard in this debate, not just the loudest voices.",
                    "We should base policy on evidence rather than ideology alone.",
                ],
                [
                    "People across the political spectrum want what's best for their community.",
                    "Compromise doesn't mean abandoning your principles.",
                ],
                [
                    "Economic policy should be evaluated by its real-world outcomes, not just theory.",
                    "Both government programs and market forces have roles to play.",
                ],
                [
                    "Individual rights and community responsibility aren't mutually exclusive.",
                    "We should seek solutions that respect both freedom and fairness.",
                ],
                [
                    "Finding middle ground starts with understanding where the other person is coming from.",
                    "We agree that good-faith dialogue is more productive than shouting matches.",
                ],
                [
                    "Media coverage of this issue oversimplifies both sides.",
                    "Local communities should have more say in how national policies affect them.",
                    "We both want to see less polarization in our politics.",
                ],
                [
                    "The current system isn't working well for most people.",
                    "Reform should be incremental and evidence-based, not ideological.",
                ],
                [
                    "Traditional values and progressive goals aren't always in conflict.",
                    "Families and communities thrive when we invest in people.",
                ],
                [
                    "Personal liberty includes the freedom to make choices others disagree with.",
                    "But liberty also means responsibility toward your neighbors.",
                ],
                [
                    "We need more conversations like this one.",
                    "People are more reasonable in person than their online positions suggest.",
                    "We should focus on shared problems rather than competing solutions.",
                ],
            ]
            statements = AGREED_STATEMENTS[i]
            closure_time = base_time + timedelta(minutes=len(messages_template) * 3 + 2)
            agreed_positions = []
            for si, stmt in enumerate(statements):
                proposer = str(initiator_id) if si % 2 == 0 else str(responder_id)
                agreed_positions.append({
                    "id": f"prop{si+1}-{chat_id[:8]}",
                    "proposerId": proposer,
                    "content": stmt,
                    "parentId": None,
                    "status": "accepted",
                    "isClosure": False,
                    "timestamp": (closure_time - timedelta(minutes=(len(statements) - si) * 2)).isoformat(),
                })

            CLOSURE_TEXTS = [
                "We found common ground on the core principles",
                "Good conversation — we agree on more than expected",
                "Productive discussion, found shared values",
                "We narrowed our disagreement to implementation details",
                "Great chat — both learned something new",
                "Agreed on the fundamentals, differ on approach",
                "Found surprising alignment across the aisle",
                "Mutual respect and shared goals discovered",
                "Common ground: we both want better outcomes for people",
                "Both sides made valid points — closing with agreement",
            ]
            # Build explanations — some chats have good-faith explain-position exchanges
            explanations = []
            if i % 3 == 0:
                explanations.append({
                    "id": f"exp1-{chat_id[:8]}",
                    "explainerId": str(initiator_id),
                    "requesterId": str(responder_id),
                    "status": "good_faith",
                    "timestamp": (closure_time - timedelta(minutes=8)).isoformat(),
                })
            if i % 3 <= 1 and i >= 2:
                explanations.append({
                    "id": f"exp2-{chat_id[:8]}",
                    "explainerId": str(responder_id),
                    "requesterId": str(initiator_id),
                    "status": "completed",
                    "timestamp": (closure_time - timedelta(minutes=6)).isoformat(),
                })

            # Build definitions — term clarifications
            definitions = []
            if i % 4 == 0:
                definitions.append({
                    "id": f"def1-{chat_id[:8]}",
                    "term": "social justice",
                    "requesterId": str(responder_id),
                    "status": "accepted",
                    "timestamp": (closure_time - timedelta(minutes=10)).isoformat(),
                })
            if i % 5 == 0:
                definitions.append({
                    "id": f"def2-{chat_id[:8]}",
                    "term": "personal responsibility",
                    "requesterId": str(initiator_id),
                    "status": "both_defined",
                    "timestamp": (closure_time - timedelta(minutes=9)).isoformat(),
                })

            # Build reactions — positive reactions on messages
            reactions = {}
            positive_emojis = ["agree", "appreciate", "grateful", "considering", "respect"]
            for j in range(min(3, len(messages))):
                msg_id = messages[j]["id"]
                reactor = str(responder_id) if messages[j]["senderId"] == str(initiator_id) else str(initiator_id)
                reactions[msg_id] = [{
                    "userId": reactor,
                    "emoji": positive_emojis[(i + j) % len(positive_emojis)],
                    "timestamp": (base_time + timedelta(minutes=j * 3 + 1)).isoformat(),
                }]

            log_json = {
                "messages": messages,
                "agreedPositions": agreed_positions,
                "explanations": explanations,
                "definitions": definitions,
                "reactions": reactions,
                "agreedClosure": {
                    "id": f"closure-{chat_id[:8]}",
                    "proposerId": str(initiator_id),
                    "content": CLOSURE_TEXTS[i % len(CLOSURE_TEXTS)],
                    "timestamp": closure_time.isoformat(),
                },
                "exportTime": (base_time + timedelta(minutes=len(messages_template) * 3 + 5)).isoformat(),
            }
            end_type = "agreed_closure"
        else:
            # Some chats are true abandonments (user disconnected and never
            # returned).  The chat server sets both endedByUserId AND
            # abandonedByUserId for abandonments (end_type='abandoned'),
            # but only endedByUserId for explicit exits (end_type='user_exit').
            # Make roughly half of these abandonments.
            is_abandonment = (i % 2 == 0)

            # Even non-closure chats may have had some productive exchanges
            # before ending.  Add reactions on messages and occasional
            # definitions/explanations so trust score signals are richer.
            exit_reactions = {}
            positive_emojis = ["agree", "appreciate", "grateful", "considering", "respect"]
            for j in range(min(2, len(messages))):
                msg_id = messages[j]["id"]
                reactor = str(responder_id) if messages[j]["senderId"] == str(initiator_id) else str(initiator_id)
                exit_reactions[msg_id] = [{
                    "userId": reactor,
                    "emoji": positive_emojis[(i + j) % len(positive_emojis)],
                    "timestamp": (base_time + timedelta(minutes=j * 3 + 1)).isoformat(),
                }]

            exit_explanations = []
            if i % 3 == 1:
                exit_explanations.append({
                    "id": f"exp-exit-{chat_id[:8]}",
                    "explainerId": str(responder_id),
                    "requesterId": str(initiator_id),
                    "status": "good_faith",
                    "timestamp": (base_time + timedelta(minutes=len(messages_template) * 3)).isoformat(),
                })

            exit_definitions = []
            if i % 4 == 1:
                exit_definitions.append({
                    "id": f"def-exit-{chat_id[:8]}",
                    "term": "common ground",
                    "requesterId": str(initiator_id),
                    "status": "accepted",
                    "timestamp": (base_time + timedelta(minutes=len(messages_template) * 3 - 2)).isoformat(),
                })

            log_json = {
                "messages": messages,
                "agreedPositions": [],
                "explanations": exit_explanations,
                "definitions": exit_definitions,
                "reactions": exit_reactions,
                "agreedClosure": None,
                "endedByUserId": str(initiator_id),
                "exportTime": (base_time + timedelta(minutes=len(messages_template) * 3 + 5)).isoformat(),
            }
            if is_abandonment:
                log_json["abandonedByUserId"] = str(initiator_id)
                end_type = "abandoned"
            else:
                end_type = "user_exit"

        end_time = base_time + timedelta(minutes=len(messages_template) * 3 + 5)
        db_execute("""
            UPDATE chat_log SET log = %s, end_type = %s, end_time = %s, status = 'active'
            WHERE id = %s
        """, (json.dumps(log_json), end_type, end_time, chat_id))

        chats_created += 1
        print(f"  Chat {chats_created}: {initiator_name} <-> {responder_name} ({end_type})")

    print(f"  Total chats: {chats_created}")
    return chats_created


# ---------------------------------------------------------------------------
# Phase 7: Kudos
# ---------------------------------------------------------------------------

def phase_7_kudos(api, dry_run=False):
    print("\n" + "=" * 60)
    print("PHASE 7: Kudos & Trust Scores")
    print("=" * 60)

    # Idempotency: skip if seed-generated kudos already exist
    # (exclude kudos from basic test data in 02-basic-data.sql)
    existing = db_query_one("""
        SELECT count(*) as cnt FROM kudos
        WHERE chat_log_id NOT IN ('b2222222-2222-2222-2222-222222222222',
                                  '1d06bf99-4d87-4700-8806-63de8c905eca',
                                  '1e665c62-0dc6-45ff-acde-e32d64e5b2ea')
    """)
    if existing and existing['cnt'] > 0:
        print(f"  Kudos already exist ({existing['cnt']}), skipping")
    else:
        # Find agreed_closure chats created by our seed (excluding test seed data)
        chats = db_query("""
            SELECT cl.id, cr.initiator_user_id, up.user_id as responder_user_id,
                   u1.username as initiator_name, u2.username as responder_name
            FROM chat_log cl
            JOIN chat_request cr ON cl.chat_request_id = cr.id
            JOIN user_position up ON cr.user_position_id = up.id
            JOIN users u1 ON cr.initiator_user_id = u1.id
            JOIN users u2 ON up.user_id = u2.id
            WHERE cl.end_type = 'agreed_closure'
            AND cl.id NOT IN ('b2222222-2222-2222-2222-222222222222', '1d06bf99-4d87-4700-8806-63de8c905eca')
        """)

        count = 0
        for chat in (chats or []):
            if dry_run:
                count += 2
                continue
            chat_id = str(chat["id"])
            # Initiator sends kudos to responder
            if api.login(chat["initiator_name"]):
                if api.send_kudos(chat_id):
                    count += 1
                    print(f"  Kudos: {chat['initiator_name']} -> {chat['responder_name']}")
            # Responder sends kudos to initiator
            if api.login(chat["responder_name"]):
                if api.send_kudos(chat_id):
                    count += 1
                    print(f"  Kudos: {chat['responder_name']} -> {chat['initiator_name']}")

        print(f"  Total kudos: {count}")

    # Reconcile denormalized kudos_count on users table (safety net)
    if not dry_run:
        db_execute("""
            UPDATE users SET kudos_count = COALESCE(sub.cnt, 0)
            FROM (
                SELECT receiver_user_id, COUNT(*) AS cnt
                FROM kudos WHERE status = 'sent'
                GROUP BY receiver_user_id
            ) sub
            WHERE users.id = sub.receiver_user_id
              AND users.kudos_count IS DISTINCT FROM sub.cnt
        """)

    # Trust scores are computed later in dev.sh, after Polis backfill creates
    # conversations and MF training populates bridging data.  See
    # backend/scripts/compute_trust_scores.py (called from dev.sh).


# ---------------------------------------------------------------------------
# Phase 8: Moderation (ban normal4)
# ---------------------------------------------------------------------------

def phase_8_moderation(api, positions, dry_run=False):
    print("\n" + "=" * 60)
    print("PHASE 8: Moderation")
    print("=" * 60)

    # Check if moderation data already exists
    existing = db_query_one("SELECT count(*) as cnt FROM report")
    if existing and existing['cnt'] > 0:
        print(f"  Reports already exist ({existing['cnt']}), skipping")
        return

    if dry_run:
        print("  Would create moderation scenarios")
        return

    # Rule IDs from seed data
    RULE_VIOLENCE = "b8a7c6d5-e4f3-4a2b-1c0d-9e8f7a6b5c4d"
    RULE_SPAM = "d0c9e8f7-a6b5-4c4d-3e2f-1a0b9c8d7e6f"
    RULE_NOT_POLITICAL = "e1d0f9a8-b7c6-4d5e-4f3a-2b1c0d9e8f7a"

    # Find a position created by normal4 (or a generated very_conservative user)
    normal4_position = db_query_one("""
        SELECT p.id FROM position p
        JOIN users u ON p.creator_user_id = u.id
        WHERE u.username = 'normal4' AND p.status = 'active'
        LIMIT 1
    """)

    # If normal4 doesn't have a position among the seed-created ones, find from generated
    if not normal4_position:
        pop_position = db_query_one("""
            SELECT p.id FROM position p
            JOIN users u ON p.creator_user_id = u.id
            WHERE u.username = 'pop_user_1' AND p.status = 'active'
            LIMIT 1
        """)
        if pop_position:
            normal4_position = pop_position

    if not normal4_position:
        print("  No position found for moderation target, skipping")
        return

    target_position_id = str(normal4_position["id"])

    # Report A: normal2 reports a position for hate speech
    print("  Report A: normal2 reports position for hate speech...")
    if not api.login("normal2"):
        return
    report_a = api.report_position(target_position_id, RULE_VIOLENCE,
                                    "This position contains hostile language")
    if not report_a:
        print("  Failed to create Report A")
        return
    report_a_id = report_a.get("id")

    # Find the username of the position's creator (the "submitter" target)
    target_user = db_query_one("""
        SELECT u.username FROM position p
        JOIN users u ON p.creator_user_id = u.id
        WHERE p.id = %s
    """, (target_position_id,))
    target_username = target_user["username"] if target_user else None

    # moderator1 claims and takes action -> temporary_ban on the submitter
    print("  moderator1 takes action -> temporary_ban...")
    if not api.login("moderator1"):
        return
    api.claim_report(report_a_id)
    action_result = api.take_action(report_a_id, "take_action",
                                     actions=[{"userClass": "submitter", "action": "temporary_ban",
                                              "duration": 14}],
                                     text="Hostile language violating community standards")
    if action_result and target_username:
        mod_action_id = action_result.get("id")
        print(f"  Action taken (ID: {mod_action_id})")

        # The banned user appeals
        print(f"  {target_username} appeals the ban...")
        if api.login(target_username):
            appeal = api.create_appeal(mod_action_id,
                                       "I believe my position was expressing a legitimate political viewpoint, "
                                       "not hate speech. I request a review of this decision.")
            if appeal:
                appeal_id = appeal.get("id")
                print(f"  Appeal created (ID: {appeal_id})")

                # admin1 reviews and denies the appeal (upholds the action)
                print("  admin1 denies the appeal...")
                if api.login("admin1"):
                    api.respond_appeal(appeal_id, "deny",
                                       "The language in this position crosses community guidelines. "
                                       "The temporary ban stands.")

    # Report B: spurious report dismissed by moderator1
    print("  Report B: spurious report (dismissed)...")
    if positions and len(positions) > 5:
        if api.login("normal5"):
            report_b = api.report_position(positions[5]["id"], RULE_NOT_POLITICAL,
                                            "I just disagree with this")
            if report_b:
                if api.login("moderator1"):
                    api.claim_report(report_b["id"])
                    api.take_action(report_b["id"], "mark_spurious",
                                    text="This is a legitimate political position")

    # Report C: warning on a chat (with appeal that gets overturned)
    print("  Report C: warning on chat...")
    chat_for_report = db_query_one("""
        SELECT cl.id, cr.initiator_user_id, u.username
        FROM chat_log cl
        JOIN chat_request cr ON cl.chat_request_id = cr.id
        JOIN users u ON cr.initiator_user_id = u.id
        WHERE cl.id NOT IN ('b2222222-2222-2222-2222-222222222222', '1d06bf99-4d87-4700-8806-63de8c905eca')
        AND cl.status = 'active'
        LIMIT 1
    """)
    if chat_for_report:
        # Need a participant to report
        other_user = db_query_one("""
            SELECT u.username FROM user_position up
            JOIN chat_request cr ON cr.user_position_id = up.id
            JOIN users u ON up.user_id = u.id
            WHERE cr.id = (SELECT chat_request_id FROM chat_log WHERE id = %s)
        """, (str(chat_for_report["id"]),))
        if other_user and api.login(other_user["username"]):
            report_c = api.report_chat(str(chat_for_report["id"]), RULE_SPAM,
                                        "This user was being disruptive")
            if report_c:
                if api.login("moderator1"):
                    api.claim_report(report_c["id"])
                    action_c = api.take_action(report_c["id"], "take_action",
                                    actions=[{"userClass": "submitter", "action": "warning"}],
                                    text="Warning for disruptive behavior")
                    # The warned user appeals and gets it overturned
                    if action_c:
                        warned_username = chat_for_report["username"]
                        print(f"  {warned_username} appeals the warning...")
                        if api.login(warned_username):
                            appeal_c = api.create_appeal(action_c["id"],
                                                          "The chat was a misunderstanding; "
                                                          "I was not being disruptive.")
                            if appeal_c:
                                appeal_c_id = appeal_c.get("id")
                                print(f"  admin1 approves the appeal (overturns warning)...")
                                if api.login("admin1"):
                                    api.respond_appeal(appeal_c_id, "approve",
                                                       "Reviewing the chat log, "
                                                       "this appears to be a misunderstanding. Warning removed.")

    # Report D: dismissed report by moderator1
    print("  Report D: dismissed report...")
    if positions and len(positions) > 10:
        if api.login("normal1"):
            report_d = api.report_position(positions[10]["id"], RULE_NOT_POLITICAL,
                                "This doesn't seem like a normative political statement")
            if report_d:
                if api.login("moderator1"):
                    api.claim_report(report_d["id"])
                    api.take_action(report_d["id"], "dismiss",
                                    text="This position meets the threshold for a normative political statement")

    # Report E: position removed (content removal without ban)
    print("  Report E: position removed...")
    if positions and len(positions) > 15:
        if api.login("normal3"):
            report_e = api.report_position(positions[15]["id"], RULE_SPAM,
                                            "This looks like spam or a test post")
            if report_e:
                if api.login("moderator1"):
                    api.claim_report(report_e["id"])
                    api.take_action(report_e["id"], "take_action",
                                    actions=[{"userClass": "submitter", "action": "removed"}],
                                    text="Position removed as low-quality content")

    # Report F: pending report (unclaimed, for moderator queue demo)
    print("  Report F: pending report (unclaimed)...")
    if positions and len(positions) > 20:
        if api.login("con_user_2"):
            api.report_position(positions[20]["id"], RULE_VIOLENCE,
                                "This position contains inflammatory language about healthcare policy")

    print("  Moderation scenarios complete")


# ---------------------------------------------------------------------------
# Phase 9: Surveys
# ---------------------------------------------------------------------------

def phase_9_surveys(api, dry_run=False):
    print("\n" + "=" * 60)
    print("PHASE 9: Surveys")
    print("=" * 60)

    # Idempotency: skip if survey responses already exist
    existing = db_query_one("SELECT count(*) as cnt FROM survey_question_response")
    if existing and existing['cnt'] > 10:
        print(f"  Survey responses already exist ({existing['cnt']}), skipping")
        return

    SURVEY_ID = "aa111111-1111-1111-1111-111111111111"
    Q1_ID = "dd111111-1111-1111-1111-111111111111"  # Top healthcare priority
    Q2_ID = "dd222222-2222-2222-2222-222222222222"  # Satisfaction with access
    OPT_LOWER_COSTS = "ee111111-1111-1111-1111-111111111111"
    OPT_BETTER_ACCESS = "ee222222-2222-2222-2222-222222222222"
    OPT_QUALITY = "ee333333-3333-3333-3333-333333333333"
    OPT_VERY_SAT = "ee444444-4444-4444-4444-444444444444"
    OPT_SOMEWHAT = "ee555555-5555-5555-5555-555555555555"
    OPT_DISSATISFIED = "ee666666-6666-6666-6666-666666666666"

    # Belief-coherent survey answer mappings (10 belief systems)
    # Q1: priority   Q2: satisfaction
    BELIEF_ANSWERS = {
        "progressive":    {"q1": [OPT_BETTER_ACCESS, OPT_BETTER_ACCESS, OPT_QUALITY],
                           "q2": [OPT_DISSATISFIED, OPT_DISSATISFIED, OPT_SOMEWHAT]},
        "liberal":        {"q1": [OPT_QUALITY, OPT_BETTER_ACCESS, OPT_LOWER_COSTS],
                           "q2": [OPT_SOMEWHAT, OPT_DISSATISFIED, OPT_DISSATISFIED]},
        "social_democrat": {"q1": [OPT_BETTER_ACCESS, OPT_QUALITY, OPT_BETTER_ACCESS],
                           "q2": [OPT_DISSATISFIED, OPT_SOMEWHAT, OPT_DISSATISFIED]},
        "socialist":      {"q1": [OPT_BETTER_ACCESS, OPT_BETTER_ACCESS, OPT_QUALITY],
                           "q2": [OPT_DISSATISFIED, OPT_DISSATISFIED, OPT_SOMEWHAT]},
        "moderate":       {"q1": [OPT_LOWER_COSTS, OPT_QUALITY, OPT_BETTER_ACCESS],
                           "q2": [OPT_SOMEWHAT, OPT_SOMEWHAT, OPT_DISSATISFIED]},
        "centrist":       {"q1": [OPT_LOWER_COSTS, OPT_QUALITY, OPT_LOWER_COSTS],
                           "q2": [OPT_SOMEWHAT, OPT_SOMEWHAT, OPT_VERY_SAT]},
        "libertarian":    {"q1": [OPT_LOWER_COSTS, OPT_LOWER_COSTS, OPT_QUALITY],
                           "q2": [OPT_SOMEWHAT, OPT_SOMEWHAT, OPT_DISSATISFIED]},
        "conservative":   {"q1": [OPT_LOWER_COSTS, OPT_QUALITY, OPT_LOWER_COSTS],
                           "q2": [OPT_SOMEWHAT, OPT_SOMEWHAT, OPT_VERY_SAT]},
        "populist":       {"q1": [OPT_LOWER_COSTS, OPT_LOWER_COSTS, OPT_QUALITY],
                           "q2": [OPT_SOMEWHAT, OPT_VERY_SAT, OPT_SOMEWHAT]},
        "traditionalist": {"q1": [OPT_LOWER_COSTS, OPT_QUALITY, OPT_LOWER_COSTS],
                           "q2": [OPT_VERY_SAT, OPT_SOMEWHAT, OPT_VERY_SAT]},
    }

    # Core users mapped to belief systems for survey coherence
    CORE_BELIEFS = {
        "admin1": "liberal", "moderator1": "conservative", "moderator2": "moderate",
        "normal1": "progressive", "normal2": "conservative", "normal3": "liberal",
        "normal4": "populist", "normal5": "centrist",
    }

    # Build all (username, q1_answer, q2_answer) tasks upfront
    # ~60-80% of users respond to the standard survey
    survey_tasks = []
    for username, belief in CORE_BELIEFS.items():
        opts = BELIEF_ANSWERS[belief]
        survey_tasks.append((username, random.choice(opts["q1"]), random.choice(opts["q2"])))
    for belief, config in BELIEF_SYSTEMS.items():
        opts = BELIEF_ANSWERS[belief]
        for i in range(config["count"]):
            if random.random() > 0.70:
                continue  # ~30% skip the survey
            username = f"{config['prefix']}_user_{i+1}"
            survey_tasks.append((username, random.choice(opts["q1"]), random.choice(opts["q2"])))

    if dry_run:
        print(f"  Survey respondents: {len(survey_tasks)}")
        return

    def respond_survey(task):
        username, q1_ans, q2_ans = task
        t_api = CandidAPI(api.base_url)
        if not t_api.login(username):
            return 0
        t_api.respond_survey(SURVEY_ID, Q1_ID, q1_ans)
        t_api.respond_survey(SURVEY_ID, Q2_ID, q2_ans)
        return 1

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        count = sum(pool.map(respond_survey, survey_tasks))
    print(f"  Survey respondents: {count}")


# ---------------------------------------------------------------------------
# Phase 10: Pairwise
# ---------------------------------------------------------------------------

def phase_10_pairwise(api, dry_run=False):
    print("\n" + "=" * 60)
    print("PHASE 10: Pairwise")
    print("=" * 60)

    # Idempotency: skip if generated users already have pairwise responses
    # (SQL test data creates core-user responses; we need generated-user responses too)
    existing = db_query_one("""
        SELECT count(*) as cnt FROM pairwise_response pr
        JOIN users u ON u.id = pr.user_id
        WHERE u.username LIKE '%%\\_user\\_%%'
    """)
    if existing and existing['cnt'] > 10:
        print(f"  Pairwise responses already exist ({existing['cnt']}), skipping")
        return

    # Pairwise surveys are created by pairwise_surveys.sql — just check they exist
    pairwise_surveys = db_query("""
        SELECT s.id, s.survey_title FROM survey s
        WHERE s.survey_type = 'pairwise' AND s.status = 'active'
    """)

    if not pairwise_surveys:
        print("  No pairwise surveys found (pairwise_surveys.sql may not have run)")
        return

    # Build a map of survey_title -> {item_text -> item_id}
    survey_items = {}
    for survey in pairwise_surveys:
        items = db_query("""
            SELECT id, item_text FROM pairwise_item
            WHERE survey_id = %s ORDER BY item_order
        """, (str(survey["id"]),))
        if items:
            survey_items[survey["survey_title"]] = {
                "survey_id": str(survey["id"]),
                "items": {it["item_text"]: str(it["id"]) for it in items},
            }

    # Belief-coherent label preferences per survey.
    # Each entry is a ranked list from most to least preferred.
    # Users will make 2-3 comparisons per survey picking winners from their
    # preferred end and losers from their non-preferred end.
    PAIRWISE_PREFS = {
        "Oregon Community Labels": {
            # Each belief system's #1 label must be unique and dominant within its Polis group.
            # Left groups: "Liberal" at #3-4 (realistic — progressives prefer "Liberal" over "Centrist").
            # Center groups: "Liberal" and "Conservative" roughly equidistant (balanced moderate).
            # Right groups: "Conservative" at #2-3 (mainstream right label, high cross-group support).
            "progressive":    ["Progressive", "Social Democrat", "Liberal", "Socialist", "Moderate", "Centrist", "Libertarian", "Conservative", "Populist", "Traditionalist"],
            "liberal":        ["Liberal", "Progressive", "Social Democrat", "Moderate", "Centrist", "Libertarian", "Socialist", "Conservative", "Populist", "Traditionalist"],
            "social_democrat": ["Social Democrat", "Progressive", "Liberal", "Socialist", "Moderate", "Centrist", "Libertarian", "Conservative", "Populist", "Traditionalist"],
            "socialist":      ["Socialist", "Social Democrat", "Progressive", "Liberal", "Moderate", "Centrist", "Libertarian", "Conservative", "Populist", "Traditionalist"],
            "moderate":       ["Moderate", "Centrist", "Liberal", "Conservative", "Progressive", "Libertarian", "Social Democrat", "Populist", "Socialist", "Traditionalist"],
            "centrist":       ["Centrist", "Moderate", "Conservative", "Liberal", "Libertarian", "Populist", "Progressive", "Traditionalist", "Social Democrat", "Socialist"],
            "libertarian":    ["Libertarian", "Conservative", "Centrist", "Moderate", "Populist", "Traditionalist", "Liberal", "Social Democrat", "Progressive", "Socialist"],
            "conservative":   ["Conservative", "Libertarian", "Traditionalist", "Centrist", "Populist", "Moderate", "Liberal", "Social Democrat", "Progressive", "Socialist"],
            "populist":       ["Populist", "Conservative", "Traditionalist", "Libertarian", "Centrist", "Moderate", "Liberal", "Social Democrat", "Progressive", "Socialist"],
            "traditionalist": ["Traditionalist", "Conservative", "Populist", "Libertarian", "Centrist", "Moderate", "Liberal", "Social Democrat", "Progressive", "Socialist"],
        },
        "Healthcare Policy Labels": {
            "progressive":    ["State-Run System", "Universal Coverage", "Public-Private Hybrid", "Market-Based"],
            "liberal":        ["Universal Coverage", "Public-Private Hybrid", "State-Run System", "Market-Based"],
            "social_democrat": ["Universal Coverage", "State-Run System", "Public-Private Hybrid", "Market-Based"],
            "socialist":      ["State-Run System", "Universal Coverage", "Public-Private Hybrid", "Market-Based"],
            "moderate":       ["Public-Private Hybrid", "Universal Coverage", "Market-Based", "State-Run System"],
            "centrist":       ["Public-Private Hybrid", "Market-Based", "Universal Coverage", "State-Run System"],
            "libertarian":    ["Market-Based", "Public-Private Hybrid", "Universal Coverage", "State-Run System"],
            "conservative":   ["Market-Based", "Public-Private Hybrid", "Universal Coverage", "State-Run System"],
            "populist":       ["Market-Based", "Public-Private Hybrid", "Universal Coverage", "State-Run System"],
            "traditionalist": ["Market-Based", "Public-Private Hybrid", "Universal Coverage", "State-Run System"],
        },
        "Economy & Tax Policy Labels": {
            "progressive":    ["Progressive Taxation", "Regulated Economy", "Low Taxes", "Free Market"],
            "liberal":        ["Regulated Economy", "Progressive Taxation", "Low Taxes", "Free Market"],
            "social_democrat": ["Progressive Taxation", "Regulated Economy", "Low Taxes", "Free Market"],
            "socialist":      ["Progressive Taxation", "Regulated Economy", "Low Taxes", "Free Market"],
            "moderate":       ["Regulated Economy", "Low Taxes", "Progressive Taxation", "Free Market"],
            "centrist":       ["Low Taxes", "Regulated Economy", "Free Market", "Progressive Taxation"],
            "libertarian":    ["Free Market", "Low Taxes", "Regulated Economy", "Progressive Taxation"],
            "conservative":   ["Low Taxes", "Free Market", "Regulated Economy", "Progressive Taxation"],
            "populist":       ["Low Taxes", "Free Market", "Regulated Economy", "Progressive Taxation"],
            "traditionalist": ["Free Market", "Low Taxes", "Regulated Economy", "Progressive Taxation"],
        },
        "Education Policy Labels": {
            "progressive":    ["Public Schools First", "Charter Schools", "Local Control", "School Choice"],
            "liberal":        ["Public Schools First", "Charter Schools", "Local Control", "School Choice"],
            "social_democrat": ["Public Schools First", "Charter Schools", "Local Control", "School Choice"],
            "socialist":      ["Public Schools First", "Charter Schools", "Local Control", "School Choice"],
            "moderate":       ["Charter Schools", "Local Control", "Public Schools First", "School Choice"],
            "centrist":       ["Charter Schools", "Local Control", "School Choice", "Public Schools First"],
            "libertarian":    ["School Choice", "Local Control", "Charter Schools", "Public Schools First"],
            "conservative":   ["School Choice", "Local Control", "Charter Schools", "Public Schools First"],
            "populist":       ["School Choice", "Local Control", "Charter Schools", "Public Schools First"],
            "traditionalist": ["School Choice", "Local Control", "Charter Schools", "Public Schools First"],
        },
        "Environment & Climate Labels": {
            "progressive":    ["Green New Deal", "Balanced Approach", "Innovation-Driven", "Business First"],
            "liberal":        ["Green New Deal", "Balanced Approach", "Innovation-Driven", "Business First"],
            "social_democrat": ["Green New Deal", "Balanced Approach", "Innovation-Driven", "Business First"],
            "socialist":      ["Green New Deal", "Balanced Approach", "Innovation-Driven", "Business First"],
            "moderate":       ["Balanced Approach", "Innovation-Driven", "Green New Deal", "Business First"],
            "centrist":       ["Innovation-Driven", "Balanced Approach", "Business First", "Green New Deal"],
            "libertarian":    ["Innovation-Driven", "Business First", "Balanced Approach", "Green New Deal"],
            "conservative":   ["Business First", "Innovation-Driven", "Balanced Approach", "Green New Deal"],
            "populist":       ["Business First", "Innovation-Driven", "Balanced Approach", "Green New Deal"],
            "traditionalist": ["Business First", "Innovation-Driven", "Balanced Approach", "Green New Deal"],
        },
        "Immigration Policy Labels": {
            "progressive":    ["Pathway to Citizenship", "Compassionate Reform", "Merit-Based", "Border Enforcement"],
            "liberal":        ["Compassionate Reform", "Pathway to Citizenship", "Merit-Based", "Border Enforcement"],
            "social_democrat": ["Pathway to Citizenship", "Compassionate Reform", "Merit-Based", "Border Enforcement"],
            "socialist":      ["Pathway to Citizenship", "Compassionate Reform", "Merit-Based", "Border Enforcement"],
            "moderate":       ["Merit-Based", "Compassionate Reform", "Pathway to Citizenship", "Border Enforcement"],
            "centrist":       ["Merit-Based", "Compassionate Reform", "Border Enforcement", "Pathway to Citizenship"],
            "libertarian":    ["Merit-Based", "Border Enforcement", "Compassionate Reform", "Pathway to Citizenship"],
            "conservative":   ["Border Enforcement", "Merit-Based", "Compassionate Reform", "Pathway to Citizenship"],
            "populist":       ["Border Enforcement", "Merit-Based", "Compassionate Reform", "Pathway to Citizenship"],
            "traditionalist": ["Border Enforcement", "Merit-Based", "Compassionate Reform", "Pathway to Citizenship"],
        },
        "Civil Rights Policy Labels": {
            "progressive":    ["Rights Expansion", "Civil Libertarian", "Balanced Protection", "Constitutional Originalist"],
            "liberal":        ["Rights Expansion", "Civil Libertarian", "Balanced Protection", "Constitutional Originalist"],
            "social_democrat": ["Rights Expansion", "Balanced Protection", "Civil Libertarian", "Constitutional Originalist"],
            "socialist":      ["Rights Expansion", "Civil Libertarian", "Balanced Protection", "Constitutional Originalist"],
            "moderate":       ["Balanced Protection", "Civil Libertarian", "Rights Expansion", "Constitutional Originalist"],
            "centrist":       ["Balanced Protection", "Civil Libertarian", "Constitutional Originalist", "Rights Expansion"],
            "libertarian":    ["Civil Libertarian", "Constitutional Originalist", "Balanced Protection", "Rights Expansion"],
            "conservative":   ["Constitutional Originalist", "Balanced Protection", "Civil Libertarian", "Rights Expansion"],
            "populist":       ["Constitutional Originalist", "Balanced Protection", "Civil Libertarian", "Rights Expansion"],
            "traditionalist": ["Constitutional Originalist", "Balanced Protection", "Civil Libertarian", "Rights Expansion"],
        },
        "Criminal Justice Policy Labels": {
            "progressive":    ["Reform & Rehabilitation", "Restorative Justice", "Balanced Approach", "Tough on Crime"],
            "liberal":        ["Reform & Rehabilitation", "Restorative Justice", "Balanced Approach", "Tough on Crime"],
            "social_democrat": ["Restorative Justice", "Reform & Rehabilitation", "Balanced Approach", "Tough on Crime"],
            "socialist":      ["Restorative Justice", "Reform & Rehabilitation", "Balanced Approach", "Tough on Crime"],
            "moderate":       ["Balanced Approach", "Reform & Rehabilitation", "Restorative Justice", "Tough on Crime"],
            "centrist":       ["Balanced Approach", "Tough on Crime", "Reform & Rehabilitation", "Restorative Justice"],
            "libertarian":    ["Balanced Approach", "Tough on Crime", "Reform & Rehabilitation", "Restorative Justice"],
            "conservative":   ["Tough on Crime", "Balanced Approach", "Reform & Rehabilitation", "Restorative Justice"],
            "populist":       ["Tough on Crime", "Balanced Approach", "Reform & Rehabilitation", "Restorative Justice"],
            "traditionalist": ["Tough on Crime", "Balanced Approach", "Reform & Rehabilitation", "Restorative Justice"],
        },
        "Foreign Policy Labels": {
            "progressive":    ["Diplomacy First", "Non-Interventionist", "Global Leadership", "Peace Through Strength"],
            "liberal":        ["Diplomacy First", "Global Leadership", "Non-Interventionist", "Peace Through Strength"],
            "social_democrat": ["Diplomacy First", "Non-Interventionist", "Global Leadership", "Peace Through Strength"],
            "socialist":      ["Non-Interventionist", "Diplomacy First", "Global Leadership", "Peace Through Strength"],
            "moderate":       ["Global Leadership", "Diplomacy First", "Peace Through Strength", "Non-Interventionist"],
            "centrist":       ["Global Leadership", "Diplomacy First", "Peace Through Strength", "Non-Interventionist"],
            "libertarian":    ["Non-Interventionist", "Peace Through Strength", "Global Leadership", "Diplomacy First"],
            "conservative":   ["Peace Through Strength", "Global Leadership", "Non-Interventionist", "Diplomacy First"],
            "populist":       ["Peace Through Strength", "Non-Interventionist", "Global Leadership", "Diplomacy First"],
            "traditionalist": ["Peace Through Strength", "Non-Interventionist", "Global Leadership", "Diplomacy First"],
        },
        "Government & Democracy Labels": {
            "progressive":    ["Active Government", "Direct Democracy", "Constitutional Republic", "Limited Government"],
            "liberal":        ["Active Government", "Direct Democracy", "Constitutional Republic", "Limited Government"],
            "social_democrat": ["Active Government", "Direct Democracy", "Constitutional Republic", "Limited Government"],
            "socialist":      ["Active Government", "Direct Democracy", "Constitutional Republic", "Limited Government"],
            "moderate":       ["Direct Democracy", "Constitutional Republic", "Active Government", "Limited Government"],
            "centrist":       ["Constitutional Republic", "Direct Democracy", "Limited Government", "Active Government"],
            "libertarian":    ["Limited Government", "Constitutional Republic", "Direct Democracy", "Active Government"],
            "conservative":   ["Limited Government", "Constitutional Republic", "Direct Democracy", "Active Government"],
            "populist":       ["Limited Government", "Constitutional Republic", "Direct Democracy", "Active Government"],
            "traditionalist": ["Constitutional Republic", "Limited Government", "Direct Democracy", "Active Government"],
        },
        "Social Issues Labels": {
            "progressive":    ["Social Progressive", "Individual Liberty", "Community Values", "Social Conservative"],
            "liberal":        ["Social Progressive", "Individual Liberty", "Community Values", "Social Conservative"],
            "social_democrat": ["Social Progressive", "Individual Liberty", "Community Values", "Social Conservative"],
            "socialist":      ["Social Progressive", "Individual Liberty", "Community Values", "Social Conservative"],
            "moderate":       ["Individual Liberty", "Social Progressive", "Community Values", "Social Conservative"],
            "centrist":       ["Individual Liberty", "Community Values", "Social Progressive", "Social Conservative"],
            "libertarian":    ["Individual Liberty", "Social Progressive", "Social Conservative", "Community Values"],
            "conservative":   ["Social Conservative", "Community Values", "Individual Liberty", "Social Progressive"],
            "populist":       ["Community Values", "Social Conservative", "Individual Liberty", "Social Progressive"],
            "traditionalist": ["Social Conservative", "Community Values", "Individual Liberty", "Social Progressive"],
        },
    }

    # Pre-compute all (username, comparisons_list) tasks
    # Each user responds to a random 40-80% of pairwise surveys
    pairwise_tasks = []
    survey_titles = list(survey_items.keys())

    for belief, config in BELIEF_SYSTEMS.items():
        for i in range(config["count"]):
            username = f"{config['prefix']}_user_{i+1}"
            # Each user only responds to a subset of pairwise surveys
            n_surveys = max(1, int(len(survey_titles) * random.uniform(0.40, 0.80)))
            user_surveys = random.sample(survey_titles, n_surveys)
            comparisons = []
            for survey_title in user_surveys:
                prefs = PAIRWISE_PREFS.get(survey_title, {}).get(belief)
                if not prefs:
                    continue
                sdata = survey_items[survey_title]
                items_map = sdata["items"]
                survey_id = sdata["survey_id"]
                ranked = [label for label in prefs if label in items_map]
                if len(ranked) < 2:
                    continue
                # Generate random pairs from all possible combinations
                # (simulates real app which presents random pairs to users)
                all_pairs = [(ranked[a], ranked[b])
                             for a in range(len(ranked))
                             for b in range(a + 1, len(ranked))]
                n_comparisons = max(3, int(len(all_pairs) * random.uniform(0.20, 0.40)))
                selected_pairs = random.sample(all_pairs, min(n_comparisons, len(all_pairs)))
                for winner_label, loser_label in selected_pairs:
                    if random.random() < config["vote_noise"]:
                        # Noise: swap winner and loser
                        winner_label, loser_label = loser_label, winner_label
                    comparisons.append((survey_id, items_map[winner_label], items_map[loser_label]))
            if comparisons:
                pairwise_tasks.append((username, comparisons))

    if dry_run:
        total = sum(len(c) for _, c in pairwise_tasks)
        print(f"  Pairwise responses: {total}")
        return

    def do_pairwise(task):
        username, comparisons = task
        t_api = CandidAPI(api.base_url)
        if not t_api.login(username):
            return 0
        count = 0
        for survey_id, winner_id, loser_id in comparisons:
            if t_api.respond_pairwise(survey_id, winner_id, loser_id):
                count += 1
        return count

    total = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        total = sum(pool.map(do_pairwise, pairwise_tasks))
    print(f"  Pairwise responses: {total}")


# ---------------------------------------------------------------------------
# Phase 11: Admin (role requests, bans, admin surveys)
# ---------------------------------------------------------------------------

def phase_11_admin(api, location_id, session_map, dry_run=False):
    print("\n" + "=" * 60)
    print("PHASE 11: Admin")
    print("=" * 60)

    oregon_id = location_id
    healthcare_cat = session_map.get("Healthcare Access")
    education_cat = session_map.get("Fall 2025")
    criminal_justice_cat = session_map.get("Criminal Justice")
    environment_cat = session_map.get("Climate Action")

    def lookup_user_id(username):
        row = db_query_one("SELECT id FROM users WHERE username = %s", (username,))
        return str(row['id']) if row else None

    # ---- 11a: Role Change Requests ----
    existing_rcr = db_query_one("SELECT count(*) as cnt FROM role_change_request")
    if existing_rcr and existing_rcr['cnt'] > 0:
        print(f"  Role change requests already exist ({existing_rcr['cnt']}), skipping")
    elif dry_run:
        print("  Would create 6 role change requests")
    else:
        print("  Creating role change requests...")

        # Scenario 1: admin1 → admin for lib_user_2 at Oregon → auto_approved
        # admin1 is the only admin, no peer at US or Oregon → auto-approves.
        # This gives Oregon its own administrator for realistic hierarchy.
        if api.login("admin1"):
            target_id = lookup_user_id("lib_user_2")
            if target_id:
                result = api.request_role_assignment(
                    target_id, "admin", oregon_id,
                    reason="Trusted community leader to administer Oregon")
                if result:
                    print(f"    1. admin for lib_user_2 at Oregon"
                          f" → {result.get('status')}")

        # Scenario 2: admin1 → moderator for mod_user_1 at Oregon
        # → pending (lib_user_2 is now admin at Oregon = peer), then approved
        if api.login("admin1"):
            target_id = lookup_user_id("mod_user_1")
            if target_id:
                result = api.request_role_assignment(
                    target_id, "moderator", oregon_id,
                    reason="Active community member with balanced perspective")
                if result:
                    req_id = result.get('id')
                    status = result.get('status')
                    print(f"    2. moderator for mod_user_1 → {status}")
                    if req_id and status == 'pending':
                        if api.login("lib_user_2"):
                            approve_result = api.approve_role_request(req_id)
                            if approve_result:
                                print(f"       → approved by lib_user_2")

        # Scenario 3: normal1 → assistant_moderator for cen_user_1 at Oregon+Healthcare
        # → pending (moderator1 is a location moderator peer), then moderator1 approves
        if api.login("normal1"):
            target_id = lookup_user_id("cen_user_1")
            if target_id:
                result = api.request_role_assignment(
                    target_id, "assistant_moderator", oregon_id,
                    session_id=healthcare_cat,
                    reason="Reliable community member, helps maintain discussion quality")
                if result:
                    req_id = result.get('id')
                    status = result.get('status')
                    print(f"    3. assistant_moderator for cen_user_1 → {status}")
                    if req_id and status == 'pending':
                        if api.login("moderator1"):
                            approve_result = api.approve_role_request(req_id)
                            if approve_result:
                                print(f"       → approved by moderator1")

        # Scenario 4: normal1 → expert for con_user_1 at Oregon+Healthcare
        # → pending, then moderator1 denies with reason
        if api.login("normal1"):
            target_id = lookup_user_id("con_user_1")
            if target_id:
                result = api.request_role_assignment(
                    target_id, "expert", oregon_id, session_id=healthcare_cat,
                    reason="Would bring diverse perspective to healthcare discussions")
                if result:
                    req_id = result.get('id')
                    status = result.get('status')
                    print(f"    4. expert for con_user_1 → {status}")
                    if req_id and status == 'pending':
                        if api.login("moderator1"):
                            deny_result = api.deny_role_request(
                                req_id,
                                reason="Insufficient experience with the Healthcare session")
                            if deny_result:
                                print(f"       → denied by moderator1")

        # Scenario 5: normal1 → liaison for socdem_user_1 at Oregon+Healthcare
        # → pending, then normal1 rescinds
        if api.login("normal1"):
            target_id = lookup_user_id("socdem_user_1")
            if target_id:
                result = api.request_role_assignment(
                    target_id, "liaison", oregon_id, session_id=healthcare_cat,
                    reason="Healthcare policy researcher with community connections")
                if result:
                    req_id = result.get('id')
                    status = result.get('status')
                    print(f"    5. liaison for socdem_user_1 → {status}")
                    if req_id and status == 'pending':
                        rescind_result = api.rescind_role_request(req_id)
                        if rescind_result:
                            print(f"       → rescinded by normal1")

        # Scenario 6: normal1 → expert for prog_user_1 at Oregon+Healthcare
        # → stays pending (no action taken)
        if api.login("normal1"):
            target_id = lookup_user_id("prog_user_1")
            if target_id:
                result = api.request_role_assignment(
                    target_id, "expert", oregon_id, session_id=healthcare_cat,
                    reason="Active participant in healthcare policy discussions")
                if result:
                    print(f"    6. expert for prog_user_1 → {result.get('status')}")

        # --- CA/TX facilitator and expert role assignments ---
        # admin1 is US-level admin, can assign roles at any location
        ca_id = db_query_one("SELECT id FROM location WHERE code = 'CA'")
        tx_id = db_query_one("SELECT id FROM location WHERE code = 'TX'")
        ca_location_id = str(ca_id["id"]) if ca_id else None
        tx_location_id = str(tx_id["id"]) if tx_id else None

        climate_sess = session_map.get("Climate Action")
        border_sess = session_map.get("Border Communities")
        transit_sess = session_map.get("Transit Expansion")
        family_sess = session_map.get("Family Policy")

        # Scenario 7: admin1 → facilitator for lib_user_7 at California+Climate Action
        if ca_location_id and climate_sess and api.login("admin1"):
            target_id = lookup_user_id("lib_user_7")
            if target_id:
                result = api.request_role_assignment(
                    target_id, "facilitator", ca_location_id,
                    session_id=climate_sess,
                    reason="Environmental policy expert with community facilitation experience")
                if result:
                    print(f"    7. facilitator for lib_user_7 at CA+Climate"
                          f" → {result.get('status')}")

        # Scenario 8: admin1 → expert for con_user_8 at California (location-wide)
        if ca_location_id and api.login("admin1"):
            target_id = lookup_user_id("con_user_8")
            if target_id:
                result = api.request_role_assignment(
                    target_id, "expert", ca_location_id,
                    reason="Policy analyst with deep knowledge of California governance")
                if result:
                    print(f"    8. expert for con_user_8 at CA"
                          f" → {result.get('status')}")

        # Scenario 9: admin1 → facilitator for mod_user_12 at Texas+Border Communities
        if tx_location_id and border_sess and api.login("admin1"):
            target_id = lookup_user_id("mod_user_12")
            if target_id:
                result = api.request_role_assignment(
                    target_id, "facilitator", tx_location_id,
                    session_id=border_sess,
                    reason="Border community organizer with cross-partisan facilitation skills")
                if result:
                    print(f"    9. facilitator for mod_user_12 at TX+Border"
                          f" → {result.get('status')}")

        # Scenario 10: admin1 → liaison for socdem_user_13 at Texas+Family Policy
        if tx_location_id and family_sess and api.login("admin1"):
            target_id = lookup_user_id("socdem_user_13")
            if target_id:
                result = api.request_role_assignment(
                    target_id, "liaison", tx_location_id,
                    session_id=family_sess,
                    reason="Family services professional connecting community stakeholders")
                if result:
                    print(f"    10. liaison for socdem_user_13 at TX+Family"
                          f" → {result.get('status')}")

        # Scenario 11: admin1 → assistant_moderator for cen_user_9 at California
        if ca_location_id and api.login("admin1"):
            target_id = lookup_user_id("cen_user_9")
            if target_id:
                result = api.request_role_assignment(
                    target_id, "assistant_moderator", ca_location_id,
                    reason="Active contributor with balanced perspective in CA discussions")
                if result:
                    print(f"    11. asst_mod for cen_user_9 at CA"
                          f" → {result.get('status')}")

        # Scenario 12: admin1 → expert for libt_user_14 at Texas+Transit Expansion
        if tx_location_id and transit_sess and api.login("admin1"):
            target_id = lookup_user_id("libt_user_14")
            if target_id:
                result = api.request_role_assignment(
                    target_id, "expert", tx_location_id,
                    session_id=transit_sess,
                    reason="Transportation policy analyst familiar with Texas transit planning")
                if result:
                    print(f"    12. expert for libt_user_14 at TX+Transit"
                          f" → {result.get('status')}")

    # ---- 11b: Admin Action Log (ban/unban) ----
    existing_aal = db_query_one("SELECT count(*) as cnt FROM admin_action_log")
    if existing_aal and existing_aal['cnt'] > 0:
        print(f"  Admin action log already has entries ({existing_aal['cnt']}), skipping")
    elif dry_run:
        print("  Would create 4 admin action log entries (2 ban + 2 unban)")
    else:
        print("  Creating admin action log entries...")

        # Ban/unban pop_user_1 by moderator1
        if api.login("moderator1"):
            pop_id = lookup_user_id("pop_user_1")
            if pop_id:
                ban_result = api.ban_user(pop_id, "Repeated hate speech violations")
                if ban_result:
                    print(f"    Ban: moderator1 banned pop_user_1")
                    unban_result = api.unban_user(pop_id,
                                                  "Appeal reviewed \u2014 user warned")
                    if unban_result:
                        print(f"    Unban: moderator1 unbanned pop_user_1")

        # Ban/unban trad_user_1 by admin1
        if api.login("admin1"):
            trad_id = lookup_user_id("trad_user_1")
            if trad_id:
                ban_result = api.ban_user(trad_id, "Spam and harassment")
                if ban_result:
                    print(f"    Ban: admin1 banned trad_user_1")
                    unban_result = api.unban_user(trad_id,
                                                  "Account reclaimed by owner")
                    if unban_result:
                        print(f"    Unban: admin1 unbanned trad_user_1")

    # ---- 11c: Admin-Created Surveys ----
    now = datetime.now(timezone.utc)

    ADMIN_SURVEYS = [
        {
            "title": "Community Safety Priorities",
            "session": "Criminal Justice",
            "start_offset_days": -7,
            "end_offset_days": 23,
            "questions": [
                {
                    "question": "What should be the top priority for improving "
                                "community safety?",
                    "options": [
                        "Increased police presence and response times",
                        "Community-based violence prevention programs",
                        "Better street lighting and infrastructure",
                        "Mental health crisis response teams",
                    ],
                },
                {
                    "question": "How should community safety funding be allocated?",
                    "options": [
                        "Primarily to law enforcement",
                        "Split equally between police and community programs",
                        "Primarily to prevention and social services",
                        "Let each neighborhood decide its own priorities",
                    ],
                },
            ],
        },
        {
            "title": "Education Funding Preferences",
            "session": "Fall 2025",
            "start_offset_days": 7,
            "end_offset_days": 37,
            "questions": [
                {
                    "question": "Which education initiative should receive the most "
                                "additional funding?",
                    "options": [
                        "Teacher salary increases and retention programs",
                        "School infrastructure and technology upgrades",
                        "Student mental health and counseling services",
                    ],
                },
                {
                    "question": "How should education funding decisions be made?",
                    "options": [
                        "Centralized state-level planning",
                        "Local school district control",
                        "A hybrid approach with state guidelines and local flexibility",
                    ],
                },
            ],
        },
    ]

    PAIRWISE_SURVEY = {
        "title": "Top Environmental Concern",
        "session": "Climate Action",
        "start_offset_days": -14,
        "end_offset_days": 16,
        "items": [
            "Air quality and emissions reduction",
            "Water pollution and clean water access",
            "Forest conservation and wildfire prevention",
            "Renewable energy transition",
            "Waste reduction and recycling programs",
        ],
        "comparison_question": "Which environmental issue should Oregon prioritize?",
    }

    all_survey_titles = [s["title"] for s in ADMIN_SURVEYS] + [PAIRWISE_SURVEY["title"]]
    existing_titles = set()
    for title in all_survey_titles:
        row = db_query_one("SELECT id FROM survey WHERE survey_title = %s", (title,))
        if row:
            existing_titles.add(title)

    if len(existing_titles) == len(all_survey_titles):
        print(f"  Admin surveys already exist, skipping creation")
    elif dry_run:
        print("  Would create 3 admin surveys (2 standard + 1 pairwise)")
    else:
        print("  Creating admin surveys...")
        if not api.login("admin1"):
            print("  ERROR: Could not login as admin1 for survey creation")
        else:
            for s in ADMIN_SURVEYS:
                if s["title"] in existing_titles:
                    print(f"    Exists: {s['title']}")
                    continue

                sess_id = session_map.get(s["session"])
                start_time = (now + timedelta(days=s["start_offset_days"])).isoformat()
                end_time = (now + timedelta(days=s["end_offset_days"])).isoformat()
                result = api.create_admin_survey(
                    s["title"], start_time, end_time, s["questions"],
                    location_id=oregon_id, session_id=sess_id)
                if result:
                    print(f"    Created: {s['title']}")
                else:
                    print(f"    FAILED: {s['title']}")

            if PAIRWISE_SURVEY["title"] not in existing_titles:
                sess_id = session_map.get(PAIRWISE_SURVEY["session"])
                start_time = (now + timedelta(
                    days=PAIRWISE_SURVEY["start_offset_days"])).isoformat()
                end_time = (now + timedelta(
                    days=PAIRWISE_SURVEY["end_offset_days"])).isoformat()
                result = api.create_admin_pairwise_survey(
                    PAIRWISE_SURVEY["title"], start_time, end_time,
                    PAIRWISE_SURVEY["items"],
                    comparison_question=PAIRWISE_SURVEY["comparison_question"],
                    location_id=oregon_id, session_id=sess_id)
                if result:
                    print(f"    Created: {PAIRWISE_SURVEY['title']}")
                else:
                    print(f"    FAILED: {PAIRWISE_SURVEY['title']}")

    # ---- 11d: Survey Responses (for active admin surveys) ----
    # 15 diverse users respond to the two active surveys
    respondents = [
        "prog_user_1", "lib_user_1", "lib_user_2", "socdem_user_1",
        "mod_user_1", "mod_user_2", "cen_user_1", "cen_user_2",
        "libt_user_1", "con_user_1", "con_user_2", "pop_user_2",
        "trad_user_2", "normal2", "normal3",
    ]

    # Standard survey: Community Safety Priorities
    safety_survey = db_query_one("""
        SELECT id FROM survey
        WHERE survey_title = 'Community Safety Priorities'
        AND start_time <= NOW() AND end_time > NOW()
    """)
    if safety_survey and not dry_run:
        survey_id = str(safety_survey['id'])
        questions = db_query("""
            SELECT id, survey_question FROM survey_question
            WHERE survey_id = %s
        """, (survey_id,))
        if questions:
            q_options = {}
            for q in questions:
                options = db_query("""
                    SELECT id FROM survey_question_option
                    WHERE survey_question_id = %s
                """, (str(q['id']),))
                q_options[str(q['id'])] = [str(o['id']) for o in (options or [])]

            existing_resp = db_query_one("""
                SELECT count(*) as cnt FROM survey_question_response
                WHERE survey_question_option_id IN (
                    SELECT id FROM survey_question_option
                    WHERE survey_question_id IN (
                        SELECT id FROM survey_question WHERE survey_id = %s
                    )
                )
            """, (survey_id,))
            if existing_resp and existing_resp['cnt'] > 0:
                print(f"  Safety survey responses already exist "
                      f"({existing_resp['cnt']}), skipping")
            else:
                print("  Responding to Community Safety Priorities...")
                count = 0
                for username in respondents:
                    if api.login(username):
                        for q_id, opts in q_options.items():
                            if opts:
                                if api.respond_survey(survey_id, q_id,
                                                      random.choice(opts)):
                                    count += 1
                print(f"    Standard survey responses: {count}")

    # Pairwise survey: Top Environmental Concern
    env_survey = db_query_one("""
        SELECT id FROM survey
        WHERE survey_title = 'Top Environmental Concern'
        AND survey_type = 'pairwise'
        AND start_time <= NOW() AND end_time > NOW()
    """)
    if env_survey and not dry_run:
        survey_id = str(env_survey['id'])
        items = db_query("""
            SELECT id, item_text FROM pairwise_item
            WHERE survey_id = %s ORDER BY item_order
        """, (survey_id,))
        if items:
            item_ids = [str(it['id']) for it in items]
            existing_pw = db_query_one("""
                SELECT count(*) as cnt FROM pairwise_response
                WHERE survey_id = %s
            """, (survey_id,))
            if existing_pw and existing_pw['cnt'] > 0:
                print(f"  Pairwise survey responses already exist "
                      f"({existing_pw['cnt']}), skipping")
            else:
                print("  Responding to Top Environmental Concern...")
                count = 0
                for username in respondents:
                    if api.login(username):
                        n_comparisons = random.randint(3, 4)
                        pairs_used = set()
                        for _ in range(n_comparisons):
                            a, b = random.sample(item_ids, 2)
                            pair_key = tuple(sorted([a, b]))
                            if pair_key in pairs_used:
                                continue
                            pairs_used.add(pair_key)
                            if api.respond_pairwise(survey_id, a, b):
                                count += 1
                print(f"    Pairwise survey responses: {count}")

    if dry_run:
        print("  Would create survey responses for active admin surveys")

    # ---- 11e: Pending report on Healthcare position (for normal1 mod queue) ----
    # normal1 is facilitator at Oregon+Healthcare — give them a pending report to review
    healthcare_pending = db_query_one("""
        SELECT r.id FROM report r
        JOIN position p ON r.target_object_id::uuid = p.id
        WHERE p.session_id = %s AND r.status = 'pending'
        LIMIT 1
    """, (healthcare_cat,))

    if healthcare_pending:
        print(f"  Healthcare pending report already exists, skipping")
    elif dry_run:
        print("  Would create a pending report on a Healthcare position")
    else:
        # Find a Healthcare position at Oregon by a non-privileged user
        target = db_query_one("""
            SELECT p.id FROM position p
            JOIN users u ON p.creator_user_id = u.id
            WHERE p.session_id = %s
              AND p.location_id = %s
              AND p.status = 'active'
              AND u.id NOT IN (
                  SELECT user_id FROM user_role
                  WHERE role IN ('admin', 'moderator', 'facilitator')
              )
            LIMIT 1
        """, (healthcare_cat, oregon_id))

        if target:
            RULE_VIOLENCE = "b8a7c6d5-e4f3-4a2b-1c0d-9e8f7a6b5c4d"
            if api.login("con_user_2"):
                report = api.report_position(
                    str(target['id']), RULE_VIOLENCE,
                    "This position contains inflammatory language about healthcare policy")
                if report:
                    print(f"    Created pending Healthcare report"
                          f" (ID: {report.get('id')})")
                else:
                    print("    Failed to create Healthcare report")
        else:
            print("    No eligible Healthcare position found for report")

    print("  Phase 11 complete")


# ---------------------------------------------------------------------------
# Phase 12: Posts, Comments, and Votes (direct SQL — no API endpoints yet)
# ---------------------------------------------------------------------------

# (Old SEED_POSTS, SEED_COMMENTS, and phase_12_posts removed.
#  All content now lives in seed_data/sessions/*.json and is created via
#  API in phase_3_staged_content.)


def phase_12_posts():
    """No-op: posts, comments, and votes are now created in phase_3_staged_content."""
    print("\n" + "=" * 60)
    print("PHASE 12: Posts, Comments, and Votes (merged into phase 3)")
    print("=" * 60)
    print("  Skipped (merged into phase 3)")


# Phase 13: Notifications — populate notification_inbox from seeded data
# ---------------------------------------------------------------------------

def phase_13_notifications(dry_run=False):
    """Create notification_inbox rows from data created in earlier phases."""
    print("\n" + "=" * 60)
    print("PHASE 13: Notifications")
    print("=" * 60)

    # Idempotency check — earlier API-driven phases may have organically inserted
    # a handful of notifications via push_notifications.py.  Only skip if the
    # count is large enough to indicate phase 13 already ran (>30).  Otherwise,
    # clear the organic rows and re-seed with the full curated set.
    existing = db_query_one("SELECT count(*) as cnt FROM notification_inbox")
    existing_cnt = existing["cnt"] if existing else 0
    if existing_cnt > 30:
        print(f"  Skipping: {existing_cnt} notifications already exist (phase 13 already ran)")
        return
    if existing_cnt > 0:
        print(f"  Clearing {existing_cnt} organic notifications from earlier phases")
        db_execute("DELETE FROM notification_inbox")

    if dry_run:
        print("  Would create notification_inbox rows from seeded data")
        return

    # Build user display name lookup
    all_users = db_query("SELECT id, username, display_name FROM users")
    if not all_users:
        print("  ERROR: No users found")
        return
    user_display = {}
    for u in all_users:
        user_display[str(u["id"])] = u["display_name"] or u["username"]

    # Users who should have unread notifications (for testing bell badge)
    unread_usernames = {"normal1", "normal2", "normal3"}
    unread_user_ids = set()
    for u in all_users:
        if u["username"] in unread_usernames:
            unread_user_ids.add(str(u["id"]))

    notifications = []

    # --- 1. post_comment: top-level comments on posts ---
    top_comments = db_query("""
        SELECT c.id, c.post_id, c.creator_user_id, c.body, c.created_time,
               p.creator_user_id AS post_creator_id
        FROM comment c
        JOIN post p ON c.post_id = p.id
        WHERE c.depth = 0
          AND c.creator_user_id != p.creator_user_id
    """)
    for row in (top_comments or []):
        actor_id = str(row["creator_user_id"])
        user_id = str(row["post_creator_id"])
        actor_name = user_display.get(actor_id, "Someone")
        body = (row["body"] or "")[:80]
        notifications.append({
            "user_id": user_id,
            "actor_user_id": actor_id,
            "notification_type": "post_comment",
            "title": f"{actor_name} commented on your post",
            "body": body,
            "data": json.dumps({"action": "open_post", "postId": str(row["post_id"]),
                                "commentId": str(row["id"])}),
            "created_time": row["created_time"],
        })
    print(f"  post_comment: {len(top_comments or [])} notifications")

    # --- 2. comment_reply: replies to comments ---
    replies = db_query("""
        SELECT c.id, c.post_id, c.creator_user_id, c.body, c.created_time,
               parent.creator_user_id AS parent_creator_id
        FROM comment c
        JOIN comment parent ON c.parent_comment_id = parent.id
        WHERE c.depth > 0
          AND c.creator_user_id != parent.creator_user_id
    """)
    for row in (replies or []):
        actor_id = str(row["creator_user_id"])
        user_id = str(row["parent_creator_id"])
        actor_name = user_display.get(actor_id, "Someone")
        body = (row["body"] or "")[:80]
        notifications.append({
            "user_id": user_id,
            "actor_user_id": actor_id,
            "notification_type": "comment_reply",
            "title": f"{actor_name} replied to your comment",
            "body": body,
            "data": json.dumps({"action": "open_post", "postId": str(row["post_id"]),
                                "commentId": str(row["id"])}),
            "created_time": row["created_time"],
        })
    print(f"  comment_reply: {len(replies or [])} notifications")

    # --- 3. role_change: approved role assignments ---
    role_changes = db_query("""
        SELECT rcr.target_user_id, rcr.requested_by, rcr.role,
               rcr.created_time, l.name AS location_name
        FROM role_change_request rcr
        JOIN location l ON rcr.location_id = l.id
        WHERE rcr.status IN ('approved', 'auto_approved')
          AND rcr.action = 'assign'
    """)
    for row in (role_changes or []):
        user_id = str(row["target_user_id"])
        actor_id = str(row["requested_by"])
        role_label = row["role"].replace("_", " ")
        notifications.append({
            "user_id": user_id,
            "actor_user_id": actor_id,
            "notification_type": "role_change",
            "title": f"You've been assigned the {role_label} role",
            "body": f"at {row['location_name']}",
            "data": json.dumps({"action": "open_organization"}),
            "created_time": row["created_time"],
        })
    print(f"  role_change: {len(role_changes or [])} notifications")

    # --- 5. moderation: actions taken on users ---
    mod_actions = db_query("""
        SELECT mat.user_id, mac.action, mac.class,
               mac.action_end_time, ma.created_time,
               r.target_object_type, ru.title AS rule_title
        FROM mod_action_target mat
        JOIN mod_action_class mac ON mat.mod_action_class_id = mac.id
        JOIN mod_action ma ON mac.mod_action_id = ma.id
        JOIN report r ON ma.report_id = r.id
        LEFT JOIN rule ru ON r.rule_id = ru.id
    """)
    for row in (mod_actions or []):
        user_id = str(row["user_id"])
        action_label = row["action"].replace("_", " ")
        target_type = (row["target_object_type"] or "content").replace("_", " ")
        rule_title = row["rule_title"]

        # Build descriptive title based on action
        if row["action"] in ("permanent_ban", "temporary_ban"):
            title = f"Your account has been {'permanently' if row['action'] == 'permanent_ban' else 'temporarily'} suspended"
        elif row["action"] == "warning":
            title = f"You received a warning about your {target_type}"
        else:
            title = f"Your {target_type} was removed by a moderator"

        # Build body with rule info if available
        body_parts = []
        if rule_title:
            body_parts.append(f"Rule violated: {rule_title}")
        if row["action"] == "temporary_ban" and row["action_end_time"]:
            body_parts.append(f"Ends: {row['action_end_time'].strftime('%b %d, %Y')}")
        body = ". ".join(body_parts) if body_parts else f"Action: {action_label}"

        notifications.append({
            "user_id": user_id,
            "actor_user_id": None,
            "notification_type": "moderation",
            "title": title,
            "body": body,
            "data": json.dumps({}),
            "created_time": row["created_time"],
        })
    print(f"  moderation: {len(mod_actions or [])} notifications")

    if not notifications:
        print("  No notifications to insert (earlier phases may not have run)")
        return

    # --- Insert all notifications ---
    # Mark ~60% as read, but keep unread for target users (normal1/2/3)
    inserted = 0
    read_count = 0
    unread_count = 0

    conn = db_conn()
    try:
        with conn.cursor() as cur:
            for n in notifications:
                # Users in unread_user_ids get ~70% unread; others get ~70% read
                if n["user_id"] in unread_user_ids:
                    is_read = random.random() < 0.3
                else:
                    is_read = random.random() < 0.7

                cur.execute("""
                    INSERT INTO notification_inbox
                        (user_id, actor_user_id, notification_type, title, body, data,
                         is_read, created_time)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    n["user_id"], n["actor_user_id"], n["notification_type"],
                    n["title"], n["body"], n["data"],
                    is_read, n["created_time"],
                ))
                inserted += 1
                if is_read:
                    read_count += 1
                else:
                    unread_count += 1
            conn.commit()
    finally:
        conn.close()

    print(f"  Inserted {inserted} notifications ({read_count} read, {unread_count} unread)")
    print("  Phase 13 complete")


# Phase 14: Glossary terms
def phase_14_glossary(location_id, session_map, dry_run=False):
    """Seed glossary terms with scope tags demonstrating multi-tag usage."""
    print("\n  Phase 14: Glossary terms")

    # Look up location IDs
    us_row = db_query_one("SELECT id FROM location WHERE code = 'US'")
    us_location_id = str(us_row["id"]) if us_row else None
    ca_row = db_query_one("SELECT id FROM location WHERE code = 'CA'")
    ca_location_id = str(ca_row["id"]) if ca_row else None
    tx_row = db_query_one("SELECT id FROM location WHERE code = 'TX'")
    tx_location_id = str(tx_row["id"]) if tx_row else None

    # Look up session IDs (use actual session labels from basic.sql)
    elections_id = session_map.get("Electoral Reform")
    governance_id = session_map.get("Civil Liberties")
    economy_id = session_map.get("Living Wage")
    immigration_id = session_map.get("Border Communities")
    foreign_id = session_map.get("Pacific Defense")
    environment_id = session_map.get("Climate Action")
    criminal_id = session_map.get("Criminal Justice")
    social_id = session_map.get("Family Policy")
    healthcare_id = session_map.get("Healthcare Access")
    rent_id = session_map.get("Rent Stabilization")
    school_id = session_map.get("Fall 2025")
    transit_id = session_map.get("Transit Expansion")
    water_id = session_map.get("Water Rights")

    terms = [
        {
            "slug": "filibuster",
            "term": "Filibuster",
            "aliases": ["filibustering"],
            "summary": "A legislative tactic used to delay or block a vote on a bill by extending debate.",
            "content": "# Filibuster\n\nA **filibuster** is a parliamentary procedure where debate is extended, allowing one or more members to delay or entirely prevent a vote on a given proposal.\n\n## History\n\nThe filibuster has been a feature of the United States Senate since the early 19th century. The term comes from the Spanish *filibustero*, meaning pirate.\n\n## Modern Usage\n\nIn the modern Senate, a filibuster can be ended by invoking [cloture](/en/cloture), which requires 60 votes (three-fifths of the Senate). This effectively means that most major legislation needs 60 votes to pass, rather than a simple majority of 51.\n\n## Related\n\n- [Caucus](/en/caucus) — party coordination that often determines filibuster strategy\n- [Initiative Process](/en/initiative-process) — a way citizens can bypass legislative gridlock",
            "scope_combine": "or",
            "locations": [us_location_id],
            "sessions": [elections_id],
        },
        {
            "slug": "cloture",
            "term": "Cloture",
            "aliases": [],
            "summary": "A Senate procedure to end a filibuster by invoking a vote requiring a three-fifths supermajority.",
            "content": "# Cloture\n\n**Cloture** is a parliamentary procedure used in the United States Senate to end debate on a bill and bring it to a vote. It is the primary mechanism for overcoming a [filibuster](/en/filibuster).\n\n## How It Works\n\n1. A senator files a cloture motion, which must be signed by at least 16 senators\n2. After a one-day waiting period, the Senate votes on the motion\n3. If 60 senators (three-fifths) vote in favor, debate is limited to an additional 30 hours\n4. After the 30 hours expire, the Senate proceeds to a final vote on the underlying measure\n\n## History\n\nThe cloture rule was adopted in 1917 (Senate Rule XXII) after a group of senators filibustered a bill to arm merchant ships during World War I. Originally requiring a two-thirds vote, the threshold was lowered to three-fifths (60 votes) in 1975.\n\n## The Nuclear Option\n\nThe Senate can change its rules by simple majority to lower the cloture threshold for specific types of votes. This has been done for executive nominations (2013) and Supreme Court nominations (2017), eliminating the [filibuster](/en/filibuster) for those categories.",
            "scope_combine": "or",
            "locations": [us_location_id],
            "sessions": [elections_id],
        },
        {
            "slug": "gerrymandering",
            "term": "Gerrymandering",
            "aliases": ["gerrymander", "gerrymandered"],
            "summary": "The practice of drawing electoral district boundaries to favor a particular political party or group.",
            "content": "# Gerrymandering\n\n**Gerrymandering** is the practice of manipulating the boundaries of electoral districts to create an unfair advantage for a particular party or group. It occurs during the [redistricting](/en/redistricting) process that follows each census.\n\n## Types\n\n- **Cracking**: Splitting voters of a type across many districts to dilute their power\n- **Packing**: Concentrating voters of a type into a single district to reduce their influence in surrounding districts\n\n## Legal Status\n\nWhile racial gerrymandering has been ruled unconstitutional, partisan gerrymandering has been more difficult to challenge in courts.\n\n## Related\n\n- [Redistricting](/en/redistricting) — the process through which gerrymandering occurs\n- [Voter ID](/en/voter-id) — another election access issue often discussed alongside gerrymandering",
            "scope_combine": "or",
            "locations": [us_location_id],
            "sessions": [elections_id, governance_id],
        },
        {
            "slug": "redistricting",
            "term": "Redistricting",
            "aliases": ["redistrict", "reapportionment"],
            "summary": "The process of redrawing electoral district boundaries, typically after each census.",
            "content": "# Redistricting\n\n**Redistricting** is the process of redrawing the boundaries of electoral districts, typically after each decennial census to account for population changes.\n\n## Why It Matters\n\nDistrict boundaries determine which voters are grouped together for representation. When done fairly, redistricting ensures equal representation. When manipulated, it becomes [gerrymandering](/en/gerrymandering).\n\n## Who Draws the Lines\n\n- **State legislatures**: In most states, the legislature draws both congressional and state legislative districts\n- **Independent commissions**: Some states (e.g., California, Arizona) use nonpartisan or bipartisan commissions\n- **Hybrid models**: The legislature draws maps but an advisory commission provides input\n\n## Legal Requirements\n\n- **Equal population**: Districts must have roughly equal population (*Reynolds v. Sims*, 1964)\n- **Voting Rights Act**: Districts cannot dilute minority voting power\n- **Contiguity**: Districts must be geographically connected\n\n## Oregon\n\nOregon's legislative districts are drawn by the state legislature. If they fail to agree, the task falls to the Secretary of State. Oregon has considered but not adopted an independent redistricting commission.\n\n## Related\n\n- [Electoral College](/en/electoral-college) — redistricting affects the allocation of electoral votes\n- [Gerrymandering](/en/gerrymandering) — the manipulation of redistricting for partisan advantage",
            "scope_combine": "or",
            "locations": [us_location_id],
            "sessions": [elections_id, governance_id],
        },
        {
            "slug": "initiative-process",
            "term": "Initiative Process",
            "aliases": ["ballot initiative", "citizen initiative"],
            "summary": "A process allowing citizens to propose legislation or constitutional amendments through petition.",
            "content": "# Initiative Process\n\nThe **initiative process** allows citizens to propose new laws or constitutional amendments by gathering a specified number of signatures on a petition.\n\n## Oregon's Initiative Process\n\nOregon was one of the first states to adopt the initiative process in 1902. Citizens can place proposed laws (statutory initiatives) or constitutional amendments on the ballot by collecting signatures equal to a percentage of votes cast in the most recent gubernatorial election.\n\n## Requirements\n\n- Statutory initiatives: 6% of votes cast\n- Constitutional amendments: 8% of votes cast\n- Signatures must be collected within a two-year period\n\n## Notable Oregon Ballot Measures\n\n- [Ballot Measure 118](/en/ballot-measure-118) — proposed corporate tax for universal rebates\n- Oregon's Measure 110 (2020) — [decriminalization](/en/decriminalization) of personal drug possession",
            "scope_combine": "or",
            "locations": [location_id],
            "sessions": [elections_id],
        },
        {
            "slug": "ballot-measure-118",
            "term": "Ballot Measure 118",
            "aliases": ["Measure 118", "Oregon Rebate"],
            "summary": "A 2024 Oregon ballot measure proposing a 3% corporate tax to fund universal rebates to residents.",
            "content": "# Ballot Measure 118\n\n**Ballot Measure 118** was a proposed Oregon [ballot initiative](/en/initiative-process) that would have imposed a 3% tax on corporate sales exceeding $25 million and distributed the revenue equally to all Oregon residents as a rebate.\n\n## Key Details\n\n- Estimated annual rebate: ~$1,600 per resident\n- Funded by: 3% minimum tax on C-corporations with Oregon sales over $25 million\n- The measure was defeated in the November 2024 election\n\n## Related\n\n- [Universal Basic Income](/en/universal-basic-income) — a similar concept of unconditional cash payments to citizens\n- [Initiative Process](/en/initiative-process) — how this measure reached the ballot",
            "scope_combine": "and",
            "locations": [location_id],
            "sessions": [elections_id],
        },
        {
            "slug": "caucus",
            "term": "Caucus",
            "aliases": ["caucuses", "party caucus"],
            "summary": "A meeting of party members to select candidates, plan policy, or coordinate legislative strategy.",
            "content": "# Caucus\n\nA **caucus** is a meeting of members of a political party or movement, typically used to select candidates for elections, coordinate policy positions, or strategize legislative action.\n\n## Types\n\n- **Electoral caucus**: A local meeting where party members gather to select delegates or vote on candidates (e.g., Iowa caucuses). This contrasts with [primary elections](/en/primary-election), which use a standard ballot process\n- **Legislative caucus**: A group of legislators within a party who meet to discuss strategy and coordinate votes, including [filibuster](/en/filibuster) strategy\n- **Issue caucus**: A bipartisan group organized around a specific policy area (e.g., Congressional Black Caucus)\n\n## Related\n\n- [Primary Election](/en/primary-election) — the alternative to caucuses for selecting candidates\n- [Ranked Choice Voting](/en/ranked-choice-voting) — an alternative voting method used in some primaries",
            "scope_combine": "or",
            "locations": [us_location_id],
            "sessions": [elections_id],
        },
        {
            "slug": "primary-election",
            "term": "Primary Election",
            "aliases": ["primary", "primaries"],
            "summary": "An election in which voters choose a party's candidate for the general election.",
            "content": "# Primary Election\n\nA **primary election** is an election held to determine a political party's nominee for a general election. Unlike [caucuses](/en/caucus), primaries use a standard secret ballot.\n\n## Types\n\n- **Closed primary**: Only registered party members can vote in that party's primary\n- **Open primary**: Any registered voter can participate in any party's primary\n- **Semi-closed (or semi-open)**: Registered party members and unaffiliated voters can participate, but voters registered with another party cannot\n- **Top-two primary**: All candidates appear on a single ballot regardless of party; the top two advance to the general election\n\n## Oregon\n\nOregon uses a closed primary system — voters must be registered with a party to vote in that party's primary. Unaffiliated voters cannot participate in major-party primaries.\n\n## Alternative Methods\n\nSome jurisdictions have adopted [Ranked Choice Voting](/en/ranked-choice-voting) for their primaries, allowing voters to rank candidates by preference rather than choosing just one.\n\n## Related\n\n- [Caucus](/en/caucus) — the alternative to primaries for selecting candidates\n- [Electoral College](/en/electoral-college) — the system that ultimately selects the president after primaries and general elections",
            "scope_combine": "or",
            "locations": [us_location_id],
            "sessions": [elections_id],
        },
        {
            "slug": "electoral-college",
            "term": "Electoral College",
            "aliases": ["electors", "electoral votes"],
            "summary": "The system of electors that formally selects the President and Vice President of the United States.",
            "content": "# Electoral College\n\nThe **Electoral College** is the body of electors established by the U.S. Constitution that formally selects the President and Vice President every four years.\n\n## How It Works\n\n- Each state receives a number of electors equal to its total congressional representation (House seats + 2 senators)\n- There are 538 total electoral votes (435 House + 100 Senate + 3 for Washington, D.C.)\n- A candidate needs 270 electoral votes to win\n- Most states use a winner-take-all system: the candidate who wins the state's popular vote receives all its electoral votes\n\n## Criticism\n\n- A candidate can win the presidency without winning the national popular vote (this happened in 2000 and 2016)\n- Candidates focus campaign efforts on a small number of competitive \"swing states\"\n- Smaller states are slightly overrepresented per capita\n\n## Reform Proposals\n\n- **National Popular Vote Interstate Compact**: States pledge their electors to the national popular vote winner\n- **Proportional allocation**: Award electors proportionally rather than winner-take-all\n- **[Ranked Choice Voting](/en/ranked-choice-voting)**: Maine and Alaska use RCV for presidential elections, awarding electoral votes based on ranked preferences\n\n## Related\n\n- [Redistricting](/en/redistricting) — affects the number of House seats (and thus electoral votes) each state receives\n- [Primary Election](/en/primary-election) — the process that determines each party's presidential nominee",
            "scope_combine": "or",
            "locations": [us_location_id],
            "sessions": [elections_id],
        },
        {
            "slug": "ranked-choice-voting",
            "term": "Ranked Choice Voting",
            "aliases": ["RCV", "instant-runoff voting", "preferential voting"],
            "summary": "An electoral system where voters rank candidates by preference, with rounds of elimination until one candidate has a majority.",
            "content": "# Ranked Choice Voting\n\n**Ranked Choice Voting (RCV)** is an electoral system in which voters rank candidates in order of preference. If no candidate receives a majority of first-choice votes, the candidate with the fewest votes is eliminated, and their voters' second choices are redistributed. This process continues until one candidate achieves a majority.\n\n## Advantages\n\n- Reduces the spoiler effect\n- Encourages more civil campaigning\n- Ensures winners have broader support\n\n## Adoption\n\nRCV is used in several US cities and states, including Alaska, Maine, and New York City. It has been proposed as a reform to the [Electoral College](/en/electoral-college) system.\n\n## Related\n\n- [Primary Election](/en/primary-election) — some jurisdictions use RCV in primaries\n- [Caucus](/en/caucus) — an alternative candidate selection method\n- [Electoral College](/en/electoral-college) — the presidential election system RCV could reform",
            "scope_combine": "or",
            "locations": [us_location_id],
            "sessions": [elections_id],
        },
        # --- Terms that appear in position card statements ---
        {
            "slug": "tariff",
            "term": "Tariff",
            "aliases": ["tariffs"],
            "summary": "A tax imposed by a government on imported or exported goods.",
            "content": "# Tariff\n\nA **tariff** is a tax or duty levied on goods crossing international borders, most commonly on imports. Tariffs serve two main purposes:\n\n## Types\n\n- **Protective tariffs**: Designed to shield domestic industries from foreign competition by making imported goods more expensive\n- **Revenue tariffs**: Primarily intended to generate government income\n\n## Arguments For\n\n- Protects domestic jobs and industries\n- Can be used as leverage in trade negotiations\n- Reduces trade deficits\n\n## Arguments Against\n\n- Raises prices for consumers\n- Can provoke retaliatory tariffs (trade wars)\n- Reduces economic efficiency by distorting markets\n- Often harms the industries they aim to protect through higher input costs\n\n## Related\n\n- [Minimum Wage](/en/minimum-wage) — another economic policy affecting workers and prices\n- [NATO](/en/nato) — trade policy and military alliances often intersect in foreign relations",
            "scope_combine": "or",
            "locations": [],
            "sessions": [economy_id],
        },
        {
            "slug": "universal-basic-income",
            "term": "Universal Basic Income",
            "aliases": ["UBI", "basic income"],
            "summary": "A government program providing every citizen with a regular, unconditional cash payment.",
            "content": "# Universal Basic Income\n\n**Universal Basic Income (UBI)** is a social welfare proposal in which all citizens receive a regular, unconditional sum of money from the government, regardless of employment status or income level.\n\n## Key Features\n\n- **Universal**: Given to all citizens, not means-tested\n- **Unconditional**: No work requirements or behavior conditions\n- **Regular**: Paid on a recurring basis (monthly, annually)\n- **Cash**: Recipients choose how to spend it\n\n## Notable Experiments\n\n- Finland's 2017-2018 basic income experiment\n- Stockton, California's SEED program (2019-2021)\n- Alaska's Permanent Fund Dividend (since 1982)\n- Oregon's [Ballot Measure 118](/en/ballot-measure-118), which proposed a corporate-tax-funded universal rebate\n\n## Debate\n\nSupporters argue UBI would reduce poverty, simplify welfare bureaucracy, and provide a safety net for workers displaced by automation. Critics worry about cost, inflation, and reduced work incentives.\n\n## Related\n\n- [Minimum Wage](/en/minimum-wage) — an alternative approach to ensuring a baseline income\n- [Ballot Measure 118](/en/ballot-measure-118) — a UBI-style proposal at the state level\n- [Housing First](/en/housing-first) — another unconditional-support approach to social welfare",
            "scope_combine": "or",
            "locations": [],
            "sessions": [economy_id],
        },
        {
            "slug": "minimum-wage",
            "term": "Minimum Wage",
            "aliases": ["minimum wages", "wage floor"],
            "summary": "The lowest hourly pay rate an employer is legally required to pay workers.",
            "content": "# Minimum Wage\n\nThe **minimum wage** is the lowest hourly compensation that employers are legally required to pay workers. It is set by federal, state, and sometimes local governments.\n\n## Federal Minimum Wage\n\nThe federal minimum wage has been $7.25 per hour since 2009. Many states and cities set higher minimums.\n\n## Arguments For\n\n- Ensures workers earn enough to meet basic needs\n- Reduces income inequality\n- Stimulates consumer spending\n- Reduces reliance on government assistance programs\n\n## Arguments Against\n\n- May lead to job losses, especially for low-skilled workers\n- Can increase costs for small businesses\n- May accelerate automation of low-wage jobs\n- One-size-fits-all rates ignore regional cost-of-living differences\n\n## Oregon\n\nOregon has a tiered minimum wage system:\n- **Portland metro**: $15.95/hr (highest tier)\n- **Standard counties**: $14.70/hr\n- **Nonurban counties**: $13.70/hr\n\nRates are adjusted annually based on inflation (CPI).\n\n## Related\n\n- [Universal Basic Income](/en/universal-basic-income) — an alternative approach to ensuring a baseline income\n- [Rent Control](/en/rent-control) — another policy addressing the cost of living",
            "scope_combine": "or",
            "locations": [],
            "sessions": [economy_id],
        },
        {
            "slug": "sanctuary-city",
            "term": "Sanctuary City",
            "aliases": ["sanctuary cities", "sanctuary state"],
            "summary": "A jurisdiction that limits cooperation with federal immigration enforcement.",
            "content": "# Sanctuary City\n\nA **sanctuary city** (or sanctuary state) is a jurisdiction that adopts policies limiting cooperation between local law enforcement and federal immigration authorities, particularly U.S. Immigration and Customs Enforcement (ICE).\n\n## Common Policies\n\n- Local police do not ask about immigration status during routine encounters\n- Jails do not honor ICE detainer requests without a judicial warrant\n- City resources are not used to enforce federal immigration law\n\n## Arguments For\n\n- Encourages immigrant communities to report crimes without fear of deportation\n- Improves public safety by building trust between police and communities\n- Protects [due process](/en/due-process) rights\n\n## Arguments Against\n\n- May shield individuals who have committed serious crimes\n- Creates tension between local and federal law\n- Could threaten federal funding\n\n## Oregon\n\nOregon has been a sanctuary state since 1987, one of the first in the nation. ORS 181A.820 prohibits state and local law enforcement from using resources to detect or apprehend persons whose only violation is federal immigration law.\n\n## Related\n\n- [DACA](/en/daca) — a federal program protecting certain undocumented immigrants\n- [Due Process](/en/due-process) — the constitutional protections often cited in sanctuary city debates",
            "scope_combine": "or",
            "locations": [location_id],
            "sessions": [immigration_id],
        },
        {
            "slug": "daca",
            "term": "DACA",
            "aliases": ["Deferred Action for Childhood Arrivals", "Dreamers"],
            "summary": "A federal policy deferring deportation for undocumented immigrants who arrived in the U.S. as children.",
            "content": "# DACA\n\n**Deferred Action for Childhood Arrivals (DACA)** is a U.S. immigration policy established by executive action in 2012 that allows certain undocumented immigrants who were brought to the country as children to receive a renewable two-year period of deferred action from deportation and eligibility for a work permit.\n\n## Eligibility Requirements\n\n- Arrived in the U.S. before age 16\n- Continuously resided in the U.S. since June 15, 2007\n- Were under 31 as of June 15, 2012\n- Enrolled in school, graduated, or served in the military\n- No felony convictions, significant misdemeanors, or three or more misdemeanors\n\n## Legal Status\n\nDACA has faced ongoing legal challenges. Federal courts have ruled the program was created without proper administrative procedure, but existing recipients have generally been allowed to renew. The program's long-term future remains uncertain without congressional action.\n\n## By the Numbers\n\n- Approximately 580,000 active DACA recipients as of 2024\n- Recipients are often called \"Dreamers\" after the proposed DREAM Act\n\n## Related\n\n- [Sanctuary City](/en/sanctuary-city) — local policies that complement DACA by limiting immigration enforcement\n- [Due Process](/en/due-process) — constitutional protections relevant to immigration proceedings",
            "scope_combine": "or",
            "locations": [us_location_id],
            "sessions": [immigration_id, governance_id],
        },
        {
            "slug": "due-process",
            "term": "Due Process",
            "aliases": ["due process clause", "procedural due process", "substantive due process"],
            "summary": "The constitutional guarantee that the government must respect legal rights before depriving a person of life, liberty, or property.",
            "content": "# Due Process\n\n**Due process** is a constitutional principle, enshrined in the Fifth and Fourteenth Amendments, that guarantees fair treatment through the normal judicial system. The government cannot deprive any person of life, liberty, or property without following established legal procedures.\n\n## Two Types\n\n- **Procedural due process**: Requires fair procedures before the government acts — notice, a hearing, and an impartial decision-maker\n- **Substantive due process**: Protects certain fundamental rights from government interference regardless of the procedures used\n\n## Applications\n\n- Criminal proceedings: Right to an attorney, right to confront witnesses, right against self-incrimination\n- Civil proceedings: Notice and opportunity to be heard before property can be taken\n- Immigration: Immigrants, including undocumented individuals, have due process rights in removal proceedings (see [DACA](/en/daca) and [Sanctuary City](/en/sanctuary-city))\n- Gun rights: [Background check](/en/background-check) requirements balance [Second Amendment](/en/second-amendment) rights with due process protections\n\n## Related\n\n- [Second Amendment](/en/second-amendment) — gun regulations must satisfy due process requirements\n- [Decriminalization](/en/decriminalization) — shifts enforcement from criminal to civil due process",
            "scope_combine": "or",
            "locations": [us_location_id],
            "sessions": [governance_id],
        },
        {
            "slug": "nato",
            "term": "NATO",
            "aliases": ["North Atlantic Treaty Organization"],
            "summary": "A military alliance of 32 North American and European countries committed to mutual defense.",
            "content": "# NATO\n\n**NATO** (North Atlantic Treaty Organization) is an intergovernmental military alliance established in 1949 by the North Atlantic Treaty (also called the Washington Treaty).\n\n## Core Principle\n\nArticle 5 of the NATO treaty states that an armed attack against one member is considered an attack against all members — the principle of collective defense. It has been invoked only once, after the September 11, 2001 attacks.\n\n## Members\n\nNATO has grown from 12 founding members to 32, most recently adding Finland (2023) and Sweden (2024).\n\n## Debate\n\nSupporters argue NATO has maintained peace in Europe for over 75 years and deters aggression. Critics argue it is costly, provokes adversaries, and that European allies should bear more of the defense burden.\n\n## Related\n\n- [Paris Climate Agreement](/en/paris-climate-agreement) — another major multilateral agreement involving U.S. participation debates\n- [Tariff](/en/tariff) — trade policy often intersects with alliance politics",
            "scope_combine": "or",
            "locations": [],
            "sessions": [foreign_id],
        },
        {
            "slug": "second-amendment",
            "term": "Second Amendment",
            "aliases": ["2nd Amendment", "right to bear arms"],
            "summary": "The amendment to the U.S. Constitution protecting the right to keep and bear arms.",
            "content": "# Second Amendment\n\nThe **Second Amendment** to the United States Constitution reads: *\"A well regulated Militia, being necessary to the security of a free State, the right of the people to keep and bear Arms, shall not be infringed.\"*\n\n## Interpretation\n\nThe Supreme Court has ruled that the Second Amendment protects an individual right to keep and bear arms, not merely a collective right tied to militia service. This was established in *District of Columbia v. Heller* (2008) and further extended in subsequent rulings.\n\nThe scope and limits of this right remain subjects of ongoing legal and political debate, particularly regarding which regulations are constitutionally permissible under [due process](/en/due-process) requirements.\n\n## Key Supreme Court Cases\n\n- *District of Columbia v. Heller* (2008): Individual right to possess firearms for self-defense in the home\n- *McDonald v. City of Chicago* (2010): Second Amendment applies to state and local governments\n- *New York State Rifle & Pistol Association v. Bruen* (2022): Right to carry firearms in public for self-defense; regulations must be consistent with historical tradition\n\n## Related\n\n- [Background Check](/en/background-check) — the primary regulatory mechanism for firearm purchases\n- [Due Process](/en/due-process) — constitutional requirements that gun regulations must satisfy",
            "scope_combine": "or",
            "locations": [us_location_id],
            "sessions": [governance_id],
        },
        {
            "slug": "paris-climate-agreement",
            "term": "Paris Climate Agreement",
            "aliases": ["Paris Agreement", "Paris Accord", "Paris Climate Accord"],
            "summary": "An international treaty on climate change committing nations to limit global warming.",
            "content": "# Paris Climate Agreement\n\nThe **Paris Agreement** is an international treaty on climate change adopted in 2015 at COP21 in Paris. It entered into force on November 4, 2016.\n\n## Goals\n\n- Limit global temperature increase to well below 2°C above pre-industrial levels\n- Pursue efforts to limit the increase to 1.5°C\n- Achieve net-zero greenhouse gas emissions by mid-century\n\n## How It Works\n\nEach country submits **Nationally Determined Contributions (NDCs)** — voluntary pledges to reduce emissions. Countries are expected to strengthen their commitments over time. Many countries use market-based mechanisms like [cap and trade](/en/cap-and-trade) to meet their targets.\n\n## U.S. Involvement\n\nThe U.S. joined under President Obama in 2016, withdrew under President Trump in 2020, and rejoined under President Biden in 2021. The agreement remains politically contentious, with debates over economic costs, national sovereignty, and whether voluntary pledges are sufficient.\n\n## Related\n\n- [Cap and Trade](/en/cap-and-trade) — a market-based approach to reducing emissions\n- [NATO](/en/nato) — another major multilateral agreement debated in U.S. politics",
            "scope_combine": "or",
            "locations": [],
            "sessions": [environment_id],
        },
        {
            "slug": "cap-and-trade",
            "term": "Cap and Trade",
            "aliases": ["emissions trading", "carbon trading", "carbon market"],
            "summary": "A market-based system that sets a limit on emissions and allows companies to buy and sell emission allowances.",
            "content": "# Cap and Trade\n\n**Cap and trade** is a market-based approach to controlling pollution by setting a firm limit (cap) on total emissions and allowing companies to buy and sell emission allowances.\n\n## How It Works\n\n1. **Cap**: The government sets a maximum total amount of emissions allowed across the covered sector\n2. **Allocate**: Emission allowances are distributed (free or auctioned) to companies\n3. **Trade**: Companies that reduce emissions below their allowance can sell surplus permits to companies that exceed theirs\n4. **Reduce**: The cap is lowered over time, driving total emissions down\n\n## Advantages\n\n- Guarantees a specific emission reduction (the cap)\n- Lets the market find the cheapest reductions\n- Generates revenue if allowances are auctioned\n- Creates financial incentive for innovation\n\n## Criticism\n\n- Complex to administer and monitor\n- Permit prices can be volatile, creating uncertainty for businesses\n- May allow pollution to concentrate in disadvantaged communities\n- Can be weakened by political pressure to set caps too high\n\n## Examples\n\n- **EU Emissions Trading System (EU ETS)**: The world's largest cap-and-trade program, covering power generation and heavy industry\n- **California**: Operates a cap-and-trade program linked with Quebec\n- **RGGI**: Nine northeastern U.S. states cooperate on a power-sector cap-and-trade system\n\n## Related\n\n- [Paris Climate Agreement](/en/paris-climate-agreement) — the international framework that cap-and-trade programs help implement",
            "scope_combine": "or",
            "locations": [],
            "sessions": [environment_id],
        },
        {
            "slug": "voter-id",
            "term": "Voter ID",
            "aliases": ["voter identification"],
            "summary": "Laws requiring voters to present identification before casting a ballot.",
            "content": "# Voter ID\n\n**Voter ID laws** require voters to present some form of identification before being allowed to vote. These laws vary significantly by state.\n\n## Types of Laws\n\n- **Strict photo ID**: Must show government-issued photo ID (e.g., driver's license, passport)\n- **Non-strict photo ID**: Photo ID requested but alternatives available (e.g., signing an affidavit)\n- **Strict non-photo ID**: Must show ID but it does not need to include a photo\n- **Non-strict non-photo ID**: ID requested but voters can still cast a regular ballot without one\n\n## Arguments For\n\n- Prevents voter impersonation fraud\n- Increases public confidence in elections\n- Aligns with common practices (ID required for many daily activities)\n\n## Arguments Against\n\n- In-person voter fraud is extremely rare\n- Disproportionately affects minority, elderly, and low-income voters who are less likely to have qualifying ID\n- Can function as a barrier to voting access\n\n## Oregon\n\nOregon does not require photo ID to vote. As a vote-by-mail state, identity is verified through signature matching.\n\n## Related\n\n- [Gerrymandering](/en/gerrymandering) — another election access issue affecting representation\n- [Electoral College](/en/electoral-college) — the broader system through which votes translate to presidential outcomes",
            "scope_combine": "or",
            "locations": [us_location_id],
            "sessions": [elections_id],
        },
        # --- Terms that appear in posts and comments ---
        {
            "slug": "rent-control",
            "term": "Rent Control",
            "aliases": ["rent stabilization", "rent cap"],
            "summary": "Government regulations limiting how much landlords can increase rent.",
            "content": "# Rent Control\n\n**Rent control** (also called rent stabilization) refers to government regulations that limit the amount landlords can increase rent on existing tenants.\n\n## Types\n\n- **Hard rent control**: Freezes rents at a specific level (rare today)\n- **Rent stabilization**: Caps annual increases, often tied to inflation (more common)\n- **Vacancy decontrol**: Allows landlords to reset rent to market rate when a tenant moves out\n\n## Oregon's Law\n\nIn 2019, Oregon became the first state to enact statewide rent control (SB 608). Key provisions:\n- Annual rent increases capped at 7% plus inflation (CPI)\n- Does not apply to buildings less than 15 years old (to encourage new construction)\n- No-cause evictions prohibited after the first year of tenancy\n\n## Debate\n\nSupporters argue rent control prevents displacement and provides housing stability. Critics argue it reduces housing supply by discouraging investment and new construction, and can lead to deteriorating building conditions.\n\n## Related\n\n- [Housing First](/en/housing-first) — another approach to housing affordability and homelessness\n- [Minimum Wage](/en/minimum-wage) — a related cost-of-living policy",
            "scope_combine": "or",
            "locations": [location_id],
            "sessions": [economy_id],
        },
        {
            "slug": "housing-first",
            "term": "Housing First",
            "aliases": ["housing-first"],
            "summary": "An approach to homelessness that prioritizes providing permanent housing before addressing other issues.",
            "content": "# Housing First\n\n**Housing First** is an approach to ending homelessness that prioritizes providing people with permanent housing as quickly as possible, without preconditions like sobriety or employment.\n\n## Core Principles\n\n- Immediate access to permanent housing with no preconditions\n- Consumer choice in housing and services\n- Separation of housing and treatment (housing is not contingent on participation in services)\n- Support services are available but voluntary\n\n## Evidence\n\nResearch consistently shows Housing First programs achieve housing retention rates of 80-90%. Studies in multiple countries (US, Canada, Finland) demonstrate cost savings compared to emergency services, hospitals, and incarceration.\n\n## Criticism\n\n- Does not address root causes of homelessness for all populations\n- May be less effective for individuals with severe untreated mental illness or addiction\n- Requires significant upfront investment in affordable housing stock\n\n## Related\n\n- [Rent Control](/en/rent-control) — policies addressing housing affordability that can prevent homelessness\n- [Universal Basic Income](/en/universal-basic-income) — another unconditional-support approach to social welfare\n- [Decriminalization](/en/decriminalization) — intersects with Housing First through substance use policy",
            "scope_combine": "or",
            "locations": [],
            "sessions": [social_id],
        },
        {
            "slug": "decriminalization",
            "term": "Decriminalization",
            "aliases": ["decriminalize", "decriminalized"],
            "summary": "Reducing or eliminating criminal penalties for certain acts, typically reclassifying them as civil violations.",
            "content": "# Decriminalization\n\n**Decriminalization** is the process of reducing or removing criminal penalties for certain acts, typically reclassifying them from criminal offenses to civil violations (like a fine).\n\n## Key Distinction\n\nDecriminalization is different from **legalization**:\n- **Decriminalization**: The act is still prohibited but penalties are reduced (e.g., fine instead of jail)\n- **Legalization**: The act is no longer prohibited by law\n\n## Drug Decriminalization\n\nThe most common context is drug policy. Portugal decriminalized personal drug possession in 2001, focusing on treatment rather than punishment. Oregon's Measure 110 (2020), passed through the [initiative process](/en/initiative-process), decriminalized personal possession of small amounts of drugs, making it a civil citation with a $100 fine. The measure was later modified in 2024 to restore some criminal penalties.\n\n## Arguments For\n\n- Reduces incarceration for nonviolent offenses\n- Directs people to treatment instead of jail\n- Reduces racial disparities in enforcement\n\n## Arguments Against\n\n- May increase drug use by reducing deterrence\n- Implementation challenges (treatment capacity)\n- Public safety concerns\n\n## Related\n\n- [Due Process](/en/due-process) — shifts penalties from criminal to civil due process\n- [Housing First](/en/housing-first) — intersects with decriminalization through homelessness and substance use policy\n- [Initiative Process](/en/initiative-process) — Oregon's Measure 110 reached the ballot through this process",
            "scope_combine": "or",
            "locations": [location_id],
            "sessions": [criminal_id],
        },
        {
            "slug": "background-check",
            "term": "Background Check",
            "aliases": ["background checks", "universal background checks"],
            "summary": "A screening process to verify a person's history before they can purchase a firearm.",
            "content": "# Background Check\n\nA **background check** in the context of firearms is a screening process conducted before a gun sale to verify the buyer is not prohibited from owning a firearm under the [Second Amendment](/en/second-amendment) regulatory framework.\n\n## Federal System (NICS)\n\nThe National Instant Criminal Background Check System (NICS), established by the Brady Handgun Violence Prevention Act (1993), checks buyers against databases of:\n- Felony convictions\n- Domestic violence convictions or restraining orders\n- Involuntary mental health commitments\n- Dishonorable military discharges\n- Unlawful immigration status\n\n## The Private Sale Gap\n\nFederal law only requires background checks for sales through licensed dealers. Private sales (gun shows, online listings, person-to-person) do not require federal background checks in many states.\n\n## Universal Background Checks\n\n**Universal background checks** would require a background check for all firearm sales, including private transactions. Polling consistently shows 80-90% public support. Oregon requires background checks on all gun sales, including private transfers, under SB 941 (2015).\n\n## Related\n\n- [Second Amendment](/en/second-amendment) — the constitutional right that background checks regulate\n- [Due Process](/en/due-process) — ensures background check denials can be challenged",
            "scope_combine": "or",
            "locations": [us_location_id],
            "sessions": [criminal_id, governance_id],
        },
        # --- California-scoped terms ---
        {
            "slug": "proposition-system",
            "term": "Proposition System",
            "aliases": ["ballot proposition", "California proposition"],
            "summary": "California's system allowing citizens to place proposed laws and constitutional amendments on the ballot.",
            "content": "# Proposition System\n\nCalifornia's **proposition system** allows citizens to place proposed laws (statutory initiatives) and constitutional amendments on the statewide ballot. It is one of the most active direct democracy systems in the United States.\n\n## How It Works\n\n- Proponents draft a measure and submit it to the Attorney General\n- Signatures are collected: 5% of votes cast in last gubernatorial election for statutes, 8% for constitutional amendments\n- If enough valid signatures are gathered, the proposition appears on the next statewide ballot\n- A simple majority passes the measure\n\n## Notable Propositions\n\n- **Prop 13 (1978)**: Capped property tax increases — one of the most consequential ballot measures in U.S. history\n- **Prop 47 (2014)**: Reclassified certain nonviolent felonies as misdemeanors\n- **Prop 22 (2020)**: Classified gig workers as independent contractors\n\n## Criticism\n\n- Complex measures confuse voters\n- Wealthy interests dominate signature-gathering\n- Voter fatigue from too many propositions per election\n\n## Related\n\n- [Initiative Process](/en/initiative-process) — Oregon's version of citizen-initiated legislation\n- [Ranked Choice Voting](/en/ranked-choice-voting) — an alternative voting method under discussion",
            "scope_combine": "or",
            "locations": [ca_location_id],
            "sessions": [elections_id],
        },
        {
            "slug": "ceqa",
            "term": "CEQA",
            "aliases": ["California Environmental Quality Act"],
            "summary": "California law requiring environmental review of proposed projects before approval.",
            "content": "# CEQA\n\nThe **California Environmental Quality Act (CEQA)**, enacted in 1970, requires state and local agencies to evaluate and disclose the environmental impacts of proposed projects before approving them.\n\n## How It Works\n\n1. A lead agency determines if a project requires environmental review\n2. An Initial Study assesses potential impacts\n3. If significant impacts are found, a full Environmental Impact Report (EIR) is prepared\n4. The public can comment on the EIR\n5. The agency must address comments and may require mitigation measures\n\n## Debate\n\nSupporters say CEQA protects communities and the environment. Critics argue it is weaponized to block housing, transit, and renewable energy projects through endless litigation. Reform proposals focus on streamlining reviews for infill housing and clean energy.\n\n## Related\n\n- [Cap and Trade](/en/cap-and-trade) — California's market-based emissions program\n- [Rent Control](/en/rent-control) — housing affordability policy intersecting with CEQA reform",
            "scope_combine": "or",
            "locations": [ca_location_id],
            "sessions": [environment_id, rent_id],
        },
        {
            "slug": "water-rights-western",
            "term": "Prior Appropriation",
            "aliases": ["water rights", "first in time first in right", "appropriative rights"],
            "summary": "The legal doctrine governing water rights in western U.S. states, allocating water based on historical use.",
            "content": "# Prior Appropriation\n\n**Prior appropriation** (\"first in time, first in right\") is the water rights doctrine used in most western U.S. states, including California, Oregon, and Texas. Unlike eastern states' riparian rights (tied to land ownership), western water rights are based on who first put water to \"beneficial use.\"\n\n## Key Principles\n\n- **Priority date**: Earlier users have senior rights over later users\n- **Beneficial use**: Water must be used for an approved purpose (irrigation, municipal, industrial, etc.)\n- **Use it or lose it**: Rights can be forfeited if water goes unused\n\n## California's Hybrid System\n\nCalifornia uniquely combines both riparian and appropriative rights, creating a complex legal framework. The State Water Resources Control Board manages allocations.\n\n## Drought and Climate Change\n\nWestern water rights are under increasing stress as climate change reduces snowpack and streamflow. Junior rights holders face curtailment during droughts, leading to conflicts between agricultural, urban, and environmental users.\n\n## Related\n\n- [Paris Climate Agreement](/en/paris-climate-agreement) — climate change impacts on water availability",
            "scope_combine": "or",
            "locations": [ca_location_id, us_location_id],
            "sessions": [water_id, environment_id],
        },
        # --- Texas-scoped terms ---
        {
            "slug": "texas-grid",
            "term": "ERCOT",
            "aliases": ["Texas grid", "Electric Reliability Council of Texas"],
            "summary": "The organization managing the Texas electrical grid, which operates independently from the national grid.",
            "content": "# ERCOT\n\n**ERCOT** (Electric Reliability Council of Texas) manages the flow of electric power to more than 26 million Texas customers — about 90% of the state's electric load. Uniquely, the Texas grid operates independently from the two major U.S. interconnections.\n\n## Why Texas Has Its Own Grid\n\nTexas chose to keep its grid within state borders to avoid federal regulation by the Federal Energy Regulatory Commission (FERC). This independence means Texas cannot easily import power from neighboring states during emergencies.\n\n## Winter Storm Uri (2021)\n\nThe February 2021 winter storm exposed critical vulnerabilities. Frozen natural gas infrastructure and unweatherized generation led to widespread outages lasting days. Over 200 people died and damages exceeded $195 billion.\n\n## Reform\n\nPost-Uri reforms include mandatory weatherization standards, a new market mechanism (Performance Credit Mechanism) to incentivize reliable capacity, and increased natural gas supply requirements. Whether these measures are sufficient remains debated.\n\n## Related\n\n- [Cap and Trade](/en/cap-and-trade) — market-based energy policy (not used in Texas)\n- [Paris Climate Agreement](/en/paris-climate-agreement) — climate change increases grid stress",
            "scope_combine": "or",
            "locations": [tx_location_id],
            "sessions": [transit_id, environment_id],
        },
        {
            "slug": "texas-border-policy",
            "term": "Operation Lone Star",
            "aliases": ["OLS"],
            "summary": "A Texas state initiative deploying National Guard and state troopers to the U.S.-Mexico border.",
            "content": "# Operation Lone Star\n\n**Operation Lone Star** is a Texas state initiative launched in March 2021 that deploys Texas National Guard soldiers and Department of Public Safety troopers to the U.S.-Mexico border.\n\n## Scope\n\n- Thousands of National Guard members deployed along the border\n- State troopers conducting vehicle inspections and arrests\n- Construction of state-funded border barriers\n- Cost: billions of dollars from state funds\n\n## Legal Issues\n\nThe operation has raised constitutional questions about the boundary between state and federal immigration authority. The federal government has exclusive authority over immigration law, but states can enforce state criminal laws at the border.\n\n## Debate\n\nSupporters argue the federal government has failed to secure the border and states must act. Critics argue it militarizes communities, violates civil rights, and duplicates federal efforts at enormous taxpayer cost.\n\n## Related\n\n- [Sanctuary City](/en/sanctuary-city) — the opposite approach to state-federal immigration relations\n- [DACA](/en/daca) — federal immigration policy affecting border communities\n- [Due Process](/en/due-process) — constitutional protections in border enforcement",
            "scope_combine": "or",
            "locations": [tx_location_id],
            "sessions": [immigration_id, governance_id],
        },
        {
            "slug": "castle-doctrine",
            "term": "Castle Doctrine",
            "aliases": ["stand your ground", "self-defense law"],
            "summary": "Laws allowing individuals to use force, including deadly force, to defend themselves without a duty to retreat.",
            "content": "# Castle Doctrine\n\nThe **castle doctrine** is a legal principle that designates a person's home (and in some states, vehicle or workplace) as a place where they have a right to use force — including deadly force — against intruders without a duty to retreat.\n\n## Stand Your Ground\n\n**Stand your ground** laws extend this principle beyond the home. In states with these laws, individuals can use force in self-defense anywhere they have a legal right to be, without first attempting to retreat. Texas enacted its stand your ground law in 2007.\n\n## Texas Law\n\nTexas has one of the broadest self-defense statutes in the country:\n- No duty to retreat from any place you have a right to be\n- Presumption of reasonableness for force used against someone unlawfully entering your home, vehicle, or workplace\n- Protection extends to defense of third parties\n\n## Debate\n\nSupporters argue these laws empower citizens to protect themselves and deter crime. Critics argue they escalate violence, disproportionately affect minorities, and make it harder to prosecute vigilante behavior.\n\n## Related\n\n- [Second Amendment](/en/second-amendment) — the constitutional right often invoked alongside castle doctrine\n- [Background Check](/en/background-check) — firearm regulations intersecting with self-defense law",
            "scope_combine": "or",
            "locations": [tx_location_id, us_location_id],
            "sessions": [criminal_id, governance_id],
        },
    ]

    if dry_run:
        print(f"    Would seed {len(terms)} glossary terms")
        return

    seeded = 0
    for t in terms:
        # Filter out None session IDs
        sess_ids = [c for c in t["sessions"] if c]
        loc_ids = [l for l in t["locations"] if l]

        db_execute("""
            INSERT INTO glossary_term (slug, term, aliases, summary, content, scope_combine, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (slug) DO UPDATE SET
                term = EXCLUDED.term,
                aliases = EXCLUDED.aliases,
                summary = EXCLUDED.summary,
                content = EXCLUDED.content,
                scope_combine = EXCLUDED.scope_combine,
                updated_at = NOW()
        """, (t["slug"], t["term"], t["aliases"], t["summary"], t["content"], t["scope_combine"]))

        row = db_query_one("SELECT id FROM glossary_term WHERE slug = %s", (t["slug"],))
        if not row:
            continue

        term_id = row["id"]
        for loc_id in loc_ids:
            db_execute("""
                INSERT INTO glossary_term_scope (term_id, scope_type, scope_id)
                VALUES (%s, 'location', %s)
                ON CONFLICT DO NOTHING
            """, (term_id, loc_id))
        for sess_id in sess_ids:
            db_execute("""
                INSERT INTO glossary_term_scope (term_id, scope_type, scope_id)
                VALUES (%s, 'session', %s)
                ON CONFLICT DO NOTHING
            """, (term_id, sess_id))
        seeded += 1

    print(f"    Seeded {seeded} glossary terms")
    print("  Phase 14 complete")


# Phase 15: Wiki pages (native PostgreSQL)
def phase_15_wiki_pages(dry_run=False):
    """Seed standalone wiki pages into wiki_page + wiki_page_scope tables."""
    print("\n  Phase 15: Wiki pages")

    # Look up location/session IDs for scope tags
    us_row = db_query_one("SELECT id FROM location WHERE code = 'US'")
    or_row = db_query_one("SELECT id FROM location WHERE code = 'OR'")
    ca_row = db_query_one("SELECT id FROM location WHERE code = 'CA'")
    tx_row = db_query_one("SELECT id FROM location WHERE code = 'TX'")
    us_id = str(us_row["id"]) if us_row else None
    or_id = str(or_row["id"]) if or_row else None
    ca_id = str(ca_row["id"]) if ca_row else None
    tx_id = str(tx_row["id"]) if tx_row else None
    sess_rows = db_query("SELECT id, label FROM session")
    sess_map_local = {r["label"]: str(r["id"]) for r in (sess_rows or [])}

    standalone_pages = [
        {
            "slug": "guides/how-voting-works-in-oregon",
            "title": "How Voting Works in Oregon",
            "description": "A guide to Oregon's vote-by-mail system, registration, and key deadlines.",
            "wiki_category": "Guides",
            "location_ids": [or_id],
            "session_ids": [sess_map_local.get("Electoral Reform")],
            "content": "# How Voting Works in Oregon\n\nOregon pioneered **vote-by-mail** in 1998, becoming the first state to conduct all elections entirely by mail. Here's how it works.\n\n## Registration\n\n- Register online at [Oregon Secretary of State](https://sos.oregon.gov/voting)\n- Deadline: 21 days before election day\n- You must be a U.S. citizen, Oregon resident, and at least 16 to pre-register (18 to vote)\n- Oregon has **automatic voter registration** — you're registered when you get or renew a driver's license\n\n## Receiving Your Ballot\n\n- Ballots are mailed 14–18 days before election day\n- Each ballot includes a voter's pamphlet with candidate statements and measure arguments\n\n## Returning Your Ballot\n\n- **Drop boxes**: Available across every county, no postage needed\n- **Mail**: Must be received (not postmarked) by 8 PM on election day\n- You can track your ballot status online\n\n## Key Dates\n\n| Event | Deadline |\n|-------|----------|\n| Registration | 21 days before |\n| Ballots mailed | 14–18 days before |\n| Ballot due | 8 PM election day |\n\n## Related Terms\n\n- [Primary Election](/en/primary-election) — Oregon uses a closed primary system\n- [Ranked Choice Voting](/en/ranked-choice-voting) — an alternative voting method under discussion\n- [Initiative Process](/en/initiative-process) — how citizens place measures on the ballot",
        },
        {
            "slug": "guides/understanding-the-federal-budget",
            "title": "Understanding the Federal Budget",
            "description": "How the U.S. federal budget process works, from proposal to appropriation.",
            "wiki_category": "Guides",
            "location_ids": [us_id],
            "session_ids": [sess_map_local.get("Living Wage"), sess_map_local.get("Electoral Reform")],
            "content": "# Understanding the Federal Budget\n\nThe U.S. federal budget is one of the most consequential policy documents in the world. Here's how it comes together.\n\n## The Budget Process\n\n1. **President's Budget Request** (February): The executive branch submits a proposed budget to Congress\n2. **Congressional Budget Resolution** (April): House and Senate budget committees set spending targets\n3. **Appropriations** (October 1 deadline): 12 appropriations bills fund federal agencies\n4. **Continuing Resolutions**: If appropriations aren't passed by Oct 1, temporary funding extends current levels\n\n## Mandatory vs. Discretionary Spending\n\n| Type | % of Budget | Examples |\n|------|------------|----------|\n| Mandatory | ~63% | Social Security, Medicare, Medicaid |\n| Discretionary | ~30% | Defense, education, infrastructure |\n| Interest on debt | ~7% | Payments on national debt |\n\n## The National Debt\n\nThe national debt is the total accumulated borrowing by the federal government. The **deficit** is the annual gap between spending and revenue. These are often confused but are distinct concepts.\n\n## Related Terms\n\n- [Tariff](/en/tariff) — one source of federal revenue\n- [Universal Basic Income](/en/universal-basic-income) — a proposed social spending program\n- [Minimum Wage](/en/minimum-wage) — affected by federal labor policy",
        },
        {
            "slug": "guides/how-a-bill-becomes-law",
            "title": "How a Bill Becomes Law",
            "description": "The step-by-step process of federal legislation in the United States.",
            "wiki_category": "Guides",
            "location_ids": [us_id],
            "session_ids": [sess_map_local.get("Electoral Reform")],
            "content": "# How a Bill Becomes Law\n\nThe legislative process in the U.S. Congress involves multiple stages, committees, and votes before a proposal becomes law.\n\n## The Process\n\n### 1. Introduction\nAny member of Congress can introduce a bill. Bills starting in the House are numbered H.R., and Senate bills are numbered S.\n\n### 2. Committee Review\nThe bill is referred to a committee with relevant jurisdiction. Most bills never make it past this stage.\n\n### 3. Floor Debate and Vote\nIf a bill passes committee, it goes to the full House or Senate for debate and a vote.\n\n- **House**: Debate is usually time-limited by the Rules Committee\n- **Senate**: Debate is unlimited unless [cloture](/en/cloture) is invoked to end a [filibuster](/en/filibuster), requiring 60 votes\n\n### 4. Conference Committee\nIf the House and Senate pass different versions, a conference committee reconciles the differences.\n\n### 5. Presidential Action\nThe President can sign the bill, veto it, or pocket veto it.\n\n## Related Terms\n\n- [Filibuster](/en/filibuster) — a tactic to block bills in the Senate\n- [Cloture](/en/cloture) — the procedure to end a filibuster\n- [Caucus](/en/caucus) — party groups that coordinate legislative strategy",
        },
        {
            "slug": "topics/immigration-policy-overview",
            "title": "Immigration Policy Overview",
            "description": "Key concepts, debates, and policies shaping U.S. immigration.",
            "wiki_category": "Topics",
            "location_ids": [us_id],
            "session_ids": [sess_map_local.get("Border Communities")],
            "content": "# Immigration Policy Overview\n\nImmigration policy in the United States involves a complex web of federal laws, executive actions, and state-level responses.\n\n## Legal Immigration Pathways\n\n- **Family-sponsored**: U.S. citizens and permanent residents can sponsor relatives\n- **Employment-based**: Employers sponsor workers with specific skills (H-1B, EB visas)\n- **Diversity Visa Lottery**: 50,000 visas annually for underrepresented countries\n- **Refugees and asylum seekers**: Protection for those fleeing persecution\n\n## Key Policy Debates\n\nThe tension between securing borders and treating migrants humanely is central to the immigration debate.\n\n## Related Terms\n\n- [DACA](/en/daca) — protections for undocumented immigrants brought as children\n- [Sanctuary City](/en/sanctuary-city) — jurisdictions limiting cooperation with federal immigration enforcement\n- [Due Process](/en/due-process) — constitutional protections in immigration proceedings",
        },
        {
            "slug": "topics/climate-policy-landscape",
            "title": "Climate Policy Landscape",
            "description": "An overview of major climate policies, international agreements, and market-based approaches.",
            "wiki_category": "Topics",
            "location_ids": [],
            "session_ids": [sess_map_local.get("Climate Action")],
            "content": "# Climate Policy Landscape\n\nClimate change policy spans international agreements, national legislation, and market-based mechanisms.\n\n## International Frameworks\n\nThe [Paris Climate Agreement](/en/paris-climate-agreement) (2015) is the primary international framework.\n\n## Market-Based Approaches\n\n[Cap and trade](/en/cap-and-trade) systems set a firm limit on emissions and allow companies to trade allowances.\n\n## Related Terms\n\n- [Paris Climate Agreement](/en/paris-climate-agreement) — the primary international framework\n- [Cap and Trade](/en/cap-and-trade) — a market-based emissions reduction approach",
        },
        {
            "slug": "topics/gun-policy-in-america",
            "title": "Gun Policy in America",
            "description": "Overview of gun rights, regulations, and the ongoing policy debate in the United States.",
            "wiki_category": "Topics",
            "location_ids": [us_id],
            "session_ids": [sess_map_local.get("Civil Liberties"), sess_map_local.get("Criminal Justice")],
            "content": "# Gun Policy in America\n\nGun policy in the United States sits at the intersection of constitutional rights, public safety, and deeply held cultural values.\n\n## Constitutional Framework\n\nThe [Second Amendment](/en/second-amendment) protects the right to keep and bear arms.\n\n## Current Federal Law\n\n- Licensed dealers must conduct [background checks](/en/background-check) via the NICS system\n- Private sales in many states do not require background checks\n- Fully automatic weapons manufactured after 1986 are banned\n\n## Related Terms\n\n- [Second Amendment](/en/second-amendment) — the constitutional right to keep and bear arms\n- [Background Check](/en/background-check) — screening before firearm purchases\n- [Due Process](/en/due-process) — constitutional requirements for gun regulations",
        },
        {
            "slug": "guides/oregon-ballot-measures-explained",
            "title": "Oregon Ballot Measures Explained",
            "description": "How ballot measures work in Oregon and notable recent examples.",
            "wiki_category": "Guides",
            "location_ids": [or_id],
            "session_ids": [sess_map_local.get("Electoral Reform")],
            "content": "# Oregon Ballot Measures Explained\n\nOregon has one of the most active [initiative processes](/en/initiative-process) in the country.\n\n## Types of Ballot Measures\n\n- **Initiative**: Citizens gather signatures to place a new law or constitutional amendment on the ballot\n- **Referendum**: Citizens can challenge a law passed by the legislature\n- **Legislative referral**: The legislature refers a proposed constitutional amendment to voters\n\n## Notable Recent Measures\n\n### Measure 110 (2020) — Drug [Decriminalization](/en/decriminalization)\nReclassified personal drug possession from a criminal offense to a civil violation.\n\n### [Ballot Measure 118](/en/ballot-measure-118) (2024) — Corporate Tax Rebate\nDefeated by voters.\n\n## Related Terms\n\n- [Initiative Process](/en/initiative-process) — the mechanism behind citizen-initiated measures\n- [Ballot Measure 118](/en/ballot-measure-118) — a recent high-profile ballot initiative\n- [Decriminalization](/en/decriminalization) — Measure 110's approach to drug policy",
        },
        # --- California-scoped pages ---
        {
            "slug": "guides/california-water-crisis",
            "title": "Understanding California's Water Crisis",
            "description": "An overview of water allocation, drought cycles, and policy challenges in California.",
            "wiki_category": "Guides",
            "location_ids": [ca_id],
            "session_ids": [sess_map_local.get("Water Rights"), sess_map_local.get("Climate Action")],
            "content": "# Understanding California's Water Crisis\n\nCalifornia faces chronic water supply challenges driven by geography, population growth, agriculture, and climate change.\n\n## Water Allocation\n\nCalifornia's water system is one of the most complex in the world:\n- **State Water Project**: Delivers water from Northern California to Southern California and the Central Valley\n- **Central Valley Project**: Federal system supplying agricultural and urban users\n- **Colorado River**: Supplies Southern California via aqueducts; allocations are governed by the \"Law of the River\"\n\n## The Agriculture-Urban Tension\n\nAgriculture uses approximately 80% of California's developed water supply but generates about 2% of GDP. Urban areas, particularly Southern California, increasingly compete for the same water.\n\n## Drought Cycles\n\nCalifornia has experienced severe droughts in 2007-2009, 2012-2016, and 2020-2022. Climate change is expected to make droughts more frequent and intense while reducing Sierra snowpack, which acts as a natural reservoir.\n\n## Policy Approaches\n\n- Water markets and trading between agricultural and urban users\n- Desalination plants (e.g., Carlsbad facility)\n- Groundwater sustainability (SGMA, 2014)\n- Conservation mandates and tiered pricing\n\n## Related Terms\n\n- [Prior Appropriation](/en/water-rights-western) — the legal doctrine governing water rights\n- [CEQA](/en/ceqa) — environmental review affecting water infrastructure projects",
        },
        {
            "slug": "guides/californias-proposition-system",
            "title": "California's Proposition System: A Citizen's Guide",
            "description": "How California's ballot proposition system works and its impact on state governance.",
            "wiki_category": "Guides",
            "location_ids": [ca_id],
            "session_ids": [sess_map_local.get("Electoral Reform")],
            "content": "# California's Proposition System: A Citizen's Guide\n\nCalifornia's [proposition system](/en/proposition-system) is one of the most active direct democracy mechanisms in the world. Since 1911, citizens have used it to shape policy on everything from taxes to criminal justice.\n\n## How to Read a Proposition\n\n1. **Read the official title and summary** from the Attorney General\n2. **Check the Legislative Analyst's fiscal impact estimate** — this is nonpartisan\n3. **Read the arguments for and against** in the Voter Guide\n4. **Follow the money** — check campaign contributions on the Secretary of State's Cal-Access database\n5. **Beware of misleading titles** — proponents choose names designed to attract yes votes\n\n## Common Pitfalls\n\n- **Proposition lock-in**: Once passed, propositions can often only be amended by another proposition, creating policy rigidity\n- **Complexity**: Some propositions are dozens of pages of legal text\n- **Special interests**: Signature gathering is expensive, favoring well-funded groups\n\n## Related Terms\n\n- [Proposition System](/en/proposition-system) — how the system works\n- [Initiative Process](/en/initiative-process) — Oregon's equivalent",
        },
        # --- Texas-scoped pages ---
        {
            "slug": "guides/texas-energy-landscape",
            "title": "The Texas Energy Landscape",
            "description": "How Texas's energy system works, from ERCOT to renewables to fossil fuels.",
            "wiki_category": "Guides",
            "location_ids": [tx_id],
            "session_ids": [sess_map_local.get("Transit Expansion"), sess_map_local.get("Climate Action")],
            "content": "# The Texas Energy Landscape\n\nTexas is the largest energy-producing and energy-consuming state in the U.S. Its energy landscape spans oil, natural gas, wind, and solar.\n\n## The Texas Grid ([ERCOT](/en/texas-grid))\n\nUnlike the rest of the continental U.S., Texas operates its own electrical grid managed by ERCOT. This independence has benefits (less federal regulation) and risks (inability to import power during emergencies).\n\n## Fossil Fuels\n\n- Texas produces more crude oil than any other state (~40% of U.S. production)\n- The Permian Basin is the most productive oil field in the world\n- Natural gas powers most of Texas's electricity generation\n\n## Renewable Energy\n\nTexas is also the national leader in wind power:\n- More installed wind capacity than any other state\n- Solar is growing rapidly, particularly in West Texas\n- No state renewable portfolio standard — growth is market-driven\n\n## Policy Debates\n\n- Weatherization requirements after Winter Storm Uri\n- Transmission infrastructure for renewables\n- The role of battery storage in grid reliability\n- Carbon capture and storage technology\n\n## Related Terms\n\n- [ERCOT](/en/texas-grid) — the organization managing the Texas grid\n- [Cap and Trade](/en/cap-and-trade) — a market-based approach not used in Texas\n- [Paris Climate Agreement](/en/paris-climate-agreement) — the international climate framework",
        },
        {
            "slug": "topics/texas-border-policy",
            "title": "Border Policy in Texas",
            "description": "An overview of state and federal border enforcement policies affecting Texas communities.",
            "wiki_category": "Topics",
            "location_ids": [tx_id],
            "session_ids": [sess_map_local.get("Border Communities"), sess_map_local.get("Criminal Justice")],
            "content": "# Border Policy in Texas\n\nTexas shares 1,254 miles of border with Mexico, making border policy a defining issue for the state.\n\n## Federal vs. State Authority\n\nImmigration enforcement is primarily a federal responsibility, but Texas has increasingly taken independent action through [Operation Lone Star](/en/texas-border-policy) and other state-funded programs.\n\n## Key Issues\n\n### Border Communities\nCities like El Paso, Laredo, and McAllen are deeply intertwined with their Mexican counterparts economically and culturally. Border policies affect daily life — from wait times at ports of entry to local school enrollment.\n\n### Economic Impact\nThe Texas-Mexico border sees over $200 billion in annual trade. Border disruptions (enhanced inspections, closures) can cost millions per day in delayed commerce.\n\n### Humanitarian Concerns\nMigrant deaths in the desert, family separations, and conditions in detention facilities are ongoing humanitarian issues that transcend partisan politics.\n\n## Related Terms\n\n- [Operation Lone Star](/en/texas-border-policy) — Texas's state border enforcement initiative\n- [Sanctuary City](/en/sanctuary-city) — policies limiting local cooperation with federal immigration enforcement\n- [DACA](/en/daca) — protections for undocumented immigrants brought as children\n- [Due Process](/en/due-process) — constitutional protections in immigration proceedings",
        },
    ]

    if dry_run:
        print(f"    Would seed {len(standalone_pages)} wiki pages")
        return

    seeded = 0
    for sp in standalone_pages:
        slug = sp["slug"]
        loc_ids = [l for l in (sp.get("location_ids") or []) if l]
        sess_ids = [c for c in (sp.get("session_ids") or []) if c]

        row = db_execute_returning("""
            INSERT INTO wiki_page (slug, title, description, content, wiki_category, scope_combine)
            VALUES (%s, %s, %s, %s, %s, 'or')
            ON CONFLICT (slug) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                content = EXCLUDED.content,
                wiki_category = EXCLUDED.wiki_category,
                updated_at = NOW()
            RETURNING id
        """, (slug, sp["title"], sp["description"], sp["content"], sp.get("wiki_category")))

        if not row:
            continue
        page_id = str(row["id"])

        for loc_id in loc_ids:
            db_execute("""
                INSERT INTO wiki_page_scope (page_id, scope_type, scope_id)
                VALUES (%s, 'location', %s)
                ON CONFLICT DO NOTHING
            """, (page_id, loc_id))
        for sess_id in sess_ids:
            db_execute("""
                INSERT INTO wiki_page_scope (page_id, scope_type, scope_id)
                VALUES (%s, 'session', %s)
                ON CONFLICT DO NOTHING
            """, (page_id, sess_id))
        seeded += 1

    print(f"    Seeded {seeded} wiki pages")
    print("  Phase 15 complete")


# Phase 16: Wiki suggestions
def phase_16_wiki_suggestions(location_id, session_map, dry_run=False):
    """Seed wiki suggestions with various scopes, types, and statuses."""
    print("\n  Phase 16: Wiki suggestions")

    # Check if already seeded
    existing = db_query_one("SELECT count(*) as cnt FROM wiki_suggestion")
    if existing and existing["cnt"] > 0:
        print(f"    Already have {existing['cnt']} suggestions, skipping")
        print("  Phase 16 complete")
        return

    # Look up user IDs
    users = {}
    for uname in ["normal1", "normal2", "normal3", "normal5",
                   "admin1", "moderator1"]:
        row = db_query_one("SELECT id FROM users WHERE username = %s", (uname,))
        if row:
            users[uname] = str(row["id"])
    if len(users) < 4:
        print("    Not enough users found, skipping")
        return

    # Look up location IDs
    us_row = db_query_one("SELECT id FROM location WHERE code = 'US'")
    or_row = db_query_one("SELECT id FROM location WHERE code = 'OR'")
    us_id = str(us_row["id"]) if us_row else None
    or_id = str(or_row["id"]) if or_row else None

    # Look up session IDs
    sess_rows = db_query("SELECT id, label FROM session")
    sess_map_local = {r["label"]: str(r["id"]) for r in (sess_rows or [])}
    healthcare_id = sess_map_local.get("Healthcare Access")
    elections_id = sess_map_local.get("Electoral Reform")
    economy_id = sess_map_local.get("Living Wage")
    environment_id = sess_map_local.get("Climate Action")
    immigration_id = sess_map_local.get("Border Communities")

    # Look up existing glossary terms and wiki pages for edit suggestions
    filibuster = db_query_one(
        "SELECT id, term, aliases, summary, content, wiki_category, scope_combine, updated_at "
        "FROM glossary_term WHERE slug = 'filibuster'")
    rent_control = db_query_one(
        "SELECT id, term, aliases, summary, content, wiki_category, scope_combine, updated_at "
        "FROM glossary_term WHERE slug = 'rent-control'")
    gun_page = db_query_one(
        "SELECT id, slug, title, description, content, wiki_category, scope_combine, updated_at "
        "FROM wiki_page WHERE slug = 'topics/gun-policy-in-america'")
    voting_page = db_query_one(
        "SELECT id, slug, title, description, content, wiki_category, scope_combine, updated_at "
        "FROM wiki_page WHERE slug = 'guides/how-voting-works-in-oregon'")

    def get_term_scopes(term_id):
        rows = db_query(
            "SELECT scope_type, scope_id FROM glossary_term_scope WHERE term_id = %s",
            (term_id,))
        return [{"type": r["scope_type"], "id": str(r["scope_id"])} for r in (rows or [])]

    def get_page_scopes(page_id):
        rows = db_query(
            "SELECT scope_type, scope_id FROM wiki_page_scope WHERE page_id = %s",
            (str(page_id),))
        return [{"type": r["scope_type"], "id": str(r["scope_id"])} for r in (rows or [])]

    if dry_run:
        print("    Would seed ~8 wiki suggestions")
        return

    suggestions = []

    # 1. Pending new_term — Healthcare scoped with OR combine (normal2 suggests)
    suggestions.append({
        "suggestion_type": "new_term",
        "glossary_term_id": None,
        "wiki_page_path": None,
        "wiki_page_id": None,
        "proposed_title": "Single-Payer Healthcare",
        "proposed_aliases": ["single payer", "Medicare for All"],
        "proposed_summary": "A healthcare system where a single public body finances healthcare for all residents.",
        "proposed_content": (
            "# Single-Payer Healthcare\n\n"
            "**Single-payer healthcare** is a system in which a single public agency handles health insurance "
            "financing, while the delivery of care remains largely in private hands.\n\n"
            "## How It Works\n\n"
            "- All residents are covered by a single government health insurance plan\n"
            "- Funded through taxes rather than private premiums\n"
            "- Providers (hospitals, doctors) remain independent\n"
            "- The government negotiates prices with providers and drug companies\n\n"
            "## Arguments For\n\n"
            "- Universal coverage — no uninsured population\n"
            "- Lower administrative costs\n"
            "- Stronger negotiating power on drug prices\n\n"
            "## Arguments Against\n\n"
            "- Higher taxes to fund the system\n"
            "- Potential wait times for non-emergency procedures\n"
            "- Reduced choice in insurance plans\n"
            "- Disruption to existing employer-based coverage\n\n"
            "## Examples\n\n"
            "- Canada's Medicare system\n"
            "- Taiwan's National Health Insurance\n"
            "- The proposed U.S. Medicare for All Act"
        ),
        "proposed_wiki_category": "Healthcare Access",
        "proposed_scopes": json.dumps([
            {"type": "location", "id": us_id},
            {"type": "session", "id": healthcare_id},
        ]) if us_id and healthcare_id else "[]",
        "proposed_scope_combine": "or",
        "original_title": None,
        "original_aliases": "{}",
        "original_summary": None,
        "original_content": None,
        "original_wiki_category": None,
        "original_scopes": "[]",
        "original_scope_combine": "or",
        "original_updated_at": None,
        "suggested_by": users["normal2"],
        "suggestion_reason": "Healthcare is a major policy topic and single-payer is central to the debate.",
        "status": "pending",
        "reviewed_by": None,
        "review_note": None,
        "reviewed_at": None,
    })

    # 2. Pending edit_term — Edit filibuster to add more content (normal3 suggests)
    if filibuster:
        fili_scopes = get_term_scopes(filibuster["id"])
        suggestions.append({
            "suggestion_type": "edit_term",
            "glossary_term_id": filibuster["id"],
            "wiki_page_path": None,
            "wiki_page_id": None,
            "proposed_title": filibuster["term"],
            "proposed_aliases": filibuster["aliases"] or [],
            "proposed_summary": filibuster["summary"],
            "proposed_content": (
                filibuster["content"] +
                "\n\n## Reform Proposals\n\n"
                "- **Talking filibuster**: Require senators to actually hold the floor and speak\n"
                "- **Lower threshold**: Reduce cloture votes from 60 to 55 or simple majority\n"
                "- **Carve-outs**: Exempt certain legislation (e.g., voting rights) from filibuster rules"
            ),
            "proposed_wiki_category": filibuster.get("wiki_category") or "Governance",
            "proposed_scopes": json.dumps(fili_scopes),
            "proposed_scope_combine": filibuster.get("scope_combine", "or"),
            "original_title": filibuster["term"],
            "original_aliases": filibuster["aliases"] or [],
            "original_summary": filibuster["summary"],
            "original_content": filibuster["content"],
            "original_wiki_category": filibuster.get("wiki_category"),
            "original_scopes": json.dumps(fili_scopes),
            "original_scope_combine": filibuster.get("scope_combine", "or"),
            "original_updated_at": filibuster["updated_at"],
            "suggested_by": users["normal3"],
            "suggestion_reason": "Adding reform proposals section for completeness.",
            "status": "pending",
            "reviewed_by": None,
            "review_note": None,
            "reviewed_at": None,
        })

    # 3. Pending edit_page — Edit gun policy page (normal1 suggests)
    if gun_page:
        gun_scopes = get_page_scopes(gun_page["id"])
        suggestions.append({
            "suggestion_type": "edit_page",
            "glossary_term_id": None,
            "wiki_page_path": gun_page["slug"],
            "wiki_page_id": str(gun_page["id"]),
            "proposed_title": gun_page["title"],
            "proposed_aliases": [],
            "proposed_summary": "Overview of gun rights, regulations, and the ongoing policy debate in the United States.",
            "proposed_content": (
                gun_page["content"] +
                "\n\n## State-Level Variation\n\n"
                "Gun laws vary enormously by state. Some states require permits for all purchases "
                "and have red flag laws, while others have constitutional carry with minimal regulation.\n\n"
                "### Oregon\n\n"
                "Oregon requires background checks on all gun sales (including private) and has a "
                "red flag law (Extreme Risk Protection Orders) allowing courts to temporarily remove "
                "firearms from individuals deemed a risk."
            ),
            "proposed_wiki_category": gun_page.get("wiki_category") or "Topics",
            "proposed_scopes": json.dumps(gun_scopes),
            "proposed_scope_combine": gun_page.get("scope_combine", "or"),
            "original_title": gun_page["title"],
            "original_aliases": [],
            "original_summary": gun_page.get("description"),
            "original_content": gun_page["content"],
            "original_wiki_category": gun_page.get("wiki_category"),
            "original_scopes": json.dumps(gun_scopes),
            "original_scope_combine": gun_page.get("scope_combine", "or"),
            "original_updated_at": gun_page["updated_at"],
            "suggested_by": users["normal1"],
            "suggestion_reason": "Adding state-level variation section with Oregon details.",
            "status": "pending",
            "reviewed_by": None,
            "review_note": None,
            "reviewed_at": None,
        })

    # 4. Pending new_page — Global scope (Environment, no location) (normal5 suggests)
    suggestions.append({
        "suggestion_type": "new_page",
        "glossary_term_id": None,
        "wiki_page_path": None,
        "wiki_page_id": None,
        "proposed_title": "Renewable Energy Transition",
        "proposed_aliases": [],
        "proposed_summary": "How the global energy system is shifting from fossil fuels to renewable sources.",
        "proposed_content": (
            "# Renewable Energy Transition\n\n"
            "The global shift from fossil fuels to renewable energy sources is one of the defining "
            "policy challenges of the 21st century.\n\n"
            "## Key Technologies\n\n"
            "- **Solar photovoltaic**: Fastest-growing energy source globally\n"
            "- **Wind power**: Onshore and offshore installations\n"
            "- **Battery storage**: Enabling intermittent renewables to provide reliable power\n"
            "- **Green hydrogen**: Potential fuel for hard-to-electrify sectors\n\n"
            "## Policy Mechanisms\n\n"
            "- [Cap and Trade](/en/cap-and-trade) — market-based emissions pricing\n"
            "- Tax credits and subsidies for clean energy investment\n"
            "- Renewable portfolio standards requiring utilities to source from renewables\n\n"
            "## Challenges\n\n"
            "- Grid modernization and transmission infrastructure\n"
            "- Intermittency and energy storage at scale\n"
            "- Supply chain for critical minerals (lithium, cobalt, rare earths)\n"
            "- Just transition for fossil fuel workers and communities\n\n"
            "## Related\n\n"
            "- [Paris Climate Agreement](/en/paris-climate-agreement) — the international climate framework\n"
            "- [Cap and Trade](/en/cap-and-trade) — a market-based emissions reduction approach"
        ),
        "proposed_wiki_category": "Topics",
        "proposed_scopes": json.dumps([
            {"type": "session", "id": environment_id},
        ]) if environment_id else "[]",
        "proposed_scope_combine": "or",
        "original_title": None,
        "original_aliases": "{}",
        "original_summary": None,
        "original_content": None,
        "original_wiki_category": None,
        "original_scopes": "[]",
        "original_scope_combine": "or",
        "original_updated_at": None,
        "suggested_by": users["normal5"],
        "suggestion_reason": "Important topic that connects several existing glossary terms.",
        "status": "pending",
        "reviewed_by": None,
        "review_note": None,
        "reviewed_at": None,
    })

    # 5. Approved edit_term — Rent control edit approved by admin1 (normal1 suggested)
    if rent_control:
        rc_scopes = get_term_scopes(rent_control["id"])
        suggestions.append({
            "suggestion_type": "edit_term",
            "glossary_term_id": rent_control["id"],
            "wiki_page_path": None,
            "wiki_page_id": None,
            "proposed_title": rent_control["term"],
            "proposed_aliases": ["rent stabilization", "rent cap", "rent ceiling"],
            "proposed_summary": rent_control["summary"],
            "proposed_content": rent_control["content"],
            "proposed_wiki_category": rent_control.get("wiki_category") or "Economy",
            "proposed_scopes": json.dumps(rc_scopes),
            "proposed_scope_combine": rent_control.get("scope_combine", "or"),
            "original_title": rent_control["term"],
            "original_aliases": rent_control["aliases"] or [],
            "original_summary": rent_control["summary"],
            "original_content": rent_control["content"],
            "original_wiki_category": rent_control.get("wiki_category"),
            "original_scopes": json.dumps(rc_scopes),
            "original_scope_combine": rent_control.get("scope_combine", "or"),
            "original_updated_at": rent_control["updated_at"],
            "suggested_by": users["normal1"],
            "suggestion_reason": "Adding 'rent ceiling' as an additional alias.",
            "status": "approved",
            "reviewed_by": users["admin1"],
            "review_note": "Good addition.",
            "reviewed_at": "NOW()",
        })

    # 6. Denied new_term — normal2 tried to add something low quality (denied by moderator1)
    suggestions.append({
        "suggestion_type": "new_term",
        "glossary_term_id": None,
        "wiki_page_path": None,
        "wiki_page_id": None,
        "proposed_title": "Political Parties",
        "proposed_aliases": ["parties"],
        "proposed_summary": "Organizations that seek political power through elections.",
        "proposed_content": "# Political Parties\n\nPolitical parties are groups of people who share similar ideas about government.",
        "proposed_wiki_category": "Governance",
        "proposed_scopes": json.dumps([
            {"type": "location", "id": us_id},
            {"type": "session", "id": elections_id},
        ]) if us_id and elections_id else "[]",
        "proposed_scope_combine": "or",
        "original_title": None,
        "original_aliases": "{}",
        "original_summary": None,
        "original_content": None,
        "original_wiki_category": None,
        "original_scopes": "[]",
        "original_scope_combine": "or",
        "original_updated_at": None,
        "suggested_by": users["normal2"],
        "suggestion_reason": "Seems like an important topic.",
        "status": "denied",
        "reviewed_by": users.get("moderator1", users["admin1"]),
        "review_note": "Too broad — consider focusing on a specific aspect like party primaries, third parties, or party platforms.",
        "reviewed_at": "NOW()",
    })

    # 7. Pending new_term — AND scope combine (Oregon + Immigration) (normal3 suggests)
    suggestions.append({
        "suggestion_type": "new_term",
        "glossary_term_id": None,
        "wiki_page_path": None,
        "wiki_page_id": None,
        "proposed_title": "Oregon Immigrant Worker Program",
        "proposed_aliases": ["OIWP"],
        "proposed_summary": "A proposed state program to provide work permits for undocumented agricultural workers in Oregon.",
        "proposed_content": (
            "# Oregon Immigrant Worker Program\n\n"
            "The **Oregon Immigrant Worker Program (OIWP)** is a proposed state-level initiative "
            "to create a pathway for undocumented agricultural workers to obtain state work authorization.\n\n"
            "## Background\n\n"
            "Oregon's agricultural sector relies heavily on immigrant labor. An estimated 80,000+ "
            "undocumented workers are employed in the state's farms and food processing facilities.\n\n"
            "## Proposed Features\n\n"
            "- State-issued agricultural work permits\n"
            "- Worker protection standards and wage guarantees\n"
            "- Path to state residency documentation\n\n"
            "## Related\n\n"
            "- [DACA](/en/daca) — federal protection for childhood arrivals\n"
            "- [Sanctuary City](/en/sanctuary-city) — Oregon's sanctuary state law"
        ),
        "proposed_wiki_category": "Policy",
        "proposed_scopes": json.dumps([
            {"type": "location", "id": or_id},
            {"type": "session", "id": immigration_id},
        ]) if or_id and immigration_id else "[]",
        "proposed_scope_combine": "and",
        "original_title": None,
        "original_aliases": "{}",
        "original_summary": None,
        "original_content": None,
        "original_wiki_category": None,
        "original_scopes": "[]",
        "original_scope_combine": "or",
        "original_updated_at": None,
        "suggested_by": users["normal3"],
        "suggestion_reason": "Relevant to Oregon immigration policy discussions.",
        "status": "pending",
        "reviewed_by": None,
        "review_note": None,
        "reviewed_at": None,
    })

    # 8. Withdrawn edit_page — normal2 withdrew their own suggestion
    if voting_page:
        vp_scopes = get_page_scopes(voting_page["id"])
        suggestions.append({
            "suggestion_type": "edit_page",
            "glossary_term_id": None,
            "wiki_page_path": voting_page["slug"],
            "wiki_page_id": str(voting_page["id"]),
            "proposed_title": voting_page["title"],
            "proposed_aliases": [],
            "proposed_summary": voting_page.get("description"),
            "proposed_content": voting_page["content"] + "\n\n## Unofficial note\n\nThis was going to be a change but I realized it was wrong.",
            "proposed_wiki_category": voting_page.get("wiki_category") or "Guides",
            "proposed_scopes": json.dumps(vp_scopes),
            "proposed_scope_combine": voting_page.get("scope_combine", "or"),
            "original_title": voting_page["title"],
            "original_aliases": [],
            "original_summary": voting_page.get("description"),
            "original_content": voting_page["content"],
            "original_wiki_category": voting_page.get("wiki_category"),
            "original_scopes": json.dumps(vp_scopes),
            "original_scope_combine": voting_page.get("scope_combine", "or"),
            "original_updated_at": voting_page["updated_at"],
            "suggested_by": users["normal2"],
            "suggestion_reason": "Adding a note about early voting.",
            "status": "withdrawn",
            "reviewed_by": None,
            "review_note": None,
            "reviewed_at": None,
        })

    seeded = 0
    for s in suggestions:
        reviewed_at_val = None
        if s["reviewed_at"] == "NOW()":
            # Use raw SQL for NOW()
            reviewed_at_sql = "NOW()"
        else:
            reviewed_at_sql = "%s"

        # Build the query dynamically for NOW() vs NULL reviewed_at
        query = f"""
            INSERT INTO wiki_suggestion (
                suggestion_type, glossary_term_id, wiki_page_path, wiki_page_id,
                proposed_title, proposed_aliases, proposed_summary, proposed_content,
                proposed_wiki_category, proposed_scopes, proposed_scope_combine,
                original_title, original_aliases, original_summary, original_content,
                original_wiki_category, original_scopes, original_scope_combine,
                original_updated_at, suggested_by, suggestion_reason,
                status, reviewed_by, review_note, reviewed_at
            ) VALUES (
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, {reviewed_at_sql}
            )
        """
        params = [
            s["suggestion_type"], s["glossary_term_id"], s["wiki_page_path"], s["wiki_page_id"],
            s["proposed_title"], s["proposed_aliases"], s["proposed_summary"], s["proposed_content"],
            s["proposed_wiki_category"], s["proposed_scopes"], s["proposed_scope_combine"],
            s["original_title"], s["original_aliases"], s["original_summary"], s["original_content"],
            s["original_wiki_category"], s["original_scopes"], s["original_scope_combine"],
            s["original_updated_at"], s["suggested_by"], s["suggestion_reason"],
            s["status"], s["reviewed_by"], s["review_note"],
        ]
        if reviewed_at_sql == "%s":
            params.append(None)

        try:
            db_execute(query, tuple(params))
            seeded += 1
        except Exception as e:
            print(f"    Failed to seed suggestion '{s['proposed_title']}': {e}")

    print(f"    Seeded {seeded} wiki suggestions")
    print("  Phase 16 complete")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Seed rich dev data for Candid')
    parser.add_argument('--api-url', default=API_URL, help='Candid API URL')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done')
    parser.add_argument('--phase', type=int, help='Run only this phase (1-16)')
    args = parser.parse_args()

    random.seed(42)  # Reproducible data

    api = CandidAPI(args.api_url)

    print(f"Candid Seed Data Generator")
    print(f"API: {args.api_url}")
    print(f"DB:  {DB_URL}")
    if args.dry_run:
        print("[DRY RUN MODE]")

    # Login as existing user to get sessions/locations
    if not api.login("admin1"):
        print("ERROR: Could not login as admin1. Is the API running?")
        sys.exit(1)

    sessions = api.get_sessions()
    locations = api.get_locations()
    if not sessions or not locations:
        print("ERROR: Could not fetch sessions or locations")
        sys.exit(1)

    session_map = {c.get('name', c.get('label', '')): c['id'] for c in sessions}

    # Resolve location IDs for all location codes used in SESSION_CONFIG
    location_ids = {}  # location code → UUID (for all locations)
    all_loc_codes = set(LOCATION_TO_STATE.keys())
    for row in (db_query("SELECT id, code FROM location") or []):
        code = row["code"]
        if code in all_loc_codes:
            location_ids[code] = str(row["id"])
    # City-level location IDs for user assignment
    user_location_ids = {}  # state code → city-level UUID
    for code in ["OR", "CA", "TX"]:
        user_location_ids[code] = CITY_LOCATION_IDS[code]

    oregon_id = location_ids.get("OR")

    # Get affiliations (Oregon only — CA/TX don't have affiliations in basic.sql)
    affiliations = {}
    affs = db_query("SELECT id, name FROM affiliation WHERE location_id = %s", (oregon_id,))
    for a in (affs or []):
        affiliations[a['name']] = str(a['id'])

    print(f"Locations: OR={oregon_id}, CA={location_ids.get('CA')}, TX={location_ids.get('TX')}")
    print(f"Sessions: {len(session_map)}")
    print(f"Affiliations: {len(affiliations)}")

    def should_run(phase):
        return args.phase is None or args.phase == phase

    errors = []

    def run_phase(phase_num, name, fn, *fn_args):
        """Run a phase with error handling. Continues on failure."""
        if not should_run(phase_num):
            return None
        try:
            return fn(*fn_args)
        except Exception as e:
            msg = f"Phase {phase_num} ({name}) failed: {e}"
            print(f"\n  ERROR: {msg}")
            errors.append(msg)
            import traceback
            traceback.print_exc()
            return None

    # Phase 1: Users (must succeed — later phases depend on user list)
    if should_run(1):
        all_users = phase_1_users(api, user_location_ids, args.dry_run)
    else:
        # Reconstruct user list
        all_users = []
        for belief, config in BELIEF_SYSTEMS.items():
            for i in range(config["count"]):
                idx = i + 1
                all_users.append({
                    "username": f"{config['prefix']}_user_{idx}",
                    "password": "password", "belief": belief,
                    "vote_index": config["vote_index"],
                    "vote_noise": config["vote_noise"],
                    "lean": config["lean"],
                    "state": _user_state(idx),
                })

    # Phase 2: Demographics (skip affiliations for CA/TX — none in basic.sql)
    run_phase(2, "Demographics", phase_2_demographics, api, affiliations, args.dry_run)

    # Phase 3: Staged Content (positions + posts + comments + votes)
    # Must succeed — later phases depend on positions list
    if should_run(3):
        positions = phase_3_staged_content(api, session_map, location_ids,
                                           all_users, args.dry_run)
    else:
        # Reconstruct positions from DB + JSON
        seed_content = _load_seed_content()
        positions = []
        for pos_data in seed_content["positions"]:
            row = db_query_one("SELECT id FROM position WHERE statement = %s",
                               (pos_data["statement"],))
            if row:
                positions.append({"id": str(row["id"]),
                                  "statement": pos_data["statement"],
                                  "votes": pos_data["votes"],
                                  "session": pos_data["session"]})

    # Phase 4: No-op (merged into phase 3)
    run_phase(4, "Votes", phase_4_votes, api, all_users, positions, args.dry_run)
    run_phase(5, "Adoptions", phase_5_adoptions, api, all_users, positions, args.dry_run)
    run_phase(6, "Chats", phase_6_chats, api, all_users, positions, args.dry_run)
    run_phase(7, "Kudos", phase_7_kudos, api, args.dry_run)
    run_phase(8, "Moderation", phase_8_moderation, api, positions, args.dry_run)
    run_phase(9, "Surveys", phase_9_surveys, api, args.dry_run)
    run_phase(10, "Pairwise", phase_10_pairwise, api, args.dry_run)
    run_phase(11, "Admin", phase_11_admin, api, oregon_id, session_map, args.dry_run)
    # Phase 12: No-op (merged into phase 3)
    run_phase(12, "Posts", phase_12_posts)
    run_phase(13, "Notifications", phase_13_notifications, args.dry_run)
    run_phase(14, "Glossary", phase_14_glossary, oregon_id, session_map, args.dry_run)
    run_phase(15, "Wiki Pages", phase_15_wiki_pages, args.dry_run)
    run_phase(16, "Wiki Suggestions", phase_16_wiki_suggestions, oregon_id,
              session_map, args.dry_run)

    print("\n" + "=" * 60)
    print("SEED COMPLETE")
    print("=" * 60)
    if not args.dry_run:
        counts = db_query("""
            SELECT 'users' as tbl, count(*) as cnt FROM users
            UNION ALL SELECT 'positions', count(*) FROM position
            UNION ALL SELECT 'responses', count(*) FROM response
            UNION ALL SELECT 'user_positions', count(*) FROM user_position
            UNION ALL SELECT 'chat_logs', count(*) FROM chat_log
            UNION ALL SELECT 'reports', count(*) FROM report
            UNION ALL SELECT 'kudos', count(*) FROM kudos
            UNION ALL SELECT 'role_requests', count(*) FROM role_change_request
            UNION ALL SELECT 'admin_actions', count(*) FROM admin_action_log
            UNION ALL SELECT 'surveys', count(*) FROM survey
            UNION ALL SELECT 'posts', count(*) FROM post
            UNION ALL SELECT 'comments', count(*) FROM comment
            UNION ALL SELECT 'post_votes', count(*) FROM post_vote
            UNION ALL SELECT 'comment_votes', count(*) FROM comment_vote
            UNION ALL SELECT 'notifications', count(*) FROM notification_inbox
            UNION ALL SELECT 'glossary_terms', count(*) FROM glossary_term
            UNION ALL SELECT 'wiki_pages', count(*) FROM wiki_page
            UNION ALL SELECT 'wiki_suggestions', count(*) FROM wiki_suggestion
            ORDER BY tbl
        """)
        for row in (counts or []):
            print(f"  {row['tbl']}: {row['cnt']}")

    if errors:
        print(f"\n  WARNINGS: {len(errors)} phase(s) had errors:")
        for err in errors:
            print(f"    - {err}")


if __name__ == '__main__':
    main()
