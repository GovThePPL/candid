import { View, Modal, TouchableOpacity, ScrollView, StyleSheet, Platform, BackHandler } from 'react-native'
import { memo, useMemo, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '../hooks/useThemeColors'
import { useLocationSession } from '../contexts/LocationSessionContext'
import LocationSessionBadge from './LocationSessionBadge'
import ThemedText from './ThemedText'
import { PHASES_BY_METHOD, STAGE_INDEX } from '../constants/Sessions'
import { SemanticColors, OnBrandColors } from '../constants/Colors'
import { Spacing } from '../constants/Theme'

const STAGE_NAME_I18N_KEYS = {
  proposal_issue: 'stageProposalIssue',
  proposal_qualify: 'stageProposalQualify',
  proposal_stakeholders: 'stageProposalStakeholders',
  opinion_discussion: 'stageOpinionDiscussion',
  reflection_curation: 'stageReflectionCuration',
  reflection_proposals: 'stageReflectionProposals',
  consensus: 'stageConsensus',
}

const STAGE_ACTION_I18N_KEYS = {
  proposal_issue: 'stageActionProposalIssue',
  proposal_qualify: 'stageActionProposalQualify',
  proposal_stakeholders: 'stageActionProposalStakeholders',
  opinion_discussion: 'stageActionOpinionDiscussion',
  reflection_curation: 'stageActionReflectionCuration',
  reflection_proposals: 'stageActionReflectionProposals',
  consensus: 'stageActionConsensus',
}

/** Return method-specific i18n key overrides for stage name and action. */
function getMethodStageKeys(stage, proposalMethod) {
  if (proposalMethod === 'admin_provided' && stage === 'proposal_qualify') {
    return { nameKey: 'stageProposalQualifyAdmin', actionKey: STAGE_ACTION_I18N_KEYS[stage] }
  }
  return { nameKey: STAGE_NAME_I18N_KEYS[stage], actionKey: STAGE_ACTION_I18N_KEYS[stage] }
}

const PHASE_NAME_I18N_KEYS = {
  proposal: 'phaseProposal',
  opinion: 'phaseOpinion',
  reflection: 'phaseReflection',
  consensus: 'phaseConsensus',
}

// Substages where voting round indicator should appear
const VOTING_INDICATOR_STAGES = {
  proposal_qualify: 'issue_selection',
  reflection_proposals: 'policy_selection',
}

const VR_STATUS_LABELS_KEYS = {
  proposals_open: 'vrProposalsOpen',
  finalization_open: 'vrFinalizationOpen',
  proposals_closed: 'vrProposalsClosed',
  voting_open: 'vrVotingOpen',
  voting_closed: 'vrVotingClosed',
}

const VR_STATUS_ORDER = ['proposals_open', 'finalization_open', 'proposals_closed', 'voting_open', 'voting_closed']
const VR_STATUS_ORDER_ADMIN = ['voting_open', 'voting_closed']
const VR_STATUS_INDEX = Object.fromEntries(VR_STATUS_ORDER.map((s, i) => [s, i]))
const VR_STATUS_INDEX_ADMIN = Object.fromEntries(VR_STATUS_ORDER_ADMIN.map((s, i) => [s, i]))

function getPhaseStatus(phase, currentStage) {
  const currentIdx = STAGE_INDEX[currentStage]
  if (currentIdx === undefined) return 'upcoming'
  if (phase.stages.includes(currentStage)) return 'current'
  const lastStageIdx = STAGE_INDEX[phase.stages[phase.stages.length - 1]]
  if (lastStageIdx < currentIdx) return 'completed'
  return 'upcoming'
}

function getStageStatus(stage, currentStage) {
  const stageIdx = STAGE_INDEX[stage]
  const currentIdx = STAGE_INDEX[currentStage]
  if (stageIdx < currentIdx) return 'completed'
  if (stageIdx === currentIdx) return 'current'
  return 'upcoming'
}

/**
 * Full-screen modal showing session overview with phase-grouped timeline.
 * Reads visibility from LocationSessionContext.
 */
export default memo(function SessionOverviewModal() {
  const { t } = useTranslation('common')
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets])
  const {
    sessionData,
    currentStage,
    viewingStage,
    sessionOverviewVisible,
    closeSessionOverview,
    setViewingStage,
    acceptedProposal,
    openProposalModal,
    votingRound,
    openSessionSelector,
    refreshSessionData,
  } = useLocationSession()

  const proposalMethod = sessionData?.proposalMethod || 'user_driven'
  const phases = useMemo(
    () => PHASES_BY_METHOD[proposalMethod] || PHASES_BY_METHOD.user_driven,
    [proposalMethod]
  )

  // Handle Android back button
  useEffect(() => {
    if (!sessionOverviewVisible) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSessionOverview()
      return true
    })
    return () => sub.remove()
  }, [sessionOverviewVisible, closeSessionOverview])

  // Silently refresh session data when modal opens
  useEffect(() => {
    if (sessionOverviewVisible) {
      refreshSessionData({ silent: true })
    }
  }, [sessionOverviewVisible, refreshSessionData])

  const handlePhaseTap = useCallback((phaseObj) => {
    setViewingStage(phaseObj.stages[0])
    closeSessionOverview()
  }, [setViewingStage, closeSessionOverview])

  const handleViewProposal = useCallback(() => {
    openProposalModal()
  }, [openProposalModal])

  const handleSwitchSession = useCallback(() => {
    closeSessionOverview()
    openSessionSelector()
  }, [closeSessionOverview, openSessionSelector])

  const handleReturnToCurrent = useCallback(() => {
    setViewingStage(null)
    closeSessionOverview()
  }, [setViewingStage, closeSessionOverview])

  if (!sessionData) return null

  const location = sessionData.locationCode
    ? { code: sessionData.locationCode, name: sessionData.locationName }
    : null
  const session = sessionData.label ? { label: sessionData.label } : null

  return (
    <Modal
      visible={sessionOverviewVisible}
      transparent
      animationType="slide"
      onRequestClose={closeSessionOverview}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <ThemedText variant="h3" style={styles.headerTitle} numberOfLines={1}>
              {t('sessionOverviewTitle')}
            </ThemedText>
            <TouchableOpacity
              onPress={closeSessionOverview}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t('sessionOverviewClose')}
            >
              <Ionicons name="close" size={24} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            accessibilityLabel={t('sessionOverviewA11yLabel')}
          >
            {/* A) Location + Session badge */}
            <View style={styles.badgeRow}>
              <LocationSessionBadge location={location} session={session} size="lg" />
            </View>

            {/* B) Accepted Proposal card */}
            {acceptedProposal && (
              <TouchableOpacity
                onPress={handleViewProposal}
                style={styles.proposalCard}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('sessionOverviewViewProposalA11y')}
              >
                <MaterialCommunityIcons name="script-text-outline" size={24} color={colors.primary} />
                <View style={styles.proposalInfo}>
                  <ThemedText variant="h3" color="primary" style={styles.proposalTitle} numberOfLines={2}>
                    {acceptedProposal.title}
                  </ThemedText>
                  <ThemedText variant="caption" color="secondary">
                    {t('sessionOverviewViewProposal')}
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
              </TouchableOpacity>
            )}

            {/* Admin-provided topic notice */}
            {(proposalMethod === 'admin_provided' || proposalMethod === 'direct_proposal') && (
              <View style={styles.adminNotice}>
                <Ionicons name="information-circle" size={18} color={colors.secondaryText} />
                <ThemedText variant="caption" color="secondary" style={styles.adminNoticeText}>
                  {t(proposalMethod === 'direct_proposal'
                    ? 'sessionOverviewDirectProposalNotice'
                    : 'sessionOverviewAdminProvidedNotice')}
                </ThemedText>
              </View>
            )}

            {/* C) Phase-grouped timeline */}
            {phases.map((phase, phaseIdx) => {
              const phaseStatus = getPhaseStatus(phase, currentStage)
              const isCompleted = phaseStatus === 'completed'
              const isCurrent = phaseStatus === 'current'
              const isUpcoming = phaseStatus === 'upcoming'
              const phaseNameKey = PHASE_NAME_I18N_KEYS[phase.key]
              const isViewingPhase = viewingStage && phase.stages.includes(viewingStage)

              const phaseIcon = isCompleted
                ? 'checkmark-circle'
                : isCurrent
                  ? 'radio-button-on'
                  : 'ellipse-outline'

              const phaseIconColor = isCompleted
                ? SemanticColors.success
                : isCurrent
                  ? colors.primary
                  : colors.placeholderText

              // Connector color based on whether previous phase is completed
              const prevCompleted = phaseIdx > 0
                && getPhaseStatus(phases[phaseIdx - 1], currentStage) === 'completed'

              const cardContent = (
                <View
                  style={[
                    styles.phaseCard,
                    isCurrent && { borderColor: colors.primary, borderWidth: 2 },
                    isViewingPhase && styles.phaseCardViewing,
                    isUpcoming && styles.phaseCardUpcoming,
                  ]}
                >
                  {/* Phase header row */}
                  <View style={styles.phaseHeaderRow}>
                    <Ionicons name={phaseIcon} size={20} color={phaseIconColor} />
                    <ThemedText
                      variant="bodySmall"
                      color={isUpcoming ? 'placeholder' : 'primary'}
                      style={styles.phaseName}
                    >
                      {phaseNameKey ? t(phaseNameKey) : phase.key}
                    </ThemedText>
                    {isViewingPhase && (
                      <View style={[styles.viewingBadge, { backgroundColor: colors.secondaryText }]}>
                        <Ionicons name="eye" size={10} color={colors.surface} />
                        <ThemedText variant="label" style={[styles.viewingBadgeText, { color: colors.surface }]}>
                          {t('sessionOverviewViewingStage')}
                        </ThemedText>
                      </View>
                    )}
                    {isCurrent && (
                      <View style={[styles.currentBadge, { backgroundColor: colors.primary }]}>
                        <ThemedText variant="label" style={styles.currentBadgeText}>
                          {t('sessionOverviewCurrentStage')}
                        </ThemedText>
                      </View>
                    )}
                    {isCompleted && !isViewingPhase && (
                      <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
                    )}
                  </View>

                  {/* Substages — dots with lines between */}
                  {phase.stages.map((stage, stageIdx) => {
                    const stageStatus = getStageStatus(stage, currentStage)
                    const stageCurrent = stageStatus === 'current'
                    const stageCompleted = stageStatus === 'completed'
                    const stageUpcoming = stageStatus === 'upcoming'
                    const isLastStage = stageIdx === phase.stages.length - 1
                    const isViewingSubstage = viewingStage === stage
                    const { nameKey, actionKey } = getMethodStageKeys(stage, proposalMethod)

                    const dotColor = stageCompleted
                      ? SemanticColors.success
                      : stageCurrent
                        ? colors.primary
                        : colors.placeholderText

                    // Voting indicator
                    const expectedRoundType = VOTING_INDICATOR_STAGES[stage]
                    const showVoting = expectedRoundType
                      && !stageUpcoming
                      && votingRound
                      && votingRound.roundType === expectedRoundType
                    const vrStatus = showVoting ? votingRound.status : null
                    const isAdminProvided = proposalMethod === 'admin_provided'
                    const statusOrder = isAdminProvided ? VR_STATUS_ORDER_ADMIN : VR_STATUS_ORDER
                    const statusIndex = isAdminProvided ? VR_STATUS_INDEX_ADMIN : VR_STATUS_INDEX
                    const vrIdx = vrStatus ? (statusIndex[vrStatus] ?? -1) : -1
                    const isTerminal = vrStatus === 'voting_closed'

                    return (
                      <View key={stage} style={styles.substageRow}>
                        {/* Dot + connector column */}
                        <View style={styles.substageIconCol}>
                          <View style={[
                            styles.substageDot,
                            { backgroundColor: dotColor },
                            isViewingSubstage && styles.substageDotViewing,
                          ]} />
                          {!isLastStage && (
                            <View
                              style={[
                                styles.substageConnector,
                                { backgroundColor: stageCompleted ? SemanticColors.success : colors.border },
                              ]}
                            />
                          )}
                        </View>
                        <View style={styles.substageInfo}>
                          <ThemedText
                            variant="caption"
                            color={stageUpcoming ? 'placeholder' : 'primary'}
                            style={[styles.substageName, isViewingSubstage && styles.substageNameViewing]}
                          >
                            {nameKey ? t(nameKey) : stage}
                          </ThemedText>
                          {actionKey && (
                            <ThemedText
                              variant="caption"
                              color={stageUpcoming ? 'placeholder' : 'secondary'}
                            >
                              {t(actionKey)}
                            </ThemedText>
                          )}
                          {showVoting && vrStatus && (
                            <View style={styles.vrSection}>
                              {/* Dot progress */}
                              <View style={styles.vrProgressRow}>
                                <View style={styles.vrTrackArea}>
                                  <View style={[styles.vrTrackBg, { backgroundColor: colors.border }]} />
                                  {vrIdx > 0 && (
                                    <View style={[styles.vrTrackFill, { backgroundColor: SemanticColors.success, width: `${(vrIdx / (statusOrder.length - 1)) * 100}%` }]} />
                                  )}
                                </View>
                                {statusOrder.map((s, i) => {
                                  const dotCompleted = isTerminal || i < vrIdx
                                  const dotCurrent = !isTerminal && i === vrIdx
                                  return (
                                    <View key={s} style={[
                                      styles.vrDot,
                                      dotCompleted && styles.vrDotCompleted,
                                      dotCurrent && styles.vrDotCurrent,
                                      !dotCompleted && !dotCurrent && styles.vrDotUpcoming,
                                    ]}>
                                      {dotCompleted && (
                                        <Ionicons name="checkmark" size={8} color={OnBrandColors.text} />
                                      )}
                                    </View>
                                  )
                                })}
                              </View>
                              {/* Current status label */}
                              <ThemedText variant="caption" color="dark" style={styles.vrStatusLabel}>
                                {t(VR_STATUS_LABELS_KEYS[vrStatus] || vrStatus)}
                              </ThemedText>
                              {/* Current status description */}
                              <ThemedText variant="caption" color="secondary" style={styles.vrDesc}>
                                {t(`vrDesc${vrStatus.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('')}`, { defaultValue: '' })}
                              </ThemedText>
                              {/* Next status preview */}
                              {vrIdx < statusOrder.length - 1 && (() => {
                                const nextVrStatus = statusOrder[vrIdx + 1]
                                const nextVrKey = nextVrStatus.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('')
                                return (
                                  <View style={styles.vrNextBox}>
                                    <ThemedText variant="caption" color="secondary" style={styles.vrNextLabel}>
                                      {t('vrNextStatus', { status: t(VR_STATUS_LABELS_KEYS[nextVrStatus] || nextVrStatus) })}
                                    </ThemedText>
                                    <ThemedText variant="caption" color="placeholder" style={styles.vrNextDesc}>
                                      {t(`vrNextDesc${nextVrKey}`, { defaultValue: '' })}
                                    </ThemedText>
                                  </View>
                                )
                              })()}
                            </View>
                          )}
                        </View>
                      </View>
                    )
                  })}
                </View>
              )

              return (
                <View key={phase.key}>
                  {/* Connector line between cards */}
                  {phaseIdx > 0 && (
                    <View style={styles.connectorWrapper}>
                      <View
                        style={[
                          styles.connector,
                          { backgroundColor: prevCompleted ? SemanticColors.success : colors.border },
                        ]}
                      />
                    </View>
                  )}

                  {/* Phase card — tappable when completed, or current while viewing archived */}
                  {isCompleted ? (
                    <TouchableOpacity
                      onPress={() => handlePhaseTap(phase)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={t('sessionOverviewPhaseCompleteA11y', {
                        phase: phaseNameKey ? t(phaseNameKey) : phase.key,
                      })}
                    >
                      {cardContent}
                    </TouchableOpacity>
                  ) : isCurrent && viewingStage ? (
                    <TouchableOpacity
                      onPress={handleReturnToCurrent}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={t('sessionOverviewReturnCurrentA11y')}
                    >
                      {cardContent}
                    </TouchableOpacity>
                  ) : (
                    <View
                      accessibilityRole="text"
                      accessibilityLabel={phaseNameKey ? t(phaseNameKey) : phase.key}
                    >
                      {cardContent}
                    </View>
                  )}
                </View>
              )
            })}

            {/* D) Return to current stage button (when viewing archived) */}
            {viewingStage && (
              <TouchableOpacity
                onPress={handleReturnToCurrent}
                style={[styles.switchButton, styles.returnButton]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('sessionOverviewReturnCurrentA11y')}
              >
                <Ionicons name="return-up-back" size={20} color={colors.primary} />
                <ThemedText variant="bodySmall" color="primary" style={styles.switchButtonText}>
                  {t('sessionOverviewReturnCurrent')}
                </ThemedText>
              </TouchableOpacity>
            )}

            {/* E) Switch Session button */}
            <TouchableOpacity
              onPress={handleSwitchSession}
              style={styles.switchButton}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('sessionOverviewSwitchSessionA11y')}
            >
              <Ionicons name="swap-horizontal" size={20} color={colors.primary} />
              <ThemedText variant="bodySmall" color="primary" style={styles.switchButtonText}>
                {t('sessionOverviewSwitchSession')}
              </ThemedText>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
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
  headerTitle: {
    flex: 1,
  },
  closeButton: {
    padding: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + insets.bottom,
  },
  badgeRow: {
    paddingBottom: Spacing.md,
  },
  adminNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  adminNoticeText: {
    flex: 1,
  },
  proposalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  proposalInfo: {
    flex: 1,
  },
  proposalTitle: {
    fontWeight: '600',
  },
  connectorWrapper: {
    alignItems: 'center',
    height: Spacing.md,
  },
  connector: {
    width: 2,
    flex: 1,
  },
  phaseCard: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    padding: Spacing.md,
  },
  phaseCardViewing: {
    borderColor: colors.secondaryText,
    borderWidth: 2,
  },
  phaseCardUpcoming: {
    opacity: 0.5,
  },
  phaseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  phaseName: {
    fontWeight: '700',
    flex: 1,
  },
  currentBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  currentBadgeText: {
    color: OnBrandColors.text,
    fontWeight: '700',
    fontSize: 10,
  },
  viewingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  viewingBadgeText: {
    fontWeight: '700',
    fontSize: 10,
  },
  substageRow: {
    flexDirection: 'row',
    paddingLeft: Spacing.lg + Spacing.xs,
    marginTop: Spacing.sm,
  },
  substageIconCol: {
    width: 16,
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  substageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  substageDotViewing: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 2,
  },
  substageConnector: {
    width: 2,
    flex: 1,
    marginTop: 4,
  },
  substageInfo: {
    flex: 1,
    paddingBottom: Spacing.xs,
  },
  substageName: {
    fontWeight: '500',
  },
  substageNameViewing: {
    fontWeight: '700',
  },
  vrSection: {
    marginTop: Spacing.sm,
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: Spacing.sm,
  },
  vrProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  vrTrackArea: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 9,
    height: 2,
  },
  vrTrackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  vrTrackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  vrDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vrDotCompleted: {
    backgroundColor: SemanticColors.success,
  },
  vrDotCurrent: {
    backgroundColor: colors.primary,
  },
  vrDotUpcoming: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.placeholderText,
  },
  vrStatusLabel: {
    fontWeight: '600',
    textAlign: 'center',
  },
  vrDesc: {
    textAlign: 'center',
    marginTop: 2,
  },
  vrNextBox: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.cardBorder,
    alignItems: 'center',
  },
  vrNextLabel: {
    fontWeight: '600',
  },
  vrNextDesc: {
    marginTop: 2,
    textAlign: 'center',
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
  },
  returnButton: {
    borderColor: colors.primary,
  },
  switchButtonText: {
    fontWeight: '600',
  },
})
