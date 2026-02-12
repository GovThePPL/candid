"""
Main application setup for the chat server.
"""

import logging

import socketio
from aiohttp import web

from .config import config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global references for the running server (set by create_app)
_sio: socketio.AsyncServer = None
_app: web.Application = None


async def health_check(request: web.Request) -> web.Response:
    """Health check endpoint for container orchestration."""
    return web.json_response({"status": "healthy", "service": "chat-server"})


def create_app() -> web.Application:
    """Create and configure a new application instance."""
    global _sio, _app

    from .handlers import register_handlers
    from .services import initialize_services

    # Create Socket.IO server
    # CORS is "*" because real security is token auth at the handshake level,
    # not origin checking.  Every connect must pass a valid JWT in auth.token.
    sio = socketio.AsyncServer(
        async_mode="aiohttp",
        cors_allowed_origins="*",
        logger=False,
        engineio_logger=False,
    )

    # Create aiohttp application
    app = web.Application()
    sio.attach(app)

    # Store sio reference in app for services to access
    app["sio"] = sio

    # Add health check route
    app.router.add_get("/health", health_check)

    # Initialize services (Redis, PostgreSQL connections)
    app.on_startup.append(initialize_services)

    # Register Socket.IO event handlers
    register_handlers(sio)

    # Store global references
    _sio = sio
    _app = app

    logger.info(f"Chat server configured on {config.HOST}:{config.PORT}")
    return app


def get_sio() -> socketio.AsyncServer:
    """Get the current Socket.IO server instance."""
    if _sio is None:
        raise RuntimeError("Application not initialized. Call create_app() first.")
    return _sio


async def run_app() -> None:
    """Run the application."""
    application = create_app()
    runner = web.AppRunner(application)
    await runner.setup()
    site = web.TCPSite(runner, config.HOST, config.PORT)
    await site.start()
    logger.info(f"Chat server started on http://{config.HOST}:{config.PORT}")
