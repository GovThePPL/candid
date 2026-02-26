"""
Seed data loading: reads session JSON files and expands them via the template engine.
"""

import json
import os
from .content_generator import expand_session

SESSIONS_DIR = os.path.join(os.path.dirname(__file__), "sessions")


def load_session_json(filename):
    """Load a single session JSON file."""
    filepath = os.path.join(SESSIONS_DIR, filename)
    with open(filepath, "r") as f:
        return json.load(f)


def load_all_sessions():
    """Load and expand all session JSON files.

    Returns: {
        "positions": [...],   # all positions across all sessions
        "posts": [...],       # all posts across all sessions
        "surveys": [...],     # all surveys across all sessions
    }
    """
    all_positions = []
    all_posts = []
    all_surveys = []

    files = sorted(f for f in os.listdir(SESSIONS_DIR) if f.endswith(".json"))
    for filename in files:
        session_data = load_session_json(filename)
        expanded = expand_session(session_data)
        all_positions.extend(expanded["positions"])
        all_posts.extend(expanded["posts"])
        all_surveys.extend(expanded["surveys"])

    return {
        "positions": all_positions,
        "posts": all_posts,
        "surveys": all_surveys,
    }
