import { useMemo } from 'react'
import { View, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { SemanticColors, BrandColor } from '../../constants/Colors'
import { Typography } from '../../constants/Theme'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../ThemedText'
import VoteDistributionBar from './VoteDistributionBar'
import CardShell from '../CardShell'
import PositionInfoCard from '../PositionInfoCard'

/**
 * Card displaying a position statement with vote distribution bars for each group
 *
 * @param {Object} props
 * @param {Object} props.position - Position data
 * @param {Array} props.groups - Opinion groups
 * @param {string} props.activeGroup - Currently active tab/group
 * @param {string} props.userVote - User's vote on this position
 * @param {Function} props.onViewClosures - Optional callback when View Closures is pressed
 */
export default function PositionCard({ position, groups = [], activeGroup, userVote, onViewClosures }) {
  const { t } = useTranslation('stats')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const {
    voteDistribution,
    totalVotes = 0,
    groupVotes = {},
    isDefining,
    groupId: definingGroupId,
    consensusType,
  } = position

  // Check if this position is defining for the currently selected group
  // For majority tab, only show if it has consensus data
  const isDefiningForActiveGroup = activeGroup !== 'my_positions' && (
    (activeGroup === 'majority' && consensusType != null) ||
    (activeGroup !== 'majority' && definingGroupId === activeGroup && isDefining)
  )

  // Get the vote distribution for the active group
  const getActiveGroupVotes = () => {
    if (activeGroup === 'majority' || activeGroup === 'my_positions') {
      return voteDistribution || { agree: 0, disagree: 0, pass: 0 }
    }
    return groupVotes[activeGroup] || voteDistribution || { agree: 0, disagree: 0, pass: 0 }
  }

  const activeVotes = getActiveGroupVotes()

  // Always use vote distribution (based on users who actually saw the statement)
  const agreePercent = Math.round((activeVotes.agree || 0) * 100)
  const disagreePercent = Math.round((activeVotes.disagree || 0) * 100)

  // Get label for the active group
  const getActiveGroupLabel = () => {
    if (activeGroup === 'majority') return null
    if (activeGroup === 'my_positions') return null
    const group = groups.find(g => g.id === activeGroup)
    return group ? group.label : null
  }

  const activeGroupLabel = getActiveGroupLabel()

  // Determine which stat to show (agree or disagree)
  // For majority with consensus, use the consensus type
  const showAgree = agreePercent >= disagreePercent

  // Build list of bars to show: "All Users" + each group
  const bars = [
    { id: 'all', label: t('all'), customLabel: null, distribution: voteDistribution },
    ...groups.map(g => ({
      id: g.id,
      label: g.label,
      customLabel: g.labelRankings?.[0]?.label || null,
      distribution: groupVotes[g.id] || { agree: 0, disagree: 0, pass: 0 },
    })),
  ]

  // Build vote badge for header right
  const voteBadge = userVote ? (
    <View>
      {userVote === 'agree' && (
        <View style={styles.agreedBadge}>
          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
          <ThemedText variant="badge" color="inverse" style={styles.badgeText}>{t('youAgreed')}</ThemedText>
        </View>
      )}
      {userVote === 'disagree' && (
        <View style={styles.disagreedBadge}>
          <Ionicons name="close" size={12} color="#FFFFFF" />
          <ThemedText variant="badge" color="inverse" style={styles.badgeText}>{t('youDisagreed')}</ThemedText>
        </View>
      )}
      {userVote === 'pass' && (
        <View style={styles.passedBadge}>
          <Ionicons name="remove" size={12} color={colors.secondaryText} />
          <ThemedText variant="badge" color="secondary" style={styles.badgeText}>{t('youPassed')}</ThemedText>
        </View>
      )}
    </View>
  ) : null

  // Stats bottom section
  const statsSection = (
    <View>
      {/* Defining statement - shows for majority (all users) or specific group */}
      {isDefiningForActiveGroup && (
        <View style={[
          styles.definingStatement,
          showAgree ? styles.definingAgree : styles.definingDisagree
        ]}>
          {showAgree ? (
            <View style={styles.definingContent}>
              <Ionicons name="checkmark-circle" size={20} color={SemanticColors.agree} />
              <ThemedText variant="label" style={styles.definingText}>
                <ThemedText variant="label" color="agree" style={styles.definingPercent}>{agreePercent}%</ThemedText>
                {' '}{activeGroup === 'majority'
                  ? t('agreeExplainAll')
                  : t('agreeExplainGroup', { label: activeGroupLabel })}
              </ThemedText>
            </View>
          ) : (
            <View style={styles.definingContent}>
              <Ionicons name="close-circle" size={20} color={SemanticColors.disagree} />
              <ThemedText variant="label" style={styles.definingText}>
                <ThemedText variant="label" color="disagree" style={styles.definingPercent}>{disagreePercent}%</ThemedText>
                {' '}{activeGroup === 'majority'
                  ? t('disagreeExplainAll')
                  : t('disagreeExplainGroup', { label: activeGroupLabel })}
              </ThemedText>
            </View>
          )}
        </View>
      )}

      {/* Vote distribution bars — table layout: label column + bar column */}
      <View style={styles.barsTable}>
        {/* Labels column — auto-width determined by widest label */}
        <View style={styles.labelsColumn}>
          {bars.map((bar) => {
            const isActive = bar.id === activeGroup || (activeGroup === 'majority' && bar.id === 'all') || (activeGroup === 'my_positions' && bar.id === 'all')
            const isAllUsers = bar.id === 'all'
            return (
              <View key={bar.id} style={[
                styles.labelCell,
                isActive && !isAllUsers && styles.labelCellActive
              ]}>
                <ThemedText variant="badgeLg" numberOfLines={1}>
                  <ThemedText variant="badgeLg" style={[
                    styles.groupLabel,
                    isAllUsers && styles.allUsersLabel,
                    isActive && !isAllUsers && styles.groupLabelActive
                  ]}>
                    {isAllUsers ? t('all') : bar.label}
                  </ThemedText>
                  {bar.customLabel ? (
                    <ThemedText variant="caption" style={[
                      styles.customLabel,
                      isActive && !isAllUsers && styles.customLabelActive
                    ]}> {bar.customLabel}</ThemedText>
                  ) : null}
                </ThemedText>
              </View>
            )
          })}
          {/* Vote count centered under group names */}
          {totalVotes > 0 && (
            <View style={styles.voteCountCell}>
              <ThemedText variant="caption" style={styles.voteCount}>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</ThemedText>
            </View>
          )}
        </View>

        {/* Bars column — fills remaining width, all bars equal length */}
        <View style={styles.barsColumn}>
          {bars.map((bar) => {
            const dist = bar.distribution || { agree: 0, disagree: 0, pass: 0 }
            return (
              <View key={bar.id} style={styles.barCell}>
                <VoteDistributionBar
                  distribution={dist}
                  height={20}
                  showLabels={true}
                />
              </View>
            )
          })}
          {/* Legend centered under bars */}
          <View style={styles.legendCell}>
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: SemanticColors.agree }]} />
                <ThemedText variant="caption" style={styles.legendLabel}>{t('agree')}</ThemedText>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: SemanticColors.disagree }]} />
                <ThemedText variant="caption" style={styles.legendLabel}>{t('disagree')}</ThemedText>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.pass }]} />
                <ThemedText variant="caption" style={styles.legendLabel}>{t('pass')}</ThemedText>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* View Agreements button - only show when agreements exist */}
      {onViewClosures && position.closureCount > 0 && (
        <TouchableOpacity
          style={styles.viewAgreementsButton}
          onPress={() => onViewClosures(position.id)}
        >
          <Ionicons name="chatbubbles-outline" size={14} color="#FFFFFF" />
          <ThemedText variant="badgeLg" color="inverse" style={styles.viewAgreementsText}>{t('viewAgreements')}</ThemedText>
          <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  )

  return (
    <CardShell bottomSection={statsSection}>
      <PositionInfoCard
        position={position}
        authorSubtitle="username"
        headerRight={voteBadge}
      />
    </CardShell>
  )
}

