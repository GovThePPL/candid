import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { SemanticColors } from '../../../constants/Colors'
import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import PositionSummaryCard from '../../../components/stats/PositionSummaryCard'
import ClosureCard from '../../../components/stats/ClosureCard'
import OpinionMapModal from '../../../components/stats/OpinionMapModal'
import AgreedStatementsModal from '../../../components/stats/AgreedStatementsModal'
import { positionsApiWrapper } from '../../../lib/api'

export default function PositionClosures() {
  const { id: positionId } = useLocalSearchParams()
  const { t } = useTranslation('stats')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  // Modal states
  const [showMapModal, setShowMapModal] = useState(false)
  const [showStatementsModal, setShowStatementsModal] = useState(false)
  const [selectedClosure, setSelectedClosure] = useState(null)

  useEffect(() => {
    if (positionId) {
      fetchClosures()
    }
  }, [positionId])

  const fetchClosures = async () => {
    try {
      setError(null)
      const result = await positionsApiWrapper.getAgreedClosures(positionId)
      setData(result)
    } catch (err) {
      console.error('Error fetching closures:', err)
      setError(err.message || t('failedLoadClosures'))
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchClosures()
    setRefreshing(false)
  }, [positionId])

  const handleShowMap = (closure) => {
    setSelectedClosure(closure)
    setShowMapModal(true)
  }

  const handleViewStatements = (closure) => {
    setSelectedClosure(closure)
    setShowStatementsModal(true)
  }

  const handleBack = () => {
    // Navigate back to stats tab - router.back() doesn't work well with tab navigation
    router.navigate('/stats')
  }

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText variant="bodySmall" color="secondary" style={styles.loadingText}>{t('loadingClosures')}</ThemedText>
        </View>
      )
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={SemanticColors.disagree} />
          <ThemedText variant="bodySmall" color="disagree" style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity style={styles.retryButton} onPress={fetchClosures} accessibilityRole="button" accessibilityLabel={t('common:retry')}>
            <ThemedText variant="buttonSmall" color="inverse">{t('common:retry')}</ThemedText>
          </TouchableOpacity>
        </View>
      )
    }

    if (!data) {
      return (
        <View style={styles.centerContainer}>
          <ThemedText variant="bodySmall" color="secondary" style={styles.noDataText}>{t('noDataAvailable2')}</ThemedText>
        </View>
      )
    }

    const { position, closures } = data

    return (
      <>
        {/* Position Summary at top */}
        <PositionSummaryCard position={position} />

        {/* Closures count */}
        <View style={styles.countRow}>
          <ThemedText variant="buttonSmall" style={styles.countText}>
            {t('agreedClosureCount', { count: closures.length })}
          </ThemedText>
          {closures.length > 0 && (
            <ThemedText variant="caption" color="secondary">{t('sortedByValue')}</ThemedText>
          )}
        </View>

        {/* Closures list */}
        {closures.length > 0 ? (
          closures.map((closure) => (
            <ClosureCard
              key={closure.chatLogId}
              closure={closure}
              onShowMap={() => handleShowMap(closure)}
              onViewStatements={() => handleViewStatements(closure)}
            />
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color={colors.secondaryText} />
            <ThemedText variant="h3" style={styles.emptyTitle}>{t('noAgreedClosuresYet')}</ThemedText>
            <ThemedText variant="bodySmall" color="secondary" style={styles.emptyText}>
              {t('noAgreedClosuresDesc')}
            </ThemedText>
          </View>
        )}
      </>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={handleBack} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.pageHeader}>
          <ThemedText variant="h1" color="primary">{t('agreedClosuresTitle')}</ThemedText>
          <ThemedText variant="bodySmall" color="secondary" style={styles.subtitle}>{t('agreedClosuresSubtitle')}</ThemedText>
        </View>

        {renderContent()}
      </ScrollView>

      {/* Opinion Map Modal */}
      <OpinionMapModal
        visible={showMapModal}
        onClose={() => setShowMapModal(false)}
        onDismiss={() => setSelectedClosure(null)}
        groups={data?.groups || []}
        allCategoriesGroups={data?.allCategoriesGroups || []}
        user1={selectedClosure?.positionHolderUser}
        user2={selectedClosure?.initiatorUser}
        locationCode={data?.position?.location?.code}
        categoryLabel={data?.position?.category?.label}
      />

      {/* Agreed Statements Modal */}
      <AgreedStatementsModal
        visible={showStatementsModal}
        onClose={() => {
          setShowStatementsModal(false)
          setSelectedClosure(null)
        }}
        chatLogId={selectedClosure?.chatLogId}
        closureText={selectedClosure?.closureText}
      />
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  pageHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  subtitle: {
    marginTop: 2,
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  countText: {
  },
  centerContainer: {
    flex: 1,
    minHeight: 300,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
  },
  errorText: {
    textAlign: 'center',
    marginTop: 12,
  },
  noDataText: {
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    marginHorizontal: 16,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
  },
  emptyTitle: {
    marginTop: 16,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 8,
  },
})
