import { StyleSheet, View, TouchableOpacity, Dimensions, Pressable, Platform } from 'react-native'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '../hooks/useThemeColors'
import { SemanticColors } from '../constants/Colors'
import ThemedText from './ThemedText'
import Avatar from './Avatar'
import { canAccessAdmin } from '../lib/roles'
import api from '../lib/api'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.65

export default function Sidebar({ visible, onClose, user, onLogout, onBugReport }) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(colors), [colors])
  const slideX = useSharedValue(SIDEBAR_WIDTH)
  const overlayOpacity = useSharedValue(0)
  const [pendingCount, setPendingCount] = useState(0)

  const showAdmin = canAccessAdmin(user)

  // Fetch badge counts when sidebar becomes visible
  useEffect(() => {
    if (!visible) return
    if (showAdmin) {
      api.admin.getPendingRequests()
        .then(data => setPendingCount(Array.isArray(data) ? data.length : 0))
        .catch(() => {})
    }
  }, [visible, showAdmin])

  useEffect(() => {
    if (visible) {
      slideX.value = withTiming(0, { duration: 250 })
      overlayOpacity.value = withTiming(1, { duration: 250 })
    } else {
      slideX.value = withTiming(SIDEBAR_WIDTH, { duration: 200 })
      overlayOpacity.value = withTiming(0, { duration: 200 })
    }
  }, [visible])

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }))

  const sidebarStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
  }))

  const handleMenuPress = (route) => {
    onClose()
    router.push({ pathname: route, params: { returnTo: pathname } })
  }

  const handleLogout = () => {
    onClose()
    onLogout()
  }

  if (!visible) return null

  return (
    <View style={styles.container}>
      {/* Overlay */}
      <Pressable style={styles.overlayPressable} onPress={onClose} accessibilityLabel={t('closeMenu')}>
        <Animated.View style={[styles.overlay, overlayStyle]} />
      </Pressable>

      {/* Sidebar */}
      <Animated.View style={[styles.sidebar, sidebarStyle]}>
        {/* User Info */}
        <View style={[styles.userSection, { paddingTop: insets.top + 16 }]}>
          <Avatar user={user} size={64} showKudosBadge showKudosCount />
          <View style={styles.userInfo}>
            <ThemedText variant="h3" color="dark" numberOfLines={1}>{user?.displayName || t('guest')}</ThemedText>
            <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>@{user?.username || 'guest'}</ThemedText>
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem} onPress={() => handleMenuPress('/settings')} accessibilityRole="button" accessibilityLabel={t('settings')}>
            <ThemedText variant="button" color="inverse" style={styles.menuText}>{t('settings')}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => handleMenuPress('/chats')} accessibilityRole="button" accessibilityLabel={t('chatHistory')}>
            <View style={styles.menuItemRow}>
              <ThemedText variant="button" color="inverse" style={styles.menuText}>{t('chatHistory')}</ThemedText>
              <Ionicons name="chatbubbles-outline" size={18} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          {showAdmin && (
            <TouchableOpacity style={styles.menuItem} onPress={() => handleMenuPress('/admin')} accessibilityRole="button" accessibilityLabel={t('admin:adminPanelA11y')}>
              <View style={styles.menuItemRow}>
                <ThemedText variant="button" color="inverse" style={styles.menuText}>{t('admin:admin')}</ThemedText>
                {pendingCount > 0 && (
                  <View style={styles.badge}>
                    <ThemedText variant="caption" color="inverse" style={styles.badgeText}>{pendingCount}</ThemedText>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => { onClose(); onBugReport?.(); }}
            accessibilityRole="button"
            accessibilityLabel={t('reportBug')}
          >
            <ThemedText variant="button" color="inverse" style={styles.menuText}>{t('reportBug')}</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <View style={styles.logoutSection}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} accessibilityRole="button" accessibilityLabel={t('logOut')}>
            <Ionicons name="log-out-outline" size={20} color={SemanticColors.warning} />
            <ThemedText variant="button" color="error" style={styles.logoutText}>{t('logOut')}</ThemedText>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  overlayPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.cardBackground,
    paddingTop: 0,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: -2, height: 0 }, shadowOpacity: 0.25, shadowRadius: 10 },
      android: { elevation: 10 },
      default: { boxShadow: '-2px 0 10px rgba(0, 0, 0, 0.25)' },
    }),
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  userInfo: {
    flex: 1,
  },
  menuSection: {
    paddingTop: 8,
  },
  menuItem: {
    backgroundColor: colors.primarySurface,
    marginHorizontal: 16,
    marginVertical: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 25,
  },
  menuText: {
    fontWeight: '500',
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    backgroundColor: SemanticColors.warning,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontWeight: '700',
    fontSize: 11,
  },
  logoutSection: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: SemanticColors.warning,
    borderRadius: 25,
  },
  logoutText: {
    fontWeight: '500',
  },
})
