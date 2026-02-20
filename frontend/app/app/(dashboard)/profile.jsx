import { StyleSheet, View, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing } from '../../constants/Theme'
import { useAuth } from '../../contexts/UserContext'
import { canAccessAdmin, hasAnyRole } from '../../lib/roles'
import api from '../../lib/api'

import ThemedText from '../../components/ThemedText'
import Header from '../../components/Header'
import Avatar from '../../components/Avatar'
import IconTabBar from '../../components/IconTabBar'
import PositionManagerContent from '../../components/PositionManagerContent'
import PostsContent from '../../components/PostsContent'
import CommentsContent from '../../components/CommentsContent'
import ChatHistoryContent from '../../components/ChatHistoryContent'
import RoleBadge from '../../components/discuss/RoleBadge'

const OWN_TAB_CONFIG = [
  { key: 'positions', icon: 'layers-outline', iconActive: 'layers', labelKey: 'activityTabPositions' },
  { key: 'posts', icon: 'document-text-outline', iconActive: 'document-text', labelKey: 'activityTabPosts' },
  { key: 'comments', icon: 'chatbubble-outline', iconActive: 'chatbubble', labelKey: 'activityTabComments' },
  { key: 'chats', icon: 'chatbubbles-outline', iconActive: 'chatbubbles', labelKey: 'activityTabChats' },
]

const PUBLIC_TAB_CONFIG = [
  { key: 'posts', icon: 'document-text-outline', iconActive: 'document-text', labelKey: 'activityTabPosts' },
  { key: 'comments', icon: 'chatbubble-outline', iconActive: 'chatbubble', labelKey: 'activityTabComments' },
]

