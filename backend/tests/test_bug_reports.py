"""Tests for bug reports and diagnostics consent endpoints."""
# Auth tests (test_unauthenticated_returns_401) live in test_auth_required.py.

import pytest
import requests
from conftest import (
    BASE_URL,
    NORMAL1_ID,
    db_execute,
    db_query,
    db_query_one,
)


class TestCreateBugReport:
    """POST /bug-reports"""

    def _cleanup(self, user_id):
        db_execute("DELETE FROM bug_report WHERE user_id = %s", (user_id,))

    @pytest.mark.mutation
    def test_user_report_success(self, normal_headers):
        """Can submit a manual bug report with description."""
        try:
            resp = requests.post(
                f"{BASE_URL}/bug-reports",
                headers=normal_headers,
                json={
                    "source": "user",
                    "description": "Something broke on the settings page",
                },
            )
            assert resp.status_code == 201
            data = resp.json()
            assert data["source"] == "user"
            assert data["description"] == "Something broke on the settings page"
            assert "id" in data
            assert "createdTime" in data
        finally:
            self._cleanup(NORMAL1_ID)

    @pytest.mark.mutation
    def test_auto_report_success(self, normal_headers):
        """Can submit an auto report with error metrics."""
        try:
            resp = requests.post(
                f"{BASE_URL}/bug-reports",
                headers=normal_headers,
                json={
                    "source": "auto",
                    "errorMetrics": {"errors": [{"message": "TypeError", "count": 3}]},
                    "clientContext": {"screen": "cards", "appVersion": "1.0.0"},
                },
            )
            assert resp.status_code == 201
            data = resp.json()
            assert data["source"] == "auto"
            assert data["errorMetrics"] is not None
            assert data["clientContext"] is not None
        finally:
            self._cleanup(NORMAL1_ID)

    @pytest.mark.mutation
    def test_crash_report_success(self, normal_headers):
        """Can submit a crash report with error metrics."""
        try:
            resp = requests.post(
                f"{BASE_URL}/bug-reports",
                headers=normal_headers,
                json={
                    "source": "crash",
                    "errorMetrics": {"crashStack": "Error at line 42"},
                },
            )
            assert resp.status_code == 201
            assert resp.json()["source"] == "crash"
        finally:
            self._cleanup(NORMAL1_ID)

    def test_user_report_missing_description_400(self, normal_headers):
        """Manual bug report without description returns 400."""
        resp = requests.post(
            f"{BASE_URL}/bug-reports",
            headers=normal_headers,
            json={"source": "user"},
        )
        assert resp.status_code == 400

    def test_user_report_empty_description_400(self, normal_headers):
        """Manual bug report with empty description returns 400."""
        resp = requests.post(
            f"{BASE_URL}/bug-reports",
            headers=normal_headers,
            json={"source": "user", "description": "   "},
        )
        assert resp.status_code == 400

    def test_auto_report_missing_metrics_400(self, normal_headers):
        """Auto report without error metrics returns 400."""
        resp = requests.post(
            f"{BASE_URL}/bug-reports",
            headers=normal_headers,
            json={"source": "auto"},
        )
        assert resp.status_code == 400

    def test_invalid_source_400(self, normal_headers):
        """Invalid source returns 400."""
        resp = requests.post(
            f"{BASE_URL}/bug-reports",
            headers=normal_headers,
            json={"source": "invalid", "description": "test"},
        )
        assert resp.status_code == 400

    @pytest.mark.mutation
    def test_banned_user_can_submit(self, normal_headers):
        """Banned users can still submit bug reports."""
        try:
            db_execute("UPDATE users SET status = 'banned' WHERE id = %s", (NORMAL1_ID,))
            resp = requests.post(
                f"{BASE_URL}/bug-reports",
                headers=normal_headers,
                json={"source": "user", "description": "I got banned unfairly"},
            )
            assert resp.status_code == 201
        finally:
            db_execute("UPDATE users SET status = 'active' WHERE id = %s", (NORMAL1_ID,))
            self._cleanup(NORMAL1_ID)

    @pytest.mark.mutation
    def test_description_is_trimmed(self, normal_headers):
        """Description whitespace is trimmed."""
        try:
            resp = requests.post(
                f"{BASE_URL}/bug-reports",
                headers=normal_headers,
                json={"source": "user", "description": "  trimmed  "},
            )
            assert resp.status_code == 201
            assert resp.json()["description"] == "trimmed"
        finally:
            self._cleanup(NORMAL1_ID)

    @pytest.mark.mutation
    def test_old_reports_cleaned_up(self, normal_headers):
        """Reports older than 30 days are automatically cleaned up."""
        try:
            # Insert an old report directly
            db_execute("""
                INSERT INTO bug_report (user_id, description, source, created_time)
                VALUES (%s, 'old report', 'user', NOW() - INTERVAL '31 days')
            """, (NORMAL1_ID,))

            # Submit a new report (triggers cleanup)
            resp = requests.post(
                f"{BASE_URL}/bug-reports",
                headers=normal_headers,
                json={"source": "user", "description": "new report"},
            )
            assert resp.status_code == 201

            # Old report should be gone
            rows = db_query(
                "SELECT * FROM bug_report WHERE user_id = %s AND description = 'old report'",
                (NORMAL1_ID,),
            )
            assert len(rows) == 0
        finally:
            self._cleanup(NORMAL1_ID)


