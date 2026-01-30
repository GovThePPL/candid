import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Image,
  Animated,
  useWindowDimensions,
} from 'react-native'
import { useState, useEffect, useRef, useCallback, useContext } from 'react'
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../../constants/Colors'
import { UserContext } from '../../../contexts/UserContext'
import api from '../../../lib/api'
import {
  joinChat,
  sendMessage,
  onMessage,
  sendTyping,
  onTyping,
  exitChat,
  onChatStatus,
  isConnected,
} from '../../../lib/socket'

const getTrustBadgeColor = (trustScore) => {
  if (trustScore == null || trustScore < 0.35) return Colors.trustBadgeGray
  if (trustScore < 0.6) return Colors.trustBadgeBronze
  if (trustScore < 0.9) return Colors.trustBadgeSilver
  return Colors.trustBadgeGold
}

export default function ChatScreen() {
  const { id: chatId } = useLocalSearchParams()
  const router = useRouter()
  const navigation = useNavigation()
  const { user } = useContext(UserContext)
  const { height: screenHeight } = useWindowDimensions()

  // Max input height is 40% of screen
  const maxInputHeight = screenHeight * 0.4

  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [chatInfo, setChatInfo] = useState(null)
  const [otherUserTyping, setOtherUserTyping] = useState(false)
  const [chatEnded, setChatEnded] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  const flatListRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const isTypingRef = useRef(false)

  // Animated values for typing dots
  const dot1Anim = useRef(new Animated.Value(0)).current
  const dot2Anim = useRef(new Animated.Value(0)).current
  const dot3Anim = useRef(new Animated.Value(0)).current

  // Get other user from chat info
  const otherUser = chatInfo?.otherUser

  // Hide tab bar when chat screen is active
  useEffect(() => {
    const parent = navigation.getParent()
    parent?.setOptions({ tabBarStyle: { display: 'none' } })

    return () => {
      // Restore tab bar when leaving
      parent?.setOptions({ tabBarStyle: undefined })
    }
  }, [navigation])

  // Animate typing dots when other user is typing
  useEffect(() => {
    if (otherUserTyping) {
      const animateDots = () => {
        Animated.loop(
          Animated.sequence([
            Animated.stagger(150, [
              Animated.sequence([
                Animated.timing(dot1Anim, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.timing(dot1Anim, { toValue: 0, duration: 300, useNativeDriver: true }),
              ]),
              Animated.sequence([
                Animated.timing(dot2Anim, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.timing(dot2Anim, { toValue: 0, duration: 300, useNativeDriver: true }),
              ]),
              Animated.sequence([
                Animated.timing(dot3Anim, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.timing(dot3Anim, { toValue: 0, duration: 300, useNativeDriver: true }),
              ]),
            ]),
          ])
        ).start()
      }
      animateDots()
    } else {
      dot1Anim.setValue(0)
      dot2Anim.setValue(0)
      dot3Anim.setValue(0)
    }
  }, [otherUserTyping, dot1Anim, dot2Anim, dot3Anim])

  // Join chat and set up listeners
  useEffect(() => {
    let cleanupMessage = null
    let cleanupTyping = null
    let cleanupStatus = null

    async function initChat() {
      try {
        setLoading(true)
        setError(null)

        // Check socket connection
        if (!isConnected()) {
          setError('Not connected to chat server. Please try again.')
          setLoading(false)
          return
        }

        // Join the chat room
        const joinResponse = await joinChat(chatId)
        setMessages(joinResponse.messages || [])

        // Get chat log info from API for position statement
        try {
          const chatLog = await api.chat.getChatLog(chatId)
          setChatInfo(chatLog)
          if (chatLog.status === 'ended') {
            setChatEnded(true)
          }
        } catch (err) {
          console.error('Failed to get chat log:', err)
        }

        // Set up message listener
        cleanupMessage = onMessage((message) => {
          setMessages(prev => [...prev, message])
        })

        // Set up typing listener
        cleanupTyping = onTyping((data) => {
          if (data.userId !== user?.id) {
            setOtherUserTyping(data.isTyping)
          }
        })

        // Set up chat status listener
        cleanupStatus = onChatStatus((data) => {
          if (data.chatId === chatId && (data.status === 'ended' || data.type === 'chat_ended')) {
            setChatEnded(true)
          }
        })

        setLoading(false)
      } catch (err) {
        console.error('Failed to join chat:', err)
        setError(err.message || 'Failed to join chat')
        setLoading(false)
      }
    }

    initChat()

    return () => {
      if (cleanupMessage) cleanupMessage()
      if (cleanupTyping) cleanupTyping()
      if (cleanupStatus) cleanupStatus()
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [chatId, user?.id])

  // Handle sending a message
  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || chatEnded) return

    try {
      setInputText('')

      // Stop typing indicator
      if (isTypingRef.current) {
        sendTyping(chatId, false)
        isTypingRef.current = false
      }

      // Send via socket
      await sendMessage(chatId, text, 'text')
    } catch (err) {
      console.error('Failed to send message:', err)
      // Restore the input text on error
      setInputText(text)
    }
  }, [chatId, inputText, chatEnded])

  // Handle typing indicator
  const handleTextChange = useCallback((text) => {
    setInputText(text)

    // Send typing indicator
    if (text.length > 0 && !isTypingRef.current) {
      sendTyping(chatId, true)
      isTypingRef.current = true
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        sendTyping(chatId, false)
        isTypingRef.current = false
      }
    }, 2000)
  }, [chatId])

  // Show leave confirmation
  const handleBackPress = useCallback(() => {
    if (chatEnded) {
      router.back()
    } else {
      setShowLeaveConfirm(true)
    }
  }, [chatEnded, router])

  // Handle confirmed exit chat
  const handleConfirmLeave = useCallback(async () => {
    setShowLeaveConfirm(false)
    try {
      await exitChat(chatId, 'left')
    } catch (err) {
      console.error('Failed to exit chat:', err)
    }
    router.back()
  }, [chatId, router])

  // Cancel leaving
  const handleCancelLeave = useCallback(() => {
    setShowLeaveConfirm(false)
  }, [])

  // Render a message bubble
  const renderMessage = useCallback(({ item, index }) => {
    // Compare as strings to handle UUID format differences
    const senderId = String(item.senderId || item.sender || '')
    const currentUserId = String(user?.id || '')
    const isOwnMessage = senderId === currentUserId
    const messageTime = item.sendTime
      ? new Date(item.sendTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : ''

    if (isOwnMessage) {
      return (
        <View style={styles.ownMessageRow}>
          <View style={[styles.messageBubble, styles.ownMessage]}>
            <Text style={[styles.messageText, styles.ownMessageText]}>
              {item.content}
            </Text>
            {messageTime && (
              <Text style={[styles.messageTime, styles.ownMessageTime]}>
                {messageTime}
              </Text>
            )}
          </View>
        </View>
      )
    }

    // Check if this is the last message in a group from the other user
    // Avatar shows only on the last consecutive message from the other user
    const nextMessage = messages[index + 1]
    const nextSenderId = nextMessage ? String(nextMessage.senderId || nextMessage.sender || '') : null
    const isLastInGroup = !nextMessage || nextSenderId === currentUserId

    // Other user's message
    return (
      <View style={styles.otherMessageRow}>
        {isLastInGroup ? (
          otherUser?.avatarUrl ? (
            <Image source={{ uri: otherUser.avatarUrl }} style={styles.messageAvatar} />
          ) : (
            <View style={[styles.messageAvatar, styles.messageAvatarPlaceholder]}>
              <Text style={styles.messageAvatarInitial}>
                {otherUser?.displayName?.[0]?.toUpperCase() || '?'}
              </Text>
            </View>
          )
        ) : (
          <View style={styles.messageAvatarSpacer} />
        )}
        <View style={[styles.messageBubble, styles.otherMessage]}>
          <Text style={[styles.messageText, styles.otherMessageText]}>
            {item.content}
          </Text>
          {messageTime && (
            <Text style={[styles.messageTime, styles.otherMessageTime]}>
              {messageTime}
            </Text>
          )}
        </View>
      </View>
    )
  }, [user?.id, otherUser, messages])

  // Leave confirmation modal
  const renderLeaveConfirmModal = () => (
    <Modal
      visible={showLeaveConfirm}
      transparent
      animationType="fade"
      onRequestClose={handleCancelLeave}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={handleCancelLeave}
      >
        <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
          <Text style={styles.modalTitle}>Leave Chat?</Text>
          <Text style={styles.modalMessage}>
            Are you sure you want to leave this conversation? You can return to it later from your chat history.
          </Text>
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={handleCancelLeave}
            >
              <Text style={styles.modalCancelText}>Stay</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalConfirmButton}
              onPress={handleConfirmLeave}
            >
              <Text style={styles.modalConfirmText}>Leave</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Chat</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Joining chat...</Text>
        </View>
        {renderLeaveConfirmModal()}
      </SafeAreaView>
    )
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Chat</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {otherUser ? (
            <View style={styles.headerUserInfo}>
              <View style={styles.headerAvatarContainer}>
                {otherUser.avatarUrl ? (
                  <Image source={{ uri: otherUser.avatarUrl }} style={styles.headerAvatar} />
                ) : (
                  <View style={[styles.headerAvatar, styles.headerAvatarPlaceholder]}>
                    <Text style={styles.headerAvatarInitial}>
                      {otherUser.displayName?.[0]?.toUpperCase() || '?'}
                    </Text>
                  </View>
                )}
                <View style={[styles.headerTrustBadge, { backgroundColor: getTrustBadgeColor(otherUser.trustScore) }]}>
                  <Ionicons name="star" size={8} color={Colors.primary} />
                  <Text style={styles.headerTrustCount}>{otherUser.kudosCount || 0}</Text>
                </View>
              </View>
              <View style={styles.headerUserText}>
                <Text style={styles.headerDisplayName} numberOfLines={1}>{otherUser.displayName}</Text>
                <Text style={styles.headerUsername} numberOfLines={1}>@{otherUser.username}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.headerTitle} numberOfLines={1}>Chat</Text>
          )}
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.headerKudosBadge, { backgroundColor: getTrustBadgeColor(user?.trustScore) }]}>
            <Ionicons name="star" size={14} color={Colors.primary} />
            <Text style={styles.headerKudosCount}>{user?.kudosCount || 0}</Text>
          </View>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.headerUserAvatar} />
          ) : (
            <View style={[styles.headerUserAvatar, styles.headerUserAvatarPlaceholder]}>
              <Text style={styles.headerUserAvatarInitial}>
                {user?.displayName?.[0]?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Chat ended banner */}
      {chatEnded && (
        <View style={styles.endedBanner}>
          <Text style={styles.endedText}>This chat has ended</Text>
        </View>
      )}

      {/* Messages list */}
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item, index) => item.id || `msg-${index}`}
          contentContainerStyle={styles.messagesList}
          inverted={false}
          onContentSizeChange={() => {
            flatListRef.current?.scrollToEnd({ animated: true })
          }}
          ListHeaderComponent={
            chatInfo?.positionStatement ? (
              <View style={styles.topicCard}>
                <Text style={styles.topicLabel}>Topic of Discussion</Text>
                <Text style={styles.topicStatement}>{chatInfo.positionStatement}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubbles-outline" size={48} color={Colors.pass} />
              <Text style={styles.emptyChatText}>
                Start the conversation!
              </Text>
            </View>
          }
          ListFooterComponent={
            otherUserTyping ? (
              <View style={styles.typingRow}>
                {otherUser?.avatarUrl ? (
                  <Image source={{ uri: otherUser.avatarUrl }} style={styles.messageAvatar} />
                ) : (
                  <View style={[styles.messageAvatar, styles.messageAvatarPlaceholder]}>
                    <Text style={styles.messageAvatarInitial}>
                      {otherUser?.displayName?.[0]?.toUpperCase() || '?'}
                    </Text>
                  </View>
                )}
                <View style={styles.typingBubble}>
                  <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }]} />
                  <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }]} />
                  <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot3Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }]} />
                </View>
              </View>
            ) : null
          }
        />

        {/* Input area */}
        {!chatEnded && (
          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, { maxHeight: maxInputHeight }]}
              value={inputText}
              onChangeText={handleTextChange}
              placeholder="Type a message..."
              placeholderTextColor={Colors.pass}
              multiline
              maxLength={1000}
              returnKeyType="send"
              blurOnSubmit={false}
              scrollEnabled={true}
              onSubmitEditing={Platform.OS !== 'web' ? handleSend : undefined}
              onKeyPress={(e) => {
                // On web: Enter sends, Shift+Enter adds newline
                if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                !inputText.trim() && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!inputText.trim()}
            >
              <Ionicons
                name="send"
                size={20}
                color={inputText.trim() ? '#fff' : Colors.pass}
              />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {renderLeaveConfirmModal()}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    }),
  },
  headerUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatarContainer: {
    position: 'relative',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerAvatarPlaceholder: {
    backgroundColor: Colors.agree,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  headerTrustBadge: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 8,
    gap: 2,
  },
  headerTrustCount: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.primary,
  },
  headerUserText: {
    flex: 1,
  },
  headerDisplayName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  headerUsername: {
    fontSize: 12,
    color: Colors.pass,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerKudosBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 2,
  },
  headerKudosCount: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  headerUserAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  headerUserAvatarPlaceholder: {
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerUserAvatarInitial: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.pass,
    marginTop: 2,
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },
  ownMessageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  otherMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
    gap: 8,
  },
  messageAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  messageAvatarPlaceholder: {
    backgroundColor: Colors.agree,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageAvatarInitial: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  messageAvatarSpacer: {
    width: 28,
    height: 28,
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  ownMessage: {
    backgroundColor: Colors.messageYou,
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    backgroundColor: Colors.agree,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: '#fff',
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
  },
  ownMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
  otherMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
    gap: 8,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.agree,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    gap: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)',
    }),
  },
  input: {
    flex: 1,
    backgroundColor: Colors.light.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 40,
    color: Colors.light.text,
    textAlignVertical: 'center',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    alignSelf: 'flex-end',
    marginBottom: 0,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.cardBorder,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.pass,
  },
  errorText: {
    fontSize: 16,
    color: Colors.warning,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyChatText: {
    marginTop: 12,
    fontSize: 16,
    color: Colors.pass,
  },
  endedBanner: {
    backgroundColor: Colors.pass,
    paddingVertical: 8,
    alignItems: 'center',
  },
  endedText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 15,
    color: Colors.pass,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButtons: {
    width: '100%',
    gap: 12,
  },
  modalCancelButton: {
    paddingVertical: 14,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  modalConfirmButton: {
    paddingVertical: 14,
    borderRadius: 25,
    backgroundColor: Colors.disagree,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  topicCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  topicLabel: {
    fontSize: 12,
    color: Colors.pass,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  topicStatement: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.primary,
    lineHeight: 22,
  },
})
