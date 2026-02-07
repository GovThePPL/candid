"""
Push notification helpers using the Expo Push API.
"""

import json
import urllib.request
import urllib.error
from datetime import datetime


EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def send_chat_request_notification(push_token, initiator_display_name, position_statement, db=None, recipient_user_id=None):
    """Send a push notification for a new chat request.

    Args:
        push_token: The recipient's Expo push token
        initiator_display_name: Display name of the user requesting the chat
        position_statement: The position statement being discussed
        db: Database module (optional, for incrementing daily counter)
        recipient_user_id: Recipient user ID (optional, for incrementing daily counter)

    Returns:
        True if sent successfully, False otherwise
    """
    if not push_token:
        return False

    # Truncate statement for notification
    short_statement = position_statement[:80] + "..." if len(position_statement) > 80 else position_statement

    payload = {
        "to": push_token,
        "sound": "default",
        "title": f"{initiator_display_name} wants to chat",
        "body": short_statement,
        "data": {
            "action": "open_cards",
        },
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            EXPO_PUSH_URL,
            data=data,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode("utf-8"))

        # Increment daily notification counter
        if db and recipient_user_id:
            today = datetime.now().date()
            db.execute_query("""
                UPDATE users
                SET notifications_sent_today = CASE
                        WHEN notifications_sent_date = %s THEN notifications_sent_today + 1
                        ELSE 1
                    END,
                    notifications_sent_date = %s
                WHERE id = %s
            """, (today, today, recipient_user_id))

        return True

    except Exception as e:
        print(f"Error sending push notification: {e}")
        return False
