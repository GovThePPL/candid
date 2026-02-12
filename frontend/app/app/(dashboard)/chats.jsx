import { StyleSheet, View, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useState, useEffect, useContext, useRef, useMemo } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { SemanticColors } from '../../constants/Colors'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../../components/ThemedText'
import Header from '../../components/Header'
import EmptyState from '../../components/EmptyState'
import CardShell from '../../components/CardShell'
import PositionInfoCard from '../../components/PositionInfoCard'
import { UserContext } from '../../contexts/UserContext'
import api, { translateError } from '../../lib/api'
import { CacheManager, CacheKeys, CacheDurations } from '../../lib/cache'
import ReportModal from '../../components/ReportModal'
import KudosMedallion from '../../components/KudosMedallion'

const formatDate = (dateString, t) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return t('yesterday')
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'long' })
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
  }
}

const getEndTypeLabel = (endType, endedByUserId, currentUserId, colors, t) => {
  switch (endType) {
    case 'mutual_agreement':
    case 'agreed_closure':
      return { label: t('endAgreed'), color: SemanticColors.agree, icon: 'handshake-outline', iconType: 'material-community' }
    case 'disagreement':
      return { label: t('endDisagreed'), color: SemanticColors.disagree, icon: 'close-circle' }
    case 'timeout':
      return { label: t('endTimedOut'), color: colors.pass, icon: 'time' }
    case 'abandoned':
    case 'user_exit':
      if (endedByUserId && currentUserId) {
        if (endedByUserId === currentUserId) {
          return { label: t('endYouLeft'), color: colors.pass, icon: 'exit-outline' }
        } else {
          return { label: t('endTheyLeft'), color: colors.pass, icon: 'exit-outline' }
        }
      }
      return { label: t('endEnded'), color: colors.pass, icon: 'exit' }
    default:
      return { label: t('endActive'), color: colors.primary, icon: 'chatbubbles' }
  }
}


function MetaBadgeIcon({ endTypeInfo }) {
  if (endTypeInfo.iconType === 'material-community') {
    return <MaterialCommunityIcons name={endTypeInfo.icon} size={14} color={endTypeInfo.color} />
  }
  return <Ionicons name={endTypeInfo.icon} size={14} color={endTypeInfo.color} />
}

