"""
Polis API Client

Wrapper for Polis API operations with proper authentication:
- XID-based JWT authentication for participants (comments, votes)
- OIDC authentication for admin operations (creating conversations)

Authentication Flow:
1. For participant operations (comments, votes):
   - Call participationInit with xid=candid:{user_uuid}
   - Polis issues an XID JWT token
   - Use that token for subsequent requests

2. For admin operations (creating conversations):
   - Use OIDC Resource Owner Password Credentials flow
   - Get admin access token
   - Use that token to create conversations
"""

import requests
import logging
import urllib3
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from threading import Lock
from candid.controllers import config, db

# Suppress SSL warnings for self-signed certs in dev
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)

# Token validity: Polis issues 1-year tokens, but we refresh a bit before expiry
TOKEN_EXPIRY_DAYS = 365
TOKEN_REFRESH_BUFFER_DAYS = 30  # Refresh tokens 30 days before expiry


class PolisError(Exception):
    """Base exception for Polis API errors."""
    def __init__(self, message: str, status_code: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class PolisUnavailableError(PolisError):
    """Raised when Polis API is unavailable."""
    pass


class PolisAuthError(PolisError):
    """Raised when Polis authentication fails."""
    pass


class PolisClient:
    """
    Client for interacting with Polis API.

    Uses XID-based authentication for participants and OIDC for admin operations.
    """

    def __init__(self, base_url: Optional[str] = None, timeout: Optional[int] = None):
        self.api_url = base_url or config.POLIS_API_URL
        self.base_url = config.POLIS_BASE_URL
        self.timeout = timeout or config.POLIS_TIMEOUT
        self.session = requests.Session()

        # Token caches
        self._admin_token: Optional[str] = None
        self._admin_token_lock = Lock()
        self._xid_tokens: Dict[str, Dict[str, str]] = {}  # {conversation_id: {xid: token}}
        self._xid_tokens_lock = Lock()

    def _request(
        self,
        method: str,
        endpoint: str,
        auth_token: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """Make an HTTP request to Polis API."""
        url = f"{self.api_url}{endpoint}"
        kwargs.setdefault('timeout', self.timeout)
        kwargs.setdefault('verify', False)  # Allow self-signed certs in dev

        # Add auth header if token provided
        if auth_token:
            headers = kwargs.get('headers', {})
            headers['Authorization'] = f'Bearer {auth_token}'
            kwargs['headers'] = headers

        try:
            response = self.session.request(method, url, **kwargs)

            # Log response for debugging
            logger.debug(f"Polis {method} {endpoint}: {response.status_code}")

            if response.status_code == 401:
                raise PolisAuthError(f"Authentication failed: {response.text}", 401)
            elif response.status_code == 403:
                raise PolisAuthError(f"Access forbidden: {response.text}", 403)

            response.raise_for_status()

            if response.content:
                return response.json()
            return {}

        except requests.exceptions.ConnectionError as e:
            logger.warning(f"Polis API unavailable: {e}")
            raise PolisUnavailableError(f"Polis API unavailable: {e}")
        except requests.exceptions.Timeout as e:
            logger.warning(f"Polis API timeout: {e}")
            raise PolisUnavailableError(f"Polis API timeout: {e}")
        except requests.exceptions.HTTPError as e:
            resp = e.response
            logger.error(f"Polis API error: {e}, Response: {resp.text if resp is not None else 'N/A'}")
            raise PolisError(f"Polis API error: {e}", status_code=resp.status_code if resp is not None else None)
        except requests.exceptions.RequestException as e:
            logger.error(f"Polis request failed: {e}")
            raise PolisError(f"Polis request failed: {e}")

    # ========== Admin Authentication (OIDC) ==========

    def _get_admin_token(self) -> str:
        """
        Get an admin access token using OIDC.

        Uses Resource Owner Password Credentials (ROPC) flow.
        Tokens are cached until they expire.
        """
        with self._admin_token_lock:
            if self._admin_token:
                # TODO: Check token expiration
                return self._admin_token

            try:
                # Try ROPC flow with the OIDC simulator
                token_url = config.POLIS_OIDC_TOKEN_URL

                data = {
                    'grant_type': 'password',
                    'client_id': config.POLIS_OIDC_CLIENT_ID,
                    'client_secret': config.POLIS_OIDC_CLIENT_SECRET,
                    'username': config.POLIS_ADMIN_EMAIL,
                    'password': config.POLIS_ADMIN_PASSWORD,
                    'scope': 'openid email profile',
                }

                # Set Host header to localhost:3000 to ensure consistent issuer
                # The OIDC simulator uses the Host header to determine the token issuer
                # This ensures tokens have iss=https://localhost:3000/ regardless of
                # whether the request comes from browser (localhost) or API container (polis)
                headers = {'Host': 'localhost:3000'}

                response = self.session.post(
                    token_url,
                    data=data,
                    headers=headers,
                    timeout=self.timeout,
                    verify=False  # Self-signed cert in dev
                )

                if response.status_code != 200:
                    logger.warning(f"OIDC token request failed: {response.status_code} - {response.text}")
                    raise PolisAuthError(f"Failed to get admin token: {response.text}", response.status_code)

                token_data = response.json()
                self._admin_token = token_data.get('access_token') or token_data.get('id_token')

                if not self._admin_token:
                    raise PolisAuthError("No access token in OIDC response")

                logger.info("Successfully obtained Polis admin token")
                return self._admin_token

            except requests.exceptions.RequestException as e:
                logger.error(f"Failed to get admin token: {e}")
                raise PolisAuthError(f"Failed to get admin token: {e}")

    # ========== XID Authentication ==========

    def _get_xid_token(self, conversation_id: str, xid: str) -> str:
        """
        Get an XID JWT token for a participant.

        First checks the database for a stored token, then falls back to
        calling participationInit if no valid token exists.

        Tokens are stored per-user in the polis_participant table.
        """
        # Extract user_id from xid (format: candid:{user_uuid})
        user_id = xid.replace("candid:", "") if xid.startswith("candid:") else None
        if not user_id:
            logger.warning(f"Invalid XID format: {xid}")
            return ""

        # Check in-memory cache first (fast path)
        with self._xid_tokens_lock:
            if conversation_id in self._xid_tokens:
                if xid in self._xid_tokens[conversation_id]:
                    return self._xid_tokens[conversation_id][xid]

        # Check database for stored token
        now = datetime.now(timezone.utc)
        refresh_threshold = now + timedelta(days=TOKEN_REFRESH_BUFFER_DAYS)

        stored = db.execute_query("""
            SELECT polis_jwt_token, token_expires_at, polis_pid
            FROM polis_participant
            WHERE user_id = %s AND polis_conversation_id = %s
              AND polis_jwt_token IS NOT NULL
        """, (user_id, conversation_id), fetchone=True)

        if stored and stored.get("polis_jwt_token"):
            expires_at = stored.get("token_expires_at")
            # Use token if it exists and won't expire soon
            if expires_at and expires_at > refresh_threshold:
                token = stored["polis_jwt_token"]
                # Cache in memory
                with self._xid_tokens_lock:
                    if conversation_id not in self._xid_tokens:
                        self._xid_tokens[conversation_id] = {}
                    self._xid_tokens[conversation_id][xid] = token
                logger.debug(f"Using stored token for XID {xid} in conversation {conversation_id}")
                return token

        # Get new token via participationInit
        try:
            result = self.initialize_participant(conversation_id, xid)
            token = result.get('auth', {}).get('token') if result.get('auth') else None
            pid = result.get('ptpt', {}).get('pid') if result.get('ptpt') else None

            # Store participant in database (even without token - Polis may not require auth)
            if pid is not None:
                token_issued = now if token else None
                token_expires = now + timedelta(days=TOKEN_EXPIRY_DAYS) if token else None

                db.execute_query("""
                    INSERT INTO polis_participant
                    (id, user_id, polis_conversation_id, polis_xid, polis_pid,
                     polis_jwt_token, token_issued_at, token_expires_at)
                    VALUES (uuid_generate_v4(), %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, polis_conversation_id) DO UPDATE SET
                        polis_pid = COALESCE(EXCLUDED.polis_pid, polis_participant.polis_pid),
                        polis_jwt_token = COALESCE(EXCLUDED.polis_jwt_token, polis_participant.polis_jwt_token),
                        token_issued_at = COALESCE(EXCLUDED.token_issued_at, polis_participant.token_issued_at),
                        token_expires_at = COALESCE(EXCLUDED.token_expires_at, polis_participant.token_expires_at)
                """, (user_id, conversation_id, xid, pid, token, token_issued, token_expires))

                logger.info(f"Stored participant pid={pid} for XID {xid} in conversation {conversation_id}")

            if token:
                # Cache token in memory
                with self._xid_tokens_lock:
                    if conversation_id not in self._xid_tokens:
                        self._xid_tokens[conversation_id] = {}
                    self._xid_tokens[conversation_id][xid] = token
                return token

            # No token needed - Polis doesn't require auth for this conversation
            logger.debug(f"No token required for XID {xid} in conversation {conversation_id}")
            return ""

        except PolisError as e:
            logger.warning(f"Failed to get XID token: {e}")
            return ""

    def get_user_token(self, user_id: str, conversation_id: str) -> Optional[str]:
        """
        Get a user's stored Polis token from the database.

        This does NOT call Polis - it only returns locally stored tokens.
        Useful for checking if a user has credentials without triggering auth flow.

        Args:
            user_id: The Candid user UUID
            conversation_id: The Polis conversation ID

        Returns:
            The stored JWT token, or None if not found/expired
        """
        now = datetime.now(timezone.utc)

        stored = db.execute_query("""
            SELECT polis_jwt_token, token_expires_at
            FROM polis_participant
            WHERE user_id = %s AND polis_conversation_id = %s
              AND polis_jwt_token IS NOT NULL
              AND token_expires_at > %s
        """, (user_id, conversation_id, now), fetchone=True)

        if stored:
            return stored.get("polis_jwt_token")
        return None

    def clear_user_token(self, user_id: str, conversation_id: Optional[str] = None) -> bool:
        """
        Clear a user's stored Polis token(s).

        Useful when tokens need to be refreshed or user wants to "logout" from Polis.

        Args:
            user_id: The Candid user UUID
            conversation_id: Optional conversation ID. If None, clears all tokens for user.

        Returns:
            True if operation succeeded
        """
        xid = f"candid:{user_id}"

        # Clear from memory cache
        with self._xid_tokens_lock:
            if conversation_id:
                if conversation_id in self._xid_tokens:
                    self._xid_tokens[conversation_id].pop(xid, None)
            else:
                # Clear all conversations for this xid
                for conv_tokens in self._xid_tokens.values():
                    conv_tokens.pop(xid, None)

        # Clear from database
        if conversation_id:
            db.execute_query("""
                UPDATE polis_participant
                SET polis_jwt_token = NULL, token_issued_at = NULL, token_expires_at = NULL
                WHERE user_id = %s AND polis_conversation_id = %s
            """, (user_id, conversation_id))
        else:
            db.execute_query("""
                UPDATE polis_participant
                SET polis_jwt_token = NULL, token_issued_at = NULL, token_expires_at = NULL
                WHERE user_id = %s
            """, (user_id,))

        return True

    def initialize_participant(self, conversation_id: str, xid: str) -> Dict[str, Any]:
        """
        Initialize a participant in a conversation using XID.

        This is the primary entry point for XID-based authentication.
        Returns participant info including JWT token.

        Args:
            conversation_id: The Polis conversation ID (zinvite)
            xid: External ID for the user (candid:{user_uuid})

        Returns:
            Dict with user, ptpt, conversation, votes, and auth (JWT token)
        """
        params = {
            "conversation_id": conversation_id,
            "xid": xid,
        }

        # participationInit doesn't require auth - it issues the token
        response = self._request("GET", "/participationInit", params=params)

        logger.debug(f"participationInit response: {response.keys()}")
        return response

    # ========== Conversation Operations (Admin) ==========

    def create_conversation(self, topic: str, description: str = "") -> str:
        """
        Create a new Polis conversation.

        Requires admin authentication.

        Args:
            topic: The conversation topic/title
            description: Optional description

        Returns:
            The conversation_id (zinvite) from Polis
        """
        # Get admin token
        try:
            admin_token = self._get_admin_token()
        except PolisAuthError as e:
            logger.error(f"Cannot create conversation without admin auth: {e}")
            raise

        data = {
            "topic": topic,
            "description": description,
            "is_active": True,
            "is_public": True,
            "profanity_filter": True,
            "strict_moderation": False,
            "auth_needed_to_vote": False,
            "auth_needed_to_write": False,
        }

        response = self._request("POST", "/conversations", auth_token=admin_token, json=data)

        # The response contains the conversation URL, extract conversation_id
        url = response.get("url", "")
        conversation_id = url.split("/")[-1] if url else response.get("conversation_id")

        if not conversation_id:
            raise PolisError("No conversation_id in response")

        logger.info(f"Created Polis conversation: {conversation_id}")
        return conversation_id

    # ========== Comment Operations (XID Auth) ==========

    def create_comment(self, conversation_id: str, text: str, xid: str) -> Optional[int]:
        """
        Create a comment (position statement) in a Polis conversation.

        Uses XID-based authentication.

        Args:
            conversation_id: The Polis conversation ID
            text: The comment text (position statement)
            xid: External ID for the user (candid:{user_uuid})

        Returns:
            The tid (topic ID) of the created comment, or None if failed
        """
        # Initialize participant and get token
        token = self._get_xid_token(conversation_id, xid)

        data = {
            "conversation_id": conversation_id,
            "txt": text,
            "xid": xid,
        }

        try:
            response = self._request("POST", "/comments", auth_token=token if token else None, json=data)
            tid = response.get("tid")
            logger.debug(f"Created comment tid={tid} in conversation {conversation_id}")
            return tid
        except PolisError as e:
            if e.status_code == 409:
                # Comment already exists - look up the existing tid by matching text
                logger.info(f"Comment already exists in conversation {conversation_id}, looking up tid")
                try:
                    comments = self.get_comments(conversation_id)
                    for comment in comments:
                        if comment.get("txt") == text:
                            tid = comment.get("tid")
                            logger.info(f"Found existing comment tid={tid} for duplicate text")
                            return tid
                    logger.warning(f"409 but could not find matching comment text in conversation {conversation_id}")
                except PolisError as lookup_err:
                    logger.error(f"Failed to look up existing comments after 409: {lookup_err}")
            else:
                logger.error(f"Failed to create comment: {e}")
            return None

    # ========== Vote Operations (XID Auth) ==========

    def submit_vote(self, conversation_id: str, tid: int, vote: int, xid: str) -> bool:
        """
        Submit a vote on a comment.

        Uses XID-based authentication.

        Args:
            conversation_id: The Polis conversation ID
            tid: The comment's topic ID
            vote: Vote value (-1=agree, 0=pass, 1=disagree)
            xid: External ID for the user

        Returns:
            True if vote was recorded
        """
        # Initialize participant and get token
        token = self._get_xid_token(conversation_id, xid)

        data = {
            "conversation_id": conversation_id,
            "tid": tid,
            "vote": vote,
            "xid": xid,
        }

        try:
            self._request("POST", "/votes", auth_token=token if token else None, json=data)
            logger.debug(f"Submitted vote on tid={tid} in conversation {conversation_id}")
            return True
        except PolisError as e:
            logger.error(f"Failed to submit vote: {e}")
            return False

    # ========== Read Operations ==========

    def get_comments(
        self,
        conversation_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get comments in a conversation.

        Args:
            conversation_id: The Polis conversation ID

        Returns:
            List of comment objects with tid, txt, created, etc.
        """
        params = {
            "conversation_id": conversation_id,
        }

        try:
            response = self._request("GET", "/comments", params=params)
            if isinstance(response, list):
                return response
            return response.get("comments", [])
        except PolisError as e:
            logger.error(f"Failed to get comments: {e}")
            return []

    def get_participant_votes(self, conversation_id: str, xid: str) -> List[Dict[str, Any]]:
        """
        Get a participant's votes in a conversation.

        Args:
            conversation_id: The Polis conversation ID
            xid: External ID for the user

        Returns:
            List of {tid, vote} pairs
        """
        # Get token for this participant
        token = self._get_xid_token(conversation_id, xid)

        params = {
            "conversation_id": conversation_id,
            "xid": xid,
        }

        try:
            response = self._request("GET", "/votes", auth_token=token if token else None, params=params)
            if isinstance(response, list):
                return response
            return response.get("votes", [])
        except PolisError as e:
            logger.error(f"Failed to get votes: {e}")
            return []

    def get_unvoted_comments(self, conversation_id: str, xid: str) -> List[Dict[str, Any]]:
        """
        Get comments the user hasn't voted on yet.

        Args:
            conversation_id: The Polis conversation ID
            xid: External ID for the user

        Returns:
            List of comment objects the user hasn't voted on
        """
        # Get all comments
        all_comments = self.get_comments(conversation_id)

        # Get user's votes
        user_votes = self.get_participant_votes(conversation_id, xid)
        voted_tids = {v.get("tid") for v in user_votes}

        # Filter to unvoted comments
        unvoted = [c for c in all_comments if c.get("tid") not in voted_tids]
        return unvoted

    def get_conversation_stats(self, conversation_id: str) -> Dict[str, Any]:
        """
        Get statistics for a conversation.

        Args:
            conversation_id: The Polis conversation ID

        Returns:
            Stats including comment count, vote count, participant count
        """
        params = {"conversation_id": conversation_id}

        try:
            return self._request("GET", "/conversations", params=params)
        except PolisError as e:
            logger.error(f"Failed to get conversation stats: {e}")
            return {}

    def get_math_data(self, conversation_id: str, xid: Optional[str] = None) -> Dict[str, Any]:
        """
        Get PCA/clustering math data for a conversation.

        Fetches participationInit with math=true to get:
        - pca: Principal component analysis data
        - group-clusters: Group membership and centroids
        - repness: Representative comments per group
        - group-votes: Aggregated votes per group

        Args:
            conversation_id: The Polis conversation ID
            xid: Optional external ID for the user to get their position

        Returns:
            Dict with math data including pca, group-clusters, repness, etc.
        """
        params = {
            "conversation_id": conversation_id,
            "math_tick": 0,  # Request latest math data
        }

        if xid:
            params["xid"] = xid

        try:
            return self._request("GET", "/participationInit", params=params)
        except PolisError as e:
            logger.error(f"Failed to get math data: {e}")
            return {}

    # ========== Report Operations (Admin Auth) ==========

    def create_report(self, conversation_id: str) -> Optional[str]:
        """
        Create a report for a Polis conversation.

        Reports are snapshots of the conversation's analysis at a point in time.
        Requires admin authentication.

        Args:
            conversation_id: The Polis conversation ID

        Returns:
            The report_id if created successfully, None otherwise
        """
        print(f"[POLIS CLIENT] create_report called for {conversation_id}", flush=True)
        try:
            admin_token = self._get_admin_token()
            print(f"[POLIS CLIENT] Got admin token: {admin_token[:20] if admin_token else 'None'}...", flush=True)
        except PolisAuthError as e:
            print(f"[POLIS CLIENT] Admin auth failed: {e}", flush=True)
            logger.error(f"Cannot create report without admin auth: {e}")
            return None

        data = {
            "conversation_id": conversation_id,
        }

        try:
            response = self._request("POST", "/reports", auth_token=admin_token, json=data)
            print(f"[POLIS CLIENT] POST /reports response: {response}", flush=True)
            logger.info(f"Created report for conversation {conversation_id}")
            return response.get("report_id")
        except PolisError as e:
            print(f"[POLIS CLIENT] POST /reports failed: {e}", flush=True)
            logger.error(f"Failed to create report: {e}")
            return None

    def get_report(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the latest report for a conversation.

        Args:
            conversation_id: The Polis conversation ID

        Returns:
            Report data if found, None otherwise
        """
        params = {"conversation_id": conversation_id}

        try:
            admin_token = self._get_admin_token()
            response = self._request("GET", "/reports", auth_token=admin_token, params=params)
            if isinstance(response, list) and len(response) > 0:
                # Return the most recent report
                return response[0]
            return None
        except PolisError as e:
            logger.error(f"Failed to get report: {e}")
            return None

    def get_or_create_report(self, conversation_id: str) -> Optional[str]:
        """
        Get existing report or create one for a conversation.

        Args:
            conversation_id: The Polis conversation ID

        Returns:
            The report_id
        """
        print(f"[POLIS CLIENT] get_or_create_report called for {conversation_id}", flush=True)

        # First try to get existing report
        try:
            existing = self.get_report(conversation_id)
            print(f"[POLIS CLIENT] get_report returned: {existing}", flush=True)
            if existing and existing.get("report_id"):
                return existing["report_id"]
        except Exception as e:
            print(f"[POLIS CLIENT] Error getting report: {e}", flush=True)

        # Create new report
        try:
            report_id = self.create_report(conversation_id)
            print(f"[POLIS CLIENT] create_report returned: {report_id}", flush=True)
            return report_id
        except Exception as e:
            print(f"[POLIS CLIENT] Error creating report: {e}", flush=True)
            return None


# Singleton instance for convenience
_client: Optional[PolisClient] = None


def get_client() -> PolisClient:
    """Get or create the singleton Polis client."""
    global _client
    if _client is None:
        _client = PolisClient()
    return _client
