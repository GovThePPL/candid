/**
 * Comment tree utilities — pure functions for building, sorting, and
 * flattening a nested comment tree from the flat array returned by the API.
 */

/**
 * Controversy score: rewards balanced up/down ratios.
 * total * balance where balance = min(up,down) / max(up,down).
 * Returns 0 when either count is 0.
 */
export function controversyScore(up, down) {
  if (up <= 0 || down <= 0) return 0
  const total = up + down
  const balance = Math.min(up, down) / Math.max(up, down)
  return total * balance
}

/**
 * Auto-collapse threshold on weighted net votes. Comments whose weighted
 * net (weightedUpvotes − weightedDownvotes) falls below this are
 * automatically collapsed unless the user explicitly expands them.
 */
export const THREAD_DEPTH_LIMIT = 7
export const THREAD_DEPTH_LIMIT_DESKTOP = 12

export const AUTO_COLLAPSE_THRESHOLD = -3

/**
 * Compute the set of comment IDs that should be auto-collapsed due to
 * low weighted net votes. Only considers active (non-deleted) comments.
 *
 * Uses weightedUpvotes/weightedDownvotes (which incorporate ideological
 * distance weighting) rather than the Wilson `score` field (always 0-1).
 *
 * @param {Array} flatComments - flat array of comments from the API
 * @param {number} threshold - weighted net threshold (exclusive, default: -3)
 * @returns {Set} set of comment IDs below threshold
 */
export function getAutoCollapsedIds(flatComments, threshold = AUTO_COLLAPSE_THRESHOLD) {
  const ids = new Set()
  for (const c of flatComments) {
    const weightedNet = (c.weightedUpvotes || 0) - (c.weightedDownvotes || 0)
    if (weightedNet < threshold && c.status !== 'deleted' && c.status !== 'removed') {
      ids.add(c.id)
    }
  }
  return ids
}

/**
 * Build a tree from a flat array of comments.
 * Each comment must have `id` and `parentCommentId` (null for root).
 * Returns an array of root nodes, each with a `children` array.
 */
export function buildTree(flatComments) {
  if (!Array.isArray(flatComments) || flatComments.length === 0) return []

  const nodeMap = new Map()

  // Create node wrappers with children arrays
  for (const comment of flatComments) {
    nodeMap.set(comment.id, { ...comment, children: [] })
  }

  const roots = []

  for (const comment of flatComments) {
    const node = nodeMap.get(comment.id)
    if (comment.parentCommentId && nodeMap.has(comment.parentCommentId)) {
      nodeMap.get(comment.parentCommentId).children.push(node)
    } else {
      // Root comment or orphan (parent not in list)
      roots.push(node)
    }
  }

  return roots
}

/**
 * Recursively sort tree children at each level.
 * Modes: 'best' (score desc), 'new' (createdTime desc),
 * 'top' (net votes desc), 'controversial' (controversy desc).
 */
export function sortTree(tree, mode = 'best', isRoot = true) {
  if (!Array.isArray(tree)) return []

  const comparator = getSortComparator(mode)
  const sorted = [...tree].sort((a, b) => {
    // Pinned comments float to the top at root level
    if (isRoot) {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
    }
    return comparator(a, b)
  })

  for (const node of sorted) {
    if (node.children && node.children.length > 0) {
      node.children = sortTree(node.children, mode, false)
    }
  }

  return sorted
}

function getSortComparator(mode) {
  switch (mode) {
    case 'new':
      return (a, b) => {
        const aTime = new Date(a.createdTime || 0).getTime()
        const bTime = new Date(b.createdTime || 0).getTime()
        return bTime - aTime
      }
    case 'top':
      return (a, b) => {
        const aNet = (a.upvoteCount || 0) - (a.downvoteCount || 0)
        const bNet = (b.upvoteCount || 0) - (b.downvoteCount || 0)
        return bNet - aNet
      }
    case 'controversial':
      return (a, b) => {
        const aScore = controversyScore(a.upvoteCount || 0, a.downvoteCount || 0)
        const bScore = controversyScore(b.upvoteCount || 0, b.downvoteCount || 0)
        return bScore - aScore
      }
    case 'best':
    default:
      return (a, b) => (b.score || 0) - (a.score || 0)
  }
}

/**
 * Count total descendants of a node (recursive).
 */
function countDescendants(node) {
  if (!node.children || node.children.length === 0) return 0
  let count = node.children.length
  for (const child of node.children) {
    count += countDescendants(child)
  }
  return count
}

/**
 * Flatten a sorted tree into a list suitable for FlatList rendering.
 *
 * Each item gets:
 * - `depth`: actual nesting level (0 for root)
 * - `visualDepth`: Math.min(depth, depthLimit) — caps indentation
 * - `isCollapsed`: whether this node is collapsed
 * - `collapsedCount`: total hidden descendants (only set on collapsed nodes)
 * - `activeLines`: array of booleans (length = visualDepth - 1) indicating
 *   which ancestor thread lines should be drawn. A line is active when the
 *   ancestor at that depth still has siblings below.
 *
 * Children of collapsed nodes and nodes at the depth limit are skipped.
 *
 * @param {Array} tree - sorted tree nodes
 * @param {Set} collapsedIds - Set of comment IDs that are collapsed
 * @param {number} depthLimit - max nesting depth before "continue thread" (default: THREAD_DEPTH_LIMIT)
 * @returns {Array} flat list items
 */
