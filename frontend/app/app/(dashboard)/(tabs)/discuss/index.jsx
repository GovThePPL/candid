import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react'
import { View, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../../hooks/useThemeColors'
import useIsDesktop from '../../../../hooks/useIsDesktop'
import { Spacing } from '../../../../constants/Theme'
import { useAuth } from '../../../../contexts/UserContext'
import { useLocationSession } from '../../../../contexts/LocationSessionContext'
import { hasQAAuthority } from '../../../../lib/roles'
import useModerateChecker from '../../../../hooks/useModerateChecker'
import usePostsFeed from '../../../../hooks/usePostsFeed'
import api, { sessionsApiWrapper } from '../../../../lib/api'
import Header from '../../../../components/Header'
import FeedTabBar from '../../../../components/discuss/FeedTabBar'
import SortDropdown from '../../../../components/discuss/SortDropdown'
import PostCard from '../../../../components/discuss/PostCard'
import DownvoteReasonPicker from '../../../../components/discuss/DownvoteReasonPicker'
import ReportModal from '../../../../components/ReportModal'
import ModerationActionModal from '../../../../components/ModerationActionModal'
import EditPostModal from '../../../../components/discuss/EditPostModal'
import GlossaryDrawer from '../../../../components/GlossaryDrawer'
import { useGlossaryDrawer, useGlossaryRules } from '../../../../hooks/useGlossaryDrawer'
import BallotCard from '../../../../components/discuss/BallotCard'
import ElectionResults from '../../../../components/discuss/ElectionResults'
import EndorsementManageModal from '../../../../components/discuss/EndorsementManageModal'
import CommunityRulesModal from '../../../../components/CommunityRulesModal'
import EmptyState from '../../../../components/EmptyState'
import SessionInfoCard from '../../../../components/SessionInfoCard'
import ThemedText from '../../../../components/ThemedText'
import { SkeletonPulse, SkeletonBox, SkeletonLine } from '../../../../components/Skeleton'

function PostCardSkeleton({ styles }) {
  return (
    <View style={styles.skeletonCard}>
      {/* Top row: badge pill + time */}
      <View style={styles.skeletonTopRow}>
        <SkeletonBox width={120} height={20} borderRadius={10} />
        <SkeletonBox width={28} height={12} borderRadius={6} />
      </View>
      {/* Title: 2 lines */}
      <View style={{ gap: 6, marginTop: 10 }}>
        <SkeletonLine width="90%" height={16} />
        <SkeletonLine width="65%" height={16} />
      </View>
      {/* Body preview: 2 lines */}
      <View style={{ gap: 5, marginTop: 10 }}>
        <SkeletonLine width="100%" height={12} />
        <SkeletonLine width="80%" height={12} />
      </View>
      {/* Bottom row: author + actions */}
      <View style={styles.skeletonBottomRow}>
        <SkeletonBox width={80} height={12} borderRadius={6} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SkeletonBox width={40} height={22} borderRadius={11} />
          <SkeletonBox width={50} height={22} borderRadius={11} />
        </View>
      </View>
    </View>
  )
}

function FeedSkeleton({ styles }) {
  return (
    <SkeletonPulse>
      {Array.from({ length: 4 }).map((_, i) => (
        <PostCardSkeleton key={i} styles={styles} />
      ))}
    </SkeletonPulse>
  )
}

/**
 * Wrapper that reads volatile props from a ref so the parent renderItem
 * callback stays referentially stable and FlatList skips re-renders.
 */
const FeedPostCard = memo(function FeedPostCard({ item, feedPropsRef, isEndorsed, endorseLimitReached }) {
  const p = feedPropsRef.current
  const canMod = p.checkModerateScope(item.location?.id, item.session?.id)
  return (
    <PostCard
      post={item}
      onPress={() => p.handlePostPress(item)}
      onUpvote={p.handleUpvote}
      onDownvote={p.handlePostDownvote}
      onToggleRole={p.handleToggleRole}
      onLock={p.handleLockPost}
      onEdit={p.handleEditPost}
      onDelete={p.handleDeletePostConfirm}
      currentUserId={p.userId}
      canModerate={canMod}
      onReport={p.handleReportPost}
      onModerate={p.handleModeratePost}
      onPin={p.handlePinPost}
      onTermPress={p.onGlossaryTermPress}
      glossaryRules={p.glossaryRules}
      readOnly={p.isReadOnly}
      onEndorse={p.isEndorsementPhase ? p.handleEndorse : undefined}
      isEndorsed={isEndorsed}
      endorseLimitReached={endorseLimitReached}
      onEndorseLimitReached={p.isEndorsementPhase ? p.handleEndorseLimitReached : undefined}
      stage={p.effectiveStage}
    />
  )
}, (prev, next) =>
  prev.item === next.item &&
  prev.isEndorsed === next.isEndorsed &&
  prev.endorseLimitReached === next.endorseLimitReached
)

export default function DiscussFeed() {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const isDesktop = useIsDesktop()
  const styles = useMemo(() => createStyles(colors), [colors])
  const router = useRouter()
  const [glossaryDrawer, onGlossaryTermPress] = useGlossaryDrawer()
  const handleMentionPress = useCallback((username) => {
    const roleKeywords = new Set(['admin', 'moderator', 'facilitator', 'liaison', 'expert'])
    if (roleKeywords.has(username.toLowerCase())) return
    router.push(`/user/${username}`)
  }, [router])
  const glossaryRules = useGlossaryRules(onGlossaryTermPress, { onMentionPress: handleMentionPress })
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { selectedLocation, selectedSession, canCreateProposals, viewingStage, effectiveStage, isReadOnly, votingRound, roundType, openBallotModal, ballotVersion } = useLocationSession()

  // Derive major phase from effective stage for filtering
  const STAGE_TO_PHASE = {
    proposal_issue: 'proposal', proposal_qualify: 'proposal', proposal_stakeholders: 'proposal',
    opinion_discussion: 'opinion', reflection_curation: 'reflection', reflection_proposals: 'reflection',
    consensus: 'consensus',
  }
  const phase = effectiveStage ? STAGE_TO_PHASE[effectiveStage] : null

  // Determine if Q&A should be hidden (during proposal_* stages)
  const isProposalStage = effectiveStage?.startsWith('proposal_')
  const hideQA = !!isProposalStage

  // Default to Proposals tab during proposal stages and reflection_proposals
  const votingRoundStatus = votingRound?.status
  const showProposalsTab = isProposalStage
    || effectiveStage === 'reflection_proposals'
    || canCreateProposals
    || (votingRoundStatus && ['proposals_open', 'finalization_open'].includes(votingRoundStatus))
  const shouldDefaultToProposals = showProposalsTab

  const [postType, setPostType] = useState(shouldDefaultToProposals ? 'proposal' : 'discussion')

  // Reset tab when stage or session changes so we don't stay on a tab that doesn't exist
  useEffect(() => {
    if (shouldDefaultToProposals) {
      setPostType('proposal')
    } else {
      setPostType('discussion')
    }
    // Default to "Final" filter during endorsement phase
    if (votingRoundStatus === 'finalization_open') {
      setProposalStatusFilter('finalized')
    } else {
      setProposalStatusFilter(null)
    }
  }, [effectiveStage, selectedSession, votingRoundStatus])

  // Proposal status filter (visible from finalization_open)
  // Default to "Final" during endorsement phase so users see endorsable proposals
  const [proposalStatusFilter, setProposalStatusFilter] = useState(
    votingRoundStatus === 'finalization_open' ? 'finalized' : null
  )
  const showProposalFilters = postType === 'proposal' && votingRoundStatus && ['finalization_open', 'proposals_closed', 'voting_open', 'voting_closed'].includes(votingRoundStatus)

  const [showRules, setShowRules] = useState(false)
  const isQAAuthority = hasQAAuthority(user)

  const {
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
  } = usePostsFeed(selectedLocation, selectedSession, postType, { phase, effectiveStage })

  // Apply proposal status filter client-side
  const filteredPosts = useMemo(() => {
    if (!proposalStatusFilter) return posts
    return posts.filter(p => p.proposalStatus === proposalStatusFilter)
  }, [posts, proposalStatusFilter])

  // Hide FAB on proposals tab if user already has a proposal (not deleted)
  const hasExistingProposal = useMemo(() => {
    if (postType !== 'proposal' || !user?.id) return false
    return posts.some(p => p.creator?.id === user.id && p.status !== 'deleted')
  }, [posts, postType, user?.id])

  // Refresh feed on focus (e.g. returning from creating a post)
  const hasMountedRef = useRef(false)
  useFocusEffect(useCallback(() => {
    if (hasMountedRef.current) {
      handleRefresh()
    } else {
      hasMountedRef.current = true
    }
  }, [handleRefresh]))

  // Edit/delete state
  const [editingPost, setEditingPost] = useState(null)
  const [editSaving, setEditSaving] = useState(false)

  const handleEditPost = useCallback((post) => {
    setEditingPost(post)
  }, [])

  const handleEditPostSubmit = useCallback(async ({ title, body }) => {
    if (!editingPost) return
    setEditSaving(true)
    try {
      await handleUpdatePost(editingPost.id, { title, body })
      setEditingPost(null)
    } catch {
      // Toast already shown by hook
    } finally {
      setEditSaving(false)
    }
  }, [editingPost, handleUpdatePost])

  // Deferred delete — set target, fire Alert after modal closes
  const [pendingDeletePostId, setPendingDeletePostId] = useState(null)

  const handleDeletePostConfirm = useCallback((postId) => {
    setPendingDeletePostId(postId)
  }, [])

  useEffect(() => {
    if (!pendingDeletePostId) return
    const timer = setTimeout(() => {
      Alert.alert(
        t('deletePostConfirmTitle'),
        t('deletePostConfirmMessage'),
        [
          { text: t('common:cancel'), style: 'cancel', onPress: () => setPendingDeletePostId(null) },
          {
            text: t('common:delete'),
            style: 'destructive',
            onPress: () => {
              setPendingDeletePostId(null)
              handleDeletePost(pendingDeletePostId)
            },
          },
        ]
      )
    }, 300)
    return () => clearTimeout(timer)
  }, [pendingDeletePostId])

  // Downvote reason picker state
  const [downvotePostId, setDownvotePostId] = useState(null)

  // Reset answered filter when switching tabs
  const handleTabChange = useCallback((tab) => {
    setPostType(tab)
    setAnsweredFilter(null)
    setProposalStatusFilter(null)
  }, [setAnsweredFilter])

  const handlePostPress = useCallback((post) => {
    router.push({ pathname: '/discuss/[id]', params: { id: post.id } })
  }, [router])

  const handlePostDownvote = useCallback((postId) => {
    const post = posts.find(p => p.id === postId)
    if (post?.userVote?.voteType === 'downvote') {
      // Already downvoted — toggle off
      handleDownvote(postId, post.userVote.downvoteReason || 'disagree')
    } else {
      // Show reason picker
      setDownvotePostId(postId)
    }
  }, [posts, handleDownvote])

  const handleDownvoteReasonSelect = useCallback((reason) => {
    if (downvotePostId) {
      handleDownvote(downvotePostId, reason)
      setDownvotePostId(null)
    }
  }, [downvotePostId, handleDownvote])

  // Report / moderate state
  const checkModerateScope = useModerateChecker()
  const [reportPostId, setReportPostId] = useState(null)
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [moderateTarget, setModerateTarget] = useState(null)
  const [moderateRule, setModerateRule] = useState(null)
  const [moderateComment, setModerateComment] = useState(null)
  const [actionModalVisible, setActionModalVisible] = useState(false)

  const handleReportPost = useCallback((postId) => {
    setReportPostId(postId)
    setReportModalVisible(true)
  }, [])

  const handleReportSubmit = useCallback(async (ruleId, comment) => {
    await api.moderation.reportPost(reportPostId, ruleId, comment)
  }, [reportPostId])

  const handleModeratePost = useCallback((postId) => {
    setModerateTarget({ type: 'post', id: postId })
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
      await api.moderation.createAction({
        targetType: moderateTarget.type,
        targetId: moderateTarget.id,
        ruleId: moderateRule.id,
        comment: moderateComment,
        ...actionData,
      })
      setActionModalVisible(false)
      Alert.alert(t('moderationSuccess'))
      handleRefresh()
    } catch (err) {
      if (err?.status === 403) {
        Alert.alert(t('moderationForbidden'))
      } else {
        console.error('Inline moderation failed:', err)
      }
      throw err
    }
  }, [moderateTarget, moderateRule, moderateComment, t, handleRefresh])

  // ── Endorsements ──
  const [endorsementData, setEndorsementData] = useState(null)
  const isEndorsementPhase = votingRoundStatus === 'finalization_open'
  // Show endorsement counts (read-only) for archived stages with voting round data
  const showArchivedEndorsements = isReadOnly && votingRound && postType === 'proposal'

  // Fetch endorsements when in endorsement phase or viewing archived stage with voting data
  useEffect(() => {
    if (!selectedSession || (!isEndorsementPhase && !showArchivedEndorsements)) {
      setEndorsementData(null)
      return
    }
    sessionsApiWrapper.getEndorsements(selectedSession, { roundType })
      .then(setEndorsementData)
      .catch(() => setEndorsementData(null))
  }, [selectedSession, isEndorsementPhase, showArchivedEndorsements, roundType])

  const myEndorsementMap = useMemo(() => {
    if (!endorsementData?.myEndorsements) return {}
    const map = {}
    for (const e of endorsementData.myEndorsements) {
      map[e.proposalPostId] = e.id
    }
    return map
  }, [endorsementData?.myEndorsements])

  const endorsementCountMap = useMemo(() => {
    if (!endorsementData?.proposalCounts) return {}
    const map = {}
    for (const c of endorsementData.proposalCounts) {
      map[c.proposalPostId] = c.count
    }
    return map
  }, [endorsementData?.proposalCounts])

  const myEndorsementCount = endorsementData?.myEndorsements?.length || 0
  const endorseLimitReached = myEndorsementCount >= 3

  // Manage modal state
  const [manageModalVisible, setManageModalVisible] = useState(false)
  const [pendingEndorsePostId, setPendingEndorsePostId] = useState(null)

  // Build list of endorsed posts with titles for manage modal
  const endorsedPosts = useMemo(() => {
    if (!endorsementData?.myEndorsements || !posts) return []
    const postMap = {}
    for (const p of posts) postMap[p.id] = p
    return endorsementData.myEndorsements.map(e => ({
      id: e.proposalPostId,
      title: postMap[e.proposalPostId]?.title || e.proposalPostId,
    }))
  }, [endorsementData?.myEndorsements, posts])

  // Refs for reading latest endorsement state inside async handleEndorse
  // without adding them to useCallback deps (which would cause stale closures
  // mid-flight when the optimistic setEndorsementData triggers a re-render).
  const endorsementDataRef = useRef(endorsementData)
  endorsementDataRef.current = endorsementData
  const myEndorsementMapRef = useRef(myEndorsementMap)
  myEndorsementMapRef.current = myEndorsementMap

  const endorseInFlightRef = useRef(false)
  const handleEndorse = useCallback(async (postId, currentlyEndorsed) => {
    if (endorseInFlightRef.current) return
    endorseInFlightRef.current = true

    // Snapshot for rollback (read from ref for latest state)
    const prevData = endorsementDataRef.current

    // Optimistic update
    setEndorsementData(prev => {
      if (!prev) return prev
      if (currentlyEndorsed) {
        return {
          ...prev,
          myEndorsements: (prev.myEndorsements || []).filter(e => e.proposalPostId !== postId),
          proposalCounts: (prev.proposalCounts || []).map(c =>
            c.proposalPostId === postId ? { ...c, count: Math.max(0, c.count - 1) } : c
          ),
        }
      }
      const tempId = `temp-${postId}`
      return {
        ...prev,
        myEndorsements: [...(prev.myEndorsements || []), { id: tempId, proposalPostId: postId }],
        proposalCounts: (prev.proposalCounts || []).some(c => c.proposalPostId === postId)
          ? prev.proposalCounts.map(c =>
              c.proposalPostId === postId ? { ...c, count: c.count + 1 } : c
            )
          : [...(prev.proposalCounts || []), { proposalPostId: postId, count: 1 }],
      }
    })

    try {
      if (currentlyEndorsed) {
        // Read endorsement ID from ref (guaranteed latest after server sync)
        const endorsementId = myEndorsementMapRef.current[postId]
        if (endorsementId) {
          await sessionsApiWrapper.deleteEndorsement(selectedSession, endorsementId)
        }
      } else {
        await sessionsApiWrapper.createEndorsement(selectedSession, postId)
      }
      // Sync with server
      const data = await sessionsApiWrapper.getEndorsements(selectedSession, { roundType })
      setEndorsementData(data)

      // Auto-endorse pending post after un-endorsing brings count to 2
      if (currentlyEndorsed && pendingEndorsePostId && (data?.myEndorsements?.length || 0) < 3) {
        setPendingEndorsePostId(null)
        try {
          await sessionsApiWrapper.createEndorsement(selectedSession, pendingEndorsePostId)
          const refreshed = await sessionsApiWrapper.getEndorsements(selectedSession, { roundType })
          setEndorsementData(refreshed)
        } catch {
          Alert.alert(t('endorseFailed'))
        }
        setManageModalVisible(false)
      }
    } catch (err) {
      // Rollback on failure
      setEndorsementData(prevData)
      Alert.alert(t('endorseFailed'))
    } finally {
      endorseInFlightRef.current = false
    }
  }, [selectedSession, roundType, t, pendingEndorsePostId])

  const handleEndorseLimitReached = useCallback((postId) => {
    setPendingEndorsePostId(postId)
    setManageModalVisible(true)
  }, [])

  // ── Ballot & Results ──
  const [ballotData, setBallotData] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [electionResults, setElectionResults] = useState(null)

  const isVotingPhase = votingRoundStatus === 'voting_open'
  const isResultsPhase = votingRoundStatus === 'voting_closed'

  useEffect(() => {
    if (!selectedSession) return
    if (isVotingPhase) {
      sessionsApiWrapper.getCandidates(selectedSession, { roundType }).then(setCandidates).catch(() => setCandidates([]))
      if (!isReadOnly) {
        sessionsApiWrapper.getBallot(selectedSession, { roundType }).then(setBallotData).catch(() => setBallotData(null))
      }
    } else if (isResultsPhase) {
      sessionsApiWrapper.getResults(selectedSession, { roundType }).then(setElectionResults).catch(() => setElectionResults(null))
      sessionsApiWrapper.getCandidates(selectedSession, { roundType }).then(setCandidates).catch(() => setCandidates([]))
    }
  }, [selectedSession, isVotingPhase, isResultsPhase, roundType, isReadOnly, ballotVersion])

  // Stable ref for all volatile feed-card props so renderPostCard stays referentially
  // stable and FlatList doesn't re-render every card when a callback identity changes.
  const feedPropsRef = useRef(null)
  feedPropsRef.current = {
    handlePostPress, handleUpvote, handlePostDownvote: handlePostDownvote, handleToggleRole,
    handleLockPost, handleEditPost, handleDeletePostConfirm, userId: user?.id,
    checkModerateScope, handleReportPost, handleModeratePost, handlePinPost,
    onGlossaryTermPress, glossaryRules, isReadOnly, votingRoundStatus,
    isEndorsementPhase, handleEndorse,
    handleEndorseLimitReached, effectiveStage,
  }

  const renderPostCard = useCallback(({ item }) => (
    <FeedPostCard
      item={item}
      feedPropsRef={feedPropsRef}
      isEndorsed={!!myEndorsementMap[item.id]}
      endorseLimitReached={endorseLimitReached}
    />
  ), [myEndorsementMap, endorseLimitReached])

  const keyExtractor = useCallback((item) => item.id, [])

  const renderEmpty = useCallback(() => {
    if (loading) return null
    if (error) {
      return (
        <EmptyState
          icon="alert-circle-outline"
          title={t('errorLoadPosts')}
          subtitle={error.message}
        />
      )
    }
    const isQA = postType === 'question'
    return (
      <EmptyState
        icon={isQA ? 'help-circle-outline' : 'chatbubbles-outline'}
        title={isQA ? t('emptyQATitle') : t('emptyFeedTitle')}
        subtitle={isQA ? t('emptyQASubtitle') : t('emptyFeedSubtitle')}
      />
    )
  }, [loading, error, postType, t])

  const renderFooter = useCallback(() => {
    return (
      <View style={styles.footer}>
        {loadingMore && <ActivityIndicator size="small" color={colors.primary} />}
      </View>
    )
  }, [loadingMore, colors.primary, styles.footer])

  // Q&A answered filter options
  const answerFilterOptions = postType === 'question' ? [
    { id: null, label: t('filterAll') },
    { id: 'true', label: t('filterAnswered') },
    { id: 'false', label: t('filterUnanswered') },
  ] : null

  return (
    <View style={[styles.container, !isDesktop && { paddingTop: insets.top }]}>
      <Header />

      {/* Sticky endorsement bar */}
      {isEndorsementPhase && !isReadOnly && postType === 'proposal' && (
        <TouchableOpacity
          style={styles.endorseBanner}
          onPress={() => { setPendingEndorsePostId(null); setManageModalVisible(true) }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('endorsementBarA11y', { count: myEndorsementCount, max: 3 })}
        >
          <Ionicons name="heart" size={16} color={colors.primary} />
          <ThemedText variant="caption" style={{ color: colors.primary, fontWeight: '600' }}>
            {t('endorsementBarLabel', { count: myEndorsementCount, max: 3 })}
          </ThemedText>
        </TouchableOpacity>
      )}

      <FlatList
        data={filteredPosts}
        renderItem={renderPostCard}
        keyExtractor={keyExtractor}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        removeClippedSubviews
        maxToRenderPerBatch={8}
        windowSize={7}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        ListHeaderComponent={
          <>
            <SessionInfoCard />
            {isDesktop && (
              <View style={styles.sectionHeader}>
                <ThemedText variant="h1" color="primary">{t('tabDiscuss')}</ThemedText>
                <ThemedText variant="bodySmall" color="secondary" style={styles.subtitle}>{t('feedSubtitle')}</ThemedText>
              </View>
            )}
            {/* Tab bar + sort dropdown row */}
            <View style={styles.controlsRow}>
              <FeedTabBar activeTab={postType} onTabChange={handleTabChange} showProposals={showProposalsTab} hideQA={hideQA} />
              <SortDropdown sort={sort} onSortChange={setSort} />
            </View>

            {/* Proposal filters + rules on one line; otherwise rules standalone */}
            {showProposalFilters ? (
              <View style={styles.filterRulesRow}>
                <View style={styles.filterChips}>
                  {[
                    { id: null, label: t('filterAll') },
                    { id: 'draft', label: t('proposalDraft') },
                    { id: 'finalized', label: t('proposalFinal') },
                  ].map((option) => {
                    const isActive = proposalStatusFilter === option.id
                    return (
                      <TouchableOpacity
                        key={String(option.id)}
                        style={[styles.filterButton, isActive && styles.filterButtonActive]}
                        onPress={() => setProposalStatusFilter(option.id)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        accessibilityLabel={t('filterA11y', { filter: option.label })}
                      >
                        <ThemedText
                          variant="caption"
                          style={[styles.filterButtonText, isActive && styles.filterButtonTextActive]}
                        >
                          {option.label}
                        </ThemedText>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                <TouchableOpacity
                  style={styles.rulesLinkInline}
                  onPress={() => setShowRules(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('viewRulesA11y', { tab: t('tabProposals') })}
                >
                  <Ionicons name="book-outline" size={16} color={colors.primary} />
                  <ThemedText variant="caption" style={{ color: colors.primary }}>
                    {t('viewRules', { tab: t('tabProposals') })}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.rulesLink}
                onPress={() => setShowRules(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('viewRulesA11y', { tab: t(postType === 'question' ? 'tabQA' : postType === 'proposal' ? 'tabProposals' : 'tabDiscussion') })}
              >
                <Ionicons name="book-outline" size={16} color={colors.primary} />
                <ThemedText variant="caption" style={{ color: colors.primary }}>
                  {t('viewRules', { tab: t(postType === 'question' ? 'tabQA' : postType === 'proposal' ? 'tabProposals' : 'tabDiscussion') })}
                </ThemedText>
              </TouchableOpacity>
            )}

            {/* Q&A filter row */}
            {answerFilterOptions && (
              <View style={styles.filterRow}>
                {answerFilterOptions.map((option) => {
                  const isActive = answeredFilter === option.id
                  return (
                    <TouchableOpacity
                      key={String(option.id)}
                      style={[styles.filterButton, isActive && styles.filterButtonActive]}
                      onPress={() => setAnsweredFilter(option.id)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={t('filterA11y', { filter: option.label })}
                    >
                      <ThemedText
                        variant="caption"
                        style={[styles.filterButtonText, isActive && styles.filterButtonTextActive]}
                      >
                        {option.label}
                      </ThemedText>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}

            {/* Read-only ballot summary with edit button when user has submitted */}
            {isVotingPhase && !isReadOnly && postType === 'proposal' && ballotData?.rankings?.length > 0 && (
              <BallotCard
                key={ballotVersion}
                candidates={candidates}
                existingRankings={ballotData.rankings}
                readOnly
                onEdit={openBallotModal}
              />
            )}

            {/* Election results when voting_closed */}
            {isResultsPhase && postType === 'proposal' && electionResults && (
              <ElectionResults results={electionResults} />
            )}

            {/* Skeleton loading for initial load */}
            {loading && !refreshing && (
              <FeedSkeleton styles={styles} />
            )}
          </>
        }
        contentContainerStyle={posts.length === 0 && !loading ? styles.emptyContainer : styles.listContent}
      />

      {/* Floating action button (hidden in read-only stages or if user already has a proposal) */}
      {!isReadOnly && !hasExistingProposal && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push({ pathname: '/discuss/create', params: { type: postType } })}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('fabA11y')}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Downvote reason picker */}
      <DownvoteReasonPicker
        visible={downvotePostId != null}
        onClose={() => setDownvotePostId(null)}
        onSelect={handleDownvoteReasonSelect}
      />

      {/* Report modal (non-moderator report flow, or first step of moderation flow) */}
      <ReportModal
        visible={reportModalVisible}
        onClose={() => { setReportModalVisible(false); setReportPostId(null) }}
        onSubmit={moderateTarget ? handleModerateRuleSelected : handleReportSubmit}
        contentType="post"
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

      <GlossaryDrawer {...glossaryDrawer} />

      {/* Endorsement manage modal */}
      <EndorsementManageModal
        visible={manageModalVisible}
        onClose={() => { setManageModalVisible(false); setPendingEndorsePostId(null) }}
        endorsedPosts={endorsedPosts}
        onRemove={(postId) => handleEndorse(postId, true)}
        pendingPostTitle={pendingEndorsePostId ? posts.find(p => p.id === pendingEndorsePostId)?.title : null}
        onPostPress={(postId) => { setManageModalVisible(false); setPendingEndorsePostId(null); handlePostPress({ id: postId }) }}
      />

      {/* Edit post modal */}
      <EditPostModal
        visible={editingPost != null}
        post={editingPost}
        onSubmit={handleEditPostSubmit}
        onClose={() => setEditingPost(null)}
        saving={editSaving}
      />

      {/* Community rules modal */}
      <CommunityRulesModal
        visible={showRules}
        onClose={() => setShowRules(false)}
        contentType="post"
        locationId={selectedLocation}
        sessionId={selectedSession}
        postType={postType}
      />
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  subtitle: {
    marginTop: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  rulesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  filterRulesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  filterChips: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  rulesLinkInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  endorseBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  filterButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 12,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  filterButtonActive: {
    backgroundColor: colors.buttonSelected,
    borderColor: colors.buttonSelected,
  },
  filterButtonText: {
    color: colors.secondaryText,
  },
  filterButtonTextActive: {
    color: colors.buttonSelectedText,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: Spacing.xxl,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  skeletonCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  skeletonTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skeletonBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  footer: {
    paddingTop: Spacing.lg,
    paddingBottom: 80,
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.fabBg,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
})
