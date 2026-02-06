import bcrypt
from datetime import datetime, timedelta, timezone
import jwt
import uuid

from candid.models.user import User
from candid.models.error_model import ErrorModel
from candid.controllers import config, db

_USER_ROLE_RANKING = {
    "guest": 1,
    "normal": 10,
    "moderator": 20,
    "admin": 30,
}

def create_token(user_id):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=config.TOKEN_LIFESPAN_MIN),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, config.TOKEN_SECRET, algorithm=config.TOKEN_ALGO)

def hash_password(password):
    salt = bcrypt.gensalt(rounds=config.PASSWORD_HASH_ROUNDS)
    hashed_password = bcrypt.hashpw(bytes(password, 'utf-8'), salt)
    return hashed_password.decode('utf-8')

def get_login_info(username):
    ret = db.execute_query("""
        SELECT
            password_hash,
            display_name,
            username,
            id,
            user_type,
            status,
            trust_score,
            avatar_url,
            avatar_icon_url
        FROM users
        WHERE username = %s
    """,
    (username,), fetchone=True)
    return ret

def get_user_type(user_id):
    ret = db.execute_query("""
        SELECT user_type
        FROM users
        WHERE id = %s
    """,
    (user_id,), fetchone=True)

    if ret:
        return ret["user_type"]
    else:
        return None

def does_password_match(password, password_hash):
    return bcrypt.checkpw(bytes(password, 'utf-8'), bytes(password_hash, 'utf-8'))

def decode_token(token):
    try:
        decoded_payload = jwt.decode(token, config.TOKEN_SECRET, algorithms=config.TOKEN_ALGO)
        return decoded_payload
    except jwt.ExpiredSignatureError as e:
        raise e
    except jwt.InvalidTokenError as e:
        raise e

def token_to_user(token_info):
    res = db.execute_query("""
        SELECT *
        FROM users
        WHERE id = %s
    """, (token_info["sub"],), fetchone=True)
    if res is not None:
        return User(
            id=str(res['id']),
            username=res['username'],
            display_name=res['display_name'],
            avatar_url=res.get('avatar_url'),
            avatar_icon_url=res.get('avatar_icon_url'),
            status=res['status'],
            trust_score=float(res['trust_score']) if res.get('trust_score') is not None else None,
            kudos_count=res.get('kudos_count', 0),
        )
    return None

def _check_ban_status(user_id):
    """Check if user is banned and handle temp ban expiry.

    Returns (is_banned, error_model) where is_banned is True if actively banned.
    """
    user_info = db.execute_query("""
        SELECT status FROM users WHERE id = %s
    """, (user_id,), fetchone=True)

    if not user_info or user_info['status'] != 'banned':
        return False, None

    # Check if there's a temp ban that has expired
    active_ban = db.execute_query("""
        SELECT mac.action_end_time
        FROM mod_action_target mat
        JOIN mod_action_class mac ON mat.mod_action_class_id = mac.id
        WHERE mat.user_id = %s AND mac.action IN ('permanent_ban', 'temporary_ban')
        ORDER BY mac.action_start_time DESC LIMIT 1
    """, (user_id,), fetchone=True)

    if active_ban and active_ban['action_end_time']:
        now = datetime.now(timezone.utc)
        if active_ban['action_end_time'].tzinfo is None:
            end_time = active_ban['action_end_time'].replace(tzinfo=timezone.utc)
        else:
            end_time = active_ban['action_end_time']
        if end_time < now:
            # Temp ban expired, restore user
            db.execute_query("UPDATE users SET status = 'active' WHERE id = %s", (user_id,))
            return False, None

    return True, ErrorModel(403, "Your account has been suspended")


def authorization(required_level, token_info=None):
    if not token_info:
        return False, ErrorModel(401, "Authentication Required")
    user_id = token_info['sub']
    user_type = get_user_type(user_id)
    if user_type is None:
        return False, ErrorModel(401, "User not found")
    if _USER_ROLE_RANKING[user_type] < _USER_ROLE_RANKING[required_level]:
        return False, ErrorModel(403, "Unauthorized")

    # Check ban status
    is_banned, ban_err = _check_ban_status(user_id)
    if is_banned:
        return False, ban_err

    return True, None


def authorization_allow_banned(required_level, token_info=None):
    """Same as authorization() but skips ban check.
    Used for endpoints banned users still need: card queue, profile, appeal creation.
    """
    if not token_info:
        return False, ErrorModel(401, "Authentication Required")
    user_id = token_info['sub']
    user_type = get_user_type(user_id)
    if user_type is None:
        return False, ErrorModel(401, "User not found")
    if _USER_ROLE_RANKING[user_type] >= _USER_ROLE_RANKING[required_level]:
        return True, None
    else:
        return False, ErrorModel(403, "Unauthorized")