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
 * When session is provided, renders two lines:
 *   Line 1: "Location · Session"
 *   Line 2: "Role"
 * Otherwise renders a single line: "Location · Role" or just "Role".
 *
 * @param {Object} props
 * @param {string} props.role - Role name (e.g., 'admin', 'moderator')
 * @param {string} [props.location] - Optional location code (e.g., 'US', 'OR')
 * @param {string} [props.session] - Optional session label (e.g., 'Healthcare')
 */
export default function RoleBadge({ role, location, session }) {
  const { t } = useTranslation('discuss')

  const bgColor = ROLE_COLORS[role]

  if (!role || !bgColor) return null

  const labelKey = ROLE_LABEL_KEYS[role]
  const label = labelKey ? t(labelKey) : role

  // Two-line layout when session is present
  if (session) {
    const scopeLine = [location, session].filter(Boolean).join(' · ')
    const a11yText = [location, session, label].filter(Boolean).join(' · ')
    return (
      <View style={[styles.badge, { backgroundColor: bgColor }]} accessibilityLabel={a11yText}>
        <ThemedText style={styles.label}>{scopeLine}</ThemedText>
        <ThemedText style={styles.label}>{label}</ThemedText>
      </View>
    )
  }

  const displayText = location ? `${location} · ${label}` : label

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]} accessibilityLabel={displayText}>
      <ThemedText style={styles.label}>{displayText}</ThemedText>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    alignItems: 'center',
  },
  label: {
    ...Typography.badgeSm,
    color: OnBrandColors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
})
