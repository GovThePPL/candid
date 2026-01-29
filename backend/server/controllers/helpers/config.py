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
	