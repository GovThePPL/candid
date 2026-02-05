"""
Cache Headers Helper

Utilities for adding HTTP cache headers (Last-Modified, ETag) to responses
and checking for conditional request headers (If-Modified-Since, If-None-Match).
"""
from datetime import datetime
from hashlib import sha256
from email.utils import parsedate_to_datetime, format_datetime
from flask import request, make_response


def parse_http_date(date_str):
    """Parse an HTTP date string to a datetime object.

    :param date_str: HTTP date string (e.g., 'Tue, 15 Nov 1994 12:45:26 GMT')
    :return: datetime object or None if parsing fails
    """
    if not date_str:
        return None
    try:
        return parsedate_to_datetime(date_str)
    except (ValueError, TypeError):
        return None


def format_http_date(dt):
    """Format a datetime object as an HTTP date string.

    :param dt: datetime object
    :return: HTTP date string
    """
    if not dt:
        return None
    # Ensure timezone-aware for proper formatting
    if dt.tzinfo is None:
        # Assume UTC if no timezone
        from datetime import timezone
        dt = dt.replace(tzinfo=timezone.utc)
    return format_datetime(dt, usegmt=True)


def generate_etag(data):
    """Generate a weak ETag from data.

    :param data: Data to hash (string, dict, or other serializable)
    :return: ETag string (e.g., 'W/"abc123"')
    """
    if data is None:
        return None
    data_str = str(data)
    hash_value = sha256(data_str.encode()).hexdigest()[:16]
    return f'W/"{hash_value}"'


def add_cache_headers(response, last_modified=None, etag_data=None, max_age=None):
    """Add caching headers to a Flask response.

    :param response: Flask response object
    :param last_modified: datetime object for Last-Modified header
    :param etag_data: Data to generate ETag from
    :param max_age: Optional Cache-Control max-age in seconds
    :return: Modified response object
    """
    if last_modified:
        response.headers['Last-Modified'] = format_http_date(last_modified)

    if etag_data is not None:
        response.headers['ETag'] = generate_etag(etag_data)

    if max_age is not None:
        response.headers['Cache-Control'] = f'max-age={max_age}'

    return response


def check_not_modified(last_modified=None, etag=None):
    """Check if client cache is still valid based on conditional request headers.

    Returns True if the client's cached version is still valid (return 304).

    :param last_modified: datetime object of the resource's last modification time
    :param etag: ETag string of the current resource
    :return: True if client cache is valid (should return 304), False otherwise
    """
    # Check If-None-Match (ETag comparison)
    client_etag = request.headers.get('If-None-Match')
    if etag and client_etag:
        # Handle both weak and strong ETags
        # Strip W/ prefix for comparison if present
        clean_client_etag = client_etag.strip()
        clean_server_etag = etag.strip()

        # Weak comparison: W/"abc" matches "abc" and W/"abc"
        if clean_client_etag.startswith('W/'):
            clean_client_etag = clean_client_etag[2:]
        if clean_server_etag.startswith('W/'):
            clean_server_etag = clean_server_etag[2:]

        if clean_client_etag == clean_server_etag:
            return True

    # Check If-Modified-Since (date comparison)
    client_date_str = request.headers.get('If-Modified-Since')
    if last_modified and client_date_str:
        client_date = parse_http_date(client_date_str)
        if client_date:
            # Ensure both are timezone-aware for comparison
            if last_modified.tzinfo is None:
                from datetime import timezone
                last_modified = last_modified.replace(tzinfo=timezone.utc)
            if client_date.tzinfo is None:
                client_date = client_date.replace(tzinfo=timezone.utc)

            # Resource not modified if client date >= server date
            # (using >= because HTTP dates have 1-second resolution)
            if client_date >= last_modified:
                return True

    return False


def make_304_response():
    """Create a 304 Not Modified response.

    :return: Flask response with 304 status
    """
    response = make_response('', 304)
    return response
