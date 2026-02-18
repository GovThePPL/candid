import { useState, useEffect, useMemo, useCallback, useRef, useContext, memo } from 'react'
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Modal,
} from 'react-native'
// react-native-keyboard-controller tracks actual keyboard frame (handles emoji
// keyboard, different keyboard heights, smooth transitions). Native only.
const KBAvoidingView = Platform.OS !== 'web'
  ? require('react-native-keyboard-controller').KeyboardAvoidingView
  : null
import { useLocalSearchParams, useRouter, usePathname } from 'expo-router'
import { useNavigation } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../../hooks/useThemeColors'
import { UserContext } from '../../../../contexts/UserContext'
import { hasQAAuthority } from '../../../../lib/roles'
import useModerateChecker from '../../../../hooks/useModerateChecker'
import { Spacing, BorderRadius, Shadows } from '../../../../constants/Theme'
import { SemanticColors } from '../../../../constants/Colors'
import api from '../../../../lib/api'
import { useToast } from '../../../../components/Toast'
import useCommentThread from '../../../../hooks/useCommentThread'
import Header from '../../../../components/Header'
import PostHeader from '../../../../components/discuss/PostHeader'
import CommentItem from '../../../../components/discuss/CommentItem'
import CommentSortControl from '../../../../components/discuss/CommentSortControl'
import DownvoteReasonPicker from '../../../../components/discuss/DownvoteReasonPicker'
import EmptyState from '../../../../components/EmptyState'
import ThemedText from '../../../../components/ThemedText'
import ReplyComposer from '../../../../components/discuss/ReplyComposer'
import ReportModal from '../../../../components/ReportModal'
import ModerationActionModal from '../../../../components/ModerationActionModal'

const screenHeight = Dimensions.get('window').height

