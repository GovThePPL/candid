import {
  buildTree,
  sortTree,
  flattenTree,
  controversyScore,
  getAutoCollapsedIds,
  getReplyLineStates,
  AUTO_COLLAPSE_THRESHOLD,
  THREAD_DEPTH_LIMIT,
  THREAD_DEPTH_LIMIT_DESKTOP,
} from '../../lib/commentTree'

// Helper to create a comment with defaults
const makeComment = (overrides = {}) => ({
  id: 'c1',
  parentCommentId: null,
  body: 'test',
  score: 0,
  upvoteCount: 0,
  downvoteCount: 0,
  weightedUpvotes: 0,
  weightedDownvotes: 0,
  createdTime: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('controversyScore', () => {
  it('returns 0 when either count is 0', () => {
    expect(controversyScore(10, 0)).toBe(0)
    expect(controversyScore(0, 5)).toBe(0)
    expect(controversyScore(0, 0)).toBe(0)
  })

  it('returns max score for perfectly balanced votes', () => {
    // 5 up, 5 down → total=10, balance=1 → score=10
    expect(controversyScore(5, 5)).toBe(10)
  })

  it('returns lower score for lopsided votes', () => {
    // 10 up, 1 down → total=11, balance=1/10=0.1 → score=1.1
    expect(controversyScore(10, 1)).toBeCloseTo(1.1)
  })

  it('is symmetric', () => {
    expect(controversyScore(3, 7)).toBe(controversyScore(7, 3))
  })
})

describe('buildTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildTree([])).toEqual([])
    expect(buildTree(null)).toEqual([])
    expect(buildTree(undefined)).toEqual([])
  })

  it('builds flat comments as roots', () => {
    const comments = [
      makeComment({ id: 'c1' }),
      makeComment({ id: 'c2' }),
    ]
    const tree = buildTree(comments)
    expect(tree).toHaveLength(2)
    expect(tree[0].id).toBe('c1')
    expect(tree[1].id).toBe('c2')
    expect(tree[0].children).toEqual([])
  })

  it('nests children under parents', () => {
    const comments = [
      makeComment({ id: 'c1' }),
      makeComment({ id: 'c2', parentCommentId: 'c1' }),
      makeComment({ id: 'c3', parentCommentId: 'c1' }),
    ]
    const tree = buildTree(comments)
    expect(tree).toHaveLength(1)
    expect(tree[0].children).toHaveLength(2)
    expect(tree[0].children[0].id).toBe('c2')
    expect(tree[0].children[1].id).toBe('c3')
  })

  it('handles orphans as roots', () => {
    const comments = [
      makeComment({ id: 'c1', parentCommentId: 'missing' }),
    ]
    const tree = buildTree(comments)
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe('c1')
  })

  it('handles deeply nested trees', () => {
    const comments = [
      makeComment({ id: 'c1' }),
      makeComment({ id: 'c2', parentCommentId: 'c1' }),
      makeComment({ id: 'c3', parentCommentId: 'c2' }),
    ]
    const tree = buildTree(comments)
    expect(tree).toHaveLength(1)
    expect(tree[0].children[0].children[0].id).toBe('c3')
  })
})

