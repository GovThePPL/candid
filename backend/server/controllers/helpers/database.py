import os
import logging
import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

logger = logging.getLogger(__name__)


class DatabaseError(Exception):
	"""Raised by execute_query when raise_on_error=True."""
	pass


class Database:
	def __init__(self, config):
		self.pool = None
		self.connect_to_db(config)

	def connect_to_db(self, config):
		"""Establishes a connection pool."""
		try:
			minconn = int(os.environ.get('DB_POOL_MIN', 4))
			maxconn = int(os.environ.get('DB_POOL_MAX', 20))
			self.pool = ThreadedConnectionPool(
				minconn=minconn,
				maxconn=maxconn,
				dsn=config['SQLALCHEMY_DATABASE_URI']
			)
			logger.info(f"Database connection pool established (min={minconn}, max={maxconn}).")
		except psycopg2.Error as e:
			self.pool = None
			logger.error(f"Error creating database connection pool: {e}", exc_info=True)

	def execute_query(self, query, params=None, fetchone=False, executemany=False, raise_on_error=False):
		"""Executes a SQL query using a connection from the pool.

		Args:
			raise_on_error: If True, raises DatabaseError instead of returning None.
		"""
		if self.pool is None:
			logger.error("Database connection pool not established. Call connect_to_db() first.")
			if raise_on_error:
				raise DatabaseError("Database connection pool not established")
			return None

		conn = self.pool.getconn()
		try:
			query_upper = query.strip().upper()
			is_select = query_upper.startswith("SELECT")
			if query_upper.startswith("WITH"):
				# CTE: check if the main statement (after CTEs) is a SELECT or DML
				is_select = not any(
					kw in query_upper for kw in ("UPDATE ", "INSERT ", "DELETE ")
				)
			has_returning = "RETURNING" in query_upper
			with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
				if executemany:
					cur.executemany(query, params)
				else:
					cur.execute(query, params)
				retval = None
				if is_select or has_returning:
					try:
						if fetchone:
							retval = cur.fetchone()
						else:
							retval = cur.fetchall()
					except psycopg2.ProgrammingError:
						retval = None
				if not is_select:
					conn.commit()

				return retval
		except psycopg2.Error as e:
			logger.error(f"Error executing query: {e}", exc_info=True)
			conn.rollback()
			if raise_on_error:
				raise DatabaseError(str(e)) from e
			return None
		finally:
			self.pool.putconn(conn)

	def close_db_connection(self):
		"""Closes all connections in the pool."""
		if self.pool:
			self.pool.closeall()
			logger.info("Database connection pool closed.")
			self.pool = None
