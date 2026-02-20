"""Tests for quote_validator service.

Uses importlib to avoid triggering the services __init__.py (which requires aiohttp).
"""

import importlib
import sys
from pathlib import Path

import pytest

# Import the module directly without going through services/__init__.py
_module_path = Path(__file__).resolve().parent.parent / "services" / "quote_validator.py"
_spec = importlib.util.spec_from_file_location("quote_validator", _module_path)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)

parse_quotes = _module.parse_quotes
validate_quotes = _module.validate_quotes


class TestParseQuotes:
    """Tests for parse_quotes()."""

    def test_no_quotes(self):
        assert parse_quotes("Hello, world!") == []

    def test_full_message_quote(self):
        result = parse_quotes("[some text](M5)")
        assert len(result) == 1
        assert result[0] == {
            'prefix': 'M', 'num': 5,
            'start': None, 'end': None,
            'excerpt': 'some text',
        }

    def test_ranged_message_quote(self):
        result = parse_quotes("[excerpt...](M5:25-128)")
        assert len(result) == 1
        assert result[0] == {
            'prefix': 'M', 'num': 5,
            'start': 25, 'end': 128,
            'excerpt': 'excerpt...',
        }

    def test_statement_quote(self):
        result = parse_quotes("[agreed text](S2)")
        assert len(result) == 1
        assert result[0]['prefix'] == 'S'
        assert result[0]['num'] == 2

    def test_multiple_quotes(self):
        content = "[first](M1)\nSome text\n[second](S3:0-50)"
        result = parse_quotes(content)
        assert len(result) == 2
        assert result[0]['prefix'] == 'M'
        assert result[1]['prefix'] == 'S'
        assert result[1]['start'] == 0
        assert result[1]['end'] == 50

    def test_definition_quote(self):
        result = parse_quotes("[freedom means...](D1)")
        assert len(result) == 1
        assert result[0]['prefix'] == 'D'
        assert result[0]['num'] == 1

    def test_no_match_for_invalid_format(self):
        assert parse_quotes("[text](X5)") == []
        assert parse_quotes("[text](M)") == []
        assert parse_quotes("(M5)") == []

    def test_inline_quote_in_text(self):
        content = "I agree with [this point](M3) and also [that](S1)"
        result = parse_quotes(content)
        assert len(result) == 2


