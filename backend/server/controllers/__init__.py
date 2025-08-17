import os

from candid.controllers.helpers.database import Database
from candid.controllers.helpers import config as cfg

flask_env = os.environ.get('FLASK_ENV')
config = None
if flask_env == 'dev':
    config = cfg.DevelopmentConfig()
else:
    config = cfg.ProductionConfig()

db = Database(config)