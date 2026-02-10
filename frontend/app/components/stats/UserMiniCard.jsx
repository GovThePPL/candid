import { useMemo } from 'react'
import { View, StyleSheet, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { GROUP_COLORS, BadgeColors, SemanticColors, BrandColor } from '../../constants/Colors'
import { Typography } from '../../constants/Theme'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../ThemedText'
import { getAvatarImageUrl, getInitials, getInitialsColor } from '../../lib/avatarUtils'

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
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

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
    : colors.pass

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
          <ThemedText variant={compact ? "label" : "h3"} color="inverse" style={styles.avatarText}>
            {getInitials(displayName)}
          </ThemedText>
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
        <ThemedText variant="label" style={[styles.displayName, compact && styles.displayNameCompact, { textAlign }]} numberOfLines={1}>
          {displayName || 'Anonymous'}
        </ThemedText>
        <ThemedText variant="caption" color="secondary" style={[styles.username, { textAlign }]} numberOfLines={1}>
          @{username}
        </ThemedText>
        <View style={[styles.badgeRow, { justifyContent: badgeJustify }]}>
          <View style={[styles.roleBadge, role === 'PROPOSER' ? styles.proposerBadge : styles.opposerBadge]}>
            <ThemedText variant="badgeSm" style={styles.roleBadgeText}>{role}</ThemedText>
          </View>
          {opinionGroup && (
            <View style={[styles.groupBadge, { backgroundColor: groupColor + '30' }]}>
              <ThemedText variant="badge" style={[styles.groupBadgeText, { color: groupColor }]}>
                {opinionGroup.label}
              </ThemedText>
            </View>
          )}
        </View>
      </View>
      {reverse && renderAvatar()}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
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
    backgroundColor: colors.background,
  },
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontWeight: '700',
  },
  kudosBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: BadgeColors.trustBadgeGold,
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.cardBackground,
  },
  infoContainer: {
    flex: 1,
    minWidth: 0,
  },
  displayName: {
  },
  displayNameCompact: {
    ...Typography.caption,
  },
  username: {
    marginTop: 1,
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
    backgroundColor: SemanticColors.agree + '20',
  },
  opposerBadge: {
    backgroundColor: BrandColor + '25',
  },
  roleBadgeText: {
    letterSpacing: 0.3,
  },
  groupBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  groupBadgeText: {
  },
})
