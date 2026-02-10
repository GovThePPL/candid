import { useState, useEffect, useMemo } from 'react'
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { GROUP_COLORS, SemanticColors, BrandColor } from '../../constants/Colors'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../ThemedText'
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
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

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
          <ThemedText variant="h3" style={styles.surveyTitle}>{survey.surveyTitle}</ThemedText>
        </View>
        {survey.comparisonQuestion && (
          <ThemedText variant="bodySmall" color="secondary" style={styles.surveyQuestion}>{survey.comparisonQuestion}</ThemedText>
        )}
        <View style={styles.surveyMeta}>
          <ThemedText variant="caption" color="secondary" style={styles.surveyType}>
            {survey.surveyType === 'pairwise' ? 'Pairwise' : 'Standard'}
            {survey.surveyType === 'pairwise'
              ? ` · ${survey.items?.length || 0} items`
              : ` · ${survey.questionCount || 0} questions`}
          </ThemedText>
          {survey.isActive ? (
            <ThemedText variant="caption" color="agree" style={styles.surveyActive}>
              <Ionicons name="ellipse" size={8} color={SemanticColors.agree} /> Active
              {survey.daysRemaining !== null && ` · ${survey.daysRemaining} days left`}
            </ThemedText>
          ) : (
            <ThemedText variant="caption" color="secondary" style={styles.surveyInactive}>
              <Ionicons name="ellipse" size={8} color={colors.pass} /> Completed
              {survey.dateRange && ` · ${survey.dateRange.start} - ${survey.dateRange.end}`}
            </ThemedText>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
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
            <Ionicons name="alert-circle-outline" size={48} color={SemanticColors.disagree} />
            <ThemedText variant="bodySmall" style={styles.errorText}>{error}</ThemedText>
            <TouchableOpacity style={styles.retryButton} onPress={loadSurveys}>
              <ThemedText variant="buttonSmall" color="inverse">Retry</ThemedText>
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
                  <Ionicons name="location" size={16} color={colors.primary} />
                  <ThemedText variant="h3" color="primary" style={styles.locationHeaderText}>
                    {group.locationName || group.locationCode || 'Unknown Location'}
                  </ThemedText>
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
            <Ionicons name="alert-circle-outline" size={48} color={SemanticColors.disagree} />
            <ThemedText variant="bodySmall" style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : (
          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {isPairwise ? (
              <>
                {/* Pairwise Rankings */}
                <View style={styles.section}>
                  <ThemedText variant="h3" style={styles.sectionTitle}>Overall Rankings</ThemedText>
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
                            <Ionicons name="trophy" size={14} color={colors.primary} />
                          )}
                          <ThemedText variant="buttonSmall" color="secondary" style={styles.rankingRank}>{index + 1}.</ThemedText>
                          <ThemedText variant="body" style={[
                            styles.rankingLabel,
                            index === 0 && styles.rankingLabelTop
                          ]}>
                            {item.itemText}
                          </ThemedText>
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
                      <ThemedText variant="h3" style={[styles.sectionTitle, { flex: 1 }]}>{question.question}</ThemedText>
                      {fetchCrosstabs && (
                        <TouchableOpacity
                          style={styles.crosstabsButton}
                          onPress={() => handleViewCrosstabs(question)}
                        >
                          <Ionicons name="stats-chart" size={16} color={colors.primary} />
                          <ThemedText variant="caption" color="primary" style={styles.crosstabsButtonText}>Demographics</ThemedText>
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
                              <ThemedText variant="body" style={[
                                styles.rankingLabel,
                                index === 0 && styles.rankingLabelTop
                              ]}>
                                {option.optionText}
                              </ThemedText>
                            </View>
                            <ThemedText variant="bodySmall" color="secondary" style={styles.rankingVotes}>
                              {option.responseCount} ({percentage}%)
                            </ThemedText>
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
                <ThemedText variant="h3" style={styles.sectionTitle}>Rankings by Group</ThemedText>
                {Object.entries(rankings.groupRankings).map(([groupId, groupData], groupIndex) => (
                  <View key={groupId} style={styles.groupRankingSection}>
                    <View style={styles.groupHeader}>
                      <View
                        style={[
                          styles.groupDot,
                          { backgroundColor: GROUP_COLORS[parseInt(groupId) % GROUP_COLORS.length] }
                        ]}
                      />
                      <ThemedText variant="buttonSmall" style={styles.groupLabel}>
                        Group {groupData.groupLabel}
                      </ThemedText>
                      <View style={styles.groupMemberCount}>
                        <Ionicons name="person" size={12} color={colors.secondaryText} />
                        <ThemedText variant="caption" color="secondary" style={styles.groupMemberText}>{groupData.memberCount}</ThemedText>
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
                              <Ionicons name="trophy" size={14} color={colors.primary} />
                            )}
                            <ThemedText variant="buttonSmall" color="secondary" style={styles.rankingRank}>{index + 1}.</ThemedText>
                            <ThemedText variant="body" style={[
                              styles.rankingLabel,
                              index === 0 && styles.rankingLabelTop
                            ]}>
                              {item.itemText}
                            </ThemedText>
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
            <Ionicons name="alert-circle-outline" size={48} color={SemanticColors.disagree} />
            <ThemedText variant="bodySmall" style={styles.errorText}>{error}</ThemedText>
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
                  <ThemedText variant="h3" style={styles.sectionTitle}>{demographicLabels[demoKey] || demoKey}</ThemedText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                    <View style={styles.crosstabsTable}>
                      {/* Header row with option names */}
                      <View style={styles.tableHeaderRow}>
                        <View style={styles.tableRowHeader}>
                          <ThemedText variant="caption" color="primary" style={styles.tableHeaderText}></ThemedText>
                        </View>
                        {options.map((opt) => (
                          <View key={opt.optionId} style={styles.tableCell}>
                            <ThemedText variant="caption" color="primary" style={styles.tableHeaderText} numberOfLines={2}>
                              {opt.optionText}
                            </ThemedText>
                          </View>
                        ))}
                        <View style={styles.tableCellTotal}>
                          <ThemedText variant="caption" color="primary" style={styles.tableHeaderText}>Total</ThemedText>
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
                            <ThemedText variant="label" style={styles.tableRowHeaderText}>{row.categoryLabel}</ThemedText>
                          </View>
                          {options.map((opt) => {
                            const optData = row.optionBreakdown?.find(o => o.optionId === opt.optionId)
                            return (
                              <View key={opt.optionId} style={styles.tableCell}>
                                <ThemedText variant="label" style={styles.tableCellText}>{optData?.count || 0}</ThemedText>
                              </View>
                            )
                          })}
                          <View style={styles.tableCellTotal}>
                            <ThemedText variant="label" style={styles.tableCellTotalText}>{row.totalInCategory}</ThemedText>
                          </View>
                        </View>
                      ))}

                      {/* Column totals row */}
                      <View style={styles.tableTotalRow}>
                        <View style={styles.tableRowHeader}>
                          <ThemedText variant="label" style={styles.tableTotalHeaderText}>Total</ThemedText>
                        </View>
                        {columnTotals.map((total, idx) => (
                          <View key={idx} style={styles.tableCell}>
                            <ThemedText variant="label" style={styles.tableTotalCellText}>{total}</ThemedText>
                          </View>
                        ))}
                        <View style={styles.tableCellTotal}>
                          <ThemedText variant="buttonSmall" color="primary" style={styles.tableGrandTotalText}>{grandTotal}</ThemedText>
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
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
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
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
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

const createStyles = (colors) => StyleSheet.create({
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
    color: SemanticColors.disagree,
    textAlign: 'center',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  surveyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
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
    flex: 1,
  },
  locationBadge: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  locationCode: {
    fontWeight: '600',
    color: colors.badgeText,
  },
  surveyQuestion: {
    marginTop: 4,
  },
  surveyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  surveyType: {
  },
  surveyActive: {
  },
  surveyInactive: {
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  rankingList: {
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  rankingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
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
    width: 24,
  },
  rankingLabel: {
    fontWeight: '500',
    flex: 1,
  },
  rankingLabelTop: {
    fontWeight: '700',
    color: colors.primary,
  },
  rankingVotes: {
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
  },
  groupMemberCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupMemberText: {
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
    borderBottomColor: colors.cardBorder,
  },
  locationHeaderText: {
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
    backgroundColor: BrandColor + '20',
    borderRadius: 8,
  },
  crosstabsButtonText: {
    fontWeight: '600',
  },
  crosstabsTable: {
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: BrandColor + '20',
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  tableRowAlt: {
    backgroundColor: colors.uiBackground,
  },
  tableRowHeader: {
    width: 120,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: colors.cardBorder,
    justifyContent: 'center',
  },
  tableRowHeaderText: {
    fontWeight: '500',
  },
  tableCell: {
    width: 80,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.cardBorder,
  },
  tableCellText: {
    textAlign: 'center',
    fontWeight: 'normal',
  },
  tableCellTotal: {
    width: 70,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColor + '10',
  },
  tableCellTotalText: {
  },
  tableTotalRow: {
    flexDirection: 'row',
    backgroundColor: BrandColor + '15',
    borderTopWidth: 2,
    borderTopColor: BrandColor + '40',
  },
  tableTotalHeaderText: {
    fontWeight: '700',
  },
  tableTotalCellText: {
  },
  tableGrandTotalText: {
    fontWeight: '700',
  },
  tableHeaderText: {
    fontWeight: '600',
    textAlign: 'center',
  },
  bottomPadding: {
    height: 24,
  },
})
