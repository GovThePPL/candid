import { View, Text, StyleSheet } from 'react-native'
import { Colors } from '../../constants/Colors'

/**
 * Horizontal stacked bar showing vote distribution (agree/pass/disagree)
 *
 * @param {Object} props
 * @param {Object} props.distribution - { agree: 0-1, pass: 0-1, disagree: 0-1 }
 * @param {boolean} props.showLabels - Whether to show percentage labels
 * @param {number} props.height - Bar height in pixels
 * @param {boolean} props.hideUnanswered - If true, hide unanswered segment and scale votes to fill bar
 */
export default function VoteDistributionBar({
  distribution = { agree: 0, pass: 0, disagree: 0 },
  showLabels = true,
  height = 24,
  hideUnanswered = false,
}) {
  const { agree = 0, pass = 0, disagree = 0 } = distribution

  // Calculate total answered
  const total = agree + pass + disagree

  // When hiding unanswered, scale percentages to 100% of answered votes
  // Otherwise use raw values (which may not add to 100%)
  let displayAgree, displayDisagree, displayPass
  if (hideUnanswered && total > 0) {
    displayAgree = agree / total
    displayDisagree = disagree / total
    displayPass = pass / total
  } else {
    displayAgree = agree
    displayDisagree = disagree
    displayPass = pass
  }

  // Calculate percentages for labels
  const agreePercent = Math.round(displayAgree * 100)
  const passPercent = Math.round(displayPass * 100)
  const disagreePercent = Math.round(displayDisagree * 100)

  // Calculate unanswered (when totals don't add to 100%)
  const unanswered = hideUnanswered ? 0 : Math.max(0, 1 - total)
  const unansweredPercent = Math.round(unanswered * 100)

  // Show label if segment is at least 12% wide (enough for "XX%")
  const showAgreeLabel = agreePercent >= 12
  const showPassLabel = passPercent >= 12
  const showDisagreeLabel = disagreePercent >= 12
  const showUnansweredLabel = unansweredPercent >= 12

  // If no votes at all, show empty bar
  if (total === 0) {
    return (
      <View style={styles.container}>
        <View style={[styles.bar, { height }]}>
          <View style={[styles.segment, styles.unansweredSegment, { flex: 1 }]}>
            {showLabels && (
              <Text style={[styles.segmentLabel, styles.unansweredLabel]}>No votes</Text>
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
              <Text style={styles.segmentLabel}>{agreePercent}%</Text>
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
              <Text style={styles.segmentLabel}>{disagreePercent}%</Text>
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
              <Text style={[styles.segmentLabel, styles.passLabel]}>{passPercent}%</Text>
            )}
          </View>
        )}
        {unansweredPercent > 0 && !hideUnanswered && (
          <View
            style={[
              styles.segment,
              styles.unansweredSegment,
              { flex: unanswered },
            ]}
          >
            {showLabels && showUnansweredLabel && (
              <Text style={[styles.segmentLabel, styles.unansweredLabel]}>
                {unansweredPercent}%
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
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
    backgroundColor: Colors.agree,
  },
  passSegment: {
    backgroundColor: Colors.pass,
  },
  disagreeSegment: {
    backgroundColor: Colors.disagree,
  },
  unansweredSegment: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  segmentLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.white,
  },
  passLabel: {
    color: '#666666',
  },
  unansweredLabel: {
    color: '#999999',
  },
})
