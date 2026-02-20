/**
 * Bridging indicator logic for posts and comments.
 *
 * An item is "bridging" when it has a high MF intercept (liked
 * across ideological groups) and enough votes for signal reliability.
 *
 * The threshold is vote-count-adjusted: threshold = BASE + MARGIN / sqrt(votes).
 * This requires stronger evidence when data is sparse (few votes) and
 * converges to the Community Notes standard threshold (0.40) at high
 * vote counts. The MF intercept's standard error is roughly proportional
 * to 1/sqrt(n), so this is equivalent to requiring the lower confidence
 * bound to exceed BASE.
 */

const MIN_VOTES = 5
const BRIDGING_BASE = 0.40
const BRIDGING_MARGIN = 0.45

/**
 * Compute the effective bridging threshold for a given vote count.
 *
 * @param {number} totalVotes
 * @returns {number}
 */
export function bridgingThreshold(totalVotes) {
  if (totalVotes <= 0) return Infinity
  return BRIDGING_BASE + BRIDGING_MARGIN / Math.sqrt(totalVotes)
}

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
  return item.bridgingScore >= bridgingThreshold(totalVotes)
}

