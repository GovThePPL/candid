import { View, Modal, ScrollView, TouchableOpacity, StyleSheet, Platform, BackHandler, ActivityIndicator } from 'react-native'
import { memo, useMemo, useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '../../hooks/useThemeColors'
import { useLocationSession } from '../../contexts/LocationSessionContext'
import { sessionsApiWrapper } from '../../lib/api'
import ThemedText from '../ThemedText'
import InfoModal from '../InfoModal'
import ProposalPreviewModal from './ProposalPreviewModal'
import { Spacing, BorderRadius, Typography } from '../../constants/Theme'
import { BrandColor, OnBrandColors, SemanticColors } from '../../constants/Colors'

/** Fisher-Yates shuffle (in-place). */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Full-screen ballot modal for ranked-choice voting.
 *
 * Auto-opens when entering a `voting_open` stage (controlled by LocationSessionContext).
 * Blocks interaction until ballot is submitted (no close button in mandatory mode).
 */
export default memo(function BallotModal() {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets])

  const {
    ballotModalVisible,
    closeBallotModal,
    selectedSession,
    roundType,
    openSessionSelector,
    isReadOnly,
    bumpBallotVersion,
  } = useLocationSession()

  const [candidates, setCandidates] = useState([])
  const [shuffledOrder, setShuffledOrder] = useState([])
  const [rankings, setRankings] = useState({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [previewPostId, setPreviewPostId] = useState(null)
  const [existingBallotLoaded, setExistingBallotLoaded] = useState(false)
  const [infoModal, setInfoModal] = useState(null) // { icon, iconColor, title, message }
  const fetchIdRef = useRef(0)

  // Fetch candidates + existing ballot when modal opens
  useEffect(() => {
    if (!ballotModalVisible || !selectedSession) {
      setCandidates([])
      setShuffledOrder([])
      setRankings({})
      setLoading(true)
      setExistingBallotLoaded(false)
      return
    }

    const id = ++fetchIdRef.current
    setLoading(true)
    const rt = roundType || undefined

    Promise.all([
      sessionsApiWrapper.getCandidates(selectedSession, { roundType: rt }).catch(() => []),
      isReadOnly ? Promise.resolve(null) : sessionsApiWrapper.getBallot(selectedSession, { roundType: rt }).catch(() => null),
    ]).then(([candidatesData, ballotData]) => {
      if (fetchIdRef.current !== id) return
      const list = candidatesData || []
      setCandidates(list)
      setShuffledOrder(shuffle([...list]))

      if (ballotData?.rankings?.length) {
        const map = {}
        for (const r of ballotData.rankings) {
          map[r.proposalPostId] = r.rank
        }
        setRankings(map)
        setExistingBallotLoaded(true)
      } else {
        setRankings({})
        setExistingBallotLoaded(false)
      }
      setLoading(false)
    })
  }, [ballotModalVisible, selectedSession, roundType, isReadOnly])

  const isUpdate = existingBallotLoaded

  // Android back handler — block in mandatory mode
  useEffect(() => {
    if (!ballotModalVisible) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isUpdate) {
        closeBallotModal()
      }
      return true // always consume to block back in mandatory mode
    })
    return () => sub.remove()
  }, [ballotModalVisible, isUpdate, closeBallotModal])

  // Derived lists
  const rankedList = useMemo(() => {
    return candidates
      .filter(c => rankings[c.proposalPostId] != null)
      .sort((a, b) => rankings[a.proposalPostId] - rankings[b.proposalPostId])
  }, [candidates, rankings])

  const unrankedList = useMemo(() => {
    return shuffledOrder.filter(c => rankings[c.proposalPostId] == null)
  }, [shuffledOrder, rankings])

  // Ranking handlers
  const handleRank = useCallback((proposalPostId) => {
    setRankings(prev => {
      const nextRank = Object.keys(prev).length + 1
      return { ...prev, [proposalPostId]: nextRank }
    })
  }, [])

  const handleUnrank = useCallback((proposalPostId) => {
    setRankings(prev => {
      const removedRank = prev[proposalPostId]
      if (removedRank == null) return prev
      const next = {}
      for (const [pid, rank] of Object.entries(prev)) {
        if (pid === proposalPostId) continue
        next[pid] = rank > removedRank ? rank - 1 : rank
      }
      return next
    })
  }, [])

  const handleMoveUp = useCallback((proposalPostId) => {
    setRankings(prev => {
      const rank = prev[proposalPostId]
      if (rank == null || rank <= 1) return prev
      const swapPid = Object.entries(prev).find(([, r]) => r === rank - 1)?.[0]
      if (!swapPid) return prev
      return { ...prev, [proposalPostId]: rank - 1, [swapPid]: rank }
    })
  }, [])

  const handleMoveDown = useCallback((proposalPostId) => {
    setRankings(prev => {
      const rank = prev[proposalPostId]
      const maxRank = Object.keys(prev).length
      if (rank == null || rank >= maxRank) return prev
      const swapPid = Object.entries(prev).find(([, r]) => r === rank + 1)?.[0]
      if (!swapPid) return prev
      return { ...prev, [proposalPostId]: rank + 1, [swapPid]: rank }
    })
  }, [])

  const handleClearAll = useCallback(() => {
    setRankings({})
  }, [])

  const nudgeShownRef = useRef(false)

  const doSubmit = useCallback(async () => {
    const rankingsList = Object.entries(rankings)
      .map(([proposalPostId, rank]) => ({ proposalPostId, rank }))
      .sort((a, b) => a.rank - b.rank)

    setSubmitting(true)
    try {
      await sessionsApiWrapper.submitBallot(selectedSession, rankingsList)
      bumpBallotVersion()
      nudgeShownRef.current = false
      setInfoModal({
        icon: 'checkmark-circle',
        iconColor: SemanticColors.success,
        title: t('ballotSubmitted'),
        closeAfter: true,
      })
    } catch {
      setInfoModal({
        icon: 'close-circle',
        iconColor: SemanticColors.disagree,
        title: t('ballotSubmitFailed'),
      })
    } finally {
      setSubmitting(false)
    }
  }, [rankings, selectedSession, bumpBallotVersion, t])

  const handleSubmit = useCallback(() => {
    const count = Object.keys(rankings).length
    const minRequired = Math.min(3, candidates.length)

    // Hard block: must rank at least 3 (or all candidates if fewer than 3)
    if (count < minRequired) {
      setInfoModal({
        icon: 'alert-circle',
        iconColor: SemanticColors.warning,
        title: t('ballotMinRankingsTitle'),
        message: t('ballotMinRankingsMessage', { min: minRequired }),
      })
      return
    }

    // Soft nudge: encourage ranking all candidates (shown once per session)
    if (count < candidates.length && !nudgeShownRef.current) {
      nudgeShownRef.current = true
      setInfoModal({
        icon: 'information-circle',
        iconColor: SemanticColors.info,
        title: t('ballotNudgeTitle'),
        message: t('ballotNudgeMessage', { count, total: candidates.length }),
        nudge: true,
      })
      return
    }

    doSubmit()
  }, [rankings, candidates, doSubmit, t])

  const handleInfoClose = useCallback(() => {
    const shouldClose = infoModal?.closeAfter
    setInfoModal(null)
    if (shouldClose) closeBallotModal()
  }, [infoModal, closeBallotModal])

  // "Submit anyway" from nudge modal
  const handleNudgeSubmit = useCallback(() => {
    setInfoModal(null)
    doSubmit()
  }, [doSubmit])

  const handleSessionSwitch = useCallback(() => {
    closeBallotModal()
    openSessionSelector()
  }, [closeBallotModal, openSessionSelector])

  const rankedCount = Object.keys(rankings).length
  const maxRank = rankedCount

  return (
    <Modal
      visible={ballotModalVisible}
      transparent
      animationType="slide"
      onRequestClose={isUpdate ? closeBallotModal : undefined}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleSessionSwitch}
              style={styles.logoButton}
              accessibilityRole="button"
              accessibilityLabel={t('ballotSessionSwitchA11y')}
            >
              <ThemedText variant="h3" style={styles.logoText}>Candid</ThemedText>
            </TouchableOpacity>

            <ThemedText variant="h3" style={styles.headerTitle} numberOfLines={1}>
              {t('ballotModalTitle')}
            </ThemedText>

            {isUpdate ? (
              <TouchableOpacity
                onPress={closeBallotModal}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel={t('acceptedProposalCloseA11y')}
              >
                <Ionicons name="close" size={24} color={colors.secondaryText} />
              </TouchableOpacity>
            ) : (
              <View style={styles.closeButton} />
            )}
          </View>

          {loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : candidates.length === 0 ? (
            <View style={styles.loaderContainer}>
              <ThemedText variant="body" color="secondary">{t('ballotNoCandidates')}</ThemedText>
              {isUpdate && (
                <TouchableOpacity onPress={closeBallotModal} style={styles.emptyCloseBtn} accessibilityRole="button" accessibilityLabel={t('acceptedProposalCloseA11y')}>
                  <Ionicons name="close" size={20} color={colors.secondaryText} />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Instruction */}
              <ThemedText variant="bodySmall" color="secondary" style={styles.instruction}>
                {t('ballotModalInstruction')}
              </ThemedText>

              {/* Ranked section */}
              <ThemedText variant="h4" style={styles.sectionTitle}>
                {t('ballotRankedSection')}
              </ThemedText>

              {rankedList.length === 0 ? (
                <ThemedText variant="bodySmall" color="secondary" style={styles.emptyHint}>
                  {t('ballotRankedEmpty')}
                </ThemedText>
              ) : (
                rankedList.map((candidate) => {
                  const rank = rankings[candidate.proposalPostId]
                  return (
                    <View key={candidate.proposalPostId} style={styles.rankedRow}>
                      <TouchableOpacity
                        onPress={() => handleUnrank(candidate.proposalPostId)}
                        style={styles.rankBadge}
                        accessibilityRole="button"
                        accessibilityLabel={t('ballotRemoveA11y', { title: candidate.title })}
                      >
                        <ThemedText variant="caption" style={styles.rankText}>{rank}</ThemedText>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.candidateTitleWrap}
                        onPress={() => setPreviewPostId(candidate.proposalPostId)}
                        accessibilityRole="button"
                        accessibilityLabel={t('ballotViewProposalA11y', { title: candidate.title })}
                      >
                        <ThemedText variant="body" numberOfLines={2} style={styles.rankedTitle}>
                          {candidate.title}
                        </ThemedText>
                      </TouchableOpacity>

                      <View style={styles.arrowButtons}>
                        <TouchableOpacity
                          onPress={() => handleMoveUp(candidate.proposalPostId)}
                          disabled={rank <= 1}
                          style={[styles.arrowButton, rank <= 1 && styles.arrowDisabled]}
                          accessibilityRole="button"
                          accessibilityLabel={t('ballotMoveUpA11y', { title: candidate.title })}
                        >
                          <Ionicons name="chevron-up" size={20} color={rank <= 1 ? colors.disabled : colors.text} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleMoveDown(candidate.proposalPostId)}
                          disabled={rank >= maxRank}
                          style={[styles.arrowButton, rank >= maxRank && styles.arrowDisabled]}
                          accessibilityRole="button"
                          accessibilityLabel={t('ballotMoveDownA11y', { title: candidate.title })}
                        >
                          <Ionicons name="chevron-down" size={20} color={rank >= maxRank ? colors.disabled : colors.text} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )
                })
              )}

              {/* Actions row */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={handleClearAll}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('clearRankingA11y')}
                >
                  <ThemedText variant="caption" color="secondary">{t('clearRanking')}</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.submitButton, (submitting || rankedCount === 0) && styles.submitButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={submitting || rankedCount === 0}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={isUpdate ? t('updateBallotA11y') : t('submitBallotA11y')}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={OnBrandColors.text} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color={OnBrandColors.text} />
                      <ThemedText variant="buttonSmall" style={styles.submitText}>
                        {isUpdate ? t('updateBallot') : t('submitBallot')}
                      </ThemedText>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Unranked section */}
              <ThemedText variant="h4" style={styles.sectionTitle}>
                {t('ballotUnrankedSection')}
              </ThemedText>

              {unrankedList.map((candidate) => (
                <TouchableOpacity
                  key={candidate.proposalPostId}
                  style={styles.unrankedRow}
                  onPress={() => handleRank(candidate.proposalPostId)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('ballotAddA11y', { title: candidate.title })}
                >
                  <View style={styles.addBadge}>
                    <Ionicons name="add" size={16} color={colors.secondaryText} />
                  </View>
                  <TouchableOpacity
                    style={styles.candidateTitleWrap}
                    onPress={() => setPreviewPostId(candidate.proposalPostId)}
                    accessibilityRole="button"
                    accessibilityLabel={t('ballotViewProposalA11y', { title: candidate.title })}
                  >
                    <ThemedText variant="body" numberOfLines={2}>
                      {candidate.title}
                    </ThemedText>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>

      {/* Stacked proposal preview modal */}
      <ProposalPreviewModal
        postId={previewPostId}
        onClose={() => setPreviewPostId(null)}
      />

      {/* Info modal for success/error/empty/nudge feedback */}
      {infoModal?.nudge ? (
        <InfoModal
          visible
          onClose={handleInfoClose}
          icon={infoModal.icon}
          iconColor={infoModal.iconColor}
          title={infoModal.title}
          paragraphs={[infoModal.message]}
          buttonText={t('ballotNudgeGoBack')}
          footer={
            <TouchableOpacity
              style={styles.nudgeSubmitAnywayLink}
              onPress={handleNudgeSubmit}
              accessibilityRole="button"
              accessibilityLabel={t('ballotNudgeSubmitAnywayA11y')}
            >
              <ThemedText variant="bodySmall" color="secondary" style={{ fontWeight: '600' }}>
                {t('ballotNudgeSubmitAnyway')}
              </ThemedText>
            </TouchableOpacity>
          }
        />
      ) : (
        <InfoModal
          visible={!!infoModal}
          onClose={handleInfoClose}
          icon={infoModal?.icon}
          iconColor={infoModal?.iconColor}
          title={infoModal?.title || ''}
          paragraphs={infoModal?.message ? [infoModal.message] : undefined}
        />
      )}
    </Modal>
  )
})