export default function ProfileScreen() {
  const { t } = useTranslation(['settings', 'admin'])
  const colors = useThemeColors()
  const router = useRouter()
  const { user } = useAuth()
  const { tab, userId } = useLocalSearchParams()
  const styles = useMemo(() => createStyles(colors), [colors])

  const isOwnProfile = !userId || userId === user?.id

  const tabConfig = isOwnProfile ? OWN_TAB_CONFIG : PUBLIC_TAB_CONFIG
  const defaultTab = isOwnProfile ? 'positions' : 'posts'
  const validTabs = tabConfig.map(tc => tc.key)

  const [activeTab, setActiveTab] = useState(
    tab && validTabs.includes(tab) ? tab : defaultTab
  )
  const [pendingCount, setPendingCount] = useState(0)

  // Public profile state
  const [targetUser, setTargetUser] = useState(null)
  const [loadingUser, setLoadingUser] = useState(!isOwnProfile)
  const [userNotFound, setUserNotFound] = useState(false)

  // Sync activeTab when navigating to this screen with a different tab param
  useEffect(() => {
    if (tab && validTabs.includes(tab)) {
      setActiveTab(tab)
    }
  }, [tab])

  // Reset tab when switching between own/public
  useEffect(() => {
    if (!validTabs.includes(activeTab)) {
      setActiveTab(defaultTab)
    }
  }, [isOwnProfile])

  // Fetch target user for public profiles
  useEffect(() => {
    if (isOwnProfile) return
    setLoadingUser(true)
    setUserNotFound(false)
    api.users.getUserById(userId)
      .then(data => {
        setTargetUser(data)
        setLoadingUser(false)
      })
      .catch(() => {
        setUserNotFound(true)
        setLoadingUser(false)
      })
  }, [userId, isOwnProfile])

  const showAdmin = isOwnProfile && canAccessAdmin(user)
  const displayUser = isOwnProfile ? user : targetUser
  const hasRoles = isOwnProfile ? hasAnyRole(user) : (targetUser?.roles?.length > 0)

  // Fetch admin pending count on mount
  useEffect(() => {
    if (!showAdmin) return
    api.admin.getPendingRequests()
      .then(data => setPendingCount(Array.isArray(data) ? data.length : 0))
      .catch(() => {})
  }, [showAdmin])

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  // Loading state for public profile
  if (!isOwnProfile && loadingUser) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onBack={handleBack} disableAvatarPress />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  // Not found state for public profile
  if (!isOwnProfile && userNotFound) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onBack={handleBack} disableAvatarPress />
        <View style={styles.centerContainer}>
          <Ionicons name="person-outline" size={48} color={colors.placeholderText} />
          <ThemedText variant="body" color="placeholder" style={styles.notFoundTitle}>
            {t('userProfileNotFound')}
          </ThemedText>
          <ThemedText variant="bodySmall" color="placeholder">
            {t('userProfileNotFoundSubtitle')}
          </ThemedText>
        </View>
      </SafeAreaView>
    )
  }

  // Profile section rendered inside each tab's scroll container so it scrolls away naturally
  const profileHeader = (
    <View style={styles.profileSection}>
      <View style={styles.profileWrapper}>
        {isOwnProfile ? (
          <View style={styles.profileCard}>
            <Avatar user={user} size="lg" showKudosBadge showKudosCount />
            <View style={styles.profileInfo}>
              <ThemedText variant="h3" color="dark" numberOfLines={1}>
                {user?.displayName || t('guest')}
              </ThemedText>
              <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
                @{user?.username || t('guestUsername')}
              </ThemedText>
              {hasRoles && (
                <View style={styles.rolesRow}>
                  {user.roles.map((r, i) => (
                    <RoleBadge
                      key={`${r.role}-${r.locationId}-${i}`}
                      role={r.role}
                      location={r.locationCode}
                      category={r.categoryLabel}
                    />
                  ))}
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.profileCard}>
            <Avatar user={displayUser} size="lg" showKudosBadge showKudosCount />
            <View style={styles.profileInfo}>
              <ThemedText variant="h3" color="dark" numberOfLines={1}>
                {displayUser?.displayName || displayUser?.username || '?'}
              </ThemedText>
              <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
                @{displayUser?.username || '?'}
              </ThemedText>
              {hasRoles && displayUser?.roles && (
                <View style={styles.rolesRow}>
                  {displayUser.roles.map((r, i) => (
                    <RoleBadge
                      key={`${r.role}-${r.locationId}-${i}`}
                      role={r.role}
                      location={r.locationCode}
                      category={r.categoryLabel}
                    />
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Admin button — own profile only */}
        {showAdmin && (
          <TouchableOpacity
            style={styles.adminButton}
            onPress={() => router.push('/admin')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('adminButtonA11y', {
              pendingInfo: pendingCount > 0 ? t('adminPendingInfo', { count: pendingCount }) : '',
            })}
          >
            <Ionicons name="shield-outline" size={16} color={colors.primary} />
            <ThemedText variant="bodySmall" color="primary" style={styles.adminButtonText}>
              {t('admin:admin')}
            </ThemedText>
            {pendingCount > 0 && (
              <View style={styles.adminBadge}>
                <ThemedText variant="caption" style={styles.adminBadgeText}>{pendingCount}</ThemedText>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color={colors.secondaryText} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  )

  // Tab row rendered inside each tab's scroll container so it sticks when profile scrolls away
  const tabRowHeader = (
    <IconTabBar tabs={tabConfig} activeTab={activeTab} onTabChange={setActiveTab} t={t} />
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={handleBack} showSettingsButton={isOwnProfile} showAvatar={!isOwnProfile} disableAvatarPress />

      {/* Tab content - profile section and tab row scroll inside each tab's content */}
      <View style={styles.tabContent}>
        {activeTab === 'positions' && isOwnProfile && <PositionManagerContent listHeader={profileHeader} stickyHeader={tabRowHeader} />}
        {activeTab === 'posts' && <PostsContent listHeader={profileHeader} stickyHeader={tabRowHeader} userId={isOwnProfile ? undefined : userId} />}
        {activeTab === 'comments' && <CommentsContent listHeader={profileHeader} stickyHeader={tabRowHeader} userId={isOwnProfile ? undefined : userId} />}
        {activeTab === 'chats' && isOwnProfile && <ChatHistoryContent showHeader={false} listHeader={profileHeader} stickyHeader={tabRowHeader} />}
      </View>
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Profile section (rendered inside content scroll containers)
  profileSection: {
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  profileWrapper: {
    gap: Spacing.sm,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileInfo: {
    flexShrink: 1,
    gap: 2,
  },
  rolesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  adminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: Spacing.sm,
    gap: 8,
  },
  adminButtonText: {
    flex: 1,
    fontWeight: '500',
  },
  adminBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  adminBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11,
  },

  // Tab content
  tabContent: {
    flex: 1,
  },

  // Loading / Not found
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  notFoundTitle: {
    marginTop: Spacing.sm,
  },
})
