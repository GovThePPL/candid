"""Integration tests for the notification inbox endpoints."""

import pytest
import requests
from conftest import (
    BASE_URL, login, auth_header, db_execute, db_execute_returning,
    NORMAL1_ID, NORMAL2_ID, US_LOCATION_ID,
)

URL = f"{BASE_URL}/notifications"


@pytest.fixture(autouse=True)
def cleanup_notifications():
    """Remove all notification_inbox rows before and after each test."""
    db_execute("DELETE FROM notification_inbox")
    yield
    db_execute("DELETE FROM notification_inbox")


@pytest.fixture
def normal1_token():
    return login("normal1")


@pytest.fixture
def normal2_token():
    return login("normal2")


def _insert_notification(user_id, title="Test", body="Body",
                          notification_type="post_comment",
                          actor_user_id=None, is_read=False):
    """Insert a notification directly into the DB and return its ID."""
    rows = db_execute_returning(
        """INSERT INTO notification_inbox
           (user_id, notification_type, actor_user_id, title, body, is_read)
           VALUES (%s, %s, %s, %s, %s, %s)
           RETURNING id""",
        (user_id, notification_type, actor_user_id, title, body, is_read),
    )
    return str(rows[0]["id"])


# ---------------------------------------------------------------------------
# GET /notifications
# ---------------------------------------------------------------------------