export default function PostDetail() {
  const { id: postId, threadRoot, focus } = useLocalSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { user } = useContext(UserContext)
  const showToast = useToast()

  // Post state
  const [post, setPost] = useState(null)
  const [postLoading, setPostLoading] = useState(true)
  const [postError, setPostError] = useState(null)

  // Comment thread
  const {
    flatList,
    loading: commentsLoading,
    loadingMore,
    error: commentsError,
    sort,
    setSort,
    toggleCollapse,
    handleVote: handleCommentVote,
    handleToggleRole: handleCommentToggleRole,
    handleCreateComment,
    loadMore,
    loadMoreReplies,
    loadParentComment,
    hasMore,
    totalRootCount,
    truncatedRoots,
  } = useCommentThread(postId, { threadRootId: threadRoot || undefined, focusCommentId: focus || undefined })

  // Input state
  const [inputText, setInputText] = useState('')
  const [inputHeight, setInputHeight] = useState(40)
  const [replyingTo, setReplyingTo] = useState(null)
  const [posting, setPosting] = useState(false)

  // Mute state
  const [postMuted, setPostMuted] = useState(false)
  const [mutedCommentIds, setMutedCommentIds] = useState(() => new Set())

  // Downvote picker
  const [downvoteTarget, setDownvoteTarget] = useState(null)

  // Focus state (for navigating to a specific comment)
  // localFocus is set when loading a parent in-place (no URL navigation)
  const [localFocus, setLocalFocus] = useState(null)
  const effectiveFocus = focus || localFocus
  const scrollOffsetRef = useRef(0)
  const hasFocusScrolledRef = useRef(false)

  // Link prompt
  const [showLinkPrompt, setShowLinkPrompt] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')

  const flatListRef = useRef(null)
  const maxInputHeight = screenHeight * 0.3

  // Web: track keyboard height via visualViewport (native handled by KBAvoidingView)
  const [webKeyboardHeight, setWebKeyboardHeight] = useState(0)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const vv = window.visualViewport
    if (!vv) return
    const initialHeight = window.innerHeight
    let focusTimeout = null

    const update = () => {
      const diff = initialHeight - vv.height
      setWebKeyboardHeight(diff > 150 ? diff : 0)
    }

    vv.addEventListener('resize', update)

    // Firefox fires no visualViewport resize on keyboard open — use focus events
    const onFocusIn = (e) => {
      if (!e.target?.tagName?.match?.(/INPUT|TEXTAREA/i)) return
      clearTimeout(focusTimeout)
      setWebKeyboardHeight(Math.round(initialHeight * 0.4))
      setTimeout(update, 300)
    }
    const onFocusOut = () => {
      focusTimeout = setTimeout(() => {
        if (vv.height >= initialHeight - 150) setWebKeyboardHeight(0)
      }, 300)
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      vv.removeEventListener('resize', update)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      clearTimeout(focusTimeout)
    }
  }, [])

  // Reset scroll flag when focus param changes; clear local focus on URL focus
  useEffect(() => {
    if (focus) {
      setLocalFocus(null)
      hasFocusScrolledRef.current = false
    }
  }, [focus])

  // Compute scroll target: walk up to 2 parents from focused comment
  const scrollTargetId = useMemo(() => {
    if (!effectiveFocus) return null
    const commentMap = new Map(flatList.map(c => [c.id, c]))
    const focused = commentMap.get(effectiveFocus)
    if (!focused) return effectiveFocus
    let target = effectiveFocus
    let parentId = focused.parentCommentId
    for (let i = 0; i < 2 && parentId; i++) {
      const parent = commentMap.get(parentId)
      if (!parent) break
      target = parent.id
      parentId = parent.parentCommentId
    }
    return target
  }, [effectiveFocus, flatList])

  // Scroll to scroll target (grandparent of focused comment) when it reports position
  const handleFocusReady = useCallback((windowY) => {
    if (hasFocusScrolledRef.current) return
    hasFocusScrolledRef.current = true
    const contentY = scrollOffsetRef.current + windowY
    const targetOffset = Math.max(0, contentY - 80)
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: targetOffset, animated: true })
    }, 150)
  }, [])

  const isQAPost = post?.postType === 'question'
  const isPostLocked = post?.status === 'locked'
  const userHasQAAuthority = hasQAAuthority(user)

  // Can the current user post a top-level comment?
  const canPostTopLevel = !isPostLocked && (!isQAPost || userHasQAAuthority)

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  // Navigate to a subtree view for deeply nested threads
  const handleContinueThread = useCallback((commentId) => {
    router.push(`${pathname}?threadRoot=${commentId}`)
  }, [router, pathname])

  // Navigate back to full thread from subtree view
  const handleBackToFullThread = useCallback(() => {
    router.push(pathname)
  }, [router, pathname])

  // Find the nearest unloaded ancestor above the thread root.
  // Enables progressive "View parent" — each click loads one more level.
  const nextParentId = useMemo(() => {
    if (!threadRoot) return null
    const commentMap = new Map(flatList.map(c => [c.id, c]))
    let current = commentMap.get(threadRoot)
    if (!current) return null
    while (current.parentCommentId) {
      const parent = commentMap.get(current.parentCommentId)
      if (!parent) return current.parentCommentId
      current = parent
    }
    return null
  }, [threadRoot, flatList])

  const handleViewParent = useCallback(async () => {
    if (!nextParentId) return
    const parent = await loadParentComment(nextParentId)
    if (parent) {
      setLocalFocus(nextParentId)
      hasFocusScrolledRef.current = false
    }
  }, [nextParentId, loadParentComment])

  // Fetch post
  useEffect(() => {
    let cancelled = false
    async function fetchPost() {
      setPostLoading(true)
      setPostError(null)
      try {
        const data = await api.posts.getPost(postId)
        if (!cancelled) setPost(data)
      } catch (err) {
        if (!cancelled) setPostError(err)
      } finally {
        if (!cancelled) setPostLoading(false)
      }
    }
    fetchPost()
    return () => { cancelled = true }
  }, [postId])

  // Fetch mute status for own posts
  useEffect(() => {
    if (!post || !user || post.creator?.id !== user.id) return
    api.users.getNotificationMuteStatus({ targetType: 'post', targetId: postId })
      .then(res => { if (res) setPostMuted(res.muted) })
      .catch(() => {})
  }, [post, user, postId])

  // Toggle post mute
  const handleTogglePostMute = useCallback(async (mute) => {
    setPostMuted(mute)
    try {
      if (mute) {
        await api.users.muteNotifications({ targetType: 'post', targetId: postId })
      } else {
        await api.users.unmuteNotifications({ targetType: 'post', targetId: postId })
      }
    } catch {
      setPostMuted(!mute)
    }
  }, [postId])

  // Toggle comment mute
  const handleToggleMuteComment = useCallback(async (commentId, mute) => {
    // Optimistic update
    setMutedCommentIds(prev => {
      const next = new Set(prev)
      if (mute) next.add(commentId)
      else next.delete(commentId)
      return next
    })
    try {
      if (mute) {
        await api.users.muteNotifications({ targetType: 'comment', targetId: commentId })
      } else {
        await api.users.unmuteNotifications({ targetType: 'comment', targetId: commentId })
      }
    } catch {
      // Revert on failure
      setMutedCommentIds(prev => {
        const next = new Set(prev)
        if (mute) next.delete(commentId)
        else next.add(commentId)
        return next
      })
      showToast(t('errorVoteFailed'))
    }
  }, [showToast, t])

  // Report / moderate state
  const checkModerateScope = useModerateChecker()
  const userCanModerate = post ? checkModerateScope(post.location?.id, post.category?.id) : false
  const [reportTarget, setReportTarget] = useState(null)
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [moderateTarget, setModerateTarget] = useState(null)
  const [moderateRule, setModerateRule] = useState(null)
  const [moderateComment, setModerateComment] = useState(null)
  const [actionModalVisible, setActionModalVisible] = useState(false)

  const handleReportPost = useCallback((postId) => {
    setReportTarget({ type: 'post', id: postId })
    setReportModalVisible(true)
  }, [])

  const handleReportComment = useCallback((commentId) => {
    setReportTarget({ type: 'comment', id: commentId })
    setReportModalVisible(true)
  }, [])

  const handleReportSubmit = useCallback(async (ruleId, comment) => {
    if (reportTarget.type === 'post') {
      await api.moderation.reportPost(reportTarget.id, ruleId, comment)
    } else {
      await api.moderation.reportComment(reportTarget.id, ruleId, comment)
    }
  }, [reportTarget])

  const handleModeratePost = useCallback((postId) => {
    setModerateTarget({ type: 'post', id: postId })
    setReportModalVisible(true)
  }, [])

  const handleModerateComment = useCallback((commentId) => {
    setModerateTarget({ type: 'comment', id: commentId })
    setReportModalVisible(true)
  }, [])

  const handleModerateRuleSelected = useCallback(async (ruleId, comment, rule) => {
    setModerateRule(rule)
    setModerateComment(comment)
    setReportModalVisible(false)
    setTimeout(() => setActionModalVisible(true), 300)
  }, [])

  const handleModerateActionSubmit = useCallback(async (actionData) => {
    if (!moderateTarget || !moderateRule) return
    try {
      await api.moderation.inlineAction({
        targetType: moderateTarget.type,
        targetId: moderateTarget.id,
        ruleId: moderateRule.id,
        comment: moderateComment,
        ...actionData,
      })
      setActionModalVisible(false)
      showToast(t('moderationSuccess'))
      // Refresh post data
      const data = await api.posts.getPost(postId).catch(() => null)
      if (data) setPost(data)
    } catch (err) {
      if (err?.status === 403) {
        showToast(t('moderationForbidden'))
      } else {
        console.error('Inline moderation failed:', err)
      }
      throw err
    }
  }, [moderateTarget, moderateRule, moderateComment, t, showToast, postId])

  // Post voting
  const handlePostUpvote = useCallback(async () => {
    if (!post) return
    const wasUpvoted = post.userVote?.voteType === 'upvote'

    // Optimistic
    setPost(prev => ({
      ...prev,
      upvoteCount: (prev.upvoteCount || 0) + (wasUpvoted ? -1 : 1),
      downvoteCount: (prev.downvoteCount || 0) + (prev.userVote?.voteType === 'downvote' ? -1 : 0),
      userVote: wasUpvoted ? null : { voteType: 'upvote' },
    }))

    try {
      const result = await api.posts.voteOnPost(post.id, { voteType: 'upvote' })
      if (result) {
        setPost(prev => ({
          ...prev,
          upvoteCount: result.upvoteCount ?? prev.upvoteCount,
          downvoteCount: result.downvoteCount ?? prev.downvoteCount,
          userVote: result.userVote !== undefined ? result.userVote : prev.userVote,
        }))
      }
    } catch {
      // Revert by re-fetching
      const data = await api.posts.getPost(postId).catch(() => null)
      if (data) setPost(data)
      showToast(t('errorVoteFailed'))
    }
  }, [post, postId, showToast, t])

  const handlePostDownvote = useCallback(async () => {
    if (!post) return
    // If already downvoted, toggle it off without opening reason picker
    if (post.userVote?.voteType === 'downvote') {
      setPost(prev => ({
        ...prev,
        downvoteCount: (prev.downvoteCount || 0) - 1,
        userVote: null,
      }))
      try {
        const result = await api.posts.voteOnPost(post.id, { voteType: 'downvote', downvoteReason: post.userVote.downvoteReason || 'disagree' })
        if (result) {
          setPost(prev => ({
            ...prev,
            upvoteCount: result.upvoteCount ?? prev.upvoteCount,
            downvoteCount: result.downvoteCount ?? prev.downvoteCount,
            userVote: result.userVote !== undefined ? result.userVote : prev.userVote,
          }))
        }
      } catch {
        const data = await api.posts.getPost(postId).catch(() => null)
        if (data) setPost(data)
        showToast(t('errorVoteFailed'))
      }
      return
    }
    setDownvoteTarget({ type: 'post', id: post.id })
  }, [post, postId, showToast, t])

  // Post role toggle
  const handleTogglePostRole = useCallback(async (postId, show) => {
    // Optimistic update
    setPost(prev => prev ? { ...prev, showCreatorRole: show } : prev)
    try {
      await api.posts.patchPost(postId, { showCreatorRole: show })
    } catch {
      // Revert by re-fetching
      const data = await api.posts.getPost(postId).catch(() => null)
      if (data) setPost(data)
      showToast(t('errorToggleRoleFailed'))
    }
  }, [showToast, t])

  // Ref for reading current comment data without adding flatList to deps
  const flatListDataRef = useRef(flatList)
  useEffect(() => { flatListDataRef.current = flatList }, [flatList])

  // Comment voting handlers — stable callbacks (no deps on flatList/rawComments)
  const handleCommentUpvote = useCallback((commentId) => {
    handleCommentVote(commentId, 'upvote')
  }, [handleCommentVote])

  const handleCommentDownvote = useCallback((commentId) => {
    // If already downvoted, toggle it off without opening reason picker
    const comment = flatListDataRef.current.find(c => c.id === commentId)
    if (comment?.userVote?.voteType === 'downvote') {
      handleCommentVote(commentId, 'downvote', comment.userVote.downvoteReason || 'disagree')
      return
    }
    setDownvoteTarget({ type: 'comment', id: commentId })
  }, [handleCommentVote])

  // Downvote reason selected
  const handleDownvoteReasonSelect = useCallback(async (reason) => {
    if (!downvoteTarget) return
    const { type, id } = downvoteTarget

    if (type === 'post') {
      const wasDownvoted = post?.userVote?.voteType === 'downvote'
      setPost(prev => ({
        ...prev,
        downvoteCount: (prev.downvoteCount || 0) + (wasDownvoted ? -1 : 1),
        upvoteCount: (prev.upvoteCount || 0) + (prev.userVote?.voteType === 'upvote' ? -1 : 0),
        userVote: wasDownvoted ? null : { voteType: 'downvote', downvoteReason: reason },
      }))
      try {
        const result = await api.posts.voteOnPost(id, { voteType: 'downvote', downvoteReason: reason })
        if (result) {
          setPost(prev => ({
            ...prev,
            upvoteCount: result.upvoteCount ?? prev.upvoteCount,
            downvoteCount: result.downvoteCount ?? prev.downvoteCount,
            userVote: result.userVote !== undefined ? result.userVote : prev.userVote,
          }))
        }
      } catch {
        const data = await api.posts.getPost(postId).catch(() => null)
        if (data) setPost(data)
        showToast(t('errorVoteFailed'))
      }
    } else if (type === 'comment') {
      handleCommentVote(id, 'downvote', reason)
    }

    setDownvoteTarget(null)
  }, [downvoteTarget, post, postId, handleCommentVote])

  // Reply
  const handleReply = useCallback((comment) => {
    setReplyingTo(comment)
  }, [])

  const cancelReply = useCallback(() => {
    setReplyingTo(null)
  }, [])

  // Submit top-level comment (inline input bar)
  const handleSubmitComment = useCallback(async () => {
    const text = inputText.trim()
    if (!text || posting) return

    setPosting(true)
    try {
      await handleCreateComment(text, null)
      setInputText('')
      setInputHeight(40)
    } catch {
      showToast(t('errorCommentFailed'))
    } finally {
      setPosting(false)
    }
  }, [inputText, posting, handleCreateComment])

  // Submit reply via ReplyComposer modal
  const [replyPosting, setReplyPosting] = useState(false)
  const handleReplySubmit = useCallback(async (replyText) => {
    if (!replyingTo || replyPosting) return
    setReplyPosting(true)
    try {
      await handleCreateComment(replyText, replyingTo.id)
      setReplyingTo(null)
    } catch {
      showToast(t('errorCommentFailed'))
    } finally {
      setReplyPosting(false)
    }
  }, [replyingTo, replyPosting, handleCreateComment, showToast, t])

  const handleContentSizeChange = useCallback((event) => {
    const contentHeight = event.nativeEvent.contentSize.height
    const newHeight = Math.min(Math.max(40, contentHeight), maxInputHeight)
    setInputHeight(newHeight)
  }, [maxInputHeight])

  // Link insertion
  const handleOpenLinkPrompt = useCallback(() => {
    setLinkUrl('')
    setLinkText('')
    setShowLinkPrompt(true)
  }, [])

  const handleInsertLink = useCallback(() => {
    const url = linkUrl.trim()
    if (!url) return
    const text = linkText.trim()
    const markdown = text ? `[${text}](${url})` : url
    setInputText(prev => prev ? `${prev} ${markdown}` : markdown)
    setShowLinkPrompt(false)
  }, [linkUrl, linkText])

  // Group flat comments into chains (root comment + all replies).
  // Cache chains by root ID — reuse previous array when all items are the same
  // reference, so FlatList skips re-rendering unchanged chains.
  const chainsCacheRef = useRef(new Map())
  const chains = useMemo(() => {
    const groups = []
    let current = []
    for (const item of flatList) {
      if (item.depth === 0 && current.length > 0) {
        groups.push(current)
        current = []
      }
      current.push(item)
    }
    if (current.length > 0) groups.push(current)

    const prevCache = chainsCacheRef.current
    const nextCache = new Map()
    const stableChains = groups.map(chain => {
      const key = chain[0].id
      const prev = prevCache.get(key)
      if (prev && prev.length === chain.length && prev.every((item, i) => item === chain[i])) {
        nextCache.set(key, prev)
        return prev
      }
      nextCache.set(key, chain)
      return chain
    })
    chainsCacheRef.current = nextCache
    return stableChains
  }, [flatList])

  // Stable refs for values that ChainBlock needs but shouldn't cause re-renders
  const truncatedRootsRef = useRef(truncatedRoots)
  useEffect(() => { truncatedRootsRef.current = truncatedRoots }, [truncatedRoots])

  // Collect all chain-rendering callbacks into a stable ref to avoid
  // re-creating renderChain when any individual callback changes
  const chainHandlersRef = useRef(null)
  chainHandlersRef.current = {
    onUpvote: handleCommentUpvote,
    onDownvote: handleCommentDownvote,
    onReply: handleReply,
    onToggleCollapse: toggleCollapse,
    onToggleRole: handleCommentToggleRole,
    onToggleMuteComment: handleToggleMuteComment,
    onContinueThread: handleContinueThread,
    onLoadMoreReplies: loadMoreReplies,
    onFocusReady: handleFocusReady,
    onReport: handleReportComment,
    onModerate: handleModerateComment,
    truncatedRoots,
    focus: effectiveFocus,
    scrollTargetId,
    currentUserId: user?.id,
    isQAPost,
    isPostLocked,
    userHasQAAuthority,
    canModerate: userCanModerate,
  }

  const renderChain = useCallback(({ item: chain }) => (
    <ChainBlock
      chain={chain}
      handlersRef={chainHandlersRef}
      mutedCommentIds={mutedCommentIds}
      style={styles.chainBlock}
    />
  ), [styles.chainBlock, mutedCommentIds])

  const chainKeyExtractor = useCallback((item) => item[0].id, [])

  // Loading/error states
  if (postLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Header onBack={handleBack} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    )
  }

  if (postError || !post) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Header onBack={handleBack} />
        <View style={styles.centered}>
          <EmptyState
            icon="alert-circle-outline"
            title={t('errorLoadPost')}
            subtitle={t('retry')}
          />
        </View>
      </View>
    )
  }

  // List header: post + comment header
  const ListHeader = (
    <>
      <View style={styles.postHeaderShadow}>
        <PostHeader
          post={post}
          currentUserId={user?.id}
          onUpvote={handlePostUpvote}
          onDownvote={handlePostDownvote}
          onToggleRole={handleTogglePostRole}
          onToggleMute={handleTogglePostMute}
          isMuted={postMuted}
          canModerate={userCanModerate}
          onReport={handleReportPost}
          onModerate={handleModeratePost}
        />
      </View>
      <View style={styles.commentSection}>
        <View style={styles.commentHeaderRow}>
          <ThemedText variant="h3">
            {t('commentsHeader', { count: post?.commentCount ?? 0 })}
          </ThemedText>
          <CommentSortControl sort={sort} onSortChange={setSort} />
        </View>
        {threadRoot && (
          <View style={styles.threadButtonRow}>
            <TouchableOpacity
              style={styles.threadPill}
              onPress={handleBackToFullThread}
              activeOpacity={0.6}
              accessibilityRole="link"
              accessibilityLabel={t('backToFullThreadA11y')}
            >
              <Ionicons name="arrow-back" size={14} color={colors.primary} />
              <ThemedText variant="caption" color="primary">
                {t('backToFullThread')}
              </ThemedText>
            </TouchableOpacity>
            {nextParentId && (
              <TouchableOpacity
                style={styles.threadPill}
                onPress={handleViewParent}
                activeOpacity={0.6}
                accessibilityRole="link"
                accessibilityLabel={t('viewParentA11y')}
              >
                <Ionicons name="arrow-up" size={14} color={colors.primary} />
                <ThemedText variant="caption" color="primary">
                  {t('viewParent')}
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        )}
        {commentsLoading && flatList.length === 0 && (
          <ActivityIndicator size="small" color={colors.primary} style={styles.commentLoading} />
        )}
        {!commentsLoading && flatList.length === 0 && (
          <EmptyState
            icon="chatbubbles-outline"
            title={t('noComments')}
            subtitle={t('beFirstToComment')}
            style={styles.emptyComments}
          />
        )}
      </View>
    </>
  )

  // Determine input state (inline bar is for top-level comments only)
  const inputDisabled = isPostLocked || !canPostTopLevel
  const inputPlaceholder = isPostLocked
    ? t('postLocked')
    : !canPostTopLevel
      ? t('qaOnlyExperts')
      : t('addComment')

  const Wrapper = Platform.OS === 'web' ? View : KBAvoidingView
  const wrapperProps = Platform.OS === 'web' ? {} : {
    behavior: 'padding',
    keyboardVerticalOffset: 0,
  }

  return (
    <Wrapper style={[styles.screen, { paddingTop: insets.top }]} {...wrapperProps}>
      <Header onBack={handleBack} />
      <FlatList
        ref={flatListRef}
        data={chains}
        renderItem={renderChain}
        keyExtractor={chainKeyExtractor}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={
          <View style={styles.listFooter}>
            {loadingMore && (
              <ActivityIndicator size="small" color={colors.primary} style={styles.loadingMore} />
            )}
          </View>
        }
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.5}
        scrollEventThrottle={16}
        onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y }}
      />

      {/* Input bar (top-level comments only) */}
      <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}>
        <View style={styles.inputRow}>
          <TouchableOpacity
            onPress={handleOpenLinkPrompt}
            disabled={inputDisabled}
            style={[styles.linkButton, inputDisabled && styles.inputDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('insertLinkA11y')}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="link" size={20} color={inputDisabled ? colors.placeholderText : colors.secondaryText} />
          </TouchableOpacity>
          <TextInput
            style={[
              styles.input,
              { height: inputHeight, maxHeight: maxInputHeight, color: colors.text },
              inputDisabled && styles.inputDisabled,
            ]}
            value={inputText}
            onChangeText={setInputText}
            onContentSizeChange={handleContentSizeChange}
            placeholder={inputPlaceholder}
            placeholderTextColor={colors.placeholderText}
            multiline
            maxLength={2000}
            maxFontSizeMultiplier={1.5}
            editable={!inputDisabled}
            returnKeyType="default"
            scrollEnabled={inputHeight >= maxInputHeight}
            accessibilityLabel={inputPlaceholder}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || inputDisabled) && styles.sendButtonDisabled]}
            onPress={handleSubmitComment}
            disabled={!inputText.trim() || inputDisabled || posting}
            accessibilityRole="button"
            accessibilityLabel={t('postComment')}
          >
            {posting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons
                name="send"
                size={18}
                color={inputText.trim() && !inputDisabled ? '#FFFFFF' : colors.placeholderText}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Link prompt modal */}
      <Modal
        visible={showLinkPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLinkPrompt(false)}
      >
        <View style={styles.linkOverlay}>
          <View style={styles.linkModal}>
            <ThemedText variant="h3" style={styles.linkModalTitle}>
              {t('linkPromptTitle')}
            </ThemedText>
            <TextInput
              style={[styles.linkInput, { color: colors.text }]}
              placeholder={t('linkPromptURL')}
              placeholderTextColor={colors.placeholderText}
              value={linkUrl}
              onChangeText={setLinkUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              maxFontSizeMultiplier={1.5}
              accessibilityLabel={t('linkPromptURL')}
            />
            <TextInput
              style={[styles.linkInput, { color: colors.text }]}
              placeholder={t('linkPromptText')}
              placeholderTextColor={colors.placeholderText}
              value={linkText}
              onChangeText={setLinkText}
              maxFontSizeMultiplier={1.5}
              accessibilityLabel={t('linkPromptText')}
            />
            <View style={styles.linkModalActions}>
              <TouchableOpacity
                onPress={() => setShowLinkPrompt(false)}
                style={styles.linkCancelButton}
                accessibilityRole="button"
                accessibilityLabel={t('linkPromptCancel')}
              >
                <ThemedText variant="button" color="secondary">{t('linkPromptCancel')}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleInsertLink}
                disabled={!linkUrl.trim()}
                style={[styles.linkInsertButton, !linkUrl.trim() && styles.linkInsertButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t('linkPromptInsert')}
              >
                <ThemedText variant="button" color="inverse">{t('linkPromptInsert')}</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Web keyboard spacer */}
      {Platform.OS === 'web' && webKeyboardHeight > 0 && (
        <View style={{ height: webKeyboardHeight }} />
      )}

      {/* Reply composer modal */}
      <ReplyComposer
        visible={replyingTo != null}
        comment={replyingTo}
        onSubmit={handleReplySubmit}
        onClose={cancelReply}
        posting={replyPosting}
      />

      {/* Downvote reason picker */}
      <DownvoteReasonPicker
        visible={downvoteTarget != null}
        onClose={() => setDownvoteTarget(null)}
        onSelect={handleDownvoteReasonSelect}
      />

      {/* Report modal (non-moderator report flow, or first step of moderation flow) */}
      <ReportModal
        visible={reportModalVisible}
        onClose={() => { setReportModalVisible(false); setReportTarget(null) }}
        onSubmit={moderateTarget ? handleModerateRuleSelected : handleReportSubmit}
        contentType={moderateTarget?.type || reportTarget?.type}
        isModerating={!!moderateTarget}
      />

      {/* Moderation action modal (second step of moderation flow) */}
      <ModerationActionModal
        visible={actionModalVisible}
        onClose={() => { setActionModalVisible(false); setModerateTarget(null); setModerateRule(null); setModerateComment(null) }}
        onSubmit={handleModerateActionSubmit}
        reportType={moderateTarget?.type}
        rule={moderateRule}
      />
    </Wrapper>
  )
}

