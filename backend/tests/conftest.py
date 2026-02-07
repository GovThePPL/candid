"""Shared fixtures for Candid API integration tests."""

import pytest
import psycopg2
from psycopg2.extras import RealDictCursor
import requests
import redis
import json
import time

BASE_URL = "http://127.0.0.1:8000/api/v1"
CHAT_SERVER_URL = "http://127.0.0.1:8002"
DEFAULT_PASSWORD = "password"
DB_URL = "postgresql://user:postgres@localhost:5432/candid"
REDIS_URL = "redis://localhost:6379"

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

# Chat logs (from seed data)
# Chat where normal1 initiated with normal3 (both are participants)
CHAT_LOG_1_ID = "b2222222-2222-2222-2222-222222222222"  # Normal1 -> Normal3
# Chat where normal4 initiated with normal5
CHAT_LOG_2_ID = "1d06bf99-4d87-4700-8806-63de8c905eca"  # Normal4 -> Normal5

# User positions (user_position IDs - linking users to positions they've adopted)
# These must be active user_positions with active positions
USER_POSITION_ADMIN1 = "4c0dd7fe-2533-4794-a8e7-a97de971971e"  # admin1's position
USER_POSITION_MODERATOR1 = "ec3e0406-b044-4735-9d78-6e305f2fa406"  # moderator1's position
USER_POSITION_NORMAL1 = "8a63d2d0-9ed6-4b26-8a64-350e0594c6e4"  # normal1's position
USER_POSITION_NORMAL2 = "5e64e6cc-baae-4f14-859b-9577a6eb2d23"  # normal2's position
USER_POSITION_NORMAL3 = "cd411a92-82ac-4075-abc6-f4154db00fb8"  # normal3's active position

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


def db_execute(query, params=None):
    """Execute a database query and commit. For test cleanup."""
    conn = psycopg2.connect(DB_URL)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            conn.commit()
    finally:
        conn.close()


def delete_survey_response(user_id, question_id):
    """Delete a user's response to a survey question (for test idempotency)."""
    db_execute(
        """DELETE FROM survey_question_response
           WHERE user_id = %s
           AND survey_question_option_id IN (
               SELECT id FROM survey_question_option WHERE survey_question_id = %s
           )""",
        (user_id, question_id)
    )


def db_query(query, params=None):
    """Execute a database query and return results."""
    conn = psycopg2.connect(DB_URL)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            return cur.fetchall()
    finally:
        conn.close()


def db_query_one(query, params=None):
    """Execute a database query and return single result."""
    conn = psycopg2.connect(DB_URL)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            return cur.fetchone()
    finally:
        conn.close()


def get_redis_client():
    """Get a Redis client."""
    return redis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)


def redis_get_chat_metadata(chat_id):
    """Get chat metadata from Redis."""
    r = get_redis_client()
    try:
        return r.hgetall(f"chat:{chat_id}:metadata")
    finally:
        r.close()


def redis_get_chat_messages(chat_id):
    """Get chat messages from Redis."""
    r = get_redis_client()
    try:
        messages = r.lrange(f"chat:{chat_id}:messages", 0, -1)
        return [json.loads(m) for m in messages]
    finally:
        r.close()


def redis_delete_chat(chat_id):
    """Delete all Redis keys for a chat."""
    r = get_redis_client()
    try:
        keys = r.keys(f"chat:{chat_id}:*")
        if keys:
            r.delete(*keys)
    finally:
        r.close()


def cleanup_chat_request(initiator_id, user_position_id):
    """Clean up chat requests and related chat logs for idempotent tests."""
    # First delete any chat logs that reference these chat requests
    db_execute(
        """DELETE FROM chat_log WHERE chat_request_id IN (
               SELECT id FROM chat_request
               WHERE initiator_user_id = %s AND user_position_id = %s
           )""",
        (initiator_id, user_position_id)
    )
    # Then delete the chat requests
    db_execute(
        "DELETE FROM chat_request WHERE initiator_user_id = %s AND user_position_id = %s",
        (initiator_id, user_position_id)
    )


def cleanup_kudos(sender_id, chat_log_id):
    """Clean up kudos for idempotent tests."""
    db_execute(
        "DELETE FROM kudos WHERE sender_user_id = %s AND chat_log_id = %s",
        (sender_id, chat_log_id)
    )


def redis_add_test_message(chat_id, sender_id, content):
    """Add a test message to Redis for a chat."""
    import uuid
    from datetime import datetime
    r = get_redis_client()
    try:
        message = json.dumps({
            "id": str(uuid.uuid4()),
            "sender_id": sender_id,
            "type": "text",
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
        })
        r.rpush(f"chat:{chat_id}:messages", message)
    finally:
        r.close()


def get_chat_log_from_db(chat_id):
    """Get the chat log record from PostgreSQL."""
    return db_query_one(
        "SELECT * FROM chat_log WHERE id = %s",
        (chat_id,)
    )


# ---------------------------------------------------------------------------
# Session-scoped token fixtures (login once per test run)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def _ensure_seed_users_active():
    """Ensure admin1 and normal4 are active at the start of each test session.
    Moderation tests may ban these users, breaking later tests."""
    db_execute("UPDATE users SET status = 'active' WHERE username IN ('admin1', 'normal4')")
    # Clear Redis ban cache so auth checks see the updated status
    try:
        r = redis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
        for key in r.keys("ban_status:*"):
            r.delete(key)
        r.close()
    except Exception:
        pass
    yield
    # Also restore at end of session
    db_execute("UPDATE users SET status = 'active' WHERE username IN ('admin1', 'normal4')")
    try:
        r = redis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
        for key in r.keys("ban_status:*"):
            r.delete(key)
        r.close()
    except Exception:
        pass


@pytest.fixture(scope="session")
def admin_token(_ensure_seed_users_active):
    return login("admin1")


@pytest.fixture(scope="session")
def normal_token(_ensure_seed_users_active):
    return login("normal1")


@pytest.fixture(scope="session")
def moderator_token(_ensure_seed_users_active):
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


@pytest.fixture(scope="session")
def normal2_token():
    return login("normal2")


@pytest.fixture(scope="session")
def normal2_headers(normal2_token):
    return auth_header(normal2_token)


@pytest.fixture(scope="session")
def normal3_token():
    return login("normal3")


@pytest.fixture(scope="session")
def normal3_headers(normal3_token):
    return auth_header(normal3_token)
