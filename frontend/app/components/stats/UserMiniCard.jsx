import { View, Text, StyleSheet, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import { getAvatarImageUrl, getInitials, getInitialsColor } from '../../lib/avatarUtils'

// Group colors for visualization
const GROUP_COLORS = [
  '#5C005C', // Purple (primary)
  '#9B59B6', // Light purple
  '#3498DB', // Blue
  '#2ECC71', // Green
  '#F39C12', // Orange
  '#E74C3C', // Red
  '#1ABC9C', // Teal
  '#34495E', // Dark gray
]

/**
 * Mini card displaying a user with avatar, name, opinion group, and role
 * Horizontal layout: avatar beside info text
 *
 * @param {Object} props
 * @param {Object} props.user - User info object
 * @param {string} props.role - 'PROPOSER' or 'OPPOSER'
 * @param {boolean} props.reverse - If true, avatar on right and text right-aligned
 * @param {boolean} props.compact - Use smaller layout
 */
export default function UserMiniCard({ user, role, reverse = false, compact = false }) {
  const {
    displayName,
    username,
    avatarUrl,
    avatarIconUrl,
    kudosCount = 0,
    opinionGroup,
  } = user

  const avatarImageUrl = getAvatarImageUrl(avatarIconUrl || avatarUrl)
  const avatarSize = compact ? 32 : 38
  const groupColor = opinionGroup
    ? GROUP_COLORS[parseInt(opinionGroup.id, 10) % GROUP_COLORS.length]
    : Colors.pass

  const renderAvatar = () => (
    <View style={[styles.avatarContainer, { width: avatarSize, height: avatarSize }]}>
      {avatarImageUrl ? (
        <Image
          source={{ uri: avatarImageUrl }}
          style={[styles.avatarImage, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}
        />
      ) : (
        <View
          style={[
            styles.avatar,
            {
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
              backgroundColor: getInitialsColor(displayName),
            },
          ]}
        >
          <Text style={[styles.avatarText, compact && styles.avatarTextCompact]}>
            {getInitials(displayName)}
          </Text>
        </View>
      )}
      {kudosCount > 0 && (
        <View style={styles.kudosBadge}>
          <Ionicons name="star" size={8} color="#FFFFFF" />
        </View>
      )}
    </View>
  )

  const textAlign = reverse ? 'right' : 'left'
  const badgeJustify = reverse ? 'flex-end' : 'flex-start'

  return (
    <View style={[
      styles.container,
      compact && styles.containerCompact,
      reverse && styles.containerReverse,
    ]}>
      {!reverse && renderAvatar()}
      <View style={[styles.infoContainer, { alignItems: reverse ? 'flex-end' : 'flex-start' }]}>
        <Text style={[styles.displayName, compact && styles.displayNameCompact, { textAlign }]} numberOfLines={1}>
          {displayName || 'Anonymous'}
        </Text>
        <Text style={[styles.username, compact && styles.usernameCompact, { textAlign }]} numberOfLines={1}>
          @{username}
        </Text>
        <View style={[styles.badgeRow, { justifyContent: badgeJustify }]}>
          <View style={[styles.roleBadge, role === 'PROPOSER' ? styles.proposerBadge : styles.opposerBadge]}>
            <Text style={styles.roleBadgeText}>{role}</Text>
          </View>
          {opinionGroup && (
            <View style={[styles.groupBadge, { backgroundColor: groupColor + '30' }]}>
              <Text style={[styles.groupBadgeText, { color: groupColor }]}>
                {opinionGroup.label}
              </Text>
            </View>
          )}
        </View>
      </View>
      {reverse && renderAvatar()}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  containerCompact: {
    gap: 6,
  },
  containerReverse: {
    flexDirection: 'row',
  },
  avatarContainer: {
    position: 'relative',
    flexShrink: 0,
  },
  avatarImage: {
    backgroundColor: Colors.light.background,
  },
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  avatarTextCompact: {
    fontSize: 13,
  },
  kudosBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: Colors.trustBadgeGold,
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  infoContainer: {
    flex: 1,
    minWidth: 0,
  },
  displayName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
  },
  displayNameCompact: {
    fontSize: 11,
  },
  username: {
    fontSize: 11,
    color: Colors.pass,
    marginTop: 1,
  },
  usernameCompact: {
    fontSize: 9,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 4,
    flexWrap: 'wrap',
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  proposerBadge: {
    backgroundColor: Colors.agree + '20',
  },
  opposerBadge: {
    backgroundColor: Colors.primary + '20',
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.light.text,
    letterSpacing: 0.3,
  },
  groupBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  groupBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
})
