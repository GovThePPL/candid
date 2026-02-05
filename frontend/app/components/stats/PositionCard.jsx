import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
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
  const {
    voteDistribution,
    totalVotes = 0,
    groupVotes = {},
    isDefining,
    groupId: definingGroupId,
    consensusType,
    consensusScore,
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

  // For majority view with consensus, use consensusScore; otherwise use vote distribution
  let agreePercent, disagreePercent
  if (activeGroup === 'majority' && consensusType != null && consensusScore != null) {
    // Consensus score is the percentage who voted this way
    const consensusPercent = Math.round(consensusScore * 100)
    if (consensusType === 'agree') {
      agreePercent = consensusPercent
      disagreePercent = 0
    } else {
      agreePercent = 0
      disagreePercent = consensusPercent
    }
  } else {
    agreePercent = Math.round((activeVotes.agree || 0) * 100)
    disagreePercent = Math.round((activeVotes.disagree || 0) * 100)
  }

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
  const showAgree = activeGroup === 'majority' && consensusType != null
    ? consensusType === 'agree'
    : agreePercent >= disagreePercent

  // Build list of bars to show: "All Users" + each group
  const bars = [
    { id: 'all', label: 'All', customLabel: null, distribution: voteDistribution },
    ...groups.map(g => ({
      id: g.id,
      label: g.label,
      customLabel: g.labelRankings?.[0]?.label || null,
      distribution: groupVotes[g.id] || { agree: 0, disagree: 0, pass: 0 },
    })),
  ]

  // Check if any group has >30% answered (agree + disagree + pass > 0.3)
  // If not, hide the unanswered section and show total vote count instead
  const hasSignificantVotes = bars.some(bar => {
    const dist = bar.distribution || { agree: 0, disagree: 0, pass: 0 }
    const answered = (dist.agree || 0) + (dist.disagree || 0) + (dist.pass || 0)
    return answered > 0.3
  })
  const hideUnanswered = !hasSignificantVotes && totalVotes > 0

  // Build vote badge for header right
  const voteBadge = userVote ? (
    <View>
      {userVote === 'agree' && (
        <View style={styles.agreedBadge}>
          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
          <Text style={styles.badgeText}>You Agreed</Text>
        </View>
      )}
      {userVote === 'disagree' && (
        <View style={styles.disagreedBadge}>
          <Ionicons name="close" size={12} color="#FFFFFF" />
          <Text style={styles.badgeText}>You Disagreed</Text>
        </View>
      )}
      {userVote === 'pass' && (
        <View style={styles.passedBadge}>
          <Ionicons name="remove" size={12} color="#666666" />
          <Text style={[styles.badgeText, { color: '#666666' }]}>You Passed</Text>
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
              <Ionicons name="checkmark-circle" size={20} color={Colors.agree} />
              <Text style={styles.definingText}>
                <Text style={[styles.definingPercent, { color: Colors.agree }]}>{agreePercent}%</Text>
                {activeGroup === 'majority'
                  ? ' of all users who voted on this statement agreed.'
                  : ` of those in Group ${activeGroupLabel} who voted on this statement agreed.`}
              </Text>
            </View>
          ) : (
            <View style={styles.definingContent}>
              <Ionicons name="close-circle" size={20} color={Colors.disagree} />
              <Text style={styles.definingText}>
                <Text style={[styles.definingPercent, { color: Colors.disagree }]}>{disagreePercent}%</Text>
                {activeGroup === 'majority'
                  ? ' of all users who voted on this statement disagreed.'
                  : ` of those in Group ${activeGroupLabel} who voted on this statement disagreed.`}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Vote distribution bars for each group */}
      <View style={styles.barsContainer}>
        {bars.map((bar) => {
          const isActive = bar.id === activeGroup || (activeGroup === 'majority' && bar.id === 'all') || (activeGroup === 'my_positions' && bar.id === 'all')
          const isAllUsers = bar.id === 'all'
          const dist = bar.distribution || { agree: 0, disagree: 0, pass: 0 }

          return (
            <View key={bar.id} style={styles.barRow}>
              {/* Group label with optional highlight background */}
              <View style={[
                styles.labelContainer,
                isActive && !isAllUsers && styles.labelContainerActive
              ]}>
                <Text style={[
                  styles.groupLabel,
                  isAllUsers && styles.allUsersLabel,
                  isActive && !isAllUsers && styles.groupLabelActive
                ]}>
                  {isAllUsers ? 'All' : bar.label}
                </Text>
                {bar.customLabel && (
                  <Text
                    style={[
                      styles.customLabel,
                      isActive && !isAllUsers && styles.customLabelActive
                    ]}
                    numberOfLines={1}
                  >
                    {bar.customLabel}
                  </Text>
                )}
              </View>

              {/* Vote distribution bar */}
              <View style={styles.barWrapper}>
                <VoteDistributionBar
                  distribution={dist}
                  height={20}
                  showLabels={true}
                  hideUnanswered={hideUnanswered}
                />
              </View>
            </View>
          )
        })}
      </View>

      {/* Legend and vote count */}
      <View style={styles.legendRow}>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.agree }]} />
            <Text style={styles.legendLabel}>Agree</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.disagree }]} />
            <Text style={styles.legendLabel}>Disagree</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.pass }]} />
            <Text style={styles.legendLabel}>Pass</Text>
          </View>
          {!hideUnanswered && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.unansweredDot]} />
              <Text style={styles.legendLabel}>Unanswered</Text>
            </View>
          )}
        </View>
        {(activeGroup === 'my_positions' || hideUnanswered) && totalVotes > 0 && (
          <Text style={styles.voteCount}>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</Text>
        )}
      </View>

      {/* View Closures button - only show when closures exist */}
      {onViewClosures && position.closureCount > 0 && (
        <TouchableOpacity
          style={styles.viewClosuresButton}
          onPress={() => onViewClosures(position.id)}
        >
          <Ionicons name="chatbubbles-outline" size={14} color="#FFFFFF" />
          <Text style={styles.viewClosuresText}>View Closures</Text>
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

const styles = StyleSheet.create({
  agreedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.agree,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  disagreedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.disagree,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  passedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Purple stats section
  definingStatement: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  definingAgree: {
    backgroundColor: '#C8E6C9',
    borderColor: Colors.agree,
  },
  definingDisagree: {
    backgroundColor: '#FFCDD2',
    borderColor: Colors.disagree,
  },
  definingContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  definingText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#000000',
  },
  definingPercent: {
    fontWeight: '700',
  },
  barsContainer: {
    gap: 6,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  labelContainer: {
    width: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  labelContainerActive: {
    backgroundColor: '#FFFFFF',
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  groupLabelActive: {
    fontWeight: '700',
    color: Colors.primary,
  },
  customLabel: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.8)',
    flex: 1,
  },
  customLabelActive: {
    color: Colors.primary,
  },
  allUsersLabel: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  barWrapper: {
    flex: 1,
  },
  legendRow: {
    position: 'relative',
    marginTop: 12,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  voteCount: {
    position: 'absolute',
    right: 0,
    top: 0,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.8)',
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
  unansweredDot: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  legendLabel: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  viewClosuresButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 12,
    gap: 6,
  },
  viewClosuresText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
