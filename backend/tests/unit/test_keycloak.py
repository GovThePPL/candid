"""Unit tests for keycloak.py — OIDC validation and admin REST API."""

import pytest
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit

US_ROOT = "f1a2b3c4-d5e6-7890-abcd-ef1234567890"


@pytest.fixture(autouse=True)
def _clear_location_caches():
    """Clear auth location caches before each test."""
    from candid.controllers.helpers.auth import invalidate_location_cache
    invalidate_location_cache()
    yield
    invalidate_location_cache()


# ---------------------------------------------------------------------------
# _extract_role
# ---------------------------------------------------------------------------

class TestExtractRole:
    def test_admin_role(self):
        from candid.controllers.helpers.keycloak import _extract_role
        payload = {"realm_access": {"roles": ["admin", "normal", "default-roles-candid"]}}
        assert _extract_role(payload) == "admin"

    def test_moderator_role(self):
        from candid.controllers.helpers.keycloak import _extract_role
        payload = {"realm_access": {"roles": ["moderator", "normal"]}}
        assert _extract_role(payload) == "moderator"

    def test_normal_default(self):
        from candid.controllers.helpers.keycloak import _extract_role
        payload = {"realm_access": {"roles": ["default-roles-candid"]}}
        assert _extract_role(payload) == "normal"

    def test_guest_role(self):
        from candid.controllers.helpers.keycloak import _extract_role
        payload = {"realm_access": {"roles": ["guest"]}}
        assert _extract_role(payload) == "guest"

    def test_empty_roles(self):
        from candid.controllers.helpers.keycloak import _extract_role
        payload = {"realm_access": {"roles": []}}
        assert _extract_role(payload) == "normal"  # default

    def test_missing_realm_access(self):
        from candid.controllers.helpers.keycloak import _extract_role
        assert _extract_role({}) == "normal"

    def test_priority_order(self):
        """Admin should win over moderator, moderator over normal."""
        from candid.controllers.helpers.keycloak import _extract_role
        payload = {"realm_access": {"roles": ["guest", "normal", "moderator", "admin"]}}
        assert _extract_role(payload) == "admin"


# ---------------------------------------------------------------------------
# _map_keycloak_role_to_user_type
# ---------------------------------------------------------------------------

class TestMapKeycloakRoleToUserType:
    def test_admin_maps_to_normal(self):
        from candid.controllers.helpers.keycloak import _map_keycloak_role_to_user_type
        assert _map_keycloak_role_to_user_type("admin") == "normal"

    def test_moderator_maps_to_normal(self):
        from candid.controllers.helpers.keycloak import _map_keycloak_role_to_user_type
        assert _map_keycloak_role_to_user_type("moderator") == "normal"

    def test_normal_maps_to_normal(self):
        from candid.controllers.helpers.keycloak import _map_keycloak_role_to_user_type
        assert _map_keycloak_role_to_user_type("normal") == "normal"

    def test_guest_maps_to_guest(self):
        from candid.controllers.helpers.keycloak import _map_keycloak_role_to_user_type
        assert _map_keycloak_role_to_user_type("guest") == "guest"


# ---------------------------------------------------------------------------
# _ensure_root_admin_role
# ---------------------------------------------------------------------------

class TestEnsureRootAdminRole:
    def test_creates_admin_role_at_root(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"id": US_ROOT},  # get_root_location_id
            None,             # no existing admin role
            None,             # INSERT
        ])

        with patch("candid.controllers.helpers.keycloak.db", mock_db), \
             patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.keycloak import _ensure_root_admin_role
            _ensure_root_admin_role("user-1")

            # Should have called INSERT for the admin role
            calls = mock_db.execute_query.call_args_list
            assert any("INSERT INTO user_role" in str(c) for c in calls)

    def test_skips_if_already_exists(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            {"id": US_ROOT},  # get_root_location_id
            {"1": 1},         # existing admin role found
        ])

        with patch("candid.controllers.helpers.keycloak.db", mock_db), \
             patch("candid.controllers.helpers.auth.db", mock_db):
            from candid.controllers.helpers.keycloak import _ensure_root_admin_role
            _ensure_root_admin_role("user-1")

            # Should NOT have called INSERT
            calls = mock_db.execute_query.call_args_list
            assert not any("INSERT INTO user_role" in str(c) for c in calls)


# ---------------------------------------------------------------------------
# validate_token
# ---------------------------------------------------------------------------

