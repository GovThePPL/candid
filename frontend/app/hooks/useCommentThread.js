import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { buildTree, sortTree, flattenTree } from '../lib/commentTree'

/**
 * Hook for managing comment thread state: fetch, tree build, sort, collapse,
 * optimistic voting, comment creation, and cursor-based pagination.
 *
 * Sort order is computed once on fetch/sort-change/new-comments and held stable.
 * Votes update comment data in-place without re-sorting (prevents comments
 * from jumping around while the user is reading).
 *
 * @param {string} postId - Post ID to fetch comments for
 * @returns {Object} thread state and actions
 */
export default function useCommentThread(postId) {
  const { t } = useTranslation('discuss')
  const showToast = useToast()
  const [rawComments, setRawComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [sort, setSort] = useState('best')
  const [collapsedIds, setCollapsedIds] = useState(new Set())
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [totalRootCount, setTotalRootCount] = useState(0)
  const mountedRef = useRef(true)

  // Counter bumped on structural changes (fetch, new comments, load more)
  // to trigger re-sort. Votes do NOT bump this.
  const [structureVersion, setStructureVersion] = useState(0)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Fetch first page of comments from API
  const fetchComments = useCallback(async () => {
    if (!postId) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.comments.getComments(postId)
      if (mountedRef.current) {
        const comments = result?.comments ?? (Array.isArray(result) ? result : [])
        setRawComments(comments)
        setStructureVersion(v => v + 1)
        setCursor(result?.nextCursor ?? null)
        setHasMore(result?.hasMore ?? false)
        setTotalRootCount(result?.totalRootCount ?? comments.length)
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
  }, [postId])

  // Fetch on mount / postId change
  useEffect(() => {
    fetchComments()
  }, [fetchComments])

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

  // Compute sort order + tree layout (only on structural changes, sort, collapse)
  // Returns array of { id, depth, visualDepth, isCollapsed, collapsedCount, activeLines, lineStates }
  const sortedLayout = useMemo(() => {
    if (rawComments.length === 0) return []
    const tree = buildTree(rawComments)
    const sorted = sortTree(tree, sort)
    const flat = flattenTree(sorted, collapsedIds)
    // Strip data fields — keep only structural/layout info + id
    return flat.map(item => ({
      id: item.id,
      depth: item.depth,
      visualDepth: item.visualDepth,
      isCollapsed: item.isCollapsed,
      collapsedCount: item.collapsedCount,
      activeLines: item.activeLines,
      lineStates: item.lineStates,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureVersion, sort, collapsedIds])

  // Build final flat list: stable order from sortedLayout + current data from rawComments
  const flatList = useMemo(() => {
    if (sortedLayout.length === 0) return []
    const commentMap = new Map(rawComments.map(c => [c.id, c]))
    return sortedLayout.map(layout => {
      const data = commentMap.get(layout.id)
      if (!data) return null
      return { ...data, ...layout }
    }).filter(Boolean)
  }, [sortedLayout, rawComments])

  // Toggle collapse
  const toggleCollapse = useCallback((commentId) => {
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

  // Optimistic vote on comment
  const handleVote = useCallback(async (commentId, voteType, reason) => {
    // Find current comment state for rollback
    const prevComments = rawComments
    const comment = rawComments.find(c => c.id === commentId)
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
        setRawComments(prevComments)
      }
      showToast(t('errorVoteFailed'))
    }
  }, [rawComments, showToast, t])

  // Toggle role badge visibility on a comment
  const handleToggleRole = useCallback(async (commentId, show) => {
    // Optimistic update
    const prevComments = rawComments
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
        setRawComments(prevComments)
      }
      showToast(t('errorToggleRoleFailed'))
    }
  }, [rawComments, showToast, t])

  // Create a new comment — optimistic insert, reconcile on server response
  const handleCreateComment = useCallback(async (body, parentCommentId) => {
    const payload = { body }
    if (parentCommentId) payload.parentCommentId = parentCommentId
    const result = await api.comments.createComment(postId, payload)
    // Insert the server-returned comment into local state
    if (mountedRef.current && result) {
      setRawComments(prev => [...prev, result])
      setStructureVersion(v => v + 1)
    }
  }, [postId])

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
    refetch: fetchComments,
    loadMore,
    hasMore,
    totalRootCount,
    commentCount: rawComments.length,
  }
}
