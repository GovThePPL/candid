"""Ranked-Choice Voting tally: Condorcet method with IRV fallback.

Condorcet: find a candidate who beats every other candidate head-to-head.
If no Condorcet winner exists (cycle), fall back to Instant Runoff Voting.
For multi-winner elections, use sequential elimination: find winner, remove
from ballots, repeat.
"""

import logging
import random
from collections import defaultdict

logger = logging.getLogger(__name__)


def build_pairwise_matrix(ballots, candidates):
    """Build a pairwise preference matrix from ranked ballots.

    Args:
        ballots: list of lists of (proposal_post_id, rank) sorted by rank.
            Unranked candidates are considered less preferred than all ranked ones.
        candidates: set of proposal_post_id strings.

    Returns:
        dict of {(a, b): count} where count = number of ballots preferring a over b.
    """
    matrix = defaultdict(int)
    candidate_list = sorted(candidates)

    for ballot in ballots:
        # Build rank lookup; unranked candidates get rank = infinity
        rank_of = {}
        for pid, rank in ballot:
            if pid in candidates:
                rank_of[pid] = rank

        for i, a in enumerate(candidate_list):
            for b in candidate_list[i + 1:]:
                rank_a = rank_of.get(a, float('inf'))
                rank_b = rank_of.get(b, float('inf'))
                if rank_a < rank_b:
                    matrix[(a, b)] += 1
                elif rank_b < rank_a:
                    matrix[(b, a)] += 1
                # tie (both unranked or same rank) → no preference recorded

    return dict(matrix)


def find_condorcet_winner(matrix, candidates):
    """Find the Condorcet winner if one exists.

    A Condorcet winner beats every other candidate in pairwise comparison.

    Returns:
        proposal_post_id of winner, or None if no Condorcet winner.
    """
    candidate_list = sorted(candidates)

    for candidate in candidate_list:
        wins_all = True
        for opponent in candidate_list:
            if opponent == candidate:
                continue
            # candidate must beat opponent
            votes_for = matrix.get((candidate, opponent), 0)
            votes_against = matrix.get((opponent, candidate), 0)
            if votes_for <= votes_against:
                wins_all = False
                break
        if wins_all:
            return candidate

    return None


def run_irv(ballots, candidates):
    """Run Instant Runoff Voting.

    Args:
        ballots: list of lists of (proposal_post_id, rank) sorted by rank.
        candidates: set of proposal_post_id strings.

    Returns:
        (winner_id, rounds) where rounds is a list of dicts describing each
        elimination round.
    """
    remaining = set(candidates)
    rounds = []

    # Filter ballots to only include remaining candidates
    def active_ballots():
        result = []
        for ballot in ballots:
            filtered = [(pid, rank) for pid, rank in ballot if pid in remaining]
            if filtered:
                # Re-rank: assign sequential ranks based on original order
                filtered.sort(key=lambda x: x[1])
                result.append(filtered)
        return result

    round_num = 0
    while len(remaining) > 1:
        round_num += 1
        current_ballots = active_ballots()
        total_votes = len(current_ballots)

        if total_votes == 0:
            # No valid ballots remain — pick randomly from remaining
            winner = random.choice(sorted(remaining))
            rounds.append({
                'round': round_num,
                'counts': {},
                'eliminated': None,
                'note': 'No valid ballots; random selection',
            })
            return winner, rounds

        # Count first-preference votes
        first_pref = defaultdict(int)
        for cid in remaining:
            first_pref[cid] = 0
        for ballot in current_ballots:
            first_choice = ballot[0][0]
            first_pref[first_choice] += 1

        # Check for majority
        majority_threshold = total_votes / 2
        for cid in sorted(remaining):
            if first_pref[cid] > majority_threshold:
                rounds.append({
                    'round': round_num,
                    'counts': dict(first_pref),
                    'eliminated': None,
                    'winner': cid,
                })
                return cid, rounds

        # Find candidate with fewest first-preference votes
        min_votes = min(first_pref[c] for c in remaining)
        losers = [c for c in remaining if first_pref[c] == min_votes]

        # Tiebreak: among losers, eliminate the one with fewest second-preference votes
        if len(losers) > 1:
            # Count second preferences for tiebreaking
            second_pref = defaultdict(int)
            for ballot in current_ballots:
                if len(ballot) >= 2:
                    second_choice = ballot[1][0]
                    if second_choice in losers:
                        second_pref[second_choice] += 1
            min_second = min(second_pref.get(c, 0) for c in losers)
            losers = [c for c in losers if second_pref.get(c, 0) == min_second]

        # If still tied, pick deterministically (sorted order for reproducibility)
        eliminated = sorted(losers)[0]

        rounds.append({
            'round': round_num,
            'counts': dict(first_pref),
            'eliminated': eliminated,
        })

        remaining.discard(eliminated)

    # One candidate remaining
    winner = next(iter(remaining)) if remaining else None
    return winner, rounds


