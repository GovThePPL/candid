import { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { SemanticColors } from '../../constants/Colors'
import { Typography } from '../../constants/Theme'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../ThemedText'

/**
 * Horizontal stacked bar showing vote distribution (agree/pass/disagree)
 *
 * @param {Object} props
 * @param {Object} props.distribution - { agree: 0-1, pass: 0-1, disagree: 0-1 }
 * @param {boolean} props.showLabels - Whether to show percentage labels
 * @param {number} props.height - Bar height in pixels
 */
export default function VoteDistributionBar({
  distribution = { agree: 0, pass: 0, disagree: 0 },
  showLabels = true,
  height = 24,
}) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const { agree = 0, pass = 0, disagree = 0 } = distribution

  // Calculate total answered and scale to fill bar
  const total = agree + pass + disagree

  const displayAgree = total > 0 ? agree / total : 0
  const displayDisagree = total > 0 ? disagree / total : 0
  const displayPass = total > 0 ? pass / total : 0

  // Calculate percentages for labels
  const agreePercent = Math.round(displayAgree * 100)
  const passPercent = Math.round(displayPass * 100)
  const disagreePercent = Math.round(displayDisagree * 100)

  // Show label if segment is at least 12% wide (enough for "XX%")
  const showAgreeLabel = agreePercent >= 12
  const showPassLabel = passPercent >= 12
  const showDisagreeLabel = disagreePercent >= 12

  // If no votes at all, show empty bar
  if (total === 0) {
    return (
      <View style={styles.container}>
        <View style={[styles.bar, { height }]}>
          <View style={[styles.segment, styles.emptySegment, { flex: 1 }]}>
            {showLabels && (
              <ThemedText variant="badge" color="secondary" style={styles.segmentLabel}>No votes</ThemedText>
            )}
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.bar, { height }]}>
        {agreePercent > 0 && (
          <View
            style={[
              styles.segment,
              styles.agreeSegment,
              { flex: displayAgree },
            ]}
          >
            {showLabels && showAgreeLabel && (
              <ThemedText variant="badge" color="inverse" style={styles.segmentLabel}>{agreePercent}%</ThemedText>
            )}
          </View>
        )}
        {disagreePercent > 0 && (
          <View
            style={[
              styles.segment,
              styles.disagreeSegment,
              { flex: displayDisagree },
            ]}
          >
            {showLabels && showDisagreeLabel && (
              <ThemedText variant="badge" color="inverse" style={styles.segmentLabel}>{disagreePercent}%</ThemedText>
            )}
          </View>
        )}
        {passPercent > 0 && (
          <View
            style={[
              styles.segment,
              styles.passSegment,
              { flex: displayPass },
            ]}
          >
            {showLabels && showPassLabel && (
              <ThemedText variant="badge" color="secondary" style={styles.segmentLabel}>{passPercent}%</ThemedText>
            )}
          </View>
        )}
      </View>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    width: '100%',
  },
  bar: {
    flexDirection: 'row',
    borderRadius: 4,
    overflow: 'hidden',
  },
  segment: {
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 2,
  },
  agreeSegment: {
    backgroundColor: SemanticColors.agree,
  },
  passSegment: {
    backgroundColor: colors.pass,
  },
  disagreeSegment: {
    backgroundColor: SemanticColors.disagree,
  },
  emptySegment: {
    backgroundColor: colors.border,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  segmentLabel: {
    fontWeight: '600',
  },
})
