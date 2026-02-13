import { useState, useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import BottomDrawerModal from '../BottomDrawerModal'

const SORT_OPTIONS = [
  { id: 'best', icon: 'trophy-outline', iconActive: 'trophy', labelKey: 'sortBest' },
  { id: 'new', icon: 'time-outline', iconActive: 'time', labelKey: 'sortNew' },
  { id: 'top', icon: 'arrow-up-outline', iconActive: 'arrow-up', labelKey: 'sortTop' },
  { id: 'controversial', icon: 'flash-outline', iconActive: 'flash', labelKey: 'sortControversial' },
]

/**
 * Compact sort control for comments — icon button that opens a BottomDrawerModal.
 *
 * @param {Object} props
 * @param {string} props.sort - Current sort mode
 * @param {Function} props.onSortChange - Called with new sort mode string
 */
export default function CommentSortControl({ sort, onSortChange }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [visible, setVisible] = useState(false)

  const currentOption = SORT_OPTIONS.find(o => o.id === sort) || SORT_OPTIONS[0]

  const handleSelect = (sortId) => {
    onSortChange(sortId)
    setVisible(false)
  }

  return (
    <>
      <TouchableOpacity
        style={styles.triggerButton}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('sortButtonA11y', { sort: t(currentOption.labelKey) })}
      >
        <Ionicons name={currentOption.iconActive} size={20} color={colors.primary} />
      </TouchableOpacity>

      <BottomDrawerModal
        visible={visible}
        onClose={() => setVisible(false)}
        title={t('sortLabel')}
        shrink
      >
        <View style={styles.optionsList}>
          {SORT_OPTIONS.map((option) => {
            const isSelected = sort === option.id
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                onPress={() => handleSelect(option.id)}
                activeOpacity={0.7}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={t('sortByA11y', { sort: t(option.labelKey) })}
              >
                <Ionicons
                  name={isSelected ? option.iconActive : option.icon}
                  size={22}
                  color={isSelected ? colors.primary : colors.secondaryText}
                />
                <ThemedText
                  variant="body"
                  style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}
                >
                  {t(option.labelKey)}
                </ThemedText>
                {isSelected && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} style={styles.checkmark} />
                )}
              </TouchableOpacity>
            )
          })}
        </View>
      </BottomDrawerModal>
    </>
  )
}

const createStyles = (colors) => StyleSheet.create({
  triggerButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsList: {
    padding: Spacing.lg,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    gap: Spacing.md,
  },
  optionRowSelected: {
    backgroundColor: colors.badgeBg,
  },
  optionLabel: {
    flex: 1,
  },
  optionLabelSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  checkmark: {
    marginLeft: 'auto',
  },
})