// Renders a chain of comments (root + all replies in one card).
// Reads handlers from a ref so FlatList's renderItem stays stable.
const ChainBlock = memo(function ChainBlock({ chain, handlersRef, mutedCommentIds, style }) {
  const h = handlersRef.current
  return (
    <View style={style}>
      {chain.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={mutedCommentIds.has(comment.id) ? { ...comment, isMuted: true } : comment}
          currentUserId={h.currentUserId}
          isQAPost={h.isQAPost}
          isPostLocked={h.isPostLocked}
          currentUserHasQAAuthority={h.userHasQAAuthority}
          onUpvote={h.onUpvote}
          onDownvote={h.onDownvote}
          onReply={h.onReply}
          onToggleCollapse={h.onToggleCollapse}
          onToggleRole={h.onToggleRole}
          onToggleMuteComment={h.onToggleMuteComment}
          onContinueThread={h.onContinueThread}
          isTruncatedRoot={h.truncatedRoots.has(comment.id)}
          onLoadMoreReplies={h.onLoadMoreReplies}
          isFocused={h.focus === comment.id}
          isScrollTarget={h.scrollTargetId === comment.id}
          onFocusReady={h.onFocusReady}
          canModerate={h.canModerate}
          onReport={h.onReport}
          onModerate={h.onModerate}
        />
      ))}
    </View>
  )
})

