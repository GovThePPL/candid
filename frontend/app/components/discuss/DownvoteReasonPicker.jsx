import { useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import BottomDrawerModal from '../BottomDrawerModal'

const REASONS = [
  { key: 'offtopic', icon: 'close-circle-outline', labelKey: 'reasonOfftopic', descKey: 'reasonOfftopicDesc' },
  { key: 'unkind', icon: 'heart-dislike-outline', labelKey: 'reasonUnkind', descKey: 'reasonUnkindDesc' },
  { key: 'low_effort', icon: 'remove-circle-outline', labelKey: 'reasonLowEffort', descKey: 'reasonLowEffortDesc' },
  { key: 'spam', icon: 'megaphone-outline', labelKey: 'reasonSpam', descKey: 'reasonSpamDesc' },
  { key: 'misinformation', icon: 'alert-circle-outline', labelKey: 'reasonMisinformation', descKey: 'reasonMisinformationDesc' },
]

/**
 * Bottom drawer modal for selecting a downvote reason.
 *
 * @param {Object} props
 * @param {boolean} props.visible - Whether the picker is shown
 * @param {Function} props.onClose - Called when picker is dismissed
 * @param {Function} props.onSelect - Called with reason key string
 */
export default function DownvoteReasonPicker({ visible, onClose, onSelect }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const handleSelect = (reasonKey) => {
    onSelect(reasonKey)
    onClose()
  }

  return (
    <BottomDrawerModal
      visible={visible}
      onClose={onClose}
      title={t('downvoteReasonTitle')}
      shrink
    >
      <View style={styles.list}>
        {REASONS.map((reason) => (
          <TouchableOpacity
            key={reason.key}
            style={styles.row}
            onPress={() => handleSelect(reason.key)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t(reason.labelKey)}
          >
            <Ionicons name={reason.icon} size={22} color={colors.secondaryText} />
            <View style={styles.textContainer}>
              <ThemedText variant="body">{t(reason.labelKey)}</ThemedText>
              <ThemedText variant="caption" color="secondary">{t(reason.descKey)}</ThemedText>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </BottomDrawerModal>
  )
}

const createStyles = (colors) => StyleSheet.create({
  list: {
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
})
