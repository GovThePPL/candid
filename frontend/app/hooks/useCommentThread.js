import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import { CacheManager, CacheKeys } from '../lib/cache'
import { useToast } from '../components/Toast'
import { useUser } from './useUser'
import { buildTree, sortTree, flattenTree, getAutoCollapsedIds } from '../lib/commentTree'
import { isConnected, joinPost, leavePost, onNewComment, onVoteUpdate } from '../lib/socket'

/** Shallow array equality for short arrays (activeLines, lineStates). */
function arrEq(a, b) {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Hook for managing comment thread state: fetch, tree build, sort, collapse,
 * optimistic voting, comment creation, and cursor-based pagination.
 *
 * Sort order is computed once on fetch/sort-change/new-comments and held stable.
 * Votes update comment data in-place without re-sorting (prevents comments
 * from jumping around while the user is reading).
 *
 * Performance: callbacks use refs to read state, avoiding dependency on
 * rawComments/flatList. The flatList cache reuses merged objects when neither
 * the source data nor layout has changed, preserving referential equality for
 * React.memo on CommentItem.
 *
 * @param {string} postId - Post ID to fetch comments for
 * @param {Object} [options] - Options
 * @param {string} [options.threadRootId] - If set, fetches a single comment's subtree instead of full post comments
 * @returns {Object} thread state and actions
 */
export default function useCommentThread(postId, { threadRootId, focusCommentId } = {}) {
  const { t } = useTranslation('discuss')
  const showToast = useToast()
  const { user } = useUser()
  const [rawComments, setRawComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [sort, setSort] = useState('best')
  const [collapsedIds, setCollapsedIds] = useState(new Set())     // User-manually collapsed
  const [expandedIds, setExpandedIds] = useState(new Set())       // User-explicitly expanded (overrides auto-collapse)
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [totalRootCount, setTotalRootCount] = useState(0)
  const [truncatedRoots, setTruncatedRoots] = useState(new Set())
  const mountedRef = useRef(true)

  // Counter bumped on structural changes (fetch, new comments, load more)
  // to trigger re-sort. Votes do NOT bump this.
  const [structureVersion, setStructureVersion] = useState(0)

  // Refs for stable callback access (avoids putting state arrays in callback deps)
  const rawCommentsRef = useRef(rawComments)
  useEffect(() => { rawCommentsRef.current = rawComments }, [rawComments])

  // Cache for stable flatList item references — reuses merged objects when
  // neither source data nor layout changed for a given comment
  const flatListCacheRef = useRef(new Map())

  // Cache for stable layout objects — reuses previous layout when all
  // field values match, so flatListCacheRef gets referential hits on collapse
  const layoutCacheRef = useRef(new Map())

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Fetch first page of comments from API (or thread subtree)
  const fetchComments = useCallback(async () => {
    if (!postId) return
    setLoading(true)
    setError(null)
    try {
      let result
      if (threadRootId) {
        result = await api.comments.getCommentThread(postId, threadRootId, {
          includeAncestors: !!focusCommentId,
        })
      } else {
        result = await api.comments.getComments(postId)
      }
      if (mountedRef.current) {
        const comments = result?.comments ?? (Array.isArray(result) ? result : [])
        setRawComments(comments)
        setStructureVersion(v => v + 1)
        if (!threadRootId) {
          setCursor(result?.nextCursor ?? null)
          setHasMore(result?.hasMore ?? false)
          setTotalRootCount(result?.totalRootCount ?? comments.length)
          setTruncatedRoots(new Set(result?.truncatedRoots ?? []))
        } else {
          // Thread mode: no pagination
          setCursor(null)
          setHasMore(false)
          setTotalRootCount(0)
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err)
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [postId, threadRootId, focusCommentId])

  // Fetch on mount / postId change
  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  // Real-time Socket.IO: join post room and listen for events
  useEffect(() => {
    if (!postId || !isConnected()) return

    // Join the post room
    joinPost(postId).catch(() => {
      // Socket not connected or failed — non-critical
    })

    // Listen for new comments from other users
    const cleanupComment = onNewComment((comment) => {
      if (!mountedRef.current) return
      // Deduplicate: skip if we already have this comment (optimistic insert)
      setRawComments(prev => {
        if (prev.some(c => c.id === comment.id)) return prev
        return [...prev, comment]
      })
      setStructureVersion(v => v + 1)
    })

    // Listen for vote count updates
    const cleanupVote = onVoteUpdate((data) => {
      if (!mountedRef.current) return
      setRawComments(prev => prev.map(c =>
        c.id === data.commentId
          ? {
            ...c,
            upvoteCount: data.upvoteCount ?? c.upvoteCount,
            downvoteCount: data.downvoteCount ?? c.downvoteCount,
            score: data.score ?? c.score,
          }
          : c
      ))
    })

    return () => {
      leavePost(postId)
      cleanupComment()
      cleanupVote()
    }
  }, [postId])

  // Load more (next page)
  const loadMore = useCallback(async () => {
    if (!postId || !cursor || !hasMore || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await api.comments.getComments(postId, { cursor })
      if (mountedRef.current) {
        const newComments = result?.comments ?? []
        setRawComments(prev => [...prev, ...newComments])
        setStructureVersion(v => v + 1)
        setCursor(result?.nextCursor ?? null)
        setHasMore(result?.hasMore ?? false)
        if (result?.truncatedRoots?.length) {
          setTruncatedRoots(prev => {
            const next = new Set(prev)
            for (const id of result.truncatedRoots) next.add(id)
            return next
          })
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err)
      }
    } finally {
      if (mountedRef.current) {
        setLoadingMore(false)
      }
    }
  }, [postId, cursor, hasMore, loadingMore])

  // Auto-expand ancestors of focused comment so it's visible in the flat list
  useEffect(() => {
    if (!focusCommentId || rawComments.length === 0) return
    const commentMap = new Map(rawComments.map(c => [c.id, c]))
    const comment = commentMap.get(focusCommentId)
    if (!comment) return

    const ancestorIds = []
    let parentId = comment.parentCommentId
    while (parentId) {
      const parent = commentMap.get(parentId)
      if (!parent) break
      ancestorIds.push(parent.id)
      parentId = parent.parentCommentId
    }
    if (ancestorIds.length === 0) return

    setCollapsedIds(prev => {
      const next = new Set(prev)
      let changed = false
      for (const id of ancestorIds) {
        if (next.has(id)) { next.delete(id); changed = true }
      }
      return changed ? next : prev
    })
    setExpandedIds(prev => {
      const next = new Set(prev)
      let changed = false
      for (const id of ancestorIds) {
        if (!next.has(id)) { next.add(id); changed = true }
      }
      return changed ? next : prev
    })
  }, [focusCommentId, rawComments])

  // Auto-collapsed IDs — computed once, shared by effectiveCollapsedIds and UI
  const autoCollapsedSet = useMemo(() => getAutoCollapsedIds(rawComments),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structureVersion])

  // Compute effective collapsed IDs: manual collapses + auto-collapse (minus explicit expands)
  const effectiveCollapsedIds = useMemo(() => {
    const effective = new Set(collapsedIds)
    for (const id of autoCollapsedSet) {
      if (!expandedIds.has(id)) {
        effective.add(id)
      }
    }
    return effective
  }, [autoCollapsedSet, collapsedIds, expandedIds])

  // Cache sorted tree — only rebuild on structural changes or sort change.
  // Collapse toggles skip the expensive buildTree + sortTree steps.
  const sortedTree = useMemo(() => {
    if (rawComments.length === 0) return []
    const tree = buildTree(rawComments)
    return sortTree(tree, sort)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureVersion, sort])

  // Flatten only — runs on collapse changes without rebuilding tree.
  // Caches layout objects by field values so most items keep the same
  // reference on collapse (only the toggled comment + a few neighbors change).
  const sortedLayout = useMemo(() => {
    if (sortedTree.length === 0) {
      layoutCacheRef.current = new Map()
      return []
    }
    const flat = flattenTree(sortedTree, effectiveCollapsedIds)
    const prevCache = layoutCacheRef.current
    const nextCache = new Map()

    const result = flat.map(item => {
      const id = item.id
      const isAutoCollapsed = autoCollapsedSet.has(id) && !expandedIds.has(id)
      const hasChildren = Array.isArray(item.children) && item.children.length > 0

      const prev = prevCache.get(id)
      if (prev &&
          prev.depth === item.depth &&
          prev.visualDepth === item.visualDepth &&
          prev.isCollapsed === item.isCollapsed &&
          prev.isAutoCollapsed === isAutoCollapsed &&
          prev.collapsedCount === item.collapsedCount &&
          prev.hasChildren === hasChildren &&
          arrEq(prev.activeLines, item.activeLines) &&
          arrEq(prev.lineStates, item.lineStates)) {
        nextCache.set(id, prev)
        return prev
      }

      const layout = {
        id,
        depth: item.depth,
        visualDepth: item.visualDepth,
        isCollapsed: item.isCollapsed,
        isAutoCollapsed,
        collapsedCount: item.collapsedCount,
        hasChildren,
        activeLines: item.activeLines,
        lineStates: item.lineStates,
      }
      nextCache.set(id, layout)
      return layout
    })

    layoutCacheRef.current = nextCache
    return result
  }, [sortedTree, effectiveCollapsedIds, autoCollapsedSet, expandedIds])

  // Build final flat list with stable object references per comment.
  // Reuses previous merged objects when neither source data nor layout changed,
  // so React.memo on CommentItem skips re-rendering unchanged comments.
  const flatList = useMemo(() => {
    if (sortedLayout.length === 0) {
      flatListCacheRef.current = new Map()
      return []
    }
    const commentMap = new Map(rawComments.map(c => [c.id, c]))
    const prevCache = flatListCacheRef.current
    const nextCache = new Map()

    const result = sortedLayout.map(layout => {
      const data = commentMap.get(layout.id)
      if (!data) return null
      const entry = prevCache.get(layout.id)
      // Reuse previous merged object if both source data and layout are unchanged
      if (entry && entry.data === data && entry.layout === layout) {
        nextCache.set(layout.id, entry)
        return entry.merged
      }
      const merged = { ...data, ...layout }
      nextCache.set(layout.id, { merged, data, layout })
      return merged
    }).filter(Boolean)

    flatListCacheRef.current = nextCache
    return result
  }, [sortedLayout, rawComments])

  // Refs for stable toggleCollapse access
  const autoCollapsedRef = useRef(autoCollapsedSet)
  useEffect(() => { autoCollapsedRef.current = autoCollapsedSet }, [autoCollapsedSet])
  const expandedIdsRef = useRef(expandedIds)
  useEffect(() => { expandedIdsRef.current = expandedIds }, [expandedIds])

  // Toggle collapse — stable callback using refs (no deps on derived state)
  const toggleCollapse = useCallback((commentId) => {
    const autoSet = autoCollapsedRef.current
    const expSet = expandedIdsRef.current
    // If it's auto-collapsed and being expanded, add to expandedIds
    if (autoSet.has(commentId) && !expSet.has(commentId)) {
      setExpandedIds(prev => {
        const next = new Set(prev)
        next.add(commentId)
        return next
      })
      return
    }
    // If it was auto-collapsed but user expanded it, re-collapse by removing from expandedIds
    if (autoSet.has(commentId) && expSet.has(commentId)) {
      setExpandedIds(prev => {
        const next = new Set(prev)
        next.delete(commentId)
        return next
      })
      return
    }
    // Normal manual collapse toggle
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(commentId)) {
        next.delete(commentId)
      } else {
        next.add(commentId)
      }
      return next
    })
  }, [])

  // Optimistic vote on comment — stable callback using ref for current state
  const handleVote = useCallback(async (commentId, voteType, reason) => {
    const comment = rawCommentsRef.current.find(c => c.id === commentId)
    if (!comment) return

    const wasUpvoted = comment.userVote?.voteType === 'upvote'
    const wasDownvoted = comment.userVote?.voteType === 'downvote'

    // Determine optimistic new state
    let newUpvoteCount = comment.upvoteCount || 0
    let newDownvoteCount = comment.downvoteCount || 0
    let newUserVote

    if (voteType === 'upvote') {
      if (wasUpvoted) {
        // Remove upvote
        newUpvoteCount -= 1
        newUserVote = null
      } else {
        newUpvoteCount += 1
        if (wasDownvoted) newDownvoteCount -= 1
        newUserVote = { voteType: 'upvote' }
      }
    } else if (voteType === 'downvote') {
      if (wasDownvoted) {
        newDownvoteCount -= 1
        newUserVote = null
      } else {
        newDownvoteCount += 1
        if (wasUpvoted) newUpvoteCount -= 1
        newUserVote = { voteType: 'downvote', downvoteReason: reason }
      }
    }

    // Capture pre-update state for rollback (read ref before setRawComments)
    const snapshotForRollback = rawCommentsRef.current

    // Optimistic update — does NOT bump structureVersion, so no re-sort
    setRawComments(prev => prev.map(c =>
      c.id === commentId
        ? { ...c, upvoteCount: newUpvoteCount, downvoteCount: newDownvoteCount, userVote: newUserVote }
        : c
    ))

    try {
      const body = { voteType }
      if (voteType === 'downvote' && reason) body.downvoteReason = reason
      const result = await api.comments.voteOnComment(commentId, body)
      // Reconcile with server response — no re-sort
      if (mountedRef.current && result) {
        setRawComments(prev => prev.map(c =>
          c.id === commentId
            ? {
              ...c,
              upvoteCount: result.upvoteCount ?? c.upvoteCount,
              downvoteCount: result.downvoteCount ?? c.downvoteCount,
              score: result.score ?? c.score,
              userVote: result.userVote !== undefined ? result.userVote : c.userVote,
            }
            : c
        ))
      }
    } catch {
      // Revert on error
      if (mountedRef.current) {
        setRawComments(snapshotForRollback)
      }
      showToast(t('errorVoteFailed'))
    }
  }, [showToast, t])

  // Toggle role badge visibility — stable callback using ref for rollback
  const handleToggleRole = useCallback(async (commentId, show) => {
    const snapshotForRollback = rawCommentsRef.current

    setRawComments(prev => prev.map(c =>
      c.id === commentId
        ? { ...c, showCreatorRole: show }
        : c
    ))

    try {
      await api.comments.patchComment(commentId, { showCreatorRole: show })
    } catch {
      // Revert on error
      if (mountedRef.current) {
        setRawComments(snapshotForRollback)
      }
      showToast(t('errorToggleRoleFailed'))
    }
  }, [showToast, t])

  // Load a single parent comment by ID — used by "View parent comment" to
  // progressively prepend ancestors without loading sibling threads.
  const loadParentComment = useCallback(async (parentCommentId) => {
    try {
      const result = await api.comments.getCommentThread(postId, parentCommentId, { maxDescendants: 1 })
      if (mountedRef.current && result) {
        const comments = result.comments ?? []
        const parent = comments.find(c => c.id === parentCommentId)
        if (parent) {
          setRawComments(prev => {
            if (prev.some(c => c.id === parentCommentId)) return prev
            return [parent, ...prev]
          })
          setStructureVersion(v => v + 1)
          return parent
        }
      }
    } catch {
      showToast(t('errorLoadComments'))
    }
    return null
  }, [postId, showToast, t])

  // Load more replies for a truncated root — fetches full subtree via getCommentThread
  const loadMoreReplies = useCallback(async (rootCommentId) => {
    try {
      const result = await api.comments.getCommentThread(postId, rootCommentId)
      if (mountedRef.current && result) {
        const newComments = result.comments ?? []
        // Merge: replace existing comments for this root, add new ones
        setRawComments(prev => {
          const existingIds = new Set(prev.map(c => c.id))
          const additions = newComments.filter(c => !existingIds.has(c.id))
          return [...prev, ...additions]
        })
        setStructureVersion(v => v + 1)
        // Remove from truncated set
        setTruncatedRoots(prev => {
          const next = new Set(prev)
          next.delete(rootCommentId)
          return next
        })
      }
    } catch {
      showToast(t('errorLoadComments'))
    }
  }, [postId, showToast, t])

  // Update isPinned on all comments — used by pin/unpin handler in parent
  const setCommentPinned = useCallback((commentId) => {
    setRawComments(prev => prev.map(c => ({
      ...c,
      isPinned: commentId ? c.id === commentId : false,
    })))
    setStructureVersion(v => v + 1)
  }, [])

  // Create a new comment — optimistic insert, reconcile on server response
  const handleCreateComment = useCallback(async (body, parentCommentId) => {
    const payload = { body }
    if (parentCommentId) payload.parentCommentId = parentCommentId
    const result = await api.comments.createComment(postId, payload)
    // Insert the server-returned comment into local state (dedup against socket race)
    if (mountedRef.current && result) {
      setRawComments(prev => {
        if (prev.some(c => c.id === result.id)) return prev
        return [...prev, result]
      })
      setStructureVersion(v => v + 1)
    }
    if (user?.id) CacheManager.invalidate(CacheKeys.activityComments(user.id))
  }, [postId, user?.id])

  return {
    flatList,
    loading,
    loadingMore,
    error,
    sort,
    setSort,
    toggleCollapse,
    handleVote,
    handleToggleRole,
    handleCreateComment,
    setCommentPinned,
    refetch: fetchComments,
    loadMore,
    loadMoreReplies,
    loadParentComment,
    hasMore,
    totalRootCount,
    truncatedRoots,
  }
}
