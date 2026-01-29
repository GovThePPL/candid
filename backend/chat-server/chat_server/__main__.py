"""
Entry point for the chat server.
"""

import asyncio
import logging
import signal
import sys

from aiohttp import web

from .app import create_app
from .config import config

logger = logging.getLogger(__name__)


def main() -> None:
    """Main entry point."""
    app = create_app()

    # Handle graceful shutdown
    def handle_signal(sig: int, frame) -> None:
        logger.info(f"Received signal {sig}, shutting down...")
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    logger.info(f"Starting chat server on http://{config.HOST}:{config.PORT}")
    web.run_app(app, host=config.HOST, port=config.PORT, print=None)


if __name__ == "__main__":
    main()
