import os

class Config:
	def __getitem__(self, item):
		return getattr(self, item)
	SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'postgresql://user:postgres@db:5432/candid')
	SQLALCHEMY_TRACK_MODIFICATIONS = False
	TIMESTAMP_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS"Z"' # ISO 8601
	LONG_POLL_TIMEOUT = 10
	# Redis for chat server communication
	REDIS_URL = os.environ.get('REDIS_URL', 'redis://redis:6379')
	# Auth
	TOKEN_SECRET = None
	TOKEN_LIFESPAN_MIN = None
	TOKEN_ALGO = 'HS256'
	PASSWORD_HASH_ROUNDS = 14
	# Polis integration
	POLIS_API_URL = os.environ.get('POLIS_API_URL', 'http://polis:5000/api/v3')
	POLIS_BASE_URL = os.environ.get('POLIS_BASE_URL', 'http://polis:5000')
	POLIS_PUBLIC_URL = os.environ.get('POLIS_PUBLIC_URL', 'http://localhost:8080')  # Public URL for browser access
	POLIS_ENABLED = os.environ.get('POLIS_ENABLED', 'true').lower() == 'true'
	POLIS_TIMEOUT = int(os.environ.get('POLIS_TIMEOUT', '10'))
	POLIS_CONVERSATION_WINDOW_MONTHS = 6  # How long each conversation stays active

	# Polis Admin Credentials (for server-side operations like creating conversations)
	# These are stored in config/yaml because they're shared server credentials,
	# not per-user credentials. Per-user XID tokens are stored in the database
	# (polis_participant table) after Polis issues them.
	POLIS_OIDC_TOKEN_URL = os.environ.get('POLIS_OIDC_TOKEN_URL', 'https://polis:3000/oauth/token')
	POLIS_OIDC_CLIENT_ID = os.environ.get('POLIS_OIDC_CLIENT_ID', 'dev-client-id')
	POLIS_OIDC_CLIENT_SECRET = os.environ.get('POLIS_OIDC_CLIENT_SECRET', 'dev_auth-client_secret')
	POLIS_ADMIN_EMAIL = os.environ.get('POLIS_ADMIN_EMAIL', 'admin@polis.test')
	POLIS_ADMIN_PASSWORD = os.environ.get('POLIS_ADMIN_PASSWORD', 'Te$tP@ssw0rd*')

	# NLP service
	NLP_SERVICE_URL = os.environ.get('NLP_SERVICE_URL', 'http://nlp:5001')
	NLP_SERVICE_TIMEOUT = int(os.environ.get('NLP_SERVICE_TIMEOUT', '10'))

class DevelopmentConfig(Config):
	DEV = True
	# Auth
	TOKEN_SECRET = "abc"
	TOKEN_LIFESPAN_MIN = 60
	#SQLALCHEMY_DATABASE_URI = os.environ.get('DEV_DATABASE_URL') or 'sqlite:///dev.db'

class ProductionConfig(Config):
	DEV = False
	# Auth
	TOKEN_SECRET = "put this somewhere secure and allow multiple to be active so it can be rotated"
	TOKEN_LIFESPAN_MIN = 60
	#SQLALCHEMY_DATABASE_URI = os.environ.get('PROD_DATABASE_URL')
	