describe('sortTree', () => {
  const comments = [
    makeComment({ id: 'c1', score: 5, upvoteCount: 8, downvoteCount: 3, createdTime: '2026-01-01T00:00:00Z' }),
    makeComment({ id: 'c2', score: 10, upvoteCount: 12, downvoteCount: 2, createdTime: '2026-01-02T00:00:00Z' }),
    makeComment({ id: 'c3', score: 1, upvoteCount: 5, downvoteCount: 5, createdTime: '2026-01-03T00:00:00Z' }),
  ]

  it('sorts by score desc in best mode', () => {
    const tree = buildTree(comments)
    const sorted = sortTree(tree, 'best')
    expect(sorted.map(n => n.id)).toEqual(['c2', 'c1', 'c3'])
  })

  it('sorts by createdTime desc in new mode', () => {
    const tree = buildTree(comments)
    const sorted = sortTree(tree, 'new')
    expect(sorted.map(n => n.id)).toEqual(['c3', 'c2', 'c1'])
  })

  it('sorts by net votes desc in top mode', () => {
    const tree = buildTree(comments)
    const sorted = sortTree(tree, 'top')
    // c2: 10, c1: 5, c3: 0
    expect(sorted.map(n => n.id)).toEqual(['c2', 'c1', 'c3'])
  })

  it('sorts by controversy desc in controversial mode', () => {
    const tree = buildTree(comments)
    const sorted = sortTree(tree, 'controversial')
    // c3: 5/5 → score=10, c1: 3/8 → score=~4.125, c2: 2/12 → score=~2.33
    expect(sorted[0].id).toBe('c3')
  })

  it('floats pinned comments to the top at root level', () => {
    const comments = [
      makeComment({ id: 'c1', score: 10 }),
      makeComment({ id: 'c2', score: 5, isPinned: true }),
      makeComment({ id: 'c3', score: 8 }),
    ]
    const tree = buildTree(comments)
    const sorted = sortTree(tree, 'best')
    expect(sorted[0].id).toBe('c2') // pinned comes first
    expect(sorted[1].id).toBe('c1') // then sorted by score
    expect(sorted[2].id).toBe('c3')
  })

  it('does not float pinned children (only root level)', () => {
    const comments = [
      makeComment({ id: 'p1', score: 1 }),
      makeComment({ id: 'c1', parentCommentId: 'p1', score: 10 }),
      makeComment({ id: 'c2', parentCommentId: 'p1', score: 5, isPinned: true }),
    ]
    const tree = buildTree(comments)
    const sorted = sortTree(tree, 'best')
    // Children should still be sorted by score, not pinned
    expect(sorted[0].children.map(n => n.id)).toEqual(['c1', 'c2'])
  })

  it('recursively sorts children', () => {
    const nested = [
      makeComment({ id: 'p1', score: 1 }),
      makeComment({ id: 'c1', parentCommentId: 'p1', score: 5 }),
      makeComment({ id: 'c2', parentCommentId: 'p1', score: 10 }),
    ]
    const tree = buildTree(nested)
    const sorted = sortTree(tree, 'best')
    expect(sorted[0].children.map(n => n.id)).toEqual(['c2', 'c1'])
  })
})

