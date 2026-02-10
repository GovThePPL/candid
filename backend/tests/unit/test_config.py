"""Unit tests for config.py — configuration classes."""

import os
import pytest
from unittest.mock import patch

pytestmark = pytest.mark.unit


class TestConfig:
    def test_default_database_url(self):
        with patch.dict(os.environ, {}, clear=False):
            # Re-import to pick up defaults
            from candid.controllers.helpers.config import Config
            assert "postgresql://" in Config.SQLALCHEMY_DATABASE_URI

    def test_default_redis_url(self):
        from candid.controllers.helpers.config import Config
        assert "redis://" in Config.REDIS_URL

    def test_default_keycloak_url(self):
        from candid.controllers.helpers.config import Config
        assert "8180" in Config.KEYCLOAK_URL

    def test_polis_enabled_reads_env(self):
        """POLIS_ENABLED is set to false by conftest to prevent worker startup."""
        from candid.controllers.helpers.config import Config
        # Value comes from os.environ; conftest sets it to 'false'
        assert isinstance(Config.POLIS_ENABLED, bool)

    def test_polis_timeout_is_int(self):
        from candid.controllers.helpers.config import Config
        assert isinstance(Config.POLIS_TIMEOUT, int)

    def test_cors_origins_is_list(self):
        from candid.controllers.helpers.config import Config
        assert isinstance(Config.CORS_ORIGINS, list)

    def test_nlp_service_defaults(self):
        from candid.controllers.helpers.config import Config
        assert "nlp" in Config.NLP_SERVICE_URL
        assert isinstance(Config.NLP_SERVICE_TIMEOUT, int)

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
