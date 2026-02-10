"""Unit tests for database.py — connection pool and query execution."""

import pytest
from unittest.mock import patch, MagicMock, PropertyMock

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Database.__init__
# ---------------------------------------------------------------------------

class TestDatabaseInit:
    def test_creates_pool(self):
        mock_pool_class = MagicMock()
        mock_pool = MagicMock()
        mock_pool_class.return_value = mock_pool

        with patch("candid.controllers.helpers.database.ThreadedConnectionPool", mock_pool_class), \
             patch.dict("os.environ", {"DB_POOL_MIN": "2", "DB_POOL_MAX": "10"}):
            from candid.controllers.helpers.database import Database
            db = Database({"SQLALCHEMY_DATABASE_URI": "postgresql://test:test@localhost/test"})
            assert db.pool is not None
            mock_pool_class.assert_called_once_with(
                minconn=2, maxconn=10,
                dsn="postgresql://test:test@localhost/test"
            )

    def test_default_pool_sizes(self):
        mock_pool_class = MagicMock()

        with patch("candid.controllers.helpers.database.ThreadedConnectionPool", mock_pool_class), \
             patch.dict("os.environ", {}, clear=True):
            from candid.controllers.helpers.database import Database
            db = Database({"SQLALCHEMY_DATABASE_URI": "postgresql://test:test@localhost/test"})
            call_kwargs = mock_pool_class.call_args[1]
            assert call_kwargs["minconn"] == 4
            assert call_kwargs["maxconn"] == 20

    def test_pool_creation_failure(self):
        import psycopg2
        mock_pool_class = MagicMock(side_effect=psycopg2.Error("connection refused"))

        with patch("candid.controllers.helpers.database.ThreadedConnectionPool", mock_pool_class):
            from candid.controllers.helpers.database import Database
            db = Database({"SQLALCHEMY_DATABASE_URI": "postgresql://bad"})
            assert db.pool is None


# ---------------------------------------------------------------------------
# Database.execute_query
# ---------------------------------------------------------------------------

class TestExecuteQuery:
    def _make_db(self):
        """Create a Database instance with a mocked pool."""
        mock_pool = MagicMock()
        mock_conn = MagicMock()
        mock_cursor = MagicMock()

        # cursor context manager
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        mock_pool.getconn.return_value = mock_conn

        from candid.controllers.helpers.database import Database
        db = Database.__new__(Database)
        db.pool = mock_pool
        return db, mock_pool, mock_conn, mock_cursor

    def test_select_returns_fetchall(self):
        db, pool, conn, cursor = self._make_db()
        cursor.fetchall.return_value = [{"id": 1}, {"id": 2}]

        result = db.execute_query("SELECT * FROM users")
        assert result == [{"id": 1}, {"id": 2}]
        cursor.fetchall.assert_called_once()
        conn.commit.assert_not_called()

    def test_select_fetchone(self):
        db, pool, conn, cursor = self._make_db()
        cursor.fetchone.return_value = {"id": 1}

        result = db.execute_query("SELECT * FROM users WHERE id = %s", ("u1",), fetchone=True)
        assert result == {"id": 1}
        cursor.fetchone.assert_called_once()

    def test_with_cte_treated_as_select(self):
        db, pool, conn, cursor = self._make_db()
        cursor.fetchall.return_value = [{"id": 1}]

        result = db.execute_query("WITH x AS (SELECT 1) SELECT * FROM x")
        assert result == [{"id": 1}]
        conn.commit.assert_not_called()

    def test_insert_commits(self):
        db, pool, conn, cursor = self._make_db()

        result = db.execute_query("INSERT INTO users (name) VALUES (%s)", ("alice",))
        assert result is None
        conn.commit.assert_called_once()

    def test_update_commits(self):
        db, pool, conn, cursor = self._make_db()

        db.execute_query("UPDATE users SET name = %s WHERE id = %s", ("bob", "u1"))
        conn.commit.assert_called_once()

    def test_delete_commits(self):
        db, pool, conn, cursor = self._make_db()

        db.execute_query("DELETE FROM users WHERE id = %s", ("u1",))
        conn.commit.assert_called_once()

    def test_returning_clause_fetches_results(self):
        db, pool, conn, cursor = self._make_db()
        cursor.fetchall.return_value = [{"id": "u1", "name": "alice"}]

        result = db.execute_query(
            "INSERT INTO users (name) VALUES (%s) RETURNING id, name", ("alice",))
        assert result == [{"id": "u1", "name": "alice"}]
        conn.commit.assert_called_once()

    def test_returning_fetchone(self):
        db, pool, conn, cursor = self._make_db()
        cursor.fetchone.return_value = {"id": "u1"}

        result = db.execute_query(
            "UPDATE users SET name = %s RETURNING id", ("bob",), fetchone=True)
        assert result == {"id": "u1"}

    def test_executemany(self):
        db, pool, conn, cursor = self._make_db()

        params = [("alice",), ("bob",)]
        db.execute_query("INSERT INTO users (name) VALUES (%s)", params, executemany=True)
        cursor.executemany.assert_called_once()
        conn.commit.assert_called_once()

    def test_error_rolls_back(self):
        import psycopg2
        db, pool, conn, cursor = self._make_db()
        cursor.execute.side_effect = psycopg2.Error("syntax error")

        result = db.execute_query("INVALID SQL")
        assert result is None
        conn.rollback.assert_called_once()

    def test_connection_returned_to_pool(self):
        db, pool, conn, cursor = self._make_db()
        cursor.fetchall.return_value = []

        db.execute_query("SELECT 1")
        pool.putconn.assert_called_once_with(conn)

    def test_connection_returned_on_error(self):
        import psycopg2
        db, pool, conn, cursor = self._make_db()
        cursor.execute.side_effect = psycopg2.Error("fail")

        db.execute_query("SELECT 1")
        pool.putconn.assert_called_once_with(conn)

    def test_none_pool_returns_none(self):
        from candid.controllers.helpers.database import Database
        db = Database.__new__(Database)
        db.pool = None

        result = db.execute_query("SELECT 1")
        assert result is None

    def test_parameterized_query(self):
        db, pool, conn, cursor = self._make_db()

        db.execute_query("SELECT * FROM users WHERE id = %s", ("u1",))
        cursor.execute.assert_called_once_with("SELECT * FROM users WHERE id = %s", ("u1",))


# ---------------------------------------------------------------------------
# Database.close_db_connection
# ---------------------------------------------------------------------------

class TestCloseDbConnection:
    def test_closes_pool(self):
        from candid.controllers.helpers.database import Database
        db = Database.__new__(Database)
        mock_pool = MagicMock()
        db.pool = mock_pool

        db.close_db_connection()
        mock_pool.closeall.assert_called_once()
        assert db.pool is None

    def test_idempotent_close(self):
        from candid.controllers.helpers.database import Database
        db = Database.__new__(Database)
        db.pool = None

        # Should not raise
        db.close_db_connection()
        assert db.pool is None
