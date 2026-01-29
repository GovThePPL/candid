import os
import atexit

from candid.controllers.helpers.database import Database
from candid.controllers.helpers import config as cfg

flask_env = os.environ.get('FLASK_ENV')
config = None
if flask_env == 'dev':
    config = cfg.DevelopmentConfig()
else:
    config = cfg.ProductionConfig()

db = Database(config)

# Start Polis sync worker if enabled
if config.POLIS_ENABLED:
    from candid.controllers.helpers.polis_worker import start_worker, stop_worker
    start_worker()
    atexit.register(stop_worker)