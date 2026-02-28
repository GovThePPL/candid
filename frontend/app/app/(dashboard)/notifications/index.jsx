import { useCallback, useMemo } from 'react'
import {
  View, FlatList, TouchableOpacity, ActivityIndicator,
  StyleSheet, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../../hooks/useThemeColors'
import useNotifications from '../../../hooks/useNotifications'
import Header from '../../../components/Header'
import ThemedText from '../../../components/ThemedText'
import Avatar from '../../../components/Avatar'
import { formatRelativeTime } from '../../../lib/timeUtils'

export default function NotificationsScreen() {
  const { t } = useTranslation('notifications')
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const {
    notifications,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    loadMore,
    handleRefresh,
    markRead,
  } = useNotifications()

  const handleNotificationPress = useCallback((notification) => {
    if (!notification.isRead) {
      markRead(notification.id)
    }

    // Deep link based on notification data
    const action = notification.data?.action
    if (action === 'open_post' && notification.data?.postId) {
      const commentId = notification.data.commentId
      if (commentId) {
        router.push({ pathname: '/post/[id]', params: { id: notification.data.postId, threadRoot: commentId, focus: commentId } })
      } else {
        router.push(`/post/${notification.data.postId}`)
      }
    } else if (action === 'open_organization') {
      router.push('/admin/organization')
    } else if (action === 'open_admin_pending') {
      router.push('/admin')
    } else if (action === 'open_admin_request_log') {
      router.push('/admin/request-log?tab=mine')
    } else if (action === 'open_admin_roles') {
      router.push('/admin/organization')
    } else if (action === 'open_admin') {
      router.push('/admin')
    } else if (action === 'open_wiki_suggestions') {
      router.navigate('/wiki')
      router.push('/wiki/suggestions')
    }
  }, [markRead, router])

  const renderItem = useCallback(({ item }) => (
    <NotificationRow
      notification={item}
      onPress={handleNotificationPress}
      colors={colors}
      styles={styles}
      t={t}
    />
  ), [handleNotificationPress, colors, styles, t])

  const keyExtractor = useCallback((item) => item.id, [])

  const ListFooter = loadingMore ? (
    <View style={styles.footer}>
      <ActivityIndicator size="small" color={colors.primary} />
    </View>
  ) : null

  const ListEmpty = !loading ? (
    <View style={styles.emptyContainer}>
      <Ionicons name="notifications-off-outline" size={48} color={colors.placeholderText} />
      <ThemedText variant="body" color="placeholder" style={styles.emptyTitle}>
        {t('emptyTitle')}
      </ThemedText>
      <ThemedText variant="bodySmall" color="placeholder" style={styles.emptySubtitle}>
        {t('emptySubtitle')}
      </ThemedText>
    </View>
  ) : null

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={styles.titleRow}>
        <ThemedText variant="h1" style={styles.title}>{t('title')}</ThemedText>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.3}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={notifications.length === 0 ? styles.emptyList : undefined}
        />
      )}
    </SafeAreaView>
  )
}

function NotificationRow({ notification, onPress, colors, styles, t }) {
  const actorUser = notification.actorUserId ? {
    avatarIconUrl: notification.actorAvatarIconUrl,
    displayName: notification.actorDisplayName,
  } : null

  const timeText = formatRelativeTime(notification.createdTime, t)

  return (
    <TouchableOpacity
      style={[styles.row, !notification.isRead && styles.rowUnread]}
      onPress={() => onPress(notification)}
      accessibilityLabel={t('notificationItemA11y', {
        title: notification.title,
        time: timeText,
        status: notification.isRead ? t('readStatus') : t('unreadStatus'),
      })}
      accessibilityRole="button"
    >
      <View style={styles.rowAvatar}>
        {actorUser ? (
          <Avatar user={actorUser} size={36} showKudosBadge showKudosCount />
        ) : (
          <View style={[styles.iconCircle, { backgroundColor: colors.uiBackground }]}>
            <Ionicons name="notifications" size={18} color={colors.secondaryText} />
          </View>
        )}
      </View>
      <View style={styles.rowContent}>
        <ThemedText variant="bodySmall" style={styles.rowTitle} numberOfLines={1}>
          {notification.title}
        </ThemedText>
        <ThemedText variant="body" color="secondary" numberOfLines={2}>
          {notification.body}
        </ThemedText>
        <ThemedText variant="label" color="placeholder" style={styles.rowTime}>
          {timeText}
        </ThemedText>
      </View>
      {!notification.isRead && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    marginTop: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  rowUnread: {
    backgroundColor: colors.uiBackground,
  },
  rowAvatar: {
    width: 36,
    height: 36,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontWeight: '600',
  },
  rowTime: {
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
})
