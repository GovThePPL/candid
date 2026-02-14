import connexion
from typing import Dict, List
from typing import Tuple
from typing import Union

from flask import make_response, jsonify

from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.position_category import PositionCategory  # noqa: E501
from candid import util

from candid.controllers import db
from candid.controllers.helpers.auth import authorization, authorization_allow_banned
from candid.controllers.helpers import nlp
from candid.controllers.helpers.cache_headers import add_cache_headers


# Cache categories for 24 hours (86400 seconds) - they rarely change
CATEGORIES_CACHE_MAX_AGE = 86400


def get_all_categories(token_info=None):  # noqa: E501
    """Get hierarchical structure of all position categories and subcategories

     # noqa: E501


    :rtype: Union[List[PositionCategory], Tuple[List[PositionCategory], int], Tuple[List[PositionCategory], int, Dict[str, str]]
    """
    authorized, auth_err = authorization_allow_banned("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    rows = db.execute_query("""
        SELECT id, label
        FROM position_category
        ORDER BY label
    """)

    if rows is None:
        rows = []

    categories = []
    for row in rows:
        categories.append({
            'id': str(row['id']),
            'label': row['label']
        })

    # Categories are static reference data - cache for 24 hours
    response = make_response(jsonify(categories), 200)
    response = add_cache_headers(response, max_age=CATEGORIES_CACHE_MAX_AGE)
    return response


def create_category_suggestions(body, token_info=None):  # noqa: E501
    """Suggest categories based on a position statement

    Uses semantic similarity to rank categories by relevance to the given statement.

    :param body: Request body with statement
    :type body: dict

    :rtype: Union[List[dict], Tuple[List[dict], int], Tuple[List[dict], int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    statement = body.get('statement', '')
    limit = min(body.get('limit', 3), 10)

    # Validate statement length
    if len(statement.strip()) < 10:
        return ErrorModel(400, "Statement must be at least 10 characters"), 400

    # Get all categories
    rows = db.execute_query("""
        SELECT id, label
        FROM position_category
        ORDER BY label
    """)

    if not rows:
        return [], 200

    # Get category labels for similarity comparison
    category_labels = [row['label'] for row in rows]

    # Compute similarity between statement and category names
    scores = nlp.compute_similarity(statement.strip(), category_labels)

    if scores is None:
        return ErrorModel(503, "NLP service unavailable"), 503

    # Combine categories with scores and sort by score
    results = []
    for i, row in enumerate(rows):
        results.append({
            'category': {
                'id': str(row['id']),
                'label': row['label']
            },
            'score': round(float(scores[i]), 4)
        })

    # Sort by score descending and limit
    results.sort(key=lambda x: x['score'], reverse=True)
    return results[:limit], 200
