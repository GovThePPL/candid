"""
Tests for agreed position handling.
"""

import asyncio
import json

import pytest
import socketio


class TestAgreedPositionPropose:
    """Tests for proposing agreed positions."""

    @pytest.mark.asyncio
    async def test_propose_not_authenticated(self, connected_client, chat_id):
        """Test proposing without authentication."""
        response = await connected_client.call(
            "agreed_position",
            {"chatId": chat_id, "action": "propose", "content": "Test"},
        )

        assert response["status"] == "error"
        assert response["code"] == "NOT_AUTHENTICATED"

    @pytest.mark.asyncio
    async def test_propose_missing_chat_id(self, authenticated_client):
        """Test proposing without chatId."""
        client, _ = authenticated_client
        response = await client.call(
            "agreed_position", {"action": "propose", "content": "Test"}
        )

        assert response["status"] == "error"
        assert response["code"] == "MISSING_CHAT_ID"

    @pytest.mark.asyncio
    async def test_propose_invalid_action(self, authenticated_client, chat_id):
        """Test with invalid action."""
        client, _ = authenticated_client
        response = await client.call(
            "agreed_position",
            {"chatId": chat_id, "action": "invalid", "content": "Test"},
        )

        assert response["status"] == "error"
        assert response["code"] == "INVALID_ACTION"

    @pytest.mark.asyncio
    async def test_propose_not_participant(self, authenticated_client, chat_id):
        """Test proposing to chat user is not in."""
        client, _ = authenticated_client
        response = await client.call(
            "agreed_position",
            {"chatId": chat_id, "action": "propose", "content": "Test"},
        )

        assert response["status"] == "error"
        assert response["code"] == "NOT_PARTICIPANT"

    @pytest.mark.asyncio
    async def test_propose_missing_content(
        self, test_server, user1_id, user1_token, setup_chat
    ):
        """Test proposing without content."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        response = await client.call(
            "agreed_position", {"chatId": setup_chat, "action": "propose"}
        )

        assert response["status"] == "error"
        assert response["code"] == "MISSING_CONTENT"

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_propose_success(
        self, test_server, user1_id, user1_token, setup_chat
    ):
        """Test successfully proposing an agreed position."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        response = await client.call(
            "agreed_position",
            {
                "chatId": setup_chat,
                "action": "propose",
                "content": "We agree on testing!",
            },
        )

        assert response["status"] == "proposed"
        assert "proposalId" in response

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_propose_stored_in_redis(
        self, test_server, redis_client, user1_id, user1_token, setup_chat
    ):
        """Test that proposed position is stored in Redis."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        response = await client.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "propose", "content": "Stored position"},
        )

        positions = await redis_client.hgetall(f"chat:{setup_chat}:positions")
        assert len(positions) == 1

        position = json.loads(list(positions.values())[0])
        assert position["content"] == "Stored position"
        assert position["proposerId"] == user1_id
        assert position["status"] == "pending"

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_propose_broadcast(
        self, test_server, user1_id, user1_token, user2_id, user2_token, setup_chat
    ):
        """Test that proposal is broadcast to other participant."""
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        received_positions = []

        @client2.on("agreed_position")
        async def on_position(data):
            received_positions.append(data)

        await client1.connect(url)
        await client2.connect(url)

        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user2_token})

        await client1.call("join_chat", {"chatId": setup_chat})
        await client2.call("join_chat", {"chatId": setup_chat})

        await client1.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "propose", "content": "Broadcast test"},
        )

        await asyncio.sleep(0.2)

        assert len(received_positions) >= 1
        event = received_positions[-1]
        assert event["action"] == "propose"
        assert event["proposal"]["content"] == "Broadcast test"
        assert event["proposerId"] == user1_id
        assert event["isClosure"] is False

        await client1.disconnect()
        await client2.disconnect()


class TestAgreedPositionAccept:
    """Tests for accepting agreed positions."""

    @pytest.mark.asyncio
    async def test_accept_missing_proposal_id(
        self, test_server, user1_id, user1_token, setup_chat
    ):
        """Test accepting without proposalId."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        response = await client.call(
            "agreed_position", {"chatId": setup_chat, "action": "accept"}
        )

        assert response["status"] == "error"
        assert response["code"] == "MISSING_PROPOSAL_ID"

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_accept_not_found(
        self, test_server, user1_id, user1_token, setup_chat
    ):
        """Test accepting non-existent proposal."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        response = await client.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "accept", "proposalId": "nonexistent"},
        )

        assert response["status"] == "error"
        assert response["code"] == "PROPOSAL_NOT_FOUND"

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_accept_own_proposal(
        self, test_server, user1_id, user1_token, setup_chat
    ):
        """Test that user cannot accept their own proposal."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        # Propose
        propose_response = await client.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "propose", "content": "My proposal"},
        )
        proposal_id = propose_response["proposalId"]

        # Try to accept own proposal
        response = await client.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "accept", "proposalId": proposal_id},
        )

        assert response["status"] == "error"
        assert response["code"] == "CANNOT_ACCEPT_OWN"

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_accept_success(
        self, test_server, user1_id, user1_token, user2_id, user2_token, setup_chat
    ):
        """Test successfully accepting a proposal."""
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        await client1.connect(url)
        await client2.connect(url)

        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user2_token})

        await client1.call("join_chat", {"chatId": setup_chat})
        await client2.call("join_chat", {"chatId": setup_chat})

        # User 1 proposes
        propose_response = await client1.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "propose", "content": "Agreement"},
        )
        proposal_id = propose_response["proposalId"]

        # User 2 accepts
        response = await client2.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "accept", "proposalId": proposal_id},
        )

        assert response["status"] == "accepted"

        await client1.disconnect()
        await client2.disconnect()

    @pytest.mark.asyncio
    async def test_accept_already_accepted(
        self,
        test_server,
        redis_client,
        user1_id,
        user1_token,
        user2_id,
        user2_token,
        setup_chat,
    ):
        """Test accepting an already accepted proposal."""
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        await client1.connect(url)
        await client2.connect(url)

        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user2_token})

        await client1.call("join_chat", {"chatId": setup_chat})
        await client2.call("join_chat", {"chatId": setup_chat})

        # User 1 proposes
        propose_response = await client1.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "propose", "content": "Agreement"},
        )
        proposal_id = propose_response["proposalId"]

        # User 2 accepts
        await client2.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "accept", "proposalId": proposal_id},
        )

        # User 2 tries to accept again
        response = await client2.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "accept", "proposalId": proposal_id},
        )

        assert response["status"] == "error"
        assert response["code"] == "PROPOSAL_NOT_PENDING"

        await client1.disconnect()
        await client2.disconnect()


