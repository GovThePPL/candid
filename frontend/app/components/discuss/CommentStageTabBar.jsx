import { useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../ThemedText'

/**
 * Pill-button tabs for filtering comments by deliberation stage on proposal posts.
 *
 * @param {Object} props
 * @param {Array<{id: string, label: string}>} props.tabs - Available tabs
 * @param {string} props.selectedTab - Currently selected tab id
 * @param {string|null} props.activeTab - Currently active (interactable) tab id
 * @param {Function} props.onTabChange - Callback with tab id
 */
export default function CommentStageTabBar({ tabs, selectedTab, activeTab, onTabChange }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <View style={styles.container} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const isSelected = selectedTab === tab.id
        const isActive = activeTab === tab.id
        const isReadOnly = !isActive
        return (
          <TouchableOpacity
            key={tab.id}
            style={[styles.button, isSelected && styles.selectedButton]}
            onPress={() => onTabChange(tab.id)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={tab.label}
            accessibilityHint={isReadOnly ? t('commentTabReadOnlyHint') : undefined}
          >
            <ThemedText
              variant="buttonSmall"
              style={[styles.buttonLabel, isSelected && styles.selectedButtonLabel]}
            >
              {tab.label}
            </ThemedText>
            {isActive && (
              <View style={[styles.activeDot, isSelected && styles.activeDotSelected]} />
            )}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  selectedButton: {
    backgroundColor: colors.buttonSelected,
    borderColor: colors.buttonSelected,
  },
  buttonLabel: {
    fontWeight: '500',
  },
  selectedButtonLabel: {
    color: colors.buttonSelectedText,
    fontWeight: '600',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  activeDotSelected: {
    backgroundColor: colors.buttonSelectedText,
  },
})
