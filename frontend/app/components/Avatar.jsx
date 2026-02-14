import { View, Image, StyleSheet } from 'react-native'
import { memo, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../hooks/useThemeColors'
import { OnBrandColors } from '../constants/Colors'
import { getInitials, getInitialsColor, getTrustBadgeInfo, getAvatarImageUrl } from '../lib/avatarUtils'
import { ROLE_COLORS, ROLE_LETTERS } from './discuss/RoleBadge'
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
 * @param {boolean} [props.inlineBadge=false] - Render badge side-by-side with avatar instead of overlaid
 * @param {string|null} [props.role] - User role (admin, moderator, etc.) — renders colored circle indicator
 * @param {Object} [props.style] - Additional style for the container
 * @param {Object} [props.borderStyle] - Optional border styling (e.g. for proposal avatars)
 * @param {'bottom-right'|'bottom-left'} [props.badgePosition='bottom-right'] - Badge anchor corner (overlay only)
 */
export default memo(function Avatar({
  user,
  size = 'md',
  showKudosBadge = true,
  showKudosCount = false,
  inlineBadge = false,
  role,
  style,
  borderStyle,
  badgePosition = 'bottom-right',
}) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const px = typeof size === 'number' ? size : (SIZE_PRESETS[size] || SIZE_PRESETS.md)
  const displayName = user?.displayName || t('common:anonymous')
  const avatarUrl = getAvatarImageUrl(user?.avatarIconUrl || user?.avatarUrl)
  const hasKudos = user?.kudosCount > 0
  const { color: badgeColor, tier: trustTier } = getTrustBadgeInfo(user?.trustScore)
  // Purple (lowest) tier only shows when user has kudos; bronze/silver/gold always show
  const showBadge = showKudosBadge && (trustTier !== 'purple' || hasKudos)
  const starColor = trustTier === 'purple' ? OnBrandColors.text : colors.primary

  // Scale font, badge, and star icon relative to avatar size
  const fontSize = px <= 20 ? px * 0.55 : px <= 32 ? px * 0.45 : px * 0.4
  const inlineIndicatorSize = Math.min(px, 14)
  const badgeSize = inlineBadge ? inlineIndicatorSize : Math.min(20, Math.max(14, Math.round(px * 0.4)))
  const starSize = inlineBadge ? Math.max(8, Math.round(inlineIndicatorSize * 0.55)) : Math.max(8, Math.round(badgeSize * 0.55))

  // Role indicator sizing
  const roleColor = role ? ROLE_COLORS[role] : null
  const roleLetter = role ? ROLE_LETTERS[role] : null

  const avatarCircle = avatarUrl ? (
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
  )

  const badge = showBadge ? (
    <View
      style={[
        !inlineBadge && styles.kudosBadgeOverlay,
        !inlineBadge && (badgePosition === 'bottom-left' ? styles.kudosBadgeLeft : styles.kudosBadgeRight),
        {
          minWidth: badgeSize,
          height: badgeSize,
          borderRadius: badgeSize / 2,
          backgroundColor: badgeColor,
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'row',
          gap: 1,
        },
        showKudosCount && hasKudos && styles.kudosBadgePill,
      ]}
    >
      <Ionicons name="star" size={starSize} color={starColor} />
      {showKudosCount && hasKudos && (
        <ThemedText variant="micro" style={{ color: starColor }}>{user.kudosCount}</ThemedText>
      )}
    </View>
  ) : null

  // Role circle indicator
  const roleCircle = roleColor && roleLetter ? (() => {
    if (inlineBadge) {
      // Inline mode: capped to keep indicators compact
      const inlineCircleSize = inlineIndicatorSize
      const inlineFontSize = Math.round(inlineCircleSize * 0.58)
      return (
        <View
          testID="role-overlay"
          accessibilityLabel={t('roleOverlayA11y', { role })}
          style={{
            width: inlineCircleSize,
            height: inlineCircleSize,
            borderRadius: inlineCircleSize / 2,
            backgroundColor: roleColor,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <ThemedText
            color="inverse"
            maxFontSizeMultiplier={1.0}
            style={{ fontSize: inlineFontSize, fontWeight: '700' }}
          >
            {roleLetter}
          </ThemedText>
        </View>
      )
    }
    // Block (overlay) mode: smaller circle at top-right
    const circleSize = Math.min(22, Math.max(14, Math.round(px * 0.42)))
    const letterFontSize = Math.round(circleSize * 0.58)
    return (
      <View
        testID="role-overlay"
        accessibilityLabel={t('roleOverlayA11y', { role })}
        style={[
          styles.roleOverlay,
          {
            width: circleSize,
            height: circleSize,
            borderRadius: circleSize / 2,
            backgroundColor: roleColor,
            borderWidth: 1.5,
            borderColor: colors.cardBackground,
          },
        ]}
      >
        <ThemedText
          color="inverse"
          maxFontSizeMultiplier={1.0}
          style={{ fontSize: letterFontSize, fontWeight: '700' }}
        >
          {roleLetter}
        </ThemedText>
      </View>
    )
  })() : null

  if (inlineBadge) {
    return (
      <View style={[styles.inlineContainer, style]}>
        {avatarCircle}
        {roleCircle}
        {badge}
      </View>
    )
  }

  return (
    <View style={[{ width: px, height: px, position: 'relative' }, style]}>
      {avatarCircle}
      {roleCircle}
      {badge}
    </View>
  )
})

const createStyles = (colors) => StyleSheet.create({
  inlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  kudosBadgeOverlay: {
    position: 'absolute',
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
  roleOverlay: {
    position: 'absolute',
    top: -2,
    right: -2,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