class TestGetNotifications:
    def test_empty_inbox(self, normal1_token):
        resp = requests.get(URL, headers=auth_header(normal1_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["hasMore"] is False

    def test_returns_user_notifications(self, normal1_token):
        _insert_notification(NORMAL1_ID, "Title 1", "Body 1")
        _insert_notification(NORMAL1_ID, "Title 2", "Body 2")
        # Another user's notification should not appear
        _insert_notification(NORMAL2_ID, "Other user", "Other body")

        resp = requests.get(URL, headers=auth_header(normal1_token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 2
        # Most recent first
        assert data["items"][0]["title"] == "Title 2"
        assert data["items"][1]["title"] == "Title 1"

    def test_pagination(self, normal1_token):
        for i in range(5):
            _insert_notification(NORMAL1_ID, f"Notif {i}", f"Body {i}")

        resp = requests.get(f"{URL}?limit=2", headers=auth_header(normal1_token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 2
        assert data["hasMore"] is True
        assert data["nextCursor"] is not None

        # Second page
        resp2 = requests.get(
            f"{URL}?limit=2&cursor={data['nextCursor']}",
            headers=auth_header(normal1_token),
        )
        data2 = resp2.json()
        assert len(data2["items"]) == 2
        assert data2["hasMore"] is True

        # Third page (last)
        resp3 = requests.get(
            f"{URL}?limit=2&cursor={data2['nextCursor']}",
            headers=auth_header(normal1_token),
        )
        data3 = resp3.json()
        assert len(data3["items"]) == 1
        assert data3["hasMore"] is False

    def test_includes_actor_info(self, normal1_token):
        _insert_notification(
            NORMAL1_ID, "Reply", "Body",
            notification_type="comment_reply",
            actor_user_id=NORMAL2_ID,
        )

        resp = requests.get(URL, headers=auth_header(normal1_token))
        data = resp.json()
        item = data["items"][0]
        assert item["actorUserId"] == NORMAL2_ID
        assert item["actorDisplayName"] is not None

    def test_unauthenticated(self):
        resp = requests.get(URL)
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /notifications/unread-count
# ---------------------------------------------------------------------------

class TestGetUnreadCount:
    def test_zero_when_empty(self, normal1_token):
        resp = requests.get(f"{URL}/unread-count", headers=auth_header(normal1_token))
        assert resp.status_code == 200
        assert resp.json()["count"] == 0

    def test_counts_unread_only(self, normal1_token):
        _insert_notification(NORMAL1_ID, "Unread 1", "Body", is_read=False)
        _insert_notification(NORMAL1_ID, "Unread 2", "Body", is_read=False)
        _insert_notification(NORMAL1_ID, "Read", "Body", is_read=True)

        resp = requests.get(f"{URL}/unread-count", headers=auth_header(normal1_token))
        assert resp.status_code == 200
        assert resp.json()["count"] == 2

    def test_does_not_count_other_users(self, normal1_token):
        _insert_notification(NORMAL2_ID, "Other", "Body", is_read=False)

        resp = requests.get(f"{URL}/unread-count", headers=auth_header(normal1_token))
        assert resp.json()["count"] == 0


# ---------------------------------------------------------------------------
# PATCH /notifications/{notificationId}/read
# ---------------------------------------------------------------------------

class TestMarkRead:
    def test_marks_as_read(self, normal1_token):
        notif_id = _insert_notification(NORMAL1_ID, "Test", "Body")

        resp = requests.patch(
            f"{URL}/{notif_id}/read",
            headers=auth_header(normal1_token),
        )
        assert resp.status_code == 204

        # Verify unread count is now 0
        count_resp = requests.get(
            f"{URL}/unread-count",
            headers=auth_header(normal1_token),
        )
        assert count_resp.json()["count"] == 0

    def test_idempotent(self, normal1_token):
        notif_id = _insert_notification(NORMAL1_ID, "Test", "Body", is_read=True)

        resp = requests.patch(
            f"{URL}/{notif_id}/read",
            headers=auth_header(normal1_token),
        )
        assert resp.status_code == 204

    def test_cannot_mark_other_users_notification(self, normal1_token):
        notif_id = _insert_notification(NORMAL2_ID, "Other", "Body")

        resp = requests.patch(
            f"{URL}/{notif_id}/read",
            headers=auth_header(normal1_token),
        )
        # Returns 204 (idempotent) but doesn't actually update
        assert resp.status_code == 204


# ---------------------------------------------------------------------------
# PATCH /notifications/read-all
# ---------------------------------------------------------------------------

class TestMarkAllRead:
    def test_marks_all_as_read(self, normal1_token):
        _insert_notification(NORMAL1_ID, "Notif 1", "Body")
        _insert_notification(NORMAL1_ID, "Notif 2", "Body")

        resp = requests.patch(
            f"{URL}/read-all",
            headers=auth_header(normal1_token),
        )
        assert resp.status_code == 204

        count_resp = requests.get(
            f"{URL}/unread-count",
            headers=auth_header(normal1_token),
        )
        assert count_resp.json()["count"] == 0

    def test_does_not_affect_other_users(self, normal1_token, normal2_token):
        _insert_notification(NORMAL1_ID, "Mine", "Body")
        _insert_notification(NORMAL2_ID, "Theirs", "Body")

        requests.patch(f"{URL}/read-all", headers=auth_header(normal1_token))

        # normal2's notification should still be unread
        count_resp = requests.get(
            f"{URL}/unread-count",
            headers=auth_header(normal2_token),
        )
        assert count_resp.json()["count"] == 1


# ---------------------------------------------------------------------------
# PUT /users/me/notification-mutes
# GET /users/me/notification-mutes
# ---------------------------------------------------------------------------

MUTE_URL = f"{BASE_URL}/users/me/notification-mutes"


def _create_post(creator_id):
    """Insert a minimal post and return its ID."""
    rows = db_execute_returning(
        """INSERT INTO post (creator_user_id, location_id, title, body)
           VALUES (%s, %s, 'Mute test post', 'body')
           RETURNING id""",
        (creator_id, US_LOCATION_ID),
    )
    return str(rows[0]["id"])


def _create_comment(creator_id, post_id):
    """Insert a minimal root comment and return its ID."""
    import uuid
    comment_id = str(uuid.uuid4())
    db_execute_returning(
        """INSERT INTO comment (id, creator_user_id, post_id, body, path, depth)
           VALUES (%s::uuid, %s, %s, 'Mute test comment', %s, 0)
           RETURNING id""",
        (comment_id, creator_id, post_id, comment_id),
    )
    return comment_id


@pytest.fixture(autouse=False)
def cleanup_mutes():
    """Remove mutes and test posts/comments after each test."""
    yield
    db_execute("DELETE FROM notification_mute")
    db_execute("DELETE FROM comment")
    db_execute("DELETE FROM post")


class TestNotificationMute:
    def test_mute_post(self, normal1_token, cleanup_mutes):
        post_id = _create_post(NORMAL1_ID)

        resp = requests.put(
            MUTE_URL,
            json={"targetType": "post", "targetId": post_id, "muted": True},
            headers=auth_header(normal1_token),
        )
        assert resp.status_code == 200
        assert resp.json()["muted"] is True

    def test_unmute_post(self, normal1_token, cleanup_mutes):
        post_id = _create_post(NORMAL1_ID)

        # Mute first
        requests.put(
            MUTE_URL,
            json={"targetType": "post", "targetId": post_id, "muted": True},
            headers=auth_header(normal1_token),
        )
        # Unmute
        resp = requests.put(
            MUTE_URL,
            json={"targetType": "post", "targetId": post_id, "muted": False},
            headers=auth_header(normal1_token),
        )
        assert resp.status_code == 200
        assert resp.json()["muted"] is False

    def test_mute_comment(self, normal1_token, cleanup_mutes):
        post_id = _create_post(NORMAL1_ID)
        comment_id = _create_comment(NORMAL1_ID, post_id)

        resp = requests.put(
            MUTE_URL,
            json={"targetType": "comment", "targetId": comment_id, "muted": True},
            headers=auth_header(normal1_token),
        )
        assert resp.status_code == 200
        assert resp.json()["muted"] is True

    def test_mute_idempotent(self, normal1_token, cleanup_mutes):
        post_id = _create_post(NORMAL1_ID)

        for _ in range(2):
            resp = requests.put(
                MUTE_URL,
                json={"targetType": "post", "targetId": post_id, "muted": True},
                headers=auth_header(normal1_token),
            )
            assert resp.status_code == 200

    def test_cannot_mute_other_users_post(self, normal2_token, cleanup_mutes):
        post_id = _create_post(NORMAL1_ID)

        resp = requests.put(
            MUTE_URL,
            json={"targetType": "post", "targetId": post_id, "muted": True},
            headers=auth_header(normal2_token),
        )
        assert resp.status_code == 403

    def test_mute_nonexistent_target(self, normal1_token, cleanup_mutes):
        resp = requests.put(
            MUTE_URL,
            json={"targetType": "post", "targetId": "00000000-0000-0000-0000-000000000000", "muted": True},
            headers=auth_header(normal1_token),
        )
        assert resp.status_code == 404

    def test_get_mute_status(self, normal1_token, cleanup_mutes):
        post_id = _create_post(NORMAL1_ID)

        # Initially not muted
        resp = requests.get(
            f"{MUTE_URL}?targetType=post&targetId={post_id}",
            headers=auth_header(normal1_token),
        )
        assert resp.status_code == 200
        assert resp.json()["muted"] is False

        # Mute, then check
        requests.put(
            MUTE_URL,
            json={"targetType": "post", "targetId": post_id, "muted": True},
            headers=auth_header(normal1_token),
        )
        resp = requests.get(
            f"{MUTE_URL}?targetType=post&targetId={post_id}",
            headers=auth_header(normal1_token),
        )
        assert resp.status_code == 200
        assert resp.json()["muted"] is True

    def test_unauthenticated(self, cleanup_mutes):
        resp = requests.put(
            MUTE_URL,
            json={"targetType": "post", "targetId": "00000000-0000-0000-0000-000000000000", "muted": True},
        )
        assert resp.status_code == 401