const createStyles = (colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  listContent: {
    gap: Spacing.md,
  },
  chainBlock: {
    backgroundColor: colors.cardBackground,
    paddingVertical: Spacing.xs,
    ...Shadows.card,
  },
  postHeaderShadow: {
    ...Shadows.card,
  },
  threadButtonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  threadPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  commentSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  commentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  commentLoading: {
    marginTop: Spacing.lg,
  },
  emptyComments: {
    flex: 0,
    paddingVertical: Spacing.xxl,
  },
  listFooter: {
    height: 20,
  },
  loadingMore: {
    paddingVertical: Spacing.md,
  },
  inputContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    backgroundColor: colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 15,
    lineHeight: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  linkButton: {
    padding: 4,
    marginBottom: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendButtonDisabled: {
    backgroundColor: colors.cardBorder,
  },
  // Link prompt modal
  linkOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  linkModal: {
    backgroundColor: colors.cardBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 400,
  },
  linkModalTitle: {
    marginBottom: Spacing.lg,
  },
  linkInput: {
    backgroundColor: colors.background,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: Spacing.md,
  },
  linkModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  linkCancelButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  linkInsertButton: {
    backgroundColor: colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.pill,
  },
  linkInsertButtonDisabled: {
    opacity: 0.5,
  },
})
