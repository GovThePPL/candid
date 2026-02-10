import { useMemo } from 'react'
import { ScrollView, TouchableOpacity, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Typography } from '../../constants/Theme'
import ThemedText from '../ThemedText'

/**
 * Horizontal button bar for navigating between opinion groups
 *
 * @param {Object} props
 * @param {Array} props.groups - Array of group objects with id and label
 * @param {string} props.activeTab - Currently active tab ID
 * @param {Function} props.onTabChange - Callback when tab is selected
 * @param {boolean} props.showMyPositions - Whether to show "My Positions" tab
 */
export default function GroupTabBar({
  groups = [],
  activeTab,
  onTabChange,
  showMyPositions = true,
}) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { width: screenWidth } = useWindowDimensions()

  // Get custom label for a group from labelRankings
  const getCustomLabel = (group) => {
    return group.labelRankings?.[0]?.label || null
  }

  // Estimate if tabs will fit on screen with full labels (letter + custom label)
  // Approximate widths: "All" ~50px, "A: Label" ~100px, "A" ~35px, "My Positions" ~115px
  const fixedTabsWidth = 50 + (showMyPositions ? 115 : 0) // All + My Positions
  const groupTabWidthFull = 100 // "A: Label"
  const groupTabWidthCompact = 35 // "A"
  const gaps = (groups.length + (showMyPositions ? 2 : 1)) * 8
  const horizontalPadding = 32

  const totalWidthFull = fixedTabsWidth + (groups.length * groupTabWidthFull) + gaps + horizontalPadding
  const useCompactLabels = totalWidthFull > screenWidth

  // Helper to get display label for a group
  const getDisplayLabel = (group) => {
    if (useCompactLabels) {
      return group.label // Just the letter
    }
    const customLabel = getCustomLabel(group)
    return customLabel ? `${group.label}: ${customLabel}` : group.label
  }

  // Build tab list: All, groups (A, B, C...), My Positions
  const tabs = [
    { id: 'majority', label: 'All' },
    ...groups.map((g) => ({
      id: g.id,
      label: getDisplayLabel(g)
    })),
  ]

  if (showMyPositions) {
    tabs.push({ id: 'my_positions', label: 'My Positions' })
  }

  return (
    <View style={styles.container} accessibilityRole="tablist">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
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
      </ScrollView>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  scrollContent: {
    gap: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
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
