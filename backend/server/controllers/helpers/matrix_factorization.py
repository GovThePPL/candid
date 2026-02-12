"""
Matrix factorization for comment-vote ideological coordinates.

Stub module — all functions return None. Implemented in Phase 4.

When implemented, this will fit a Community Notes-style factorization
on the comment vote matrix:  r_uc = μ + i_u + i_c + f_u · f_c

- f_u = user's latent ideological factor (discovered from comment votes)
- i_c = comment's "genuine quality" intercept (bridging score)
- Polis regularization anchors f_u toward PCA coords
"""


def run_factorization(conversation_id):
    """Fit MF model on comment vote matrix for a conversation.

    Phase 4: gradient descent with Polis regularization.

    Args:
        conversation_id: Polis conversation ID string.
    """
    return None


def get_mf_coords(user_id, conversation_id):
    """Get user's MF-derived ideological coordinates.

    Phase 4: returns (mf_x, mf_y) from the fitted model.

    Args:
        user_id: Candid user UUID string.
        conversation_id: Polis conversation ID string.

    Returns:
        Tuple (mf_x, mf_y), or None if MF not yet available.
    """
    return None


def get_comment_intercept(comment_id):
    """Get a comment's bridging quality intercept from MF.

    Phase 4: returns i_c from the fitted model. High values indicate
    cross-ideology approval.

    Args:
        comment_id: Comment UUID string.

    Returns:
        Bridging score (float), or None if MF not yet available.
    """
    return None
