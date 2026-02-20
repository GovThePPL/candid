import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../hooks/useThemeColors'
import useModalBackHandler from '../../hooks/useModalBackHandler'
import { SemanticColors } from '../../constants/Colors'
import { Shadows } from '../../constants/Theme'
import ThemedText from '../ThemedText'

const SCREEN_WIDTH = Dimensions.get('window').width
const SIDEBAR_WIDTH = Math.min(SCREEN_WIDTH * 0.8, 360)

/**
 * Right-side drawer listing accepted agreed statements and definitions.
 *
 * @param {Object} props
 * @param {boolean} props.visible
 * @param {Function} props.onClose
 * @param {Array} props.acceptedPositions - List of accepted agreed positions
 * @param {Array} props.definitions - List of definitions
 * @param {Array} props.explanations - List of explanations
 * @param {Function} props.onQuotePosition - Callback: (position, sNumber) => void
 * @param {Function} props.onQuoteDefinition - Callback: (definition, dNumber) => void
 * @param {Function} props.onQuoteExplanation - Callback: (explanation, eNumber) => void
 * @param {string} props.currentUserId - Current user's ID
 * @param {Object} [props.otherUser] - Other user object (for attribution)
 */
export default function ChatSidebar({ visible, onClose, acceptedPositions = [], definitions = [], explanations = [], currentUserId, otherUser, onQuotePosition, onQuoteDefinition, onQuoteExplanation }) {
  const { t } = useTranslation('chat')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [modalVisible, setModalVisible] = useState(false)
  useModalBackHandler(visible, onClose)

  const overlayOpacity = useSharedValue(0)
  const slideX = useSharedValue(SIDEBAR_WIDTH)

  const hideModal = useCallback(() => {
    setModalVisible(false)
  }, [])

  useEffect(() => {
    if (visible) {
      setModalVisible(true)
      overlayOpacity.value = withTiming(1, { duration: 300 })
      slideX.value = withTiming(0, { duration: 300 })
    } else {
      overlayOpacity.value = withTiming(0, { duration: 250 })
      slideX.value = withTiming(SIDEBAR_WIDTH, { duration: 250 }, () => {
        runOnJS(hideModal)()
      })
    }
  }, [visible])

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }))

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
  }))

  const hasContent = acceptedPositions.length > 0 || definitions.length > 0 || explanations.length > 0

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Animated.View style={[styles.overlay, overlayStyle]}>
          <TouchableOpacity
            style={styles.overlayTouch}
            activeOpacity={1}
            onPress={onClose}
            accessibilityLabel={t('closeSidebarA11y')}
            accessibilityRole="button"
          />
        </Animated.View>

        <Animated.View style={[styles.drawer, drawerStyle]}>
          {/* Header */}
          <View style={styles.header}>
            <ThemedText variant="h3" color="primary" style={styles.headerTitle}>
              {t('agreedStatements')}
            </ThemedText>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel={t('closeSidebarA11y')}
              accessibilityRole="button"
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {!hasContent ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={40} color={colors.pass} />
                <ThemedText variant="body" style={styles.emptyText}>
                  {t('noAgreedStatements')}
                </ThemedText>
              </View>
            ) : (
              <>
                {/* Agreed Statements */}
                {acceptedPositions.map((pos, idx) => {
                  const sNum = idx + 1
                  return (
                    <View key={pos.id || idx} style={styles.statementCard}>
                      <View style={styles.statementHeader}>
                        <View style={styles.sBadge}>
                          <ThemedText variant="badge" style={styles.sBadgeText}>
                            S{sNum}
                          </ThemedText>
                        </View>
                        <TouchableOpacity
                          onPress={() => onQuotePosition?.(pos, sNum)}
                          style={styles.quoteButton}
                          accessibilityRole="button"
                          accessibilityLabel={t('quoteStatementA11y', { num: sNum })}
                        >
                          <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} />
                          <ThemedText variant="caption" style={styles.quoteButtonText}>
                            {t('quoteStatement')}
                          </ThemedText>
                        </TouchableOpacity>
                      </View>
                      <ThemedText variant="body" style={styles.statementText}>
                        {pos.content}
                      </ThemedText>
                    </View>
                  )
                })}

                {/* Definitions */}
                {definitions.length > 0 && (
                  <>
                    <ThemedText variant="h3" color="primary" style={styles.sectionTitle}>
                      {t('definitionSidebarTitle')}
                    </ThemedText>
                    {definitions.map((defn, idx) => {
                      const dNum = idx + 1
                      return (
                        <View key={defn.id || idx} style={styles.statementCard}>
                          <View style={styles.statementHeader}>
                            <View style={[styles.sBadge, styles.dBadge]}>
                              <ThemedText variant="badge" style={styles.sBadgeText}>
                                D{dNum}
                              </ThemedText>
                            </View>
                            <TouchableOpacity
                              onPress={() => onQuoteDefinition?.(defn, dNum)}
                              style={styles.quoteButton}
                              accessibilityRole="button"
                              accessibilityLabel={t('quoteDefinitionA11y', { num: dNum })}
                            >
                              <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} />
                              <ThemedText variant="caption" style={styles.quoteButtonText}>
                                {t('quoteDefinition')}
                              </ThemedText>
                            </TouchableOpacity>
                          </View>
                          <ThemedText variant="body" style={styles.termText}>
                            {defn.term}
                          </ThemedText>
                          <ThemedText variant="body" style={styles.statementText}>
                            {defn.definition}
                          </ThemedText>
                          <View style={styles.attributionRow}>
                            <ThemedText variant="caption" style={styles.attributionText}>
                              {t('definedBy', { name: String(defn.definerId) === String(currentUserId) ? t('youLower') : (otherUser?.displayName || t('theOtherUserLower')) })}
                            </ThemedText>
                            {defn.status === 'accepted' && (
                              <View style={styles.acceptedBadge}>
                                <Ionicons name="checkmark-circle" size={12} color={colors.agreeBubble} />
                                <ThemedText variant="caption" style={[styles.attributionText, { color: colors.agreeBubble, marginTop: 0 }]}>
                                  {t('acceptedDefinition')}
                                </ThemedText>
                              </View>
                            )}
                            {defn.status === 'both_defined' && (
                              <View style={styles.acceptedBadge}>
                                <Ionicons name="people" size={12} color={colors.pass} />
                                <ThemedText variant="caption" style={styles.attributionText}>
                                  {t('mutualDefinition')}
                                </ThemedText>
                              </View>
                            )}
                          </View>
                        </View>
                      )
                    })}
                  </>
                )}

                {/* Explanations */}
                {explanations.length > 0 && (
                  <>
                    <ThemedText variant="h3" color="primary" style={styles.sectionTitle}>
                      {t('explanationSidebarTitle')}
                    </ThemedText>
                    {explanations.map((expl, idx) => {
                      const eNum = idx + 1
                      return (
                        <View key={expl.id || idx} style={styles.statementCard}>
                          <View style={styles.statementHeader}>
                            <View style={[styles.sBadge, styles.eBadge]}>
                              <ThemedText variant="badge" style={styles.sBadgeText}>
                                E{eNum}
                              </ThemedText>
                            </View>
                            <TouchableOpacity
                              onPress={() => onQuoteExplanation?.(expl, eNum)}
                              style={styles.quoteButton}
                              accessibilityRole="button"
                              accessibilityLabel={t('quoteExplanationA11y', { num: eNum })}
                            >
                              <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} />
                              <ThemedText variant="caption" style={styles.quoteButtonText}>
                                {t('quoteExplanation')}
                              </ThemedText>
                            </TouchableOpacity>
                          </View>
                          <ThemedText variant="body" style={styles.termText}>
                            {expl.position}
                          </ThemedText>
                          <ThemedText variant="body" style={styles.statementText}>
                            {expl.explanation}
                          </ThemedText>
                          <ThemedText variant="caption" style={styles.attributionText}>
                            {t('explainedBy', { name: String(expl.explainerId) === String(currentUserId) ? t('youLower') : (otherUser?.displayName || t('theOtherUserLower')) })}
                          </ThemedText>
                        </View>
                      )
                    })}
                  </>
                )}
              </>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SemanticColors.overlay,
  },
  overlayTouch: {
    flex: 1,
  },
  drawer: {
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.background,
    ...Shadows.elevated,
    ...(Platform.OS === 'web' && {
      boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.15)',
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.cardBackground,
  },
  headerTitle: {
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 32,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    color: colors.pass,
    textAlign: 'center',
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 12,
  },
  statementCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sBadge: {
    backgroundColor: colors.agreeBubble,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  dBadge: {
    backgroundColor: colors.definitionAccent,
  },
  eBadge: {
    backgroundColor: colors.explanationAccent,
  },
  sBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  quoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.buttonDefault,
  },
  quoteButtonText: {
    color: colors.primary,
    fontWeight: '600',
  },
  termText: {
    fontWeight: '700',
    marginBottom: 4,
  },
  statementText: {
    lineHeight: 20,
  },
  attributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  attributionText: {
    color: colors.pass,
  },
  acceptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
})
