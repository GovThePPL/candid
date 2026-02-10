import { useTheme } from '../contexts/ThemeContext'

export function useThemeColors() {
  const { colors } = useTheme()
  return colors
}
