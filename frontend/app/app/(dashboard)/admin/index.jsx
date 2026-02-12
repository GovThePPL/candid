import { StyleSheet, View, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { useUser } from '../../../hooks/useUser'
import { ROLE_LABEL_KEYS } from '../../../lib/roles'
import api from '../../../lib/api'
import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import Avatar from '../../../components/Avatar'

const ROLE_RANK = ['admin', 'moderator', 'facilitator', 'assistant_moderator', 'expert', 'liaison']

const getMenuItems = (t, pendingCount) => [
  { label: t('menuOrganization'), icon: 'business-outline', route: '/admin/organization' },
  { label: t('menuRequestLog'), icon: 'document-text-outline', route: '/admin/request-log', badge: pendingCount },
  { label: t('menuUsers'), icon: 'person-outline', route: '/admin/users' },
  { label: t('menuSurveys'), icon: 'clipboard-outline', route: '/admin/surveys' },
]

export default function AdminHub() {
  const { t } = useTranslation('admin')
  const { user } = useUser()
  const router = useRouter()
  const { returnTo } = useLocalSearchParams()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const MENU_ITEMS = useMemo(() => getMenuItems(t, pendingCount), [t, pendingCount])

  const fetchPendingCount = useCallback(async () => {
    try {
      const data = await api.admin.getRoleRequests('pending')
      setPendingCount(Array.isArray(data) ? data.length : 0)
    } catch {
      // Silently fail — badge just won't show
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPendingCount()
  }, [fetchPendingCount])

  const handleBack = () => {
    if (returnTo) {
      router.navigate(returnTo)
    } else {
      router.back()
    }
  }

  const sortedRoles = useMemo(() => {
    const roles = user?.roles || []
    return [...roles].sort((a, b) =>
      ROLE_RANK.indexOf(a.role) - ROLE_RANK.indexOf(b.role)
    )
  }, [user?.roles])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={handleBack} />
      <View style={styles.content}>
        <View style={styles.pageHeader}>
          <ThemedText variant="h1" title={true} style={styles.pageTitle}>
            {t('adminPanel')}
          </ThemedText>
        </View>

        {/* Your Roles section */}
        <View style={styles.rolesSection}>
          <ThemedText variant="label" color="secondary" style={styles.sectionLabel}>
            {t('yourRoles')}
          </ThemedText>
          {sortedRoles.length === 0 ? (
            <ThemedText variant="bodySmall" color="secondary">{t('noRoles')}</ThemedText>
          ) : (
            <>
              <View style={styles.userCardRow}>
                <Avatar user={user} size={40} showKudosBadge={true} />
                <View style={styles.userCardInfo}>
                  <ThemedText variant="button" color="dark" numberOfLines={1}>{user?.displayName}</ThemedText>
                  <ThemedText variant="caption" color="secondary">@{user?.username}</ThemedText>
                </View>
              </View>
              <View style={styles.rolesList}>
                {sortedRoles.map((r, i) => (
                  <View key={i} style={styles.roleRow}>
                    <View style={styles.roleBadge}>
                      <ThemedText variant="badge" style={styles.roleBadgeText}>
                        {t(ROLE_LABEL_KEYS[r.role] || r.role)}
                      </ThemedText>
                    </View>
                    {r.locationName && (
                      <ThemedText variant="caption" color="secondary">{t('atLocation', { location: r.locationName })}</ThemedText>
                    )}
                    {r.categoryLabel && (
                      <ThemedText variant="caption" color="secondary">{t('inCategory', { category: r.categoryLabel })}</ThemedText>
                    )}
                  </View>
                ))}
              </View>
            </>
          )}
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
              {item.badge > 0 && (
                <View style={styles.menuBadge}>
                  <ThemedText variant="caption" color="inverse" style={styles.menuBadgeText}>{item.badge}</ThemedText>
                </View>
              )}
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
  rolesSection: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  userCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  userCardInfo: {
    flex: 1,
  },
  rolesList: {
    gap: 8,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleBadge: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: {
    color: colors.badgeText,
    fontWeight: '600',
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
  menuBadge: {
    backgroundColor: '#EF4C45',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  menuBadgeText: {
    fontWeight: '700',
    fontSize: 11,
  },
})
