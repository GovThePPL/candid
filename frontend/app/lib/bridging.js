/**
 * Bridging indicator logic for posts and comments.
 *
 * An item is "bridging" when it has a high MF intercept (liked
 * across ideological groups) and enough votes for signal reliability.
 */

const MIN_VOTES = 5
const BRIDGING_THRESHOLD = 0.3

/**
 * Check if a post or comment qualifies for the bridging badge.
 *
 * @param {Object} item - Post or comment object with bridgingScore, upvoteCount, downvoteCount
 * @returns {boolean}
 */
export function isBridging(item) {
  if (item.bridgingScore == null) return false
  const totalVotes = (item.upvoteCount || 0) + (item.downvoteCount || 0)
  if (totalVotes < MIN_VOTES) return false
  return item.bridgingScore >= BRIDGING_THRESHOLD
}

