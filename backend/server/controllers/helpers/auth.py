import bcrypt
from datetime import datetime, timedelta, timezone
import jwt
import uuid

from candid.models.error_model import ErrorModel

from candid.controllers.helpers.database import execute_query
from candid.controllers import config as cfg

_USER_ROLE_RANKING = {
    "guest": 1,
    "normal": 10,
    "mod": 20,
    "admin": 30,
}

def create_token(user_id):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=cfg.TOKEN_LIFESPAN_MIN),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, cfg.TOKEN_SECRET, algorithm=cfg.TOKEN_ALGO)

def hash_password(password):
    salt = bcrypt.gensalt(rounds=User.PASSWORD_HASH_ROUNDS)
    hashed_password = bcrypt.hashpw(bytes(password, 'utf-8'), salt)
    return hashed_password

def get_login_info(username):
    ret = execute_query(f"SELECT password_hash, display_name, username, id FROM users WHERE username = '{username}' LIMIT 1")
    if ret:
        return ret[0]
    else:
        return None

def get_user_type(user_id):
    ret = execute_query(f"SELECT user_type FROM users WHERE id = '{user_id}' LIMIT 1")
    if ret:
        return ret[0]["user_type"]
    else:
        return None

def does_password_match(password, password_hash):
    return bcrypt.checkpw(bytes(password, 'utf-8'), bytes(password_hash, 'utf-8'))

def decode_token(token):
    try:
        decoded_payload = jwt.decode(token, cfg.TOKEN_SECRET, algorithms=cfg.TOKEN_ALGO)
        return decoded_payload
    except jwt.ExpiredSignatureError as e:
        raise e
    except jwt.InvalidTokenError as e:
        raise e


def get_by_token(token):
    decoded_token = decode_token(token)

    now = datetime.now(timezone.utc)
    token_exp = datetime.fromtimestamp(decoded_token['exp'], tz=timezone.utc)
    if token_exp < now:
        raise Exception('invalid token')

    user_id = decoded_token['sub']
    users = map_query_to_class(execute_query("select * from \"user\" where id=%s", (user_id,)), User)
    return users[0]

def authorization(required_level, token_info=None):
    if not token_info:
        return False, ErrorModel(401, "Authentication Required")
    user_id = token_info['sub']
    user_type = get_user_type(user_id)
    if _USER_ROLE_RANKING[user_type] >= _USER_ROLE_RANKING[required_level]:
        return True, None
    else:
        return False, ErrorModel(403, "Unauthorized")