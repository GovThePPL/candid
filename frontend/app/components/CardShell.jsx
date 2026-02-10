import { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { useThemeColors } from '../hooks/useThemeColors'
import { BrandColor } from '../constants/Colors'
import { Shadows } from '../constants/Theme'

/**
 * Reusable card wrapper with a white content section on top and an optional
 * colored bottom section. The outer container provides the accent color
 * background visible as a border around the white content area.
 *
 * @param {Object} props
 * @param {string} [props.accentColor] - Background color for the card shell (defaults to colors.primary)
 * @param {ReactNode} props.children - White section content
 * @param {ReactNode} [props.bottomSection] - Optional content in the colored bottom section
 * @param {Object} [props.style] - Outer container style override
 * @param {Object} [props.bottomStyle] - Bottom section style override
 */
export default function CardShell({
  accentColor,
  children,
  bottomSection,
  style,
  bottomStyle,
}) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <View style={[styles.container, { backgroundColor: accentColor || BrandColor }, style]}>
      {/* White content section */}
      <View style={styles.whiteSection}>
        {children}
      </View>

      {/* Optional colored bottom section */}
      {bottomSection && (
        <View style={[styles.bottomSection, bottomStyle]}>
          {bottomSection}
        </View>
      )}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    borderRadius: 12,
    ...Shadows.card,
  },
  whiteSection: {
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    overflow: 'hidden',
  },
  bottomSection: {
    padding: 16,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
})
