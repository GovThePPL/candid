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
    const footerBg = resolvedFooterColor || headerColor || BrandColor
    return (
      <View style={[
        styles.headerContainer,
        isFullSize ? styles.sizeFull : styles.sizeCompact,
        { backgroundColor: colors.cardBackground },
        style,
      ]}>
        {/* Colored header */}
        <View style={[styles.headerSection, { backgroundColor: headerColor || BrandColor }]}>
          {header}
        </View>

        {/* Body with curved top over header color; when footer exists, a
             colored strip behind the bottom 16px creates the swoop into the
             footer color (same technique as the no-header layout). */}
        <View style={[styles.bodyWrapper, { backgroundColor: headerColor || BrandColor }, isFullSize && styles.bodyWrapperFull]}>
          {resolvedFooter ? (
            <View style={styles.bodyFooterTransition}>
              <View style={[styles.footerCurveFill, { backgroundColor: footerBg }]} />
              <View style={[styles.body, styles.bodyWithFooter, bodyStyle]}>
                {children}
              </View>
            </View>
          ) : (
            <View style={[styles.body, bodyStyle]}>
              {children}
            </View>
          )}
        </View>

        {/* Optional footer */}
        {resolvedFooter && (
          <View style={[styles.footerSection, { backgroundColor: resolvedFooterColor || footerBg }, bottomStyle]}>
            {resolvedFooter}
          </View>
        )}
      </View>
    )
  }

  // No-header layout: existing compact card behavior
  // Container uses cardBackground to prevent colored bleed-through at top corners;
  // the footer section carries its own colored background.
  const noHeaderFooterBg = resolvedFooterColor || accentColor || BrandColor
  return (
    <View style={[
      styles.noHeaderContainer,
      isFullSize ? styles.sizeFull : styles.sizeCompact,
      { backgroundColor: colors.cardBackground },
      style,
    ]}>
      {/* White content section — when footer exists, a colored strip behind
           the bottom 16px lets the white section's border radius reveal the
           footer color as curved corners ("swoop") above the footer. */}
      {resolvedFooter ? (
        <View style={[styles.whiteSectionOuter, isFullSize && styles.whiteSectionOuterFull]}>
          <View style={[styles.footerCurveFill, { backgroundColor: noHeaderFooterBg }]} />
          <View style={[styles.whiteSection, isFullSize && styles.whiteSectionFull, bodyStyle]}>
            {children}
          </View>
        </View>
      ) : (
        <View style={[styles.whiteSection, isFullSize && styles.whiteSectionFull, bodyStyle]}>
          {children}
        </View>
      )}

      {/* Optional colored bottom section */}
      {resolvedFooter && (
        <View style={[styles.bottomSection, { backgroundColor: noHeaderFooterBg }, bottomStyle]}>
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
  bodyFooterTransition: {
    position: 'relative',
    flex: 1,
  },
  bodyWithFooter: {
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
  whiteSectionOuter: {
    position: 'relative',
  },
  whiteSectionOuterFull: {
    flex: 1,
  },
  footerCurveFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 16,
  },
  bottomSection: {
    padding: 16,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
})
