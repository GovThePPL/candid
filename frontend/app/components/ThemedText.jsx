import { Text } from 'react-native'
import { useThemeColors } from '../hooks/useThemeColors'
import { Typography, TypographyScaleCaps } from '../constants/Theme'
import { SemanticColors } from '../constants/Colors'

// Map color shortcut names to theme/semantic color tokens
function resolveColor(colorName, colors) {
  if (!colorName) return undefined
  const map = {
    text: colors.text,
    title: colors.title,
    primary: colors.primary,
    secondary: colors.secondaryText,
    placeholder: colors.placeholderText,
    dark: colors.darkText,
    badge: colors.badgeText,
    error: SemanticColors.warning,
    agree: SemanticColors.agree,
    disagree: SemanticColors.disagree,
    inverse: '#FFFFFF',
  }
  return map[colorName]
}

const ThemedText = ({ style, variant, color, title = false, maxFontSizeMultiplier, ...props }) => {
  const colors = useThemeColors()

  // Resolve text color: explicit color prop > title prop > default text
  const resolvedColor = color
    ? resolveColor(color, colors)
    : title ? colors.title : colors.text

  // Resolve variant typography styles
  const variantStyle = variant ? Typography[variant] : undefined

  // Resolve maxFontSizeMultiplier: explicit prop > variant cap > undefined (uses global default)
  const scaleCap = maxFontSizeMultiplier !== undefined
    ? maxFontSizeMultiplier
    : variant ? TypographyScaleCaps[variant] : undefined

  return (
    <Text
      maxFontSizeMultiplier={scaleCap}
      style={[{ color: resolvedColor }, variantStyle, style]}
      {...props}
    />
  )
}

export default ThemedText
