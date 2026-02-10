import { View, StyleSheet } from 'react-native'
import { useMemo } from 'react'
import { useThemeColors } from '../hooks/useThemeColors'
import ThemedText from './ThemedText'
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
 * @param {'compact'|'full'} [props.size='compact'] - compact: body variant, auto-height; full: statement variant, flex-centered
 * @param {Object} [props.style] - Container style override
 */
export default function PositionInfoCard({
  position,
  authorSubtitle = 'userType',
  headerRight,
  label,
  statementStyle,
  numberOfLines,
  size = 'compact',
  style,
}) {
  const colors = useThemeColors()
  const isFull = size === 'full'
  const styles = useMemo(() => createStyles(colors, isFull), [colors, isFull])

  if (!position) return null

  const { statement, category, location, creator } = position

  return (
    <View style={[styles.container, style]}>
      {/* Optional label */}
      {label && (
        <ThemedText variant="caption" color="secondary" style={styles.label}>{label}</ThemedText>
      )}

      {/* Header row: Category/Location on left, optional content on right */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {location?.code && (
            <View style={styles.locationBadge}>
              <ThemedText variant={isFull ? 'buttonSmall' : 'caption'} color="badge" style={styles.locationText}>{location.code}</ThemedText>
            </View>
          )}
          {category?.label && (
            <ThemedText variant={isFull ? 'bodySmall' : 'caption'} color="badge">{category.label}</ThemedText>
          )}
        </View>
        {headerRight}
      </View>

      {/* Position statement */}
      {isFull ? (
        <View style={styles.statementContainer}>
          <ThemedText
            variant="statement"
            style={statementStyle}
            numberOfLines={numberOfLines}
          >
            {statement}
          </ThemedText>
        </View>
      ) : (
        <ThemedText
          variant="body"
          style={[styles.statement, statementStyle]}
          numberOfLines={numberOfLines}
        >
          {statement}
        </ThemedText>
      )}

      {/* Creator info */}
      {creator && (
        <View style={styles.creatorRow}>
          <Avatar
            user={creator}
            size={isFull ? 'md' : 32}
            showKudosCount
            badgePosition="bottom-left"
          />
          <View style={styles.creatorInfo}>
            <ThemedText variant={isFull ? 'buttonSmall' : 'label'}>{creator.displayName || 'Anonymous'}</ThemedText>
            <ThemedText variant="caption" color="secondary" style={styles.creatorSubtitle}>
              {authorSubtitle === 'username'
                ? `@${creator.username || 'anonymous'}`
                : creator.userType || 'user'}
            </ThemedText>
          </View>
        </View>
      )}
    </View>
  )
}

const createStyles = (colors, isFull) => StyleSheet.create({
  container: {
    backgroundColor: colors.cardBackground,
    padding: isFull ? 20 : 16,
    ...(isFull ? { flex: 1 } : {}),
  },
  label: {
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
    fontWeight: '500',
  },
  statementContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  statement: {
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
  creatorSubtitle: {
    textTransform: 'capitalize',
  },
})
