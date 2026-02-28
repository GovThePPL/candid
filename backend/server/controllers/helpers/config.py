import logging
import os

logger = logging.getLogger(__name__)

# Dev defaults that must NEVER be used in production
_DEV_DEFAULTS = {'candid-backend-secret', 'polis-admin-secret', 'password', 'postgres', 'candid-dev-secret-key'}

def _require_secret(name, dev_default=None):
	"""Require env var in production, allow dev default otherwise."""
	value = os.environ.get(name)
	if value:
		return value
	if os.environ.get('FLASK_ENV') != 'production':
		if dev_default is not None:
			return dev_default
	raise RuntimeError(f"Required environment variable {name} is not set")

class Config:
	def __getitem__(self, item):
		return getattr(self, item)
	SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'postgresql://user:postgres@db:5432/candid')
	SQLALCHEMY_TRACK_MODIFICATIONS = False
	TIMESTAMP_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS"Z"' # ISO 8601
	LONG_POLL_TIMEOUT = 10
	# Redis for chat server communication
	REDIS_URL = os.environ.get('REDIS_URL', 'redis://redis:6379')
	# Keycloak
	KEYCLOAK_URL = os.environ.get('KEYCLOAK_URL', 'http://keycloak:8180')
	KEYCLOAK_ISSUER_URL = os.environ.get('KEYCLOAK_ISSUER_URL', KEYCLOAK_URL)
	KEYCLOAK_REALM = os.environ.get('KEYCLOAK_REALM', 'candid')
	KEYCLOAK_BACKEND_CLIENT_ID = os.environ.get('KEYCLOAK_BACKEND_CLIENT_ID', 'candid-backend')
	KEYCLOAK_BACKEND_CLIENT_SECRET = _require_secret('KEYCLOAK_BACKEND_CLIENT_SECRET', 'candid-backend-secret')
	# CORS
	_cors_raw = os.environ.get('CORS_ORIGINS', '')
	CORS_ORIGINS = [o for o in _cors_raw.split(',') if o] if _cors_raw else [
		'http://localhost:3001', 'http://localhost:8081',
		'http://localhost:8082', 'http://localhost:19006',
	]
	# Polis integration
	POLIS_API_URL = os.environ.get('POLIS_API_URL', 'http://polis-server:5000/api/v3')
	POLIS_BASE_URL = os.environ.get('POLIS_BASE_URL', 'http://polis-server:5000')
	POLIS_PUBLIC_URL = os.environ.get('POLIS_PUBLIC_URL', 'http://localhost:5000')  # Public URL for browser access
	POLIS_ENABLED = os.environ.get('POLIS_ENABLED', 'true').lower() == 'true'
	POLIS_TIMEOUT = int(os.environ.get('POLIS_TIMEOUT', '10'))
	# Polis Admin Credentials (Keycloak ROPC via polis-admin client)
	POLIS_ADMIN_CLIENT_SECRET = _require_secret('POLIS_ADMIN_CLIENT_SECRET', 'polis-admin-secret')
	POLIS_ADMIN_EMAIL = os.environ.get('POLIS_ADMIN_EMAIL', 'polis-admin@candid.dev')
	POLIS_ADMIN_PASSWORD = _require_secret('POLIS_ADMIN_PASSWORD', 'password')

	# Social login (Apple / Google)
	GOOGLE_CLIENT_ID_IOS = os.environ.get('GOOGLE_CLIENT_ID_IOS', '')
	GOOGLE_CLIENT_ID_ANDROID = os.environ.get('GOOGLE_CLIENT_ID_ANDROID', '')
	GOOGLE_CLIENT_ID_WEB = os.environ.get('GOOGLE_CLIENT_ID_WEB', '')
	APPLE_SERVICE_ID = os.environ.get('APPLE_SERVICE_ID', 'com.candid.app')

	# NLP service
	NLP_SERVICE_URL = os.environ.get('NLP_SERVICE_URL', 'http://nlp:5001')
	NLP_SERVICE_TIMEOUT = int(os.environ.get('NLP_SERVICE_TIMEOUT', '10'))

	# Avatar NSFW deferred check worker
	AVATAR_NSFW_ENABLED = os.environ.get('AVATAR_NSFW_ENABLED', 'true').lower() == 'true'
	AVATAR_NSFW_POLL_INTERVAL = int(os.environ.get('AVATAR_NSFW_POLL_INTERVAL', '5'))

	# Role management
	ROLE_APPROVAL_TIMEOUT_DAYS = int(os.environ.get('ROLE_APPROVAL_TIMEOUT_DAYS', '7'))

	# Approval reminder worker
	APPROVAL_REMINDER_ENABLED = os.environ.get('APPROVAL_REMINDER_ENABLED', 'true').lower() == 'true'
	APPROVAL_REMINDER_INTERVAL = int(os.environ.get('APPROVAL_REMINDER_INTERVAL', '3600'))  # 1 hour

	# Matrix Factorization (comment vote ideological coordinates)
	MF_ENABLED = os.environ.get('MF_ENABLED', os.environ.get('POLIS_ENABLED', 'true')).lower() == 'true'
	MF_TRAIN_INTERVAL = int(os.environ.get('MF_TRAIN_INTERVAL', '1800'))  # 30 min
	MF_MIN_VOTERS = int(os.environ.get('MF_MIN_VOTERS', '20'))
	MF_MIN_VOTES = int(os.environ.get('MF_MIN_VOTES', '50'))
	MF_LATENT_DIM = 2          # matches 2D coord system
	MF_LEARNING_RATE = 0.005
	MF_LAMBDA_REG = 0.02       # L2 on all parameters
	MF_LAMBDA_POLIS = 0.1      # pulls f_u toward PCA coords
	MF_MAX_EPOCHS = 300
	MF_CONVERGENCE_TOL = 1e-5

	# SMS / Phone verification
	# Auto-disables if Twilio credentials are not configured, even if the flag is set
	TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID', '')
	TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN', '')
	TWILIO_PHONE_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER', '')
	_sms_requested = os.environ.get('SMS_VERIFICATION_ENABLED', 'false').lower() == 'true'
	SMS_VERIFICATION_ENABLED = _sms_requested and bool(TWILIO_ACCOUNT_SID) and bool(TWILIO_AUTH_TOKEN)

	# JWT secret for pending social login tokens
	SECRET_KEY = _require_secret('SECRET_KEY', 'candid-dev-secret-key')

	# Scoring parameters (tunable via env vars)
	SCORING_WILSON_Z = float(os.environ.get('SCORING_WILSON_Z', '1.96'))
	SCORING_HOT_GRAVITY = float(os.environ.get('SCORING_HOT_GRAVITY', '1.5'))
	SCORING_WEIGHT_MIN = float(os.environ.get('SCORING_WEIGHT_MIN', '1.0'))
	SCORING_WEIGHT_MAX = float(os.environ.get('SCORING_WEIGHT_MAX', '2.0'))
	SCORING_BRIDGING_BASE = float(os.environ.get('SCORING_BRIDGING_BASE', '0.40'))
	SCORING_BRIDGING_MARGIN = float(os.environ.get('SCORING_BRIDGING_MARGIN', '0.45'))

