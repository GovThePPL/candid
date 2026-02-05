import { useState, useEffect, useCallback, useContext } from 'react'
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import Header from '../../components/Header'
import LocationCategorySelector from '../../components/LocationCategorySelector'
import OpinionMapVisualization from '../../components/stats/OpinionMapVisualization'
import GroupTabBar from '../../components/stats/GroupTabBar'
import PositionCarousel from '../../components/stats/PositionCarousel'
import GroupDemographicsModal from '../../components/stats/GroupDemographicsModal'
import SurveyResultsModal from '../../components/stats/SurveyResultsModal'
import InfoModal from '../../components/InfoModal'
import { statsApiWrapper, surveysApiWrapper, API_BASE_URL } from '../../lib/api'
import { UserContext } from '../../contexts/UserContext'

export default function Stats() {
  const { user } = useContext(UserContext)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [statsData, setStatsData] = useState(null)
  const [activeTab, setActiveTab] = useState('majority')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showDemographicsModal, setShowDemographicsModal] = useState(false)
  const [showLabelHelpModal, setShowLabelHelpModal] = useState(false)
  const [showSurveyResultsModal, setShowSurveyResultsModal] = useState(false)

  // Fetch stats when location/category changes
  useEffect(() => {
    if (selectedLocation && selectedCategory) {
      fetchStats()
    }
  }, [selectedLocation, selectedCategory])

  const fetchStats = async () => {
    if (!selectedLocation || !selectedCategory) return

    try {
      setLoading(true)
      setError(null)
      const data = await statsApiWrapper.getStats(selectedLocation, selectedCategory)
      setStatsData(data)
      // Reset to majority tab when data changes
      setActiveTab('majority')
    } catch (err) {
      console.error('Error fetching stats:', err)
      setError(err.message || 'Failed to load statistics')
      setStatsData(null)
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchStats()
    setRefreshing(false)
  }, [selectedLocation, selectedCategory])

  const handleGroupSelect = (groupId) => {
    setActiveTab(groupId)
  }

  // Get section title and help content based on active tab
  const getPositionsSectionInfo = () => {
    if (activeTab === 'majority') {
      return {
        title: 'Consensus Positions',
        helpTitle: 'Consensus Positions',
        helpText: 'These are positions where a strong majority of all users agree or disagree. They represent areas of broad consensus across all opinion groups.',
      }
    }
    if (activeTab === 'my_positions') {
      return {
        title: 'My Positions',
        helpTitle: 'My Positions',
        helpText: 'These are positions you have submitted that have received votes. They are sorted by the percentage of users who agreed with them.',
      }
    }
    // Group tab
    const groupLabel = statsData?.groups?.find(g => g.id === activeTab)?.label || activeTab
    return {
      title: 'Defining Positions',
      helpTitle: 'Defining Positions',
      helpText: `These are positions that define Group ${groupLabel}. They show the strongest opinions that distinguish this group from others - positions where this group votes significantly differently than the overall population.`,
    }
  }

  const sectionInfo = getPositionsSectionInfo()

  const handleOpenPolisReport = () => {
    if (statsData?.polisReportUrl) {
      // Construct full URL - polisReportUrl is now just /report/{id}
      const baseHost = API_BASE_URL.replace(/\/api\/v1$/, '')
      const fullUrl = `${baseHost}${statsData.polisReportUrl}`
      console.log('Opening Polis report:', fullUrl)

      if (Platform.OS === 'web') {
        window.open(fullUrl, '_blank')
      } else {
        Linking.openURL(fullUrl).catch(err => {
          console.error('Failed to open URL:', err)
        })
      }
    } else {
      console.log('No polisReportUrl available:', statsData)
    }
  }

  const handleViewClosures = (positionId) => {
    router.push(`/position-closures/${positionId}`)
  }

  const renderHelpModal = () => (
    <InfoModal
      visible={showHelpModal}
      onClose={() => setShowHelpModal(false)}
      title={sectionInfo.helpTitle}
    >
      <InfoModal.Paragraph>{sectionInfo.helpText}</InfoModal.Paragraph>
      <InfoModal.Paragraph>
        The bars show the percentage who agreed (green), passed (gray), or disagreed (red).
      </InfoModal.Paragraph>
      <InfoModal.Paragraph>
        <Text style={{ fontWeight: '600' }}>All:</Text> How everyone voted overall
      </InfoModal.Paragraph>
      <InfoModal.Paragraph>
        <Text style={{ fontWeight: '600' }}>A, B, C, D:</Text> How each opinion group voted
      </InfoModal.Paragraph>
    </InfoModal>
  )

  const renderContent = () => {
    if (loading && !refreshing) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading statistics...</Text>
        </View>
      )
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )
    }

    if (!selectedLocation || !selectedCategory) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.placeholderText}>
            Select a location and category to view opinion groups
          </Text>
        </View>
      )
    }

    return (
      <>
        {/* Opinion Map Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Opinion Map</Text>
          <OpinionMapVisualization
            groups={statsData?.groups || []}
            userPosition={statsData?.userPosition}
            userInfo={user ? { displayName: user.displayName, avatarUrl: user.avatarUrl, avatarIconUrl: user.avatarIconUrl } : null}
            selectedGroup={activeTab}
            onGroupSelect={handleGroupSelect}
          />
        </View>

        {/* Group Tab Bar - Below the graph */}
        <View style={styles.tabBarContainer}>
          <GroupTabBar
            groups={statsData?.groups || []}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            showMyPositions={true}
          />
        </View>

        {/* Selected Group Label and Demographics Row */}
        {activeTab !== 'my_positions' && (statsData?.groups?.length > 0) && (
          <View style={styles.demographicsRow}>
            {/* Show top 3 labels for selected group */}
            {(() => {
              const selectedGroup = activeTab === 'majority'
                ? null
                : statsData.groups.find(g => g.id === activeTab)

              if (selectedGroup?.labelRankings?.length > 0) {
                const topLabels = selectedGroup.labelRankings.slice(0, 3)
                return (
                  <View style={styles.selectedGroupLabel}>
                    <View style={styles.selectedGroupLabelHeader}>
                      <Text style={styles.selectedGroupLabelTitle}>
                        Group {selectedGroup.label} Identity:
                      </Text>
                      <TouchableOpacity
                        style={styles.labelHelpButton}
                        onPress={() => setShowLabelHelpModal(true)}
                      >
                        <Ionicons name="help-circle-outline" size={18} color={Colors.pass} />
                      </TouchableOpacity>
                    </View>
                    {topLabels.map((item, idx) => (
                      <View key={item.label} style={styles.labelRankingRow}>
                        <Text style={[
                          styles.labelRankingText,
                          idx === 0 && styles.labelRankingTextTop
                        ]}>
                          {idx + 1}. {item.label}
                        </Text>
                        <Text style={styles.labelWinsText}>
                          ({item.wins} {item.wins === 1 ? 'vote' : 'votes'})
                        </Text>
                      </View>
                    ))}
                  </View>
                )
              }
              return null
            })()}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={styles.demographicsButton}
                onPress={() => setShowDemographicsModal(true)}
              >
                <Ionicons name="people-outline" size={16} color={Colors.primary} />
                <Text style={styles.demographicsButtonText}>Demographics</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.demographicsButton}
                onPress={() => setShowSurveyResultsModal(true)}
              >
                <Ionicons name="bar-chart-outline" size={16} color={Colors.primary} />
                <Text style={styles.demographicsButtonText}>Survey Results</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            {activeTab === 'majority' && statsData?.polisReportUrl && (
              <TouchableOpacity
                style={styles.fullReportButton}
                onPress={handleOpenPolisReport}
              >
                <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
                <Text style={styles.demographicsButtonText}>Full Polis Report</Text>
                <Ionicons name="open-outline" size={16} color={Colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Positions Section */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitleInline}>{sectionInfo.title}</Text>
            <TouchableOpacity
              style={styles.helpButton}
              onPress={() => setShowHelpModal(true)}
            >
              <Ionicons name="help-circle-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
          </View>
          <PositionCarousel
            positions={statsData?.positions || []}
            groups={statsData?.groups || []}
            activeTab={activeTab}
            userVotes={statsData?.userVotes || {}}
            userPositionIds={statsData?.userPositionIds || []}
            onViewClosures={handleViewClosures}
          />
        </View>
      </>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Page Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.title}>Stats</Text>
          <Text style={styles.subtitle}>See how opinions cluster</Text>
        </View>

        {/* Location/Category Selector - scrolls with content */}
        <LocationCategorySelector
          selectedLocation={selectedLocation}
          selectedCategory={selectedCategory}
          onLocationChange={setSelectedLocation}
          onCategoryChange={setSelectedCategory}
          showAllCategories
        />

        {renderContent()}
      </ScrollView>

      {renderHelpModal()}

      {/* Group Demographics Modal */}
      <GroupDemographicsModal
        visible={showDemographicsModal}
        onClose={() => setShowDemographicsModal(false)}
        locationId={selectedLocation}
        categoryId={selectedCategory}
        groupId={activeTab === 'majority' ? 'all' : activeTab}
        groupLabel={
          activeTab === 'majority'
            ? 'All'
            : statsData?.groups?.find((g) => g.id === activeTab)?.label
        }
        labelRankings={
          activeTab === 'majority'
            ? null
            : statsData?.groups?.find((g) => g.id === activeTab)?.labelRankings
        }
        fetchDemographics={statsApiWrapper.getGroupDemographics}
      />

      {/* Label Help Modal */}
      <InfoModal
        visible={showLabelHelpModal}
        onClose={() => setShowLabelHelpModal(false)}
        title="How Group Labels Work"
      >
        <InfoModal.Item icon="swap-horizontal-outline">
          Group members vote on pairs of labels, choosing which one better describes themselves.
        </InfoModal.Item>
        <InfoModal.Item icon="trophy-outline">
          Labels are ranked by total votes received. The top-voted label becomes the group's identity.
        </InfoModal.Item>
        <InfoModal.Item icon="people-outline">
          Only votes from members of this specific group count toward its label ranking.
        </InfoModal.Item>
      </InfoModal>

      {/* Survey Results Modal */}
      <SurveyResultsModal
        visible={showSurveyResultsModal}
        onClose={() => setShowSurveyResultsModal(false)}
        locationId={selectedLocation}
        categoryId={selectedCategory}
        selectedGroup={activeTab}
        groups={statsData?.groups || []}
        polisConversationId={statsData?.conversationId}
        fetchSurveys={surveysApiWrapper.getAllSurveys.bind(surveysApiWrapper)}
        fetchRankings={surveysApiWrapper.getSurveyRankings.bind(surveysApiWrapper)}
        fetchStandardResults={surveysApiWrapper.getStandardSurveyResults.bind(surveysApiWrapper)}
        fetchCrosstabs={surveysApiWrapper.getQuestionCrosstabs.bind(surveysApiWrapper)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.primary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.pass,
    marginTop: 2,
  },
  tabBarContainer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.light.background,
  },
  demographicsRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  selectedGroupLabel: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  selectedGroupLabelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  selectedGroupLabelTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.pass,
  },
  labelHelpButton: {
    padding: 2,
  },
  labelWithWins: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectedGroupLabelText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  labelWinsText: {
    fontSize: 12,
    color: Colors.pass,
  },
  labelRankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  labelRankingText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.light.text,
  },
  labelRankingTextTop: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  demographicsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    gap: 6,
  },
  demographicsButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.primary,
  },
  fullReportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    gap: 6,
  },
  section: {
    marginTop: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitleInline: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  helpButton: {
    padding: 4,
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
    color: Colors.pass,
    marginTop: 12,
  },
  errorText: {
    fontSize: 14,
    color: Colors.disagree,
    textAlign: 'center',
  },
  placeholderText: {
    fontSize: 14,
    color: Colors.pass,
    textAlign: 'center',
  },
})
