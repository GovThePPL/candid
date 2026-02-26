import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../../hooks/useThemeColors'
import { useToast } from '../../../../components/Toast'
import api from '../../../../lib/api'
import { CacheManager, CacheKeys } from '../../../../lib/cache'
import SuggestionForm from '../../../../components/wiki/SuggestionForm'

export default function SuggestionFormScreen() {
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const router = useRouter()
  const showToast = useToast()
  const params = useLocalSearchParams()

  const safeBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/(tabs)/wiki')
    }
  }, [router])

  // Extract params
  const suggestionType = params.type || 'new_term'
  const isEdit = suggestionType === 'edit_page' || suggestionType === 'edit_term'
  const directEdit = params.directEdit === 'true'
  const wikiPagePath = params.pagePath || undefined
  const termSlug = params.termSlug || undefined
  const termIdFromParams = params.termId ? Number(params.termId) : undefined

  // Fetch existing data from API for edit modes
  const [existing, setExisting] = useState(undefined)
  const [resolvedTermId, setResolvedTermId] = useState(termIdFromParams)
  const [loadingExisting, setLoadingExisting] = useState(isEdit)

  useEffect(() => {
    if (!isEdit) return

    const load = async () => {
      try {
        // Fetch locations + sessions in parallel for scope label resolution
        const [allLocs, allSessions] = await Promise.all([
          api.users.getAllLocations().catch(() => []),
          api.sessions.getAll().catch(() => []),
        ])
        const locMap = new Map((Array.isArray(allLocs) ? allLocs : []).map(l => [l.id, l.name]))
        const sessionMap = new Map((Array.isArray(allSessions) ? allSessions : []).map(c => [c.id, c.label]))

        const resolveScopes = (locationIds, sessionIds) => [
          ...(locationIds || []).map(id => ({ type: 'location', id, label: locMap.get(id) || id })),
          ...(sessionIds || []).map(id => ({ type: 'session', id, label: sessionMap.get(id) || id })),
        ]

        if (suggestionType === 'edit_page' && wikiPagePath) {
          const page = await api.wiki.getPage(wikiPagePath)
          setExisting({
            title: page.title || '',
            summary: page.description || '',
            content: page.content || '',
            wikiCategory: page.wikiCategory || '',
            scopes: resolveScopes(page.locationIds, page.sessionIds),
            scopeCombine: page.scopeCombine || 'or',
          })
        } else if (suggestionType === 'edit_term' && termSlug) {
          const term = await api.glossary.getTerm(termSlug)
          if (!termIdFromParams && term.id) setResolvedTermId(term.id)
          setExisting({
            term: term.term || '',
            title: term.term || '',
            aliases: term.aliases || [],
            summary: term.summary || '',
            content: term.content || '',
            wikiCategory: term.wikiCategory || '',
            scopes: resolveScopes(term.locationIds, term.sessionIds),
            scopeCombine: term.scopeCombine || 'or',
          })
        }
      } catch {
        // If fetch fails, proceed without existing data (form starts empty)
      } finally {
        setLoadingExisting(false)
      }
    }
    load()
  }, [isEdit, suggestionType, wikiPagePath, termSlug, termIdFromParams])

  const handleSuccess = (result) => {
    // Direct create returns the full item with slug — navigate to it
    if (!isEdit && result?.slug) {
      const isTerm = suggestionType === 'new_term'
      showToast?.(t('directCreateSuccess'))
      if (isTerm) {
        router.replace(`/wiki/glossary/${result.slug}`)
      } else {
        router.replace(`/wiki/${result.slug}`)
      }
      return
    }
    // Existing logic for edits and suggestions
    showToast?.(directEdit ? t('directEditSuccess') : t('suggestionSuccess'))
    // Invalidate cache so the article page refetches fresh data on focus
    if (termSlug) CacheManager.invalidate(CacheKeys.glossaryTerm(termSlug))
    if (wikiPagePath) CacheManager.invalidate(CacheKeys.wikiPage(wikiPagePath))
    safeBack()
  }

  const handleCancel = () => {
    safeBack()
  }

  if (loadingExisting) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SuggestionForm
        suggestionType={suggestionType}
        existing={existing}
        glossaryTermId={resolvedTermId}
        glossaryTermSlug={termSlug}
        wikiPagePath={wikiPagePath}
        directEdit={directEdit}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
