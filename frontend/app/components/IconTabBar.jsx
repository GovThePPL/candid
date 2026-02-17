import { StyleSheet, View, TouchableOpacity } from 'react-native'
import { useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import ThemedText from './ThemedText'

/**
 * Reusable icon tab bar with active indicator.
 *
 * Each tab in `tabs` should have: { key, icon, iconActive, labelKey }.
 * The `t` function is used to translate labelKey and labelKey + 'A11y'.
 */
export default function IconTabBar({ tabs, activeTab, onTabChange, t }) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <View style={[styles.tabRow, { backgroundColor: colors.background }]} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => onTabChange(tab.key)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={t(`${tab.labelKey}A11y`)}
          >
            <Ionicons
              name={isActive ? tab.iconActive : tab.icon}
              size={22}
              color={isActive ? colors.primary : colors.secondaryText}
            />
            <ThemedText
              variant="caption"
              style={[
                styles.tabLabel,
                { color: isActive ? colors.primary : colors.secondaryText },
              ]}
            >
              {t(tab.labelKey)}
            </ThemedText>
            {isActive && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 2,
    position: 'relative',
  },
  tabLabel: {
    fontWeight: '500',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    borderRadius: 1,
  },
})
