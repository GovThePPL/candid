import bcrypt
from datetime import datetime, timedelta, timezone
import jwt
import uuid
from camel_converter import dict_to_camel

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
            id
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
        return User.from_dict(dict_to_camel(res))
    return None

def authorization(required_level, token_info=None):
    if not token_info:
        return False, ErrorModel(401, "Authentication Required")
    user_id = token_info['sub']
    user_type = get_user_type(user_id)
    if _USER_ROLE_RANKING[user_type] >= _USER_ROLE_RANKING[required_level]:
        return True, None
    else:
        return False, ErrorModel(403, "Unauthorized")