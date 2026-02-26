"""
Template engine: expand session JSON + templates into posts, comments, positions.

Given a session JSON with anchor content and generation directives, produces
complete lists of positions, posts, and comments for all active stages.
"""

import random
from .templates.post_templates import POST_TEMPLATES
from .templates.comment_templates import COMMENT_TEMPLATES, PREFIX_TO_BELIEF
from .templates.position_templates import VOTE_PATTERNS, STATEMENT_TEMPLATES


def _fill_template(template_str, vocab):
    """Fill a template string with vocabulary, picking random choices for lists."""
    result = template_str
    for key, value in vocab.items():
        placeholder = "{" + key + "}"
        if placeholder in result:
            if isinstance(value, list):
                result = result.replace(placeholder, random.choice(value), 1)
                # Replace remaining occurrences with potentially different choices
                while placeholder in result:
                    result = result.replace(placeholder, random.choice(value), 1)
            else:
                result = result.replace(placeholder, str(value))
    return result


def _pick_comment_stance(author_belief, post_lean):
    """Pick a stance (supportive/opposing/nuanced) based on ideology alignment."""
    # Map beliefs to a left-right score
    BELIEF_SCORE = {
        "progressive": -1.0, "liberal": -0.7, "social_democrat": -0.6,
        "socialist": -0.9, "moderate": 0.0, "centrist": 0.1,
        "libertarian": 0.5, "conservative": 0.8, "populist": 0.9,
        "traditionalist": 1.0,
    }
    author_score = BELIEF_SCORE.get(author_belief, 0.0)

    # post_lean: "left", "right", "center", or numeric
    if isinstance(post_lean, str):
        lean_map = {"left": -0.7, "center_left": -0.3, "center": 0.0,
                    "center_right": 0.3, "right": 0.7}
        post_score = lean_map.get(post_lean, 0.0)
    else:
        post_score = float(post_lean)

    diff = abs(author_score - post_score)
    if diff < 0.5:
        return random.choices(["supportive", "nuanced", "opposing"],
                              weights=[0.6, 0.3, 0.1])[0]
    elif diff < 1.2:
        return random.choices(["supportive", "nuanced", "opposing"],
                              weights=[0.2, 0.5, 0.3])[0]
    else:
        return random.choices(["supportive", "nuanced", "opposing"],
                              weights=[0.1, 0.2, 0.7])[0]


def generate_comment_body(belief, stance, vocab):
    """Generate a single comment body from templates."""
    templates = COMMENT_TEMPLATES.get(belief, {}).get(stance, [])
    if not templates:
        # Fallback: use moderate templates
        templates = COMMENT_TEMPLATES.get("moderate", {}).get(stance, [])
    if not templates:
        return f"I have thoughts about this topic."
    template = random.choice(templates)
    return _fill_template(template, vocab)


def generate_comment_tree(n_comments, vocab, post_lean="center"):
    """Generate a comment tree with realistic structure.

    Returns list of comment dicts: {body, author_prefix, replies: [...]}

    Distribution: 60% top-level, 30% replies to top-level, 10% depth-2
    """
    if n_comments <= 0:
        return []

    # Belief systems to draw from, weighted toward diversity
    all_beliefs = list(PREFIX_TO_BELIEF.keys())
    belief_weights = [1.0] * len(all_beliefs)  # uniform

    # Decide structure
    n_top = max(1, int(n_comments * 0.6))
    n_reply = int(n_comments * 0.3)
    n_deep = n_comments - n_top - n_reply

    top_level = []
    for _ in range(n_top):
        prefix = random.choices(all_beliefs, weights=belief_weights)[0]
        belief = PREFIX_TO_BELIEF[prefix]
        stance = _pick_comment_stance(belief, post_lean)
        body = generate_comment_body(belief, stance, vocab)
        top_level.append({"body": body, "author_prefix": prefix, "replies": []})

    # Add replies to top-level comments
    for _ in range(n_reply):
        if not top_level:
            break
        parent = random.choice(top_level)
        prefix = random.choices(all_beliefs, weights=belief_weights)[0]
        belief = PREFIX_TO_BELIEF[prefix]
        # Replies tend to engage with the parent's ideology
        parent_belief = PREFIX_TO_BELIEF.get(parent["author_prefix"], "moderate")
        parent_score = {"progressive": -1.0, "liberal": -0.7, "social_democrat": -0.6,
                        "socialist": -0.9, "moderate": 0.0, "centrist": 0.1,
                        "libertarian": 0.5, "conservative": 0.8, "populist": 0.9,
                        "traditionalist": 1.0}.get(parent_belief, 0.0)
        stance = _pick_comment_stance(belief, parent_score)
        body = generate_comment_body(belief, stance, vocab)
        parent["replies"].append({"body": body, "author_prefix": prefix, "replies": []})

    # Add depth-2 replies
    for _ in range(n_deep):
        parents_with_replies = [t for t in top_level if t["replies"]]
        if not parents_with_replies:
            # Fall back to adding as top-level reply
            if top_level:
                parent = random.choice(top_level)
                prefix = random.choices(all_beliefs, weights=belief_weights)[0]
                belief = PREFIX_TO_BELIEF[prefix]
                stance = _pick_comment_stance(belief, post_lean)
                body = generate_comment_body(belief, stance, vocab)
                parent["replies"].append({"body": body, "author_prefix": prefix, "replies": []})
            continue
        parent = random.choice(parents_with_replies)
        reply = random.choice(parent["replies"])
        prefix = random.choices(all_beliefs, weights=belief_weights)[0]
        belief = PREFIX_TO_BELIEF[prefix]
        reply_belief = PREFIX_TO_BELIEF.get(reply["author_prefix"], "moderate")
        reply_score = {"progressive": -1.0, "liberal": -0.7, "social_democrat": -0.6,
                       "socialist": -0.9, "moderate": 0.0, "centrist": 0.1,
                       "libertarian": 0.5, "conservative": 0.8, "populist": 0.9,
                       "traditionalist": 1.0}.get(reply_belief, 0.0)
        stance = _pick_comment_stance(belief, reply_score)
        body = generate_comment_body(belief, stance, vocab)
        reply["replies"].append({"body": body, "author_prefix": prefix})

    return top_level


