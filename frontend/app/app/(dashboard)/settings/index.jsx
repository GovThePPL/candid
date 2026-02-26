import { StyleSheet, View, ScrollView, TouchableOpacity, Platform } from 'react-native'
import { useMemo, useState, useEffect, useCallback } from 'react'
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../../contexts/ThemeContext'
import { useAuth } from '../../../contexts/UserContext'
import useIsDesktop from '../../../hooks/useIsDesktop'
import { SemanticColors } from '../../../constants/Colors'

import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import Avatar from '../../../components/Avatar'
import LanguagePicker from '../../../components/LanguagePicker'
import BugReportModal from '../../../components/BugReportModal'

const getMenuItems = (t) => [
  { label: t('menuDemographics'), icon: 'stats-chart-outline', route: '/settings/demographics' },
  { label: t('menuPreferences'), icon: 'options-outline', route: '/settings/preferences' },
  ...(Platform.OS !== 'web' ? [{ label: t('menuNotifications'), icon: 'notifications-outline', route: '/settings/notifications' }] : []),
  { label: t('menuAccount'), icon: 'shield-outline', route: '/settings/account' },
]

export default function SettingsHub() {
  const { t } = useTranslation('settings')
  const { user, logout } = useAuth()
  const router = useRouter()
  const navigation = useNavigation()
  const { returnTo } = useLocalSearchParams()
  const isDesktop = useIsDesktop()
  const { colors, themePreference, setThemePreference } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const MENU_ITEMS = useMemo(() => getMenuItems(t), [t])
  const [bugReportVisible, setBugReportVisible] = useState(false)

  const handleBack = useCallback(() => {
    if (returnTo) {
      router.navigate(returnTo)
    } else {
      router.back()
    }
  }, [returnTo, router])

  // Intercept gesture/hardware back when returnTo exists so it navigates correctly
  useEffect(() => {
    if (!returnTo) return

    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      e.preventDefault()
      handleBack()
    })
    return unsubscribe
  }, [navigation, returnTo, handleBack])

  const handleLogout = useCallback(async () => {
    await logout()
    router.replace('/login')
  }, [logout, router])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={handleBack} showSettingsButton settingsActive onSettingsBack={handleBack} hideSessionBar />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.pageHeader}>
          <ThemedText variant="h1" title={true} style={styles.pageTitle}>
            {t('settings')}
          </ThemedText>
        </View>

        {/* User avatar + name */}
        <TouchableOpacity
          style={styles.userSection}
          onPress={() => router.push('/settings/profile')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('editProfileA11y', { name: user?.displayName || t('guest') })}
        >
          <Avatar user={user} size={64} showKudosBadge showKudosCount />
          <View style={styles.userInfo}>
            <ThemedText variant="h2" color="dark">{user?.displayName || t('guest')}</ThemedText>
            <ThemedText variant="bodySmall" color="secondary" style={styles.username}>@{user?.username || t('guestUsername')}</ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
        </TouchableOpacity>

        {/* Theme toggle */}
        <View style={styles.themeSection}>
          {[
            { value: 'light', icon: 'sunny-outline', label: t('themeLight') },
            { value: 'dark', icon: 'moon-outline', label: t('themeDark') },
            { value: 'system', icon: 'phone-portrait-outline', label: t('themeSystem') },
          ].map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.themeOption,
                themePreference === option.value && styles.themeOptionSelected,
              ]}
              onPress={() => setThemePreference(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: themePreference === option.value }}
              accessibilityLabel={t('themeA11y', { theme: option.label })}
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
                {option.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Language picker */}
        <View style={{ marginBottom: 16 }}>
          <LanguagePicker variant="inline" />
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
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Ionicons name={item.icon} size={22} color={colors.primary} />
              <ThemedText variant="button" color="dark" style={styles.menuLabel}>{item.label}</ThemedText>
              <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Report Bug */}
        <TouchableOpacity
          style={styles.reportBugButton}
          onPress={() => setBugReportVisible(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('menuReportBugA11y')}
        >
          <Ionicons name="bug-outline" size={20} color={colors.secondaryText} />
          <ThemedText variant="button" color="secondary" style={styles.menuLabel}>{t('menuReportBug')}</ThemedText>
        </TouchableOpacity>

        {/* Log Out — hidden on desktop (sidebar has logout) */}
        {!isDesktop && (
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('logOutA11y')}
          >
            <Ionicons name="log-out-outline" size={20} color={SemanticColors.warning} />
            <ThemedText variant="button" style={styles.logoutText}>{t('logOut')}</ThemedText>
          </TouchableOpacity>
        )}
      </ScrollView>

      <BugReportModal
        visible={bugReportVisible}
        onClose={() => setBugReportVisible(false)}
      />
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
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
    backgroundColor: colors.primarySurface,
  },
  themeOptionLabel: {
    fontWeight: '500',
  },
  themeOptionLabelSelected: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  reportBugButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 24,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: SemanticColors.warning,
    borderRadius: 25,
  },
  logoutText: {
    color: SemanticColors.warning,
    fontWeight: '500',
  },
})
