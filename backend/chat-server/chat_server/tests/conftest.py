"""
Pytest fixtures for chat server tests.
"""

import asyncio
import json
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import AsyncGenerator, Generator

import jwt
import pytest
import pytest_asyncio
import socketio
import redis.asyncio as aioredis
from aiohttp import web
from aiohttp.test_utils import TestServer

# Set test environment variables before importing app
os.environ["REDIS_URL"] = os.getenv("TEST_REDIS_URL", "redis://redis:6379/1")
os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL", "postgresql://user:postgres@db:5432/candid"
)
os.environ["JWT_SECRET"] = "test_secret"

from chat_server.app import create_app
from chat_server.config import config


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Create an event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


def create_test_token(user_id: str, expired: bool = False) -> str:
    """Create a test JWT token."""
    now = datetime.now(timezone.utc)
    if expired:
        exp = now - timedelta(hours=1)
    else:
        exp = now + timedelta(hours=1)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": exp,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)


def create_invalid_token() -> str:
    """Create an invalid JWT token."""
    return "invalid.token.here"


def create_wrong_secret_token(user_id: str) -> str:
    """Create a JWT token with wrong secret."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(hours=1),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, "wrong_secret", algorithm="HS256")


@pytest_asyncio.fixture
async def app() -> web.Application:
    """Create the test application."""
    return create_app()


@pytest_asyncio.fixture
async def test_server(app: web.Application) -> AsyncGenerator[TestServer, None]:
    """Create a test server."""
    server = TestServer(app)
    await server.start_server()
    yield server
    await server.close()


@pytest_asyncio.fixture
async def redis_client() -> AsyncGenerator[aioredis.Redis, None]:
    """Create a Redis client for test setup/teardown."""
    client = aioredis.from_url(
        config.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
    )
    yield client
    await client.aclose()


@pytest_asyncio.fixture
def user1_id() -> str:
    """Generate a test user ID."""
    return str(uuid.uuid4())


@pytest_asyncio.fixture
def user2_id() -> str:
    """Generate a second test user ID."""
    return str(uuid.uuid4())


@pytest_asyncio.fixture
def user3_id() -> str:
    """Generate a third test user ID."""
    return str(uuid.uuid4())


@pytest_asyncio.fixture
def user1_token(user1_id: str) -> str:
    """Create a JWT token for user 1."""
    return create_test_token(user1_id)


@pytest_asyncio.fixture
def user2_token(user2_id: str) -> str:
    """Create a JWT token for user 2."""
    return create_test_token(user2_id)


@pytest_asyncio.fixture
def user3_token(user3_id: str) -> str:
    """Create a JWT token for user 3."""
    return create_test_token(user3_id)


@pytest_asyncio.fixture
def chat_id() -> str:
    """Generate a test chat ID."""
    return str(uuid.uuid4())


@pytest_asyncio.fixture
def chat_id2() -> str:
    """Generate a second test chat ID."""
    return str(uuid.uuid4())


@pytest_asyncio.fixture
async def setup_chat(
    redis_client: aioredis.Redis, chat_id: str, user1_id: str, user2_id: str
) -> AsyncGenerator[str, None]:
    """Set up a chat in Redis and clean up after test."""
    # Create chat metadata
    await redis_client.hset(
        f"chat:{chat_id}:metadata",
        mapping={
            "chat_id": chat_id,
            "participant_ids": json.dumps([user1_id, user2_id]),
            "start_time": datetime.now(timezone.utc).isoformat(),
        },
    )
    await redis_client.sadd(f"user:{user1_id}:active_chats", chat_id)
    await redis_client.sadd(f"user:{user2_id}:active_chats", chat_id)

    yield chat_id

    # Cleanup
    await redis_client.delete(
        f"chat:{chat_id}:messages",
        f"chat:{chat_id}:metadata",
        f"chat:{chat_id}:positions",
        f"chat:{chat_id}:closure",
        f"user:{user1_id}:active_chats",
        f"user:{user2_id}:active_chats",
    )


@pytest_asyncio.fixture
async def connected_client(
    test_server: TestServer,
) -> AsyncGenerator[socketio.AsyncClient, None]:
    """Create a connected Socket.IO client."""
    client = socketio.AsyncClient()
    url = f"http://{test_server.host}:{test_server.port}"
    await client.connect(url)
    yield client
    if client.connected:
        await client.disconnect()


@pytest_asyncio.fixture
async def authenticated_client(
    test_server: TestServer, user1_id: str, user1_token: str
) -> AsyncGenerator[tuple[socketio.AsyncClient, str], None]:
    """Create an authenticated Socket.IO client."""
    client = socketio.AsyncClient()
    url = f"http://{test_server.host}:{test_server.port}"
    await client.connect(url)
    await client.call("authenticate", {"token": user1_token})
    yield client, user1_id
    if client.connected:
        await client.disconnect()


@pytest_asyncio.fixture
async def two_authenticated_clients(
    test_server: TestServer,
    user1_id: str,
    user1_token: str,
    user2_id: str,
    user2_token: str,
) -> AsyncGenerator[tuple[socketio.AsyncClient, str, socketio.AsyncClient, str], None]:
    """Create two authenticated Socket.IO clients."""
    client1 = socketio.AsyncClient()
    client2 = socketio.AsyncClient()
    url = f"http://{test_server.host}:{test_server.port}"

    await client1.connect(url)
    await client2.connect(url)

    await client1.call("authenticate", {"token": user1_token})
    await client2.call("authenticate", {"token": user2_token})

    yield client1, user1_id, client2, user2_id

    if client1.connected:
        await client1.disconnect()
    if client2.connected:
        await client2.disconnect()


class EventCollector:
    """Helper class to collect Socket.IO events."""

    def __init__(self):
        self.events: dict[str, list] = {}

    def handler(self, event_name: str):
        """Create a handler for a specific event."""
        if event_name not in self.events:
            self.events[event_name] = []

        async def _handler(data):
            self.events[event_name].append(data)

        return _handler

    def get(self, event_name: str) -> list:
        """Get collected events for a specific event type."""
        return self.events.get(event_name, [])

    def clear(self):
        """Clear all collected events."""
        self.events.clear()


@pytest.fixture
def event_collector() -> EventCollector:
    """Create an event collector."""
    return EventCollector()
