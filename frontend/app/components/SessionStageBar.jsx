import { View, TouchableOpacity, StyleSheet, Alert, useWindowDimensions } from 'react-native'
import { memo, useMemo, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import Svg, { Path } from 'react-native-svg'
import { useThemeColors } from '../hooks/useThemeColors'
import { useLocationSession } from '../contexts/LocationSessionContext'
import { useUser } from '../hooks/useUser'
import ThemedText from './ThemedText'
import LocationSessionBadge from './LocationSessionBadge'
import { Spacing } from '../constants/Theme'
import { PROPOSAL_METHOD_PHASES } from '../constants/Sessions'
import api, { sessionsApiWrapper } from '../lib/api'

// ── Stage / phase mappings ───────────────────────────────────────────

const STAGE_ORDER = [
  'proposal_issue',
  'proposal_qualify',
  'proposal_stakeholders',
  'opinion_discussion',
  'reflection_curation',
  'reflection_proposals',
  'consensus',
]

const STAGE_INDEX = {}
STAGE_ORDER.forEach((s, i) => { STAGE_INDEX[s] = i })

const PHASE_ORDER = ['proposal', 'opinion', 'reflection', 'consensus']
const PHASE_INDEX = { proposal: 0, opinion: 1, reflection: 2, consensus: 3 }

const PHASE_FIRST_STAGE = {
  proposal: 'proposal_issue',
  opinion: 'opinion_discussion',
  reflection: 'reflection_curation',
  consensus: 'consensus',
}

const STAGE_TO_PHASE = {
  proposal_issue: 'proposal',
  proposal_qualify: 'proposal',
  proposal_stakeholders: 'proposal',
  opinion_discussion: 'opinion',
  reflection_curation: 'reflection',
  reflection_proposals: 'reflection',
  consensus: 'consensus',
}

const PHASE_I18N_KEYS = {
  proposal: 'phaseProposal',
  opinion: 'phaseOpinion',
  reflection: 'phaseReflection',
  consensus: 'phaseConsensus',
}

const STAGE_NAME_I18N_KEYS = {
  proposal_issue: 'stageProposalIssue',
  proposal_qualify: 'stageProposalQualify',
  proposal_stakeholders: 'stageProposalStakeholders',
  opinion_discussion: 'stageOpinionDiscussion',
  reflection_curation: 'stageReflectionCuration',
  reflection_proposals: 'stageReflectionProposals',
  consensus: 'stageConsensus',
}

const BAR_HEIGHT = 22
const CHEVRON_W = 6

/**
 * Full-width segmented progress bar for session stages.
 *
 * Layout: [ (OR) Session Label | Proposal > Opinion > Reflection > Consensus ]
 *
 * The location+session badge occupies a dedicated first segment. The 4 phase
 * segments share the remaining width. All rendered as a single seamless SVG.
 */
export default memo(function SessionStageBar({ hideControls = false }) {
  const { t } = useTranslation('common')
  const colors = useThemeColors()
  const { width: screenWidth } = useWindowDimensions()
  const [containerWidth, setContainerWidth] = useState(screenWidth)
  const [badgeWidth, setBadgeWidth] = useState(0)
  const {
    sessionData,
    currentStage,
    viewingStage,
    setViewingStage,
    selectedSession,
    refreshSessionData,
    acceptedProposal,
    openProposalModal,
    votingRound,
  } = useLocationSession()
  const { user } = useUser()

  const styles = useMemo(() => createStyles(colors), [colors])

  const visiblePhases = useMemo(() => {
    const method = sessionData?.proposalMethod || 'user_driven'
    return PROPOSAL_METHOD_PHASES[method] || PHASE_ORDER
  }, [sessionData?.proposalMethod])

  const visiblePhaseIndex = useMemo(() => {
    const idx = {}
    visiblePhases.forEach((p, i) => { idx[p] = i })
    return idx
  }, [visiblePhases])

  const currentPhase = currentStage ? STAGE_TO_PHASE[currentStage] : null
  const currentPhaseIdx = currentPhase != null ? (visiblePhaseIndex[currentPhase] ?? -1) : -1

  const viewingPhase = viewingStage ? STAGE_TO_PHASE[viewingStage] : null
  const highlightedPhaseIdx = viewingPhase != null
    ? (visiblePhaseIndex[viewingPhase] ?? -1)
    : currentPhaseIdx

  const isFacilitator = !!(
    user?.id &&
    sessionData?.facilitatorUserId &&
    user.id === sessionData.facilitatorUserId
  )

  const isLastStage = currentStage === STAGE_ORDER[STAGE_ORDER.length - 1]

  const nextStage = useMemo(() => {
    if (!currentStage) return null
    const idx = STAGE_INDEX[currentStage]
    if (idx == null || idx >= STAGE_ORDER.length - 1) return null
    return STAGE_ORDER[idx + 1]
  }, [currentStage])

  const handlePhaseTap = useCallback((phase) => {
    const phaseIdx = visiblePhaseIndex[phase]

    if (viewingStage) {
      const viewingPhaseIdx = visiblePhaseIndex[STAGE_TO_PHASE[viewingStage]]
      if (phaseIdx === viewingPhaseIdx) {
        setViewingStage(null)
        return
      }
    }

    if (phaseIdx === currentPhaseIdx && !viewingStage) {
      return
    }

    if (phaseIdx <= currentPhaseIdx) {
      if (phaseIdx === currentPhaseIdx) {
        setViewingStage(null)
      } else {
        setViewingStage(PHASE_FIRST_STAGE[phase])
      }
    }
  }, [viewingStage, currentPhaseIdx, visiblePhaseIndex, setViewingStage])

  const handleAdvance = useCallback(() => {
    if (!nextStage || !selectedSession) return

    const stageDisplay = STAGE_NAME_I18N_KEYS[nextStage] ? t(STAGE_NAME_I18N_KEYS[nextStage]) : nextStage

    Alert.alert(
      t('stageAdvance'),
      t('stageAdvanceConfirm', { stage: stageDisplay }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            try {
              await api.sessions.update(selectedSession, { stage: nextStage })
              refreshSessionData()
            } catch (e) {
              Alert.alert(t('error'), e?.message || t('failedSubmit'))
            }
          },
        },
      ]
    )
  }, [nextStage, selectedSession, refreshSessionData, t])

  // Voting round controls for facilitator
  const votingRoundStatus = votingRound?.status
  const canCreateVotingRound = isFacilitator && !votingRound && (
    currentStage === 'proposal_qualify' || currentStage === 'reflection_proposals'
  )
  const canAdvanceVotingRound = isFacilitator && votingRound && votingRoundStatus !== 'voting_closed'

  const handleCreateVotingRound = useCallback(() => {
    Alert.alert(
      t('startVotingRound'),
      t('startVotingRoundConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            try {
              await sessionsApiWrapper.createVotingRound(selectedSession)
              refreshSessionData()
            } catch (e) {
              Alert.alert(t('error'), e?.message || t('failedSubmit'))
            }
          },
        },
      ]
    )
  }, [selectedSession, refreshSessionData, t])

  const handleAdvanceVotingRound = useCallback(() => {
    const VOTING_STATUS_DISPLAY = {
      proposals_open: t('vrProposalsOpen'),
      finalization_open: t('vrFinalizationOpen'),
      proposals_closed: t('vrProposalsClosed'),
      voting_open: t('vrVotingOpen'),
      voting_closed: t('vrVotingClosed'),
    }
    const nextDisplay = (() => {
      const order = ['proposals_open', 'finalization_open', 'proposals_closed', 'voting_open', 'voting_closed']
      const idx = order.indexOf(votingRoundStatus)
      return idx >= 0 && idx < order.length - 1 ? VOTING_STATUS_DISPLAY[order[idx + 1]] : null
    })()

    Alert.alert(
      t('advanceVotingRound'),
      nextDisplay || '',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            try {
              await sessionsApiWrapper.advanceVotingRound(selectedSession)
              refreshSessionData()
            } catch (e) {
              Alert.alert(t('error'), e?.message || t('failedSubmit'))
            }
          },
        },
      ]
    )
  }, [selectedSession, votingRoundStatus, refreshSessionData, t])

  const onContainerLayout = useCallback((e) => {
    const w = e.nativeEvent.layout.width
    if (w > 0) setContainerWidth(w)
  }, [])

  const onBadgeLayout = useCallback((e) => {
    setBadgeWidth(e.nativeEvent.layout.width)
  }, [])

  if (!sessionData) return null

  const location = sessionData.locationCode
    ? { code: sessionData.locationCode, name: sessionData.locationName }
    : null
  const session = sessionData.label ? { label: sessionData.label } : null

  const getSegmentColor = (phaseIdx) => {
    if (phaseIdx === highlightedPhaseIdx) return colors.primary
    if (phaseIdx <= currentPhaseIdx) return colors.cardBackground
    return colors.border
  }

  const getTextColor = (phaseIdx) => {
    if (phaseIdx === highlightedPhaseIdx) return '#FFFFFF'
    if (phaseIdx <= currentPhaseIdx) return colors.text
    return colors.placeholderText
  }

  // Segment layout: flat rectangles with chevron line separators
  const showControls = !hideControls && isFacilitator
  const advanceSpace = (showControls && !isLastStage) ? 26 : 0
  const totalWidth = containerWidth - advanceSpace
  const badgeSegW = badgeWidth > 0 ? badgeWidth + Spacing.xs * 2 : totalWidth * 0.3
  const phaseAreaWidth = totalWidth - badgeSegW
  const phaseSegW = phaseAreaWidth / visiblePhases.length

  const svgPaths = []

  // Badge segment (chevron right edge) — added after phases so it's on top
  const badgePath = (
    <Path
      key="seg-badge"
      d={`M0,0 L${badgeSegW},0 L${badgeSegW + CHEVRON_W},${BAR_HEIGHT / 2} L${badgeSegW},${BAR_HEIGHT} L0,${BAR_HEIGHT} Z`}
      fill={colors.cardBackground}
    />
  )

  // Phase segments — all chevron-shaped, drawn right-to-left so left is on top
  const phasePaths = []
  visiblePhases.forEach((phase, idx) => {
    const phaseIdx = visiblePhaseIndex[phase]
    const color = getSegmentColor(phaseIdx)
    const x = badgeSegW + idx * phaseSegW
    const right = x + phaseSegW
    const isLast = idx === visiblePhases.length - 1

    const d = isLast
      ? `M${x},0 L${right},0 L${right},${BAR_HEIGHT} L${x},${BAR_HEIGHT} Z`
      : `M${x},0 L${right},0 L${right + CHEVRON_W},${BAR_HEIGHT / 2} L${right},${BAR_HEIGHT} L${x},${BAR_HEIGHT} Z`

    phasePaths.push(<Path key={`seg-${phase}`} d={d} fill={color} />)
  })
  // Reverse so leftmost draws last (on top), badge on very top
  for (let i = phasePaths.length - 1; i >= 0; i--) {
    svgPaths.push(phasePaths[i])
  }
  svgPaths.push(badgePath)

  // Chevron line separators — contrast with adjacent segment colors
  const getChevronSepColor = (leftColor, rightColor) => {
    if (leftColor === colors.cardBackground && rightColor === colors.cardBackground) return colors.border
    if (leftColor === colors.border && rightColor === colors.border) return colors.cardBackground
    return 'none'
  }

  // Chevron line after badge
  const firstPhaseColor = getSegmentColor(visiblePhaseIndex[visiblePhases[0]])
  const badgeSepColor = getChevronSepColor(colors.cardBackground, firstPhaseColor)
  if (badgeSepColor !== 'none') {
    const bx = badgeSegW
    svgPaths.push(
      <Path key="sep-badge"
        d={`M${bx - CHEVRON_W / 2},0 L${bx + CHEVRON_W / 2},${BAR_HEIGHT / 2} L${bx - CHEVRON_W / 2},${BAR_HEIGHT}`}
        stroke={badgeSepColor} strokeWidth={2} fill="none"
      />
    )
  }
  // Chevron lines between phases
  visiblePhases.forEach((phase, idx) => {
    if (idx === visiblePhases.length - 1) return
    const leftColor = getSegmentColor(visiblePhaseIndex[phase])
    const rightColor = getSegmentColor(visiblePhaseIndex[visiblePhases[idx + 1]])
    const sepColor = getChevronSepColor(leftColor, rightColor)
    if (sepColor === 'none') return
    const bx = badgeSegW + (idx + 1) * phaseSegW
    svgPaths.push(
      <Path key={`sep-${phase}`}
        d={`M${bx - CHEVRON_W / 2},0 L${bx + CHEVRON_W / 2},${BAR_HEIGHT / 2} L${bx - CHEVRON_W / 2},${BAR_HEIGHT}`}
        stroke={sepColor} strokeWidth={2} fill="none"
      />
    )
  })

  return (
    <View style={styles.container} onLayout={onContainerLayout}>
      <View style={[styles.barWrapper, { width: totalWidth, height: BAR_HEIGHT }]}>
        <Svg width={totalWidth} height={BAR_HEIGHT} viewBox={`0 0 ${totalWidth} ${BAR_HEIGHT}`}>
          {svgPaths}
        </Svg>

        {/* Badge overlay — inside the dedicated badge segment */}
        {acceptedProposal ? (
          <TouchableOpacity
            style={styles.badgeOverlay}
            onLayout={onBadgeLayout}
            onPress={openProposalModal}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('discuss:acceptedProposalBadgeA11y')}
          >
            <LocationSessionBadge location={location} session={session} size="sm" />
          </TouchableOpacity>
        ) : (
          <View style={styles.badgeOverlay} onLayout={onBadgeLayout}>
            <LocationSessionBadge location={location} session={session} size="sm" />
          </View>
        )}

        {/* Phase label + touch overlays */}
        {visiblePhases.map((phase, idx) => {
          const phaseIdx = visiblePhaseIndex[phase]
          const isFuture = phaseIdx > currentPhaseIdx
          const isHighlighted = phaseIdx === highlightedPhaseIdx
          const label = t(PHASE_I18N_KEYS[phase])
          const txtColor = getTextColor(phaseIdx)
          const x = badgeSegW + idx * phaseSegW
          const w = phaseSegW

          const textEl = (
            <ThemedText
              variant="badge"
              style={[
                styles.segmentText,
                { color: txtColor },
                isHighlighted && styles.segmentTextActive,
              ]}
            >
              {label}
            </ThemedText>
          )

          if (isFuture) {
            return (
              <View
                key={phase}
                accessibilityRole="text"
                accessibilityLabel={label}
                accessibilityState={{ disabled: true }}
                style={[styles.segmentOverlay, { left: x, width: w }]}
              >
                {textEl}
              </View>
            )
          }

          return (
            <TouchableOpacity
              key={phase}
              onPress={() => handlePhaseTap(phase)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={label}
              style={[styles.segmentOverlay, { left: x, width: w }]}
            >
              {textEl}
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Facilitator advance button */}
      {showControls && !isLastStage && (
        <TouchableOpacity
          onPress={handleAdvance}
          style={styles.advanceButton}
          accessibilityRole="button"
          accessibilityLabel={t('stageAdvance')}
        >
          <MaterialCommunityIcons
            name="skip-next"
            size={18}
            color={colors.primary}
          />
        </TouchableOpacity>
      )}

      {/* Voting round: create or advance */}
      {!hideControls && canCreateVotingRound && (
        <TouchableOpacity
          onPress={handleCreateVotingRound}
          style={styles.advanceButton}
          accessibilityRole="button"
          accessibilityLabel={t('startVotingRound')}
        >
          <MaterialCommunityIcons name="vote" size={18} color={colors.primary} />
        </TouchableOpacity>
      )}
      {!hideControls && canAdvanceVotingRound && (
        <TouchableOpacity
          onPress={handleAdvanceVotingRound}
          style={styles.advanceButton}
          accessibilityRole="button"
          accessibilityLabel={t('advanceVotingRound')}
        >
          <MaterialCommunityIcons name="vote-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
      )}
    </View>
  )
})

const createStyles = (colors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.uiBackground,
  },
  barWrapper: {
    position: 'relative',
  },
  badgeOverlay: {
    position: 'absolute',
    top: 0,
    left: 3,
    height: BAR_HEIGHT,
    justifyContent: 'center',
  },
  segmentOverlay: {
    position: 'absolute',
    top: 0,
    height: BAR_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentText: {
    fontWeight: '500',
  },
  segmentTextActive: {
    fontWeight: '700',
  },
  advanceButton: {
    padding: 3,
  },
})