describe('flattenTree', () => {
  const comments = [
    makeComment({ id: 'r1' }),
    makeComment({ id: 'c1', parentCommentId: 'r1' }),
    makeComment({ id: 'c2', parentCommentId: 'r1' }),
    makeComment({ id: 'gc1', parentCommentId: 'c1' }),
  ]

  it('assigns correct depth values', () => {
    const tree = buildTree(comments)
    const flat = flattenTree(tree)
    const depths = flat.map(n => ({ id: n.id, depth: n.depth }))
    expect(depths).toEqual([
      { id: 'r1', depth: 0 },
      { id: 'c1', depth: 1 },
      { id: 'gc1', depth: 2 },
      { id: 'c2', depth: 1 },
    ])
  })

  it('caps visualDepth at THREAD_DEPTH_LIMIT (default) and stops rendering children beyond it', () => {
    // Create a chain 9 levels deep (l0 through l9)
    const chain = [makeComment({ id: 'l0' })]
    for (let i = 1; i <= 9; i++) {
      chain.push(makeComment({ id: `l${i}`, parentCommentId: `l${i - 1}` }))
    }
    const tree = buildTree(chain)
    const flat = flattenTree(tree)
    // Only items up to the depth limit are rendered (l0 through l7)
    expect(flat).toHaveLength(8)
    expect(flat[7].depth).toBe(7)
    expect(flat[7].visualDepth).toBe(7)
    expect(flat[7].id).toBe('l7')
    // l7 still knows it has children (for "continue thread" button)
    expect(flat[7].children.length).toBeGreaterThan(0)
  })

  it('respects a custom depthLimit parameter', () => {
    // Create a chain 5 levels deep (l0 through l5)
    const chain = [makeComment({ id: 'l0' })]
    for (let i = 1; i <= 5; i++) {
      chain.push(makeComment({ id: `l${i}`, parentCommentId: `l${i - 1}` }))
    }
    const tree = buildTree(chain)
    const flat = flattenTree(tree, new Set(), 3)
    // Only items up to depth 3 are rendered (l0 through l3)
    expect(flat).toHaveLength(4)
    expect(flat[3].depth).toBe(3)
    expect(flat[3].visualDepth).toBe(3)
    expect(flat[3].id).toBe('l3')
    expect(flat[3].children.length).toBeGreaterThan(0)
  })

  it('allows deeper nesting with THREAD_DEPTH_LIMIT_DESKTOP', () => {
    // Create a chain 14 levels deep (l0 through l14)
    const chain = [makeComment({ id: 'l0' })]
    for (let i = 1; i <= 14; i++) {
      chain.push(makeComment({ id: `l${i}`, parentCommentId: `l${i - 1}` }))
    }
    const tree = buildTree(chain)
    const flat = flattenTree(tree, new Set(), THREAD_DEPTH_LIMIT_DESKTOP)
    // Items up to depth 12 are rendered (l0 through l12)
    expect(flat).toHaveLength(13)
    expect(flat[12].depth).toBe(12)
    expect(flat[12].visualDepth).toBe(12)
    expect(flat[12].id).toBe('l12')
    expect(flat[12].children.length).toBeGreaterThan(0)
  })

  it('skips children of collapsed nodes', () => {
    const tree = buildTree(comments)
    const collapsed = new Set(['c1'])
    const flat = flattenTree(tree, collapsed)
    const ids = flat.map(n => n.id)
    expect(ids).toContain('r1')
    expect(ids).toContain('c1')
    expect(ids).not.toContain('gc1') // Hidden
    expect(ids).toContain('c2')
  })

  it('sets collapsedCount on collapsed nodes', () => {
    const tree = buildTree(comments)
    const collapsed = new Set(['r1'])
    const flat = flattenTree(tree, collapsed)
    const root = flat.find(n => n.id === 'r1')
    expect(root.isCollapsed).toBe(true)
    expect(root.collapsedCount).toBe(3) // c1, c2, gc1
  })

  it('handles empty tree', () => {
    expect(flattenTree([])).toEqual([])
    expect(flattenTree(null)).toEqual([])
  })

  it('sets empty activeLines for root and depth-1 comments', () => {
    const tree = buildTree(comments)
    const flat = flattenTree(tree)
    // Root (depth 0) and depth-1 nodes have no lines
    expect(flat.find(n => n.id === 'r1').activeLines).toEqual([])
    expect(flat.find(n => n.id === 'c1').activeLines).toEqual([])
    expect(flat.find(n => n.id === 'c2').activeLines).toEqual([])
  })

  it('sets activeLines true when ancestor has next sibling', () => {
    // r1 -> c1 (has next sibling c2) -> gc1
    // gc1 at depth 2: line at position 0 represents c1's thread;
    // c1 has sibling c2, so line is active
    const tree = buildTree(comments)
    const flat = flattenTree(tree)
    const gc1 = flat.find(n => n.id === 'gc1')
    expect(gc1.activeLines).toEqual([true])
  })

  it('sets activeLines false when ancestor is last child', () => {
    // Two roots, second root has one child with one grandchild
    // r -> c (last child) -> gc
    // gc's line for depth 1 should be false (c has no next sibling)
    const solo = [
      makeComment({ id: 'r' }),
      makeComment({ id: 'c', parentCommentId: 'r' }),
      makeComment({ id: 'gc', parentCommentId: 'c' }),
    ]
    const tree = buildTree(solo)
    const flat = flattenTree(tree)
    const gc = flat.find(n => n.id === 'gc')
    expect(gc.activeLines).toEqual([false])
  })

  it('sets mixed activeLines for deep nesting with siblings', () => {
    // r -> a (has sibling b) -> a1 (no sibling) -> a1x
    // a1x at depth 3: lines for depths 1 and 2
    // depth 1 (a): has sibling b → true
    // depth 2 (a1): no sibling → false
    const deep = [
      makeComment({ id: 'r' }),
      makeComment({ id: 'a', parentCommentId: 'r' }),
      makeComment({ id: 'b', parentCommentId: 'r' }),
      makeComment({ id: 'a1', parentCommentId: 'a' }),
      makeComment({ id: 'a1x', parentCommentId: 'a1' }),
    ]
    const tree = buildTree(deep)
    const flat = flattenTree(tree)
    const a1x = flat.find(n => n.id === 'a1x')
    expect(a1x.activeLines).toEqual([true, false])
  })

  it('computes lineStates for root comments', () => {
    const tree = buildTree([makeComment({ id: 'r1' })])
    const flat = flattenTree(tree)
    expect(flat[0].lineStates).toEqual([])
  })

  it('computes lineStates: depth-1 with children gets start', () => {
    // r -> c (has children gc)
    const comments = [
      makeComment({ id: 'r' }),
      makeComment({ id: 'c', parentCommentId: 'r' }),
      makeComment({ id: 'gc', parentCommentId: 'c' }),
    ]
    const tree = buildTree(comments)
    const flat = flattenTree(tree)
    const c = flat.find(n => n.id === 'c')
    // c is depth 1, has children → pos 0 = start (no prev, extends down)
    expect(c.lineStates).toEqual(['start'])
  })

  it('computes lineStates: depth-1 without children gets stub', () => {
    const comments = [
      makeComment({ id: 'r' }),
      makeComment({ id: 'c', parentCommentId: 'r' }),
    ]
    const tree = buildTree(comments)
    const flat = flattenTree(tree)
    const c = flat.find(n => n.id === 'c')
    // c is depth 1, no children → pos 0 = stub
    expect(c.lineStates).toEqual(['stub'])
  })

  it('computes lineStates: childless siblings get stub with break', () => {
    // r -> c1, c2 (both childless, depth 1)
    const comments = [
      makeComment({ id: 'r' }),
      makeComment({ id: 'c1', parentCommentId: 'r' }),
      makeComment({ id: 'c2', parentCommentId: 'r' }),
    ]
    const tree = buildTree(comments)
    const flat = flattenTree(tree)
    // Both should be stubs — no connection between them
    expect(flat.find(n => n.id === 'c1').lineStates).toEqual(['stub'])
    expect(flat.find(n => n.id === 'c2').lineStates).toEqual(['stub'])
  })

  it('computes lineStates: ancestor lines pass through as full', () => {
    // r -> a (has sibling b) -> a1
    // a1 at depth 2: pos 0 is ancestor (a has sibling b → full), pos 1 is own depth
    const comments = [
      makeComment({ id: 'r' }),
      makeComment({ id: 'a', parentCommentId: 'r' }),
      makeComment({ id: 'b', parentCommentId: 'r' }),
      makeComment({ id: 'a1', parentCommentId: 'a' }),
    ]
    const tree = buildTree(comments)
    const flat = flattenTree(tree)
    const a1 = flat.find(n => n.id === 'a1')
    // pos 0: ancestor. a has sibling b → bottom=true. prev is a with start → top=true. full.
    // pos 1: own depth. a1 has no children → stub.
    expect(a1.lineStates).toEqual(['full', 'stub'])
  })

  it('computes lineStates: last descendant gets end for ancestor line', () => {
    // r -> a (has sibling b) -> a1 (no children)
    // b at depth 1: pos 0 is own depth
    // After a1, the next is b. a's thread line should have ended at a1.
    const comments = [
      makeComment({ id: 'r' }),
      makeComment({ id: 'a', parentCommentId: 'r' }),
      makeComment({ id: 'b', parentCommentId: 'r' }),
      makeComment({ id: 'a1', parentCommentId: 'a' }),
    ]
    const tree = buildTree(comments)
    const flat = flattenTree(tree)
    const b = flat.find(n => n.id === 'b')
    // b at depth 1: prev is a1. a1's pos 0 bottom=true (a has sibling b).
    // b's pos 0: own depth, no children → bottom=false. top=true (a1 extended). State = end.
    expect(b.lineStates).toEqual(['end'])
  })

  it('computes lineStates: parent with children connects through descendants', () => {
    // r -> a -> c1 (has child gc), c2 (no children)
    // a's thread line at pos 0 should connect continuously through c1, gc, ending at c2
    const comments = [
      makeComment({ id: 'r' }),
      makeComment({ id: 'a', parentCommentId: 'r' }),
      makeComment({ id: 'c1', parentCommentId: 'a' }),
      makeComment({ id: 'c2', parentCommentId: 'a' }),
      makeComment({ id: 'gc', parentCommentId: 'c1' }),
    ]
    const tree = buildTree(comments)
    const flat = flattenTree(tree)
    // Flat order: r, a, c1, gc, c2

    const c1 = flat.find(n => n.id === 'c1')
    // c1 has children → ancestor lines continue. pos 0: full, pos 1: start
    expect(c1.lineStates).toEqual(['full', 'start'])

    const gc = flat.find(n => n.id === 'gc')
    // gc: pos 0 full (subtree continues to c2), pos 1 full (c1 sibling c2), pos 2 stub
    expect(gc.lineStates).toEqual(['full', 'full', 'stub'])

    const c2 = flat.find(n => n.id === 'c2')
    // c2: pos 0 end (last in a's subtree), pos 1 end (last in thread from gc)
    expect(c2.lineStates).toEqual(['end', 'end'])
  })

  it('computes lineStates: only-child with children keeps ancestor line continuous', () => {
    // r -> a -> b (only child, has children c, d)
    // a's thread at pos 0 must continue through b to c and d
    const comments = [
      makeComment({ id: 'r' }),
      makeComment({ id: 'a', parentCommentId: 'r' }),
      makeComment({ id: 'b', parentCommentId: 'a' }),
      makeComment({ id: 'c', parentCommentId: 'b' }),
      makeComment({ id: 'd', parentCommentId: 'b' }),
    ]
    const tree = buildTree(comments)
    const flat = flattenTree(tree)
    // Flat order: r, a, b, c, d

    const b = flat.find(n => n.id === 'b')
    // b has children → ancestor pos 0 continues. pos 0: full, pos 1: start
    expect(b.lineStates).toEqual(['full', 'start'])

    const c = flat.find(n => n.id === 'c')
    // c: pos 0 full (b's children below), pos 1 full (c has sibling d), pos 2 stub
    expect(c.lineStates).toEqual(['full', 'full', 'stub'])

    const d = flat.find(n => n.id === 'd')
    // d: pos 0 end (last in a's subtree), pos 1 end (last child of b), pos 2 stub
    expect(d.lineStates).toEqual(['end', 'end', 'stub'])
  })

  it('computes lineStates: collapsed comment hides children thread', () => {
    const comments = [
      makeComment({ id: 'r' }),
      makeComment({ id: 'c', parentCommentId: 'r' }),
      makeComment({ id: 'gc', parentCommentId: 'c' }),
    ]
    const tree = buildTree(comments)
    const collapsed = new Set(['c'])
    const flat = flattenTree(tree, collapsed)
    const c = flat.find(n => n.id === 'c')
    // c is collapsed — hasVisibleChildren = false → stub (not start)
    expect(c.lineStates).toEqual(['stub'])
  })
})

