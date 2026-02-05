import { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import { chatApiWrapper } from '../../lib/api'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')
const ANIM_DURATION = 300

/**
 * Modal showing all agreed statements from a chat
 *
 * @param {Object} props
 * @param {boolean} props.visible - Whether modal is visible
 * @param {Function} props.onClose - Callback when modal is closed
 * @param {string} props.chatLogId - ID of the chat log to fetch
 * @param {string|Object} props.closureText - Agreed closure text from the closure card
 */
export default function AgreedStatementsModal({ visible, onClose, chatLogId, closureText: closureTextProp }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [chatData, setChatData] = useState(null)
  const [modalVisible, setModalVisible] = useState(false)

  const overlayOpacity = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current

  // Animate in when visible becomes true, animate out when false
  useEffect(() => {
    if (visible) {
      setModalVisible(true)
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [visible])

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: ANIM_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: ANIM_DURATION,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setModalVisible(false)
      onClose()
    })
  }

  useEffect(() => {
    if (visible && chatLogId) {
      fetchChatLog()
    }
  }, [visible, chatLogId])

  const fetchChatLog = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await chatApiWrapper.getChatLog(chatLogId)
      setChatData(data)
    } catch (err) {
      console.error('Error fetching chat log:', err)
      setError(err.message || 'Failed to load chat log')
    } finally {
      setLoading(false)
    }
  }

  // Resolve closure text from prop or fetched data
  const resolvedClosureText = (() => {
    const fetchedClosure = chatData?.log?.agreedClosure
    return fetchedClosure?.content || closureTextProp?.content
  })()

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading agreed statements...</Text>
        </View>
      )
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.disagree} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchChatLog}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )
    }

    const log = chatData?.log || {}
    const agreedPositions = log.agreedPositions || []

    return (
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Agreed Positions - chronological order from the chat */}
        {agreedPositions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Agreed Statements ({agreedPositions.length})</Text>
            {agreedPositions.map((statement, index) => (
              <View key={index} style={styles.statementCard}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.agree} />
                <Text style={styles.statementText}>{statement.content || statement}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Final Agreed Closure - last item */}
        {resolvedClosureText && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Final Agreement</Text>
            <View style={styles.closureCard}>
              <Ionicons name="ribbon-outline" size={20} color={Colors.primary} />
              <Text style={styles.closureText}>"{resolvedClosureText}"</Text>
            </View>
          </View>
        )}

        {/* No data case */}
        {!resolvedClosureText && agreedPositions.length === 0 && !loading && (
          <View style={styles.centerContainer}>
            <Ionicons name="document-text-outline" size={48} color={Colors.pass} />
            <Text style={styles.noDataText}>No agreed statements in this chat.</Text>
          </View>
        )}
      </ScrollView>
    )
  }

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.modalContainer}>
        {/* Overlay - fades in/out independently */}
        <Animated.View
          style={[styles.overlayBackground, { opacity: overlayOpacity }]}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
        </Animated.View>

        {/* Drawer content - slides up/down */}
        <Animated.View style={[styles.content, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Agreed Statements</Text>
              <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                <Ionicons name="close" size={24} color={Colors.light.text} />
              </TouchableOpacity>
            </View>
          </View>

          {renderContent()}

          <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlayBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  content: {
    backgroundColor: Colors.light.cardBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: '80%',
  },
  header: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.pass,
    marginTop: 12,
  },
  errorText: {
    fontSize: 14,
    color: Colors.disagree,
    textAlign: 'center',
    marginTop: 12,
  },
  noDataText: {
    fontSize: 14,
    color: Colors.pass,
    textAlign: 'center',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 12,
  },
  statementCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.agree + '10',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  statementText: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.text,
    lineHeight: 20,
  },
  closureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.primary + '15',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    gap: 10,
  },
  closureText: {
    flex: 1,
    fontSize: 15,
    fontStyle: 'italic',
    color: Colors.light.text,
    lineHeight: 22,
  },
  doneButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
})