const createStyles = (colors, insets) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    ...Platform.select({
      web: {
        maxWidth: 600,
        alignSelf: 'center',
        width: '100%',
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === 'web' ? Spacing.lg : insets.top + Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  logoButton: {
    padding: Spacing.sm,
    marginRight: Spacing.sm,
  },
  logoText: {
    color: BrandColor,
    fontWeight: '700',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    padding: Spacing.sm,
    marginLeft: Spacing.sm,
    width: 40,
    alignItems: 'center',
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  emptyCloseBtn: {
    padding: Spacing.sm,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + insets.bottom,
  },
  instruction: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  emptyHint: {
    marginBottom: Spacing.md,
    fontStyle: 'italic',
  },
  rankedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
    backgroundColor: colors.primary + '10',
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: BrandColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    ...Typography.caption,
    color: OnBrandColors.text,
    fontWeight: '700',
  },
  candidateTitleWrap: {
    flex: 1,
  },
  rankedTitle: {
    fontWeight: '600',
  },
  arrowButtons: {
    flexDirection: 'column',
    gap: 2,
  },
  arrowButton: {
    padding: 2,
  },
  arrowDisabled: {
    opacity: 0.3,
  },
  unrankedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  addBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  clearButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: BrandColor,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: OnBrandColors.text,
  },
  nudgeSubmitAnywayLink: {
    paddingVertical: Spacing.sm,
    alignSelf: 'center',
  },
})
