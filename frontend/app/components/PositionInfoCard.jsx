import { View, Text, StyleSheet } from 'react-native'
import { useMemo } from 'react'
import { useThemeColors } from '../hooks/useThemeColors'
import { BrandColor } from '../constants/Colors'
import Avatar from './Avatar'

/**
 * Reusable card section displaying position info:
 * location badge, category label, statement text, and author row.
 *
 * @param {Object} props
 * @param {Object} props.position - Position object with { statement, category, location, creator }
 * @param {'userType'|'username'} [props.authorSubtitle='userType'] - What to show below creator name
 * @param {ReactNode} [props.headerRight] - Optional content on the right side of the header (e.g. vote badge)
 * @param {string} [props.label] - Optional label above the header (e.g. "Topic of Discussion")
 * @param {Object} [props.statementStyle] - Style override for the statement text
 * @param {number} [props.numberOfLines] - Optional line limit for statement
 * @param {Object} [props.style] - Container style override
 */
export default function PositionInfoCard({
  position,
  authorSubtitle = 'userType',
  headerRight,
  label,
  statementStyle,
  numberOfLines,
  style,
}) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  if (!position) return null

  const { statement, category, location, creator } = position

  return (
    <View style={[styles.container, style]}>
      {/* Optional label */}
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}

      {/* Header row: Category/Location on left, optional content on right */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {location?.code && (
            <View style={styles.locationBadge}>
              <Text style={styles.locationText}>{location.code}</Text>
            </View>
          )}
          {category?.label && (
            <Text style={styles.categoryText}>{category.label}</Text>
          )}
        </View>
        {headerRight}
      </View>

      {/* Position statement */}
      <Text
        style={[styles.statement, statementStyle]}
        numberOfLines={numberOfLines}
      >
        {statement}
      </Text>

      {/* Creator info */}
      {creator && (
        <View style={styles.creatorRow}>
          <Avatar
            user={creator}
            size={32}
            showKudosCount
            badgePosition="bottom-left"
          />
          <View style={styles.creatorInfo}>
            <Text style={styles.creatorName}>{creator.displayName || 'Anonymous'}</Text>
            <Text style={styles.creatorSubtitle}>
              {authorSubtitle === 'username'
                ? `@${creator.username || 'anonymous'}`
                : creator.userType || 'user'}
            </Text>
          </View>
        </View>
      )}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    backgroundColor: colors.cardBackground,
    padding: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.secondaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  locationBadge: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  locationText: {
    fontSize: 12,
    color: colors.badgeText,
    fontWeight: '500',
  },
  categoryText: {
    fontSize: 12,
    color: colors.badgeText,
  },
  statement: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    marginBottom: 12,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    marginTop: 0,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: 10,
  },
  creatorInfo: {},
  creatorName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  creatorSubtitle: {
    fontSize: 11,
    color: colors.secondaryText,
    textTransform: 'capitalize',
  },
})
