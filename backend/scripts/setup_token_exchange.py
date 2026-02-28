#!/usr/bin/env python3
"""Configure Keycloak fine-grained permissions for token exchange.

Token exchange V1 requires:
1. Users-management-permissions enabled with an impersonation policy
2. Target client (candid-app) permissions enabled with a token-exchange policy
3. Both policies grant access to the candid-backend service account

Run once after Keycloak starts with KC_FEATURES including token-exchange:v1
and admin-fine-grained-authz:v1.

Usage:
    python3 backend/scripts/setup_token_exchange.py
"""

import os
import sys
import time
import requests

KEYCLOAK_URL = os.environ.get("KEYCLOAK_URL", "http://localhost:8180")
REALM = os.environ.get("KEYCLOAK_REALM", "candid")
ADMIN_USER = os.environ.get("KC_BOOTSTRAP_ADMIN_USERNAME", "admin")
ADMIN_PASS = os.environ.get("KC_BOOTSTRAP_ADMIN_PASSWORD", "admin")

BASE = f"{KEYCLOAK_URL}/admin/realms/{REALM}"


def get_master_token():
    """Get admin token from master realm."""
    resp = requests.post(
        f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token",
        data={
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": ADMIN_USER,
            "password": ADMIN_PASS,
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def get_client_uuid(token, client_id):
    """Get internal UUID for a client by clientId."""
    resp = requests.get(
        f"{BASE}/clients",
        params={"clientId": client_id},
        headers=headers(token),
        timeout=10,
    )
    resp.raise_for_status()
    clients = resp.json()
    if not clients:
        raise RuntimeError(f"Client '{client_id}' not found")
    return clients[0]["id"]


def enable_users_permissions(token):
    """Enable fine-grained permissions on the Users resource.

    Returns the scope permissions dict including the 'impersonate' permission ID.
    """
    resp = requests.put(
        f"{BASE}/users-management-permissions",
        json={"enabled": True},
        headers=headers(token),
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    print(f"  Users permissions enabled: {data.get('enabled')}")
    return data.get("scopePermissions", {})


def enable_client_permissions(token, client_uuid):
    """Enable fine-grained permissions on a client.

    Returns the scope permissions dict including the 'token-exchange' permission ID.
    """
    resp = requests.put(
        f"{BASE}/clients/{client_uuid}/management/permissions",
        json={"enabled": True},
        headers=headers(token),
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    print(f"  Client permissions enabled: {data.get('enabled')}")
    return data.get("scopePermissions", {})


def create_client_policy(token, realm_mgmt_uuid, policy_name, target_client_uuid):
    """Create a client-based authorization policy under realm-management.

    This policy allows the specified client (by UUID) to perform actions.
    """
    # Check if policy already exists
    resp = requests.get(
        f"{BASE}/clients/{realm_mgmt_uuid}/authz/resource-server/policy",
        params={"name": policy_name},
        headers=headers(token),
        timeout=10,
    )
    resp.raise_for_status()
    existing = [p for p in resp.json() if p["name"] == policy_name]
    if existing:
        print(f"  Policy '{policy_name}' already exists: {existing[0]['id']}")
        return existing[0]["id"]

    resp = requests.post(
        f"{BASE}/clients/{realm_mgmt_uuid}/authz/resource-server/policy/client",
        json={
            "name": policy_name,
            "description": f"Allow candid-backend service account",
            "logic": "POSITIVE",
            "clients": [target_client_uuid],
        },
        headers=headers(token),
        timeout=10,
    )
    resp.raise_for_status()
    policy_id = resp.json()["id"]
    print(f"  Created policy '{policy_name}': {policy_id}")
    return policy_id


def associate_policy_with_permission(token, realm_mgmt_uuid, permission_id, policy_id):
    """Add a policy to a scope permission."""
    # Get current permission details
    resp = requests.get(
        f"{BASE}/clients/{realm_mgmt_uuid}/authz/resource-server/permission/scope/{permission_id}",
        headers=headers(token),
        timeout=10,
    )
    resp.raise_for_status()
    permission = resp.json()

    # Check if policy is already associated
    existing_policies = permission.get("policies", [])
    if policy_id in existing_policies:
        print(f"  Policy already associated with permission {permission_id}")
        return

    existing_policies.append(policy_id)
    permission["policies"] = existing_policies
    # Ensure decision strategy allows access when any policy grants it
    permission["decisionStrategy"] = "AFFIRMATIVE"

    resp = requests.put(
        f"{BASE}/clients/{realm_mgmt_uuid}/authz/resource-server/permission/scope/{permission_id}",
        json=permission,
        headers=headers(token),
        timeout=10,
    )
    resp.raise_for_status()
    print(f"  Associated policy with permission {permission_id}")


def main():
    print("Configuring Keycloak token exchange permissions...")
    print(f"  Keycloak: {KEYCLOAK_URL}")
    print(f"  Realm: {REALM}")

    # Wait for Keycloak to be ready
    for attempt in range(30):
        try:
            resp = requests.get(f"{KEYCLOAK_URL}/realms/{REALM}", timeout=5)
            if resp.ok:
                break
        except requests.ConnectionError:
            pass
        print(f"  Waiting for Keycloak... (attempt {attempt + 1})")
        time.sleep(2)
    else:
        print("ERROR: Keycloak not reachable after 60s")
        sys.exit(1)

    token = get_master_token()

    # Get client UUIDs
    candid_backend_uuid = get_client_uuid(token, "candid-backend")
    candid_app_uuid = get_client_uuid(token, "candid-app")
    realm_mgmt_uuid = get_client_uuid(token, "realm-management")
    print(f"  candid-backend UUID: {candid_backend_uuid}")
    print(f"  candid-app UUID: {candid_app_uuid}")
    print(f"  realm-management UUID: {realm_mgmt_uuid}")

    # Step 1: Enable Users management permissions → get impersonate permission ID
    print("\n1. Enabling Users management permissions...")
    user_perms = enable_users_permissions(token)
    impersonate_perm_id = user_perms.get("impersonate")
    if not impersonate_perm_id:
        print("ERROR: No 'impersonate' scope permission returned")
        sys.exit(1)
    print(f"  Impersonate permission ID: {impersonate_perm_id}")

    # Step 2: Enable candid-app client permissions → get token-exchange permission ID
    print("\n2. Enabling candid-app client permissions...")
    client_perms = enable_client_permissions(token, candid_app_uuid)
    token_exchange_perm_id = client_perms.get("token-exchange")
    if not token_exchange_perm_id:
        print("ERROR: No 'token-exchange' scope permission returned")
        sys.exit(1)
    print(f"  Token-exchange permission ID: {token_exchange_perm_id}")

    # Step 3: Create a client policy allowing candid-backend
    print("\n3. Creating client policy for candid-backend...")
    policy_id = create_client_policy(
        token, realm_mgmt_uuid,
        "candid-backend-token-exchange",
        candid_backend_uuid,
    )

    # Step 4: Associate the policy with both permissions
    print("\n4. Associating policy with impersonate permission...")
    associate_policy_with_permission(token, realm_mgmt_uuid, impersonate_perm_id, policy_id)

    print("\n5. Associating policy with token-exchange permission...")
    associate_policy_with_permission(token, realm_mgmt_uuid, token_exchange_perm_id, policy_id)

    print("\nToken exchange configuration complete!")
    print("candid-backend can now impersonate users and exchange tokens via candid-app.")


if __name__ == "__main__":
    main()
