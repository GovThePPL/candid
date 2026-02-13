import { useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../ThemedText'

/**
 * Two square tab buttons for Discussion / Q&A filtering.
 *
 * @param {Object} props
 * @param {string} props.activeTab - 'discussion' or 'question'
 * @param {Function} props.onTabChange - Callback with new tab value
 */
export default function FeedTabBar({ activeTab, onTabChange }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const tabs = [
    { id: 'discussion', label: t('tabDiscussion') },
    { id: 'question', label: t('tabQA') },
  ]

  return (
    <View style={styles.container} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <TouchableOpacity
            key={tab.id}
            style={[styles.button, isActive && styles.activeButton]}
            onPress={() => onTabChange(tab.id)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
          >
            <ThemedText variant="buttonSmall" style={[styles.buttonLabel, isActive && styles.activeButtonLabel]}>
              {tab.label}
            </ThemedText>
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
    flex: 1,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  activeButton: {
    backgroundColor: colors.buttonSelected,
    borderColor: colors.buttonSelected,
  },
  buttonLabel: {
    fontWeight: '500',
  },
  activeButtonLabel: {
    color: colors.buttonSelectedText,
    fontWeight: '600',
  },
})
