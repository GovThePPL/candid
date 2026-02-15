#!/usr/bin/env python3
"""
Seed rich, realistic dev data via the Candid API.

Creates 50 users across 10 belief systems (bell-curve distribution from
progressive to traditionalist), positions with coherent voting patterns,
chats pairing opposing beliefs, moderation scenarios (banning normal4),
demographics, surveys, and pairwise responses.

Idempotent: safe to run multiple times. Checks for existing data before
creating.

Usage:
    python seed_dev_data.py [--api-url URL] [--dry-run] [--phase PHASE]

Phases (all run by default):
    1  users          Register 50 generated users
    2  demographics   Set demographics for all 60 users
    3  positions      Create ~36 positions across categories
    4  votes          All 60 users vote with coherent patterns + jitter
    5  adoptions      Users adopt positions they agree with
    6  chats          Create chat requests, accept some, inject messages
    7  kudos          Send kudos between agreed_closure participants
    8  moderation     Reports, actions, bans (normal4), appeals
    9  surveys        Respond to healthcare survey
   10  pairwise       Respond to pairwise comparisons
   11  admin          Role requests, bans, admin surveys
   12  posts          Posts, nested comments, and votes (direct SQL)
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

WORKERS = 8  # Thread pool size for parallel API calls
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
    "progressive":    {"count": 4, "prefix": "prog",  "vote_index": 0, "vote_noise": 0.15, "lean": "very_liberal"},
    "liberal":        {"count": 6, "prefix": "lib",   "vote_index": 1, "vote_noise": 0.18, "lean": "liberal"},
    "social_democrat": {"count": 4, "prefix": "socdem","vote_index": 2, "vote_noise": 0.18, "lean": "liberal"},
    "socialist":      {"count": 3, "prefix": "soc",   "vote_index": 3, "vote_noise": 0.15, "lean": "very_liberal"},
    "moderate":       {"count": 8, "prefix": "mod",   "vote_index": 4, "vote_noise": 0.25, "lean": "moderate"},
    "centrist":       {"count": 6, "prefix": "cen",   "vote_index": 5, "vote_noise": 0.25, "lean": "moderate"},
    "libertarian":    {"count": 5, "prefix": "libt",  "vote_index": 6, "vote_noise": 0.20, "lean": "conservative"},
    "conservative":   {"count": 7, "prefix": "con",   "vote_index": 7, "vote_noise": 0.15, "lean": "conservative"},
    "populist":       {"count": 4, "prefix": "pop",   "vote_index": 8, "vote_noise": 0.15, "lean": "very_conservative"},
    "traditionalist": {"count": 3, "prefix": "trad",  "vote_index": 9, "vote_noise": 0.12, "lean": "very_conservative"},
}

# Votes: (prog, lib, socdem, soc, mod, cen, libt, con, pop, trad)
# Moderates/centrists still have opinions on most issues — they just lean less predictably.
# Pass (0) is reserved for genuinely ambiguous positions where a group has no clear lean.
POSITIONS = [
    # --- Economy & Taxation ---
    {"statement": "The free market should operate with minimal government intervention.",
     "category": "Economy & Taxation",
     "votes": (-1, -1, -1, -1,  1,  0,  1,  1,  1,  1)},
    {"statement": "Wealthy corporations should pay significantly higher taxes to fund social programs.",
     "category": "Economy & Taxation",
     "votes": ( 1,  1,  1,  1,  1, -1, -1, -1,  1, -1)},
    {"statement": "Tariffs on imported goods protect American workers and should be increased.",
     "category": "Economy & Taxation",
     "votes": ( 0, -1,  0,  0, -1, -1, -1,  0,  1,  1)},
    {"statement": "A universal basic income would reduce poverty more effectively than current welfare programs.",
     "category": "Economy & Taxation",
     "votes": ( 1,  1,  1,  1, -1, -1,  0, -1, -1, -1)},
    {"statement": "Labor unions are essential for protecting workers' rights.",
     "category": "Economy & Taxation",
     "votes": ( 1,  1,  1,  1,  1,  1, -1, -1,  1, -1)},

    # --- Social Issues ---
    {"statement": "Traditional family values should be promoted and protected by government policy.",
     "category": "Social Issues",
     "votes": (-1, -1, -1, -1, -1, -1, -1,  1,  1,  1)},
    {"statement": "Same-sex marriage should be legally recognized and protected.",
     "category": "Social Issues",
     "votes": ( 1,  1,  1,  1,  1,  1,  1, -1, -1, -1)},
    {"statement": "Transgender individuals should be able to use bathrooms matching their gender identity.",
     "category": "Social Issues",
     "votes": ( 1,  1,  1,  1,  1,  0,  0, -1, -1, -1)},
    {"statement": "Prayer and religious education should be allowed in public schools.",
     "category": "Social Issues",
     "votes": (-1, -1, -1, -1, -1, -1, -1,  1,  1,  1)},

    # --- Civil Rights & Liberties ---
    {"statement": "Systemic racism is a significant problem in American institutions today.",
     "category": "Civil Rights & Liberties",
     "votes": ( 1,  1,  1,  1,  1, -1, -1, -1, -1, -1)},
    {"statement": "The Second Amendment guarantees an individual right to own firearms with minimal restrictions.",
     "category": "Civil Rights & Liberties",
     "votes": (-1, -1, -1, -1, -1,  1,  1,  1,  1,  1)},

    # --- Immigration ---
    {"statement": "A physical wall on the southern border is necessary for national security.",
     "category": "Immigration",
     "votes": (-1, -1, -1, -1, -1, -1, -1,  1,  1,  1)},
    {"statement": "Undocumented immigrants who have lived here for years should have a path to citizenship.",
     "category": "Immigration",
     "votes": ( 1,  1,  1,  1,  1,  1,  0, -1, -1, -1)},
    {"statement": "Immigration levels should be reduced to protect American jobs.",
     "category": "Immigration",
     "votes": (-1, -1, -1, -1, -1, -1,  0,  1,  1,  1)},
    {"statement": "Sanctuary cities that don't cooperate with federal immigration enforcement should lose funding.",
     "category": "Immigration",
     "votes": (-1, -1, -1, -1,  0, -1,  1,  1,  1,  1)},

    # --- Government & Democracy ---
    {"statement": "The 2020 presidential election was conducted fairly and the results were legitimate.",
     "category": "Government & Democracy",
     "votes": ( 1,  1,  1,  1,  1,  1,  1,  1, -1, -1)},
    {"statement": "Voter ID requirements are necessary to prevent election fraud.",
     "category": "Government & Democracy",
     "votes": (-1, -1, -1, -1,  1,  1,  1,  1,  1,  1)},
    {"statement": "The federal government has become too large and should be significantly reduced.",
     "category": "Government & Democracy",
     "votes": (-1, -1, -1, -1, -1,  1,  1,  1,  1,  1)},
    {"statement": "Big tech companies have too much power and should be broken up or heavily regulated.",
     "category": "Government & Democracy",
     "votes": ( 1,  1,  1,  1,  1,  1, -1,  1,  1,  0)},

    # --- Healthcare ---
    {"statement": "Healthcare should be provided by the government as a right, not a privilege.",
     "category": "Healthcare",
     "votes": ( 1,  1,  1,  1,  1, -1, -1, -1, -1, -1)},
    {"statement": "Abortion should be legal and accessible in all circumstances.",
     "category": "Healthcare",
     "votes": ( 1,  1,  1,  1, -1, -1,  1, -1, -1, -1)},
    {"statement": "Life begins at conception and abortion is morally wrong.",
     "category": "Healthcare",
     "votes": (-1, -1, -1, -1,  1,  1, -1,  1,  1,  1)},
    {"statement": "Vaccine mandates are a reasonable public health measure.",
     "category": "Healthcare",
     "votes": ( 1,  1,  1,  1,  1,  1, -1,  0, -1, -1)},

    # --- Environment & Climate ---
    {"statement": "Climate change is an urgent crisis requiring immediate government action.",
     "category": "Environment & Climate",
     "votes": ( 1,  1,  1,  1,  1,  1, -1, -1, -1, -1)},
    {"statement": "Environmental regulations hurt businesses and cost jobs.",
     "category": "Environment & Climate",
     "votes": (-1, -1, -1, -1, -1, -1,  1,  1,  1,  1)},
    {"statement": "The US should rejoin and strengthen the Paris Climate Agreement.",
     "category": "Environment & Climate",
     "votes": ( 1,  1,  1,  1,  1,  1, -1, -1, -1, -1)},

    # --- Foreign Policy & Defense ---
    {"statement": "The United States should prioritize its own interests over international cooperation.",
     "category": "Foreign Policy & Defense",
     "votes": (-1, -1, -1, -1, -1, -1,  1,  1,  1,  1)},
    {"statement": "NATO and our European alliances are essential for American security.",
     "category": "Foreign Policy & Defense",
     "votes": ( 1,  1,  1, -1,  1,  1,  0,  1, -1,  0)},
    {"statement": "Military spending should be significantly reduced and redirected to domestic programs.",
     "category": "Foreign Policy & Defense",
     "votes": ( 1,  1,  1,  1, -1, -1,  1, -1, -1, -1)},
    {"statement": "The US should continue strong military support for Israel.",
     "category": "Foreign Policy & Defense",
     "votes": (-1, -1, -1, -1,  1,  1,  0,  1,  1,  1)},

    # --- Criminal Justice ---
    {"statement": "Police departments need more funding, not less.",
     "category": "Criminal Justice",
     "votes": (-1, -1, -1, -1,  1,  1,  1,  1,  1,  1)},
    {"statement": "The criminal justice system is biased against minorities and needs fundamental reform.",
     "category": "Criminal Justice",
     "votes": ( 1,  1,  1,  1,  1,  0, -1, -1, -1, -1)},
    {"statement": "Drug possession should be decriminalized and treated as a health issue.",
     "category": "Criminal Justice",
     "votes": ( 1,  1,  1,  1,  1,  1,  1, -1, -1, -1)},

    # --- Education ---
    {"statement": "Parents should have the right to choose where their children go to school using public funds.",
     "category": "Education",
     "votes": (-1, -1, -1, -1, -1,  1,  1,  1,  1,  1)},
    {"statement": "Critical race theory should not be taught in public schools.",
     "category": "Education",
     "votes": (-1, -1, -1, -1,  1,  1,  0,  1,  1,  1)},
    {"statement": "College tuition should be free at public universities.",
     "category": "Education",
     "votes": ( 1,  1,  1,  1,  1, -1, -1, -1, -1, -1)},
]

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
        resp = self.session.post(token_url, data={
            "grant_type": "password",
            "client_id": "candid-app",
            "username": username,
            "password": password,
        }, timeout=10)
        if resp.status_code != 200:
            return False

        self.token = resp.json().get("access_token")
        # Fetch Candid user profile (triggers auto-registration if needed)
        user_resp = self.session.get(f"{self.base_url}/api/v1/users/me", headers=self._headers())
        if user_resp.status_code == 200:
            self.user_id = user_resp.json().get("id")
            return True
        return False

    def _headers(self):
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    def get_categories(self):
        r = self.session.get(f"{self.base_url}/api/v1/categories", headers=self._headers())
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

    def create_position(self, statement, category_id, location_id):
        r = self.session.post(f"{self.base_url}/api/v1/positions",
                              json={"statement": statement, "categoryId": category_id,
                                    "locationId": location_id},
                              headers=self._headers())
        return r.json() if r.status_code in (200, 201) else None

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
        r = self.session.post(f"{self.base_url}/api/v1/chats/requests/",
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

    # --- Admin: Roles ---

    def request_role_assignment(self, target_user_id, role, location_id,
                                category_id=None, reason=None):
        body = {"action": "assign", "targetUserId": target_user_id,
                "role": role, "locationId": location_id}
        if category_id:
            body["positionCategoryId"] = category_id
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
                            location_id=None, category_id=None):
        body = {
            "surveyTitle": title,
            "startTime": start_time,
            "endTime": end_time,
            "questions": questions,
        }
        if location_id:
            body["locationId"] = location_id
        if category_id:
            body["positionCategoryId"] = category_id
        r = self.session.post(f"{self.base_url}/api/v1/admin/surveys",
                              json=body, headers=self._headers())
        return r.json() if r.status_code in (200, 201) else None

    def create_admin_pairwise_survey(self, title, start_time, end_time, items,
                                     comparison_question=None, location_id=None,
                                     category_id=None):
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
        if category_id:
            body["positionCategoryId"] = category_id
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


# ---------------------------------------------------------------------------
# Phase 1: Register 50 generated users + set locations for all 60
# ---------------------------------------------------------------------------

def phase_1_users(api, location_id, dry_run=False):
    print("\n" + "=" * 60)
    print("PHASE 1: Users")
    print("=" * 60)

    all_users = []

    # Build user list
    for belief, config in BELIEF_SYSTEMS.items():
        for i in range(config["count"]):
            username = f"{config['prefix']}_user_{i+1}"
            email = f"{username}@test.local"
            display_name = f"{belief.replace('_', ' ').title()} User {i+1}"
            all_users.append({
                "username": username, "email": email, "password": "password",
                "display_name": display_name, "belief": belief,
                "vote_index": config["vote_index"], "vote_noise": config["vote_noise"],
                "lean": config["lean"],
            })

    if dry_run:
        print(f"  Total generated: {len(all_users)}")
        return all_users

    def register_and_set_location(user):
        t_api = CandidAPI(api.base_url)
        result = t_api.register(user["username"], user["email"], "password", user["display_name"])
        if result:
            t_api.set_location(location_id)
            return f"  Created: {user['username']}"
        elif t_api.login(user["username"]):
            t_api.set_location(location_id)
            return f"  Exists:  {user['username']}"
        return f"  ERROR:   {user['username']}"

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for msg in pool.map(register_and_set_location, all_users):
            print(msg)

    # Set location for core users too
    def set_core_location(username):
        t_api = CandidAPI(api.base_url)
        if t_api.login(username):
            t_api.set_location(location_id)

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
        print(f"  Generated users: 50")
        return

    # Build all (username, demo_data) pairs upfront
    # ~20% of generated users skip demographics entirely; others fill 50-100% of fields
    demo_tasks = list(core_demos.items())  # Core users always get full demographics
    optional_fields = ["education", "geoLocale", "sex", "ageRange", "incomeRange", "race"]
    for belief, config in BELIEF_SYSTEMS.items():
        dist = DEMO_DISTRIBUTIONS[belief]
        for i in range(config["count"]):
            username = f"{config['prefix']}_user_{i+1}"
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
# Phase 3: Positions
# ---------------------------------------------------------------------------

def phase_3_positions(api, category_map, location_id, dry_run=False):
    print("\n" + "=" * 60)
    print("PHASE 3: Positions")
    print("=" * 60)

    # Check if positions already exist (from previous run)
    existing = db_query("SELECT statement FROM position WHERE creator_user_id NOT IN " +
                        "(SELECT id FROM users WHERE username IN ('admin1','moderator1','moderator2','normal1','normal2','normal3','normal4','normal5'))")
    existing_stmts = {r['statement'] for r in (existing or [])}

    creators = ["prog_user_1", "lib_user_1", "socdem_user_1", "soc_user_1", "mod_user_1",
                "cen_user_1", "libt_user_1", "con_user_1", "pop_user_1", "trad_user_1"]
    positions_created = []

    for i, pos_data in enumerate(POSITIONS):
        if pos_data["statement"] in existing_stmts:
            # Already exists — look up ID
            row = db_query_one("SELECT id FROM position WHERE statement = %s", (pos_data["statement"],))
            if row:
                positions_created.append({"id": str(row["id"]), "statement": pos_data["statement"],
                                          "votes": pos_data["votes"]})
            continue

        cat_id = category_map.get(pos_data["category"])
        if not cat_id:
            print(f"  WARNING: Category '{pos_data['category']}' not found")
            continue

        creator = creators[i % len(creators)]
        if dry_run:
            positions_created.append({"id": f"dry-{i}", "statement": pos_data["statement"],
                                      "votes": pos_data["votes"]})
            continue

        if api.login(creator):
            result = api.create_position(pos_data["statement"], cat_id, location_id)
            if result:
                positions_created.append({"id": result.get("id"), "statement": pos_data["statement"],
                                          "votes": pos_data["votes"]})
                print(f"  Created: {pos_data['statement'][:60]}...")

    # Also pick up existing positions from previous seed runs
    if not dry_run and len(positions_created) < len(POSITIONS):
        for pos_data in POSITIONS:
            if any(p["statement"] == pos_data["statement"] for p in positions_created):
                continue
            row = db_query_one("SELECT id FROM position WHERE statement = %s", (pos_data["statement"],))
            if row:
                positions_created.append({"id": str(row["id"]), "statement": pos_data["statement"],
                                          "votes": pos_data["votes"]})

    print(f"  Total positions: {len(positions_created)}")
    return positions_created


# ---------------------------------------------------------------------------
# Phase 4: Votes
# ---------------------------------------------------------------------------

def phase_4_votes(api, all_users, positions, dry_run=False):
    """Vote on seed-script positions only.

    Note: positions from basic.sql are not included here because they lack
    the coherent ``votes`` tuple used for belief-system-based voting.  This
    means a handful of basic.sql positions will have zero (or very few) votes
    in Polis.  This is acceptable — the seed data is illustrative, not
    exhaustive.
    """
    print("\n" + "=" * 60)
    print("PHASE 4: Votes")
    print("=" * 60)

    # Idempotency: skip if responses already exist beyond basic.sql seed data
    existing = db_query_one("SELECT count(*) as cnt FROM response")
    if existing and existing['cnt'] > 50:
        print(f"  Responses already exist ({existing['cnt']}), skipping")
        return

    # Include core users with their lean-appropriate vote patterns (from CORE_VOTE_MAP)
    voters = []
    for username, (vidx, vnoise) in CORE_VOTE_MAP.items():
        voters.append({"username": username, "vote_index": vidx, "vote_noise": vnoise})
    for u in all_users:
        voters.append(u)

    # Pre-compute each voter's position subset and vote responses
    voter_tasks = []
    for voter in voters:
        vote_fraction = random.uniform(0.65, 0.90)
        voter_positions = random.sample(positions, int(len(positions) * vote_fraction))
        vote_plan = []
        for pos_data in voter_positions:
            expected = pos_data["votes"][voter["vote_index"]]
            response = get_vote_response(expected, voter["vote_noise"])
            vote_plan.append((pos_data["id"], response))
        voter_tasks.append((voter["username"], vote_plan))

    if dry_run:
        total = sum(len(plan) for _, plan in voter_tasks)
        print(f"  Total votes: {total}")
        return

    def cast_votes(task):
        username, vote_plan = task
        t_api = CandidAPI(api.base_url)
        if not t_api.login(username):
            return (username, 0)
        count = 0
        for pos_id, response in vote_plan:
            if t_api.vote(pos_id, response):
                count += 1
        return (username, count)

    total = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for username, count in pool.map(cast_votes, voter_tasks):
            if count > 0:
                print(f"  {username}: {count} votes")
                total += count

    print(f"  Total votes: {total}")


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
    # Add core users using CORE_VOTE_MAP for belief-coherent adoptions
    for username in ["normal1", "normal2", "normal3", "normal4", "normal5"]:
        if username in CORE_VOTE_MAP:
            vidx, vnoise = CORE_VOTE_MAP[username]
            adopters.append({"username": username, "vote_index": vidx, "vote_noise": vnoise})

    if dry_run:
        print("  Total adoptions: (dry run)")
        return

    # Pre-compute adoption targets per user
    adopt_tasks = []
    for user in adopters:
        targets = []
        for pos_data in positions:
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
        ("initiator", "Exactly. I think we can find some common ground here."),
        ("responder", "Let's try. What aspects do you think we agree on?"),
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
        ("initiator", "That's eye-opening. I hadn't considered that angle."),
        ("responder", "And I can see how from your vantage point, the concerns you raise are legitimate too."),
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
        ("initiator", "If more people thought that way, we'd get better policy."),
        ("responder", "Agreed. The all-or-nothing framing in politics is exhausting."),
        ("initiator", "Can we at least agree on what the actual trade-offs are?"),
        ("responder", "Yes, let me propose something."),
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
        ("prog_user_1", "trad_user_1"),    # Progressive <-> Traditionalist
        ("lib_user_1", "con_user_1"),      # Liberal <-> Conservative
        ("socdem_user_1", "pop_user_1"),   # Social Democrat <-> Populist
        ("soc_user_1", "libt_user_1"),     # Socialist <-> Libertarian
        ("mod_user_1", "cen_user_1"),      # Moderate <-> Centrist (same-ish spectrum)
        ("lib_user_2", "pop_user_2"),      # Liberal <-> Populist
        ("prog_user_2", "con_user_2"),     # Progressive <-> Conservative
        ("socdem_user_2", "trad_user_2"),  # Social Democrat <-> Traditionalist
        ("lib_user_3", "libt_user_2"),     # Liberal <-> Libertarian
        ("prog_user_3", "con_user_3"),     # Progressive <-> Conservative
        ("mod_user_2", "con_user_4"),      # Moderate <-> Conservative
        ("soc_user_2", "trad_user_3"),     # Socialist <-> Traditionalist
        ("lib_user_4", "con_user_5"),      # Liberal <-> Conservative
        ("mod_user_3", "pop_user_3"),      # Moderate <-> Populist
        ("cen_user_2", "prog_user_4"),     # Centrist <-> Progressive
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
            log_json = {
                "messages": messages,
                "agreedPositions": agreed_positions,
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
            log_json = {
                "messages": messages,
                "agreedPositions": [],
                "agreedClosure": None,
                "endedByUserId": str(initiator_id),
                "exportTime": (base_time + timedelta(minutes=len(messages_template) * 3 + 5)).isoformat(),
            }
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

    # Idempotency: skip if kudos already exist
    existing = db_query_one("SELECT count(*) as cnt FROM kudos")
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

    # Assign trust scores to all generated users that don't have one yet.
    # Deterministic from username so re-runs are stable. Spread across the
    # full range so all badge tiers (gray/bronze/silver/gold) are represented.
    existing_ts = db_query_one("SELECT count(*) as cnt FROM users WHERE trust_score IS NOT NULL AND username LIKE '%%_user_%%'")
    if existing_ts and existing_ts['cnt'] > 0:
        print(f"  Trust scores already set for {existing_ts['cnt']} generated users, skipping")
    else:
        db_execute("""
            UPDATE users SET trust_score = (
                abs(('x' || substring(md5(username) from 1 for 8))::bit(32)::int)
                % 90 + 10
            )::decimal / 100
            WHERE trust_score IS NULL
            AND username NOT LIKE 'guest%%'
        """)
        count = db_query_one("SELECT count(*) as cnt FROM users WHERE trust_score IS NOT NULL AND username LIKE '%%_user_%%'")
        print(f"  Trust scores assigned to {count['cnt'] if count else 0} generated users")


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

def phase_11_admin(api, location_id, category_map, dry_run=False):
    print("\n" + "=" * 60)
    print("PHASE 11: Admin")
    print("=" * 60)

    oregon_id = location_id
    healthcare_cat = category_map.get("Healthcare")
    education_cat = category_map.get("Education")
    criminal_justice_cat = category_map.get("Criminal Justice")
    environment_cat = category_map.get("Environment & Climate")

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
                    category_id=healthcare_cat,
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
                    target_id, "expert", oregon_id, category_id=healthcare_cat,
                    reason="Would bring diverse perspective to healthcare discussions")
                if result:
                    req_id = result.get('id')
                    status = result.get('status')
                    print(f"    4. expert for con_user_1 → {status}")
                    if req_id and status == 'pending':
                        if api.login("moderator1"):
                            deny_result = api.deny_role_request(
                                req_id,
                                reason="Insufficient experience with the Healthcare category")
                            if deny_result:
                                print(f"       → denied by moderator1")

        # Scenario 5: normal1 → liaison for socdem_user_1 at Oregon+Healthcare
        # → pending, then normal1 rescinds
        if api.login("normal1"):
            target_id = lookup_user_id("socdem_user_1")
            if target_id:
                result = api.request_role_assignment(
                    target_id, "liaison", oregon_id, category_id=healthcare_cat,
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
                    target_id, "expert", oregon_id, category_id=healthcare_cat,
                    reason="Active participant in healthcare policy discussions")
                if result:
                    print(f"    6. expert for prog_user_1 → {result.get('status')}")

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
            "category": "Criminal Justice",
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
            "category": "Education",
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
        "category": "Environment & Climate",
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

                cat_id = category_map.get(s["category"])
                start_time = (now + timedelta(days=s["start_offset_days"])).isoformat()
                end_time = (now + timedelta(days=s["end_offset_days"])).isoformat()
                result = api.create_admin_survey(
                    s["title"], start_time, end_time, s["questions"],
                    location_id=oregon_id, category_id=cat_id)
                if result:
                    print(f"    Created: {s['title']}")
                else:
                    print(f"    FAILED: {s['title']}")

            if PAIRWISE_SURVEY["title"] not in existing_titles:
                cat_id = category_map.get(PAIRWISE_SURVEY["category"])
                start_time = (now + timedelta(
                    days=PAIRWISE_SURVEY["start_offset_days"])).isoformat()
                end_time = (now + timedelta(
                    days=PAIRWISE_SURVEY["end_offset_days"])).isoformat()
                result = api.create_admin_pairwise_survey(
                    PAIRWISE_SURVEY["title"], start_time, end_time,
                    PAIRWISE_SURVEY["items"],
                    comparison_question=PAIRWISE_SURVEY["comparison_question"],
                    location_id=oregon_id, category_id=cat_id)
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
        WHERE p.category_id = %s AND r.status = 'pending'
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
            WHERE p.category_id = %s
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

# Post content for seeding
SEED_POSTS = [
    # 0 - Discussion: transit (high engagement)
    {
        "type": "discussion",
        "title": "Should Portland invest more in public transit or road infrastructure?",
        "body": "I've been thinking about the transportation challenges we face in Portland. "
                "With rising fuel costs and environmental concerns, public transit seems like "
                "the way forward. But many neighborhoods are poorly served by buses and MAX. "
                "Meanwhile, our roads and bridges need serious maintenance.\n\n"
                "What do you think should be the priority?",
        "category": "Economy & Taxation",
    },
    # 1 - Discussion: remote work
    {
        "type": "discussion",
        "title": "The impact of remote work on Portland's downtown",
        "body": "Downtown Portland has changed a lot since remote work became widespread. "
                "Many offices sit half-empty, restaurants have closed, and foot traffic is down. "
                "But some argue this is a chance to reimagine downtown — more housing, more "
                "parks, more community spaces.\n\n"
                "How has remote work affected your relationship with downtown Portland?",
        "category": "Economy & Taxation",
    },
    # 2 - Discussion: homelessness (deep threads)
    {
        "type": "discussion",
        "title": "Homelessness crisis: What approaches actually work?",
        "body": "Portland has tried many approaches to address homelessness — from sanctioned "
                "camps to housing-first programs to enforcement. Results have been mixed at best.\n\n"
                "I'm interested in hearing from people across the political spectrum about what "
                "evidence-based approaches they think could make a real difference. Let's try to "
                "have a productive conversation about this difficult topic.",
        "category": "Social Issues",
    },
    # 3 - Discussion: local business
    {
        "type": "discussion",
        "title": "Supporting local businesses vs. big box stores",
        "body": "Every time a local shop closes and gets replaced by a chain, it feels like we "
                "lose a piece of Portland's character. But chains often offer lower prices, which "
                "matters to families on tight budgets.\n\n"
                "Is there a middle ground? How do you balance supporting local with affordability?",
        "category": "Economy & Taxation",
    },
    # 4 - Q&A: property tax (answered)
    {
        "type": "question",
        "title": "How does Oregon's property tax system work?",
        "body": "I'm relatively new to Oregon and confused by the property tax system. I've heard "
                "it's different from most states because of Measure 5 and Measure 50. Can someone "
                "explain how assessed value vs. real market value works, and why my neighbor's "
                "identical house might have a very different tax bill?",
        "category": "Economy & Taxation",
    },
    # 5 - Q&A: local government (unanswered)
    {
        "type": "question",
        "title": "What are the best ways to get involved in local government?",
        "body": "I want to be more engaged in local politics beyond just voting. What are the "
                "most effective ways for an average citizen to participate in Portland's "
                "decision-making processes? Are neighborhood associations still relevant?",
        "category": "Government & Democracy",
    },
    # 6 - Discussion: climate
    {
        "type": "discussion",
        "title": "Climate action: Individual responsibility vs. systemic change",
        "body": "I keep hearing two narratives about climate change:\n\n"
                "1. **Individual action matters** — reduce, reuse, recycle, drive less, eat less meat\n"
                "2. **Systemic change is needed** — corporate regulation, infrastructure investment, "
                "policy reform\n\n"
                "These aren't mutually exclusive, but where should we focus our energy? Portland has "
                "set ambitious climate goals. Are we on track?",
        "category": "Environment & Climate",
    },
    # 7 - Discussion: arts
    {
        "type": "discussion",
        "title": "Portland's arts and culture scene: thriving or struggling?",
        "body": "Portland has always had a vibrant arts scene — music venues, galleries, "
                "independent theaters, street art. But rising costs and the pandemic hit hard. "
                "Many venues closed permanently.\n\n"
                "What's the state of Portland's cultural scene today? What should the city "
                "be doing to support artists and cultural institutions?",
        "category": "Education",
    },
    # 8 - Q&A: mental health (answered)
    {
        "type": "question",
        "title": "What mental health resources are available in Portland?",
        "body": "A friend is going through a tough time and I'm trying to help them find "
                "affordable mental health care in Portland. The waitlists seem incredibly long. "
                "Does anyone know of resources, especially sliding-scale or community clinics?",
        "category": "Healthcare",
    },
    # 9 - Discussion: gun policy
    {
        "type": "discussion",
        "title": "Gun policy: Finding common ground in Oregon",
        "body": "Oregon's Measure 114 was a lightning rod. Regardless of where you stand on "
                "gun policy, most people agree we need to reduce gun violence. But we disagree "
                "strongly on how.\n\n"
                "Can we have a good-faith discussion about what gun policies might actually "
                "reduce harm while respecting rights? What does the evidence say?",
        "category": "Criminal Justice",
    },
    # 10 - Discussion: immigration (hot topic, many comments)
    {
        "type": "discussion",
        "title": "Oregon's role in the national immigration debate",
        "body": "Oregon has declared itself a sanctuary state, but opinions are divided on what "
                "that should mean in practice. Some see it as a moral imperative to protect "
                "immigrant communities. Others worry about the strain on public services.\n\n"
                "There's also the economic angle — many Oregon industries (agriculture, "
                "hospitality, construction) depend heavily on immigrant labor. How do we balance "
                "compassion, rule of law, and economic reality?\n\n"
                "I genuinely want to hear perspectives from all sides on this.",
        "category": "Immigration",
    },
    # 11 - Discussion: locked post (housing, mod locked it)
    {
        "type": "discussion",
        "title": "Rent control: Has it helped or hurt Portland?",
        "body": "Oregon passed statewide rent control in 2019, capping annual increases. "
                "Landlords say it discourages investment in rental housing. Tenants say it's "
                "the only thing preventing displacement.\n\n"
                "What's been your experience? Has rent control made housing more or less "
                "available in your neighborhood?",
        "category": "Economy & Taxation",
        "status": "locked",
    },
    # 12 - Discussion: markdown-heavy post with links
    {
        "type": "discussion",
        "title": "Resources for understanding Oregon ballot measures",
        "body": "I put together some resources for anyone trying to make sense of upcoming "
                "ballot measures. Feel free to add your own!\n\n"
                "## Official Sources\n"
                "- **Oregon Blue Book** — the official state almanac\n"
                "- **Oregon Secretary of State** — initiative and referendum info\n\n"
                "## Independent Analysis\n"
                "- **Oregon Legislative Revenue Office** — nonpartisan fiscal impact reports\n"
                "- **Ballotpedia** — comprehensive ballot measure tracking\n\n"
                "## Tips for Evaluating Measures\n"
                "1. Always read the actual measure text, not just the summary\n"
                "2. Look at who funded the signature gathering\n"
                "3. Check for unintended consequences in the legal language\n"
                "4. Compare analyses from *multiple* sources\n\n"
                "> \"An informed citizenry is the best defense against tyranny.\"\n\n"
                "What other resources do people find helpful?",
        "category": "Government & Democracy",
    },
    # 13 - Q&A: civil rights (unanswered)
    {
        "type": "question",
        "title": "How do citizen oversight boards for police actually work?",
        "body": "Portland has had various forms of police oversight over the years. I keep "
                "hearing about the new Community Board for Police Accountability but I'm confused "
                "about what power it actually has.\n\n"
                "Can someone explain:\n"
                "- What can the board investigate?\n"
                "- Can they compel officer testimony?\n"
                "- How are board members selected?\n"
                "- How does this compare to oversight in other cities?",
        "category": "Criminal Justice",
    },
    # 14 - Discussion: education (recent, few comments)
    {
        "type": "discussion",
        "title": "Should schools teach financial literacy as a required course?",
        "body": "I graduated from a Portland public school without ever learning how to do "
                "my taxes, understand a mortgage, or budget effectively. Meanwhile, I can "
                "still recite the quadratic formula.\n\n"
                "Some states are starting to require personal finance courses. Should Oregon "
                "do the same? What should the curriculum include?",
        "category": "Education",
    },
]

# Comment templates with nesting structure
SEED_COMMENTS = {
    # index into SEED_POSTS -> list of comment dicts
    0: [  # Transit post
        {"body": "Public transit all the way. A single MAX line removes hundreds of cars "
                 "from the road. The environmental and equity benefits are enormous.",
         "author_prefix": "prog", "replies": [
            {"body": "I agree transit is important, but MAX doesn't serve many neighborhoods. "
                     "We need better bus service before more rail.",
             "author_prefix": "mod"},
            {"body": "The issue is that transit requires density to be efficient. Portland's "
                     "sprawl makes bus routes unprofitable in many areas.",
             "author_prefix": "lib"},
        ]},
        {"body": "Our roads and bridges are literally crumbling. We can't ignore basic "
                 "infrastructure maintenance in favor of expensive rail projects.",
         "author_prefix": "con", "replies": [
            {"body": "This is a false choice. We need both. But deferred road maintenance "
                     "costs more in the long run.",
             "author_prefix": "cen"},
        ]},
        {"body": "What about cycling infrastructure? Portland used to be a leader in "
                 "bike-friendly design but we've stagnated.",
         "author_prefix": "socdem"},
    ],
    1: [  # Remote work post
        {"body": "I used to commute downtown every day. Now I go in twice a week and "
                 "honestly, the vibes are different. A lot of my favorite lunch spots closed.",
         "author_prefix": "mod", "replies": [
            {"body": "Same here. But I also discovered some great spots in my own neighborhood "
                     "that I never had time to visit before. Mixed feelings.",
             "author_prefix": "lib"},
        ]},
        {"body": "Converting empty office space to housing is the obvious answer. Cities "
                 "like Calgary are already doing this successfully.",
         "author_prefix": "prog", "replies": [
            {"body": "It's not that simple — office buildings and residential have very "
                     "different plumbing, HVAC, and floor plate requirements. Conversion is "
                     "expensive and sometimes not feasible.",
             "author_prefix": "cen", "replies": [
                {"body": "Expensive, yes. Not feasible? That's a stretch. It's being done all "
                         "over the country. The question is whether incentives make the math work.",
                 "author_prefix": "socdem"},
            ]},
        ]},
        {"body": "The real question is whether downtown *should* go back to what it was. "
                 "Maybe a mixed-use neighborhood is better than a 9-to-5 business district.",
         "author_prefix": "libt"},
    ],
    2: [  # Homelessness post
        {"body": "Housing First has the strongest evidence base. Give people stable "
                 "housing, then address other issues. Finland's approach reduced "
                 "homelessness by 35%.",
         "author_prefix": "lib", "replies": [
            {"body": "Housing First works for some populations but not all. Many people "
                     "experiencing homelessness need treatment programs alongside housing.",
             "author_prefix": "mod"},
            {"body": "The cost per unit for Housing First is actually less than the cost "
                     "of emergency services, jail, and hospitals for unhoused people.",
             "author_prefix": "socdem", "replies": [
                {"body": "Do you have a source for those cost comparisons? I'd like to "
                         "see Portland-specific data.",
                 "author_prefix": "libt", "replies": [
                    {"body": "The Central City Concern annual report breaks this down. Also "
                             "check the Joint Office of Homeless Services dashboard. Portland-"
                             "specific data shows ~$40k/year per person for ER+jail vs ~$20k "
                             "for supportive housing.",
                     "author_prefix": "socdem"},
                ]},
            ]},
        ]},
        {"body": "We need to enforce existing laws. Camping on sidewalks is illegal and "
                 "creates safety hazards. Compassion doesn't mean no rules.",
         "author_prefix": "con", "replies": [
            {"body": "Enforcement without alternatives just moves the problem around. "
                     "Where are people supposed to go?",
             "author_prefix": "prog"},
            {"body": "I think the point is that both enforcement AND alternatives are "
                     "needed. One without the other doesn't work.",
             "author_prefix": "cen"},
        ]},
        {"body": "Has anyone looked at what other cities our size have done successfully? "
                 "Houston reportedly reduced homelessness significantly.",
         "author_prefix": "cen", "replies": [
            {"body": "Houston's approach is interesting — they focused heavily on rapid "
                     "rehousing with federal funding. Key difference: they had relatively "
                     "cheap housing stock to work with. Portland doesn't.",
             "author_prefix": "mod"},
        ]},
    ],
    3: [  # Local business post
        {"body": "I try to shop local whenever possible. The extra cost is worth it for "
                 "the character and community connection.",
         "author_prefix": "lib"},
        {"body": "Not everyone can afford to pay 30% more for groceries at a boutique "
                 "store. Let's not shame people for being practical.",
         "author_prefix": "pop", "replies": [
            {"body": "Fair point. But there's a difference between groceries and buying "
                     "everything from Amazon. We can be strategic.",
             "author_prefix": "mod"},
        ]},
        {"body": "The city should offer tax breaks or reduced permit fees for independent "
                 "businesses. That would help level the playing field without asking consumers "
                 "to subsidize higher prices out of pocket.",
         "author_prefix": "cen"},
    ],
    4: [  # Property tax question (Q&A — answered by moderator)
        # Top-level answers must be from users with QA authority (moderator/admin)
        {"body": "Great question! Oregon's property tax system is unique because of two ballot "
                 "measures. **Measure 5** (1990) capped tax rates, and **Measure 50** (1997) "
                 "froze assessed values at 1995-96 levels with a max 3% annual increase.\n\n"
                 "This means your assessed value (what you're taxed on) can be far below real "
                 "market value. Neighbors who bought at different times can have wildly different "
                 "assessed values — and therefore different tax bills — for identical houses.\n\n"
                 "It's controversial because long-time owners benefit while new buyers pay more, "
                 "and it reduces revenue for schools and services over time.",
         "author_prefix": "moderator", "replies": [
            # Normal users can reply to moderator answers
            {"body": "This is a really clear explanation, thank you! So if I bought my house "
                     "recently, I'm probably paying more than my neighbor who's been there 20 years?",
             "author_prefix": "normal"},
            {"body": "One thing to add: you can look up your property's assessed vs. market "
                     "value on the county assessor's website. The gap can be eye-opening.",
             "author_prefix": "cen"},
        ]},
        {"body": "To add to the other answer — I moved from California which has a similar "
                 "system (Prop 13). The main difference is Oregon's rate cap on top of the "
                 "assessment freeze. Prop 13 is even more extreme — 2% cap vs. Oregon's 3%.",
         "author_prefix": "moderator", "replies": [
            {"body": "Interesting comparison. Does Oregon have any ballot measures in the "
                     "works to reform property taxes?",
             "author_prefix": "lib"},
        ]},
    ],
    # Post 5: Q&A — unanswered. No elevated user has answered yet, so normal
    # users cannot comment (backend enforces top-level = QA authority only).
    # 5: [],
    6: [  # Climate post
        {"body": "Individual action is important but it's a drop in the bucket compared "
                 "to what corporations produce. 100 companies cause 71% of emissions.",
         "author_prefix": "soc", "replies": [
            {"body": "That statistic is misleading — those companies produce fossil fuels "
                     "that consumers demand. We're all part of the system.",
             "author_prefix": "libt"},
            {"body": "Both matter. Individual choices create market signals, while "
                     "regulation addresses the structural issues.",
             "author_prefix": "mod"},
        ]},
        {"body": "Portland's climate goals are admirable but we're not on track. We need "
                 "accountability mechanisms, not just targets.",
         "author_prefix": "cen"},
        {"body": "I installed solar panels last year and the payback period is about 7 years "
                 "with the current tax credits. Individual action + policy incentives = real impact.",
         "author_prefix": "lib", "replies": [
            {"body": "Not everyone can afford the upfront cost of solar panels. This is "
                     "exactly why systemic solutions matter — they can reach everyone.",
             "author_prefix": "pop"},
        ]},
    ],
    7: [  # Arts and culture post
        {"body": "The DIY music scene is actually thriving if you know where to look. "
                 "House shows, pop-up galleries, and small venues are doing amazing work. "
                 "It's the mid-size venues that are struggling.",
         "author_prefix": "prog", "replies": [
            {"body": "True, but DIY spaces operate in legal gray areas. One code violation "
                     "and they're gone. The city should create a cultural spaces protection program.",
             "author_prefix": "socdem"},
        ]},
        {"body": "I'm an artist and honestly, I've been thinking about leaving Portland. "
                 "The cost of studio space has nearly doubled in 5 years.",
         "author_prefix": "lib", "replies": [
            {"body": "This is heartbreaking but real. I know three artists who moved to "
                     "Bend or Ashland in the last year alone.",
             "author_prefix": "normal"},
            {"body": "The Portland Arts Tax was supposed to help with this. Where is that "
                     "money actually going?",
             "author_prefix": "con"},
        ]},
        {"body": "Public art funding should be reallocated toward community art centers "
                 "in underserved neighborhoods, not expensive downtown installations.",
         "author_prefix": "pop"},
    ],
    8: [  # Mental health Q&A (answered by moderator)
        # Top-level answers from users with QA authority
        {"body": "A few resources that might help:\n\n"
                 "- **Cascadia Behavioral Healthcare** — sliding scale, walk-in crisis services\n"
                 "- **Outside In** — free/low-cost for young adults under 25\n"
                 "- **Multnomah County Crisis Line** — 503-988-4888, 24/7\n"
                 "- **NAMI Multnomah** — free support groups and peer mentoring\n\n"
                 "For the waitlist issue, ask specifically about *cancellation lists* — "
                 "providers often can fit you in sooner if you're flexible with scheduling.",
         "author_prefix": "moderator", "replies": [
            # Normal users can reply to moderator answers
            {"body": "Thank you for this list! The cancellation list tip is really helpful. "
                     "I'll pass this along.",
             "author_prefix": "normal"},
            {"body": "Also worth looking into Open Path Collective — it's a network of therapists "
                     "who offer sessions at $30-$80. Not Portland-specific but many local providers "
                     "are on there.",
             "author_prefix": "lib"},
            {"body": "If your friend is a veteran, the VA Portland has expanded their mental "
                     "health services significantly. No referral needed for the crisis line.",
             "author_prefix": "con"},
        ]},
    ],
    9: [  # Gun policy post
        {"body": "I'm a gun owner who supports universal background checks. Most gun "
                 "owners do, according to polling. That's common ground.",
         "author_prefix": "libt", "replies": [
            {"body": "Background checks I can support. The issue with M114 was the permit "
                     "requirement and magazine ban, which felt like overreach.",
             "author_prefix": "con"},
            {"body": "Thank you for this perspective. We need more gun owners in the "
                     "conversation, not fewer.",
             "author_prefix": "lib"},
        ]},
        {"body": "The evidence clearly shows that states with stricter gun laws have "
                 "fewer gun deaths. This isn't really debatable.",
         "author_prefix": "prog", "replies": [
            {"body": "Correlation isn't causation. Many of those states also have higher "
                     "incomes and less poverty. Need to control for confounders.",
             "author_prefix": "cen", "replies": [
                {"body": "Fair — but when you DO control for income and poverty, the "
                         "correlation still holds. Check the RAND Corporation's review.",
                 "author_prefix": "prog"},
                {"body": "The problem with this whole debate is that the CDC was blocked "
                         "from studying gun violence for decades. We're playing catch-up on data.",
                 "author_prefix": "mod"},
            ]},
        ]},
    ],
    10: [  # Immigration post (hot topic — many comments, deep threads)
        {"body": "As someone who works in agriculture, I can tell you that without immigrant "
                 "labor, Oregon's farms would collapse. This isn't hypothetical — we've seen "
                 "crops rot in the fields when labor shortages hit.",
         "author_prefix": "mod", "replies": [
            {"body": "This is exactly right. The economy argument for immigration is "
                     "overwhelming. We should be making it *easier* for people to work here legally.",
             "author_prefix": "lib"},
            {"body": "So the argument is we need immigrants to do jobs at wages Americans "
                     "won't accept? That sounds like an argument for better wages, not more immigration.",
             "author_prefix": "pop", "replies": [
                {"body": "It's not just about wages — these are physically demanding seasonal "
                         "jobs in rural areas. Even at higher wages, you can't fill them locally.",
                 "author_prefix": "mod", "replies": [
                    {"body": "Then mechanize. Other industries adapted to labor shortages through "
                             "technology. Agriculture can too.",
                     "author_prefix": "libt"},
                    {"body": "Mechanization works for some crops but not others. Try mechanically "
                             "harvesting strawberries or wine grapes without destroying them.",
                     "author_prefix": "cen"},
                ]},
            ]},
        ]},
        {"body": "The sanctuary state policy doesn't mean ignoring crime. It means local "
                 "police aren't doing ICE's job. There's a difference.",
         "author_prefix": "prog", "replies": [
            {"body": "I understand the distinction, but if someone commits a serious crime "
                     "and their immigration status is relevant, shouldn't there be cooperation?",
             "author_prefix": "con", "replies": [
                {"body": "For serious crimes, there IS cooperation. The sanctuary policy is about "
                         "not asking immigration status during routine traffic stops or "
                         "when people report crimes as victims.",
                 "author_prefix": "prog"},
            ]},
        ]},
        {"body": "I'm an immigrant myself (came legally from Vietnam as a child). The process "
                 "took my family 8 years. The system is broken, but the solution isn't open "
                 "borders — it's fixing the legal immigration process.",
         "author_prefix": "cen", "replies": [
            {"body": "Thank you for sharing your experience. I think most people agree the "
                     "legal process is broken. The disagreement is over what to do in the meantime.",
             "author_prefix": "socdem"},
            {"body": "8 years is insane. No wonder people choose to come without authorization "
                     "when the legal path is that long.",
             "author_prefix": "lib"},
        ]},
        {"body": "Can we talk about the impact on schools? My kid's school added ESL classes "
                 "but the funding hasn't kept up. Teachers are stretched thin.",
         "author_prefix": "normal", "replies": [
            {"body": "ESL funding is a state and federal responsibility. Blaming immigrants "
                     "for underfunded schools is misdirected — blame the legislature.",
             "author_prefix": "soc"},
        ]},
    ],
    11: [  # Rent control post (locked — comments pre-lock)
        {"body": "Our rent went up 9.9% last year (the maximum allowed). That's not exactly "
                 "'controlled.' And the law doesn't apply to buildings less than 15 years old, "
                 "which is most new construction.",
         "author_prefix": "prog", "replies": [
            {"body": "The 15-year exemption is there specifically to encourage new construction. "
                     "Without it, developers wouldn't build rental units at all.",
             "author_prefix": "libt"},
        ]},
        {"body": "Rent control is basic economics 101 — it reduces supply. Every economist "
                 "agrees on this. The evidence is clear.",
         "author_prefix": "con", "replies": [
            {"body": "Saying 'every economist agrees' is an exaggeration. Plenty of economists "
                     "support well-designed rent stabilization. The key word is 'well-designed.'",
             "author_prefix": "socdem"},
            {"body": "Even if it reduces supply at the margins, it prevents mass displacement "
                     "of existing tenants. That has value too.",
             "author_prefix": "prog"},
        ]},
        {"body": "As a landlord, the rent cap hasn't changed my behavior at all. I charge "
                 "fair rents and my tenants stay for years. The cap only hurts bad actors.",
         "author_prefix": "mod"},
    ],
    12: [  # Ballot measures resource post
        {"body": "Great compilation! I'd also recommend following Oregon Public Broadcasting's "
                 "coverage. They do deep dives into ballot measures every election cycle.",
         "author_prefix": "lib"},
        {"body": "Tip number 2 is the most important one. Follow the money and you'll "
                 "understand who actually benefits from a measure.",
         "author_prefix": "con", "replies": [
            {"body": "ORESTAR (the Oregon campaign finance database) is the tool for this. "
                     "Every contribution is public record.",
             "author_prefix": "cen"},
        ]},
        {"body": "I'd add: talk to people who disagree with you about a measure. If you can't "
                 "steelman the opposing position, you don't understand the measure well enough.",
         "author_prefix": "mod"},
    ],
    # Post 13: Q&A — unanswered. No elevated user has answered yet, so normal
    # users cannot comment (backend enforces top-level = QA authority only).
    # 13: [],
    # Post 14 (financial literacy) intentionally has NO comments — tests empty state
}



def phase_12_posts(location_id, category_map, dry_run=False):
    """Create posts, nested comments, and votes via direct SQL."""
    print("\n" + "=" * 60)
    print("PHASE 12: Posts, Comments, and Votes")
    print("=" * 60)

    # Check idempotency
    existing = db_query_one("SELECT count(*) as cnt FROM post")
    if existing and existing["cnt"] > 0:
        print(f"  Skipping: {existing['cnt']} posts already exist")
        return

    if dry_run:
        print(f"  Would create {len(SEED_POSTS)} posts with comments and votes")
        return

    # Get user IDs by prefix
    all_users = db_query("SELECT id, username FROM users WHERE status = 'active'")
    if not all_users:
        print("  ERROR: No users found")
        return

    user_map = {}  # prefix -> list of user dicts
    for u in all_users:
        # "moderator" must come before "mod" so moderator1/moderator2 don't
        # get lumped with mod_user_* (moderate political leaning) users.
        for prefix in ["prog", "lib", "socdem", "soc", "moderator", "mod",
                        "cen", "libt", "con", "pop", "trad", "normal", "admin"]:
            if u["username"].startswith(prefix):
                user_map.setdefault(prefix, []).append(u)
                break

    def pick_user(prefix):
        """Pick a random user matching the prefix."""
        users = user_map.get(prefix, user_map.get("mod", []))
        return random.choice(users) if users else all_users[0]

    # Resolve category IDs
    def get_category_id(cat_name):
        for name, cid in category_map.items():
            if cat_name.lower() in name.lower():
                return cid
        return list(category_map.values())[0] if category_map else None

    # --- Create Posts ---
    post_ids = []
    post_creators = []
    post_types = []
    for i, post_data in enumerate(SEED_POSTS):
        # Rotate creators across belief groups
        creator_prefixes = ["prog", "lib", "mod", "con", "cen", "libt",
                            "socdem", "pop", "soc", "trad"]
        creator = pick_user(creator_prefixes[i % len(creator_prefixes)])
        category_id = get_category_id(post_data["category"])

        # Vary creation times (spread over last 7 days)
        hours_ago = random.randint(1, 168)
        post_id = str(uuid.uuid4())
        status = post_data.get("status", "active")

        db_execute("""
            INSERT INTO post (id, creator_user_id, location_id, category_id, post_type,
                              title, body, status, created_time)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW() - INTERVAL '%s hours')
        """, (post_id, str(creator["id"]), location_id, category_id,
              post_data["type"], post_data["title"], post_data["body"],
              status, hours_ago))

        post_ids.append(post_id)
        post_creators.append(creator)
        post_types.append(post_data["type"])
        tag = f" [{status}]" if status != "active" else ""
        print(f"  Created post: {post_data['title'][:50]}...{tag}")

    # --- Create Comments ---
    all_comment_ids = []  # Track all comment IDs for voting
    all_comment_creators = []
    all_comment_prefixes = []  # Track author prefix for ideological voting

    def insert_comment(post_id, parent_id, parent_path, parent_depth,
                       body, author_prefix, hours_offset=0):
        """Insert a comment and return its ID, path, depth."""
        creator = pick_user(author_prefix)
        cid = str(uuid.uuid4())
        depth = parent_depth + 1 if parent_id else 0
        path = f"{parent_path}/{cid}" if parent_path else cid

        db_execute("""
            INSERT INTO comment (id, post_id, parent_comment_id, creator_user_id, body,
                                 path, depth, created_time)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW() - INTERVAL '%s hours')
        """, (cid, post_id, parent_id, str(creator["id"]), body,
              path, depth, hours_offset))

        # Update parent child_count
        if parent_id:
            db_execute(
                "UPDATE comment SET child_count = child_count + 1 WHERE id = %s",
                (parent_id,)
            )

        # Update post comment_count
        db_execute(
            "UPDATE post SET comment_count = comment_count + 1 WHERE id = %s",
            (post_id,)
        )

        all_comment_ids.append(cid)
        all_comment_creators.append(creator)
        all_comment_prefixes.append(author_prefix)
        return cid, path, depth

    def insert_comment_tree(post_id, comment_data, parent_id=None,
                            parent_path=None, parent_depth=-1, base_hours=0):
        """Recursively insert a comment and its replies."""
        hours = base_hours + random.randint(0, 5)
        result = insert_comment(
            post_id, parent_id, parent_path, parent_depth,
            comment_data["body"], comment_data["author_prefix"], hours
        )
        if not result:
            return

        cid, path, depth = result
        for reply in comment_data.get("replies", []):
            insert_comment_tree(post_id, reply, cid, path, depth, hours)

    for post_idx, comments in SEED_COMMENTS.items():
        if post_idx >= len(post_ids) or post_ids[post_idx] is None:
            continue
        post_id = post_ids[post_idx]
        post_hours = random.randint(1, 48)
        for comment_data in comments:
            insert_comment_tree(post_id, comment_data, base_hours=post_hours)

    print(f"  Created {len(all_comment_ids)} comments across {len(SEED_COMMENTS)} posts")

    # --- Create Votes ---
    # Vote on posts
    vote_count = 0
    voter_users = [u for users in user_map.values() for u in users]

    for i, post_id in enumerate(post_ids):
        if post_id is None:
            continue

        creator_id = str(post_creators[i]["id"])
        # Each post gets 5-25 random voters
        n_voters = random.randint(5, 25)
        voters = random.sample(voter_users, min(n_voters, len(voter_users)))

        for voter in voters:
            if str(voter["id"]) == creator_id:
                continue  # no self-votes

            # Weighted toward upvotes (70/30)
            vote_type = "upvote" if random.random() < 0.7 else "downvote"
            downvote_reason = None
            if vote_type == "downvote":
                downvote_reason = random.choice([
                    "offtopic", "unkind", "low_effort", "spam", "misinformation"
                ])

            db_execute("""
                INSERT INTO post_vote (post_id, user_id, vote_type, weight, downvote_reason)
                VALUES (%s, %s, %s, 1.0, %s)
                ON CONFLICT (post_id, user_id) DO NOTHING
            """, (post_id, str(voter["id"]), vote_type, downvote_reason))
            vote_count += 1

        # Update denormalized counts
        db_execute("""
            UPDATE post SET
                upvote_count = (SELECT count(*) FROM post_vote WHERE post_id = %s AND vote_type = 'upvote'),
                downvote_count = (SELECT count(*) FROM post_vote WHERE post_id = %s AND vote_type = 'downvote'),
                weighted_upvotes = COALESCE((SELECT sum(weight) FROM post_vote WHERE post_id = %s AND vote_type = 'upvote'), 0),
                weighted_downvotes = COALESCE((SELECT sum(weight) FROM post_vote WHERE post_id = %s AND vote_type = 'downvote'), 0)
            WHERE id = %s
        """, (post_id, post_id, post_id, post_id, post_id))

    # Vote on comments — ideologically coherent for MF training signal
    # Map prefixes to a left-right lean score (-1 = left, 0 = center, 1 = right)
    prefix_lean = {
        "prog": -1.0, "lib": -0.7, "socdem": -0.6, "soc": -0.9,
        "mod": 0.0, "cen": 0.1, "normal": 0.0, "admin": 0.0,
        "libt": 0.5, "con": 0.8, "pop": 0.9, "trad": 1.0,
    }

    def get_voter_lean(voter):
        """Get lean score for a voter from their username prefix."""
        uname = voter["username"]
        for pfx, lean in prefix_lean.items():
            if uname.startswith(pfx):
                return lean
        return 0.0

    for i, comment_id in enumerate(all_comment_ids):
        creator_id = str(all_comment_creators[i]["id"])
        author_lean = prefix_lean.get(all_comment_prefixes[i], 0.0)

        # Each comment gets 8-25 random voters (higher min for MF thresholds)
        n_voters = random.randint(8, 25)
        voters = random.sample(voter_users, min(n_voters, len(voter_users)))

        for voter in voters:
            if str(voter["id"]) == creator_id:
                continue

            voter_lean = get_voter_lean(voter)
            # Same-lean voters upvote more; opposite-lean downvote more
            lean_diff = abs(voter_lean - author_lean)
            # Base upvote prob 0.75, drops to 0.25 for max ideological distance
            upvote_prob = 0.75 - 0.5 * min(lean_diff / 2.0, 1.0)
            # Add jitter
            upvote_prob += random.gauss(0, 0.08)
            upvote_prob = max(0.1, min(0.9, upvote_prob))

            vote_type = "upvote" if random.random() < upvote_prob else "downvote"
            downvote_reason = None
            if vote_type == "downvote":
                downvote_reason = random.choice([
                    "offtopic", "unkind", "low_effort", "spam", "misinformation"
                ])

            db_execute("""
                INSERT INTO comment_vote (comment_id, user_id, vote_type, weight, downvote_reason)
                VALUES (%s, %s, %s, 1.0, %s)
                ON CONFLICT (comment_id, user_id) DO NOTHING
            """, (comment_id, str(voter["id"]), vote_type, downvote_reason))
            vote_count += 1

        # Update denormalized counts
        db_execute("""
            UPDATE comment SET
                upvote_count = (SELECT count(*) FROM comment_vote WHERE comment_id = %s AND vote_type = 'upvote'),
                downvote_count = (SELECT count(*) FROM comment_vote WHERE comment_id = %s AND vote_type = 'downvote'),
                weighted_upvotes = COALESCE((SELECT sum(weight) FROM comment_vote WHERE comment_id = %s AND vote_type = 'upvote'), 0),
                weighted_downvotes = COALESCE((SELECT sum(weight) FROM comment_vote WHERE comment_id = %s AND vote_type = 'downvote'), 0)
            WHERE id = %s
        """, (comment_id, comment_id, comment_id, comment_id, comment_id))

    print(f"  Created {vote_count} votes on posts and comments")

    # Compute Wilson scores for all posts and comments
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

    print("  Phase 12 complete")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Seed rich dev data for Candid')
    parser.add_argument('--api-url', default=API_URL, help='Candid API URL')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done')
    parser.add_argument('--phase', type=int, help='Run only this phase (1-12)')
    args = parser.parse_args()

    random.seed(42)  # Reproducible data

    api = CandidAPI(args.api_url)

    print(f"Candid Seed Data Generator")
    print(f"API: {args.api_url}")
    print(f"DB:  {DB_URL}")
    if args.dry_run:
        print("[DRY RUN MODE]")

    # Login as existing user to get categories/locations
    if not api.login("admin1"):
        print("ERROR: Could not login as admin1. Is the API running?")
        sys.exit(1)

    categories = api.get_categories()
    locations = api.get_locations()
    if not categories or not locations:
        print("ERROR: Could not fetch categories or locations")
        sys.exit(1)

    category_map = {c.get('name', c.get('label', '')): c['id'] for c in categories}
    oregon_locs = [loc for loc in locations if loc.get('name') == 'Oregon']
    location_id = oregon_locs[0]['id'] if oregon_locs else locations[0]['id']

    # Get affiliations
    affiliations = {}
    affs = db_query("SELECT id, name FROM affiliation WHERE location_id = %s", (location_id,))
    for a in (affs or []):
        affiliations[a['name']] = str(a['id'])

    print(f"Location: Oregon ({location_id})")
    print(f"Categories: {len(category_map)}")
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
            return None

    # Phase 1: Users (must succeed — later phases depend on user list)
    if should_run(1):
        all_users = phase_1_users(api, location_id, args.dry_run)
    else:
        # Reconstruct user list
        all_users = []
        for belief, config in BELIEF_SYSTEMS.items():
            for i in range(config["count"]):
                all_users.append({
                    "username": f"{config['prefix']}_user_{i+1}",
                    "password": "password", "belief": belief,
                    "vote_index": config["vote_index"],
                    "vote_noise": config["vote_noise"],
                    "lean": config["lean"],
                })

    # Phase 2: Demographics
    run_phase(2, "Demographics", phase_2_demographics, api, affiliations, args.dry_run)

    # Phase 3: Positions (must succeed — later phases depend on positions list)
    if should_run(3):
        positions = phase_3_positions(api, category_map, location_id, args.dry_run)
    else:
        positions = []
        for pos_data in POSITIONS:
            row = db_query_one("SELECT id FROM position WHERE statement = %s", (pos_data["statement"],))
            if row:
                positions.append({"id": str(row["id"]), "statement": pos_data["statement"],
                                  "votes": pos_data["votes"]})

    # Phase 4-12: Independent phases (continue on failure)
    run_phase(4, "Votes", phase_4_votes, api, all_users, positions, args.dry_run)
    run_phase(5, "Adoptions", phase_5_adoptions, api, all_users, positions, args.dry_run)
    run_phase(6, "Chats", phase_6_chats, api, all_users, positions, args.dry_run)
    run_phase(7, "Kudos", phase_7_kudos, api, args.dry_run)
    run_phase(8, "Moderation", phase_8_moderation, api, positions, args.dry_run)
    run_phase(9, "Surveys", phase_9_surveys, api, args.dry_run)
    run_phase(10, "Pairwise", phase_10_pairwise, api, args.dry_run)
    run_phase(11, "Admin", phase_11_admin, api, location_id, category_map, args.dry_run)
    run_phase(12, "Posts", phase_12_posts, location_id, category_map, args.dry_run)

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
