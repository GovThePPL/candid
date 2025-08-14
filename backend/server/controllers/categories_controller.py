import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from candid.models.error_model import ErrorModel  # noqa: E501
from candid.models.position_category import PositionCategory  # noqa: E501
from candid import util


def get_all_categories():  # noqa: E501
    """Get hierarchical structure of all position categories and subcategories

     # noqa: E501


    :rtype: Union[List[PositionCategory], Tuple[List[PositionCategory], int], Tuple[List[PositionCategory], int, Dict[str, str]]
    """
    return 'do some magic!'
