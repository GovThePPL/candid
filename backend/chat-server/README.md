# Chat Server

Real-time WebSocket chat service built with aiohttp and Socket.IO, using Redis for pub/sub messaging across server instances.

## Architecture

```
Client (Socket.IO) ──▶ aiohttp server ──▶ Redis pub/sub
                            │                    │
                            ▼                    ▼
                       PostgreSQL          Other instances
                    (chat persistence)     (message fan-out)
```

- **aiohttp** handles WebSocket connections via `python-socketio`
- **Redis pub/sub** enables message fan-out across multiple server instances
- **PostgreSQL** stores chat messages and logs for persistence
- **JWT** authentication validates tokens on connection

## Structure

```
chat-server/
├── chat_server/
│   ├── __main__.py          # Entry point
│   ├── app.py               # aiohttp app setup, Socket.IO initialization
│   ├── auth.py              # JWT token validation
│   ├── config.py            # Environment configuration
│   ├── handlers/            # Socket.IO event handlers
│   │   ├── __init__.py      # Registers all handler modules
│   │   ├── agreed_positions.py  # Propose/accept/reject/modify agreed statements
│   │   ├── chat_lifecycle.py    # End chat, closure proposals
│   │   ├── connection.py        # Connect, authenticate, join/leave chat
│   │   ├── definitions.py       # Definition requests (request/define/accept/counter_define)
│   │   ├── explain_position.py  # Explain My Position requests (request/explain/good_faith/reject/accept/correct)
│   │   ├── discuss.py           # Discussion forum events
│   │   ├── messages.py          # Chat messages with quote validation and server-side toxicity scoring
│   │   ├── reactions.py         # Emoji reactions on messages
│   │   ├── read_receipts.py     # Message read receipts
│   │   └── typing.py            # Typing indicators
│   ├── services/            # Business logic and data access
│   │   ├── __init__.py      # Service initialization
│   │   ├── abandonment.py   # Chat abandonment detection
│   │   ├── chat_export.py   # Chat log export formatting
│   │   ├── pubsub.py        # Redis pub/sub for cross-instance messaging
│   │   ├── quote_validator.py   # Quote reference parsing and validation (M/S/D/E)
│   │   ├── redis_store.py   # Redis data models (messages, positions, definitions, explanations)
│   │   └── room_manager.py  # Socket.IO room management
│   └── tests/               # Unit tests (run with --noconftest)
│       ├── conftest.py          # Shared test fixtures
│       ├── test_abandonment.py  # Abandonment detection tests
│       ├── test_agreed_positions.py  # Agreed position handler tests
│       ├── test_chat_export.py      # Chat export tests
│       ├── test_chat_request_response.py  # Chat request/response tests
│       ├── test_connection.py       # Connection handler tests
│       ├── test_definitions.py      # DefinitionRequest dataclass serialization tests
│       ├── test_explain_position.py   # ExplainRequest dataclass serialization tests
│       ├── test_messages.py         # Message handler tests
│       ├── test_quote_validator.py  # Quote parsing and validation tests
│       ├── test_reactions.py        # Reaction rate limiting tests
│       ├── test_redis_store.py      # Redis store tests
│       ├── test_room_manager.py     # Room manager tests
│       └── test_typing.py          # Typing indicator tests
├── Dockerfile               # Python 3.12-slim container
└── requirements.txt         # Dependencies
```

## Running

```bash
# Via Docker (port 8002)
docker compose up -d chat

# Local development
cd backend/chat-server && python -m chat_server
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | -- | PostgreSQL connection string |
| `REDIS_URL` | -- | Redis connection string |
| `JWT_SECRET` | -- | Secret for JWT token validation |
| `PORT` | 8002 | Server listen port |
| `NLP_SERVICE_URL` | `http://nlp:5001` | NLP service URL for toxicity checking |
| `NLP_SERVICE_TIMEOUT` | `3` | Timeout in seconds for NLP service calls |
| `TOXICITY_THRESHOLD` | `0.7` | Score threshold for flagging toxic messages |
