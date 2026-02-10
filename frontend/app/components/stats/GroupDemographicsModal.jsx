import { useState, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native'
import Svg, { Path, G } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { SemanticColors } from '../../constants/Colors'
import { useThemeColors } from '../../hooks/useThemeColors'
import BottomDrawerModal from '../BottomDrawerModal'
import LoadingView from '../LoadingView'
import EmptyState from '../EmptyState'

// Labels for demographic categories
const LEAN_LABELS = {
  very_liberal: 'Very Liberal',
  liberal: 'Liberal',
  moderate: 'Moderate',
  conservative: 'Conservative',
  very_conservative: 'Very Conservative',
}

const EDUCATION_LABELS = {
  less_than_high_school: 'Less than HS',
  high_school: 'High School',
  some_college: 'Some College',
  associates: 'Associate\'s',
  bachelors: 'Bachelor\'s',
  masters: 'Master\'s',
  doctorate: 'Doctorate',
  professional: 'Professional',
}

const GEO_LOCALE_LABELS = {
  urban: 'Urban',
  suburban: 'Suburban',
  rural: 'Rural',
}

const SEX_LABELS = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
}

const AGE_RANGE_LABELS = {
  '18-24': '18-24',
  '25-34': '25-34',
  '35-44': '35-44',
  '45-54': '45-54',
  '55-64': '55-64',
  '65+': '65+',
}

const RACE_LABELS = {
  white: 'White',
  black: 'Black',
  hispanic: 'Hispanic/Latino',
  asian: 'Asian',
  native_american: 'Native American',
  pacific_islander: 'Pacific Islander',
  multiracial: 'Multiracial',
  other: 'Other',
}

const INCOME_RANGE_LABELS = {
  under_25k: 'Under $25K',
  '25k-50k': '$25K-$50K',
  '50k-75k': '$50K-$75K',
  '75k-100k': '$75K-$100K',
  '100k-150k': '$100K-$150K',
  '150k-200k': '$150K-$200K',
  over_200k: 'Over $200K',
}

// Sort orders for ordinal demographics
const EDUCATION_ORDER = [
  'less_than_high_school',
  'high_school',
  'some_college',
  'associates',
  'bachelors',
  'masters',
  'doctorate',
  'professional',
]

const AGE_RANGE_ORDER = [
  '18-24',
  '25-34',
  '35-44',
  '45-54',
  '55-64',
  '65+',
]

const INCOME_RANGE_ORDER = [
  'under_25k',
  '25k-50k',
  '50k-75k',
  '75k-100k',
  '100k-150k',
  '150k-200k',
  'over_200k',
]

// Colors for pie slices
const PIE_COLORS = [
  '#5C005C', // Primary purple
  '#9B59B6', // Light purple
  '#3498DB', // Blue
  '#2ECC71', // Green
  '#F39C12', // Orange
  '#E74C3C', // Red
  '#1ABC9C', // Teal
  '#34495E', // Dark gray
  '#8E44AD', // Violet
  '#16A085', // Dark teal
]

/**
 * Calculate SVG arc path for a pie slice
 */
function describeArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle)
  const end = polarToCartesian(cx, cy, radius, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'

  return [
    'M', cx, cy,
    'L', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
    'Z'
  ].join(' ')
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180
  return {
    x: cx + (radius * Math.cos(angleInRadians)),
    y: cy + (radius * Math.sin(angleInRadians))
  }
}

/**
 * Pie chart component
 */
function PieChart({ data, size = 100 }) {
  const radius = size / 2
  const cx = radius
  const cy = radius

  const total = data.reduce((sum, item) => sum + item.value, 0)
  if (total === 0) return null

  let currentAngle = 0
  const slices = data.map((item, index) => {
    const sliceAngle = (item.value / total) * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + sliceAngle
    currentAngle = endAngle

    // For very small slices, skip rendering
    if (sliceAngle < 1) return null

    // For full circle (100%), adjust slightly to render properly
    const adjustedEnd = sliceAngle >= 359.9 ? endAngle - 0.1 : endAngle

    return (
      <Path
        key={item.key}
        d={describeArc(cx, cy, radius - 2, startAngle, adjustedEnd)}
        fill={PIE_COLORS[index % PIE_COLORS.length]}
      />
    )
  })

  return (
    <Svg width={size} height={size}>
      <G>
        {slices}
      </G>
    </Svg>
  )
}

/**
 * Legend item for pie chart
 */
function LegendItem({ color, label, count, percentage, colors }) {
  return (
    <View style={legendStyles.legendItem}>
      <View style={[legendStyles.legendDot, { backgroundColor: color }]} />
      <Text style={[legendStyles.legendLabel, { color: colors.text }]} numberOfLines={1}>{label}</Text>
      <Text style={[legendStyles.legendValue, { color: colors.secondaryText }]}>{count} ({percentage}%)</Text>
    </View>
  )
}

// Static legend styles (don't depend on theme)
const legendStyles = StyleSheet.create({
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendLabel: {
    flex: 1,
    fontSize: 14,
  },
  legendValue: {
    fontSize: 13,
    marginLeft: 4,
  },
})

/**
 * Section showing a demographic category with pie chart
 * @param {string} title - Section title
 * @param {Object} data - Data object with category keys and counts
 * @param {Object} labels - Label mapping for category keys
 * @param {number} total - Total count
 * @param {Array} sortOrder - Optional array of keys in desired order
 */
