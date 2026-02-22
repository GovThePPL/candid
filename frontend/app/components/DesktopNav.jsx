import { StyleSheet, View, TouchableOpacity, Platform, useWindowDimensions } from 'react-native'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, usePathname } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useThemeColors } from '../hooks/useThemeColors'
import { useAuth } from '../contexts/UserContext'
import { useNotificationCount } from '../contexts/NotificationContext'
import { canAccessAdmin } from '../lib/roles'
import api from '../lib/api'
import Avatar from './Avatar'
import ThemedText from './ThemedText'

const EXPANDED_WIDTH = 220
const COLLAPSED_WIDTH = 62
const AUTO_COLLAPSE_BREAKPOINT = 1100
const NAV_COLLAPSED_KEY = '@desktop_nav_collapsed'

export default function DesktopNav() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { user, logout } = useAuth()
  const { unreadCount } = useNotificationCount()
  const { width: screenWidth } = useWindowDimensions()

  const isAdmin = canAccessAdmin(user)

  const [manualCollapse, setManualCollapse] = useState(null)
  const [hovered, setHovered] = useState(false)
  const [wikiSuggestionCount, setWikiSuggestionCount] = useState(0)

  useEffect(() => {
    AsyncStorage.getItem(NAV_COLLAPSED_KEY).then(val => {
      if (val !== null) setManualCollapse(JSON.parse(val))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) return
    api.wiki.getSuggestionCount()
      .then(data => setWikiSuggestionCount(data?.count || 0))
      .catch(() => {})
  }, [user])

  const autoCollapsed = screenWidth < AUTO_COLLAPSE_BREAKPOINT
  const collapsed = manualCollapse !== null ? manualCollapse : autoCollapsed
  const showLabels = !collapsed || hovered

  const visibleWidth = collapsed
    ? (hovered ? EXPANDED_WIDTH : COLLAPSED_WIDTH)
    : EXPANDED_WIDTH

  // Active indicator matches sidebar content area (equal 8px margin from edges)
  const activeBgWidth = visibleWidth - 17 // 1 border + 8 padding × 2

  const toggleCollapse = useCallback(async () => {
    const next = !collapsed
    const autoVal = screenWidth < AUTO_COLLAPSE_BREAKPOINT
    const newManual = next === autoVal ? null : next
    setManualCollapse(newManual)
    try {
      if (newManual === null) {
        await AsyncStorage.removeItem(NAV_COLLAPSED_KEY)
      } else {
        await AsyncStorage.setItem(NAV_COLLAPSED_KEY, JSON.stringify(newManual))
      }
    } catch {}
  }, [collapsed, screenWidth])

  const mouseHandlers = Platform.OS === 'web' ? {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  } : {}

  const isActive = useCallback((path) => {
    if (path === '/discuss') return pathname === '/discuss' || pathname.startsWith('/discuss/')
    if (path === '/wiki') return pathname === '/wiki' || pathname.startsWith('/wiki/')
    if (path === '/stats') return pathname === '/stats' || pathname.startsWith('/stats/')
    if (path === '/admin') return pathname === '/admin' || pathname.startsWith('/admin/')
    if (path === '/profile') return pathname === '/profile'
    if (path === '/settings') return pathname === '/settings'
    if (path === '/notifications') return pathname === '/notifications'
    return pathname === path
  }, [pathname])

  const navigate = useCallback((path) => {
    router.navigate(path)
  }, [router])

  const handleLogout = useCallback(() => {
    logout()
  }, [logout])

  const labelStyle = showLabels ? styles.labelVisible : styles.labelHidden
  const collapsedLabelStyle = showLabels ? styles.labelHidden : styles.labelVisible

  return (
    <View style={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH, overflow: 'visible', zIndex: 20 }}>
      <View
        style={[
          styles.clipWrapper,
          { width: visibleWidth },
          collapsed && styles.clipWrapperOverlay,
          collapsed && hovered && styles.clipWrapperShadow,
        ]}
        {...mouseHandlers}
      >
        <View style={styles.container}>
          {/* Logo — crossfade between "Candid" and "C" */}
          <View style={styles.logoContainer}>
            <View style={labelStyle}>
              <ThemedText variant="brandCompact" style={[styles.logo, { color: colors.logoText }]}>
                Candid
              </ThemedText>
            </View>
            <View style={[styles.logoCollapsedWrap, collapsedLabelStyle]}>
              <ThemedText variant="brandCompact" style={[styles.logoCollapsedText, { color: colors.logoText }]}>
                C
              </ThemedText>
            </View>
          </View>

          {/* User info */}
          <TouchableOpacity
            style={styles.userSection}
            onPress={() => navigate('/profile')}
            accessibilityRole="button"
            accessibilityLabel={t('viewProfile')}
          >
            {isActive('/profile') && (
              <View style={[styles.navItemActiveBg, { width: activeBgWidth }]} />
            )}
            <Avatar user={user} size={40} showKudosBadge showKudosCount />
            <View style={[styles.userInfo, labelStyle]}>
              <ThemedText variant="bodySmall" style={styles.displayName} numberOfLines={1}>
                {user?.displayName || t('anonymous')}
              </ThemedText>
              {user?.username && (
                <ThemedText variant="caption" color="secondary" numberOfLines={1}>
                  @{user.username}
                </ThemedText>
              )}
            </View>
          </TouchableOpacity>

          {/* Notifications */}
          <NavItem
            icon={
              <View>
                <Ionicons
                  name={isActive('/notifications') ? 'notifications' : 'notifications-outline'}
                  size={22}
                  color={isActive('/notifications') ? colors.navActiveText : colors.secondaryText}
                />
                {unreadCount > 0 && (
                  <View style={styles.badge}>
                    <ThemedText variant="label" style={styles.badgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </ThemedText>
                  </View>
                )}
              </View>
            }
            label={t('notifications:title')}
            active={isActive('/notifications')}
            onPress={() => navigate('/notifications')}
            colors={colors}
            styles={styles}
            labelStyle={labelStyle}
            activeBgWidth={activeBgWidth}
            accessibilityLabel={unreadCount > 0
              ? t('notifications:bellA11y', { count: unreadCount })
              : t('notifications:bellA11yNone')}
          />

          <View style={[styles.divider, { width: activeBgWidth }]} />

          {/* Main navigation */}
          <View style={styles.navSection}>
            <NavItem
              icon={<Ionicons name={isActive('/discuss') ? 'chatbubbles' : 'chatbubbles-outline'} size={22} color={isActive('/discuss') ? colors.navActiveText : colors.secondaryText} />}
              label={t('discuss:tabDiscuss')}
              active={isActive('/discuss')}
              onPress={() => navigate('/discuss')}
              colors={colors}
              styles={styles}
              labelStyle={labelStyle}
              activeBgWidth={activeBgWidth}
            />
            <NavItem
              icon={
                <View>
                  <Ionicons name={isActive('/wiki') ? 'book' : 'book-outline'} size={22} color={isActive('/wiki') ? colors.navActiveText : colors.secondaryText} />
                  {wikiSuggestionCount > 0 && (
                    <View style={styles.badge}>
                      <ThemedText variant="label" style={styles.badgeText}>
                        {wikiSuggestionCount > 99 ? '99+' : wikiSuggestionCount}
                      </ThemedText>
                    </View>
                  )}
                </View>
              }
              label={t('glossary:tabWiki')}
              active={isActive('/wiki')}
              onPress={() => navigate('/wiki')}
              colors={colors}
              styles={styles}
              labelStyle={labelStyle}
              activeBgWidth={activeBgWidth}
              accessibilityLabel={wikiSuggestionCount > 0
                ? t('glossary:wikiTabBadgeA11y', { count: wikiSuggestionCount })
                : t('glossary:tabWiki')}
            />
            <NavItem
              icon={<Ionicons name={isActive('/stats') ? 'stats-chart' : 'stats-chart-outline'} size={22} color={isActive('/stats') ? colors.navActiveText : colors.secondaryText} />}
              label={t('tabStats')}
              active={isActive('/stats')}
              onPress={() => navigate('/stats')}
              colors={colors}
              styles={styles}
              labelStyle={labelStyle}
              activeBgWidth={activeBgWidth}
            />
            {isAdmin && (
              <NavItem
                icon={<Ionicons name={isActive('/admin') ? 'shield' : 'shield-outline'} size={22} color={isActive('/admin') ? colors.navActiveText : colors.secondaryText} />}
                label={t('admin:admin')}
                active={isActive('/admin')}
                onPress={() => navigate('/admin')}
                colors={colors}
                styles={styles}
                labelStyle={labelStyle}
                activeBgWidth={activeBgWidth}
              />
            )}
          </View>

          <View style={styles.spacer} />

          {/* Bottom utility items */}
          <View style={styles.navSection}>
            <NavItem
              icon={<Ionicons name={isActive('/settings') ? 'settings' : 'settings-outline'} size={22} color={isActive('/settings') ? colors.navActiveText : colors.secondaryText} />}
              label={t('settings')}
              active={isActive('/settings')}
              onPress={() => navigate('/settings')}
              colors={colors}
              styles={styles}
              labelStyle={labelStyle}
              activeBgWidth={activeBgWidth}
            />

            <View style={[styles.divider, { width: activeBgWidth }]} />

            <TouchableOpacity
              style={styles.navItem}
              onPress={toggleCollapse}
              accessibilityRole="button"
              accessibilityLabel={collapsed ? t('desktopExpandNav') : t('desktopCollapseNav')}
            >
              <View style={styles.iconWrap}>
                <Ionicons
                  name={collapsed ? 'chevron-forward' : 'chevron-back'}
                  size={22}
                  color={colors.secondaryText}
                />
              </View>
              <View style={labelStyle}>
                <ThemedText variant="bodySmall" color="secondary">
                  {collapsed ? t('expandNav') : t('collapseNav')}
                </ThemedText>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navItem}
              onPress={handleLogout}
              accessibilityRole="button"
              accessibilityLabel={t('logOut')}
            >
              <View style={styles.iconWrap}>
                <Ionicons name="log-out-outline" size={22} color={colors.secondaryText} />
              </View>
              <View style={labelStyle}>
                <ThemedText variant="bodySmall" color="secondary">{t('logOut')}</ThemedText>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  )
}