class TestValidateToken:
    def test_valid_token_existing_user(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"id": "candid-uuid-123"})

        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "test-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("candid.controllers.helpers.keycloak.db", mock_db), \
             patch("candid.controllers.helpers.keycloak._get_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.keycloak.jwt_decode", return_value={
                 "sub": "kc-uuid-123",
                 "preferred_username": "testuser",
             }):
            from candid.controllers.helpers.keycloak import validate_token
            result = validate_token("fake-jwt-token")
            assert result == {"sub": "candid-uuid-123"}

    def test_invalid_token_returns_none(self):
        from jwt.exceptions import PyJWTError
        mock_jwks = MagicMock()
        mock_jwks.get_signing_key_from_jwt = MagicMock(side_effect=PyJWTError("bad token"))

        with patch("candid.controllers.helpers.keycloak._get_jwks_client", return_value=mock_jwks):
            from candid.controllers.helpers.keycloak import validate_token
            result = validate_token("bad-token")
            assert result is None

    def test_auto_registration_new_user(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            side_effect=[
                None,                              # keycloak_id lookup: not found
                None,                              # link existing: no match
                {"id": "new-candid-uuid"},          # INSERT new user
            ]
        )

        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "test-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("candid.controllers.helpers.keycloak.db", mock_db), \
             patch("candid.controllers.helpers.keycloak._get_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.keycloak.jwt_decode", return_value={
                 "sub": "kc-uuid-new",
                 "preferred_username": "newuser",
                 "email": "new@test.com",
                 "name": "New User",
             }):
            from candid.controllers.helpers.keycloak import validate_token
            result = validate_token("fake-jwt")
            assert result == {"sub": "new-candid-uuid"}

    def test_auto_registration_guest_user_type(self):
        """Guest Keycloak role should create user with user_type='guest'."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            side_effect=[
                None,                              # keycloak_id lookup: not found
                None,                              # link existing: no match
                {"id": "guest-uuid"},               # INSERT new user
            ]
        )

        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "test-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("candid.controllers.helpers.keycloak.db", mock_db), \
             patch("candid.controllers.helpers.keycloak._get_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.keycloak.jwt_decode", return_value={
                 "sub": "kc-uuid-guest",
                 "preferred_username": "guestuser",
                 "realm_access": {"roles": ["guest"]},
             }):
            from candid.controllers.helpers.keycloak import validate_token
            result = validate_token("fake-jwt")
            # Check that INSERT was called with user_type='guest'
            insert_call = mock_db.execute_query.call_args_list[2]
            assert insert_call[0][1][4] == "guest"  # user_type param

    def test_admin_auto_creates_root_role_on_new_user(self):
        """Admin Keycloak role should auto-create admin at root location."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            side_effect=[
                None,                              # keycloak_id lookup: not found
                None,                              # link existing: no match
                {"id": "admin-uuid"},               # INSERT new user
                {"id": US_ROOT},                    # get_root_location_id
                None,                              # no existing admin role
                None,                              # INSERT user_role
            ]
        )

        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "test-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("candid.controllers.helpers.keycloak.db", mock_db), \
             patch("candid.controllers.helpers.auth.db", mock_db), \
             patch("candid.controllers.helpers.keycloak._get_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.keycloak.jwt_decode", return_value={
                 "sub": "kc-uuid-admin",
                 "preferred_username": "adminuser",
                 "realm_access": {"roles": ["admin"]},
             }):
            from candid.controllers.helpers.keycloak import validate_token
            result = validate_token("fake-jwt")
            assert result == {"sub": "admin-uuid"}
            # Verify admin role INSERT was called
            calls = mock_db.execute_query.call_args_list
            assert any("INSERT INTO user_role" in str(c) for c in calls)

    def test_link_existing_user(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(
            side_effect=[
                None,                              # keycloak_id lookup: not found
                {"id": "linked-uuid"},              # link existing: found
            ]
        )

        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "test-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("candid.controllers.helpers.keycloak.db", mock_db), \
             patch("candid.controllers.helpers.keycloak._get_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.keycloak.jwt_decode", return_value={
                 "sub": "kc-uuid-link",
                 "preferred_username": "existing_user",
             }):
            from candid.controllers.helpers.keycloak import validate_token
            result = validate_token("fake-jwt")
            assert result == {"sub": "linked-uuid"}

    def test_issuer_validation_passed_to_jwt_decode(self):
        """jwt_decode must receive issuer to reject tokens from foreign realms."""
        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "test-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value={"id": "candid-uuid"})

        with patch("candid.controllers.helpers.keycloak.db", mock_db), \
             patch("candid.controllers.helpers.keycloak._get_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.keycloak.jwt_decode", return_value={
                 "sub": "kc-uuid",
                 "preferred_username": "testuser",
             }) as mock_decode:
            from candid.controllers.helpers.keycloak import validate_token
            from candid.controllers import config
            validate_token("fake-jwt")
            mock_decode.assert_called_once_with(
                "fake-jwt",
                "test-key",
                algorithms=["RS256"],
                audience="users",
                issuer=f"{config.KEYCLOAK_ISSUER_URL}/realms/{config.KEYCLOAK_REALM}",
            )

    def test_wrong_issuer_rejects_token(self):
        """A token with wrong issuer should be rejected (PyJWTError)."""
        from jwt.exceptions import InvalidIssuerError
        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "test-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("candid.controllers.helpers.keycloak._get_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.keycloak.jwt_decode",
                   side_effect=InvalidIssuerError("Invalid issuer")):
            from candid.controllers.helpers.keycloak import validate_token
            result = validate_token("wrong-issuer-token")
            assert result is None

    def test_missing_sub_returns_none(self):
        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "test-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("candid.controllers.helpers.keycloak._get_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.keycloak.jwt_decode", return_value={}):
            from candid.controllers.helpers.keycloak import validate_token
            result = validate_token("fake-jwt")
            assert result is None


