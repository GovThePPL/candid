"""Consolidated authentication-required tests for all protected endpoints.

This file replaces ~55 individual test_unauthenticated_returns_401 methods
that were scattered across every integration test file. Those tests all
verified the same thing: Connexion's security middleware rejects requests
with no auth token before reaching controller logic.

Having them here as a single parametrized test:
  - Catches a missing @authorize() decorator on any endpoint
  - Runs as one fast batch instead of 55 separate fixtures
  - Prevents duplication — new endpoints are added to PROTECTED_ENDPOINTS

DO NOT add per-endpoint test_unauthenticated methods in other test files.
Add the endpoint here instead.
"""

import pytest
import requests

BASE_URL = "http://127.0.0.1:8000/api/v1"

# (method, path) — every protected endpoint that should return 401 without a token.
# Paths use placeholder UUIDs where needed; the auth check runs before resource lookup.
_UUID = "00000000-0000-0000-0000-000000000000"

PROTECTED_ENDPOINTS = [
    # --- Users / Profile ---
    ("GET",    "/users/me"),
    ("PATCH",  "/users/me"),
    ("GET",    f"/users/{_UUID}"),
    ("POST",   "/users/me/delete"),
    ("POST",   "/users/me/push-token"),
    ("POST",   "/users/me/avatar"),

    # --- User demographics ---
    ("GET",    "/users/me/demographics"),
    ("PUT",    "/users/me/demographics"),
    ("PATCH",  "/users/me/demographics"),

    # --- User settings ---
    ("GET",    "/users/me/settings"),
    ("PUT",    "/users/me/settings"),

    # --- User positions ---
    ("GET",    "/users/me/positions"),
    ("PATCH",  f"/users/me/positions/{_UUID}"),
    ("DELETE", f"/users/me/positions/{_UUID}"),
    ("GET",    "/users/me/positions/metadata"),

    # --- User locations ---
    ("GET",    "/users/me/locations"),
    ("PUT",    "/users/me/locations"),

    # --- Locations (now public, no auth required) ---
    # ("GET",    "/locations"),

    # --- Categories ---
    ("GET",    "/categories"),
    ("POST",   "/categories/suggest"),

    # --- Positions ---
    ("GET",    f"/positions/{_UUID}"),
    ("POST",   "/positions"),
    ("POST",   "/positions/response"),
    ("POST",   f"/positions/{_UUID}/adopt"),
    ("POST",   "/positions/search"),
    ("GET",    f"/positions/{_UUID}/agreed-closures"),
    ("POST",   "/positions/search-stats"),

    # --- Card queue ---
    ("GET",    "/card-queue"),

    # --- Chat requests ---
    ("POST",   "/chats/requests/"),
    ("GET",    f"/chats/{_UUID}/log"),
    ("GET",    f"/chats/user/{_UUID}"),
    ("POST",   f"/chats/{_UUID}/kudos"),
    ("POST",   f"/chats/{_UUID}/kudos/dismiss"),
    ("GET",    f"/chats/user/{_UUID}/metadata"),

    # --- Chat matching ---
    ("POST",   "/users/me/heartbeat"),

    # --- Chatting list ---
    ("GET",    "/users/me/chatting-list/metadata"),
    ("POST",   "/users/me/chatting-list/explanation-seen"),
    ("POST",   "/users/me/chatting-list/bulk-remove"),
    ("PATCH",  f"/users/me/chatting-list/{_UUID}"),
    ("DELETE", f"/users/me/chatting-list/{_UUID}"),

    # --- Surveys ---
    ("GET",    "/surveys"),
    ("GET",    f"/surveys/{_UUID}"),
    ("POST",   f"/surveys/{_UUID}/questions/{_UUID}/response"),

    # --- Survey results ---
    ("GET",    f"/surveys/{_UUID}/results"),
    ("GET",    f"/surveys/{_UUID}/questions/{_UUID}/crosstabs"),

    # --- Pairwise surveys ---
    ("GET",    "/surveys/pairwise"),
    ("POST",   f"/pairwise/{_UUID}/respond"),
    ("POST",   "/admin/surveys/pairwise"),

    # --- Stats ---
    ("GET",    f"/stats/{_UUID}/{_UUID}"),
    ("GET",    f"/stats/{_UUID}"),
    ("GET",    f"/stats/{_UUID}/{_UUID}/demographics/all"),

    # --- Moderation ---
    ("POST",   f"/positions/{_UUID}/report"),
    ("POST",   f"/chats/{_UUID}/report"),
    ("GET",    "/moderation/queue"),
    ("POST",   f"/moderation/reports/{_UUID}/response"),
    ("POST",   f"/moderation/appeals/{_UUID}/response"),
    ("GET",    "/rules"),
    ("POST",   f"/moderation/notifications/{_UUID}/dismiss-admin-response"),

    # --- Bug reports ---
    ("POST",   "/bug-reports"),
    ("PUT",    "/users/me/diagnostics-consent"),

    # --- Admin role management ---
    ("GET",    "/admin/roles"),
    ("POST",   "/admin/roles"),
    ("POST",   "/admin/roles/remove"),
    ("GET",    "/admin/roles/pending"),
    ("POST",   f"/admin/roles/requests/{_UUID}/approve"),
    ("POST",   f"/admin/roles/requests/{_UUID}/deny"),

    # --- Admin location management ---
    ("POST",   "/admin/locations"),
    ("PUT",    f"/admin/locations/{_UUID}"),
    ("DELETE", f"/admin/locations/{_UUID}"),
    ("POST",   f"/admin/locations/{_UUID}/categories"),
    ("DELETE", f"/admin/locations/{_UUID}/categories/{_UUID}"),
]


@pytest.mark.parametrize(
    "method,path",
    PROTECTED_ENDPOINTS,
    ids=[f"{m} {p}" for m, p in PROTECTED_ENDPOINTS],
)
def test_unauthenticated_returns_401(method, path):
    """Every protected endpoint must return 401 when no auth token is provided."""
    url = f"{BASE_URL}{path}"
    # POST/PUT/PATCH need a body to avoid 415; content doesn't matter since
    # the auth check runs before body parsing.
    kwargs = {}
    if method in ("POST", "PUT", "PATCH"):
        kwargs["json"] = {}

    resp = getattr(requests, method.lower())(url, **kwargs)
    assert resp.status_code == 401, (
        f"{method} {path} returned {resp.status_code}, expected 401"
    )
