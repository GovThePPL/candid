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

    def test_warns_when_cors_origins_not_set(self):
        from candid.controllers.helpers.config import ProductionConfig
        import logging
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('CORS_ORIGINS', None)
            with patch('candid.controllers.helpers.config.logger') as mock_logger:
                ProductionConfig()
                cors_calls = [
                    c for c in mock_logger.critical.call_args_list
                    if 'CORS_ORIGINS' in str(c)
                ]
                assert len(cors_calls) == 1

    def test_no_cors_warning_when_set(self):
        from candid.controllers.helpers.config import ProductionConfig
        with patch.dict(os.environ, {'CORS_ORIGINS': 'https://app.example.com'}):
            with patch('candid.controllers.helpers.config.logger') as mock_logger:
                ProductionConfig()
                cors_calls = [
                    c for c in mock_logger.critical.call_args_list
                    if 'CORS_ORIGINS' in str(c)
                ]
                assert len(cors_calls) == 0

    def test_warns_when_polis_public_url_is_localhost(self):
        from candid.controllers.helpers.config import ProductionConfig
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('POLIS_PUBLIC_URL', None)
            with patch('candid.controllers.helpers.config.logger') as mock_logger:
                ProductionConfig()
                polis_calls = [
                    c for c in mock_logger.critical.call_args_list
                    if 'POLIS_PUBLIC_URL' in str(c)
                ]
                assert len(polis_calls) == 1

    def test_no_polis_warning_when_set(self):
        from candid.controllers.helpers.config import ProductionConfig
        import importlib
        from candid.controllers.helpers import config
        with patch.dict(os.environ, {'POLIS_PUBLIC_URL': 'https://polis.example.com'}):
            importlib.reload(config)
            with patch('candid.controllers.helpers.config.logger') as mock_logger:
                config.ProductionConfig()
                polis_calls = [
                    c for c in mock_logger.critical.call_args_list
                    if 'POLIS_PUBLIC_URL' in str(c)
                ]
                assert len(polis_calls) == 0
            importlib.reload(config)
