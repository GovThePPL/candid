import { View, Image, StyleSheet } from 'react-native'
import { useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import { getInitials, getInitialsColor, getTrustBadgeColor, getAvatarImageUrl } from '../lib/avatarUtils'
import ThemedText from './ThemedText'

const SIZE_PRESETS = { sm: 28, md: 40, lg: 80 }

/**
 * Reusable avatar component with image/initials fallback and optional kudos badge.
 *
 * @param {Object} props
 * @param {Object} props.user - User object with displayName, avatarUrl, avatarIconUrl, kudosCount, trustScore
 * @param {string|number} props.size - 'sm' (28), 'md' (40), 'lg' (80), or a number
 * @param {boolean} [props.showKudosBadge=true] - Show kudos star badge when user has kudos
 * @param {boolean} [props.showKudosCount=false] - Show kudos count number in badge
 * @param {Object} [props.style] - Additional style for the container
 * @param {Object} [props.borderStyle] - Optional border styling (e.g. for proposal avatars)
 * @param {'bottom-right'|'bottom-left'} [props.badgePosition='bottom-right'] - Badge anchor corner
 */
export default function Avatar({
  user,
  size = 'md',
  showKudosBadge = true,
  showKudosCount = false,
  style,
  borderStyle,
  badgePosition = 'bottom-right',
}) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const px = typeof size === 'number' ? size : (SIZE_PRESETS[size] || SIZE_PRESETS.md)
  const displayName = user?.displayName || 'Anonymous'
  const avatarUrl = getAvatarImageUrl(user?.avatarIconUrl || user?.avatarUrl)
  const hasKudos = showKudosBadge && user?.kudosCount > 0

  // Scale font, badge, and star icon relative to avatar size
  const fontSize = px <= 20 ? px * 0.55 : px <= 32 ? px * 0.45 : px * 0.4
  const badgeSize = Math.max(14, Math.round(px * 0.4))
  const starSize = Math.max(8, Math.round(badgeSize * 0.55))

  return (
    <View style={[{ width: px, height: px, position: 'relative' }, style]}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={[
            { width: px, height: px, borderRadius: px / 2, backgroundColor: colors.background },
            borderStyle,
          ]}
        />
      ) : (
        <View
          style={[
            {
              width: px,
              height: px,
              borderRadius: px / 2,
              backgroundColor: getInitialsColor(displayName),
              justifyContent: 'center',
              alignItems: 'center',
            },
            borderStyle,
          ]}
        >
          <ThemedText color="inverse" maxFontSizeMultiplier={1.0} style={{ fontSize, fontWeight: '700' }}>
            {getInitials(displayName)}
          </ThemedText>
        </View>
      )}
      {hasKudos && (
        <View
          style={[
            styles.kudosBadge,
            badgePosition === 'bottom-left' ? styles.kudosBadgeLeft : styles.kudosBadgeRight,
            {
              minWidth: badgeSize,
              height: badgeSize,
              borderRadius: showKudosCount ? 10 : badgeSize / 2,
              backgroundColor: getTrustBadgeColor(user.trustScore),
            },
            showKudosCount && styles.kudosBadgePill,
          ]}
        >
          <Ionicons name="star" size={starSize} color={colors.primary} />
          {showKudosCount && user.kudosCount > 0 && (
            <ThemedText variant="micro" color="primary">{user.kudosCount}</ThemedText>
          )}
        </View>
      )}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  kudosBadge: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 1,
    borderWidth: 1.5,
    borderColor: colors.cardBackground,
  },
  kudosBadgeRight: {
    bottom: -2,
    right: -2,
  },
  kudosBadgeLeft: {
    bottom: -4,
    left: -4,
  },
  kudosBadgePill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
})
