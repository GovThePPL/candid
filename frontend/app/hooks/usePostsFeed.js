import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../lib/api'

/**
 * Hook for paginated post feed with sort and filter support.
 *
 * @param {string} locationId - Current location ID
 * @param {string} categoryId - Current category ID (or 'all')
 * @param {string} postType - 'discussion' or 'question'
 * @returns {object} Feed state and controls
 */
export default function usePostsFeed(locationId, categoryId, postType) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [sort, setSort] = useState('hot')
  const [answeredFilter, setAnsweredFilter] = useState(null)
  const cursorRef = useRef(null)
  const fetchIdRef = useRef(0)

  const fetchPosts = useCallback(async (isRefresh = false) => {
    if (!locationId) return

    const id = ++fetchIdRef.current
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)
    cursorRef.current = null

    try {
      const result = await api.posts.getPosts(locationId, {
        categoryId,
        postType,
        sort,
        limit: 25,
        answered: answeredFilter,
      })

      // Stale request guard
      if (id !== fetchIdRef.current) return

      setPosts(result.posts || [])
      cursorRef.current = result.nextCursor
      setHasMore(result.hasMore || false)
    } catch (err) {
      if (id !== fetchIdRef.current) return
      setError(err)
      setPosts([])
    } finally {
      if (id === fetchIdRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [locationId, categoryId, postType, sort, answeredFilter])

  const loadMore = useCallback(async () => {
    if (!cursorRef.current || loadingMore || !hasMore) return

    setLoadingMore(true)
    try {
      const result = await api.posts.getPosts(locationId, {
        categoryId,
        postType,
        sort,
        cursor: cursorRef.current,
        limit: 25,
        answered: answeredFilter,
      })

      setPosts(prev => [...prev, ...(result.posts || [])])
      cursorRef.current = result.nextCursor
      setHasMore(result.hasMore || false)
    } catch (err) {
      // Silently fail on load more — user can retry by scrolling again
    } finally {
      setLoadingMore(false)
    }
  }, [locationId, categoryId, postType, sort, answeredFilter, loadingMore, hasMore])

  const handleRefresh = useCallback(() => {
    fetchPosts(true)
  }, [fetchPosts])

  const handleUpvote = useCallback(async (postId) => {
    // Optimistic update
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p
      const wasUpvoted = p.userVote?.voteType === 'upvote'
      return {
        ...p,
        userVote: wasUpvoted ? null : { voteType: 'upvote' },
        upvoteCount: wasUpvoted ? p.upvoteCount - 1 : p.upvoteCount + 1,
      }
    }))

    try {
      const result = await api.posts.voteOnPost(postId, { voteType: 'upvote' })
      // Update with server response
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p
        return {
          ...p,
          userVote: result.userVote,
          upvoteCount: result.upvoteCount,
          downvoteCount: result.downvoteCount,
          score: result.score,
        }
      }))
    } catch (err) {
      // Revert optimistic update by refetching
      fetchPosts()
    }
  }, [fetchPosts])

  const handleDownvote = useCallback(async (postId, reason) => {
    // Optimistic update
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p
      const wasDownvoted = p.userVote?.voteType === 'downvote'
      return {
        ...p,
        userVote: wasDownvoted ? null : { voteType: 'downvote', downvoteReason: reason },
        downvoteCount: wasDownvoted ? p.downvoteCount - 1 : p.downvoteCount + 1,
        upvoteCount: p.userVote?.voteType === 'upvote' ? p.upvoteCount - 1 : p.upvoteCount,
      }
    }))

    try {
      const result = await api.posts.voteOnPost(postId, { voteType: 'downvote', downvoteReason: reason })
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p
        return {
          ...p,
          userVote: result.userVote,
          upvoteCount: result.upvoteCount,
          downvoteCount: result.downvoteCount,
          score: result.score,
        }
      }))
    } catch (err) {
      fetchPosts()
    }
  }, [fetchPosts])

  // Refetch when dependencies change
  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  return {
    posts,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore,
    sort,
    setSort,
    answeredFilter,
    setAnsweredFilter,
    fetchPosts,
    loadMore,
    handleRefresh,
    handleUpvote,
    handleDownvote,
  }
}
