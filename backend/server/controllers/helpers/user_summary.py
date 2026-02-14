from candid.controllers import db


def build_user_summary(user_id):
    """Fetch a user dict with all fields needed for UserCard display."""
    if not user_id:
        return None
    row = db.execute_query("""
        SELECT u.id, u.username, u.display_name, u.status,
               u.trust_score, u.avatar_url, u.avatar_icon_url,
               COALESCE((SELECT COUNT(*) FROM kudos k
                         WHERE k.receiver_user_id = u.id AND k.status = 'sent'), 0) AS kudos_count
        FROM users u WHERE u.id = %s
    """, (user_id,), fetchone=True)
    if row:
        return {
            'id': str(row['id']),
            'username': row['username'],
            'displayName': row['display_name'],
            'status': row['status'],
            'trustScore': float(row['trust_score']) if row.get('trust_score') is not None else None,
            'avatarUrl': row.get('avatar_url'),
            'avatarIconUrl': row.get('avatar_icon_url'),
            'kudosCount': row['kudos_count'],
        }
    return None
