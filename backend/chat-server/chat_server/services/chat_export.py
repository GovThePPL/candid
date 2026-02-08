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

    async def get_pending_chat_requests(self, user_id: str) -> list[dict]:
        """
        Get pending chat requests for a user (where they own the position).

        Returns card-format dicts matching _chat_request_to_card output shape,
        used for catch-up delivery on socket authentication.

        Args:
            user_id: The user whose pending chat requests to fetch

        Returns:
            List of card-format dicts
        """
        if not self._pool:
            logger.error("PostgreSQL pool not initialized")
            return []

        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT
                        cr.id,
                        cr.user_position_id,
                        cr.response,
                        TO_CHAR(cr.created_time, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_time,
                        u.id as initiator_id,
                        u.display_name as initiator_display_name,
                        u.username as initiator_username,
                        u.status as initiator_status,
                        u.trust_score as initiator_trust_score,
                        u.avatar_url as initiator_avatar_url,
                        u.avatar_icon_url as initiator_avatar_icon_url,
                        COALESCE((
                            SELECT COUNT(*) FROM kudos k
                            WHERE k.receiver_user_id = u.id AND k.status = 'sent'
                        ), 0) as initiator_kudos_count,
                        p.id as position_id,
                        p.statement as position_statement,
                        pc.label as position_category_name,
                        loc.code as position_location_code,
                        loc.name as position_location_name,
                        author.id as author_id,
                        author.display_name as author_display_name,
                        author.username as author_username,
                        author.status as author_status,
                        author.trust_score as author_trust_score,
                        author.avatar_url as author_avatar_url,
                        author.avatar_icon_url as author_avatar_icon_url,
                        COALESCE((
                            SELECT COUNT(*) FROM kudos k
                            WHERE k.receiver_user_id = author.id AND k.status = 'sent'
                        ), 0) as author_kudos_count
                    FROM chat_request cr
                    JOIN user_position up ON cr.user_position_id = up.id
                    JOIN users u ON cr.initiator_user_id = u.id
                    JOIN position p ON up.position_id = p.id
                    JOIN users author ON up.user_id = author.id
                    LEFT JOIN position_category pc ON p.category_id = pc.id
                    LEFT JOIN location loc ON p.location_id = loc.id
                    WHERE up.user_id = $1::uuid
                      AND cr.response = 'pending'
                    ORDER BY cr.created_time DESC
                    """,
                    user_id,
                )

                cards = []
                for row in rows:
                    initiator = {
                        "id": str(row["initiator_id"]),
                        "displayName": row["initiator_display_name"],
                        "username": row["initiator_username"],
                        "status": row["initiator_status"],
                        "kudosCount": row.get("initiator_kudos_count", 0),
                        "trustScore": float(row["initiator_trust_score"]) if row.get("initiator_trust_score") is not None else None,
                        "avatarUrl": row.get("initiator_avatar_url"),
                        "avatarIconUrl": row.get("initiator_avatar_icon_url"),
                    }

                    creator = {
                        "id": str(row["author_id"]),
                        "displayName": row["author_display_name"],
                        "username": row["author_username"],
                        "status": row["author_status"],
                        "kudosCount": row.get("author_kudos_count", 0),
                        "trustScore": float(row["author_trust_score"]) if row.get("author_trust_score") is not None else None,
                        "avatarUrl": row.get("author_avatar_url"),
                        "avatarIconUrl": row.get("author_avatar_icon_url"),
                    }

                    position = {
                        "id": str(row["position_id"]),
                        "statement": row["position_statement"],
                        "creator": creator,
                    }

                    if row.get("position_category_name"):
                        position["category"] = {"label": row["position_category_name"]}

                    if row.get("position_location_code"):
                        position["location"] = {
                            "code": row["position_location_code"],
                            "name": row.get("position_location_name"),
                        }

                    cards.append({
                        "type": "chat_request",
                        "data": {
                            "id": str(row["id"]),
                            "requester": initiator,
                            "userPositionId": str(row["user_position_id"]),
                            "position": position,
                            "response": row["response"],
                            "createdTime": row.get("created_time"),
                        },
                    })

                logger.info(f"Found {len(cards)} pending chat requests for user {user_id}")
                return cards

        except Exception as e:
            logger.error(f"Failed to get pending chat requests for user {user_id}: {e}")
            return []

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
