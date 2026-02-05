import { StyleSheet, View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useState, useEffect, useContext, useRef } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import Header from '../../components/Header'
import CardShell from '../../components/CardShell'
import PositionInfoCard from '../../components/PositionInfoCard'
import { UserContext } from '../../contexts/UserContext'
import api from '../../lib/api'
import { CacheManager, CacheKeys, CacheDurations } from '../../lib/cache'

const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'long' })
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
  }
}

const getEndTypeLabel = (endType, endedByUserId, currentUserId) => {
  switch (endType) {
    case 'mutual_agreement':
    case 'agreed_closure':
      return { label: 'Agreed', color: Colors.agree, icon: 'handshake-outline', iconType: 'material-community' }
    case 'disagreement':
      return { label: 'Disagreed', color: Colors.disagree, icon: 'close-circle' }
    case 'timeout':
      return { label: 'Timed Out', color: Colors.pass, icon: 'time' }
    case 'abandoned':
    case 'user_exit':
      if (endedByUserId && currentUserId) {
        if (endedByUserId === currentUserId) {
          return { label: 'You left', color: Colors.pass, icon: 'exit-outline' }
        } else {
          return { label: 'They left', color: Colors.pass, icon: 'exit-outline' }
        }
      }
      return { label: 'Ended', color: Colors.pass, icon: 'exit' }
    default:
      return { label: 'Active', color: Colors.primary, icon: 'chatbubbles' }
  }
}

// Kudos medallion component
function KudosMedallion({ active, size = 32 }) {
  const goldColor = active ? '#FFD700' : '#9CA3AF'
  const starColor = active ? '#B8860B' : '#6B7280'
  const ringColor = active ? '#DAA520' : '#D1D5DB'

  return (
    <View style={[kudosMedallionStyles.container, { width: size, height: size }]}>
      {/* Outer ring */}
      <View style={[
        kudosMedallionStyles.ring,
        { borderColor: ringColor, width: size, height: size, borderRadius: size / 2 }
      ]}>
        {/* Inner medallion */}
        <View style={[
          kudosMedallionStyles.medallion,
          { backgroundColor: goldColor, width: size - 6, height: size - 6, borderRadius: (size - 6) / 2 }
        ]}>
          <Ionicons name="star" size={size * 0.5} color={starColor} />
        </View>
      </View>
    </View>
  )
}

const kudosMedallionStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medallion: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})

function MetaBadgeIcon({ endTypeInfo }) {
  if (endTypeInfo.iconType === 'material-community') {
    return <MaterialCommunityIcons name={endTypeInfo.icon} size={14} color={endTypeInfo.color} />
  }
  return <Ionicons name={endTypeInfo.icon} size={14} color={endTypeInfo.color} />
}

function ChatHistoryCard({ chat, onPress, onSendKudos, currentUserId }) {
  const { position, otherUser, agreedClosure, startTime, endTime, endType, status, endedByUserId, kudosSent, kudosReceived } = chat
  const endTypeInfo = getEndTypeLabel(endType, endedByUserId, currentUserId)
  const isActive = status === 'active' && !endTime
  const showKudosSection = agreedClosure != null

  const positionWithOtherUser = position ? { ...position, creator: otherUser } : position

  const closureBottomSection = agreedClosure ? (
    <View>
      <Text style={styles.closureText} numberOfLines={2}>{agreedClosure?.content}</Text>

      {showKudosSection && (
        <View style={styles.kudosRow}>
          <View style={styles.kudosLeft}>
            {kudosReceived ? (
              <View style={styles.kudosReceivedContainer}>
                <KudosMedallion active={true} size={28} />
                <Text style={styles.kudosReceivedText}>{otherUser?.displayName || 'Someone'} sent you kudos</Text>
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
          >
            <KudosMedallion active={kudosSent} size={22} />
            <Text style={[styles.kudosPillText, kudosSent && styles.kudosPillTextSent]}>
              {kudosSent ? 'Sent!' : 'Send Kudos'}
            </Text>
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
          <Text style={styles.metaDate}>{formatDate(endTime || startTime)}</Text>
          {isActive && <View style={styles.activeDot} />}
        </View>
        <View style={[styles.metaBadge, { backgroundColor: endTypeInfo.color + '20' }]}>
          <MetaBadgeIcon endTypeInfo={endTypeInfo} />
          <Text style={[styles.metaBadgeText, { color: endTypeInfo.color }]}>{endTypeInfo.label}</Text>
        </View>
      </View>

      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <CardShell
          accentColor={agreedClosure ? Colors.agree : Colors.cardBackground}
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
  const [chats, setChats] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [fromCache, setFromCache] = useState(false)
  const cachedMetadataRef = useRef(null)

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
      setError(err.message || 'Failed to load chat history')
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

  const renderChatItem = useCallback(({ item }) => (
    <ChatHistoryCard
      chat={item}
      onPress={() => handleChatPress(item)}
      onSendKudos={handleSendKudos}
      currentUserId={user?.id}
    />
  ), [handleChatPress, handleSendKudos, user?.id])

  const keyExtractor = useCallback((item) => item.id, [])

  const renderEmpty = () => {
    if (loading) return null
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="chatbubbles-outline" size={64} color={Colors.pass} />
        <Text style={styles.emptyTitle}>No chats yet</Text>
        <Text style={styles.emptySubtitle}>
          Start a conversation by swiping up on a position card
        </Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header />
      <View style={styles.sectionHeader}>
        <Text style={styles.title}>Chat History</Text>
        <Text style={styles.subtitle}>{chats.length} conversation{chats.length !== 1 ? 's' : ''}</Text>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={24} color={Colors.warning} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchChats()} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
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
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.primary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.pass,
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
    backgroundColor: '#FFEBEE',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: Colors.warning,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.warning,
    borderRadius: 6,
  },
  retryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.light.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.pass,
    textAlign: 'center',
    marginTop: 8,
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
  metaDate: {
    fontSize: 12,
    color: Colors.pass,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  metaBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.agree,
  },

  // Closure bottom section
  closureBottom: {
    padding: 12,
  },
  closureText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
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
    fontSize: 12,
    color: '#fff',
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
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  kudosPillTextSent: {
    color: '#FFD700',
  },
})
