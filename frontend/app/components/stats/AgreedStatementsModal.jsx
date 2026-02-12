import { useState, useEffect, useMemo } from 'react'
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SemanticColors, BrandColor } from '../../constants/Colors'
import { Typography } from '../../constants/Theme'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../ThemedText'
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
  const { t } = useTranslation('stats')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

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
      setError(err.message || t('failedLoadChatLog'))
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
      return <LoadingView message={t('loadingAgreedStatements')} />
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={SemanticColors.disagree} />
          <ThemedText variant="bodySmall" style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity style={styles.retryButton} onPress={fetchChatLog} accessibilityRole="button" accessibilityLabel={t('common:retry')}>
            <ThemedText variant="buttonSmall" color="inverse">{t('common:retry')}</ThemedText>
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
            <ThemedText variant="buttonSmall" style={styles.sectionTitle}>{t('agreedStatementsCount', { count: agreedPositions.length })}</ThemedText>
            {agreedPositions.map((statement, index) => (
              <View key={index} style={styles.statementCard}>
                <Ionicons name="checkmark-circle" size={18} color={SemanticColors.agree} />
                <ThemedText variant="bodySmall" style={styles.statementText}>{statement.content || statement}</ThemedText>
              </View>
            ))}
          </View>
        )}

        {/* Final Agreed Closure - last item */}
        {resolvedClosureText && (
          <View style={styles.section}>
            <ThemedText variant="buttonSmall" style={styles.sectionTitle}>{t('finalAgreement')}</ThemedText>
            <View style={styles.closureCard}>
              <Ionicons name="ribbon-outline" size={20} color={colors.primary} />
              <ThemedText variant="body" style={styles.closureText}>"{resolvedClosureText}"</ThemedText>
            </View>
          </View>
        )}

        {/* No data case */}
        {!resolvedClosureText && agreedPositions.length === 0 && !loading && (
          <EmptyState
            icon="document-text-outline"
            title={t('noAgreedStatements')}
          />
        )}
      </ScrollView>
    )
  }

  return (
    <BottomDrawerModal
      visible={visible}
      onClose={onClose}
      title={t('agreedStatements')}
    >
      <View style={styles.contentWrapper}>
        {renderContent()}

        <TouchableOpacity style={styles.doneButton} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common:done')}>
          <ThemedText variant="button" color="inverse">{t('common:done')}</ThemedText>
        </TouchableOpacity>
      </View>
    </BottomDrawerModal>
  )
}

const createStyles = (colors) => StyleSheet.create({
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
    color: SemanticColors.disagree,
    textAlign: 'center',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: colors.primarySurface,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  statementCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: SemanticColors.agree + '10',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  statementText: {
    flex: 1,
  },
  closureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: BrandColor + '18',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: BrandColor + '40',
    gap: 10,
  },
  closureText: {
    flex: 1,
    fontStyle: 'italic',
  },
  doneButton: {
    backgroundColor: colors.primarySurface,
    borderRadius: 25,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
})
