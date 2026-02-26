"""Context gathering for AI-guided proposal creation.

Assembles relevant wiki pages, glossary terms, Q&A posts, and expert content
scoped to a session into a single context string for the LLM.
"""

from candid.controllers import db

# Max characters for assembled context to fit LLM context window
MAX_CONTEXT_CHARS = 8000


def gather_proposal_context(session_id):
    """Gather authoritative context for proposal AI assistance.

    Queries:
    - Wiki pages scoped to the session
    - Glossary terms scoped to the session
    - Top Q&A posts in the session
    - Posts/comments from expert and liaison users at this location+session

    Args:
        session_id: UUID of the session.

    Returns:
        Formatted context string (markdown), truncated to MAX_CONTEXT_CHARS.
    """
    parts = []

    # Get session info
    session = db.execute_query(
        "SELECT id, label, description, location_id FROM session WHERE id = %s",
        (session_id,), fetchone=True,
    )
    if not session:
        return ""

    location_id = str(session["location_id"])

    # Session description
    if session.get("description"):
        parts.append(f"## Session: {session['label']}\n\n{session['description']}")

    # Wiki pages scoped to this session
    wiki_rows = db.execute_query("""
        SELECT wp.title, wp.content
        FROM wiki_page wp
        JOIN wiki_page_scope wps ON wps.wiki_page_id = wp.id
        WHERE wps.scope_type = 'session' AND wps.scope_id = %s
          AND wp.status = 'published'
        ORDER BY wp.title
        LIMIT 10
    """, (session_id,))
    if wiki_rows:
        wiki_parts = []
        for row in wiki_rows:
            wiki_parts.append(f"### {row['title']}\n\n{row['content']}")
        parts.append("## Wiki Pages\n\n" + "\n\n".join(wiki_parts))

    # Glossary terms scoped to this session
    glossary_rows = db.execute_query("""
        SELECT gt.term, gt.definition
        FROM glossary_term gt
        JOIN glossary_term_scope gts ON gts.glossary_term_id = gt.id
        WHERE gts.scope_type = 'session' AND gts.scope_id = %s
          AND gt.status = 'active'
        ORDER BY gt.term
        LIMIT 20
    """, (session_id,))
    if glossary_rows:
        terms = [f"- **{row['term']}**: {row['definition']}" for row in glossary_rows]
        parts.append("## Glossary Terms\n\n" + "\n".join(terms))

    # Top Q&A posts in this session (by score)
    qa_rows = db.execute_query("""
        SELECT p.title, p.body
        FROM post p
        WHERE p.session_id = %s AND p.post_type = 'question'
          AND p.status IN ('active', 'locked')
        ORDER BY p.score DESC
        LIMIT 5
    """, (session_id,))
    if qa_rows:
        qa_parts = []
        for row in qa_rows:
            qa_parts.append(f"### Q: {row['title']}\n\n{row['body']}")
        parts.append("## Top Q&A\n\n" + "\n\n".join(qa_parts))

    # Expert and liaison content
    expert_rows = db.execute_query("""
        SELECT DISTINCT p.title, p.body, u.display_name, ur.role
        FROM post p
        JOIN users u ON p.creator_user_id = u.id
        JOIN user_role ur ON ur.user_id = u.id AND ur.location_id = %s
        WHERE p.session_id = %s
          AND ur.role IN ('expert', 'liaison')
          AND p.status IN ('active', 'locked')
        ORDER BY p.score DESC
        LIMIT 5
    """, (location_id, session_id))
    if expert_rows:
        expert_parts = []
        for row in expert_rows:
            role_label = row["role"].title()
            name = row.get("display_name") or "Anonymous"
            expert_parts.append(
                f"### {row['title']} ({role_label}: {name})\n\n{row['body']}")
        parts.append("## Expert & Liaison Content\n\n" + "\n\n".join(expert_parts))

    # Assemble and truncate
    full_context = "\n\n---\n\n".join(parts)
    if len(full_context) > MAX_CONTEXT_CHARS:
        full_context = full_context[:MAX_CONTEXT_CHARS] + "\n\n[Context truncated]"

    return full_context
