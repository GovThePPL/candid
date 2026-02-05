#!/usr/bin/env python3
"""
Generate test data to verify Polis clustering.

Creates 50 users across 4 distinct political belief systems and has them
vote on positions in patterns that should create clear opinion clusters.

Belief Systems:
1. MAGA (populist right) - 12 users
2. Christian Right (religious conservative) - 12 users
3. Liberal Right (classical liberal/libertarian) - 13 users
4. Socialist Left (progressive/socialist) - 13 users

Usage:
    python generate_polis_test_data.py [--dry-run] [--api-url http://localhost:8000]

Environment variables:
    API_URL: Base URL for the Candid API (default: http://localhost:8000)
"""

import argparse
import json
import os
import random
import sys
import time
import requests

API_URL = os.environ.get('API_URL', 'http://localhost:8000')

# Position statements designed to differentiate the four groups
# Each position has expected votes from each group: (MAGA, Christian, Liberal, Socialist)
# Values: 1 = agree, -1 = disagree, 0 = pass/neutral
POSITIONS = [
    # Economic positions
    {
        "statement": "The free market should operate with minimal government intervention.",
        "category": "Economy & Taxation",
        "votes": (1, 1, 1, -1)  # MAGA/Christian/Liberal agree, Socialist disagree
    },
    {
        "statement": "Wealthy corporations should pay significantly higher taxes to fund social programs.",
        "category": "Economy & Taxation",
        "votes": (-1, -1, -1, 1)  # Only Socialist agrees
    },
    {
        "statement": "Tariffs on imported goods protect American workers and should be increased.",
        "category": "Economy & Taxation",
        "votes": (1, 0, -1, 0)  # MAGA agrees, Liberal disagrees
    },
    {
        "statement": "A universal basic income would reduce poverty more effectively than current welfare programs.",
        "category": "Economy & Taxation",
        "votes": (-1, -1, 0, 1)  # Socialist agrees, MAGA/Christian disagree
    },
    {
        "statement": "Labor unions are essential for protecting workers' rights.",
        "category": "Economy & Taxation",
        "votes": (0, -1, -1, 1)  # Socialist agrees, Liberal/Christian disagree
    },

    # Social/Cultural positions
    {
        "statement": "Traditional family values should be promoted and protected by government policy.",
        "category": "Social Issues",
        "votes": (1, 1, -1, -1)  # MAGA/Christian agree, Liberal/Socialist disagree
    },
    {
        "statement": "Same-sex marriage should be legally recognized and protected.",
        "category": "Social Issues",
        "votes": (-1, -1, 1, 1)  # Liberal/Socialist agree, MAGA/Christian disagree
    },
    {
        "statement": "Transgender individuals should be able to use bathrooms matching their gender identity.",
        "category": "Social Issues",
        "votes": (-1, -1, 1, 1)  # Liberal/Socialist agree, MAGA/Christian disagree
    },
    {
        "statement": "Prayer and religious education should be allowed in public schools.",
        "category": "Social Issues",
        "votes": (1, 1, -1, -1)  # MAGA/Christian agree, Liberal/Socialist disagree
    },
    {
        "statement": "Systemic racism is a significant problem in American institutions today.",
        "category": "Civil Rights & Liberties",
        "votes": (-1, -1, 0, 1)  # Socialist agrees, MAGA/Christian disagree
    },

    # Immigration
    {
        "statement": "A physical wall on the southern border is necessary for national security.",
        "category": "Immigration",
        "votes": (1, 1, -1, -1)  # MAGA/Christian agree, Liberal/Socialist disagree
    },
    {
        "statement": "Undocumented immigrants who have lived here for years should have a path to citizenship.",
        "category": "Immigration",
        "votes": (-1, 0, 1, 1)  # Liberal/Socialist agree, MAGA disagrees
    },
    {
        "statement": "Immigration levels should be reduced to protect American jobs.",
        "category": "Immigration",
        "votes": (1, 1, -1, -1)  # MAGA/Christian agree, Liberal/Socialist disagree
    },
    {
        "statement": "Sanctuary cities that don't cooperate with federal immigration enforcement should lose funding.",
        "category": "Immigration",
        "votes": (1, 1, 0, -1)  # MAGA/Christian agree, Socialist disagrees
    },

    # Government & Democracy
    {
        "statement": "The 2020 presidential election was conducted fairly and the results were legitimate.",
        "category": "Government & Democracy",
        "votes": (-1, -1, 1, 1)  # Liberal/Socialist agree, MAGA/Christian disagree
    },
    {
        "statement": "Voter ID requirements are necessary to prevent election fraud.",
        "category": "Government & Democracy",
        "votes": (1, 1, 1, -1)  # MAGA/Christian/Liberal agree, Socialist disagrees
    },
    {
        "statement": "The federal government has become too large and should be significantly reduced.",
        "category": "Government & Democracy",
        "votes": (1, 1, 1, -1)  # MAGA/Christian/Liberal agree, Socialist disagrees
    },
    {
        "statement": "Big tech companies have too much power and should be broken up or heavily regulated.",
        "category": "Government & Democracy",
        "votes": (1, 0, -1, 1)  # MAGA/Socialist agree (different reasons), Liberal disagrees
    },

    # Healthcare
    {
        "statement": "Healthcare should be provided by the government as a right, not a privilege.",
        "category": "Healthcare",
        "votes": (-1, -1, -1, 1)  # Only Socialist agrees
    },
    {
        "statement": "Abortion should be legal and accessible in all circumstances.",
        "category": "Healthcare",
        "votes": (-1, -1, 1, 1)  # Liberal/Socialist agree, MAGA/Christian disagree
    },
    {
        "statement": "Life begins at conception and abortion is morally wrong.",
        "category": "Healthcare",
        "votes": (1, 1, -1, -1)  # MAGA/Christian agree, Liberal/Socialist disagree
    },
    {
        "statement": "Vaccine mandates are a reasonable public health measure.",
        "category": "Healthcare",
        "votes": (-1, -1, 0, 1)  # Socialist agrees, MAGA/Christian disagree
    },

    # Environment
    {
        "statement": "Climate change is an urgent crisis requiring immediate government action.",
        "category": "Environment & Climate",
        "votes": (-1, -1, 0, 1)  # Socialist agrees, MAGA/Christian disagree, Liberal neutral
    },
    {
        "statement": "Environmental regulations hurt businesses and cost jobs.",
        "category": "Environment & Climate",
        "votes": (1, 1, 1, -1)  # MAGA/Christian/Liberal agree, Socialist disagrees
    },
    {
        "statement": "The US should rejoin and strengthen the Paris Climate Agreement.",
        "category": "Environment & Climate",
        "votes": (-1, -1, 0, 1)  # Socialist agrees, MAGA/Christian disagree
    },

    # Foreign Policy
    {
        "statement": "The United States should prioritize its own interests over international cooperation.",
        "category": "Foreign Policy & Defense",
        "votes": (1, 1, 0, -1)  # MAGA/Christian agree, Socialist disagrees
    },
    {
        "statement": "NATO and our European alliances are essential for American security.",
        "category": "Foreign Policy & Defense",
        "votes": (0, 1, 1, 0)  # Christian/Liberal agree
    },
    {
        "statement": "Military spending should be significantly reduced and redirected to domestic programs.",
        "category": "Foreign Policy & Defense",
        "votes": (-1, -1, 0, 1)  # Socialist agrees, MAGA/Christian disagree
    },
    {
        "statement": "The US should continue strong military support for Israel.",
        "category": "Foreign Policy & Defense",
        "votes": (1, 1, 1, -1)  # MAGA/Christian/Liberal agree, Socialist disagrees
    },

    # Criminal Justice
    {
        "statement": "Police departments need more funding, not less.",
        "category": "Criminal Justice",
        "votes": (1, 1, 0, -1)  # MAGA/Christian agree, Socialist disagrees
    },
    {
        "statement": "The criminal justice system is biased against minorities and needs fundamental reform.",
        "category": "Criminal Justice",
        "votes": (-1, -1, 0, 1)  # Socialist agrees, MAGA/Christian disagree
    },
    {
        "statement": "Drug possession should be decriminalized and treated as a health issue.",
        "category": "Criminal Justice",
        "votes": (-1, -1, 1, 1)  # Liberal/Socialist agree, MAGA/Christian disagree
    },
    {
        "statement": "The Second Amendment guarantees an individual right to own firearms with minimal restrictions.",
        "category": "Civil Rights & Liberties",
        "votes": (1, 1, 1, -1)  # MAGA/Christian/Liberal agree, Socialist disagrees
    },

    # Education
    {
        "statement": "Parents should have the right to choose where their children go to school using public funds.",
        "category": "Education",
        "votes": (1, 1, 1, -1)  # MAGA/Christian/Liberal agree, Socialist disagrees
    },
    {
        "statement": "Critical race theory should not be taught in public schools.",
        "category": "Education",
        "votes": (1, 1, 0, -1)  # MAGA/Christian agree, Socialist disagrees
    },
    {
        "statement": "College tuition should be free at public universities.",
        "category": "Education",
        "votes": (-1, -1, -1, 1)  # Only Socialist agrees
    },
    {
        "statement": "Teachers should be paid significantly more than they currently are.",
        "category": "Education",
        "votes": (0, 0, 0, 1)  # Socialist agrees strongly, others neutral
    },
]