def tally_results(voting_round_id, db):
    """Compute election results for a voting round.

    Uses Condorcet method with IRV fallback. Supports multi-winner via
    sequential elimination.

    Args:
        voting_round_id: UUID string of the voting round.
        db: Database instance.

    Returns:
        dict with keys: method, winners, condorcetMatrix, irvRounds,
        totalBallots, candidates.
    """
    # Get voting round info
    vr = db.execute_query(
        "SELECT winner_count FROM voting_round WHERE id = %s",
        (voting_round_id,), fetchone=True,
    )
    if not vr:
        return None

    winner_count = vr['winner_count']

    # Get candidates
    candidate_rows = db.execute_query("""
        SELECT vrc.proposal_post_id, vrc.endorsement_count, vrc.display_order,
               p.title
        FROM voting_round_candidate vrc
        JOIN post p ON p.id = vrc.proposal_post_id
        WHERE vrc.voting_round_id = %s
        ORDER BY vrc.display_order
    """, (voting_round_id,))

    if not candidate_rows:
        return {
            'method': 'condorcet',
            'winners': [],
            'condorcetMatrix': None,
            'irvRounds': None,
            'totalBallots': 0,
            'candidates': [],
        }

    candidates_info = {
        str(r['proposal_post_id']): {
            'proposalPostId': str(r['proposal_post_id']),
            'title': r['title'],
            'endorsementCount': r['endorsement_count'],
            'displayOrder': r['display_order'],
        }
        for r in candidate_rows
    }
    candidate_ids = set(candidates_info.keys())

    # Get all ballots with rankings
    ballot_rows = db.execute_query("""
        SELECT b.id AS ballot_id, r.proposal_post_id, r.rank
        FROM rcv_ballot b
        JOIN rcv_ranking r ON r.ballot_id = b.id
        WHERE b.voting_round_id = %s
        ORDER BY b.id, r.rank
    """, (voting_round_id,))

    # Group rankings by ballot
    ballots_by_id = defaultdict(list)
    for row in (ballot_rows or []):
        ballots_by_id[str(row['ballot_id'])].append(
            (str(row['proposal_post_id']), row['rank'])
        )
    ballots = list(ballots_by_id.values())
    total_ballots = len(ballots)

    # Sequential Condorcet+IRV for multi-winner
    winners = []
    remaining_candidates = set(candidate_ids)
    current_ballots = [list(b) for b in ballots]
    method = 'condorcet'
    all_irv_rounds = []
    last_matrix = None

    for seat in range(min(winner_count, len(candidate_ids))):
        if len(remaining_candidates) <= 0:
            break

        if len(remaining_candidates) == 1:
            winner = next(iter(remaining_candidates))
            winners.append({'proposalPostId': winner, 'rank': seat + 1})
            remaining_candidates.discard(winner)
            break

        # Build pairwise matrix for remaining candidates
        matrix = build_pairwise_matrix(current_ballots, remaining_candidates)
        if seat == 0:
            last_matrix = matrix

        # Try Condorcet
        condorcet_winner = find_condorcet_winner(matrix, remaining_candidates)

        if condorcet_winner:
            winners.append({'proposalPostId': condorcet_winner, 'rank': seat + 1})
            remaining_candidates.discard(condorcet_winner)
            # Remove winner from all ballots
            current_ballots = [
                [(pid, rank) for pid, rank in b if pid != condorcet_winner]
                for b in current_ballots
            ]
        else:
            # IRV fallback
            method = 'irv'
            irv_winner, irv_rounds = run_irv(current_ballots, remaining_candidates)
            all_irv_rounds.extend(irv_rounds)
            if irv_winner:
                winners.append({'proposalPostId': irv_winner, 'rank': seat + 1})
                remaining_candidates.discard(irv_winner)
                current_ballots = [
                    [(pid, rank) for pid, rank in b if pid != irv_winner]
                    for b in current_ballots
                ]

    # Format pairwise matrix for response
    formatted_matrix = None
    if last_matrix:
        formatted_matrix = {}
        for (a, b), count in last_matrix.items():
            if a not in formatted_matrix:
                formatted_matrix[a] = {}
            formatted_matrix[a][b] = count

    return {
        'method': method,
        'winners': winners,
        'condorcetMatrix': formatted_matrix,
        'irvRounds': all_irv_rounds if all_irv_rounds else None,
        'totalBallots': total_ballots,
        'candidates': list(candidates_info.values()),
    }