# ---------------------------------------------------------------------------
# get_admin_token
# ---------------------------------------------------------------------------

class TestGetAdminToken:
    def test_success(self):
        mock_response = MagicMock()
        mock_response.json.return_value = {"access_token": "admin-token-123"}
        mock_response.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.keycloak.requests.post", return_value=mock_response):
            from candid.controllers.helpers.keycloak import get_admin_token
            token = get_admin_token()
            assert token == "admin-token-123"


# ---------------------------------------------------------------------------
# create_user
# ---------------------------------------------------------------------------

class TestCreateUser:
    def test_name_parsing_single_name(self):
        """Single-word display_name should use 'User' as last name."""
        mock_post = MagicMock()
        mock_post.return_value.status_code = 201
        mock_post.return_value.headers = {"Location": "/users/kc-id-123"}
        mock_post.return_value.raise_for_status = MagicMock()

        # First call: get_admin_token, second call: create user
        with patch("candid.controllers.helpers.keycloak.requests.post", mock_post), \
             patch("candid.controllers.helpers.keycloak.requests.get") as mock_get:
            mock_get.return_value.json.return_value = []
            mock_get.return_value.raise_for_status = MagicMock()

            from candid.controllers.helpers.keycloak import create_user

            # Mock get_admin_token
            with patch("candid.controllers.helpers.keycloak.get_admin_token", return_value="admin-tok"):
                result = create_user("bob", "bob@test.com", "pass", display_name="Bob")

            assert result == "kc-id-123"

    def test_name_parsing_two_names(self):
        """'First Last' should split correctly."""
        mock_post = MagicMock()
        mock_post.return_value.status_code = 201
        mock_post.return_value.headers = {"Location": "/users/kc-id-456"}
        mock_post.return_value.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.keycloak.requests.post", mock_post), \
             patch("candid.controllers.helpers.keycloak.get_admin_token", return_value="tok"):
            from candid.controllers.helpers.keycloak import create_user
            create_user("jane", "jane@test.com", "pass", display_name="Jane Doe")

            # Check the user_data sent to Keycloak
            create_call = mock_post.call_args_list[-1]
            user_data = create_call.kwargs.get("json") or create_call[1].get("json")
            assert user_data["firstName"] == "Jane"
            assert user_data["lastName"] == "Doe"

    def test_409_conflict_returns_existing(self):
        mock_post = MagicMock()
        mock_post.return_value.status_code = 409
        mock_post.return_value.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.keycloak.requests.post", mock_post), \
             patch("candid.controllers.helpers.keycloak.get_admin_token", return_value="tok"), \
             patch("candid.controllers.helpers.keycloak.get_user_by_username", return_value="existing-id"):
            from candid.controllers.helpers.keycloak import create_user
            result = create_user("bob", "bob@test.com", "pass")
            assert result == "existing-id"

    def test_409_raise_on_conflict(self):
        mock_post = MagicMock()
        mock_post.return_value.status_code = 409
        mock_post.return_value.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.keycloak.requests.post", mock_post), \
             patch("candid.controllers.helpers.keycloak.get_admin_token", return_value="tok"):
            from candid.controllers.helpers.keycloak import create_user
            with pytest.raises(ValueError, match="already exists"):
                create_user("bob", "bob@test.com", "pass", raise_on_conflict=True)


