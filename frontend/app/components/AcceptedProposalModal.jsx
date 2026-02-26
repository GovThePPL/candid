import { View, Modal, ScrollView, TouchableOpacity, StyleSheet, Platform, BackHandler } from 'react-native'
import { memo, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '../hooks/useThemeColors'
import ThemedText from './ThemedText'
import MarkdownRenderer from './discuss/MarkdownRenderer'
import ProposalBadge from './discuss/ProposalBadge'
import Avatar from './Avatar'
import { Spacing, BorderRadius } from '../constants/Theme'

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

  const creator = {
    username: proposal.creatorUsername,
    displayName: proposal.creatorDisplayName,
    avatarIconUrl: proposal.creatorAvatarIconUrl,
  }

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
            <View style={styles.headerLeft}>
              <ProposalBadge status={proposal.proposalStatus} />
              <ThemedText variant="h3" style={styles.headerTitle} numberOfLines={1}>
                {t('acceptedProposalTitle')}
              </ThemedText>
            </View>
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

            {/* Author row */}
            <View style={styles.authorRow}>
              <Avatar user={creator} size={28} />
              <ThemedText variant="bodySmall" color="secondary">
                {creator.displayName || creator.username}
              </ThemedText>
            </View>

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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
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
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
})
