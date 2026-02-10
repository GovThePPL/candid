import { StyleSheet, View, TouchableOpacity } from 'react-native'
import { useMemo } from 'react'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../../contexts/ThemeContext'
import { useUser } from '../../../hooks/useUser'

import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import Avatar from '../../../components/Avatar'

const MENU_ITEMS = [
  { label: 'Demographics', icon: 'stats-chart-outline', route: '/settings/demographics' },
  { label: 'Preferences', icon: 'options-outline', route: '/settings/preferences' },
  { label: 'Notifications', icon: 'notifications-outline', route: '/settings/notifications' },
  { label: 'Account', icon: 'shield-outline', route: '/settings/account' },
]

export default function SettingsHub() {
  const { user } = useUser()
  const router = useRouter()
  const { returnTo } = useLocalSearchParams()
  const { colors, themePreference, setThemePreference } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  const handleBack = () => {
    if (returnTo) {
      router.navigate(returnTo)
    } else {
      router.back()
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={handleBack} />
      <View style={styles.content}>
        <View style={styles.pageHeader}>
          <ThemedText variant="h1" title={true} style={styles.pageTitle}>
            Settings
          </ThemedText>
        </View>

        {/* User avatar + name */}
        <TouchableOpacity
          style={styles.userSection}
          onPress={() => router.push('/settings/profile')}
          activeOpacity={0.7}
        >
          <Avatar user={user} size={64} showKudosBadge={false} />
          <View style={styles.userInfo}>
            <ThemedText variant="h2" color="dark">{user?.displayName || 'Guest'}</ThemedText>
            <ThemedText variant="bodySmall" color="secondary" style={styles.username}>@{user?.username || 'guest'}</ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
        </TouchableOpacity>

        {/* Theme toggle */}
        <View style={styles.themeSection}>
          {[
            { value: 'light', icon: 'sunny-outline' },
            { value: 'dark', icon: 'moon-outline' },
            { value: 'system', icon: 'phone-portrait-outline' },
          ].map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.themeOption,
                themePreference === option.value && styles.themeOptionSelected,
              ]}
              onPress={() => setThemePreference(option.value)}
            >
              <Ionicons
                name={option.icon}
                size={18}
                color={themePreference === option.value ? '#FFFFFF' : colors.secondaryText}
              />
              <ThemedText variant="label" color="secondary" style={[
                styles.themeOptionLabel,
                themePreference === option.value && styles.themeOptionLabelSelected,
              ]}>
                {option.value.charAt(0).toUpperCase() + option.value.slice(1)}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Menu items */}
        <View style={styles.menuSection}>
          {MENU_ITEMS.map((item, index) => (
            <TouchableOpacity
              key={item.route}
              style={[
                styles.menuItem,
                index === MENU_ITEMS.length - 1 && styles.menuItemLast,
              ]}
              onPress={() => router.push(item.route)}
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon} size={22} color={colors.primary} />
              <ThemedText variant="button" color="dark" style={styles.menuLabel}>{item.label}</ThemedText>
              <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  pageHeader: {
    marginBottom: 20,
  },
  pageTitle: {
    color: colors.primary,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  userInfo: {
    flex: 1,
    marginLeft: 14,
  },
  username: {
    marginTop: 2,
  },
  menuSection: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    gap: 14,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuLabel: {
    flex: 1,
    fontWeight: '500',
  },
  themeSection: {
    flexDirection: 'row',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  themeOptionSelected: {
    backgroundColor: colors.primary,
  },
  themeOptionLabel: {
    fontWeight: '500',
  },
  themeOptionLabelSelected: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
})
