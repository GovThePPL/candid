import { memo, useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { useThemeColors } from '../hooks/useThemeColors'
import { BrandColor } from '../constants/Colors'
import { Shadows } from '../constants/Theme'

/**
 * Reusable card wrapper with optional colored header, white content body,
 * and optional colored footer section. Supports compact (standalone card)
 * and full (swipeable card fill) sizing modes.
 *
 * @param {Object} props
 * @param {string} [props.headerColor] - Header background color
 * @param {ReactNode} [props.header] - Header content
 * @param {string} [props.footerColor] - Footer background color (alias for accentColor)
 * @param {ReactNode} [props.footer] - Footer content (alias for bottomSection)
 * @param {string} [props.accentColor] - Legacy alias for footerColor
 * @param {ReactNode} [props.bottomSection] - Legacy alias for footer
 * @param {'compact'|'full'} [props.size='compact'] - compact: borderRadius + shadow; full: flex:1, no radius/shadow
 * @param {ReactNode} props.children - Body section content
 * @param {Object} [props.style] - Outer container style override
 * @param {Object} [props.bodyStyle] - Body section style override
 * @param {Object} [props.bottomStyle] - Footer section style override
 */
export default memo(function CardShell({
  headerColor,
  header,
  footerColor,
  footer,
  accentColor,
  children,
  bottomSection,
  size = 'compact',
  style,
  bodyStyle,
  bottomStyle,
}) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  // Resolve aliases: footer/footerColor take precedence over legacy props
  const resolvedFooter = footer || bottomSection
  const resolvedFooterColor = footerColor || accentColor

  const isFullSize = size === 'full'

  // Header layout: colored header → curved body → optional footer
  if (header) {
    const containerBg = resolvedFooterColor || resolvedFooterColor || headerColor || BrandColor
    return (
      <View style={[
        styles.headerContainer,
        isFullSize ? styles.sizeFull : styles.sizeCompact,
        { backgroundColor: containerBg },
        style,
      ]}>
        {/* Colored header */}
        <View style={[styles.headerSection, { backgroundColor: headerColor || BrandColor }]}>
          {header}
        </View>

        {/* Body with curved top over header color */}
        <View style={[styles.bodyWrapper, { backgroundColor: headerColor || BrandColor }, isFullSize && styles.bodyWrapperFull]}>
          <View style={[styles.body, bodyStyle]}>
            {children}
          </View>
        </View>

        {/* Optional footer with curved bottom body edge */}
        {resolvedFooter && (
          <>
            <View style={[styles.bodyBottomCurve, { backgroundColor: colors.cardBackground }]} />
            <View style={[styles.footerSection, { backgroundColor: resolvedFooterColor || containerBg }, bottomStyle]}>
              {resolvedFooter}
            </View>
          </>
        )}
      </View>
    )
  }

  // No-header layout: existing compact card behavior
  return (
    <View style={[
      styles.noHeaderContainer,
      isFullSize ? styles.sizeFull : styles.sizeCompact,
      { backgroundColor: resolvedFooterColor || accentColor || BrandColor },
      style,
    ]}>
      {/* White content section */}
      <View style={[styles.whiteSection, isFullSize && styles.whiteSectionFull, bodyStyle]}>
        {children}
      </View>

      {/* Optional colored bottom section */}
      {resolvedFooter && (
        <View style={[styles.bottomSection, bottomStyle]}>
          {resolvedFooter}
        </View>
      )}
    </View>
  )
})

const createStyles = (colors) => StyleSheet.create({
  // --- Size variants ---
  sizeCompact: {
    borderRadius: 12,
    ...Shadows.card,
  },
  sizeFull: {
    flex: 1,
  },

  // --- Header layout ---
  headerContainer: {
    overflow: 'hidden',
  },
  headerSection: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bodyWrapper: {
  },
  bodyWrapperFull: {
    flex: 1,
  },
  body: {
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    flex: 1,
  },
  bodyBottomCurve: {
    height: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  footerSection: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },

  // --- No-header layout (backward compat) ---
  noHeaderContainer: {
    overflow: 'hidden',
  },
  whiteSection: {
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    overflow: 'hidden',
  },
  whiteSectionFull: {
    flex: 1,
    borderRadius: 0,
  },
  bottomSection: {
    padding: 16,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
})
