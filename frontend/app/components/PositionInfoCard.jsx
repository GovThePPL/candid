import { View, Text, Image, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/Colors'
import { getInitials, getInitialsColor, getTrustBadgeColor, getAvatarImageUrl } from '../lib/avatarUtils'

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
          <View style={styles.avatarContainer}>
            {(creator.avatarIconUrl || creator.avatarUrl) ? (
              <Image
                source={{ uri: getAvatarImageUrl(creator.avatarIconUrl || creator.avatarUrl) }}
                style={styles.avatarImage}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: getInitialsColor(creator.displayName) }]}>
                <Text style={styles.avatarText}>
                  {getInitials(creator.displayName)}
                </Text>
              </View>
            )}
            {creator.kudosCount > 0 && (
              <View style={[styles.kudosBadge, { backgroundColor: getTrustBadgeColor(creator.trustScore) }]}>
                <Ionicons name="star" size={10} color={Colors.primary} />
                <Text style={styles.kudosCount}>{creator.kudosCount}</Text>
              </View>
            )}
          </View>
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888888',
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
    backgroundColor: Colors.primaryMuted + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  locationText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '500',
  },
  categoryText: {
    fontSize: 12,
    color: Colors.primary,
  },
  statement: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.light.text,
    marginBottom: 12,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    marginTop: 0,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    gap: 10,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.background,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  kudosBadge: {
    position: 'absolute',
    bottom: -4,
    left: -4,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    minWidth: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  kudosCount: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  creatorInfo: {},
  creatorName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
  },
  creatorSubtitle: {
    fontSize: 11,
    color: '#888888',
    textTransform: 'capitalize',
  },
})
