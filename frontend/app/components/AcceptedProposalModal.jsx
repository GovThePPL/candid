import { View, Modal, ScrollView, TouchableOpacity, StyleSheet, Platform, BackHandler } from 'react-native'
import { memo, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '../hooks/useThemeColors'
import ThemedText from './ThemedText'
import MarkdownRenderer from './discuss/MarkdownRenderer'
import { Spacing } from '../constants/Theme'

/**
 * Full-screen modal showing the accepted (finalized) proposal for the current session.
 * Opened by tapping the Location+Session badge in the stage bar.
 */
export default memo(function AcceptedProposalModal({ visible, onClose, proposal }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets])

  // Handle Android back button
  useEffect(() => {
    if (!visible) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose()
      return true
    })
    return () => sub.remove()
  }, [visible, onClose])

  if (!proposal) return null

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <ThemedText variant="h3" style={styles.headerTitle} numberOfLines={1}>
              {t('acceptedProposalTitle')}
            </ThemedText>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t('acceptedProposalCloseA11y')}
            >
              <Ionicons name="close" size={24} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Title */}
            <ThemedText variant="h2" style={styles.proposalTitle}>
              {proposal.title}
            </ThemedText>

            {/* Body */}
            <MarkdownRenderer content={proposal.body || ''} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
})

const createStyles = (colors, insets) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    ...Platform.select({
      web: {
        maxWidth: 600,
        alignSelf: 'center',
        width: '100%',
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === 'web' ? Spacing.lg : insets.top + Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    flex: 1,
  },
  closeButton: {
    padding: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + insets.bottom,
  },
  proposalTitle: {
    marginBottom: Spacing.sm,
  },
})