describe('getAutoCollapsedIds', () => {
  it('returns empty set for empty input', () => {
    expect(getAutoCollapsedIds([])).toEqual(new Set())
  })

  it('returns IDs of comments with weighted net below default threshold (-3)', () => {
    const comments = [
      makeComment({ id: 'c1', weightedUpvotes: 2, weightedDownvotes: 7 }),   // net -5
      makeComment({ id: 'c2', weightedUpvotes: 3, weightedDownvotes: 6 }),   // net -3, at threshold, not below
      makeComment({ id: 'c3', weightedUpvotes: 5, weightedDownvotes: 2 }),   // net +3
      makeComment({ id: 'c4', weightedUpvotes: 1, weightedDownvotes: 12 }),  // net -11
    ]
    const ids = getAutoCollapsedIds(comments)
    expect(ids).toEqual(new Set(['c1', 'c4']))
  })

  it('uses custom threshold when provided', () => {
    const comments = [
      makeComment({ id: 'c1', weightedUpvotes: 1, weightedDownvotes: 2 }),  // net -1
      makeComment({ id: 'c2', weightedUpvotes: 0, weightedDownvotes: 0 }),  // net 0
      makeComment({ id: 'c3', weightedUpvotes: 4, weightedDownvotes: 2 }),  // net +2
    ]
    const ids = getAutoCollapsedIds(comments, 0)
    expect(ids).toEqual(new Set(['c1']))
  })

  it('treats missing weighted values as 0', () => {
    const comments = [
      makeComment({ id: 'c1' }),  // both 0 from default
      { id: 'c2', parentCommentId: null, body: 'test' },  // no weighted fields
    ]
    const ids = getAutoCollapsedIds(comments)
    expect(ids).toEqual(new Set())  // 0 is not < -3
  })

  it('excludes deleted comments', () => {
    const comments = [
      makeComment({ id: 'c1', weightedUpvotes: 0, weightedDownvotes: 5, status: 'deleted' }),
      makeComment({ id: 'c2', weightedUpvotes: 0, weightedDownvotes: 5 }),
    ]
    const ids = getAutoCollapsedIds(comments)
    expect(ids).toEqual(new Set(['c2']))
  })

  it('excludes removed comments', () => {
    const comments = [
      makeComment({ id: 'c1', weightedUpvotes: 0, weightedDownvotes: 5, status: 'removed' }),
      makeComment({ id: 'c2', weightedUpvotes: 0, weightedDownvotes: 5 }),
    ]
    const ids = getAutoCollapsedIds(comments)
    expect(ids).toEqual(new Set(['c2']))
  })

  it('exports AUTO_COLLAPSE_THRESHOLD as -3', () => {
    expect(AUTO_COLLAPSE_THRESHOLD).toBe(-3)
  })

  it('exports THREAD_DEPTH_LIMIT as 7', () => {
    expect(THREAD_DEPTH_LIMIT).toBe(7)
  })

  it('exports THREAD_DEPTH_LIMIT_DESKTOP as 12', () => {
    expect(THREAD_DEPTH_LIMIT_DESKTOP).toBe(12)
  })
})