# ---------------------------------------------------------------------------
# find_user_by_email
# ---------------------------------------------------------------------------

class TestFindUserByEmail:
    def test_found(self):
        mock_get = MagicMock()
        mock_get.return_value.json.return_value = [{"id": "kc-email-user"}]
        mock_get.return_value.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.keycloak.requests.get", mock_get), \
             patch("candid.controllers.helpers.keycloak.get_admin_token", return_value="tok"):
            from candid.controllers.helpers.keycloak import find_user_by_email
            result = find_user_by_email("user@test.com")
            assert result == "kc-email-user"

    def test_not_found(self):
        mock_get = MagicMock()
        mock_get.return_value.json.return_value = []
        mock_get.return_value.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.keycloak.requests.get", mock_get), \
             patch("candid.controllers.helpers.keycloak.get_admin_token", return_value="tok"):
            from candid.controllers.helpers.keycloak import find_user_by_email
            result = find_user_by_email("nobody@test.com")
            assert result is None


# ---------------------------------------------------------------------------
# find_user_by_federated_identity
# ---------------------------------------------------------------------------

class TestFindUserByFederatedIdentity:
    def test_found(self):
        mock_get = MagicMock()
        mock_get.return_value.json.return_value = [{"id": "kc-fed-user"}]
        mock_get.return_value.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.keycloak.requests.get", mock_get), \
             patch("candid.controllers.helpers.keycloak.get_admin_token", return_value="tok"):
            from candid.controllers.helpers.keycloak import find_user_by_federated_identity
            result = find_user_by_federated_identity("google", "google-sub-123")
            assert result == "kc-fed-user"

            # Verify correct params passed
            call_kwargs = mock_get.call_args
            assert call_kwargs[1]["params"]["idpAlias"] == "google"
            assert call_kwargs[1]["params"]["idpUserId"] == "google-sub-123"

    def test_not_found(self):
        mock_get = MagicMock()
        mock_get.return_value.json.return_value = []
        mock_get.return_value.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.keycloak.requests.get", mock_get), \
             patch("candid.controllers.helpers.keycloak.get_admin_token", return_value="tok"):
            from candid.controllers.helpers.keycloak import find_user_by_federated_identity
            result = find_user_by_federated_identity("apple", "apple-sub-999")
            assert result is None


# ---------------------------------------------------------------------------
# create_social_user
# ---------------------------------------------------------------------------

