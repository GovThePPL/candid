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
atexit.register(db.close_db_connection)

# Start Polis sync worker if enabled
if config.POLIS_ENABLED:
    from candid.controllers.helpers.polis_worker import start_worker, stop_worker
    start_worker()
    atexit.register(stop_worker)

# Start MF training worker if enabled
if config.MF_ENABLED:
    from candid.controllers.helpers.mf_worker import start_worker as start_mf_worker, \
        stop_worker as stop_mf_worker
    start_mf_worker()
    atexit.register(stop_mf_worker)

# Start approval reminder worker if enabled
if config.APPROVAL_REMINDER_ENABLED:
    from candid.controllers.helpers.approval_reminder_worker import \
        start_worker as start_reminder, stop_worker as stop_reminder
    start_reminder()
    atexit.register(stop_reminder)

# Start avatar NSFW worker if enabled
if config.AVATAR_NSFW_ENABLED:
    from candid.controllers.helpers.avatar_nsfw_worker import \
        start_worker as start_avatar_nsfw, stop_worker as stop_avatar_nsfw
    start_avatar_nsfw()
    atexit.register(stop_avatar_nsfw)