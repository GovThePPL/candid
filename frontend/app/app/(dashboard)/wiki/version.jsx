import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import api from '../../../lib/api'
import Header from '../../../components/Header'
import ThemedText from '../../../components/ThemedText'
import EmptyState from '../../../components/EmptyState'
import ReviewDiffContent from '../../../components/wiki/ReviewDiffContent'
import MarkdownRenderer from '../../../components/discuss/MarkdownRenderer'
import { formatRelativeTime } from '../../../lib/timeUtils'

export default function WikiVersionScreen() {
  const { versionId, slug, type } = useLocalSearchParams()
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [version, setVersion] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!versionId || !slug) return
    let cancelled = false
    setLoading(true)
    setError(false)

    const load = async () => {
      try {
        const data = type === 'term'
          ? await api.glossary.getTermVersion(slug, versionId)
          : await api.wiki.getPageVersion(versionId, slug)
        if (!cancelled) {
          setVersion(data)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [versionId, slug, type])

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const authorName = version?.editedBy?.displayName || version?.editedBy?.username || ''
  const dateStr = version?.editedAt ? formatRelativeTime(version.editedAt, t) : ''
  const headerTitle = authorName ? `${authorName} — ${dateStr}` : dateStr

  const isTerm = type === 'term'
  const hasAfter = version?.afterSnapshot != null

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={handleBack} title={headerTitle} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <EmptyState
            icon="alert-circle-outline"
            title={t('historyVersionLoadError')}
          />
        </View>
      ) : version ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        >
          {hasAfter ? (
            <ReviewDiffContent
              original={version.beforeSnapshot}
              proposed={version.afterSnapshot}
              isTerm={isTerm}
            />
          ) : (
            <>
              <View style={styles.noticeBanner}>
                <Ionicons name="information-circle-outline" size={18} color={colors.secondaryText} />
                <ThemedText variant="bodySmall" color="secondary">
                  {t('historyEarliestVersion')}
                </ThemedText>
              </View>
              {version.beforeSnapshot?.content ? (
                <MarkdownRenderer
                  content={version.beforeSnapshot.content}
                  variant="wiki"
                />
              ) : null}
            </>
          )}
        </ScrollView>
      ) : null}
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
})
