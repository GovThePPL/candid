"""
Service for exporting chat data to PostgreSQL when a chat ends.
"""

import json
import logging
from datetime import datetime
from typing import Any, Optional

import asyncpg

from ..config import config

logger = logging.getLogger(__name__)


class ChatExporter:
    """Exports chat data from Redis to PostgreSQL."""

    def __init__(self):
        self._pool: Optional[asyncpg.Pool] = None

    async def connect(self) -> None:
        """Connect to PostgreSQL."""
        logger.info(f"Connecting to PostgreSQL at {config.DATABASE_URL}")
        self._pool = await asyncpg.create_pool(
            config.DATABASE_URL,
            min_size=2,
            max_size=10,
        )
        logger.info("Connected to PostgreSQL")

    async def close(self) -> None:
        """Close PostgreSQL connection."""
        if self._pool:
            await self._pool.close()
            logger.info("PostgreSQL connection closed")

    async def export_chat(
        self,
        chat_id: str,
        export_data: dict[str, Any],
        end_type: str,
    ) -> bool:
        """
        Export chat data to PostgreSQL.

        Args:
            chat_id: The chat log ID
            export_data: Dict containing messages, agreedPositions, agreedClosure, etc.
            end_type: Either 'user_exit' or 'agreed_closure'

        Returns:
            True if successful, False otherwise
        """
        if not self._pool:
            logger.error("PostgreSQL pool not initialized")
            return False

        try:
            async with self._pool.acquire() as conn:
                # Update the chat_log row with the exported data
                await conn.execute(
                    """
                    UPDATE chat_log
                    SET log = $1::jsonb,
                        end_time = $2,
                        end_type = $3,
                        status = 'archived'
                    WHERE id = $4::uuid
                    """,
                    json.dumps(export_data),
                    datetime.utcnow(),
                    end_type,
                    chat_id,
                )

                logger.info(f"Exported chat {chat_id} to PostgreSQL with end_type={end_type}")
                return True

        except Exception as e:
            logger.error(f"Failed to export chat {chat_id}: {e}")
            return False

    async def create_chat_log(
        self,
        chat_request_id: str,
    ) -> Optional[str]:
        """
        Create a new chat_log entry when a chat is started.

        Args:
            chat_request_id: The chat request ID

        Returns:
            The new chat_log ID if successful, None otherwise
        """
        if not self._pool:
            logger.error("PostgreSQL pool not initialized")
            return None

        try:
            async with self._pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    INSERT INTO chat_log (chat_request_id, start_time)
                    VALUES ($1::uuid, $2)
                    RETURNING id
                    """,
                    chat_request_id,
                    datetime.utcnow(),
                )

                chat_id = str(row["id"])
                logger.info(f"Created chat_log {chat_id} for request {chat_request_id}")
                return chat_id

        except Exception as e:
            logger.error(f"Failed to create chat_log for request {chat_request_id}: {e}")
            return None

    async def get_chat_participants(self, chat_id: str) -> Optional[list[str]]:
        """
        Get the participant IDs for a chat.

        Args:
            chat_id: The chat log ID

        Returns:
            List of participant user IDs, or None if not found
        """
        if not self._pool:
            logger.error("PostgreSQL pool not initialized")
            return None

        try:
            async with self._pool.acquire() as conn:
                # Get the chat request to find the participants
                row = await conn.fetchrow(
                    """
                    SELECT
                        cr.initiator_user_id,
                        up.user_id as responder_user_id
                    FROM chat_log cl
                    JOIN chat_request cr ON cl.chat_request_id = cr.id
                    JOIN user_position up ON cr.user_position_id = up.id
                    WHERE cl.id = $1::uuid
                    """,
                    chat_id,
                )

                if row:
                    return [str(row["initiator_user_id"]), str(row["responder_user_id"])]
                return None

        except Exception as e:
            logger.error(f"Failed to get participants for chat {chat_id}: {e}")
            return None