class TestValidateQuotes:
    """Tests for validate_quotes()."""

    def _make_messages(self, count, content_len=100):
        return [
            {'content': 'x' * content_len, 'sender_id': f'user{i}'}
            for i in range(count)
        ]

    def _make_positions(self, count, content_len=100):
        return [
            {'content': 'p' * content_len, 'proposer_id': f'user{i}', 'status': 'accepted'}
            for i in range(count)
        ]

    def test_no_quotes_is_valid(self):
        valid, err = validate_quotes("Hello", [], [])
        assert valid is True
        assert err is None

    def test_valid_full_message_quote(self):
        msgs = self._make_messages(5)
        valid, err = validate_quotes("[text](M3)", msgs, [])
        assert valid is True

    def test_valid_ranged_message_quote(self):
        msgs = self._make_messages(5, content_len=200)
        valid, err = validate_quotes("[text](M1:10-50)", msgs, [])
        assert valid is True

    def test_valid_statement_quote(self):
        positions = self._make_positions(3)
        valid, err = validate_quotes("[text](S2)", [], positions)
        assert valid is True

    def test_invalid_message_ref_out_of_range(self):
        msgs = self._make_messages(3)
        valid, err = validate_quotes("[text](M5)", msgs, [])
        assert valid is False
        assert err == 'INVALID_QUOTE_REF'

    def test_invalid_statement_ref_out_of_range(self):
        positions = self._make_positions(2)
        valid, err = validate_quotes("[text](S5)", [], positions)
        assert valid is False
        assert err == 'INVALID_QUOTE_REF'

    def test_invalid_message_ref_zero(self):
        msgs = self._make_messages(3)
        valid, err = validate_quotes("[text](M0)", msgs, [])
        assert valid is False
        assert err == 'INVALID_QUOTE_REF'

    def test_range_out_of_bounds(self):
        msgs = self._make_messages(3, content_len=50)
        valid, err = validate_quotes("[text](M1:0-100)", msgs, [])
        assert valid is False
        assert err == 'QUOTE_RANGE_OUT_OF_BOUNDS'

    def test_range_invalid_start_gte_end(self):
        msgs = self._make_messages(3, content_len=100)
        valid, err = validate_quotes("[text](M1:50-50)", msgs, [])
        assert valid is False
        assert err == 'QUOTE_RANGE_INVALID'

    def test_range_invalid_start_gt_end(self):
        msgs = self._make_messages(3, content_len=100)
        valid, err = validate_quotes("[text](M1:60-50)", msgs, [])
        assert valid is False
        assert err == 'QUOTE_RANGE_INVALID'

    def test_multiple_valid_quotes(self):
        msgs = self._make_messages(5)
        positions = self._make_positions(3)
        content = "[a](M1)\n[b](M3)\n[c](S2)"
        valid, err = validate_quotes(content, msgs, positions)
        assert valid is True

    def test_mixed_valid_and_invalid(self):
        msgs = self._make_messages(3)
        content = "[a](M1)\n[b](M10)"
        valid, err = validate_quotes(content, msgs, [])
        assert valid is False
        assert err == 'INVALID_QUOTE_REF'

    def test_works_with_objects_having_content_attr(self):
        """Test with objects that have .content attribute instead of dict."""
        class Msg:
            def __init__(self, content):
                self.content = content

        msgs = [Msg('x' * 100) for _ in range(3)]
        valid, err = validate_quotes("[text](M2:0-50)", msgs, [])
        assert valid is True

    def test_statement_range_out_of_bounds(self):
        positions = self._make_positions(2, content_len=30)
        valid, err = validate_quotes("[text](S1:0-50)", [], positions)
        assert valid is False
        assert err == 'QUOTE_RANGE_OUT_OF_BOUNDS'

    # --- Definition (D-prefix) tests ---

    def _make_definitions(self, count, definition_len=100):
        return [
            {'definition': 'd' * definition_len, 'definer_id': f'user{i}', 'term': f'term{i}'}
            for i in range(count)
        ]

    def test_valid_definition_quote(self):
        defs = self._make_definitions(3)
        valid, err = validate_quotes("[text](D2)", [], [], defs)
        assert valid is True

    def test_invalid_definition_ref_out_of_range(self):
        defs = self._make_definitions(2)
        valid, err = validate_quotes("[text](D5)", [], [], defs)
        assert valid is False
        assert err == 'INVALID_QUOTE_REF'

    def test_definition_range_validation(self):
        defs = self._make_definitions(2, definition_len=50)
        valid, err = validate_quotes("[text](D1:0-100)", [], [], defs)
        assert valid is False
        assert err == 'QUOTE_RANGE_OUT_OF_BOUNDS'

    def test_definition_range_valid(self):
        defs = self._make_definitions(2, definition_len=100)
        valid, err = validate_quotes("[text](D1:10-50)", [], [], defs)
        assert valid is True

    def test_definition_with_object_attr(self):
        """Test with objects that have .definition attribute."""
        class Def:
            def __init__(self, definition):
                self.definition = definition

        defs = [Def('d' * 100) for _ in range(3)]
        valid, err = validate_quotes("[text](D2:0-50)", [], [], defs)
        assert valid is True

    def test_definitions_defaults_to_empty(self):
        """Without definitions param, D-refs should fail."""
        valid, err = validate_quotes("[text](D1)", [], [])
        assert valid is False
        assert err == 'INVALID_QUOTE_REF'

    def test_mixed_msd_quotes(self):
        msgs = self._make_messages(5)
        positions = self._make_positions(2)
        defs = self._make_definitions(3)
        content = "[a](M1)\n[b](S2)\n[c](D3)"
        valid, err = validate_quotes(content, msgs, positions, defs)
        assert valid is True

    # --- Explanation (E-prefix) tests ---

    def _make_explanations(self, count, explanation_len=100):
        return [
            {'explanation': 'e' * explanation_len, 'explainer_id': f'user{i}', 'position': f'position{i}'}
            for i in range(count)
        ]

    def test_valid_explanation_quote(self):
        expls = self._make_explanations(3)
        valid, err = validate_quotes("[text](E2)", [], [], None, expls)
        assert valid is True

    def test_invalid_explanation_ref_out_of_range(self):
        expls = self._make_explanations(2)
        valid, err = validate_quotes("[text](E5)", [], [], None, expls)
        assert valid is False
        assert err == 'INVALID_QUOTE_REF'

    def test_explanation_range_validation(self):
        expls = self._make_explanations(2, explanation_len=50)
        valid, err = validate_quotes("[text](E1:0-100)", [], [], None, expls)
        assert valid is False
        assert err == 'QUOTE_RANGE_OUT_OF_BOUNDS'

    def test_explanation_range_valid(self):
        expls = self._make_explanations(2, explanation_len=100)
        valid, err = validate_quotes("[text](E1:10-50)", [], [], None, expls)
        assert valid is True

    def test_explanation_with_object_attr(self):
        """Test with objects that have .explanation attribute."""
        class Expl:
            def __init__(self, explanation):
                self.explanation = explanation

        expls = [Expl('e' * 100) for _ in range(3)]
        valid, err = validate_quotes("[text](E2:0-50)", [], [], None, expls)
        assert valid is True

    def test_explanations_defaults_to_empty(self):
        """Without explanations param, E-refs should fail."""
        valid, err = validate_quotes("[text](E1)", [], [])
        assert valid is False
        assert err == 'INVALID_QUOTE_REF'

    def test_mixed_msde_quotes(self):
        msgs = self._make_messages(5)
        positions = self._make_positions(2)
        defs = self._make_definitions(3)
        expls = self._make_explanations(2)
        content = "[a](M1)\n[b](S2)\n[c](D3)\n[d](E1)"
        valid, err = validate_quotes(content, msgs, positions, defs, expls)
        assert valid is True

    # --- message_count parameter tests ---

    def test_count_based_m_ref_valid(self):
        """M-ref without range validated by count alone (no messages needed)."""
        valid, err = validate_quotes("[text](M3)", [], [], message_count=5)
        assert valid is True

    def test_count_based_m_ref_out_of_range(self):
        """M-ref exceeding count is invalid."""
        valid, err = validate_quotes("[text](M6)", [], [], message_count=5)
        assert valid is False
        assert err == 'INVALID_QUOTE_REF'

    def test_count_based_m_ref_zero(self):
        """M0 is invalid regardless of count."""
        valid, err = validate_quotes("[text](M0)", [], [], message_count=10)
        assert valid is False
        assert err == 'INVALID_QUOTE_REF'

    def test_count_based_with_range_needs_messages(self):
        """M-ref with range still needs actual messages for content validation."""
        msgs = self._make_messages(5, content_len=100)
        valid, err = validate_quotes("[text](M3:10-50)", msgs, [], message_count=5)
        assert valid is True

    def test_count_based_mixed_with_s_ref(self):
        """Count-based M-ref works alongside S-refs."""
        positions = self._make_positions(3)
        valid, err = validate_quotes(
            "[a](M2)\n[b](S1)", [], positions, message_count=5,
        )
        assert valid is True
