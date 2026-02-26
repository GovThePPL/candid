"""Tests for LLM provider abstraction and proposal-assist endpoint."""

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestProposalPrompts:
    """Test proposal prompt template system."""

    def test_get_prompt_issue_description(self):
        from app.proposal_prompts import get_prompt
        prompt = get_prompt("issue", "description", context="Some wiki content")
        assert "Issue Description" in prompt
        assert "Some wiki content" in prompt

    def test_get_prompt_issue_stakeholders(self):
        from app.proposal_prompts import get_prompt
        prompt = get_prompt("issue", "stakeholders")
        assert "Stakeholders" in prompt

    def test_get_prompt_issue_impact(self):
        from app.proposal_prompts import get_prompt
        prompt = get_prompt("issue", "impact")
        assert "Impact" in prompt

    def test_get_prompt_policy_description(self):
        from app.proposal_prompts import get_prompt
        prompt = get_prompt("policy", "description")
        assert "Policy Proposal" in prompt

    def test_get_prompt_policy_rights(self):
        from app.proposal_prompts import get_prompt
        prompt = get_prompt("policy", "rights")
        assert "Rights" in prompt

    def test_get_prompt_policy_implementation(self):
        from app.proposal_prompts import get_prompt
        prompt = get_prompt("policy", "implementation")
        assert "Implementation" in prompt

    def test_get_prompt_invalid_template(self):
        from app.proposal_prompts import get_prompt
        with pytest.raises(ValueError, match="Unknown prompt template"):
            get_prompt("invalid", "description")

    def test_get_prompt_invalid_step(self):
        from app.proposal_prompts import get_prompt
        with pytest.raises(ValueError, match="Unknown prompt template"):
            get_prompt("issue", "invalid_step")

    def test_previous_sections_included(self):
        from app.proposal_prompts import get_prompt
        prompt = get_prompt(
            "issue", "stakeholders",
            previous_sections={"description": "Homelessness in Portland is a growing issue."},
        )
        assert "Homelessness in Portland" in prompt
        assert "Previously Completed" in prompt

    def test_context_included(self):
        from app.proposal_prompts import get_prompt
        prompt = get_prompt("issue", "description", context="Wiki: Housing policy overview")
        assert "Housing policy overview" in prompt
        assert "Reference Context" in prompt

    def test_empty_context_no_header(self):
        from app.proposal_prompts import get_prompt
        prompt = get_prompt("issue", "description", context="")
        assert "Reference Context" not in prompt


class TestProviderFactory:
    """Test LLM provider factory."""

    def test_create_anthropic_provider(self):
        from app.llm_providers.factory import create_provider, reset_provider
        reset_provider()
        with patch.dict(os.environ, {"LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "test-key"}):
            provider = create_provider()
            assert provider.__class__.__name__ == "AnthropicProvider"
        reset_provider()

    def test_create_openai_provider(self):
        from app.llm_providers.factory import create_provider, reset_provider
        reset_provider()
        with patch.dict(os.environ, {"LLM_PROVIDER": "openai", "OPENAI_API_KEY": "test-key"}):
            provider = create_provider()
            assert provider.__class__.__name__ == "OpenAIProvider"
        reset_provider()

    def test_unknown_provider_raises(self):
        from app.llm_providers.factory import create_provider, reset_provider
        reset_provider()
        with patch.dict(os.environ, {"LLM_PROVIDER": "unknown"}):
            with pytest.raises(ValueError, match="Unknown LLM provider"):
                create_provider()
        reset_provider()

    def test_missing_anthropic_key_raises(self):
        from app.llm_providers.factory import create_provider, reset_provider
        reset_provider()
        with patch.dict(os.environ, {"LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": ""}):
            with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
                create_provider()
        reset_provider()

    def test_missing_openai_key_raises(self):
        from app.llm_providers.factory import create_provider, reset_provider
        reset_provider()
        with patch.dict(os.environ, {"LLM_PROVIDER": "openai", "OPENAI_API_KEY": ""}):
            with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
                create_provider()
        reset_provider()

    def test_get_provider_singleton(self):
        from app.llm_providers.factory import get_provider, reset_provider
        reset_provider()
        with patch.dict(os.environ, {"LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "test-key"}):
            p1 = get_provider()
            p2 = get_provider()
            assert p1 is p2
        reset_provider()


class TestProposalAssistEndpoint:
    """Test POST /llm/proposal-assist endpoint."""

    def test_no_provider_configured_returns_503(self, app_client):
        with patch.dict(os.environ, {"LLM_PROVIDER": "", "ANTHROPIC_API_KEY": "", "OPENAI_API_KEY": ""}, clear=False):
            resp = app_client.post("/llm/proposal-assist", json={
                "template": "issue",
                "step": "description",
                "user_input": "Homelessness in Portland",
            })
            assert resp.status_code == 503

    def test_invalid_template_returns_400(self, app_client):
        with patch.dict(os.environ, {"LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "key"}, clear=False):
            resp = app_client.post("/llm/proposal-assist", json={
                "template": "invalid",
                "step": "description",
                "user_input": "Some input",
            })
            assert resp.status_code == 400

    def test_success_returns_content(self, app_client):
        mock_provider = MagicMock()
        mock_provider.generate = AsyncMock(return_value="Enhanced proposal content")

        with patch.dict(os.environ, {"LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "key"}, clear=False):
            with patch("app.llm_providers.factory.get_provider", return_value=mock_provider):
                with patch("app.llm_providers.get_provider", return_value=mock_provider):
                    resp = app_client.post("/llm/proposal-assist", json={
                        "template": "issue",
                        "step": "description",
                        "user_input": "Homelessness in Portland is a serious problem.",
                        "context": "Wiki content about housing",
                    })
                    assert resp.status_code == 200
                    data = resp.json()
                    assert data["content"] == "Enhanced proposal content"

    def test_llm_error_returns_500(self, app_client):
        mock_provider = MagicMock()
        mock_provider.generate = AsyncMock(side_effect=RuntimeError("API timeout"))

        with patch.dict(os.environ, {"LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "key"}, clear=False):
            with patch("app.llm_providers.factory.get_provider", return_value=mock_provider):
                with patch("app.llm_providers.get_provider", return_value=mock_provider):
                    resp = app_client.post("/llm/proposal-assist", json={
                        "template": "issue",
                        "step": "description",
                        "user_input": "Some content",
                    })
                    assert resp.status_code == 500

    def test_with_previous_sections(self, app_client):
        mock_provider = MagicMock()
        mock_provider.generate = AsyncMock(return_value="Stakeholder analysis")

        with patch.dict(os.environ, {"LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "key"}, clear=False):
            with patch("app.llm_providers.factory.get_provider", return_value=mock_provider):
                with patch("app.llm_providers.get_provider", return_value=mock_provider):
                    resp = app_client.post("/llm/proposal-assist", json={
                        "template": "issue",
                        "step": "stakeholders",
                        "user_input": "I think the city council is involved",
                        "previous_sections": {"description": "Homelessness in Portland"},
                    })
                    assert resp.status_code == 200
                    # Verify the provider was called with system prompt containing previous sections
                    call_args = mock_provider.generate.call_args
                    system_prompt = call_args.kwargs.get("system_prompt", "")
                    assert "Previously Completed" in system_prompt
