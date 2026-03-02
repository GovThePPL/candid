import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import { useLocationSession } from '../contexts/LocationSessionContext'
import LocationSessionBadge from './LocationSessionBadge'
import ThemedText from './ThemedText'
import { STAGE_TO_PHASE } from '../constants/Sessions'
import { Spacing, BorderRadius } from '../constants/Theme'
import { SkeletonPulse, SkeletonBox, SkeletonLine } from './Skeleton'

const STAGE_ACTION_I18N_KEYS = {
  proposal_issue: 'stageActionProposalIssue',
  proposal_qualify: 'stageActionProposalQualify',
  proposal_stakeholders: 'stageActionProposalStakeholders',
  opinion_discussion: 'stageActionOpinionDiscussion',
  reflection_curation: 'stageActionReflectionCuration',
  reflection_proposals: 'stageActionReflectionProposals',
  consensus: 'stageActionConsensus',
}

const PHASE_I18N_KEYS = {
  proposal: 'phaseProposal',
  opinion: 'phaseOpinion',
  reflection: 'phaseReflection',
  consensus: 'phaseConsensus',
}

/**
 * Compact tappable card showing session info + current stage action.
 * Tapping opens the Session Overview Modal.
 */
export default memo(function SessionInfoCard({ style }) {
  const { t } = useTranslation('common')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { sessionData, sessionLoading, selectedSession, currentStage, effectiveStage, viewingStage, openSessionOverview } = useLocationSession()

  if (!sessionData && sessionLoading && selectedSession) {
    return (
      <View style={[styles.container, style]}>
        <SkeletonPulse style={styles.content}>
          <SkeletonBox width={100} height={22} borderRadius={10} />
          <SkeletonLine width={140} height={12} style={{ marginTop: 4 }} />
        </SkeletonPulse>
        <SkeletonBox width={16} height={16} borderRadius={4} />
      </View>
    )
  }

  if (!sessionData) return null

  const location = sessionData.locationCode
    ? { code: sessionData.locationCode, name: sessionData.locationName }
    : null
  const session = sessionData.label ? { label: sessionData.label } : null
  const displayStage = effectiveStage || currentStage
  const phase = displayStage ? STAGE_TO_PHASE[displayStage] : null
  const phaseKey = phase ? PHASE_I18N_KEYS[phase] : null
  const actionKey = displayStage ? STAGE_ACTION_I18N_KEYS[displayStage] : null
  const isViewingArchived = viewingStage != null

  return (
    <TouchableOpacity
      style={[styles.container, isViewingArchived && styles.containerArchived, style]}
      onPress={openSessionOverview}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('sessionInfoA11y')}
    >
      <View style={styles.content}>
        <View style={styles.topRow}>
          <LocationSessionBadge location={location} session={session} size="lg" />
          {phaseKey && (
            <View style={styles.phasePill}>
              <ThemedText variant="caption" color="primary" style={styles.phasePillText}>
                {t('stagePill', { phase: t(phaseKey) })}
              </ThemedText>
            </View>
          )}
        </View>
        {actionKey && (
          <ThemedText variant="label" color="secondary" style={styles.action}>
            {t(actionKey)}
          </ThemedText>
        )}
        {isViewingArchived && (
          <View style={styles.archivedRow}>
            <Ionicons name="lock-closed" size={12} color={colors.warningBannerText} />
            <ThemedText variant="caption" style={styles.archivedRowText}>
              {t('stageArchiveViewing')}
            </ThemedText>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={isViewingArchived ? colors.warningBannerText : colors.secondaryText} />
    </TouchableOpacity>
  )
})

const createStyles = (colors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  containerArchived: {
    backgroundColor: colors.warningBannerBg,
    borderColor: colors.warningBannerText + '40',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  phasePill: {
    backgroundColor: colors.primary + '18',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
  },
  phasePillText: {
    fontWeight: '600',
  },
  archivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 2,
  },
  archivedRowText: {
    fontStyle: 'italic',
    color: colors.warningBannerText,
  },
  action: {
    marginTop: 2,
    textAlign: 'center',
  },
})