export function flattenTree(tree, collapsedIds = new Set(), depthLimit = THREAD_DEPTH_LIMIT) {
  if (!Array.isArray(tree)) return []
  const result = _flattenTree(tree, collapsedIds, 0, [], depthLimit)
  computeLineStates(result)
  return result
}

function _flattenTree(tree, collapsedIds, depth, ancestorHasNext, depthLimit) {
  const result = []

  for (let i = 0; i < tree.length; i++) {
    const node = tree[i]
    const isLast = i === tree.length - 1
    const isCollapsed = collapsedIds.has(node.id)
    const visualDepth = Math.min(depth, depthLimit)

    // Record whether this node has a next sibling at its depth
    ancestorHasNext[depth] = !isLast

    // Build activeLines: for each ancestor position, the line continues if
    // ANY depth from that level to the current depth has more siblings.
    // This ensures parent threads stay visible through their entire subtree.
    const activeLines = []
    for (let d = 1; d < visualDepth; d++) {
      let active = false
      for (let k = d; k <= depth; k++) {
        if (ancestorHasNext[k]) {
          active = true
          break
        }
      }
      activeLines.push(active)
    }

    const item = {
      ...node,
      depth,
      visualDepth,
      isCollapsed,
      activeLines,
    }

    if (isCollapsed) {
      item.collapsedCount = countDescendants(node)
    }

    result.push(item)

    // Skip children of collapsed nodes and nodes at the depth limit
    if (!isCollapsed && depth < depthLimit && node.children && node.children.length > 0) {
      const childItems = _flattenTree(node.children, collapsedIds, depth + 1, ancestorHasNext, depthLimit)
      result.push(...childItems)
    }
  }

  return result
}

/**
 * Compute line rendering states for each item in the flat list.
 *
 * Each item gets a `lineStates` array (length = visualDepth) where each entry
 * describes how to render the thread line at that position:
 *
 * - 'full'  — full cell height (passes through to comments above and below)
 * - 'start' — begins at avatar level, extends to cell bottom (has children below)
 * - 'end'   — extends from cell top, ends at action-row level (last in thread)
 * - 'stub'  — avatar to action-row only (own-depth, no children)
 * - null    — no line, just width spacer (ancestor position with no connection)
 */
function computeLineStates(flatList) {
  let prevBottoms = []

  for (const item of flatList) {
    const vd = item.visualDepth
    const hasVisibleChildren = !item.isCollapsed &&
      Array.isArray(item.children) && item.children.length > 0

    const lineStates = []
    const bottoms = []

    for (let p = 0; p < vd; p++) {
      const top = p < prevBottoms.length && prevBottoms[p] === true
      const isOwnDepth = p === vd - 1
      let bottom
      if (isOwnDepth) {
        bottom = hasVisibleChildren
      } else {
        // Ancestor line: continues if ancestor has more descendants below
        // OR if this comment has children (deeper items will appear below)
        bottom = !!(item.activeLines && item.activeLines[p]) || hasVisibleChildren
      }

      bottoms[p] = bottom

      if (top && bottom) lineStates.push('full')
      else if (!top && bottom) lineStates.push('start')
      else if (top && !bottom) lineStates.push('end')
      else if (isOwnDepth) lineStates.push('stub')
      else lineStates.push(null)
    }

    item.lineStates = lineStates
    prevBottoms = bottoms
  }
}

/**
 * Compute line states for a virtual reply to `comment`.
 *
 * When a comment gains a visible child, computeLineStates would set
 * hasVisibleChildren=true, making ALL ancestor line bottoms true. The child
 * then sees top=true at every ancestor position. Lines that were already
 * continuing ('full'/'start') pass through; all others end at the reply.
 *
 * @param {Object} comment - The comment being replied to (from flattenTree)
 * @param {number} depthLimit - Max nesting depth
 * @returns {Array<string|null>} Line states for the reply position
 */
export function getReplyLineStates(comment, depthLimit) {
  const commentVd = comment.visualDepth ?? comment.depth ?? 0
  const replyVd = Math.min(commentVd + 1, depthLimit)
  const states = []

  for (let p = 0; p < replyVd; p++) {
    if (p === replyVd - 1) {
      // Reply's own depth — stub (no children)
      states.push('stub')
    } else {
      // Ancestor line: if the comment's line was continuing ('full'/'start'),
      // it passes through the reply; otherwise it ends at the reply.
      const commentState = comment.lineStates?.[p]
      const continues = commentState === 'full' || commentState === 'start'
      states.push(continues ? 'full' : 'end')
    }
  }

  return states
}
