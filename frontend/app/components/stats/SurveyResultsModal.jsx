import { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors, GROUP_COLORS } from '../../constants/Colors'
import BottomDrawerModal from '../BottomDrawerModal'
import LoadingView from '../LoadingView'
import EmptyState from '../EmptyState'

/**
 * Modal for viewing survey results (both pairwise and standard)
 */
export default function SurveyResultsModal({
  visible,
  onClose,
  locationId,
  categoryId,
  selectedGroup,
  groups,
  polisConversationId,
  fetchSurveys,
  fetchRankings,
  fetchStandardResults,
  fetchCrosstabs,
}) {
  // Get the selected group's info (letter and custom label)
  const getGroupInfo = () => {
    if (!selectedGroup || selectedGroup === 'majority') {
      return null
    }
    const groupData = groups?.find(g => g.id === selectedGroup)
    if (!groupData) {
      // Fallback to just the letter
      const letter = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][parseInt(selectedGroup)] || selectedGroup
      return { letter, label: null }
    }
    return {
      letter: groupData.label,
      label: groupData.labelRankings?.[0]?.label || null
    }
  }

  const groupInfo = getGroupInfo()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [surveys, setSurveys] = useState([])
  const [selectedSurvey, setSelectedSurvey] = useState(null)
  const [rankings, setRankings] = useState(null)
  const [loadingRankings, setLoadingRankings] = useState(false)

  // Crosstabs state
  const [crosstabsData, setCrosstabsData] = useState(null)
  const [loadingCrosstabs, setLoadingCrosstabs] = useState(false)
  const [selectedQuestionForCrosstabs, setSelectedQuestionForCrosstabs] = useState(null)

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setSelectedSurvey(null)
      setRankings(null)
      setCrosstabsData(null)
      setSelectedQuestionForCrosstabs(null)
      setError(null)
    }
  }, [visible])

  // Load surveys when modal opens
  useEffect(() => {
    if (visible && locationId) {
      loadSurveys()
    }
  }, [visible, locationId, categoryId])

  const loadSurveys = async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await fetchSurveys(locationId, categoryId)
      setSurveys(result || [])
    } catch (err) {
      console.error('Error fetching surveys:', err)
      setError(err.message || 'Failed to load surveys')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectSurvey = async (survey) => {
    setSelectedSurvey(survey)
    try {
      setLoadingRankings(true)
      setError(null)
      // Determine group ID - if selectedGroup is 'majority' or not set, pass null
      const groupId = selectedGroup && selectedGroup !== 'majority' ? selectedGroup : null
      // Fetch results based on survey type, filtered by user's location and group
      if (survey.surveyType === 'pairwise') {
        const result = await fetchRankings(survey.id, locationId, groupId, polisConversationId)
        setRankings(result)
      } else {
        const result = await fetchStandardResults(survey.id, locationId, groupId, polisConversationId)
        setRankings(result)
      }
    } catch (err) {
      console.error('Error fetching results:', err)
      setError(err.message || 'Failed to load results')
    } finally {
      setLoadingRankings(false)
    }
  }

  const handleBack = () => {
    if (crosstabsData) {
      // Go back from crosstabs to survey results
      setCrosstabsData(null)
      setSelectedQuestionForCrosstabs(null)
    } else {
      // Go back from survey results to survey list
      setSelectedSurvey(null)
      setRankings(null)
    }
    setError(null)
  }

  const handleViewCrosstabs = async (question) => {
    if (!fetchCrosstabs) return

    setSelectedQuestionForCrosstabs(question)
    try {
      setLoadingCrosstabs(true)
      setError(null)
      const groupId = selectedGroup && selectedGroup !== 'majority' ? selectedGroup : null
      const result = await fetchCrosstabs(
        selectedSurvey.id,
        question.questionId,
        locationId,
        groupId,
        polisConversationId
      )
      setCrosstabsData(result)
    } catch (err) {
      console.error('Error fetching crosstabs:', err)
      setError(err.message || 'Failed to load demographic breakdown')
    } finally {
      setLoadingCrosstabs(false)
    }
  }

  // Group surveys by location and order with user's location first, then parent locations
  const groupSurveysByLocation = () => {
    if (!surveys || surveys.length === 0) return []

    // Group surveys by locationId
    const groupedMap = new Map()
    surveys.forEach(survey => {
      const locId = survey.locationId || 'unknown'
      if (!groupedMap.has(locId)) {
        groupedMap.set(locId, {
          locationId: locId,
          locationCode: survey.locationCode,
          locationName: survey.locationName,
          surveys: []
        })
      }
      groupedMap.get(locId).surveys.push(survey)
    })

    // Convert to array and sort: user's location first, then by code length descending (more specific first)
    const groups = Array.from(groupedMap.values())
    groups.sort((a, b) => {
      // User's selected location comes first
      if (a.locationId === locationId) return -1
      if (b.locationId === locationId) return 1
      // Then sort by code length descending (longer codes = more specific locations)
      const aLen = (a.locationCode || '').length
      const bLen = (b.locationCode || '').length
      return bLen - aLen
    })

    return groups
  }

  const renderSurveyItem = (survey) => (
    <TouchableOpacity
      key={survey.id}
      style={[styles.surveyItem, !survey.isActive && styles.surveyItemInactive]}
      onPress={() => handleSelectSurvey(survey)}
    >
      <View style={styles.surveyItemContent}>
        <View style={styles.surveyTitleRow}>
          <Text style={styles.surveyTitle}>{survey.surveyTitle}</Text>
        </View>
        {survey.comparisonQuestion && (
          <Text style={styles.surveyQuestion}>{survey.comparisonQuestion}</Text>
        )}
        <View style={styles.surveyMeta}>
          <Text style={styles.surveyType}>
            {survey.surveyType === 'pairwise' ? 'Pairwise' : 'Standard'}
            {survey.surveyType === 'pairwise'
              ? ` · ${survey.items?.length || 0} items`
              : ` · ${survey.questionCount || 0} questions`}
          </Text>
          {survey.isActive ? (
            <Text style={styles.surveyActive}>
              <Ionicons name="ellipse" size={8} color={Colors.agree} /> Active
              {survey.daysRemaining !== null && ` · ${survey.daysRemaining} days left`}
            </Text>
          ) : (
            <Text style={styles.surveyInactive}>
              <Ionicons name="ellipse" size={8} color={Colors.pass} /> Completed
              {survey.dateRange && ` · ${survey.dateRange.start} - ${survey.dateRange.end}`}
            </Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.pass} />
    </TouchableOpacity>
  )

  const renderSurveyList = () => {
    const locationGroups = groupSurveysByLocation()

    return (
      <>
        {loading ? (
          <LoadingView message="Loading surveys..." />
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.disagree} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadSurveys}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : surveys.length === 0 ? (
          <EmptyState
            icon="clipboard-outline"
            title="No surveys available for this location/category."
          />
        ) : (
          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {locationGroups.map((group, groupIndex) => (
              <View key={group.locationId} style={styles.locationSection}>
                <View style={styles.locationHeader}>
                  <Ionicons name="location" size={16} color={Colors.primary} />
                  <Text style={styles.locationHeaderText}>
                    {group.locationName || group.locationCode || 'Unknown Location'}
                  </Text>
                </View>
                {group.surveys.map(survey => renderSurveyItem(survey))}
              </View>
            ))}
            <View style={styles.bottomPadding} />
          </ScrollView>
        )}
      </>
    )
  }

  const renderRankings = () => {
    if (!rankings) return null

    const isPairwise = selectedSurvey?.surveyType === 'pairwise'
    const hasGroupRankings = isPairwise && rankings.groupRankings && Object.keys(rankings.groupRankings).length > 0

    return (
      <>
        {loadingRankings ? (
          <LoadingView message="Loading results..." />
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.disagree} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {isPairwise ? (
              <>
                {/* Pairwise Rankings */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Overall Rankings</Text>
                  <View style={styles.rankingList}>
                    {rankings.rankings?.map((item, index) => (
                      <View
                        key={item.itemId}
                        style={[
                          styles.rankingItem,
                          index === rankings.rankings.length - 1 && styles.rankingItemLast
                        ]}
                      >
                        <View style={styles.rankingLeft}>
                          {item.isCondorcetWinner && (
                            <Ionicons name="trophy" size={14} color={Colors.primary} />
                          )}
                          <Text style={styles.rankingRank}>{index + 1}.</Text>
                          <Text style={[
                            styles.rankingLabel,
                            index === 0 && styles.rankingLabelTop
                          ]}>
                            {item.itemText}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </>
            ) : (
              <>
                {/* Standard Survey Results */}
                {rankings.questions?.map((question) => (
                  <View key={question.questionId} style={styles.section}>
                    <View style={styles.questionHeader}>
                      <Text style={styles.sectionTitle}>{question.question}</Text>
                      {fetchCrosstabs && (
                        <TouchableOpacity
                          style={styles.crosstabsButton}
                          onPress={() => handleViewCrosstabs(question)}
                        >
                          <Ionicons name="stats-chart" size={16} color={Colors.primary} />
                          <Text style={styles.crosstabsButtonText}>Demographics</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.rankingList}>
                      {question.options?.map((option, index) => {
                        const percentage = question.totalResponses > 0
                          ? Math.round((option.responseCount / question.totalResponses) * 100)
                          : 0
                        return (
                          <View
                            key={option.optionId}
                            style={[
                              styles.rankingItem,
                              index === question.options.length - 1 && styles.rankingItemLast
                            ]}
                          >
                            <View style={styles.rankingLeft}>
                              <Text style={[
                                styles.rankingLabel,
                                index === 0 && styles.rankingLabelTop
                              ]}>
                                {option.optionText}
                              </Text>
                            </View>
                            <Text style={styles.rankingVotes}>
                              {option.responseCount} ({percentage}%)
                            </Text>
                          </View>
                        )
                      })}
                    </View>
                  </View>
                ))}
              </>
            )}

            {/* Per-Group Rankings (pairwise only) */}
            {hasGroupRankings && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Rankings by Group</Text>
                {Object.entries(rankings.groupRankings).map(([groupId, groupData], groupIndex) => (
                  <View key={groupId} style={styles.groupRankingSection}>
                    <View style={styles.groupHeader}>
                      <View
                        style={[
                          styles.groupDot,
                          { backgroundColor: GROUP_COLORS[parseInt(groupId) % GROUP_COLORS.length] }
                        ]}
                      />
                      <Text style={styles.groupLabel}>
                        Group {groupData.groupLabel}
                      </Text>
                      <View style={styles.groupMemberCount}>
                        <Ionicons name="person" size={12} color={Colors.pass} />
                        <Text style={styles.groupMemberText}>{groupData.memberCount}</Text>
                      </View>
                    </View>
                    <View style={styles.rankingList}>
                      {groupData.rankings?.map((item, index) => (
                        <View
                          key={item.itemId}
                          style={[
                            styles.rankingItem,
                            index === groupData.rankings.length - 1 && styles.rankingItemLast
                          ]}
                        >
                          <View style={styles.rankingLeft}>
                            {item.isCondorcetWinner && (
                              <Ionicons name="trophy" size={14} color={Colors.primary} />
                            )}
                            <Text style={styles.rankingRank}>{index + 1}.</Text>
                            <Text style={[
                              styles.rankingLabel,
                              index === 0 && styles.rankingLabelTop
                            ]}>
                              {item.itemText}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.bottomPadding} />
          </ScrollView>
        )}
      </>
    )
  }

  const renderCrosstabs = () => {
    if (!crosstabsData) return null

    // Demographic category display names
    const demographicLabels = {
      politicalLean: 'Political Leaning',
      education: 'Education',
      geoLocale: 'Location Type',
      sex: 'Sex',
      ageRange: 'Age',
      race: 'Race/Ethnicity',
      incomeRange: 'Income',
      affiliation: 'Party Affiliation',
    }

    // Sort orders for ordinal demographics
    const sortOrders = {
      education: [
        'less_than_high_school',
        'high_school',
        'some_college',
        'associates',
        'bachelors',
        'masters',
        'doctorate',
        'professional',
      ],
      ageRange: [
        '18-24',
        '25-34',
        '35-44',
        '45-54',
        '55-64',
        '65+',
      ],
      incomeRange: [
        'under_25k',
        '25k-50k',
        '50k-75k',
        '75k-100k',
        '100k-150k',
        '150k-200k',
        'over_200k',
      ],
    }

    // Helper to sort demographic data
    const sortDemoData = (demoKey, data) => {
      const order = sortOrders[demoKey]
      if (!order) return data
      return [...data].sort((a, b) => {
        const indexA = order.indexOf(a.category)
        const indexB = order.indexOf(b.category)
        if (indexA === -1) return 1
        if (indexB === -1) return -1
        return indexA - indexB
      })
    }

    // Calculate column totals for each option
    const options = crosstabsData.options || []

    return (
      <>
        {loadingCrosstabs ? (
          <LoadingView message="Loading demographics..." />
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.disagree} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            horizontal={false}
          >
            {/* Demographic sections as tables */}
            {Object.entries(crosstabsData.demographics || {}).map(([demoKey, demoData]) => {
              if (!demoData || demoData.length === 0) return null

              // Sort the data for ordinal demographics
              const sortedDemoData = sortDemoData(demoKey, demoData)

              // Calculate column totals for this demographic
              const columnTotals = options.map((opt, optIdx) => {
                return sortedDemoData.reduce((sum, row) => {
                  const optData = row.optionBreakdown?.find(o => o.optionId === opt.optionId)
                  return sum + (optData?.count || 0)
                }, 0)
              })
              const grandTotal = columnTotals.reduce((sum, val) => sum + val, 0)

              return (
                <View key={demoKey} style={styles.section}>
                  <Text style={styles.sectionTitle}>{demographicLabels[demoKey] || demoKey}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                    <View style={styles.crosstabsTable}>
                      {/* Header row with option names */}
                      <View style={styles.tableHeaderRow}>
                        <View style={styles.tableRowHeader}>
                          <Text style={styles.tableHeaderText}></Text>
                        </View>
                        {options.map((opt) => (
                          <View key={opt.optionId} style={styles.tableCell}>
                            <Text style={styles.tableHeaderText} numberOfLines={2}>
                              {opt.optionText}
                            </Text>
                          </View>
                        ))}
                        <View style={styles.tableCellTotal}>
                          <Text style={styles.tableHeaderText}>Total</Text>
                        </View>
                      </View>

                      {/* Data rows */}
                      {sortedDemoData.map((row, rowIndex) => (
                        <View
                          key={row.category}
                          style={[
                            styles.tableDataRow,
                            rowIndex % 2 === 1 && styles.tableRowAlt
                          ]}
                        >
                          <View style={styles.tableRowHeader}>
                            <Text style={styles.tableRowHeaderText}>{row.categoryLabel}</Text>
                          </View>
                          {options.map((opt) => {
                            const optData = row.optionBreakdown?.find(o => o.optionId === opt.optionId)
                            return (
                              <View key={opt.optionId} style={styles.tableCell}>
                                <Text style={styles.tableCellText}>{optData?.count || 0}</Text>
                              </View>
                            )
                          })}
                          <View style={styles.tableCellTotal}>
                            <Text style={styles.tableCellTotalText}>{row.totalInCategory}</Text>
                          </View>
                        </View>
                      ))}

                      {/* Column totals row */}
                      <View style={styles.tableTotalRow}>
                        <View style={styles.tableRowHeader}>
                          <Text style={styles.tableTotalHeaderText}>Total</Text>
                        </View>
                        {columnTotals.map((total, idx) => (
                          <View key={idx} style={styles.tableCell}>
                            <Text style={styles.tableTotalCellText}>{total}</Text>
                          </View>
                        ))}
                        <View style={styles.tableCellTotal}>
                          <Text style={styles.tableGrandTotalText}>{grandTotal}</Text>
                        </View>
                      </View>
                    </View>
                  </ScrollView>
                </View>
              )
            })}

            <View style={styles.bottomPadding} />
          </ScrollView>
        )}
      </>
    )
  }

  // Determine which view to show
  const renderContent = () => {
    if (crosstabsData) {
      return renderCrosstabs()
    } else if (selectedSurvey) {
      return renderRankings()
    } else {
      return renderSurveyList()
    }
  }

  // Compute dynamic title, subtitle, and header elements based on current view
  const getHeaderProps = () => {
    if (crosstabsData) {
      return {
        title: 'Demographics',
        subtitle: crosstabsData.questionText,
        headerLeft: (
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
        ),
      }
    }
    if (selectedSurvey && rankings) {
      const locationName = rankings.surveyLocationName || rankings.surveyLocationCode || 'Unknown'
      let groupAndRespondentInfo = ''
      if (groupInfo) {
        groupAndRespondentInfo = `Group ${groupInfo.letter}`
        if (groupInfo.label) groupAndRespondentInfo += ` "${groupInfo.label}"`
        groupAndRespondentInfo += ` · ${rankings.totalRespondents} ${rankings.totalRespondents === 1 ? 'respondent' : 'respondents'}`
      } else {
        groupAndRespondentInfo = `All respondents · ${rankings.totalRespondents} ${rankings.totalRespondents === 1 ? 'respondent' : 'respondents'}`
      }
      if (selectedSurvey.surveyType === 'pairwise') {
        groupAndRespondentInfo += `, ${rankings.totalResponses} votes`
      }
      return {
        title: rankings.surveyTitle,
        subtitle: `${locationName} · ${groupAndRespondentInfo}`,
        headerLeft: (
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
        ),
      }
    }
    return {
      title: `Survey Results${groupInfo ? ` · Group ${groupInfo.letter}` : ''}`,
      subtitle: groupInfo?.label
        ? `"${groupInfo.label}" · Select a survey`
        : 'All respondents · Select a survey',
    }
  }

  const headerProps = getHeaderProps()

  return (
    <BottomDrawerModal
      visible={visible}
      onClose={onClose}
      title={headerProps.title}
      subtitle={headerProps.subtitle}
      headerLeft={headerProps.headerLeft}
    >
      {renderContent()}
    </BottomDrawerModal>
  )
}

const styles = StyleSheet.create({
  backButton: {
    padding: 4,
  },
  scrollContent: {
    flex: 1,
    padding: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  errorText: {
    fontSize: 14,
    color: Colors.disagree,
    textAlign: 'center',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
    borderRadius: 8,
  },
  retryText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  surveyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  surveyItemInactive: {
    opacity: 0.7,
  },
  surveyItemContent: {
    flex: 1,
  },
  surveyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  surveyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    flex: 1,
  },
  locationBadge: {
    backgroundColor: Colors.primaryMuted + '30',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  locationCode: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  surveyQuestion: {
    fontSize: 14,
    color: Colors.pass,
    marginTop: 4,
  },
  surveyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  surveyType: {
    fontSize: 12,
    color: Colors.pass,
  },
  surveyActive: {
    fontSize: 12,
    color: Colors.agree,
  },
  surveyInactive: {
    fontSize: 12,
    color: Colors.pass,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 12,
  },
  rankingList: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  rankingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  rankingItemLast: {
    borderBottomWidth: 0,
  },
  rankingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  rankingRank: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.pass,
    width: 24,
  },
  rankingLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.light.text,
    flex: 1,
  },
  rankingLabelTop: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  rankingVotes: {
    fontSize: 14,
    color: Colors.pass,
    marginLeft: 8,
  },
  groupRankingSection: {
    marginBottom: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  groupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  groupLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  groupMemberCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupMemberText: {
    fontSize: 12,
    color: Colors.pass,
  },
  locationSection: {
    marginBottom: 20,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  locationHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
    flex: 1,
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  crosstabsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.primary + '15',
    borderRadius: 8,
  },
  crosstabsButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  crosstabsTable: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: Colors.primary + '15',
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  tableRowAlt: {
    backgroundColor: Colors.light.cardBackground + 'CC',
  },
  tableRowHeader: {
    width: 120,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: Colors.cardBorder,
    justifyContent: 'center',
  },
  tableRowHeaderText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.light.text,
  },
  tableCell: {
    width: 80,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: Colors.cardBorder,
  },
  tableCellText: {
    fontSize: 13,
    color: Colors.light.text,
    textAlign: 'center',
  },
  tableCellTotal: {
    width: 70,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '08',
  },
  tableCellTotalText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
  },
  tableTotalRow: {
    flexDirection: 'row',
    backgroundColor: Colors.primary + '10',
    borderTopWidth: 2,
    borderTopColor: Colors.primary + '30',
  },
  tableTotalHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.light.text,
  },
  tableTotalCellText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
  },
  tableGrandTotalText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    textAlign: 'center',
  },
  bottomPadding: {
    height: 24,
  },
})
