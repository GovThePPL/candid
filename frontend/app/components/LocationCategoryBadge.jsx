import { View, StyleSheet } from 'react-native'
import { memo, useMemo } from 'react'
import { useThemeColors } from '../hooks/useThemeColors'
import ThemedText from './ThemedText'

const SIZE_CONFIG = {
  lg: {
    locationVariant: 'buttonSmall',
    categoryVariant: 'bodySmall',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 8,
  },
  md: {
    locationVariant: 'badge',
    categoryVariant: 'caption',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 8,
  },
  sm: {
    locationVariant: 'badge',
    categoryVariant: 'badge',
    categoryStyle: { fontWeight: '400' },
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
}

/**
 * Unified location code pill + category label display.
 *
 * @param {Object} props
 * @param {{ code: string, name?: string } | null} props.location
 * @param {{ label: string } | null} props.category
 * @param {'lg'|'md'|'sm'} [props.size='sm']
 * @param {string} [props.locationFallback] - Text for the location pill when location is null (e.g. "All")
 * @param {string} [props.categoryFallback] - Text for the category when category is null (e.g. "All Categories")
 */
export default memo(function LocationCategoryBadge({ location, category, size = 'sm', locationFallback, categoryFallback }) {
  const colors = useThemeColors()
  const cfg = SIZE_CONFIG[size] || SIZE_CONFIG.sm
  const styles = useMemo(() => createStyles(colors, cfg), [colors, cfg])

  const locText = location?.code || locationFallback
  const catText = category?.label || categoryFallback

  if (!locText && !catText) return null

  return (
    <View style={styles.row}>
      {locText ? (
        <View style={styles.pill}>
          <ThemedText variant={cfg.locationVariant} color="badge" style={cfg.locationStyle}>{locText}</ThemedText>
        </View>
      ) : null}
      {catText ? (
        <ThemedText variant={cfg.categoryVariant} color="badge" style={cfg.categoryStyle}>{catText}</ThemedText>
      ) : null}
    </View>
  )
})

const createStyles = (colors, cfg) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: cfg.gap,
  },
  pill: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: cfg.paddingHorizontal,
    paddingVertical: cfg.paddingVertical,
    borderRadius: cfg.borderRadius,
  },
})
