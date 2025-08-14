import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from candid.models.connect_web_socket101_response import ConnectWebSocket101Response  # noqa: E501
from candid import util


def connect_web_socket():  # noqa: E501
    """WebSocket Connection

    :rtype: Union[None, Tuple[None, int], Tuple[None, int, Dict[str, str]]
    """
    return 'do some magic!'
