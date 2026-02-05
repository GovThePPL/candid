import { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import { chatApiWrapper } from '../../lib/api'
import BottomDrawerModal from '../BottomDrawerModal'
import LoadingView from '../LoadingView'
import EmptyState from '../EmptyState'

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
      return <LoadingView message="Loading agreed statements..." />
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
          <EmptyState
            icon="document-text-outline"
            title="No agreed statements in this chat."
          />
        )}
      </ScrollView>
    )
  }

  return (
    <BottomDrawerModal
      visible={visible}
      onClose={onClose}
      title="Agreed Statements"
      maxHeight="80%"
    >
      <View style={styles.contentWrapper}>
        {renderContent()}

        <TouchableOpacity style={styles.doneButton} onPress={onClose}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    </BottomDrawerModal>
  )
}

const styles = StyleSheet.create({
  contentWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    flex: 1,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  errorText: {
    fontSize: 14,
    color: Colors.disagree,
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
    color: Colors.white,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
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
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
})
