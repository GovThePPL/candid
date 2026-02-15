import { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { GROUP_COLORS, SemanticColors, BrandColor, OnBrandColors } from '../constants/Colors'
import { Typography, Spacing } from '../constants/Theme'
import { useThemeColors } from '../hooks/useThemeColors'
import { formatRelativeTime } from '../lib/timeUtils'
import { ROLE_COLORS, ROLE_LABEL_KEYS } from './discuss/RoleBadge'
import ThemedText from './ThemedText'
import Avatar from './Avatar'

/**
 * Versatile user display component.
 *
 * variant="block" (default): Multi-row layout for stats context (proposer/opposer).
 * variant="inline": Single-row compact layout for author attribution.
 *
 * @param {Object} props
 * @param {Object} props.user - User info object
 * @param {'block'|'inline'} [props.variant='block']
 * @param {string} [props.role] - Stats role: 'PROPOSER' | 'OPPOSER' (block only)
 * @param {boolean} [props.reverse] - Avatar on right (block only)
 * @param {boolean} [props.compact] - Smaller layout (block only)
 * @param {'default'|'onBrand'} [props.colorScheme='default']
 * @param {string|null} [props.discussRole] - Role key for avatar indicator (admin, moderator, etc.)
 * @param {boolean} [props.showRoleBadge] - Show role title + colored username bubble (default: true when discussRole set)
 * @param {string|null} [props.timestamp] - ISO string rendered as relative time
 * @param {boolean} [props.isEdited] - Shows "(edited)" before timestamp
 * @param {boolean} [props.showAvatar] - Default true
 * @param {'sm'|'md'|number} [props.avatarSize] - Default: 14 inline, 'md' block
 * @param {boolean} [props.showKudosCount] - Default true
 * @param {React.ReactNode} [props.extras] - Extra content after badges
 * @param {string} [props.nameVariant] - ThemedText variant for name
 * @param {string|null} [props.label] - Prefix label (e.g., "Reported by")
 * @param {Object} [props.style] - Additional style for the outer container
 */

const ROLE_KEYS = { PROPOSER: 'proposer', OPPOSER: 'opposer' }

export default function UserCard({
  user,
  variant = 'block',
  // block-only props
  role,
  reverse = false,
  compact = false,
  // general props
  colorScheme = 'default',
  discussRole,
  showRoleBadge,
  timestamp,
  isEdited = false,
  showAvatar = true,
  avatarSize,
  showKudosCount = true,
  extras,
  nameVariant,
  label,
  style,
}) {
  const { t } = useTranslation('stats')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const isOnBrand = colorScheme === 'onBrand'

  if (variant === 'inline') {
    return (
      <InlineVariant
        user={user}
        isOnBrand={isOnBrand}
        discussRole={discussRole}
        showRoleBadge={showRoleBadge}
        timestamp={timestamp}
        isEdited={isEdited}
        showAvatar={showAvatar}
        avatarSize={avatarSize}
        showKudosCount={showKudosCount}
        extras={extras}
        nameVariant={nameVariant}
        label={label}
        colors={colors}
        styles={styles}
        t={t}
      />
    )
  }

  return (
    <BlockVariant
      user={user}
      role={role}
      reverse={reverse}
      compact={compact}
      isOnBrand={isOnBrand}
      discussRole={discussRole}
      showRoleBadge={showRoleBadge}
      showAvatar={showAvatar}
      avatarSize={avatarSize}
      showKudosCount={showKudosCount}
      nameVariant={nameVariant}
      label={label}
      containerStyle={style}
      colors={colors}
      styles={styles}
      t={t}
    />
  )
}

function InlineVariant({
  user,
  isOnBrand,
  discussRole,
  showRoleBadge: showRoleBadgeProp,
  timestamp,
  isEdited,
  showAvatar,
  avatarSize = 22,
  showKudosCount,
  extras,
  nameVariant = 'caption',
  label,
  colors,
  styles,
  t,
}) {
  const displayName = user?.displayName || user?.username || t('common:anonymous')
  const username = user?.username
  const relativeTime = timestamp ? formatRelativeTime(timestamp, t) : null

  const nameColor = isOnBrand ? 'inverse' : 'dark'
  const nameStyle = isOnBrand ? undefined : styles.inlineNameWeight

  const roleColor = discussRole ? ROLE_COLORS[discussRole] : null
  const shouldShowRoleBubble = (showRoleBadgeProp ?? true) && !!roleColor
  const roleLabel = shouldShowRoleBubble && ROLE_LABEL_KEYS[discussRole]
    ? t('discuss:' + ROLE_LABEL_KEYS[discussRole]) : null

  return (
    <View style={styles.inlineContainer}>
      {label && (
        <ThemedText
          variant="badgeLg"
          style={isOnBrand ? styles.inlineLabelOnBrand : styles.inlineLabel}
        >
          {label}
        </ThemedText>
      )}
      {showAvatar && (
        <Avatar
          user={user}
          size={avatarSize}
          showKudosCount={showKudosCount}
          inlineBadge
          role={discussRole}
        />
      )}
      <View style={styles.inlineTextGroup}>
        <ThemedText
          variant={nameVariant}
          color={nameColor}
          style={nameStyle}
          numberOfLines={1}
        >
          {displayName}
        </ThemedText>
        {username && shouldShowRoleBubble ? (
          <View testID="role-username-pill" style={[styles.roleUsernamePill, { backgroundColor: roleColor }]}>
            <ThemedText variant="badgeSm" style={styles.roleUsernameText}>
              @{username} · {roleLabel}
            </ThemedText>
          </View>
        ) : username ? (
          <ThemedText
            variant="caption"
            color={isOnBrand ? undefined : 'secondary'}
            style={isOnBrand ? styles.inlineUsernameOnBrand : undefined}
          >
            @{username}
          </ThemedText>
        ) : null}
        {extras}
      </View>
      {(isEdited || relativeTime) && (
        <View style={styles.inlineRight}>
          {isEdited && (
            <ThemedText
              variant="caption"
              color={isOnBrand ? undefined : 'secondary'}
              style={isOnBrand ? styles.inlineUsernameOnBrand : undefined}
            >
              {t('discuss:edited')}
            </ThemedText>
          )}
          {relativeTime && (
            <ThemedText
              variant="caption"
              color={isOnBrand ? undefined : 'secondary'}
              style={isOnBrand ? styles.inlineUsernameOnBrand : undefined}
            >
              {relativeTime}
            </ThemedText>
          )}
        </View>
      )}
    </View>
  )
}

function BlockVariant({
  user, role, reverse, compact, isOnBrand,
  discussRole, showRoleBadge: showRoleBadgeProp,
  showAvatar = true, avatarSize: avatarSizeProp, showKudosCount,
  nameVariant, label, containerStyle,
  colors, styles, t,
}) {
  const {
    displayName,
    username,
    kudosCount = 0,
    opinionGroup,
  } = user || {}

  const resolvedAvatarSize = avatarSizeProp || (compact ? 32 : 38)
  const resolvedNameVariant = nameVariant || (compact ? 'caption' : 'label')
  const groupColor = opinionGroup
    ? GROUP_COLORS[parseInt(opinionGroup.id, 10) % GROUP_COLORS.length]
    : colors.pass

  const textAlign = reverse ? 'right' : 'left'
  const badgeJustify = reverse ? 'flex-end' : 'flex-start'
  const nameColor = isOnBrand ? 'inverse' : 'dark'

  const roleColor = discussRole ? ROLE_COLORS[discussRole] : null
  const shouldShowRoleBubble = (showRoleBadgeProp ?? true) && !!roleColor
  const roleLabel = shouldShowRoleBubble && ROLE_LABEL_KEYS[discussRole]
    ? t('discuss:' + ROLE_LABEL_KEYS[discussRole]) : null

  return (
    <View style={[
      styles.blockContainer,
      compact && styles.blockContainerCompact,
      reverse && styles.blockContainerReverse,
      containerStyle,
    ]}>
      {label && (
        <ThemedText
          variant="badgeLg"
          style={isOnBrand ? styles.inlineLabelOnBrand : styles.inlineLabel}
        >
          {label}
        </ThemedText>
      )}
      {showAvatar && !reverse && (
        <Avatar
          user={user}
          size={resolvedAvatarSize}
          showKudosCount={showKudosCount}
          badgePosition="bottom-left"
          role={discussRole}
        />
      )}
      <View style={[styles.blockInfoContainer, { alignItems: reverse ? 'flex-end' : 'flex-start' }]}>
        <ThemedText
          variant={resolvedNameVariant}
          color={nameColor}
          style={[compact && resolvedNameVariant === 'caption' && styles.blockDisplayNameCompact, { textAlign }]}
          numberOfLines={1}
        >
          {displayName || t('common:anonymous')}
        </ThemedText>
        {username && shouldShowRoleBubble ? (
          <View testID="role-username-pill" style={[styles.roleUsernamePill, styles.blockUsername, { backgroundColor: roleColor }]}>
            <ThemedText variant="badgeSm" style={styles.roleUsernameText}>
              @{username} · {roleLabel}
            </ThemedText>
          </View>
        ) : username ? (
          <ThemedText
            variant="caption"
            color={isOnBrand ? undefined : 'secondary'}
            style={[styles.blockUsername, isOnBrand && styles.inlineUsernameOnBrand, { textAlign }]}
            numberOfLines={1}
          >
            @{username}
          </ThemedText>
        ) : null}
        {role && (
          <View style={[styles.blockBadgeRow, { justifyContent: badgeJustify }]}>
            <View style={[styles.blockRoleBadge, role === 'PROPOSER' ? styles.blockProposerBadge : styles.blockOpposerBadge]}>
              <ThemedText variant="badgeSm" style={styles.blockRoleBadgeText}>{t(ROLE_KEYS[role] || role)}</ThemedText>
            </View>
            {opinionGroup && (
              <View style={[styles.blockGroupBadge, { backgroundColor: groupColor + '30' }]}>
                <ThemedText variant="badge" style={{ color: groupColor }}>
                  {opinionGroup.label}
                </ThemedText>
              </View>
            )}
          </View>
        )}
      </View>
      {showAvatar && reverse && (
        <Avatar
          user={user}
          size={resolvedAvatarSize}
          showKudosCount={showKudosCount}
          badgePosition="bottom-left"
          role={discussRole}
        />
      )}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  // Inline variant
  inlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  inlineTextGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  inlineNameWeight: {
    fontWeight: '600',
  },
  inlineRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  inlineLabel: {
    ...Typography.badgeLg,
    color: colors.secondaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inlineLabelOnBrand: {
    ...Typography.badgeLg,
    color: OnBrandColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inlineUsernameOnBrand: {
    color: OnBrandColors.textTertiary,
  },
  // Role username pill
  roleUsernamePill: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  roleUsernameText: {
    color: OnBrandColors.text,
    letterSpacing: 0.3,
  },
  // Block variant
  blockContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  blockContainerCompact: {
    gap: 6,
  },
  blockContainerReverse: {
    flexDirection: 'row',
  },
  blockInfoContainer: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  blockDisplayNameCompact: {
    ...Typography.caption,
  },
  blockUsername: {
    marginTop: 1,
  },
  blockBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 4,
    flexWrap: 'wrap',
  },
  blockRoleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  blockProposerBadge: {
    backgroundColor: SemanticColors.agree + '20',
  },
  blockOpposerBadge: {
    backgroundColor: BrandColor + '25',
  },
  blockRoleBadgeText: {
    letterSpacing: 0.3,
  },
  blockGroupBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
})
