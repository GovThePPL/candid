import { StyleSheet, View, ActivityIndicator } from 'react-native'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import useIsDesktop from '../../../hooks/useIsDesktop'
import { Spacing } from '../../../constants/Theme'
import api from '../../../lib/api'

import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import Avatar from '../../../components/Avatar'
import IconTabBar from '../../../components/IconTabBar'
import PostsContent from '../../../components/PostsContent'
import CommentsContent from '../../../components/CommentsContent'
import RoleBadge from '../../../components/discuss/RoleBadge'

const TAB_CONFIG = [
  { key: 'posts', icon: 'document-text-outline', iconActive: 'document-text', labelKey: 'activityTabPosts' },
  { key: 'comments', icon: 'chatbubble-outline', iconActive: 'chatbubble', labelKey: 'activityTabComments' },
]

export default function UserProfileScreen() {
  const { t } = useTranslation('settings')
  const colors = useThemeColors()
  const router = useRouter()
  const { username } = useLocalSearchParams()
  const isDesktop = useIsDesktop()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [activeTab, setActiveTab] = useState('posts')
  const [targetUser, setTargetUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!username) return
    setLoading(true)
    setNotFound(false)
    api.users.getUserByUsername(username)
      .then(data => {
        setTargetUser(data)
        setLoading(false)
      })
      .catch(() => {
        setNotFound(true)
        setLoading(false)
      })
  }, [username])

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const hasRoles = targetUser?.roles?.length > 0

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onBack={isDesktop ? undefined : handleBack} showAvatar disableAvatarPress hideSessionBar />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (notFound) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onBack={isDesktop ? undefined : handleBack} showAvatar disableAvatarPress hideSessionBar />
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

  const profileHeader = (
    <View style={styles.profileSection}>
      <View style={styles.profileCard}>
        <Avatar user={targetUser} size="lg" showKudosBadge showKudosCount />
        <View style={styles.profileInfo}>
          <ThemedText variant="h3" color="dark" numberOfLines={1}>
            {targetUser?.displayName || targetUser?.username || '?'}
          </ThemedText>
          <ThemedText variant="bodySmall" color="secondary" numberOfLines={1}>
            @{targetUser?.username || '?'}
          </ThemedText>
          {hasRoles && (
            <View style={styles.rolesRow}>
              {targetUser.roles.map((r, i) => (
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
    </View>
  )

  const tabRowHeader = (
    <IconTabBar tabs={TAB_CONFIG} activeTab={activeTab} onTabChange={setActiveTab} t={t} />
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={isDesktop ? undefined : handleBack} showAvatar disableAvatarPress hideSessionBar />

      <View style={styles.tabContent}>
        {activeTab === 'posts' && <PostsContent listHeader={profileHeader} stickyHeader={tabRowHeader} userId={targetUser?.id} />}
        {activeTab === 'comments' && <CommentsContent listHeader={profileHeader} stickyHeader={tabRowHeader} userId={targetUser?.id} />}
      </View>
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  profileSection: {
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
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
  tabContent: {
    flex: 1,
  },
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