function DemographicSection({ title, data, labels, total, sortOrder, colors }) {
  const entries = Object.entries(data || {})
  if (entries.length === 0) {
    return (
      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12 }}>{title}</Text>
        <Text style={{ fontSize: 14, color: colors.secondaryText, fontStyle: 'italic' }}>No data available</Text>
      </View>
    )
  }

  // Sort entries by specified order if provided, otherwise by count descending
  if (sortOrder) {
    entries.sort((a, b) => {
      const indexA = sortOrder.indexOf(a[0])
      const indexB = sortOrder.indexOf(b[0])
      // Items not in sortOrder go to the end
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })
  } else {
    entries.sort((a, b) => b[1] - a[1])
  }

  // Prepare data for pie chart
  const pieData = entries.map(([key, count]) => ({
    key,
    value: count,
    label: labels[key] || key,
  }))

  const sectionTotal = entries.reduce((sum, [, count]) => sum + count, 0)

  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12 }}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ marginRight: 16 }}>
          <PieChart data={pieData} size={100} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          {entries.map(([key, count], index) => (
            <LegendItem
              key={key}
              color={PIE_COLORS[index % PIE_COLORS.length]}
              label={labels[key] || key}
              count={count}
              percentage={sectionTotal > 0 ? Math.round((count / sectionTotal) * 100) : 0}
              colors={colors}
            />
          ))}
        </View>
      </View>
    </View>
  )
}

/**
 * Modal showing demographic breakdown for an opinion group
 */
export default function GroupDemographicsModal({
  visible,
  onClose,
  locationId,
  categoryId,
  groupId,
  groupLabel,
  labelRankings,
  fetchDemographics,
}) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  useEffect(() => {
    if (visible && locationId && categoryId && groupId !== undefined) {
      loadDemographics()
    }
  }, [visible, locationId, categoryId, groupId])

  const loadDemographics = async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await fetchDemographics(locationId, categoryId, groupId)
      setData(result)
    } catch (err) {
      console.error('Error fetching demographics:', err)
      setError(err.message || 'Failed to load demographics')
    } finally {
      setLoading(false)
    }
  }

  const displayLabel = data?.groupLabel || groupLabel || 'Group'
  const memberCount = data?.memberCount || 0
  const respondentCount = data?.respondentCount || 0

  return (
    <BottomDrawerModal
      visible={visible}
      onClose={onClose}
      title={`${groupId === 'all' ? 'All Groups' : `Group ${displayLabel}`} Demographics`}
      subtitle={`${respondentCount} of ${memberCount} members have demographic data`}
    >
          {/* Content */}
          {loading ? (
            <LoadingView message="Loading demographics..." />
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={48} color={SemanticColors.disagree} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={loadDemographics}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : respondentCount === 0 ? (
            <EmptyState
              icon="people-outline"
              title="No demographic data available for this group yet."
            />
          ) : (
            <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {/* Group Identity Rankings */}
              {labelRankings && labelRankings.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Group Identity</Text>
                  <View style={styles.identityRankingList}>
                    {labelRankings.map((item, index) => (
                      <View
                        key={item.label}
                        style={[
                          styles.identityRankingItem,
                          index === labelRankings.length - 1 && styles.identityRankingItemLast
                        ]}
                      >
                        <View style={styles.identityRankingLeft}>
                          {item.isCondorcetWinner && (
                            <Ionicons name="trophy" size={14} color={colors.primary} style={{ marginRight: 4 }} />
                          )}
                          <Text style={styles.identityRankingRank}>{index + 1}.</Text>
                          <Text style={[
                            styles.identityRankingLabel,
                            index === 0 && styles.identityRankingLabelTop
                          ]}>
                            {item.label}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              <DemographicSection
                title="Political Lean"
                data={data?.lean}
                labels={LEAN_LABELS}
                total={respondentCount}
                colors={colors}
              />
              <DemographicSection
                title="Education"
                data={data?.education}
                labels={EDUCATION_LABELS}
                total={respondentCount}
                sortOrder={EDUCATION_ORDER}
                colors={colors}
              />
              <DemographicSection
                title="Geographic Location"
                data={data?.geoLocale}
                labels={GEO_LOCALE_LABELS}
                total={respondentCount}
                colors={colors}
              />
              <DemographicSection
                title="Sex"
                data={data?.sex}
                labels={SEX_LABELS}
                total={respondentCount}
                colors={colors}
              />
              <DemographicSection
                title="Age"
                data={data?.ageRange}
                labels={AGE_RANGE_LABELS}
                total={respondentCount}
                sortOrder={AGE_RANGE_ORDER}
                colors={colors}
              />
              <DemographicSection
                title="Race/Ethnicity"
                data={data?.race}
                labels={RACE_LABELS}
                total={respondentCount}
                colors={colors}
              />
              <DemographicSection
                title="Income"
                data={data?.incomeRange}
                labels={INCOME_RANGE_LABELS}
                total={respondentCount}
                sortOrder={INCOME_RANGE_ORDER}
                colors={colors}
              />
              <View style={styles.bottomPadding} />
            </ScrollView>
          )}
    </BottomDrawerModal>
  )
}

const createStyles = (colors) => StyleSheet.create({
  scrollContent: {
    flex: 1,
    padding: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  errorText: {
    fontSize: 14,
    color: SemanticColors.disagree,
    textAlign: 'center',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  bottomPadding: {
    height: 24,
  },
  identityRankingList: {
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  identityRankingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  identityRankingItemLast: {
    borderBottomWidth: 0,
  },
  identityRankingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  identityRankingRank: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.secondaryText,
    width: 24,
  },
  identityRankingLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  identityRankingLabelTop: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  identityRankingVotes: {
    fontSize: 14,
    color: colors.secondaryText,
  },
})