# User profiles for each belief system
BELIEF_SYSTEMS = {
    "maga": {
        "count": 12,
        "prefix": "maga",
        "vote_index": 0,
        "vote_noise": 0.15,  # 15% chance of deviating from expected vote
    },
    "christian": {
        "count": 12,
        "prefix": "christian",
        "vote_index": 1,
        "vote_noise": 0.15,
    },
    "liberal": {
        "count": 13,
        "prefix": "liberal",
        "vote_index": 2,
        "vote_noise": 0.20,  # Slightly more variance
    },
    "socialist": {
        "count": 13,
        "prefix": "socialist",
        "vote_index": 3,
        "vote_noise": 0.15,
    },
}


class CandidAPI:
    """Simple API client for Candid."""

    def __init__(self, base_url):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.token = None

    def register(self, username, email, password, display_name):
        """Register a new user."""
        response = self.session.post(
            f"{self.base_url}/api/v1/auth/register",
            json={
                "username": username,
                "email": email,
                "password": password,
                "displayName": display_name,
            }
        )
        if response.status_code in (200, 201):
            return response.json()
        elif response.status_code == 409:
            # User already exists
            return None
        else:
            print(f"Register failed: {response.status_code} - {response.text}")
            return None

    def login(self, username, password):
        """Login and store token."""
        response = self.session.post(
            f"{self.base_url}/api/v1/auth/login",
            json={"username": username, "password": password}
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("token")
            return True
        return False

    def get_categories(self):
        """Get all categories."""
        response = self.session.get(
            f"{self.base_url}/api/v1/categories",
            headers={"Authorization": f"Bearer {self.token}"} if self.token else {}
        )
        if response.status_code == 200:
            return response.json()
        return []

    def get_locations(self):
        """Get all locations for the current user."""
        response = self.session.get(
            f"{self.base_url}/api/v1/users/me/locations",
            headers={"Authorization": f"Bearer {self.token}"} if self.token else {}
        )
        if response.status_code == 200:
            return response.json()
        return []

    def create_position(self, statement, category_id, location_id):
        """Create a new position."""
        response = self.session.post(
            f"{self.base_url}/api/v1/positions",
            json={
                "statement": statement,
                "categoryId": category_id,
                "locationId": location_id,
            },
            headers={"Authorization": f"Bearer {self.token}"}
        )
        if response.status_code in (200, 201):
            return response.json()
        else:
            print(f"Create position failed: {response.status_code} - {response.text}")
            return None

    def vote_on_position(self, position_id, response_type):
        """Vote on a position (agree/disagree/pass)."""
        response = self.session.post(
            f"{self.base_url}/api/v1/positions/response",
            json={
                "responses": [
                    {"positionId": position_id, "response": response_type}
                ]
            },
            headers={"Authorization": f"Bearer {self.token}"}
        )
        if response.status_code in (200, 201, 204):
            return True
        else:
            # May already have voted
            return False

    def get_card_queue(self, location_id):
        """Get cards to vote on."""
        response = self.session.get(
            f"{self.base_url}/api/v1/card-queue",
            params={"locationId": location_id},
            headers={"Authorization": f"Bearer {self.token}"}
        )
        if response.status_code == 200:
            return response.json()
        return []


def get_vote_response(expected_vote, noise_level):
    """
    Convert expected vote to response, with some randomness.

    expected_vote: 1 (agree), -1 (disagree), 0 (pass)
    noise_level: probability of deviating from expected
    """
    if random.random() < noise_level:
        # Add noise - might vote differently
        options = ["agree", "disagree", "pass"]
        return random.choice(options)

    if expected_vote == 1:
        return "agree"
    elif expected_vote == -1:
        return "disagree"
    else:
        return "pass"


def main():
    parser = argparse.ArgumentParser(description='Generate Polis test data')
    parser.add_argument('--api-url', default=API_URL, help='Candid API URL')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done')
    parser.add_argument('--skip-users', action='store_true', help='Skip user creation')
    parser.add_argument('--skip-positions', action='store_true', help='Skip position creation')
    parser.add_argument('--skip-votes', action='store_true', help='Skip voting')
    args = parser.parse_args()

    api = CandidAPI(args.api_url)

    print(f"Using API: {args.api_url}")
    print(f"Creating {sum(b['count'] for b in BELIEF_SYSTEMS.values())} users across 4 belief systems")
    print(f"Creating {len(POSITIONS)} positions")
    print()

    # Get categories and location
    print("Fetching categories and locations...")

    # Login as existing user to get categories
    if not api.login("normal1", "password"):
        print("ERROR: Could not login as normal1 to fetch categories")
        sys.exit(1)

    categories = api.get_categories()
    locations = api.get_locations()

    if not categories or not locations:
        print("ERROR: Could not fetch categories or locations")
        sys.exit(1)

    # Map category names to IDs
    category_map = {c.get('name', c.get('label', '')): c['id'] for c in categories}
    # Find Oregon location (level 1 = state level)
    oregon_locations = [loc for loc in locations if loc.get('name') == 'Oregon']
    if oregon_locations:
        location_id = oregon_locations[0]['id']
    else:
        location_id = locations[0]['id']  # Fallback to first location

    print(f"Location: {locations[0].get('name', location_id)}")
    print(f"Categories: {list(category_map.keys())}")
    print()

    if args.dry_run:
        print("[DRY RUN MODE]")
        print()

    # Step 1: Create users
    users = []
    if not args.skip_users:
        print("=" * 50)
        print("STEP 1: Creating Users")
        print("=" * 50)

        for belief, config in BELIEF_SYSTEMS.items():
            print(f"\nCreating {config['count']} {belief} users...")
            for i in range(config['count']):
                username = f"{config['prefix']}_user_{i+1}"
                email = f"{username}@test.local"
                display_name = f"{belief.title()} User {i+1}"

                user = {
                    "username": username,
                    "email": email,
                    "password": "password",
                    "display_name": display_name,
                    "belief": belief,
                    "vote_index": config["vote_index"],
                    "vote_noise": config["vote_noise"],
                }
                users.append(user)

                if args.dry_run:
                    print(f"  Would create: {username}")
                else:
                    result = api.register(username, email, "password", display_name)
                    if result:
                        print(f"  Created: {username}")
                    else:
                        print(f"  Exists: {username}")

        print(f"\nTotal users: {len(users)}")
    else:
        # Reconstruct user list for voting
        for belief, config in BELIEF_SYSTEMS.items():
            for i in range(config['count']):
                username = f"{config['prefix']}_user_{i+1}"
                users.append({
                    "username": username,
                    "password": "password",
                    "belief": belief,
                    "vote_index": config["vote_index"],
                    "vote_noise": config["vote_noise"],
                })

    # Step 2: Create positions (use first user from each group)
    positions_created = []
    if not args.skip_positions:
        print()
        print("=" * 50)
        print("STEP 2: Creating Positions")
        print("=" * 50)

        # Distribute position creation across different users
        creator_users = [
            ("maga_user_1", "password"),
            ("christian_user_1", "password"),
            ("liberal_user_1", "password"),
            ("socialist_user_1", "password"),
        ]

        for i, pos_data in enumerate(POSITIONS):
            category_name = pos_data["category"]
            category_id = category_map.get(category_name)

            if not category_id:
                print(f"  WARNING: Category '{category_name}' not found, skipping position")
                continue

            # Rotate through creators
            creator = creator_users[i % len(creator_users)]

            if args.dry_run:
                print(f"  Would create: {pos_data['statement'][:50]}... [{category_name}]")
                positions_created.append({"id": f"dry-run-{i}", "statement": pos_data["statement"], "votes": pos_data["votes"]})
            else:
                if api.login(creator[0], creator[1]):
                    result = api.create_position(pos_data["statement"], category_id, location_id)
                    if result:
                        print(f"  Created: {pos_data['statement'][:50]}...")
                        positions_created.append({
                            "id": result.get("id"),
                            "statement": pos_data["statement"],
                            "votes": pos_data["votes"]
                        })
                    else:
                        print(f"  FAILED: {pos_data['statement'][:50]}...")
                else:
                    print(f"  ERROR: Could not login as {creator[0]}")

        print(f"\nPositions created: {len(positions_created)}")

    # Step 3: Have users vote on positions
    if not args.skip_votes:
        print()
        print("=" * 50)
        print("STEP 3: Voting on Positions")
        print("=" * 50)

        # Get all position cards for voting
        if not args.dry_run and not positions_created:
            # Fetch positions directly from database since card queue may not have them
            print("Fetching positions from database...")
            import psycopg2
            db_conn = psycopg2.connect(os.environ.get(
                'DATABASE_URL',
                'postgresql://user:postgres@localhost:5432/candid'
            ))
            cursor = db_conn.cursor()
            cursor.execute("""
                SELECT id, statement FROM position
                WHERE location_id = %s AND status = 'active'
                ORDER BY created_time DESC
            """, (location_id,))
            db_positions = cursor.fetchall()
            db_conn.close()

            for pos_id, statement in db_positions:
                # Find matching position in our POSITIONS list
                for pos_data in POSITIONS:
                    if pos_data["statement"] == statement:
                        positions_created.append({
                            "id": str(pos_id),
                            "statement": statement,
                            "votes": pos_data["votes"]
                        })
                        break
            print(f"Found {len(positions_created)} matching positions")

        total_votes = 0
        votes_by_type = {"agree": 0, "disagree": 0, "pass": 0}

        for user in users:
            if args.dry_run:
                print(f"\n  {user['username']} would vote on {len(POSITIONS)} positions")
                for pos_data in POSITIONS:
                    expected = pos_data["votes"][user["vote_index"]]
                    response = get_vote_response(expected, user["vote_noise"])
                    votes_by_type[response] += 1
                    total_votes += 1
            else:
                if not api.login(user["username"], user["password"]):
                    print(f"  ERROR: Could not login as {user['username']}")
                    continue

                user_votes = 0
                for pos_data in POSITIONS:
                    # Find position ID
                    pos_id = None
                    for p in positions_created:
                        if p["statement"] == pos_data["statement"]:
                            pos_id = p["id"]
                            break

                    if not pos_id:
                        continue

                    expected = pos_data["votes"][user["vote_index"]]
                    response = get_vote_response(expected, user["vote_noise"])

                    if api.vote_on_position(pos_id, response):
                        user_votes += 1
                        votes_by_type[response] += 1
                        total_votes += 1

                print(f"  {user['username']}: {user_votes} votes")

                # Small delay to avoid overwhelming the API
                time.sleep(0.1)

        print(f"\nTotal votes cast: {total_votes}")
        print(f"  Agree: {votes_by_type['agree']}")
        print(f"  Disagree: {votes_by_type['disagree']}")
        print(f"  Pass: {votes_by_type['pass']}")

    # Summary
    print()
    print("=" * 50)
    print("SUMMARY")
    print("=" * 50)

    if args.dry_run:
        print("[DRY RUN - No changes made]")

    print(f"""
Users created: {len(users)}
  - MAGA: {BELIEF_SYSTEMS['maga']['count']}
  - Christian Right: {BELIEF_SYSTEMS['christian']['count']}
  - Liberal Right: {BELIEF_SYSTEMS['liberal']['count']}
  - Socialist Left: {BELIEF_SYSTEMS['socialist']['count']}

Positions: {len(POSITIONS)}
Votes: ~{len(users) * len(POSITIONS)} (with ~15-20% noise)

Expected clusters:
  - MAGA + Christian Right often agree (social conservatism)
  - Liberal Right + Socialist Left often agree (social liberalism)
  - MAGA + Socialist sometimes agree (economic populism, anti-elite)
  - Liberal Right alone on free market + social liberal

Run the Polis backfill script to sync this data:
  docker compose exec api python3 /app/backend/scripts/backfill_polis_positions.py

Then check the stats page to see if clustering appears!
""")


if __name__ == '__main__':
    main()
