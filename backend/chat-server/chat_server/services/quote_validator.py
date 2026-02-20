"""
Validate quote references in chat messages.

Quote format: [excerpt...](M5) or [excerpt...](M5:25-128) or [excerpt...](S2) or [excerpt...](D1) or [excerpt...](E1)
- M = message reference (1-based sequential index into non-proposal messages)
- S = agreed statement reference (1-based sequential index into accepted positions)
- D = definition reference (1-based sequential index into definitions)
- E = explanation reference (1-based sequential index into explanations)
- Range start-end = character indices into the source's plain text
"""

import re
import logging

logger = logging.getLogger(__name__)

# Matches quote links within message content
QUOTE_LINK_RE = re.compile(
    r'\[([^\]]*)\]\(([MSDE])(\d+)(?::(\d+)-(\d+))?\)'
)


def parse_quotes(content: str) -> list[dict]:
    """
    Parse all quote references from message content.

    Returns a list of dicts with keys:
      - prefix: 'M' or 'S'
      - num: int (1-based index)
      - start: int or None (range start)
      - end: int or None (range end)
      - excerpt: str (the excerpt text in brackets)
    """
    quotes = []
    for match in QUOTE_LINK_RE.finditer(content):
        excerpt, prefix, num_str, start_str, end_str = match.groups()
        quotes.append({
            'prefix': prefix,
            'num': int(num_str),
            'start': int(start_str) if start_str is not None else None,
            'end': int(end_str) if end_str is not None else None,
            'excerpt': excerpt,
        })
    return quotes


def validate_quotes(
    content: str,
    messages: list,
    positions: list,
    definitions: list | None = None,
    explanations: list | None = None,
    message_count: int | None = None,
) -> tuple[bool, str | None]:
    """
    Validate all quote references in a message.

    Args:
        content: The message content to validate.
        messages: List of non-proposal messages in the chat (0-indexed, but
                  quote refs are 1-based: M1 = messages[0]).
                  Can be empty if message_count is provided and no M-reference
                  has a character range.
        positions: List of accepted agreed positions (0-indexed, but
                   quote refs are 1-based: S1 = positions[0]).
        definitions: List of definitions in the chat (0-indexed, but
                     quote refs are 1-based: D1 = definitions[0]).
        explanations: List of explanations in the chat (0-indexed, but
                      quote refs are 1-based: E1 = explanations[0]).
        message_count: Total non-proposal message count (from LLEN).
                       When provided, M-references without ranges are validated
                       via count alone, avoiding loading all messages.

    Returns:
        (valid, error_code) — valid=True if all quotes are valid,
        otherwise error_code is one of:
          INVALID_QUOTE_REF — referenced message/position/definition/explanation doesn't exist
          QUOTE_RANGE_OUT_OF_BOUNDS — range exceeds source text length
          QUOTE_RANGE_INVALID — start >= end or negative values
    """
    quotes = parse_quotes(content)

    if not quotes:
        return True, None

    if definitions is None:
        definitions = []
    if explanations is None:
        explanations = []

    # Determine effective message count
    effective_count = message_count if message_count is not None else len(messages)

    for q in quotes:
        if q['prefix'] == 'M':
            idx = q['num'] - 1
            if idx < 0 or idx >= effective_count:
                logger.debug(
                    f"Invalid quote ref M{q['num']}: only {effective_count} messages"
                )
                return False, 'INVALID_QUOTE_REF'

            # Range validation requires the actual message content
            if q['start'] is not None and q['end'] is not None:
                if idx >= len(messages):
                    # Shouldn't happen — caller should pass messages when ranges exist
                    logger.debug(
                        f"Cannot validate range for M{q['num']}: messages not loaded"
                    )
                    return False, 'INVALID_QUOTE_REF'
                source = messages[idx]
                source_content = (
                    source.get('content', '')
                    if isinstance(source, dict)
                    else getattr(source, 'content', '')
                )
                if q['start'] < 0 or q['end'] < 0:
                    return False, 'QUOTE_RANGE_INVALID'
                if q['start'] >= q['end']:
                    return False, 'QUOTE_RANGE_INVALID'
                if q['end'] > len(source_content):
                    return False, 'QUOTE_RANGE_OUT_OF_BOUNDS'

        elif q['prefix'] == 'S':
            idx = q['num'] - 1
            if idx < 0 or idx >= len(positions):
                logger.debug(
                    f"Invalid quote ref S{q['num']}: only {len(positions)} positions"
                )
                return False, 'INVALID_QUOTE_REF'

            source = positions[idx]
            source_content = (
                source.get('content', '')
                if isinstance(source, dict)
                else getattr(source, 'content', '')
            )

            if q['start'] is not None and q['end'] is not None:
                if q['start'] < 0 or q['end'] < 0:
                    return False, 'QUOTE_RANGE_INVALID'
                if q['start'] >= q['end']:
                    return False, 'QUOTE_RANGE_INVALID'
                if q['end'] > len(source_content):
                    return False, 'QUOTE_RANGE_OUT_OF_BOUNDS'

        elif q['prefix'] == 'D':
            idx = q['num'] - 1
            if idx < 0 or idx >= len(definitions):
                logger.debug(
                    f"Invalid quote ref D{q['num']}: only {len(definitions)} definitions"
                )
                return False, 'INVALID_QUOTE_REF'

            source = definitions[idx]
            source_content = (
                source.get('definition', '')
                if isinstance(source, dict)
                else getattr(source, 'definition', '')
            )

            if q['start'] is not None and q['end'] is not None:
                if q['start'] < 0 or q['end'] < 0:
                    return False, 'QUOTE_RANGE_INVALID'
                if q['start'] >= q['end']:
                    return False, 'QUOTE_RANGE_INVALID'
                if q['end'] > len(source_content):
                    return False, 'QUOTE_RANGE_OUT_OF_BOUNDS'

        elif q['prefix'] == 'E':
            idx = q['num'] - 1
            if idx < 0 or idx >= len(explanations):
                logger.debug(
                    f"Invalid quote ref E{q['num']}: only {len(explanations)} explanations"
                )
                return False, 'INVALID_QUOTE_REF'

            source = explanations[idx]
            source_content = (
                source.get('explanation', '')
                if isinstance(source, dict)
                else getattr(source, 'explanation', '')
            )

            if q['start'] is not None and q['end'] is not None:
                if q['start'] < 0 or q['end'] < 0:
                    return False, 'QUOTE_RANGE_INVALID'
                if q['start'] >= q['end']:
                    return False, 'QUOTE_RANGE_INVALID'
                if q['end'] > len(source_content):
                    return False, 'QUOTE_RANGE_OUT_OF_BOUNDS'

    return True, None
