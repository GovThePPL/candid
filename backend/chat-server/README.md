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
│   ├── __main__.py      # Entry point
│   ├── app.py           # aiohttp app setup, Socket.IO initialization
│   ├── auth.py          # JWT token validation
│   ├── config.py        # Environment configuration
│   ├── handlers/        # Socket.IO event handlers
│   ├── services/        # Business logic and data access
│   └── tests/           # Unit tests
├── Dockerfile           # Python 3.12-slim container
└── requirements.txt     # Dependencies
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
