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
"""

import argparse
import json
import os
import random
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import psycopg2
from psycopg2.extras import RealDictCursor
import requests
from datetime import datetime, timedelta, timezone

WORKERS = 8  # Thread pool size for parallel API calls
print_lock = threading.Lock()

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
#   1 = agree, -1 = disagree, 0 = pass/skip

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
     "votes": (-1, -1, -1, -1,  1, -1,  1,  1,  1,  1)},
    {"statement": "Wealthy corporations should pay significantly higher taxes to fund social programs.",
     "category": "Economy & Taxation",
     "votes": ( 1,  1,  1,  1,  1, -1, -1, -1, -1, -1)},
    {"statement": "Tariffs on imported goods protect American workers and should be increased.",
     "category": "Economy & Taxation",
     "votes": ( 0, -1,  0,  0, -1, -1, -1,  0,  1,  1)},
    {"statement": "A universal basic income would reduce poverty more effectively than current welfare programs.",
     "category": "Economy & Taxation",
     "votes": ( 1,  1,  1,  1, -1, -1,  0, -1, -1, -1)},
    {"statement": "Labor unions are essential for protecting workers' rights.",
     "category": "Economy & Taxation",
     "votes": ( 1,  1,  1,  1,  1,  1, -1, -1,  0, -1)},

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
     "votes": (-1, -1, -1, -1, -1, -1, -1,  0,  1,  1)},
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
     "votes": ( 1,  1,  1,  1,  1,  1, -1, -1,  1,  0)},

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
     "votes": ( 1,  1,  1,  1, -1, -1, -1, -1, -1, -1)},
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
        """Get admin token via candid-backend service account."""
        token_url = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token"
        resp = self.session.post(token_url, data={
            "grant_type": "client_credentials",
            "client_id": KEYCLOAK_BACKEND_CLIENT_ID,
            "client_secret": KEYCLOAK_BACKEND_CLIENT_SECRET,
        }, timeout=10)
        resp.raise_for_status()
        return resp.json()["access_token"]

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
        r = self.session.put(f"{self.base_url}/api/v1/users/me/demographics",
                             json=data, headers=self._headers())
        return r.status_code in (200, 201, 204)

    def set_settings(self, data):
        r = self.session.put(f"{self.base_url}/api/v1/users/me/settings",
                             json=data, headers=self._headers())
        return r.status_code in (200, 201, 204)

    def create_position(self, statement, category_id, location_id):
        r = self.session.post(f"{self.base_url}/api/v1/positions",
                              json={"statement": statement, "categoryId": category_id,
                                    "locationId": location_id},
                              headers=self._headers())
        return r.json() if r.status_code in (200, 201) else None

    def adopt_position(self, position_id):
        r = self.session.post(f"{self.base_url}/api/v1/positions/{position_id}/adopt",
                              headers=self._headers())
        return r.status_code in (200, 201, 204)

    def vote(self, position_id, response_type):
        r = self.session.post(f"{self.base_url}/api/v1/positions/response",
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
        r = self.session.post(f"{self.base_url}/api/v1/moderation/reports/{report_id}/claim",
                              headers=self._headers())
        return r.status_code in (200, 204)

    def take_action(self, report_id, mod_response, actions=None, text=None):
        body = {"modResponse": mod_response}
        if actions:
            body["actions"] = actions
        if text:
            body["modResponseText"] = text
        r = self.session.post(f"{self.base_url}/api/v1/moderation/reports/{report_id}/action",
                              json=body, headers=self._headers())
        return r.json() if r.status_code in (200, 201) else None

    def create_appeal(self, action_id, text):
        r = self.session.post(f"{self.base_url}/api/v1/moderation/actions/{action_id}/appeal",
                              json={"appealText": text}, headers=self._headers())
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

    # Include core users with their lean-appropriate vote patterns (from CORE_VOTE_MAP)
    voters = []
    for username, (vidx, vnoise) in CORE_VOTE_MAP.items():
        voters.append({"username": username, "vote_index": vidx, "vote_noise": vnoise})
    for u in all_users:
        voters.append(u)

    # Pre-compute each voter's position subset and vote responses
    voter_tasks = []
    for voter in voters:
        vote_fraction = random.uniform(0.30, 0.75)
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
    print("PHASE 7: Kudos")
    print("=" * 60)

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
            count += 1
            continue
        # Initiator sends kudos
        if api.login(chat["initiator_name"]):
            if api.send_kudos(str(chat["id"])):
                count += 1
                print(f"  Kudos: {chat['initiator_name']} -> {chat['responder_name']}")

    print(f"  Total kudos: {count}")


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

    # moderator1 claims and takes action -> temporary_ban
    print("  moderator1 takes action -> temporary_ban...")
    if not api.login("moderator1"):
        return
    api.claim_report(report_a_id)
    action_result = api.take_action(report_a_id, "take_action",
                                     actions=[{"userClass": "submitter", "action": "temporary_ban",
                                              "duration": 14}],
                                     text="Hostile language violating community standards")
    if action_result:
        mod_action_id = action_result.get("id")
        print(f"  Action taken (ID: {mod_action_id})")

        # normal4 appeals
        print("  normal4 appeals the ban...")
        if api.login("normal4"):
            appeal = api.create_appeal(mod_action_id,
                                       "I believe my position was expressing a legitimate political viewpoint, "
                                       "not hate speech. I request a review of this decision.")
            if appeal:
                print(f"  Appeal created (ID: {appeal.get('id')})")

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

    # Report C: warning on a chat
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
                    api.take_action(report_c["id"], "take_action",
                                    actions=[{"userClass": "submitter", "action": "warning"}],
                                    text="Warning for disruptive behavior")

    # Report D: pending report (unclaimed, for moderator demo)
    print("  Report D: pending report (unclaimed)...")
    if positions and len(positions) > 10:
        if api.login("normal1"):
            api.report_position(positions[10]["id"], RULE_NOT_POLITICAL,
                                "This doesn't seem like a normative political statement")

    print("  Moderation scenarios complete")


# ---------------------------------------------------------------------------
# Phase 9: Surveys
# ---------------------------------------------------------------------------

def phase_9_surveys(api, dry_run=False):
    print("\n" + "=" * 60)
    print("PHASE 9: Surveys")
    print("=" * 60)

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
            # "Liberal" deliberately pushed low for non-liberal systems to avoid duplicate group labels.
            "progressive":    ["Progressive", "Social Democrat", "Socialist", "Moderate", "Centrist", "Liberal", "Libertarian", "Conservative", "Populist", "Traditionalist"],
            "liberal":        ["Liberal", "Moderate", "Progressive", "Centrist", "Social Democrat", "Libertarian", "Socialist", "Conservative", "Populist", "Traditionalist"],
            "social_democrat": ["Social Democrat", "Socialist", "Progressive", "Moderate", "Centrist", "Liberal", "Libertarian", "Conservative", "Populist", "Traditionalist"],
            "socialist":      ["Socialist", "Social Democrat", "Progressive", "Moderate", "Centrist", "Liberal", "Libertarian", "Conservative", "Populist", "Traditionalist"],
            "moderate":       ["Moderate", "Centrist", "Social Democrat", "Progressive", "Libertarian", "Conservative", "Liberal", "Populist", "Socialist", "Traditionalist"],
            "centrist":       ["Centrist", "Moderate", "Libertarian", "Conservative", "Populist", "Liberal", "Traditionalist", "Social Democrat", "Progressive", "Socialist"],
            "libertarian":    ["Libertarian", "Conservative", "Centrist", "Populist", "Moderate", "Traditionalist", "Liberal", "Social Democrat", "Progressive", "Socialist"],
            "conservative":   ["Conservative", "Libertarian", "Traditionalist", "Centrist", "Populist", "Moderate", "Liberal", "Social Democrat", "Progressive", "Socialist"],
            "populist":       ["Populist", "Traditionalist", "Conservative", "Libertarian", "Centrist", "Moderate", "Liberal", "Social Democrat", "Progressive", "Socialist"],
            "traditionalist": ["Traditionalist", "Populist", "Conservative", "Libertarian", "Centrist", "Moderate", "Liberal", "Social Democrat", "Progressive", "Socialist"],
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
                # Generate adjacent pairs from ranked preference list
                # (1v2, 2v3, 3v4, ...) for transitive chain coverage
                adjacent_pairs = [(ranked[j], ranked[j + 1]) for j in range(len(ranked) - 1)]
                # Sample 60-80% of adjacent pairs for per-user variation
                n_adjacent = max(1, int(len(adjacent_pairs) * random.uniform(0.60, 0.80)))
                selected_adjacent = random.sample(adjacent_pairs, n_adjacent)
                # Add 1-2 random cross-rank pairs for matrix density
                n_cross = min(2, max(1, len(ranked) // 4))
                cross_pairs = []
                for _ in range(n_cross):
                    ci = random.randint(0, len(ranked) - 2)
                    cj = random.randint(ci + 2, len(ranked) - 1) if ci + 2 < len(ranked) else ci + 1
                    if cj < len(ranked) and (ranked[ci], ranked[cj]) not in selected_adjacent:
                        cross_pairs.append((ranked[ci], ranked[cj]))
                for winner_label, loser_label in selected_adjacent + cross_pairs:
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
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Seed rich dev data for Candid')
    parser.add_argument('--api-url', default=API_URL, help='Candid API URL')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done')
    parser.add_argument('--phase', type=int, help='Run only this phase (1-10)')
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

    # Phase 1: Users
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
    if should_run(2):
        phase_2_demographics(api, affiliations, args.dry_run)

    # Phase 3: Positions
    if should_run(3):
        positions = phase_3_positions(api, category_map, location_id, args.dry_run)
    else:
        positions = []
        for pos_data in POSITIONS:
            row = db_query_one("SELECT id FROM position WHERE statement = %s", (pos_data["statement"],))
            if row:
                positions.append({"id": str(row["id"]), "statement": pos_data["statement"],
                                  "votes": pos_data["votes"]})

    # Phase 4: Votes
    if should_run(4):
        phase_4_votes(api, all_users, positions, args.dry_run)

    # Phase 5: Adoptions
    if should_run(5):
        phase_5_adoptions(api, all_users, positions, args.dry_run)

    # Phase 6: Chats
    if should_run(6):
        phase_6_chats(api, all_users, positions, args.dry_run)

    # Phase 7: Kudos
    if should_run(7):
        phase_7_kudos(api, args.dry_run)

    # Phase 8: Moderation
    if should_run(8):
        phase_8_moderation(api, positions, args.dry_run)

    # Phase 9: Surveys
    if should_run(9):
        phase_9_surveys(api, args.dry_run)

    # Phase 10: Pairwise
    if should_run(10):
        phase_10_pairwise(api, args.dry_run)

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
            ORDER BY tbl
        """)
        for row in (counts or []):
            print(f"  {row['tbl']}: {row['cnt']}")


if __name__ == '__main__':
    main()
