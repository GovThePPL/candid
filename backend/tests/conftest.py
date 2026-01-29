"""Shared fixtures for Candid API integration tests."""

import pytest
import requests

BASE_URL = "http://127.0.0.1:8000/api/v1"
DEFAULT_PASSWORD = "password"

# ---------------------------------------------------------------------------
# Known UUIDs from seed data (backend/database/test_data/basic.sql)
# ---------------------------------------------------------------------------

# Users
ADMIN1_ID = "0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e"
MODERATOR1_ID = "a443c4ff-86ab-4751-aec9-d9b23d7acb9c"
MODERATOR2_ID = "010f84ad-0abd-4352-a7b3-7f9b95d51983"
NORMAL1_ID = "6c9344ed-0313-4b25-a616-5ac08967e84f"
NORMAL2_ID = "4a67d0e6-56a4-4396-916b-922d27db71d8"
NORMAL3_ID = "735565c1-93d9-4813-b227-3d9c06b78c8f"
NORMAL4_ID = "2333392a-7c07-4733-8b46-00d32833d9bc"
NORMAL5_ID = "c922be05-e355-4052-8d3f-7774669ddd32"
GUEST1_ID = "a82b485b-114f-44b7-aa0b-8ae8ca96e4f3"
GUEST2_ID = "a2ec25a9-2a12-4a01-baf8-c0d1e254c3db"

# Position categories
HEALTHCARE_CAT_ID = "4d439108-2128-46ec-b4b2-80ec3dbf6aa3"
ECONOMY_CAT_ID = "63e233e9-187e-441f-a7a9-f5f44dffadf0"
EDUCATION_CAT_ID = "be3305f5-df1a-4cf5-855e-49a88ed3cbd3"

# Positions (first healthcare position by admin1)
POSITION1_ID = "772d04ed-b2ad-4f95-a630-c739811fa615"
# Second healthcare position by moderator1
POSITION2_ID = "4d0b2198-414e-4cf9-93a9-83033b81ce76"

# Location
OREGON_LOCATION_ID = "ba5e3dcf-af51-47f4-941d-ee3448ee826a"

# Affiliations
DEM_PARTY_ID = "6a76fec7-bf77-4333-937f-07d48c1ae966"

# Moderation rules
RULE_VIOLENCE_ID = "b8a7c6d5-e4f3-4a2b-1c0d-9e8f7a6b5c4d"
RULE_SEXUAL_ID = "c9b8d7e6-f5a4-4b3c-2d1e-0f9a8b7c6d5e"
RULE_SPAM_ID = "d0c9e8f7-a6b5-4c4d-3e2f-1a0b9c8d7e6f"
RULE_NOT_POLITICAL_ID = "e1d0f9a8-b7c6-4d5e-4f3a-2b1c0d9e8f7a"

# Chat logs (for chat report tests)
CHAT_LOG_1_ID = "fc6127e3-a108-487b-8789-442ec42d41f3"  # Normal1 <-> Normal3
CHAT_LOG_2_ID = "e698f2d0-10ac-422d-a80e-93c619e2f581"  # Normal3 <-> Normal1

# Surveys
SURVEY_ACTIVE_ID = "aa111111-1111-1111-1111-111111111111"
SURVEY_INACTIVE_ID = "bb222222-2222-2222-2222-222222222222"
SURVEY_FUTURE_ID = "cc333333-3333-3333-3333-333333333333"
SURVEY_QUESTION_1_ID = "dd111111-1111-1111-1111-111111111111"
SURVEY_QUESTION_2_ID = "dd222222-2222-2222-2222-222222222222"
SURVEY_OPTION_1_ID = "ee111111-1111-1111-1111-111111111111"
SURVEY_OPTION_2_ID = "ee222222-2222-2222-2222-222222222222"

# A UUID that doesn't exist in the database
NONEXISTENT_UUID = "00000000-0000-0000-0000-000000000000"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def login(username, password=DEFAULT_PASSWORD):
    """POST /auth/login and return the token string."""
    resp = requests.post(
        f"{BASE_URL}/auth/login",
        json={"username": username, "password": password},
    )
    resp.raise_for_status()
    return resp.json()["token"]


def auth_header(token):
    """Return an Authorization header dict for the given token."""
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Session-scoped token fixtures (login once per test run)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def admin_token():
    return login("admin1")


@pytest.fixture(scope="session")
def normal_token():
    return login("normal1")


@pytest.fixture(scope="session")
def moderator_token():
    return login("moderator1")


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return auth_header(admin_token)


@pytest.fixture(scope="session")
def normal_headers(normal_token):
    return auth_header(normal_token)


@pytest.fixture(scope="session")
def moderator_headers(moderator_token):
    return auth_header(moderator_token)
