import { View, Text, Image, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'

// Get initials from display name for avatar fallback
const getInitials = (name) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase()
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// Generate a consistent color from a string
const getInitialsColor = (name) => {
  if (!name) return Colors.primaryMuted
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colors = ['#5C005C', '#9B59B6', '#3498DB', '#1ABC9C', '#27AE60', '#F39C12', '#E74C3C', '#E91E63']
  return colors[Math.abs(hash) % colors.length]
}

// Get trust badge color based on trust score
const getTrustBadgeColor = (trustScore) => {
  if (trustScore == null || trustScore < 0.35) return Colors.trustBadgeGray
  if (trustScore < 0.6) return Colors.trustBadgeBronze
  if (trustScore < 0.9) return Colors.trustBadgeSilver
  return Colors.trustBadgeGold
}

// Handle avatar URL for data URIs
const getAvatarImageUrl = (url) => {
  if (!url) return null
  if (url.startsWith('data:')) return url
  return url
}

/**
 * Compact card displaying a position statement with category/location and creator
 * Used at the top of the closures page
 *
 * @param {Object} props
 * @param {Object} props.position - Position object with id, statement, category, location, creator
 */
export default function PositionSummaryCard({ position }) {
  const { statement, category, location, creator } = position

  return (
    <View style={styles.container}>
      {/* Header row with location and category */}
      <View style={styles.headerRow}>
        {location?.code && (
          <View style={styles.locationBadge}>
            <Text style={styles.locationText}>{location.code}</Text>
          </View>
        )}
        {category?.label && (
          <Text style={styles.categoryText}>{category.label}</Text>
        )}
      </View>

      {/* Position statement */}
      <Text style={styles.statement}>{statement}</Text>

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
            <Text style={styles.creatorType}>{creator.userType || 'user'}</Text>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
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
    color: '#888888',
  },
  statement: {
    fontSize: 16,
    lineHeight: 24,
    color: Colors.light.text,
    fontWeight: '500',
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    marginTop: 12,
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
  creatorType: {
    fontSize: 11,
    color: '#888888',
    textTransform: 'capitalize',
  },
})