describe('getReplyLineStates', () => {
  it('returns stub only for reply to root comment (depth 0)', () => {
    const comment = { depth: 0, visualDepth: 0, lineStates: [] }
    expect(getReplyLineStates(comment, 12)).toEqual(['stub'])
  })

  it('returns end + stub for reply to depth 1 comment with ending line', () => {
    const comment = { depth: 1, visualDepth: 1, lineStates: ['end'] }
    expect(getReplyLineStates(comment, 12)).toEqual(['end', 'stub'])
  })

  it('passes through continuing ancestor lines as full', () => {
    const comment = { depth: 2, visualDepth: 2, lineStates: ['full', 'stub'] }
    expect(getReplyLineStates(comment, 12)).toEqual(['full', 'end', 'stub'])
  })

  it('produces all end lines for deeply nested last-child comment', () => {
    // Simulates a comment at depth 6 where all ancestor lines are 'end'
    const comment = {
      depth: 6,
      visualDepth: 6,
      lineStates: ['end', 'end', 'end', 'end', 'end', 'end'],
    }
    const result = getReplyLineStates(comment, 12)
    expect(result).toEqual(['end', 'end', 'end', 'end', 'end', 'end', 'stub'])
    expect(result).toHaveLength(7)
  })

  it('mixes full and end based on comment lineStates', () => {
    // depth 3: first line continues, second ends, own depth is stub
    const comment = {
      depth: 3,
      visualDepth: 3,
      lineStates: ['full', 'end', 'start'],
    }
    expect(getReplyLineStates(comment, 12)).toEqual(['full', 'end', 'full', 'stub'])
  })

  it('caps reply depth at depthLimit', () => {
    const comment = { depth: 7, visualDepth: 7, lineStates: ['end', 'end', 'end', 'end', 'end', 'end', 'end'] }
    // depthLimit 7: reply would be depth 8 but capped at 7
    const result = getReplyLineStates(comment, 7)
    expect(result).toHaveLength(7)
    expect(result[6]).toBe('stub')
  })

  it('handles missing lineStates gracefully', () => {
    const comment = { depth: 2, visualDepth: 2 }
    expect(getReplyLineStates(comment, 12)).toEqual(['end', 'end', 'stub'])
  })
})
