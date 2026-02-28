"""System prompt templates for AI-guided proposal creation.

Templates are loaded from prompts/proposal_prompts.yaml for easy editing.
The YAML file is the source of truth — edit it to customize AI behavior.
"""

import os
import yaml

_PROMPTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "prompts")
_YAML_PATH = os.path.join(_PROMPTS_DIR, "proposal_prompts.yaml")

_cached_config = None


def _load_config():
    """Load and cache the YAML prompt configuration."""
    global _cached_config
    if _cached_config is None:
        with open(_YAML_PATH, "r") as f:
            _cached_config = yaml.safe_load(f)
    return _cached_config


def reload_config():
    """Force reload of prompt config (e.g., after editing the YAML file)."""
    global _cached_config
    _cached_config = None


def get_prompt(template: str, step: str, context: str = "",
               previous_sections: dict | None = None,
               location_name: str | None = None) -> str:
    """Build a complete system prompt for a proposal wizard step.

    Args:
        template: "issue" or "policy"
        step: Step name (e.g., "description", "stakeholders", "impact",
              "rights", "implementation")
        context: Pre-assembled context string (wiki, glossary, Q&A, expert content)
        previous_sections: Dict of previously completed sections {step_name: content}
        location_name: Full location name (e.g. "Oregon - Multnomah County")

    Returns:
        Formatted system prompt string.

    Raises:
        ValueError: If the template/step combination is not found.
    """
    config = _load_config()

    # Get template text
    template_group = config.get(template)
    if not template_group or not isinstance(template_group, dict):
        raise ValueError(f"Unknown prompt template: {template}/{step}")

    step_template = template_group.get(step)
    if not step_template:
        raise ValueError(f"Unknown prompt template: {template}/{step}")

    preamble = config.get("preamble", "")

    # Format context section
    context_block = ""
    if context:
        context_block = f"## Reference Context\n\n{context}"

    # Format location section
    location_block = ""
    if location_name:
        location_block = (
            f"## Location\n\n"
            f"The user is in **{location_name}**. When suggesting stakeholders, "
            f"agencies, or legal considerations, tailor your suggestions to this "
            f"jurisdiction (e.g., relevant local/state/county agencies, laws, and "
            f"governing bodies)."
        )

    # Format previous sections
    prev_block = ""
    if previous_sections:
        parts = []
        for section_name, section_content in previous_sections.items():
            parts.append(f"### Previous Section: {section_name}\n\n{section_content}")
        prev_block = "## Previously Completed Sections\n\n" + "\n\n".join(parts)

    # Combine preamble + step template with substitutions
    full_prompt = preamble + "\n\n" + step_template.format(
        context=context_block,
        previous_sections=prev_block,
    )

    # Append location after the main template
    if location_block:
        full_prompt += "\n\n" + location_block

    return full_prompt