class TestUpdateDiagnosticsConsent:
    """PUT /users/me/diagnostics-consent"""

    def _cleanup(self, user_id):
        db_execute(
            "UPDATE users SET diagnostics_consent = NULL WHERE id = %s",
            (user_id,),
        )

    @pytest.mark.mutation
    def test_opt_in(self, normal_headers):
        """Can opt in to diagnostics."""
        try:
            resp = requests.put(
                f"{BASE_URL}/users/me/diagnostics-consent",
                headers=normal_headers,
                json={"consent": True},
            )
            assert resp.status_code == 200
            assert resp.json()["diagnosticsConsent"] is True

            # Verify in DB
            row = db_query_one(
                "SELECT diagnostics_consent FROM users WHERE id = %s",
                (NORMAL1_ID,),
            )
            assert row["diagnostics_consent"] is True
        finally:
            self._cleanup(NORMAL1_ID)

    @pytest.mark.mutation
    def test_opt_out(self, normal_headers):
        """Can opt out of diagnostics."""
        try:
            resp = requests.put(
                f"{BASE_URL}/users/me/diagnostics-consent",
                headers=normal_headers,
                json={"consent": False},
            )
            assert resp.status_code == 200
            assert resp.json()["diagnosticsConsent"] is False
        finally:
            self._cleanup(NORMAL1_ID)

    def test_missing_consent_400(self, normal_headers):
        """Missing consent field returns 400."""
        resp = requests.put(
            f"{BASE_URL}/users/me/diagnostics-consent",
            headers=normal_headers,
            json={},
        )
        assert resp.status_code == 400

    @pytest.mark.mutation
    def test_consent_appears_in_current_user(self, normal_headers):
        """diagnosticsConsent field appears in GET /users/me response."""
        try:
            # Opt in
            requests.put(
                f"{BASE_URL}/users/me/diagnostics-consent",
                headers=normal_headers,
                json={"consent": True},
            )

            # Check it shows up in /users/me
            resp = requests.get(f"{BASE_URL}/users/me", headers=normal_headers)
            assert resp.status_code == 200
            assert resp.json()["diagnosticsConsent"] is True
        finally:
            self._cleanup(NORMAL1_ID)

    @pytest.mark.mutation
    def test_null_consent_in_current_user(self, normal_headers):
        """diagnosticsConsent is null for users who haven't been asked."""
        self._cleanup(NORMAL1_ID)
        resp = requests.get(f"{BASE_URL}/users/me", headers=normal_headers)
        assert resp.status_code == 200
        assert resp.json().get("diagnosticsConsent") is None
