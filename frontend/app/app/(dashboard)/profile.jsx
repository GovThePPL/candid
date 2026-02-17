import { StyleSheet, View, TouchableOpacity } from 'react-native'
import { useState, useEffect, useContext, useMemo, useCallback } from 'react'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing } from '../../constants/Theme'
import { UserContext } from '../../contexts/UserContext'
import { canAccessAdmin } from '../../lib/roles'
import api from '../../lib/api'

import ThemedText from '../../components/ThemedText'
import Header from '../../components/Header'
import Avatar from '../../components/Avatar'
import IconTabBar from '../../components/IconTabBar'
import PositionManagerContent from '../../components/PositionManagerContent'
import PostsContent from '../../components/PostsContent'
import CommentsContent from '../../components/CommentsContent'
import ChatHistoryContent from '../../components/ChatHistoryContent'

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
  const { user } = useContext(UserContext)
  const { tab } = useLocalSearchParams()
  const styles = useMemo(() => createStyles(colors), [colors])

  const validTabs = TAB_CONFIG.map(t => t.key)
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
      <TouchableOpacity
        style={styles.profileCard}
        onPress={() => router.push('/settings')}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('profileCardA11y')}
      >
        <Avatar user={user} size={48} showKudosBadge showKudosCount />
        <View style={styles.profileInfo}>
          <ThemedText variant="h3" color="dark" numberOfLines={1}>
            {user?.displayName || t('guest')}
          </ThemedText>
          <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
            @{user?.username || t('guestUsername')}
          </ThemedText>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
      </TouchableOpacity>

      {showAdmin && (
        <TouchableOpacity
          style={styles.adminLink}
          onPress={() => router.push('/admin')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('adminLinkA11y', {
            pendingInfo: pendingCount > 0 ? t('adminPendingInfo', { count: pendingCount }) : '',
          })}
        >
          <Ionicons name="shield-outline" size={18} color={colors.primary} />
          <ThemedText variant="button" color="primary" style={styles.adminLinkText}>
            {t('adminLink')}
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
  )

  // Tab row rendered inside each tab's scroll container so it sticks when profile scrolls away
  const tabRowHeader = (
    <IconTabBar tabs={TAB_CONFIG} activeTab={activeTab} onTabChange={setActiveTab} t={t} />
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={handleBack} showAvatar={false} />

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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  profileInfo: {
    flex: 1,
    marginLeft: 12,
  },
  adminLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  adminLinkText: {
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
