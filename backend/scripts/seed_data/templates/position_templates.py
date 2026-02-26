"""
Position statement templates and vote pattern presets.

Vote tuples: (prog, lib, socdem, soc, mod, cen, libt, con, pop, trad)
  1 = agree, -1 = disagree, 0 = pass
"""

# Pre-defined vote patterns by ideological lean
VOTE_PATTERNS = {
    # Strong left consensus: left agrees, right disagrees
    "strong_left": [
        (1,  1,  1,  1,  1, -1, -1, -1, -1, -1),
        (1,  1,  1,  1,  0, -1, -1, -1, -1, -1),
        (1,  1,  1,  1,  1,  0, -1, -1, -1, -1),
    ],
    # Left-leaning: left agrees, center mixed, right disagrees
    "left": [
        (1,  1,  1,  1,  1, -1, -1, -1, -1, -1),
        (1,  1,  1,  0,  1,  0, -1, -1, -1, -1),
        (1,  1,  1,  1,  0,  0,  0, -1, -1, -1),
    ],
    # Center-left: broad left agreement, center split
    "center_left": [
        (1,  1,  1,  0,  1,  1, -1, -1,  0, -1),
        (1,  1,  1,  1,  1,  0,  0, -1, -1, -1),
        (0,  1,  1,  0,  1,  1,  0, -1, -1, -1),
    ],
    # Center: split down the middle, moderates engaged
    "center": [
        (0,  1,  0,  0,  1,  1,  0, -1,  0, -1),
        (1,  0,  1,  0,  1,  1, -1,  0, -1,  0),
        (-1, 0,  0, -1,  1,  1,  1,  0,  0, -1),
    ],
    # Center-right: broad right agreement, center split
    "center_right": [
        (-1, -1, -1,  0,  0,  1,  1,  1,  0,  1),
        (-1, -1,  0, -1,  1,  1,  1,  1,  1,  0),
        (-1,  0, -1, -1,  0,  1,  1,  1,  1,  1),
    ],
    # Right-leaning: right agrees, center mixed, left disagrees
    "right": [
        (-1, -1, -1, -1, -1,  0,  1,  1,  1,  1),
        (-1, -1, -1, -1,  0,  1,  1,  1,  1,  1),
        (-1, -1, -1, -1,  1,  1,  1,  1,  1,  0),
    ],
    # Strong right consensus: right agrees, left disagrees
    "strong_right": [
        (-1, -1, -1, -1, -1, -1,  1,  1,  1,  1),
        (-1, -1, -1, -1,  0, -1,  1,  1,  1,  1),
        (-1, -1, -1, -1, -1,  1,  1,  1,  1,  1),
    ],
    # Bipartisan: broad agreement
    "bipartisan": [
        (1,  1,  1,  1,  1,  1,  1,  1,  1,  1),
        (1,  1,  1,  0,  1,  1,  1,  1,  0,  0),
        (1,  1,  1,  1,  1,  1,  0,  1,  0,  1),
    ],
    # Divisive: strong feelings on both sides, few passes
    "divisive": [
        (1,  1,  1,  1, -1, -1, -1, -1, -1, -1),
        (-1, -1, -1, -1,  1,  1,  1,  1,  1,  1),
        (1,  1, -1,  1, -1, -1,  1, -1,  1, -1),
    ],
    # Populist cross-cut: left and right populists agree, establishment disagrees
    "populist_cross": [
        (1,  0,  1,  1, -1, -1, -1,  0,  1,  1),
        (1, -1,  0,  1,  0, -1, -1,  0,  1,  1),
        (0, -1,  1,  1, -1, -1,  0,  1,  1,  0),
    ],
    # Libertarian cross-cut: libertarians agree with left on social, right on economic
    "libertarian_cross": [
        (1,  1,  0,  0, -1, -1,  1, -1, -1, -1),
        (-1,  0, -1, -1,  0,  1,  1,  1, -1, -1),
        (1,  0,  1,  1,  0,  0,  1, -1, -1, -1),
    ],
}

# Position statement templates by topic_focus
# Each generates a statement using session topic_vocabulary
STATEMENT_TEMPLATES = {
    # General governance
    "governance": [
        "Government should take a more active role in addressing {topic_noun} in {location_name}.",
        "Local communities should have more control over {topic_adj} policy, not the state or federal government.",
        "{location_name} needs stronger oversight of {stakeholder} to improve {topic_noun} outcomes.",
        "The private sector is better equipped than government to solve {topic_adj} challenges.",
    ],
    # Funding and economics
    "funding": [
        "Increased public funding for {topic_noun} would be worth higher taxes.",
        "We should redirect existing spending rather than raise new revenue for {topic_noun}.",
        "Market-based incentives are more effective than regulations for improving {topic_noun}.",
        "{stakeholder} should bear more of the cost of {topic_adj} improvements.",
    ],
    # Equity and access
    "equity": [
        "Addressing racial and economic disparities should be the top priority in {topic_adj} policy.",
        "Universal programs for {topic_noun} are more effective than means-tested ones.",
        "Rural areas in {location_name} need different {topic_adj} solutions than urban areas.",
        "Low-income families are disproportionately affected by {topic_adj} failures.",
    ],
    # Reform approaches
    "reform": [
        "Gradual reform of {topic_noun} is safer than revolutionary change.",
        "{location_name} should look to other states' {topic_adj} models for inspiration.",
        "Data-driven approaches to {topic_noun} would produce better outcomes than ideological ones.",
        "Community input should drive {topic_adj} policy decisions, not expert committees alone.",
    ],
    # Individual vs collective
    "individual_collective": [
        "Personal responsibility plays a bigger role in {topic_noun} outcomes than systemic factors.",
        "Strong community institutions are more important than government programs for {topic_noun}.",
        "{topic_noun} is fundamentally a collective challenge that requires collective solutions.",
        "Individual choices matter more than policy for improving {topic_adj} outcomes.",
    ],
    # Practical implementation
    "implementation": [
        "Pilot programs are the right way to test new approaches to {topic_noun}.",
        "Technology and innovation can solve many {topic_adj} challenges without new regulations.",
        "Public-private partnerships are the most realistic path forward for {topic_noun}.",
        "Transparent metrics and accountability should be required for all {topic_adj} programs.",
    ],
}
