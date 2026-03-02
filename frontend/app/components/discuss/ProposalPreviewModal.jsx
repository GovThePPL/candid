import { View, Modal, ScrollView, TouchableOpacity, StyleSheet, Platform, BackHandler, ActivityIndicator } from 'react-native'
import { memo, useMemo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../ThemedText'
import MarkdownRenderer from './MarkdownRenderer'
import { Spacing } from '../../constants/Theme'
import { postsApiWrapper } from '../../lib/api'

/**
 * Full-screen modal to preview a single proposal's title + body.
 * Stacks over BallotModal when a user taps a candidate title.
 */
export default memo(function ProposalPreviewModal({ postId, onClose }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets])

  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!postId) {
      setPost(null)
      setError(false)
      return
    }
    setLoading(true)
    setError(false)
    postsApiWrapper.getPost(postId)
      .then(data => {
        setPost(data)
      })
      .catch(() => {
        setError(true)
      })
      .finally(() => setLoading(false))
  }, [postId])

  // Handle Android back button
  useEffect(() => {
    if (!postId) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose()
      return true
    })
    return () => sub.remove()
  }, [postId, onClose])

  return (
    <Modal
      visible={!!postId}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <ThemedText variant="h3" style={styles.headerTitle} numberOfLines={1}>
              {t('proposalPreviewTitle')}
            </ThemedText>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t('proposalPreviewCloseA11y')}
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
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
            ) : error ? (
              <ThemedText variant="body" color="secondary">{t('proposalPreviewLoadError')}</ThemedText>
            ) : post ? (
              <>
                <ThemedText variant="h2" style={styles.proposalTitle}>
                  {post.title}
                </ThemedText>
                <MarkdownRenderer content={post.body || ''} />
              </>
            ) : null}
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
  loader: {
    marginTop: Spacing.xxl,
  },
})
