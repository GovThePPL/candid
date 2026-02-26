"""Unit tests for proposal_context helper."""

from unittest.mock import patch, MagicMock

import pytest


@pytest.fixture
def mock_db():
    """Mock the database module."""
    with patch("candid.controllers.helpers.proposal_context.db") as m:
        yield m


class TestGatherProposalContext:
    """Test gather_proposal_context()."""

    def test_returns_empty_for_missing_session(self, mock_db):
        from candid.controllers.helpers.proposal_context import gather_proposal_context
        mock_db.execute_query.return_value = None
        assert gather_proposal_context("no-such-id") == ""

    def test_includes_session_description(self, mock_db):
        from candid.controllers.helpers.proposal_context import gather_proposal_context
        session_row = {
            "id": "s1", "label": "Housing Policy", "description": "Discuss housing",
            "location_id": "loc1",
        }
        mock_db.execute_query.side_effect = [
            session_row,  # session lookup
            [],           # wiki
            [],           # glossary
            [],           # Q&A
            [],           # expert
        ]
        ctx = gather_proposal_context("s1")
        assert "Housing Policy" in ctx
        assert "Discuss housing" in ctx

    def test_includes_wiki_pages(self, mock_db):
        from candid.controllers.helpers.proposal_context import gather_proposal_context
        session_row = {
            "id": "s1", "label": "Test", "description": None, "location_id": "loc1",
        }
        wiki_rows = [
            {"title": "Zoning Laws", "content": "Zoning overview content"},
        ]
        mock_db.execute_query.side_effect = [
            session_row,
            wiki_rows,
            [],  # glossary
            [],  # Q&A
            [],  # expert
        ]
        ctx = gather_proposal_context("s1")
        assert "Zoning Laws" in ctx
        assert "Zoning overview content" in ctx

    def test_includes_glossary_terms(self, mock_db):
        from candid.controllers.helpers.proposal_context import gather_proposal_context
        session_row = {
            "id": "s1", "label": "Test", "description": None, "location_id": "loc1",
        }
        glossary_rows = [
            {"term": "Eminent Domain", "definition": "Government taking property"},
        ]
        mock_db.execute_query.side_effect = [
            session_row,
            [],            # wiki
            glossary_rows,
            [],            # Q&A
            [],            # expert
        ]
        ctx = gather_proposal_context("s1")
        assert "Eminent Domain" in ctx
        assert "Government taking property" in ctx

    def test_includes_qa_posts(self, mock_db):
        from candid.controllers.helpers.proposal_context import gather_proposal_context
        session_row = {
            "id": "s1", "label": "Test", "description": None, "location_id": "loc1",
        }
        qa_rows = [
            {"title": "How does rent control work?", "body": "Rent control caps rent increases."},
        ]
        mock_db.execute_query.side_effect = [
            session_row,
            [],       # wiki
            [],       # glossary
            qa_rows,
            [],       # expert
        ]
        ctx = gather_proposal_context("s1")
        assert "rent control" in ctx.lower()

    def test_includes_expert_content(self, mock_db):
        from candid.controllers.helpers.proposal_context import gather_proposal_context
        session_row = {
            "id": "s1", "label": "Test", "description": None, "location_id": "loc1",
        }
        expert_rows = [
            {"title": "Expert Analysis", "body": "This is expert analysis.",
             "display_name": "Dr. Smith", "role": "expert"},
        ]
        mock_db.execute_query.side_effect = [
            session_row,
            [],           # wiki
            [],           # glossary
            [],           # Q&A
            expert_rows,
        ]
        ctx = gather_proposal_context("s1")
        assert "Expert Analysis" in ctx
        assert "Dr. Smith" in ctx

    def test_truncates_long_context(self, mock_db):
        from candid.controllers.helpers.proposal_context import (
            gather_proposal_context, MAX_CONTEXT_CHARS,
        )
        session_row = {
            "id": "s1", "label": "Test", "description": "x" * 10000,
            "location_id": "loc1",
        }
        mock_db.execute_query.side_effect = [
            session_row,
            [],  # wiki
            [],  # glossary
            [],  # Q&A
            [],  # expert
        ]
        ctx = gather_proposal_context("s1")
        assert len(ctx) <= MAX_CONTEXT_CHARS + 50  # allow for truncation marker
        assert "[Context truncated]" in ctx
