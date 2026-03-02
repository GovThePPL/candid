import { useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import BottomDrawerModal from '../BottomDrawerModal'

/**
 * Bottom drawer modal for managing endorsements.
 * Shows the user's endorsed proposals with full titles (tappable to navigate)
 * and remove buttons.
 * When opened from an over-limit attempt, shows a prompt to remove one.
 *
 * @param {Object} props
 * @param {boolean} props.visible - Whether the modal is shown
 * @param {Function} props.onClose - Called when modal is dismissed
 * @param {Array} props.endorsedPosts - Array of {id, title} for endorsed proposals
 * @param {Function} props.onRemove - Called with postId to un-endorse
 * @param {string} [props.pendingPostTitle] - Title of the post the user tried to endorse over limit
 * @param {Function} [props.onPostPress] - Called with postId when a proposal title is tapped
 */
export default function EndorsementManageModal({ visible, onClose, endorsedPosts, onRemove, pendingPostTitle, onPostPress }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <BottomDrawerModal
      visible={visible}
      onClose={onClose}
      title={t('endorsementManageTitle')}
    >
      <View style={styles.list}>
        {pendingPostTitle && (
          <View style={styles.overLimitBanner}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <ThemedText variant="bodySmall" style={{ color: colors.primary, flex: 1 }}>
              {t('endorseOverLimitMessage')}
            </ThemedText>
          </View>
        )}

        {(!endorsedPosts || endorsedPosts.length === 0) && (
          <ThemedText variant="body" color="secondary" style={styles.emptyText}>
            {t('endorsementManageEmpty')}
          </ThemedText>
        )}

        {endorsedPosts?.map((ep) => (
          <View key={ep.id} style={styles.row}>
            <Ionicons name="heart" size={20} color={colors.primary} style={styles.heartIcon} />
            <View style={styles.rowContent}>
              <TouchableOpacity
                onPress={() => { onClose(); onPostPress?.(ep.id) }}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel={t('endorsementManageViewA11y', { title: ep.title })}
                disabled={!onPostPress}
              >
                <ThemedText variant="body" style={styles.proposalTitle}>
                  {ep.title}
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onRemove(ep.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('endorsementManageRemoveA11y', { title: ep.title })}
                style={styles.removeButton}
              >
                <Ionicons name="close-circle-outline" size={16} color={colors.primary} />
                <ThemedText variant="caption" style={{ color: colors.primary, fontWeight: '600' }}>
                  {t('endorsementManageRemove')}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    </BottomDrawerModal>
  )
}

const createStyles = (colors) => StyleSheet.create({
  list: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  overLimitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: colors.primary + '10',
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  heartIcon: {
    marginTop: 2,
  },
  rowContent: {
    flex: 1,
    gap: Spacing.sm,
  },
  proposalTitle: {
    color: colors.primary,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
})
