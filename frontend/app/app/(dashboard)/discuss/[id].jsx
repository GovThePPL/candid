import { useState, useEffect, useMemo, useCallback, useRef, useContext } from 'react'
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Modal,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useNavigation } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { UserContext } from '../../../contexts/UserContext'
import { hasQAAuthority } from '../../../lib/roles'
import { Spacing, BorderRadius } from '../../../constants/Theme'
import { SemanticColors } from '../../../constants/Colors'
import api from '../../../lib/api'
import useCommentThread from '../../../hooks/useCommentThread'
import Header from '../../../components/Header'
import PostHeader from '../../../components/discuss/PostHeader'
import CommentItem from '../../../components/discuss/CommentItem'
import CommentSortControl from '../../../components/discuss/CommentSortControl'
import DownvoteReasonPicker from '../../../components/discuss/DownvoteReasonPicker'
import EmptyState from '../../../components/EmptyState'
import ThemedText from '../../../components/ThemedText'

const screenHeight = Dimensions.get('window').height

export default function PostDetail() {
  const { id: postId } = useLocalSearchParams()
  const router = useRouter()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { user } = useContext(UserContext)

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
    hasMore,
    totalRootCount,
    commentCount,
  } = useCommentThread(postId)

  // Input state
  const [inputText, setInputText] = useState('')
  const [inputHeight, setInputHeight] = useState(40)
  const [replyingTo, setReplyingTo] = useState(null)
  const [posting, setPosting] = useState(false)

  // Downvote picker
  const [downvoteTarget, setDownvoteTarget] = useState(null)

  // Link prompt
  const [showLinkPrompt, setShowLinkPrompt] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')

  const flatListRef = useRef(null)
  const maxInputHeight = screenHeight * 0.3

  const isQAPost = post?.postType === 'question'
  const isPostLocked = post?.status === 'locked'
  const userHasQAAuthority = hasQAAuthority(user)

  // Can the current user post a top-level comment?
  const canPostTopLevel = !isPostLocked && (!isQAPost || userHasQAAuthority)

  const handleBack = useCallback(() => {
    const state = navigation.getState()
    if (state?.routes?.length > 1) {
      navigation.goBack()
    } else {
      router.replace('/discuss')
    }
  }, [navigation, router])

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
    }
  }, [post, postId])

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
      }
      return
    }
    setDownvoteTarget({ type: 'post', id: post.id })
  }, [post, postId])

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
    }
  }, [])

  // Comment voting handlers
  const handleCommentUpvote = useCallback((commentId) => {
    handleCommentVote(commentId, 'upvote')
  }, [handleCommentVote])

  const handleCommentDownvote = useCallback((commentId) => {
    // If already downvoted, toggle it off without opening reason picker
    const comment = flatList.find(c => c.id === commentId)
    if (comment?.userVote?.voteType === 'downvote') {
      handleCommentVote(commentId, 'downvote', comment.userVote.downvoteReason || 'disagree')
      return
    }
    setDownvoteTarget({ type: 'comment', id: commentId })
  }, [flatList, handleCommentVote])

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

  // Submit comment
  const handleSubmitComment = useCallback(async () => {
    const text = inputText.trim()
    if (!text || posting) return

    setPosting(true)
    try {
      await handleCreateComment(text, replyingTo?.id || null)
      setInputText('')
      setInputHeight(40)
      setReplyingTo(null)
    } catch {
      // Error is surfaced by the hook
    } finally {
      setPosting(false)
    }
  }, [inputText, posting, handleCreateComment, replyingTo])

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

  // Group flat comments into chains (root comment + all replies)
  const chains = useMemo(() => {
    const result = []
    let current = []
    for (const item of flatList) {
      if (item.depth === 0 && current.length > 0) {
        result.push(current)
        current = []
      }
      current.push(item)
    }
    if (current.length > 0) result.push(current)
    return result
  }, [flatList])

  const renderChain = useCallback(({ item: chain }) => (
    <View style={styles.chainBlock}>
      {chain.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          currentUserId={user?.id}
          isQAPost={isQAPost}
          isPostLocked={isPostLocked}
          currentUserHasQAAuthority={userHasQAAuthority}
          onUpvote={handleCommentUpvote}
          onDownvote={handleCommentDownvote}
          onReply={handleReply}
          onToggleCollapse={toggleCollapse}
          onToggleRole={handleCommentToggleRole}
        />
      ))}
    </View>
  ), [user?.id, isQAPost, isPostLocked, userHasQAAuthority, handleCommentUpvote, handleCommentDownvote, handleReply, toggleCollapse, handleCommentToggleRole, styles.chainBlock])

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
        />
      </View>
      <View style={styles.commentSection}>
        <View style={styles.commentHeaderRow}>
          <ThemedText variant="h3">
            {t('commentsHeader', { count: commentCount })}
          </ThemedText>
          <CommentSortControl sort={sort} onSortChange={setSort} />
        </View>
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

  // Determine input state
  const inputDisabled = isPostLocked || (!canPostTopLevel && !replyingTo)
  const inputPlaceholder = isPostLocked
    ? t('postLocked')
    : (!canPostTopLevel && !replyingTo)
      ? t('qaOnlyExperts')
      : replyingTo
        ? t('addReply')
        : t('addComment')

  const keyboardOffset = Platform.OS === 'ios' ? 64 + insets.top : 0

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardOffset}
    >
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
      />

      {/* Reply banner */}
      {replyingTo && (
        <View style={styles.replyBanner}>
          <ThemedText variant="caption" color="secondary" style={styles.replyText}>
            {t('replyingTo', { username: replyingTo.creator?.username || '?' })}
          </ThemedText>
          <TouchableOpacity
            onPress={cancelReply}
            accessibilityRole="button"
            accessibilityLabel={t('cancelReply')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={18} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>
      )}

      {/* Input bar */}
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
            accessibilityLabel={replyingTo ? t('postReply') : t('postComment')}
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

      {/* Downvote reason picker */}
      <DownvoteReasonPicker
        visible={downvoteTarget != null}
        onClose={() => setDownvoteTarget(null)}
        onSelect={handleDownvoteReasonSelect}
      />
    </KeyboardAvoidingView>
  )
}

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
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
      android: { elevation: 2 },
      default: { boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' },
    }),
  },
  postHeaderShadow: {
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
      android: { elevation: 2 },
      default: { boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' },
    }),
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
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  replyText: {
    flex: 1,
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
