import { StyleSheet, View, TouchableOpacity } from 'react-native'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import useIsDesktop from '../../hooks/useIsDesktop'
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

const TAB_CONFIG = [
  { key: 'positions', icon: 'layers-outline', iconActive: 'layers', labelKey: 'activityTabPositions' },
  { key: 'posts', icon: 'document-text-outline', iconActive: 'document-text', labelKey: 'activityTabPosts' },
  { key: 'comments', icon: 'chatbubble-outline', iconActive: 'chatbubble', labelKey: 'activityTabComments' },
  { key: 'chats', icon: 'chatbubbles-outline', iconActive: 'chatbubbles', labelKey: 'activityTabChats' },
]

export default function ProfileScreen() {
  const { t } = useTranslation(['settings', 'admin'])
  const colors = useThemeColors()
  const router = useRouter()
  const { user } = useAuth()
  const { tab } = useLocalSearchParams()
  const isDesktop = useIsDesktop()
  const styles = useMemo(() => createStyles(colors), [colors])

  const validTabs = TAB_CONFIG.map(tc => tc.key)

  const [activeTab, setActiveTab] = useState(
    tab && validTabs.includes(tab) ? tab : 'positions'
  )
  const [pendingCount, setPendingCount] = useState(0)

  // Sync activeTab when navigating to this screen with a different tab param
  useEffect(() => {
    if (tab && validTabs.includes(tab)) {
      setActiveTab(tab)
    }
  }, [tab])

  const showAdmin = canAccessAdmin(user)
  const hasRoles = hasAnyRole(user)

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

  // Profile section rendered inside each tab's scroll container so it scrolls away naturally
  const profileHeader = (
    <View style={styles.profileSection}>
      <View style={styles.profileWrapper}>
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
                    session={r.sessionLabel}
                  />
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Admin button */}
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
    <IconTabBar tabs={TAB_CONFIG} activeTab={activeTab} onTabChange={setActiveTab} t={t} />
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={isDesktop ? undefined : handleBack} showSettingsButton disableAvatarPress hideSessionBar />

      {/* Tab content - profile section and tab row scroll inside each tab's content */}
      <View style={styles.tabContent}>
        {activeTab === 'positions' && <PositionManagerContent listHeader={profileHeader} stickyHeader={tabRowHeader} />}
        {activeTab === 'posts' && <PostsContent listHeader={profileHeader} stickyHeader={tabRowHeader} />}
        {activeTab === 'comments' && <CommentsContent listHeader={profileHeader} stickyHeader={tabRowHeader} />}
        {activeTab === 'chats' && <ChatHistoryContent showHeader={false} listHeader={profileHeader} stickyHeader={tabRowHeader} />}
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
})
