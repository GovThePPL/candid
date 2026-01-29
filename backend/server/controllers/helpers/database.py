import psycopg2
import psycopg2.extras

class Database:
	def __init__(self, config):
		self.db = None
		self.connect_to_db(config)

	def connect_to_db(self, config):
		"""Establishes a global database connection."""
		try:
			self.db = psycopg2.connect(config['SQLALCHEMY_DATABASE_URI'])
			print("Database connection established.")
		except psycopg2.Error as e:
			self.db = None
			print(f"Error connecting to database: {e}")

	def execute_query(self, query, params=None, fetchone=False, executemany=False):
		"""Executes a SQL query using the global connection."""
		if self.db is None:
			print("Database connection not established. Call connect_to_db() first.")
			return None

		try:
			is_select = query.strip().upper().startswith("SELECT")
			with self.db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
				if executemany:
					cur.executemany(query, params)
				else:
					cur.execute(query, params)
				retval = None
				if is_select:
					if fetchone:
						retval = cur.fetchone()
					else:
						retval = cur.fetchall()
				if not is_select:
					self.db.commit()  # Commit changes for DML operations

				return retval  # No rows to fetch for DML
		except psycopg2.Error as e:
			print(f"Error executing query: {e}", flush=True)
			self.db.rollback()  # Rollback changes on error
			return None

	def close_db_connection(self):
		"""Closes the global database connection."""
		if self.db:
			self.db.close()
			print("Database connection closed.")
			self.db = None