function NavItem({ icon, label, active, onPress, colors, styles, labelStyle, activeBgWidth, accessibilityLabel }) {
  return (
    <TouchableOpacity
      style={styles.navItem}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected: active }}
    >
      {active && (
        <View style={[styles.navItemActiveBg, { width: activeBgWidth }]} />
      )}
      <View style={styles.iconWrap}>{icon}</View>
      <View style={labelStyle}>
        <ThemedText
          variant="bodySmall"
          style={[styles.navLabel, active && { color: colors.navActiveText, fontWeight: '600' }]}
        >
          {label}
        </ThemedText>
      </View>
    </TouchableOpacity>
  )
}

const createStyles = (colors) => StyleSheet.create({
  clipWrapper: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.navBackground,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    ...Platform.select({
      web: { transition: 'width 0.15s ease-out, box-shadow 0.15s ease-out' },
    }),
  },
  clipWrapperOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
  },
  clipWrapperShadow: {
    ...Platform.select({
      web: { boxShadow: '4px 0 12px rgba(0,0,0,0.12)' },
    }),
  },
  container: {
    width: EXPANDED_WIDTH,
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  // Logo crossfade
  logoContainer: {
    marginBottom: 8,
  },
  logo: {
    paddingHorizontal: 12,
    ...Platform.select({
      web: { fontFamily: 'Pacifico, cursive' },
      default: { fontFamily: 'Pacifico_400Regular' },
    }),
  },
  logoCollapsedWrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: COLLAPSED_WIDTH - 17, // matches sidebar content area
  },
  logoCollapsedText: {
    textAlign: 'center',
    ...Platform.select({
      web: { fontFamily: 'Pacifico, cursive' },
      default: { fontFamily: 'Pacifico_400Regular' },
    }),
  },
  // Label opacity transitions
  labelVisible: {
    opacity: 1,
    ...Platform.select({
      web: { transition: 'opacity 0.15s ease-out 0.04s' },
    }),
  },
  labelHidden: {
    opacity: 0,
    ...Platform.select({
      web: { transition: 'opacity 0.08s ease-out' },
    }),
  },
  // User section: paddingLeft 3 center-aligns 40px avatar with 22px icons
  // Avatar center: 3 + 20 = 23px.  Icon center: 12 + 11 = 23px.
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 3,
    paddingRight: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  userInfo: {
    flex: 1,
    overflow: 'hidden',
  },
  displayName: {
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 10,
    // width set inline via activeBgWidth for equal margins from sidebar edges
    ...Platform.select({
      web: { transition: 'width 0.15s ease-out' },
    }),
  },
  navSection: {
    gap: 2,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  // Active indicator: sized to sidebar content area, transitions width
  navItemActiveBg: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.chattingListBg,
    borderRadius: 10,
    ...Platform.select({
      web: { transition: 'width 0.15s ease-out' },
    }),
  },
  iconWrap: {
    width: 22,
    flexShrink: 0,
    alignItems: 'center',
  },
  navLabel: {
    color: colors.secondaryText,
  },
  spacer: {
    flex: 1,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: '#D32F2F',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
})