class DevelopmentConfig(Config):
	DEV = True

class ProductionConfig(Config):
	DEV = False

	def __init__(self):
		super().__init__()
		# Warn if any secrets still have dev defaults
		secrets_to_check = {
			'KEYCLOAK_BACKEND_CLIENT_SECRET': self.KEYCLOAK_BACKEND_CLIENT_SECRET,
			'POLIS_ADMIN_CLIENT_SECRET': self.POLIS_ADMIN_CLIENT_SECRET,
			'POLIS_ADMIN_PASSWORD': self.POLIS_ADMIN_PASSWORD,
			'SECRET_KEY': self.SECRET_KEY,
		}
		if self._sms_requested and not self.SMS_VERIFICATION_ENABLED:
			logger.critical(
				"SECURITY: SMS_VERIFICATION_ENABLED is true but Twilio credentials are missing — "
				"SMS verification is DISABLED. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, "
				"and TWILIO_PHONE_NUMBER to enable phone verification."
			)
		for name, value in secrets_to_check.items():
			if value in _DEV_DEFAULTS:
				logger.critical(
					"SECURITY: %s is using a dev default value. "
					"Set it via environment variable before deploying to production.", name
				)
		if not os.environ.get('CORS_ORIGINS'):
			logger.critical(
				"SECURITY: CORS_ORIGINS is not set. "
				"Falling back to localhost defaults. "
				"Set CORS_ORIGINS to your production domain(s)."
			)
		if self.POLIS_PUBLIC_URL == 'http://localhost:5000':
			logger.critical(
				"SECURITY: POLIS_PUBLIC_URL is using the localhost default. "
				"Set it to your production Polis URL."
			)