const createStyles = (colors) => StyleSheet.create({
  agreedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SemanticColors.agree,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  disagreedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SemanticColors.disagree,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  passedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeText: {
    fontWeight: '600',
  },
  // Purple stats section
  definingStatement: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  definingAgree: {
    backgroundColor: colors.definingAgreeBg,
    borderColor: SemanticColors.agree,
  },
  definingDisagree: {
    backgroundColor: colors.definingDisagreeBg,
    borderColor: SemanticColors.disagree,
  },
  definingContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  definingText: {
    flex: 1,
    fontWeight: '400',
    lineHeight: 18,
    color: colors.definingText,
  },
  definingPercent: {
    fontWeight: '700',
  },
  barsTable: {
    flexDirection: 'row',
    gap: 8,
  },
  labelsColumn: {
    gap: 6,
    justifyContent: 'flex-start',
  },
  barsColumn: {
    flex: 1,
    gap: 6,
  },
  labelCell: {
    height: 20,
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  labelCellActive: {
    backgroundColor: '#FFFFFF',
  },
  barCell: {
    height: 20,
    justifyContent: 'center',
  },
  groupLabel: {
    ...Typography.badgeLg,
    color: '#FFFFFF',
  },
  groupLabelActive: {
    fontWeight: '700',
    color: BrandColor,
  },
  allUsersLabel: {
    ...Typography.caption,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  customLabel: {
    ...Typography.caption,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  customLabelActive: {
    color: BrandColor,
  },
  voteCountCell: {
    marginTop: 8,
    alignItems: 'center',
  },
  voteCount: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  legendCell: {
    marginTop: 8,
    alignItems: 'center',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  viewAgreementsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 25,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 12,
    gap: 6,
  },
  viewAgreementsText: {
  },
})
