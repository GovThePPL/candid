import { useMemo, useCallback } from 'react'
import { View, TouchableOpacity, FlatList, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius } from '../../constants/Theme'
import ThemedText from '../ThemedText'

const ROLE_ENTRIES = [
  { username: 'admin', isRole: true, icon: 'shield' },
  { username: 'moderator', isRole: true, icon: 'shield-half' },
  { username: 'facilitator', isRole: true, icon: 'people' },
  { username: 'liaison', isRole: true, icon: 'link' },
  { username: 'expert', isRole: true, icon: 'school' },
]

const ROLE_I18N_KEYS = {
  admin: 'mentionRoleAdmin',
  moderator: 'mentionRoleModerator',
  facilitator: 'mentionRoleFacilitator',
  liaison: 'mentionRoleLiaison',
  expert: 'mentionRoleExpert',
}

/**
 * Dropdown autocomplete for @mentions. Shows role entries at top + thread participants.
 *
 * @param {boolean} visible - Whether the dropdown is shown
 * @param {string} query - Current search query (text after @, lowercase)
 * @param {Array} participants - Array of {id, username, displayName, avatarIconUrl}
 * @param {Function} onSelect - Called with username string when an item is selected
 * @param {Function} onDismiss - Called when the dropdown should close
 */
export default function MentionAutocomplete({ visible, query, participants, onSelect, onDismiss }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const filteredItems = useMemo(() => {
    if (!visible) return []
    const q = (query || '').toLowerCase()

    // Filter role entries
    const roles = ROLE_ENTRIES.filter(r =>
      r.username.startsWith(q)
    ).map(r => ({
      ...r,
      key: `role-${r.username}`,
      label: t(ROLE_I18N_KEYS[r.username]),
      desc: t('mentionRoleDesc', { role: t(ROLE_I18N_KEYS[r.username]).toLowerCase() }),
    }))

    // Filter participants
    const users = (participants || []).filter(p => {
      const un = (p.username || '').toLowerCase()
      const dn = (p.displayName || '').toLowerCase()
      return un.startsWith(q) || dn.startsWith(q)
    }).map(p => ({
      ...p,
      key: `user-${p.id}`,
      isRole: false,
    }))

    return [...roles, ...users]
  }, [visible, query, participants, t])

  const handleSelect = useCallback((item) => {
    onSelect(item.username)
  }, [onSelect])

  if (!visible || filteredItems.length === 0) return null

  const renderItem = ({ item }) => {
    if (item.isRole) {
      return (
        <TouchableOpacity
          style={styles.item}
          onPress={() => handleSelect(item)}
          accessibilityRole="button"
          accessibilityLabel={t('mentionA11y', { name: `@${item.username}` })}
        >
          <View style={styles.roleIcon}>
            <Ionicons name={item.icon} size={16} color={colors.primary} />
          </View>
          <View style={styles.itemText}>
            <ThemedText variant="label" color="primary">@{item.username}</ThemedText>
            <ThemedText variant="caption" color="secondary">{item.desc}</ThemedText>
          </View>
        </TouchableOpacity>
      )
    }

    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => handleSelect(item)}
        accessibilityRole="button"
        accessibilityLabel={t('mentionA11y', { name: item.displayName || item.username })}
      >
        <View style={styles.avatar}>
          <ThemedText variant="caption" color="secondary">
            {(item.displayName || item.username || '?')[0].toUpperCase()}
          </ThemedText>
        </View>
        <View style={styles.itemText}>
          <ThemedText variant="label" color="dark">@{item.username}</ThemedText>
          {item.displayName && item.displayName !== item.username && (
            <ThemedText variant="caption" color="secondary">{item.displayName}</ThemedText>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View
      style={styles.container}
      accessibilityRole="list"
      accessibilityLabel={t('mentionAutocompleteA11y')}
    >
      <FlatList
        data={filteredItems.slice(0, 8)}
        renderItem={renderItem}
        keyExtractor={item => item.key}
        keyboardShouldPersistTaps="always"
        style={styles.list}
      />
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: BorderRadius.md,
    maxHeight: 200,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  list: {
    maxHeight: 200,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  roleIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    flex: 1,
  },
})
