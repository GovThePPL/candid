import psycopg2
import psycopg2.extras

db = None

def connect_to_db(config):
	"""Establishes a global database connection."""
	global db
	try:
		db = psycopg2.connect(config['SQLALCHEMY_DATABASE_URI'])
		print("Database connection established.")
	except psycopg2.Error as e:
		print(f"Error connecting to database: {e}")

def execute_query(query, params=None):
	"""Executes a SQL query using the global connection."""
	if db is None:
		print("Database connection not established. Call connect_to_db() first.")
		return None

	try:
		is_select = query.strip().upper().startswith("SELECT")
		is_insert = query.strip().upper().startswith("INSERT")
		with db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
			cur.execute(query, params)
			retval = None
			if is_select:
				retval = cur.fetchall()
			if is_insert:
				retval = cur.fetchone()['id']

			db.commit()  # Commit changes for DML operations
			return retval  # No rows to fetch for DML
	except psycopg2.Error as e:
		print(f"Error executing query: {e}")
		db.rollback()  # Rollback changes on error
		return None

def close_db_connection():
	"""Closes the global database connection."""
	global db
	if db:
		db.close()
		print("Database connection closed.")
		db = None

def map_query_to_class(rows, target_class):
	results = []

	if rows:
		for row in rows:
			# Create an instance of the target class
			instance = target_class()

			# Map column values to instance variables by name
			for col, val in row.items():
				# TODO use reflection to make this safer. we only want to map to attributes that are actually
				# on the class. better yet, we should find a way to flag attributes as being mapped from the db.
				setattr(instance, col, val)

			results.append(instance)

	return results