import os

from candid.controllers.helpers import database as db
from candid.controllers.helpers import config as cfg

flask_env = os.environ.get('FLASK_ENV')
config = None
if flask_env == 'dev':
    config = cfg.DevelopmentConfig()
else:
    config = cfg.ProductionConfig()

db.connect_to_db(config)