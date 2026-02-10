"""Unit tests for config.py — configuration classes.

NOTE: We intentionally do NOT test individual config defaults (e.g.,
"REDIS_URL contains redis://", "POLIS_TIMEOUT is int"). Those tests verify
os.getenv returns a constant — testing Python stdlib, not our logic.
Only the env-var override path and class hierarchy have real value here.
"""

import os
import pytest
from unittest.mock import patch

pytestmark = pytest.mark.unit


class TestConfig:
    def test_env_var_override(self):
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://custom:5432/db"}):
            # Need to reimport to trigger os.environ.get at class level
            import importlib
            from candid.controllers.helpers import config
            importlib.reload(config)
            assert config.Config.SQLALCHEMY_DATABASE_URI == "postgresql://custom:5432/db"
            # Restore
            importlib.reload(config)

    def test_getitem(self):
        from candid.controllers.helpers.config import Config
        c = Config()
        assert c["REDIS_URL"] == Config.REDIS_URL


class TestDevelopmentConfig:
    def test_dev_true(self):
        from candid.controllers.helpers.config import DevelopmentConfig
        assert DevelopmentConfig.DEV is True

    def test_inherits_config(self):
        from candid.controllers.helpers.config import DevelopmentConfig
        assert hasattr(DevelopmentConfig, "SQLALCHEMY_DATABASE_URI")


class TestProductionConfig:
    def test_dev_false(self):
        from candid.controllers.helpers.config import ProductionConfig
        assert ProductionConfig.DEV is False
