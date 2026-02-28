import { View, StyleSheet } from 'react-native'
import { memo, useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Svg, { Path } from 'react-native-svg'
import { useThemeColors } from '../hooks/useThemeColors'
import { SemanticColors } from '../constants/Colors'
import ThemedText from './ThemedText'

const PHASE_ORDER = ['proposal', 'opinion', 'reflection', 'consensus']
const PHASE_INDEX = { proposal: 0, opinion: 1, reflection: 2, consensus: 3 }

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

const STAGE_I18N_KEYS = {
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

/** Return method-specific i18n key overrides for stage name and description. */
const getMethodStageKeys = (stage, proposalMethod) => {
  if (proposalMethod === 'admin_provided' && stage === 'proposal_qualify') {
    return { nameKey: 'stageProposalQualifyAdmin', actionKey: STAGE_ACTION_I18N_KEYS[stage] }
  }
  if (proposalMethod === 'direct_proposal' && (stage === 'proposal_issue' || stage === 'proposal_qualify' || stage === 'proposal_stakeholders')) {
    return { nameKey: 'stageDirectProposalProvided', actionKey: null }
  }
  return { nameKey: STAGE_I18N_KEYS[stage], actionKey: STAGE_ACTION_I18N_KEYS[stage] }
}

const CHEVRON_W = 8

/**
 * Standalone stage progress bar — displays 4 phase segments for a given stage.
 * Unlike SessionStageBar, this does not read from context and has no interactivity.
 *
 * @param {Object} props
 * @param {string} props.stage - Current stage key (e.g. 'opinion_discussion')
 * @param {number} [props.height=28] - Bar height in px
 * @param {boolean} [props.showStageLabel=false] - Show a text descriptor of the current sub-stage below the bar
 */
export default memo(function SessionProgressBar({ stage, height = 28, showStageLabel = false, proposalMethod = 'user_driven' }) {
  const { t } = useTranslation('common')
  const colors = useThemeColors()
  const [barWidth, setBarWidth] = useState(0)

  const onLayout = useCallback((e) => {
    setBarWidth(e.nativeEvent.layout.width)
  }, [])

  const currentPhase = stage ? STAGE_TO_PHASE[stage] : null
  const currentPhaseIdx = currentPhase != null ? PHASE_INDEX[currentPhase] : -1

  const getSegmentColor = (phaseIdx) => {
    if (phaseIdx === currentPhaseIdx) return colors.primary
    if (phaseIdx < currentPhaseIdx) return colors.cardBackground
    return colors.border
  }

  const getTextColor = (phaseIdx) => {
    if (phaseIdx === currentPhaseIdx) return '#FFFFFF'
    if (phaseIdx < currentPhaseIdx) return colors.text
    return colors.placeholderText
  }

  // Chevron separator color logic (same as SessionStageBar)
  const getChevronSepColor = (leftColor, rightColor) => {
    if (leftColor === colors.cardBackground && rightColor === colors.cardBackground) return colors.border
    if (leftColor === colors.border && rightColor === colors.border) return colors.cardBackground
    return 'none'
  }

  const { nameKey, actionKey } = stage ? getMethodStageKeys(stage, proposalMethod) : {}
  const stageLabel = showStageLabel && nameKey ? t(nameKey) : null
  const stageAction = showStageLabel && actionKey ? t(actionKey) : null

  // Compute segment widths: blend of equal sizing (50%) and proportional to label length (50%)
  const phaseLabels = useMemo(() => PHASE_ORDER.map(p => t(PHASE_I18N_KEYS[p])), [t])
  const segLayout = useMemo(() => {
    const lengths = phaseLabels.map(l => l.length)
    const totalLen = lengths.reduce((a, b) => a + b, 0)
    const n = PHASE_ORDER.length
    const weights = lengths.map(len => 0.5 / n + 0.5 * len / totalLen)
    const widths = weights.map(w => w * barWidth)
    const starts = []
    let acc = 0
    for (const w of widths) { starts.push(acc); acc += w }
    return { widths, starts }
  }, [phaseLabels, barWidth])

  if (!barWidth || !stage) {
    return (
      <View>
        <View onLayout={onLayout} style={{ height }} />
        {stageLabel && (
          <ThemedText variant="caption" color="secondary" style={styles.stageLabel}>
            {stageLabel}
          </ThemedText>
        )}
        {stageAction && (
          <ThemedText variant="caption" color="secondary" style={styles.stageAction}>
            {stageAction}
          </ThemedText>
        )}
      </View>
    )
  }

  // Build SVG paths — right to left so left overlaps right at chevron
  const svgPaths = []
  const phasePaths = []
  PHASE_ORDER.forEach((phase, idx) => {
    const phaseIdx = PHASE_INDEX[phase]
    const color = getSegmentColor(phaseIdx)
    const x = segLayout.starts[idx]
    const right = x + segLayout.widths[idx]
    const isLast = idx === PHASE_ORDER.length - 1

    let d
    if (isLast) {
      d = `M${x},0 L${right},0 L${right},${height} L${x},${height} Z`
    } else {
      d = `M${x},0 L${right},0 L${right + CHEVRON_W},${height / 2} L${right},${height} L${x},${height} Z`
    }

    phasePaths.push(<Path key={`seg-${phase}`} d={d} fill={color} />)
  })
  // Reverse so leftmost draws last (on top)
  for (let i = phasePaths.length - 1; i >= 0; i--) {
    svgPaths.push(phasePaths[i])
  }

  // Chevron line separators
  PHASE_ORDER.forEach((phase, idx) => {
    if (idx === PHASE_ORDER.length - 1) return
    const leftColor = getSegmentColor(PHASE_INDEX[phase])
    const rightColor = getSegmentColor(PHASE_INDEX[PHASE_ORDER[idx + 1]])
    const sepColor = getChevronSepColor(leftColor, rightColor)
    if (sepColor === 'none') return
    const bx = segLayout.starts[idx + 1]
    svgPaths.push(
      <Path key={`sep-${phase}`}
        d={`M${bx - CHEVRON_W / 2},0 L${bx + CHEVRON_W / 2},${height / 2} L${bx - CHEVRON_W / 2},${height}`}
        stroke={sepColor} strokeWidth={2} fill="none"
      />
    )
  })

  return (
    <View>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 7, overflow: 'hidden' }}>
        <View onLayout={onLayout} style={{ height, position: 'relative' }}>
          <Svg width={barWidth} height={height} viewBox={`0 0 ${barWidth} ${height}`}>
            {svgPaths}
          </Svg>

          {/* Phase label overlays */}
          {PHASE_ORDER.map((phase, idx) => {
            const phaseIdx = PHASE_INDEX[phase]
            const isActive = phaseIdx === currentPhaseIdx
            const label = phaseLabels[idx]
            const txtColor = getTextColor(phaseIdx)
            const x = segLayout.starts[idx]
            const w = segLayout.widths[idx]

            return (
              <View
                key={phase}
                style={[styles.segmentOverlay, { left: x, width: w, height }]}
              >
                <ThemedText
                  variant="badgeLg"
                  style={[
                    styles.segmentText,
                    { color: txtColor },
                    isActive && styles.segmentTextActive,
                  ]}
                >
                  {label}
                </ThemedText>
              </View>
            )
          })}
        </View>
      </View>
      {stageLabel && (
        <ThemedText variant="caption" color="secondary" style={styles.stageLabel}>
          {stageLabel}
        </ThemedText>
      )}
      {stageAction && (
        <ThemedText variant="caption" color="secondary" style={styles.stageAction}>
          {stageAction}
        </ThemedText>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  segmentOverlay: {
    position: 'absolute',
    top: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentText: {
    fontWeight: '500',
  },
  segmentTextActive: {
    fontWeight: '700',
  },
  stageLabel: {
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '600',
  },
  stageAction: {
    textAlign: 'center',
    marginTop: 2,
  },
})
