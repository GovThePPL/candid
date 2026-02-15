import { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import ThemedText from '../ThemedText'
import { Typography } from '../../constants/Theme'
import { BrandColor, OnBrandColors } from '../../constants/Colors'

// Role badge backgrounds are theme-invariant (same in light/dark) — each role
// has a fixed brand color for instant recognition.  White text via OnBrandColors.
export const ROLE_LETTERS = {
  admin: 'A',
  moderator: 'M',
  facilitator: 'F',
  assistant_moderator: 'M',
  expert: 'E',
  liaison: 'L',
}

export const ROLE_COLORS = {
  admin: BrandColor,
  moderator: '#1565C0',
  facilitator: '#2E7D32',
  assistant_moderator: '#6A1B9A',
  expert: '#E65100',
  liaison: '#00838F',
}

export const ROLE_LABEL_KEYS = {
  admin: 'roleAdmin',
  moderator: 'roleModerator',
  facilitator: 'roleFacilitator',
  assistant_moderator: 'roleAssistantModerator',
  expert: 'roleExpert',
  liaison: 'roleLiaison',
}

/**
 * Small colored pill badge displaying a user's role.
 *
 * @param {Object} props
 * @param {string} props.role - Role name (e.g., 'admin', 'moderator')
 */
export default function RoleBadge({ role }) {
  const { t } = useTranslation('discuss')

  const bgColor = ROLE_COLORS[role]

  if (!role || !bgColor) return null

  const labelKey = ROLE_LABEL_KEYS[role]
  const label = labelKey ? t(labelKey) : role

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]} accessibilityLabel={label}>
      <ThemedText style={styles.label}>{label}</ThemedText>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  label: {
    ...Typography.badgeSm,
    color: OnBrandColors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
})