class TestAgreedPositionReject:
    """Tests for rejecting agreed positions."""

    @pytest.mark.asyncio
    async def test_reject_own_proposal(
        self, test_server, user1_id, user1_token, setup_chat
    ):
        """Test that user cannot reject their own proposal."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        # Propose
        propose_response = await client.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "propose", "content": "My proposal"},
        )
        proposal_id = propose_response["proposalId"]

        # Try to reject own proposal
        response = await client.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "reject", "proposalId": proposal_id},
        )

        assert response["status"] == "error"
        assert response["code"] == "CANNOT_REJECT_OWN"

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_reject_success(
        self, test_server, user1_id, user1_token, user2_id, user2_token, setup_chat
    ):
        """Test successfully rejecting a proposal."""
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        await client1.connect(url)
        await client2.connect(url)

        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user2_token})

        await client1.call("join_chat", {"chatId": setup_chat})
        await client2.call("join_chat", {"chatId": setup_chat})

        # User 1 proposes
        propose_response = await client1.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "propose", "content": "Rejected"},
        )
        proposal_id = propose_response["proposalId"]

        # User 2 rejects
        response = await client2.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "reject", "proposalId": proposal_id},
        )

        assert response["status"] == "rejected"

        await client1.disconnect()
        await client2.disconnect()

    @pytest.mark.asyncio
    async def test_reject_broadcast(
        self, test_server, user1_id, user1_token, user2_id, user2_token, setup_chat
    ):
        """Test that rejection is broadcast."""
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        received_positions = []

        @client1.on("agreed_position")
        async def on_position(data):
            received_positions.append(data)

        await client1.connect(url)
        await client2.connect(url)

        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user2_token})

        await client1.call("join_chat", {"chatId": setup_chat})
        await client2.call("join_chat", {"chatId": setup_chat})

        # User 1 proposes
        propose_response = await client1.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "propose", "content": "Rejected"},
        )
        proposal_id = propose_response["proposalId"]

        # User 2 rejects
        await client2.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "reject", "proposalId": proposal_id},
        )

        await asyncio.sleep(0.2)

        # Find reject event
        reject_events = [e for e in received_positions if e["action"] == "reject"]
        assert len(reject_events) >= 1
        assert reject_events[-1]["rejecterId"] == user2_id

        await client1.disconnect()
        await client2.disconnect()


class TestAgreedPositionModify:
    """Tests for modifying agreed positions."""

    @pytest.mark.asyncio
    async def test_modify_missing_content(
        self, test_server, user1_id, user1_token, user2_id, user2_token, setup_chat
    ):
        """Test modifying without new content."""
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        await client1.connect(url)
        await client2.connect(url)

        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user2_token})

        await client1.call("join_chat", {"chatId": setup_chat})
        await client2.call("join_chat", {"chatId": setup_chat})

        # User 1 proposes
        propose_response = await client1.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "propose", "content": "Original"},
        )
        proposal_id = propose_response["proposalId"]

        # User 2 tries to modify without content
        response = await client2.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "modify", "proposalId": proposal_id},
        )

        assert response["status"] == "error"
        assert response["code"] == "MISSING_CONTENT"

        await client1.disconnect()
        await client2.disconnect()

    @pytest.mark.asyncio
    async def test_modify_success(
        self, test_server, user1_id, user1_token, user2_id, user2_token, setup_chat
    ):
        """Test successfully modifying a proposal."""
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        await client1.connect(url)
        await client2.connect(url)

        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user2_token})

        await client1.call("join_chat", {"chatId": setup_chat})
        await client2.call("join_chat", {"chatId": setup_chat})

        # User 1 proposes
        propose_response = await client1.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "propose", "content": "Original"},
        )
        proposal_id = propose_response["proposalId"]

        # User 2 modifies
        response = await client2.call(
            "agreed_position",
            {
                "chatId": setup_chat,
                "action": "modify",
                "proposalId": proposal_id,
                "content": "Modified version",
            },
        )

        assert response["status"] == "modified"
        assert "proposalId" in response
        assert response["proposalId"] != proposal_id  # New proposal created

        await client1.disconnect()
        await client2.disconnect()

    @pytest.mark.asyncio
    async def test_modify_creates_chain(
        self,
        test_server,
        redis_client,
        user1_id,
        user1_token,
        user2_id,
        user2_token,
        setup_chat,
    ):
        """Test that modifications create a chain with parent_id."""
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        await client1.connect(url)
        await client2.connect(url)

        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user2_token})

        await client1.call("join_chat", {"chatId": setup_chat})
        await client2.call("join_chat", {"chatId": setup_chat})

        # User 1 proposes
        propose_response = await client1.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "propose", "content": "Original"},
        )
        original_id = propose_response["proposalId"]

        # User 2 modifies
        modify_response = await client2.call(
            "agreed_position",
            {
                "chatId": setup_chat,
                "action": "modify",
                "proposalId": original_id,
                "content": "Modified",
            },
        )
        new_id = modify_response["proposalId"]

        # Check Redis for parent_id
        positions = await redis_client.hgetall(f"chat:{setup_chat}:positions")
        new_position = json.loads(positions[new_id])
        assert new_position["parentId"] == original_id

        # Check original is marked as modified
        original_position = json.loads(positions[original_id])
        assert original_position["status"] == "modified"

        await client1.disconnect()
        await client2.disconnect()


class TestClosureProposal:
    """Tests for closure proposals."""

    @pytest.mark.asyncio
    async def test_propose_closure(
        self, test_server, user1_id, user1_token, setup_chat
    ):
        """Test proposing a closure."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        response = await client.call(
            "agreed_position",
            {
                "chatId": setup_chat,
                "action": "propose",
                "content": "Final agreement",
                "isClosure": True,
            },
        )

        assert response["status"] == "proposed"

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_closure_stored_separately(
        self, test_server, redis_client, user1_id, user1_token, setup_chat
    ):
        """Test that closure proposal is stored in separate key."""
        client = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"
        await client.connect(url)
        await client.call("authenticate", {"token": user1_token})
        await client.call("join_chat", {"chatId": setup_chat})

        await client.call(
            "agreed_position",
            {
                "chatId": setup_chat,
                "action": "propose",
                "content": "Final agreement",
                "isClosure": True,
            },
        )

        closure = await redis_client.get(f"chat:{setup_chat}:closure")
        assert closure is not None
        closure_data = json.loads(closure)
        assert closure_data["content"] == "Final agreement"
        assert closure_data["proposerId"] == user1_id

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_reject_closure_clears_proposal(
        self,
        test_server,
        redis_client,
        user1_id,
        user1_token,
        user2_id,
        user2_token,
        setup_chat,
    ):
        """Test that rejecting closure clears the closure proposal."""
        client1 = socketio.AsyncClient()
        client2 = socketio.AsyncClient()
        url = f"http://{test_server.host}:{test_server.port}"

        await client1.connect(url)
        await client2.connect(url)

        await client1.call("authenticate", {"token": user1_token})
        await client2.call("authenticate", {"token": user2_token})

        await client1.call("join_chat", {"chatId": setup_chat})
        await client2.call("join_chat", {"chatId": setup_chat})

        # User 1 proposes closure
        propose_response = await client1.call(
            "agreed_position",
            {
                "chatId": setup_chat,
                "action": "propose",
                "content": "Final agreement",
                "isClosure": True,
            },
        )
        proposal_id = propose_response["proposalId"]

        # Verify closure is stored
        closure = await redis_client.get(f"chat:{setup_chat}:closure")
        assert closure is not None

        # User 2 rejects
        await client2.call(
            "agreed_position",
            {"chatId": setup_chat, "action": "reject", "proposalId": proposal_id},
        )

        # Verify closure is cleared
        closure = await redis_client.get(f"chat:{setup_chat}:closure")
        assert closure is None

        await client1.disconnect()
        await client2.disconnect()
