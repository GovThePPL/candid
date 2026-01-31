import { StyleSheet, View, Text, FlatList, TouchableOpacity, Image, RefreshControl, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useState, useEffect, useContext } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import Header from '../../components/Header'
import { UserContext } from '../../contexts/UserContext'
import api from '../../lib/api'

const getTrustBadgeColor = (trustScore) => {
  if (trustScore == null || trustScore < 0.35) return Colors.trustBadgeGray
  if (trustScore < 0.6) return Colors.trustBadgeBronze
  if (trustScore < 0.9) return Colors.trustBadgeSilver
  return Colors.trustBadgeGold
}

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

const getEndTypeLabel = (endType) => {
  switch (endType) {
    case 'mutual_agreement':
    case 'agreed_closure':
      return { label: 'Agreed', color: Colors.agree, icon: 'checkmark-circle' }
    case 'disagreement':
      return { label: 'Disagreed', color: Colors.disagree, icon: 'close-circle' }
    case 'timeout':
      return { label: 'Timed Out', color: Colors.pass, icon: 'time' }
    case 'abandoned':
    case 'user_exit':
      return { label: 'Ended', color: Colors.pass, icon: 'exit' }
    default:
      return { label: 'Active', color: Colors.primary, icon: 'chatbubbles' }
  }
}

function ChatHistoryCard({ chat, onPress }) {
  const { position, otherUser, agreedClosure, startTime, endTime, endType, status } = chat
  const endTypeInfo = getEndTypeLabel(endType)
  const isActive = status === 'active' && !endTime

  return (
    <TouchableOpacity style={styles.chatCard} onPress={onPress} activeOpacity={0.7}>
      {/* Time Header */}
      <View style={styles.timeHeader}>
        <Text style={styles.timeText}>{formatDate(endTime || startTime)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: endTypeInfo.color + '20' }]}>
          <Ionicons name={endTypeInfo.icon} size={14} color={endTypeInfo.color} />
          <Text style={[styles.statusText, { color: endTypeInfo.color }]}>{endTypeInfo.label}</Text>
        </View>
      </View>

      {/* Position Card Section */}
      <View style={styles.positionSection}>
        <View style={styles.positionHeader}>
          {position?.location?.code && (
            <View style={styles.locationBadge}>
              <Text style={styles.locationCode}>{position.location.code}</Text>
            </View>
          )}
          {position?.category?.name && (
            <Text style={styles.categoryName}>{position.category.name}</Text>
          )}
        </View>
        <Text style={styles.positionStatement} numberOfLines={3}>
          {position?.statement}
        </Text>
      </View>

      {/* Agreed Closure Section */}
      {agreedClosure && (
        <View style={styles.closureSection}>
          <View style={styles.closureHeader}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.agree} />
            <Text style={styles.closureLabel}>Agreed Closure</Text>
          </View>
          <Text style={styles.closureText} numberOfLines={2}>{agreedClosure}</Text>
        </View>
      )}

      {/* Other User Section */}
      <View style={styles.userSection}>
        <Text style={styles.chatWithLabel}>Chat with</Text>
        <View style={styles.userInfo}>
          <View style={styles.avatarContainer}>
            {otherUser?.avatarUrl ? (
              <Image source={{ uri: otherUser.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>
                  {otherUser?.displayName?.[0]?.toUpperCase() || '?'}
                </Text>
              </View>
            )}
            {otherUser?.kudosCount > 0 && (
              <View style={[styles.kudosBadge, { backgroundColor: getTrustBadgeColor(otherUser?.trustScore) }]}>
                <Ionicons name="star" size={8} color={Colors.primary} />
                <Text style={styles.kudosCount}>{otherUser.kudosCount}</Text>
              </View>
            )}
          </View>
          <View style={styles.userText}>
            <Text style={styles.displayName}>{otherUser?.displayName || 'Anonymous'}</Text>
            <Text style={styles.username}>@{otherUser?.username || 'anonymous'}</Text>
          </View>
        </View>
        {isActive && (
          <View style={styles.activeBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>Active now</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

export default function Chats() {
  const { user } = useContext(UserContext)
  const router = useRouter()
  const [chats, setChats] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const fetchChats = useCallback(async (isRefresh = false) => {
    if (!user?.id) return

    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)

      const data = await api.chat.getUserChats(user.id, { limit: 50 })
      setChats(data)
    } catch (err) {
      console.error('Failed to fetch chats:', err)
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

  const handleRefresh = useCallback(() => {
    fetchChats(true)
  }, [fetchChats])

  const renderChatItem = useCallback(({ item }) => (
    <ChatHistoryCard
      chat={item}
      onPress={() => handleChatPress(item)}
    />
  ), [handleChatPress])

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

  // Chat Card Styles
  chatCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  timeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  timeText: {
    fontSize: 13,
    color: Colors.pass,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Position Section
  positionSection: {
    padding: 16,
    paddingBottom: 12,
  },
  positionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  locationBadge: {
    backgroundColor: Colors.primaryMuted + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  locationCode: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  categoryName: {
    fontSize: 12,
    color: Colors.primary,
  },
  positionStatement: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
    lineHeight: 22,
  },

  // Closure Section
  closureSection: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.agree,
  },
  closureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  closureLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.agree,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  closureText: {
    fontSize: 14,
    color: '#1a1a1a',
    lineHeight: 20,
  },

  // User Section
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  chatWithLabel: {
    fontSize: 12,
    color: Colors.pass,
    marginRight: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  kudosBadge: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    borderRadius: 6,
    paddingHorizontal: 3,
    paddingVertical: 1,
    minWidth: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  kudosCount: {
    fontSize: 8,
    fontWeight: '700',
    color: Colors.primary,
  },
  userText: {
    flexDirection: 'column',
  },
  displayName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  username: {
    fontSize: 11,
    color: Colors.pass,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.agree,
  },
  activeText: {
    fontSize: 12,
    color: Colors.agree,
    fontWeight: '500',
  },
})
