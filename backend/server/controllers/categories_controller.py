import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.position_category import PositionCategory  # noqa: E501
from candid import util

from candid.controllers import db
from candid.controllers.helpers.auth import authorization


def get_all_categories(token_info=None):  # noqa: E501
    """Get hierarchical structure of all position categories and subcategories

     # noqa: E501


    :rtype: Union[List[PositionCategory], Tuple[List[PositionCategory], int], Tuple[List[PositionCategory], int, Dict[str, str]]
    """
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code

    rows = db.execute_query("""
        SELECT id, label, parent_position_category_id
        FROM position_category
        ORDER BY label
    """)

    if rows is None:
        rows = []

    categories = []
    for row in rows:
        categories.append(PositionCategory(
            id=str(row['id']),
            label=row['label'],
            parent_id=str(row['parent_position_category_id']) if row['parent_position_category_id'] else None
        ))

    return categories
