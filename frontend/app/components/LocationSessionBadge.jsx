import { View, StyleSheet } from 'react-native'
import { memo, useMemo } from 'react'
import { useThemeColors } from '../hooks/useThemeColors'
import ThemedText from './ThemedText'

const SIZE_CONFIG = {
  lg: {
    locationVariant: 'buttonSmall',
    sessionVariant: 'bodySmall',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 8,
  },
  md: {
    locationVariant: 'badge',
    sessionVariant: 'caption',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 8,
  },
  sm: {
    locationVariant: 'badge',
    sessionVariant: 'badge',
    sessionStyle: { fontWeight: '400' },
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
}

/**
 * Unified location code pill + session label display.
 *
 * @param {Object} props
 * @param {{ code: string, name?: string } | null} props.location
 * @param {{ label: string } | null} props.session
 * @param {'lg'|'md'|'sm'} [props.size='sm']
 * @param {string} [props.locationFallback] - Text for the location pill when location is null (e.g. "All")
 * @param {string} [props.sessionFallback] - Text for the session when session is null (e.g. "All Sessions")
 */
export default memo(function LocationSessionBadge({ location, session, size = 'sm', locationFallback, sessionFallback }) {
  const colors = useThemeColors()
  const cfg = SIZE_CONFIG[size] || SIZE_CONFIG.sm
  const styles = useMemo(() => createStyles(colors, cfg), [colors, cfg])

  const locText = location?.code || locationFallback
  const sessText = session?.label || sessionFallback

  if (!locText && !sessText) return null

  return (
    <View style={styles.row}>
      {locText ? (
        <View style={styles.pill}>
          <ThemedText variant={cfg.locationVariant} color="badge" style={cfg.locationStyle}>{locText}</ThemedText>
        </View>
      ) : null}
      {sessText ? (
        <ThemedText variant={cfg.sessionVariant} color="badge" style={cfg.sessionStyle}>{sessText}</ThemedText>
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
