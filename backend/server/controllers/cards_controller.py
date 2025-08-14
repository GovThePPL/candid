import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from candid.models.get_card_queue200_response_inner import GetCardQueue200ResponseInner  # noqa: E501
from candid import util


def get_card_queue(limit=None):  # noqa: E501
    """Get mixed queue of positions, surveys, and chat requests

     # noqa: E501

    :param limit: Maximum number of cards to return
    :type limit: int

    :rtype: Union[List[GetCardQueue200ResponseInner], Tuple[List[GetCardQueue200ResponseInner], int], Tuple[List[GetCardQueue200ResponseInner], int, Dict[str, str]]
    """
    return 'Custom response!'
