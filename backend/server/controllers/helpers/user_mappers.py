"""User data mapping helpers — row converters, settings constants, and location utilities.

Pure functions and constants for transforming database rows into API models
and mapping settings values between user-facing labels and DB integers.
"""

from typing import Dict, List, Optional

from candid.models.current_user import CurrentUser
from candid.models.user_position import UserPosition
from candid.models.user_demographics import UserDemographics


# --- Settings mapping constants ---

WEIGHT_TO_PRIORITY = {
    'none': 0,
    'least': 1,
    'less': 2,
    'default': 3,
    'more': 4,
    'most': 5,
}

PRIORITY_TO_WEIGHT = {v: k for k, v in WEIGHT_TO_PRIORITY.items()}

LIKELIHOOD_TO_INT = {
    'off': 0,
    'rarely': 1,
    'less': 2,
    'normal': 3,
    'more': 4,
    'often': 5,
}

INT_TO_LIKELIHOOD = {v: k for k, v in LIKELIHOOD_TO_INT.items()}

NOTIFICATION_FREQ_TO_INT = {
    'off': 0,
    'rarely': 1,
    'less': 2,
    'normal': 3,
    'more': 4,
    'often': 5,
}

NOTIFICATION_FREQ_TO_LABEL = {v: k for k, v in NOTIFICATION_FREQ_TO_INT.items()}

DEMOGRAPHICS_API_TO_DB = {
    'locationId': 'location_id',
    'lean': 'lean',
    'affiliation': 'affiliation_id',
    'education': 'education',
    'geoLocale': 'geo_locale',
    'race': 'race',
    'sex': 'sex',
    'ageRange': 'age_range',
    'incomeRange': 'income_range',
}


# --- Row-to-model converters ---

def row_to_current_user(row) -> CurrentUser:
    """Convert a DB row to a CurrentUser model."""
    return CurrentUser(
        id=str(row['id']),
        username=row['username'],
        display_name=row['display_name'],
        email=row.get('email'),
        avatar_url=row.get('avatar_url'),
        avatar_icon_url=row.get('avatar_icon_url'),
        user_type=row['user_type'],
        status=row['status'],
        join_time=str(row['join_time']) if row.get('join_time') else None,
        trust_score=float(row['trust_score']) if row.get('trust_score') is not None else None,
        kudos_count=row.get('kudos_count', 0),
        diagnostics_consent=row.get('diagnostics_consent'),
    )


def row_to_user_position(row) -> UserPosition:
    """Convert a DB row to a UserPosition model."""
    return UserPosition(
        id=str(row['id']),
        user_id=str(row['user_id']),
        position_id=str(row['position_id']),
        location_id=str(row['location_id']) if row.get('location_id') else None,
        category_id=str(row['category_id']) if row.get('category_id') else None,
        category_name=row.get('category_name'),
        location_name=row.get('location_name'),
        location_code=row.get('location_code'),
        statement=row['statement'],
        status=row['status'],
        agree_count=row.get('agree_count', 0),
        disagree_count=row.get('disagree_count', 0),
        pass_count=row.get('pass_count', 0),
        chat_count=row.get('chat_count', 0),
    )


def row_to_user_demographics(row) -> UserDemographics:
    """Convert a DB row to a UserDemographics model."""
    return UserDemographics(
        location_id=str(row['location_id']) if row.get('location_id') else None,
        lean=row.get('lean'),
        affiliation=str(row['affiliation']) if row.get('affiliation') else None,
        education=row.get('education'),
        geo_locale=row.get('geo_locale'),
        race=row.get('race'),
        sex=row.get('sex'),
        age_range=row.get('age_range'),
        income_range=row.get('income_range'),
        created_time=str(row['created_time']) if row.get('created_time') else None,
    )


# --- Location hierarchy helpers ---

def compute_location_levels(locations: List[Dict]) -> List[Dict]:
    """Compute hierarchy level for each location and return sorted list.

    Level 0 = root (no parent), 1 = child, 2 = grandchild, etc.
    Returns locations sorted by (level, name).
    """
    loc_map = {loc['id']: loc for loc in locations}
    memo = {}

    def get_level(loc_id):
        if loc_id in memo:
            return memo[loc_id]
        loc = loc_map.get(loc_id)
        if not loc or not loc.get('parent_location_id'):
            memo[loc_id] = 0
            return 0
        parent_level = get_level(loc['parent_location_id'])
        memo[loc_id] = parent_level + 1
        return memo[loc_id]

    result = []
    for loc in locations:
        level = get_level(loc['id'])
        result.append({
            'id': str(loc['id']),
            'name': loc['name'],
            'code': loc['code'],
            'parentLocationId': str(loc['parent_location_id']) if loc.get('parent_location_id') else None,
            'level': level
        })

    result.sort(key=lambda x: (x['level'], x['name']))
    return result
