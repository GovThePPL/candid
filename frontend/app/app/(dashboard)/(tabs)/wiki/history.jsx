import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { View, FlatList, ActivityIndicator, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../../hooks/useThemeColors'
import api from '../../../../lib/api'
import Header from '../../../../components/Header'
import EmptyState from '../../../../components/EmptyState'
import VersionCard from '../../../../components/wiki/VersionCard'

export default function WikiHistoryScreen() {
  const { slug, type } = useLocalSearchParams()
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const router = useRouter()

  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Accordion state
  const [expandedId, setExpandedId] = useState(null)
  const [versionDetails, setVersionDetails] = useState({})
  const [detailLoading, setDetailLoading] = useState(null)
  const detailLoadingRef = useRef(null)

  const isTerm = type === 'term'

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setLoading(true)
    setError(false)

    const load = async () => {
      try {
        const data = isTerm
          ? await api.glossary.getTermHistory(slug)
          : await api.wiki.getPageHistory(slug)
        if (!cancelled) {
          setVersions(data || [])
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
  }, [slug, isTerm])

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const handleToggle = useCallback(async (version) => {
    const id = version.id
    if (expandedId === id) {
      setExpandedId(null)
      return
    }

    setExpandedId(id)

    // If already cached, don't re-fetch
    if (versionDetails[id]) return

    // Fetch version detail
    setDetailLoading(id)
    detailLoadingRef.current = id
    try {
      const detail = isTerm
        ? await api.glossary.getTermVersion(slug, id)
        : await api.wiki.getPageVersion(id, slug)
      // Only update if this is still the pending request
      if (detailLoadingRef.current === id) {
        setVersionDetails(prev => ({ ...prev, [id]: detail }))
        setDetailLoading(null)
      }
    } catch {
      if (detailLoadingRef.current === id) {
        setDetailLoading(null)
      }
    }
  }, [expandedId, versionDetails, isTerm, slug])

  const renderItem = useCallback(({ item }) => (
    <VersionCard
      version={item}
      expanded={expandedId === item.id}
      onToggle={() => handleToggle(item)}
      versionDetail={versionDetails[item.id] || null}
      detailLoading={detailLoading === item.id}
      isTerm={isTerm}
    />
  ), [expandedId, handleToggle, versionDetails, detailLoading, isTerm])

  const keyExtractor = useCallback((item) => item.id, [])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={handleBack} title={t('historyTitle')} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <EmptyState
            icon="alert-circle-outline"
            title={t('historyLoadError')}
          />
        </View>
      ) : versions.length === 0 ? (
        <View style={styles.centered}>
          <EmptyState
            icon="document-text-outline"
            title={t('historyEmpty')}
            subtitle={t('historyEmptySubtitle')}
          />
        </View>
      ) : (
        <FlatList
          data={versions}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.list}
        />
      )}
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
  list: {
    paddingVertical: 16,
  },
})