class TestCreateSocialUser:
    def test_returns_existing_federated_user(self):
        """If federated identity already exists, return that user directly."""
        with patch("candid.controllers.helpers.keycloak.find_user_by_federated_identity",
                   return_value="existing-kc-id"):
            from candid.controllers.helpers.keycloak import create_social_user
            result = create_social_user("google", "google-sub", "user@test.com")
            assert result == "existing-kc-id"

    def test_links_to_existing_email_user(self):
        """If no federated link but email matches, link identity to that user."""
        with patch("candid.controllers.helpers.keycloak.find_user_by_federated_identity",
                   return_value=None), \
             patch("candid.controllers.helpers.keycloak.find_user_by_email",
                   return_value="email-kc-id"), \
             patch("candid.controllers.helpers.keycloak.add_federated_identity_link") as mock_link:
            from candid.controllers.helpers.keycloak import create_social_user
            result = create_social_user("google", "google-sub", "user@test.com")
            assert result == "email-kc-id"
            mock_link.assert_called_once_with(
                "email-kc-id", "google", "google-sub", "user@test.com"
            )

    def test_creates_new_user(self):
        """If no existing user found, create a new one and link identity."""
        mock_post = MagicMock()
        mock_post.return_value.status_code = 201
        mock_post.return_value.headers = {"Location": "/users/new-kc-id"}
        mock_post.return_value.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.keycloak.find_user_by_federated_identity",
                   return_value=None), \
             patch("candid.controllers.helpers.keycloak.find_user_by_email",
                   return_value=None), \
             patch("candid.controllers.helpers.keycloak.get_admin_token", return_value="tok"), \
             patch("candid.controllers.helpers.keycloak.requests.post", mock_post), \
             patch("candid.controllers.helpers.keycloak.add_federated_identity_link") as mock_link:
            from candid.controllers.helpers.keycloak import create_social_user
            result = create_social_user("apple", "apple-sub", "user@icloud.com", "Jane Doe")
            assert result == "new-kc-id"
            mock_link.assert_called_once()

    def test_username_generation_from_email(self):
        """Username should be derived from email with provider prefix."""
        mock_post = MagicMock()
        mock_post.return_value.status_code = 201
        mock_post.return_value.headers = {"Location": "/users/new-id"}
        mock_post.return_value.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.keycloak.find_user_by_federated_identity",
                   return_value=None), \
             patch("candid.controllers.helpers.keycloak.find_user_by_email",
                   return_value=None), \
             patch("candid.controllers.helpers.keycloak.get_admin_token", return_value="tok"), \
             patch("candid.controllers.helpers.keycloak.requests.post", mock_post), \
             patch("candid.controllers.helpers.keycloak.add_federated_identity_link"):
            from candid.controllers.helpers.keycloak import create_social_user
            create_social_user("google", "sub123", "testuser@gmail.com")

            # Check the username sent to Keycloak
            create_call = mock_post.call_args_list[0]
            user_data = create_call.kwargs.get("json") or create_call[1].get("json")
            assert user_data["username"] == "google_testuser"


# ---------------------------------------------------------------------------
# exchange_for_user_tokens
# ---------------------------------------------------------------------------

class TestExchangeForUserTokens:
    def test_success(self):
        mock_post = MagicMock()
        mock_post.return_value.json.return_value = {
            "access_token": "user-access-token",
            "refresh_token": "user-refresh-token",
        }
        mock_post.return_value.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.keycloak.requests.post", mock_post):
            from candid.controllers.helpers.keycloak import exchange_for_user_tokens
            result = exchange_for_user_tokens("kc-user-id")

            assert result["access_token"] == "user-access-token"
            assert result["refresh_token"] == "user-refresh-token"

            # Verify correct grant_type
            call_data = mock_post.call_args[1].get("data") or mock_post.call_args[0][1]
            assert call_data["grant_type"] == "urn:ietf:params:oauth:grant-type:token-exchange"
            assert call_data["requested_subject"] == "kc-user-id"

    def test_failure_raises(self):
        import requests
        mock_post = MagicMock()
        mock_post.return_value.raise_for_status = MagicMock(
            side_effect=requests.HTTPError("403 Forbidden")
        )

        with patch("candid.controllers.helpers.keycloak.requests.post", mock_post):
            from candid.controllers.helpers.keycloak import exchange_for_user_tokens
            with pytest.raises(requests.HTTPError):
                exchange_for_user_tokens("kc-user-id")


# ---------------------------------------------------------------------------
# add_federated_identity_link
# ---------------------------------------------------------------------------

class TestAddFederatedIdentityLink:
    def test_success(self):
        mock_post = MagicMock()
        mock_post.return_value.status_code = 204
        mock_post.return_value.raise_for_status = MagicMock()

        with patch("candid.controllers.helpers.keycloak.requests.post", mock_post), \
             patch("candid.controllers.helpers.keycloak.get_admin_token", return_value="tok"):
            from candid.controllers.helpers.keycloak import add_federated_identity_link
            add_federated_identity_link("kc-user", "google", "google-sub", "user@gmail.com")

            # Verify endpoint and payload
            call_args = mock_post.call_args
            assert "/federated-identity/google" in call_args[0][0]
            link_data = call_args[1].get("json") or call_args[0][1]
            assert link_data["identityProvider"] == "google"
            assert link_data["userId"] == "google-sub"

    def test_409_is_noop(self):
        """If the link already exists (409), it should not raise."""
        mock_post = MagicMock()
        mock_post.return_value.status_code = 409

        with patch("candid.controllers.helpers.keycloak.requests.post", mock_post), \
             patch("candid.controllers.helpers.keycloak.get_admin_token", return_value="tok"):
            from candid.controllers.helpers.keycloak import add_federated_identity_link
            # Should not raise
            add_federated_identity_link("kc-user", "apple", "apple-sub", "user@icloud.com")
