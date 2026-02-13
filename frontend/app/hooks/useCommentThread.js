import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import api from '../lib/api'
import { buildTree, sortTree, flattenTree } from '../lib/commentTree'

/**
 * Hook for managing comment thread state: fetch, tree build, sort, collapse,
 * optimistic voting, and comment creation.
 *
 * @param {string} postId - Post ID to fetch comments for
 * @returns {Object} thread state and actions
 */
export default function useCommentThread(postId) {
  const [rawComments, setRawComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sort, setSort] = useState('best')
  const [collapsedIds, setCollapsedIds] = useState(new Set())
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Fetch comments from API
  const fetchComments = useCallback(async () => {
    if (!postId) return
    setLoading(true)
    setError(null)
    try {
      const comments = await api.comments.getComments(postId)
      if (mountedRef.current) {
        setRawComments(Array.isArray(comments) ? comments : [])
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

  // Build flattened list from raw comments
  const flatList = useMemo(() => {
    if (rawComments.length === 0) return []
    const tree = buildTree(rawComments)
    const sorted = sortTree(tree, sort)
    return flattenTree(sorted, collapsedIds)
  }, [rawComments, sort, collapsedIds])

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

    // Optimistic update
    setRawComments(prev => prev.map(c =>
      c.id === commentId
        ? { ...c, upvoteCount: newUpvoteCount, downvoteCount: newDownvoteCount, userVote: newUserVote }
        : c
    ))

    try {
      const body = { voteType }
      if (voteType === 'downvote' && reason) body.downvoteReason = reason
      const result = await api.comments.voteOnComment(commentId, body)
      // Reconcile with server response
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
    }
  }, [rawComments])

  // Create a new comment
  const handleCreateComment = useCallback(async (body, parentCommentId) => {
    const payload = { body }
    if (parentCommentId) payload.parentCommentId = parentCommentId
    await api.comments.createComment(postId, payload)
    // Refetch to get server-assigned fields (id, path, score, etc.)
    await fetchComments()
  }, [postId, fetchComments])

  return {
    flatList,
    loading,
    error,
    sort,
    setSort,
    toggleCollapse,
    handleVote,
    handleCreateComment,
    refetch: fetchComments,
    commentCount: rawComments.length,
  }
}
