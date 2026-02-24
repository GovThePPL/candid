import { useState, useCallback, useMemo } from 'react'
import { Platform } from 'react-native'
import { useGlossary } from '../contexts/GlossaryContext'
import { useThemeColors } from './useThemeColors'
import { createGlossaryTextRule } from '../lib/glossaryMarkdownRule'

/**
 * Hook to manage GlossaryDrawer state.
 * Returns [drawerProps, onTermPress] — wire into any screen:
 *
 *   const [glossaryDrawer, onTermPress] = useGlossaryDrawer()
 *   <HighlightedText onTermPress={onTermPress}>{text}</HighlightedText>
 *   <GlossaryDrawer {...glossaryDrawer} />
 */
export function useGlossaryDrawer() {
  const [visible, setVisible] = useState(false)
  const [slug, setSlug] = useState(null)

  const onTermPress = useCallback((termSlug) => {
    setSlug(termSlug)
    setVisible(true)
  }, [])

  const onClose = useCallback(() => {
    setVisible(false)
  }, [])

  const drawerProps = useMemo(() => ({
    visible,
    slug,
    onClose,
  }), [visible, slug, onClose])

  return [drawerProps, onTermPress]
}

/**
 * Hook to create glossary rules for markdown renderers.
 * Returns a memoized rules object from createGlossaryTextRule().
 *
 * @param {Function} onTermPress - Called with slug when a term is tapped
 * @param {Object} [opts]
 * @param {string} [opts.categoryId] - Filter terms to this category
 * @param {boolean} [opts.inverse=false] - Use inverse (white) highlight style
 * @param {Function} [opts.onMentionPress] - Called with username when @mention tapped
 * @returns {Object|undefined} Rules object to pass as glossaryRules prop
 */
export function useGlossaryRules(onTermPress, opts = {}) {
  const { categoryId, inverse = false, onMentionPress } = opts
  const colors = useThemeColors()
  const { matchPattern, termMap, getFilteredPattern } = useGlossary()

  const pattern = categoryId ? getFilteredPattern(categoryId) : matchPattern

  const highlightStyle = useMemo(() => ({
    color: inverse ? '#FFFFFF' : colors.primary,
    ...(Platform.OS === 'web'
      ? { textDecorationLine: 'underline', textDecorationStyle: 'dotted' }
      : { backgroundColor: (inverse ? '#FFFFFF' : colors.primary) + '20', borderRadius: 2 }),
  }), [inverse, colors.primary])

  const mentionStyle = useMemo(() => ({
    color: colors.primary,
    fontWeight: '600',
  }), [colors.primary])

  const roleStyle = useMemo(() => ({
    color: colors.primary,
    fontWeight: '700',
  }), [colors.primary])

  const mentionOpts = useMemo(() => {
    if (!onMentionPress) return undefined
    return { onMentionPress, mentionStyle, roleStyle }
  }, [onMentionPress, mentionStyle, roleStyle])

  return useMemo(() => {
    if (!pattern && !onTermPress && !onMentionPress) return undefined
    return createGlossaryTextRule(pattern, termMap, onTermPress, highlightStyle, mentionOpts)
  }, [pattern, termMap, onTermPress, highlightStyle, mentionOpts, onMentionPress])
}
