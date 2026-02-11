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
	# Keycloak
	KEYCLOAK_URL = os.environ.get('KEYCLOAK_URL', 'http://keycloak:8180')
	KEYCLOAK_REALM = os.environ.get('KEYCLOAK_REALM', 'candid')
	KEYCLOAK_BACKEND_CLIENT_ID = os.environ.get('KEYCLOAK_BACKEND_CLIENT_ID', 'candid-backend')
	KEYCLOAK_BACKEND_CLIENT_SECRET = os.environ.get('KEYCLOAK_BACKEND_CLIENT_SECRET', 'candid-backend-secret')
	# CORS
	CORS_ORIGINS = os.environ.get('CORS_ORIGINS', 'http://localhost:3001,http://localhost:8081,http://localhost:8082,http://localhost:19006').split(',')
	# Polis integration
	POLIS_API_URL = os.environ.get('POLIS_API_URL', 'http://polis-server:5000/api/v3')
	POLIS_BASE_URL = os.environ.get('POLIS_BASE_URL', 'http://polis-server:5000')
	POLIS_PUBLIC_URL = os.environ.get('POLIS_PUBLIC_URL', 'http://localhost:5000')  # Public URL for browser access
	POLIS_ENABLED = os.environ.get('POLIS_ENABLED', 'true').lower() == 'true'
	POLIS_TIMEOUT = int(os.environ.get('POLIS_TIMEOUT', '10'))
	POLIS_CONVERSATION_WINDOW_MONTHS = 6  # How long each conversation stays active

	# Polis Admin Credentials (Keycloak ROPC via polis-admin client)
	POLIS_ADMIN_CLIENT_SECRET = os.environ.get('POLIS_ADMIN_CLIENT_SECRET', 'polis-admin-secret')
	POLIS_ADMIN_EMAIL = os.environ.get('POLIS_ADMIN_EMAIL', 'polis-admin@candid.dev')
	POLIS_ADMIN_PASSWORD = os.environ.get('POLIS_ADMIN_PASSWORD', 'password')

	# NLP service
	NLP_SERVICE_URL = os.environ.get('NLP_SERVICE_URL', 'http://nlp:5001')
	NLP_SERVICE_TIMEOUT = int(os.environ.get('NLP_SERVICE_TIMEOUT', '10'))

	# Role management
	ROLE_APPROVAL_TIMEOUT_DAYS = int(os.environ.get('ROLE_APPROVAL_TIMEOUT_DAYS', '7'))

class DevelopmentConfig(Config):
	DEV = True

class ProductionConfig(Config):
	DEV = False
