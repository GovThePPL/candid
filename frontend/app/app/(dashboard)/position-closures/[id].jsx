import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { SemanticColors } from '../../../constants/Colors'
import Header from '../../../components/Header'
import PositionSummaryCard from '../../../components/stats/PositionSummaryCard'
import ClosureCard from '../../../components/stats/ClosureCard'
import OpinionMapModal from '../../../components/stats/OpinionMapModal'
import AgreedStatementsModal from '../../../components/stats/AgreedStatementsModal'
import { positionsApiWrapper } from '../../../lib/api'

export default function PositionClosures() {
  const { id: positionId } = useLocalSearchParams()
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
      setError(err.message || 'Failed to load closures')
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
          <Text style={styles.loadingText}>Loading closures...</Text>
        </View>
      )
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={SemanticColors.disagree} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchClosures}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )
    }

    if (!data) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.noDataText}>No data available</Text>
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
          <Text style={styles.countText}>
            {closures.length} Agreed {closures.length === 1 ? 'Closure' : 'Closures'}
          </Text>
          {closures.length > 0 && (
            <Text style={styles.sortText}>Sorted by value</Text>
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
            <Text style={styles.emptyTitle}>No Agreed Closures Yet</Text>
            <Text style={styles.emptyText}>
              When chats about this position end with an agreed statement, they will appear here.
            </Text>
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
          <Text style={styles.title}>Agreed Closures</Text>
          <Text style={styles.subtitle}>Chats that reached agreement</Text>
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
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.secondaryText,
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
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  sortText: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  centerContainer: {
    flex: 1,
    minHeight: 300,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
    color: colors.secondaryText,
    marginTop: 12,
  },
  errorText: {
    fontSize: 14,
    color: SemanticColors.disagree,
    textAlign: 'center',
    marginTop: 12,
  },
  noDataText: {
    fontSize: 14,
    color: colors.secondaryText,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
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
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: colors.secondaryText,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
})
