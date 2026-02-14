import os

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
	POLIS_CONVERSATION_WINDOW_MONTHS = 6  # How long each conversation stays active

	# Polis Admin Credentials (Keycloak ROPC via polis-admin client)
	POLIS_ADMIN_CLIENT_SECRET = _require_secret('POLIS_ADMIN_CLIENT_SECRET', 'polis-admin-secret')
	POLIS_ADMIN_EMAIL = os.environ.get('POLIS_ADMIN_EMAIL', 'polis-admin@candid.dev')
	POLIS_ADMIN_PASSWORD = _require_secret('POLIS_ADMIN_PASSWORD', 'password')

	# NLP service
	NLP_SERVICE_URL = os.environ.get('NLP_SERVICE_URL', 'http://nlp:5001')
	NLP_SERVICE_TIMEOUT = int(os.environ.get('NLP_SERVICE_TIMEOUT', '10'))

	# Role management
	ROLE_APPROVAL_TIMEOUT_DAYS = int(os.environ.get('ROLE_APPROVAL_TIMEOUT_DAYS', '7'))

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

	# Scoring parameters (tunable via env vars)
	SCORING_WILSON_Z = float(os.environ.get('SCORING_WILSON_Z', '1.96'))
	SCORING_HOT_GRAVITY = float(os.environ.get('SCORING_HOT_GRAVITY', '1.5'))
	SCORING_WEIGHT_MIN = float(os.environ.get('SCORING_WEIGHT_MIN', '1.0'))
	SCORING_WEIGHT_MAX = float(os.environ.get('SCORING_WEIGHT_MAX', '2.0'))
	SCORING_BRIDGING_THRESHOLD = float(os.environ.get('SCORING_BRIDGING_THRESHOLD', '0.3'))

class DevelopmentConfig(Config):
	DEV = True

class ProductionConfig(Config):
	DEV = False
