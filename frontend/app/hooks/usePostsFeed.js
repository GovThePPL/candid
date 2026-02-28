import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { isBridging } from '../lib/bridging'
import { playUpvoteSound, playBridgingSound, initNativeSounds } from '../lib/sounds'
import { hapticTap, hapticSuccess } from '../lib/haptics'

/**
 * Hook for paginated post feed with sort and filter support.
 *
 * @param {string} locationId - Current location ID
 * @param {string} sessionId - Current session ID (or 'all')
 * @param {string} postType - 'discussion' or 'question'
 * @param {object} [options] - Additional options
 * @param {string} [options.phase] - Major phase filter (proposal, opinion, reflection, consensus)
 * @param {string} [options.effectiveStage] - Current effective stage for pin operations
 * @returns {object} Feed state and controls
 */
export default function usePostsFeed(locationId, sessionId, postType, { phase, effectiveStage } = {}) {
  const { t } = useTranslation('discuss')
  const showToast = useToast()
  useEffect(() => { initNativeSounds() }, [])
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
        sessionId,
        postType,
        sort,
        limit: 25,
        answered: answeredFilter,
        phase,
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
  }, [locationId, sessionId, postType, sort, answeredFilter, phase])

  const loadMore = useCallback(async () => {
    if (!cursorRef.current || loadingMore || !hasMore) return

    setLoadingMore(true)
    try {
      const result = await api.posts.getPosts(locationId, {
        sessionId,
        postType,
        sort,
        cursor: cursorRef.current,
        limit: 25,
        answered: answeredFilter,
        phase,
      })

      setPosts(prev => [...prev, ...(result.posts || [])])
      cursorRef.current = result.nextCursor
      setHasMore(result.hasMore || false)
    } catch (err) {
      // Silently fail on load more — user can retry by scrolling again
    } finally {
      setLoadingMore(false)
    }
  }, [locationId, sessionId, postType, sort, answeredFilter, phase, loadingMore, hasMore])

  const handleRefresh = useCallback(() => {
    fetchPosts(true)
  }, [fetchPosts])

  // Ref for reading current posts without adding to callback deps
  const postsRef = useRef(posts)
  useEffect(() => { postsRef.current = posts }, [posts])

  const handleUpvote = useCallback(async (postId) => {
    // Sound + haptic on new upvotes (not toggles/removes)
    const post = postsRef.current.find(p => p.id === postId)
    const wasUpvoted = post?.userVote?.voteType === 'upvote'
    let playedBridging = false
    if (!wasUpvoted && post) {
      const wasBridging = isBridging(post)
      const afterPost = { ...post, upvoteCount: post.upvoteCount + 1 }
      if (!wasBridging && isBridging(afterPost)) {
        playBridgingSound()
        hapticSuccess()
        playedBridging = true
      } else {
        playUpvoteSound()
        hapticTap()
      }
    }

    // Snapshot for rollback
    const prevPosts = postsRef.current

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

      // Upgrade feedback if cross-group and we didn't already play bridging
      if (result.isCrossGroup && !wasUpvoted && !playedBridging) {
        playBridgingSound()
        hapticSuccess()
      }

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
      // Revert optimistic update
      setPosts(prevPosts)
      showToast(t('errorVoteFailed'))
    }
  }, [showToast, t])

  const handleToggleRole = useCallback((postId, showCreatorRole) => {
    // Optimistic update only — no API endpoint yet
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, showCreatorRole } : p
    ))
  }, [])

  const handleDownvote = useCallback(async (postId, reason) => {
    // Snapshot for rollback
    const prevPosts = postsRef.current

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
      // Revert optimistic update
      setPosts(prevPosts)
      showToast(t('errorVoteFailed'))
    }
  }, [showToast, t])

  const handleLockPost = useCallback(async (postId, lock) => {
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, status: lock ? 'locked' : 'active' } : p
    ))
    try {
      await api.posts.patchPost(postId, { locked: lock })
      showToast(lock ? t('lockSuccess') : t('unlockSuccess'))
    } catch {
      // Revert
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, status: lock ? 'active' : 'locked' } : p
      ))
      showToast(t('errorLockFailed'))
    }
  }, [showToast, t])

  const handleUpdatePost = useCallback(async (postId, data) => {
    try {
      const result = await api.posts.updatePost(postId, data)
      if (result) {
        setPosts(prev => prev.map(p =>
          p.id === postId ? { ...p, ...result } : p
        ))
      }
      return result
    } catch (err) {
      if (err?.status === 403) {
        showToast(t('errorEditExpired'))
      } else {
        showToast(t('errorEditPost'))
      }
      throw err
    }
  }, [showToast, t])

  const handleDeletePost = useCallback(async (postId) => {
    try {
      await api.posts.deletePost(postId)
      setPosts(prev => prev.filter(p => p.id !== postId))
    } catch {
      showToast(t('errorDeletePost'))
    }
  }, [showToast, t])

  const handlePinPost = useCallback(async (postId, pin) => {
    // Optimistic update
    const prevPosts = posts
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, isPinned: pin, pinnedStage: pin ? effectiveStage : null } : p
    ))

    try {
      await api.posts.patchPost(postId, {
        pinned: pin,
        pinSessionId: sessionId && sessionId !== 'all' ? sessionId : undefined,
        pinStage: pin ? effectiveStage : undefined,
      })
      showToast(pin ? t('pinSuccess') : t('unpinSuccess'))
    } catch (err) {
      // Rollback
      setPosts(prevPosts)
      if (err?.status === 409) {
        showToast(t('errorPinMaxReached'))
      } else {
        showToast(t('errorPinFailed'))
      }
    }
  }, [posts, sessionId, effectiveStage, showToast, t])

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
    handleToggleRole,
    handleLockPost,
    handleUpdatePost,
    handleDeletePost,
    handlePinPost,
  }
}