PROPOSAL_POST_STAGES = {"proposal_qualify", "opinion_proposals"}


def generate_posts_for_stage(stage, gen_config, vocab):
    """Generate posts for a stage based on generation config.

    gen_config: {
        "generated_count": 8,
        "generated_types": {"discussion": 5, "question": 2, "proposal": 1},
        "comments_per_generated": [5, 4, 6, 5, 4, 5, 6, 5]
    }
    """
    stage_templates = POST_TEMPLATES.get(stage, {})
    if not stage_templates:
        return []

    # Build type list from generated_types
    type_list = []
    gen_types = gen_config.get("generated_types", {"discussion": gen_config.get("generated_count", 8)})
    for post_type, count in gen_types.items():
        # Proposal posts are only allowed in specific stages
        if post_type == "proposal" and stage not in PROPOSAL_POST_STAGES:
            post_type = "discussion"
        type_list.extend([post_type] * count)

    # Pad or trim to match generated_count
    gen_count = gen_config.get("generated_count", len(type_list))
    while len(type_list) < gen_count:
        type_list.append("discussion")
    type_list = type_list[:gen_count]
    random.shuffle(type_list)

    comments_per = gen_config.get("comments_per_generated", [])

    posts = []
    used_templates = set()
    for i, post_type in enumerate(type_list):
        type_templates = stage_templates.get(post_type, stage_templates.get("discussion", []))
        if not type_templates:
            continue

        # Pick unused template
        available = [t for j, t in enumerate(type_templates) if j not in used_templates]
        if not available:
            available = type_templates
            used_templates.clear()
        template = random.choice(available)
        used_templates.add(type_templates.index(template))

        title = _fill_template(template["title"], vocab)
        body = _fill_template(template["body"], vocab)

        n_comments = comments_per[i] if i < len(comments_per) else random.randint(3, 7)

        # Determine post lean for comment generation
        post_lean = "center"  # default; could be enriched per template

        comments = generate_comment_tree(n_comments, vocab, post_lean)

        posts.append({
            "type": post_type,
            "title": title,
            "body": body,
            "comments": comments,
        })

    return posts


def generate_positions_for_stage(stage, pos_config, vocab):
    """Generate positions from position config.

    pos_config: list of position entries, each either:
      {"type": "anchor", "statement": "...", "votes": [...]}
      {"type": "generated", "lean": "left", "topic_focus": "funding"}
    """
    if not pos_config:
        return []

    positions = []
    for entry in pos_config:
        if entry["type"] == "anchor":
            positions.append({
                "statement": entry["statement"],
                "votes": tuple(entry["votes"]),
                "stage": stage,
            })
        elif entry["type"] == "generated":
            lean = entry.get("lean", "center")
            topic_focus = entry.get("topic_focus", "governance")
            # Pick a vote pattern
            patterns = VOTE_PATTERNS.get(lean, VOTE_PATTERNS["center"])
            votes = tuple(random.choice(patterns))
            # Pick a statement template
            focus_templates = STATEMENT_TEMPLATES.get(topic_focus,
                                                       STATEMENT_TEMPLATES["governance"])
            template = random.choice(focus_templates)
            statement = _fill_template(template, vocab)
            positions.append({
                "statement": statement,
                "votes": votes,
                "stage": stage,
            })

    return positions


def expand_session(session_data):
    """Expand a session JSON into complete content lists.

    Returns: {
        "positions": [...],  # {statement, votes, stage, session}
        "posts": [...],      # {stage, type, title, body, comments, session}
        "surveys": [...]     # passthrough from session JSON
    }
    """
    session_name = session_data["session_name"]
    vocab = session_data.get("topic_vocabulary", {})

    all_positions = []
    all_posts = []

    # Process positions by stage
    for stage, pos_entries in session_data.get("positions", {}).items():
        positions = generate_positions_for_stage(stage, pos_entries, vocab)
        for p in positions:
            p["session"] = session_name
        all_positions.extend(positions)

    # Process posts by stage
    for stage, stage_config in session_data.get("posts", {}).items():
        # Anchor posts
        for anchor in stage_config.get("anchors", []):
            post = {
                "stage": stage,
                "type": anchor.get("post_type", "discussion"),
                "title": anchor["title"],
                "body": anchor["body"],
                "comments": anchor.get("comments", []),
                "session": session_name,
            }
            all_posts.append(post)

        # Generated posts
        gen_config = {
            "generated_count": stage_config.get("generated_count", 0),
            "generated_types": stage_config.get("generated_types", {}),
            "comments_per_generated": stage_config.get("comments_per_generated", []),
        }
        if gen_config["generated_count"] > 0:
            generated = generate_posts_for_stage(stage, gen_config, vocab)
            for p in generated:
                p["stage"] = stage
                p["session"] = session_name
            all_posts.extend(generated)

    surveys = session_data.get("surveys", [])
    for s in surveys:
        s["session"] = session_name

    return {
        "positions": all_positions,
        "posts": all_posts,
        "surveys": surveys,
    }
