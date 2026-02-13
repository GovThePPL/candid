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
export function sortTree(tree, mode = 'best') {
  if (!Array.isArray(tree)) return []

  const comparator = getSortComparator(mode)
  const sorted = [...tree].sort(comparator)

  for (const node of sorted) {
    if (node.children && node.children.length > 0) {
      node.children = sortTree(node.children, mode)
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
 * - `visualDepth`: Math.min(depth, 5) — caps indentation
 * - `isCollapsed`: whether this node is collapsed
 * - `collapsedCount`: total hidden descendants (only set on collapsed nodes)
 * - `activeLines`: array of booleans (length = visualDepth - 1) indicating
 *   which ancestor thread lines should be drawn. A line is active when the
 *   ancestor at that depth still has siblings below.
 *
 * Children of collapsed nodes are skipped.
 *
 * @param {Array} tree - sorted tree nodes
 * @param {Set} collapsedIds - Set of comment IDs that are collapsed
 * @param {number} depth - current depth (used in recursion)
 * @param {boolean[]} ancestorHasNext - tracks which ancestor depths have more siblings
 * @returns {Array} flat list items
 */
export function flattenTree(tree, collapsedIds = new Set(), depth = 0, ancestorHasNext = []) {
  if (!Array.isArray(tree)) return []

  const result = []

  for (let i = 0; i < tree.length; i++) {
    const node = tree[i]
    const isLast = i === tree.length - 1
    const isCollapsed = collapsedIds.has(node.id)
    const visualDepth = Math.min(depth, 5)

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

    // Skip children of collapsed nodes
    if (!isCollapsed && node.children && node.children.length > 0) {
      const childItems = flattenTree(node.children, collapsedIds, depth + 1, ancestorHasNext)
      result.push(...childItems)
    }
  }

  // At top level, compute line rendering states
  if (depth === 0) {
    computeLineStates(result)
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
