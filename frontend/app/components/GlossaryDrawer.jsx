import { useState, useEffect, useCallback, memo } from 'react'
import { View, ScrollView, ActivityIndicator, TouchableOpacity, Linking } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import BottomDrawerModal from './BottomDrawerModal'
import ThemedText from './ThemedText'
import MarkdownRenderer from './discuss/MarkdownRenderer'
import api from '../lib/api'
import { CacheManager, CacheKeys, CacheDurations } from '../lib/cache'

/**
 * Bottom drawer that displays a glossary term definition.
 * Uses BottomDrawerModal for content display.
 *
 * @param {Object} props
 * @param {boolean} props.visible - Whether the drawer is shown
 * @param {string} props.slug - Glossary term slug to load
 * @param {Function} props.onClose - Called when closing
 * @param {boolean} [props.showActions=true] - Show Suggest Edit and View in Wiki buttons (disable in chat)
 */
export default memo(function GlossaryDrawer({ visible, slug, onClose, showActions = true }) {
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const router = useRouter()
  const [currentSlug, setCurrentSlug] = useState(slug)
  const [history, setHistory] = useState([])
  const [term, setTerm] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  // Reset internal slug and history when the external prop changes
  useEffect(() => {
    setCurrentSlug(slug)
    setHistory([])
  }, [slug])

  useEffect(() => {
    if (!visible || !currentSlug) return

    let cancelled = false
    setLoading(true)
    setError(false)
    setTerm(null)

    const load = async () => {
      try {
        const cacheKey = CacheKeys.glossaryTerm(currentSlug)
        const cacheEntry = await CacheManager.get(cacheKey)
        if (cacheEntry && !CacheManager.isStale(cacheEntry, CacheDurations.GLOSSARY_TERM) && !cancelled) {
          setTerm(cacheEntry.data)
          setLoading(false)
          return
        }

        const data = await api.glossary.getTerm(currentSlug)
        if (!cancelled) {
          setTerm(data)
          setLoading(false)
          await CacheManager.set(cacheKey, data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [visible, currentSlug])

  const handleLinkPress = useCallback((url) => {
    // Internal wiki link — navigate within the drawer
    if (url && url.startsWith('/')) {
      const termSlug = url.replace(/^\/en\//, '/').replace(/^\//, '')
      if (termSlug) {
        setCurrentSlug((prev) => {
          if (prev) setHistory((h) => [...h, prev])
          return termSlug
        })
        return false
      }
    }
    // External link — open in browser
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      Linking.openURL(url)
      return false
    }
    return true
  }, [])

  const handleBack = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h
      setCurrentSlug(h[h.length - 1])
      return h.slice(0, -1)
    })
  }, [])

  const handleEdit = useCallback(() => {
    if (!term) return
    onClose()
    // Delay navigation until after the Modal close animation (250ms).
    // Navigate to wiki tab, push the term article (so back from form returns
    // to the article), then push the suggestion form on top.
    setTimeout(() => {
      router.navigate('/wiki')
      router.push(`/wiki/glossary/${currentSlug}`)
      if (term.canEdit) {
        router.push(`/wiki/suggestion-form?type=edit_term&termSlug=${encodeURIComponent(currentSlug)}&termId=${term.id}&directEdit=true`)
      } else {
        router.push(`/wiki/suggestion-form?type=edit_term&termSlug=${encodeURIComponent(currentSlug)}&termId=${term.id}`)
      }
    }, 300)
  }, [term, currentSlug, onClose, router])

  const handleViewInWiki = useCallback(() => {
    onClose()
    setTimeout(() => {
      router.navigate('/wiki')
      router.push(`/wiki/glossary/${currentSlug}`)
    }, 300)
  }, [currentSlug, onClose, router])

  return (
    <BottomDrawerModal
      visible={visible}
      onClose={onClose}
      title={term?.term || currentSlug || ''}
      subtitle={term?.summary || ''}
      headerLeft={history.length > 0 ? (
        <TouchableOpacity onPress={handleBack} accessibilityLabel={t('common:back')} accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
      ) : undefined}
    >
      <ScrollView
        style={{ paddingHorizontal: 16, paddingBottom: 24 }}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {loading && (
          <View
            style={{ alignItems: 'center', paddingVertical: 32 }}
            accessibilityLabel={t('loading')}
          >
            <ActivityIndicator color={colors.primary} />
            <ThemedText variant="bodySmall" color="secondary" style={{ marginTop: 8 }}>
              {t('loading')}
            </ThemedText>
          </View>
        )}

        {error && (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <ThemedText variant="body" color="secondary">
              {t('loadError')}
            </ThemedText>
          </View>
        )}

        {term && !loading && (
          <>
            {term.content ? (
              <MarkdownRenderer content={term.content} variant="post" onLinkPress={handleLinkPress} />
            ) : null}

            {term.wikiCategory ? (
              <View style={{
                marginTop: 16,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: colors.cardBorder,
                flexDirection: 'row',
                alignItems: 'center',
              }}>
                <ThemedText variant="bodySmall" color="secondary">
                  {t('category')}: {term.wikiCategory}
                </ThemedText>
              </View>
            ) : null}

            {/* Action buttons — hidden in chat */}
            {showActions && (
              <View style={{
                marginTop: 16,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: colors.cardBorder,
                flexDirection: 'row',
                gap: 12,
              }}>
                <TouchableOpacity
                  onPress={handleViewInWiki}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 16,
                    backgroundColor: colors.cardBackground,
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('viewInWikiA11y')}
                >
                  <Ionicons name="book-outline" size={16} color={colors.primary} />
                  <ThemedText variant="label" color="primary">{t('viewInWiki')}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleEdit}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.primary,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={term.canEdit ? t('directEditA11y') : t('suggestEditA11y')}
                >
                  <Ionicons name="create-outline" size={16} color={colors.primary} />
                  <ThemedText variant="label" color="primary">
                    {term.canEdit ? t('directEdit') : t('suggestEdit')}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </BottomDrawerModal>
  )
})
