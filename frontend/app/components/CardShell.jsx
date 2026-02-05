import { View, StyleSheet } from 'react-native'
import { Colors } from '../constants/Colors'
import { Shadows } from '../constants/Theme'

/**
 * Reusable card wrapper with a white content section on top and an optional
 * colored bottom section. The outer container provides the accent color
 * background visible as a border around the white content area.
 *
 * @param {Object} props
 * @param {string} [props.accentColor=Colors.primary] - Background color for the card shell
 * @param {ReactNode} props.children - White section content
 * @param {ReactNode} [props.bottomSection] - Optional content in the colored bottom section
 * @param {Object} [props.style] - Outer container style override
 * @param {Object} [props.bottomStyle] - Bottom section style override
 */
export default function CardShell({
  accentColor = Colors.primary,
  children,
  bottomSection,
  style,
  bottomStyle,
}) {
  return (
    <View style={[styles.container, { backgroundColor: accentColor }, style]}>
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

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    ...Shadows.card,
  },
  whiteSection: {
    backgroundColor: Colors.white,
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