function ChatHistoryCard({ chat, onPress, onSendKudos, onReport, currentUserId, colors, styles }) {
  const { t } = useTranslation('chat')
  const { position, otherUser, agreedClosure, startTime, endTime, endType, status, endedByUserId, kudosSent, kudosReceived } = chat
  const endTypeInfo = getEndTypeLabel(endType, endedByUserId, currentUserId, colors, t)
  const isActive = status === 'active' && !endTime
  const showKudosSection = agreedClosure != null

  const positionWithOtherUser = position ? { ...position, creator: otherUser } : position

  const closureBottomSection = agreedClosure ? (
    <View>
      <View style={styles.closureRow}>
        <MaterialCommunityIcons name="handshake-outline" size={18} color="#FFFFFF" />
        <ThemedText variant="bodySmall" color="inverse" style={styles.closureText} numberOfLines={2}>{agreedClosure?.content}</ThemedText>
      </View>

      {showKudosSection && (
        <View style={styles.kudosRow}>
          <View style={styles.kudosLeft}>
            {kudosReceived ? (
              <View style={styles.kudosReceivedContainer}>
                <KudosMedallion active={true} size={28} />
                <ThemedText variant="caption" style={styles.kudosReceivedText}>{t('sentYouKudos', { name: otherUser?.displayName || t('someone') })}</ThemedText>
              </View>
            ) : (
              <View style={styles.kudosPlaceholder} />
            )}
          </View>

          <TouchableOpacity
            style={[styles.kudosPillButton, kudosSent && styles.kudosPillButtonSent]}
            onPress={(e) => {
              e.stopPropagation()
              if (!kudosSent && onSendKudos) {
                onSendKudos(chat.id)
              }
            }}
            disabled={kudosSent}
            activeOpacity={kudosSent ? 1 : 0.7}
            accessibilityRole="button"
            accessibilityLabel={kudosSent ? t('kudosSent') : t('sendKudos')}
          >
            <KudosMedallion active={kudosSent} size={22} />
            <ThemedText variant="badgeLg" style={[styles.kudosPillText, kudosSent && styles.kudosPillTextSent]}>
              {kudosSent ? t('kudosSent') : t('sendKudos')}
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}
    </View>
  ) : null

  return (
    <View style={styles.cardWrapper}>
      {/* Metadata row */}
      <View style={styles.chatMetaRow}>
        <View style={styles.metaDateRow}>
          <ThemedText variant="caption" color="secondary">{formatDate(endTime || startTime, t)}</ThemedText>
          {isActive && <View style={styles.activeDot} />}
        </View>
        <View style={styles.metaRightRow}>
          <View style={[styles.metaBadge, { backgroundColor: endTypeInfo.color + '20' }]}>
            <MetaBadgeIcon endTypeInfo={endTypeInfo} />
            <ThemedText variant="badgeLg" style={{ color: endTypeInfo.color }}>{endTypeInfo.label}</ThemedText>
          </View>
          {!isActive && onReport && (
            <TouchableOpacity
              onPress={() => onReport(chat.id)}
              style={styles.reportIconButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('reportChatA11y')}
            >
              <Ionicons name="flag-outline" size={16} color={colors.secondaryText} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('viewChatA11y')}>
        <CardShell
          accentColor={agreedClosure ? colors.agreeSurface : colors.cardBackground}
          bottomSection={closureBottomSection}
          bottomStyle={styles.closureBottom}
        >
          <PositionInfoCard
            position={positionWithOtherUser}
            authorSubtitle="username"
            numberOfLines={3}
          />
        </CardShell>
      </TouchableOpacity>
    </View>
  )
}

export default function Chats() {
  const { user } = useContext(UserContext)
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { t } = useTranslation('chat')

  const [chats, setChats] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [fromCache, setFromCache] = useState(false)
  const cachedMetadataRef = useRef(null)
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [reportChatId, setReportChatId] = useState(null)

  const fetchChats = useCallback(async (isRefresh = false) => {
    if (!user?.id) return

    const cacheKey = CacheKeys.userChats(user.id)

    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)

      // Try to show cached data immediately (stale-while-revalidate)
      if (!isRefresh) {
        const cached = await CacheManager.get(cacheKey)
        if (cached?.data) {
          setChats(cached.data)
          setFromCache(true)
          setLoading(false)
          cachedMetadataRef.current = cached.metadata
        }
      }

      // Check metadata to see if we need to fetch fresh data
      const shouldFetch = await (async () => {
        if (isRefresh) return true // Always fetch on pull-to-refresh

        try {
          const metadata = await api.chat.getUserChatsMetadata(user.id)
          const cached = await CacheManager.get(cacheKey)

          // No cache - need to fetch
          if (!cached) return true

          // Check if count changed
          if (metadata.count !== cached.metadata?.count) return true

          // Check if last activity time changed
          if (metadata.lastActivityTime !== cached.metadata?.lastActivityTime) return true

          // Cache is fresh - no need to fetch
          return false
        } catch {
          // If metadata check fails, fetch full data to be safe
          return true
        }
      })()

      if (shouldFetch) {
        const data = await api.chat.getUserChats(user.id, { limit: 50 })
        setChats(data)
        setFromCache(false)

        // Get fresh metadata for cache
        let metadata = null
        try {
          metadata = await api.chat.getUserChatsMetadata(user.id)
        } catch {
          metadata = { count: data.length, lastActivityTime: new Date().toISOString() }
        }

        // Cache the result
        await CacheManager.set(cacheKey, data, { metadata })
      }
    } catch (err) {
      console.error('Failed to fetch chats:', err)
      // If we have cached data, show it with a warning
      const cached = await CacheManager.get(cacheKey)
      if (cached?.data) {
        setChats(cached.data)
        setFromCache(true)
      }
      setError(translateError(err.message, t) || t('failedLoadChats'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchChats()
  }, [fetchChats])

  const handleChatPress = useCallback((chat) => {
    // Pass 'from' parameter so the chat page knows to navigate back to chats
    router.push(`/chat/${chat.id}?from=chats`)
  }, [router])

  const handleSendKudos = useCallback(async (chatId) => {
    try {
      await api.chat.sendKudos(chatId)
      // Update local state to reflect kudos sent
      setChats(prev => prev.map(chat =>
        chat.id === chatId ? { ...chat, kudosSent: true } : chat
      ))
      // Invalidate chat list cache since kudos status changed
      if (user?.id) {
        await CacheManager.invalidate(CacheKeys.userChats(user.id))
      }
    } catch (err) {
      console.error('Failed to send kudos:', err)
    }
  }, [user?.id])

  const handleRefresh = useCallback(() => {
    fetchChats(true)
  }, [fetchChats])

  const handleReportChat = useCallback((chatId) => {
    setReportChatId(chatId)
    setReportModalVisible(true)
  }, [])

  const handleSubmitChatReport = useCallback(async (ruleId, comment) => {
    if (!reportChatId) return
    await api.moderation.reportChat(reportChatId, ruleId, comment)
    setReportModalVisible(false)
  }, [reportChatId])

  const renderChatItem = useCallback(({ item }) => (
    <ChatHistoryCard
      chat={item}
      onPress={() => handleChatPress(item)}
      onSendKudos={handleSendKudos}
      onReport={handleReportChat}
      currentUserId={user?.id}
      colors={colors}
      styles={styles}
    />
  ), [handleChatPress, handleSendKudos, handleReportChat, user?.id, colors, styles])

  const keyExtractor = useCallback((item) => item.id, [])

  const renderEmpty = () => {
    if (loading) return null
    return (
      <EmptyState
        icon="chatbubbles-outline"
        title={t('noChatsTitle')}
        subtitle={t('noChatsSubtitle')}
        style={styles.emptyContainer}
      />
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={styles.sectionHeader}>
        <ThemedText variant="h1" color="primary">{t('chatHistory')}</ThemedText>
        <ThemedText variant="bodySmall" color="secondary" style={styles.subtitle}>{chats.length === 1 ? t('conversationCountOne', { count: chats.length }) : t('conversationCount', { count: chats.length })}</ThemedText>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={24} color={SemanticColors.warning} />
          <ThemedText variant="bodySmall" style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity onPress={() => fetchChats()} style={styles.retryButton} accessibilityRole="button" accessibilityLabel={t('retry')}>
            <ThemedText variant="badgeLg" color="inverse">{t('retry')}</ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={chats}
          renderItem={renderChatItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      )}

      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        onSubmit={handleSubmitChatReport}
      />
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  subtitle: {
    marginTop: 4,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorBannerBg,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: SemanticColors.warning,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: SemanticColors.warning,
    borderRadius: 6,
  },
  emptyContainer: {
    paddingBottom: 100,
  },

  // Card wrapper and metadata row
  cardWrapper: {
    marginBottom: 16,
  },
  chatMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  metaDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  metaRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reportIconButton: {
    padding: 2,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: SemanticColors.agree,
  },

  // Closure bottom section
  closureBottom: {
    padding: 12,
  },
  closureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closureText: {
    flex: 1,
  },

  // Kudos row styles (for agreed closures)
  kudosRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  kudosLeft: {
    flex: 1,
    alignItems: 'flex-start',
  },
  kudosReceivedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kudosReceivedText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  kudosPlaceholder: {
    width: 28,
    height: 28,
  },
  kudosPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 248, 220, 0.25)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    width: 130,
    justifyContent: 'center',
  },
  kudosPillButtonSent: {
    backgroundColor: 'rgba(255, 215, 0, 0.3)',
  },
  kudosPillText: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  kudosPillTextSent: {
    color: '#FFFFFF',
  },
})
