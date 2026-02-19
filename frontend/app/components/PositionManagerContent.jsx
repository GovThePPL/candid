import { StyleSheet, View, ScrollView, TouchableOpacity, Platform, ActivityIndicator, Animated, LayoutAnimation, UIManager } from 'react-native'
import { useRouter } from 'expo-router'
import { useState, useEffect, useCallback, useRef, useContext, useMemo } from 'react'

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { SemanticColors } from '../constants/Colors'
import { Shadows, Typography } from '../constants/Theme'
import { useThemeColors } from '../hooks/useThemeColors'
import useKeyboardHeight from '../hooks/useKeyboardHeight'
import usePositionManagement from '../hooks/usePositionManagement'
import { UserContext } from '../contexts/UserContext'
import api from '../lib/api'

import ThemedText from './ThemedText'
import ThemedTextInput from './ThemedTextInput'
import InfoModal from './InfoModal'
import LocationCategorySelector from './LocationCategorySelector'
import EmptyState from './EmptyState'
import BottomDrawerModal from './BottomDrawerModal'
import PositionListManager from './PositionListManager'
import { useToast } from './Toast'

const MAX_STATEMENT_LENGTH = 140  // Polis has a 140 character limit
const SEARCH_DEBOUNCE_MS = 500
const MIN_SEARCH_LENGTH = 20

export default function PositionManagerContent({ onScroll, listHeader, stickyHeader }) {
  const { t } = useTranslation('create')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const toast = useToast()
  const [statement, setStatement] = useState("")
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [similarPositions, setSimilarPositions] = useState([])
  const [searchingSimilar, setSearchingSimilar] = useState(false)
  const [suggestedCategory, setSuggestedCategory] = useState(null)
  const [categoryAutoSelected, setCategoryAutoSelected] = useState(false)

  // Rules modal state
  const [showRules, setShowRules] = useState(false)
  const [rules, setRules] = useState([])
  const [rulesLoading, setRulesLoading] = useState(false)

  // Add-mode search state (per list)
  const [myPosAddQuery, setMyPosAddQuery] = useState('')
  const [myPosAddResults, setMyPosAddResults] = useState([])
  const [myPosAddLoading, setMyPosAddLoading] = useState(false)
  const [chattingAddQuery, setChattingAddQuery] = useState('')
  const [chattingAddResults, setChattingAddResults] = useState([])
  const [chattingAddLoading, setChattingAddLoading] = useState(false)
  const [showChattingExplanation, setShowChattingExplanation] = useState(false)

  // Floating action bar state (shared across both PositionListManagers, supports delete and chat modes)
  const [floatingBar, setFloatingBar] = useState({ visible: false, count: 0, mode: null, ref: null })
  const positionsListRef = useRef(null)
  const chattingListRef = useRef(null)
  const scrollViewRef = useRef(null)
  const myPositionsSectionY = useRef(0)
  const chattingListSectionY = useRef(0)
  const { keyboardHeight, webInitialHeight } = useKeyboardHeight()

  const router = useRouter()
  const searchTimeoutRef = useRef(null)
  const myPosAddTimeoutRef = useRef(null)
  const chattingAddTimeoutRef = useRef(null)
  const { user, isBanned } = useContext(UserContext)

  // Position and chatting list data management
  const {
    chattingList, chattingListLoading,
    normalizedMyPositions, normalizedChattingList,
    handleTogglePositionActive, handleDeletePositions, handleBulkTogglePositions,
    adoptPosition, createPosition,
    handleToggleChattingActive, handleDeleteChattingItems, handleBulkToggleChattingItems,
    addToChattingList,
  } = usePositionManagement()

  // Animation values for similar positions
  const similarFadeAnim = useRef(new Animated.Value(0)).current
  const previousSimilarCount = useRef(0)

  async function fetchRules() {
    if (rules.length > 0) return // Already fetched
    setRulesLoading(true)
    try {
      const data = await api.moderation.getRules()
      setRules(data || [])
    } catch (err) {
      console.error('Failed to fetch rules:', err)
    } finally {
      setRulesLoading(false)
    }
  }

  function handleOpenRules() {
    setShowRules(true)
    fetchRules()
  }

  // Debounced search for similar positions and category suggestion
  useEffect(() => {
    // Clear any pending search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Don't search if statement is too short
    if (statement.trim().length < MIN_SEARCH_LENGTH) {
      setSimilarPositions([])
      setSearchingSimilar(false)
      setSuggestedCategory(null)
      return
    }

    setSearchingSimilar(true)

    // Debounce the search
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        // Search for similar positions WITHOUT category filter to get broad results
        const similarResults = await api.positions.searchSimilar(statement.trim(), {
          locationId: selectedLocation,
          limit: 10, // Get more results to better determine category
        })

        setSimilarPositions((similarResults || []).slice(0, 5)) // Show only top 5

        // Suggest category based on most common category among similar positions
        if (similarResults && similarResults.length > 0) {
          // Count categories, weighted by similarity score
          const categoryScores = {}
          similarResults.forEach(result => {
            const catId = result.position.categoryId
            const catName = result.position.category?.label
            if (catId && catName) {
              if (!categoryScores[catId]) {
                categoryScores[catId] = { id: catId, label: catName, score: 0, count: 0 }
              }
              categoryScores[catId].score += result.similarity
              categoryScores[catId].count += 1
            }
          })

          // Find category with highest weighted score
          const topCategory = Object.values(categoryScores)
            .sort((a, b) => b.score - a.score)[0]

          if (topCategory) {
            setSuggestedCategory({
              category: { id: topCategory.id, label: topCategory.label },
              score: topCategory.score / topCategory.count // Average similarity
            })

            // Auto-select if no category manually selected by user
            // (either no selection yet, or previous selection was auto)
            if (!selectedCategory || categoryAutoSelected) {
              setSelectedCategory(topCategory.id)
              setCategoryAutoSelected(true)
            }
          }
        }
      } catch (err) {
        console.error('Error searching similar positions:', err)
        setSimilarPositions([])
      } finally {
        setSearchingSimilar(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [statement, selectedLocation])

  // Animate when similar positions appear/disappear
  useEffect(() => {
    const showingSimilar = searchingSimilar || similarPositions.length > 0
    const wasShowingSimilar = previousSimilarCount.current > 0

    if (showingSimilar && !wasShowingSimilar) {
      // Fade in when similar positions appear
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      Animated.timing(similarFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: Platform.OS !== 'web',
      }).start()
    } else if (!showingSimilar && wasShowingSimilar) {
      // Fade out when similar positions disappear
      Animated.timing(similarFadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }).start()
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    }

    previousSimilarCount.current = showingSimilar ? 1 : 0
  }, [searchingSimilar, similarPositions.length, similarFadeAnim])

  function resetForm() {
    setStatement('')
    setSimilarPositions([])
    setSelectedCategory(null)
    setCategoryAutoSelected(false)
    setSuggestedCategory(null)
  }

  async function handleAdoptPosition(positionId) {
    const success = await adoptPosition(positionId)
    if (success) resetForm()
  }

  async function handleSubmit() {
    if (!statement.trim()) {
      toast?.(t('errorEnterStatement'))
      return
    }
    if (!selectedLocation) {
      toast?.(t('errorSelectLocation'))
      return
    }
    if (!selectedCategory) {
      toast?.(t('errorSelectCategory'))
      return
    }
    if (isOverLimit) {
      return
    }

    setLoading(true)
    setError(null)

    const result = await createPosition(statement.trim(), selectedCategory, selectedLocation)
    if (result.success) {
      resetForm()
    } else {
      setError(result.error)
    }
    setLoading(false)
  }

  // Scroll to section when search input is focused
  const scrollToMyPositions = useCallback(() => {
    // Offset past the section header (~60px for title + subtitle + margin)
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: myPositionsSectionY.current + 60, animated: true })
    }, 50)
  }, [])
  const scrollToChattingList = useCallback(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: chattingListSectionY.current + 60, animated: true })
    }, 50)
  }, [])

  // Normalize search results for PositionListManager add mode
  function normalizeSearchResults(results, excludeIds) {
    return (results || [])
      .filter(r => !excludeIds.has(r.position.id))
      .slice(0, 5)
      .map(r => ({
        id: r.position.id,
        statement: r.position.statement,
        similarity: r.similarity,
        categoryLabel: r.position.category?.label,
        locationCode: r.position.location?.code || '',
        wasPreviouslyHeld: r.wasPreviouslyHeld,
      }))
  }

  // My Positions add-mode search with debounce
  useEffect(() => {
    if (myPosAddTimeoutRef.current) {
      clearTimeout(myPosAddTimeoutRef.current)
    }

    if (myPosAddQuery.trim().length < MIN_SEARCH_LENGTH) {
      setMyPosAddResults([])
      setMyPosAddLoading(false)
      return
    }

    setMyPosAddLoading(true)

    myPosAddTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await api.positions.searchSimilar(myPosAddQuery.trim(), { limit: 10 })
        const myPositionIds = new Set(normalizedMyPositions.map(p => p.id))
        setMyPosAddResults(normalizeSearchResults(results, myPositionIds))
      } catch (err) {
        console.error('Error searching positions for adopt:', err)
        setMyPosAddResults([])
      } finally {
        setMyPosAddLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (myPosAddTimeoutRef.current) clearTimeout(myPosAddTimeoutRef.current)
    }
  }, [myPosAddQuery, normalizedMyPositions])

  // Chatting List add-mode search with debounce
  useEffect(() => {
    if (chattingAddTimeoutRef.current) {
      clearTimeout(chattingAddTimeoutRef.current)
    }

    if (chattingAddQuery.trim().length < MIN_SEARCH_LENGTH) {
      setChattingAddResults([])
      setChattingAddLoading(false)
      return
    }

    setChattingAddLoading(true)

    chattingAddTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await api.positions.searchSimilar(chattingAddQuery.trim(), { limit: 10 })
        const chattingListPositionIds = new Set(chattingList.map(item => item.positionId))
        setChattingAddResults(normalizeSearchResults(results, chattingListPositionIds))
      } catch (err) {
        console.error('Error searching positions for chatting list:', err)
        setChattingAddResults([])
      } finally {
        setChattingAddLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (chattingAddTimeoutRef.current) clearTimeout(chattingAddTimeoutRef.current)
    }
  }, [chattingAddQuery, chattingList])

  async function handleMyPosAdopt(positionId) {
    const success = await adoptPosition(positionId)
    if (success) {
      setMyPosAddResults(prev => prev.filter(r => r.id !== positionId))
    }
  }

  async function handleChattingAdd(positionId) {
    const success = await addToChattingList(positionId)
    if (success) {
      setChattingAddResults(prev => prev.filter(r => r.id !== positionId))
    }
  }

  const remainingChars = MAX_STATEMENT_LENGTH - statement.length
  const isOverLimit = remainingChars < 0

  if (isBanned) {
    return (
      <EmptyState
        icon="ban-outline"
        title={t('bannedTitle')}
        subtitle={t('bannedSubtitle')}
      />
    )
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView ref={scrollViewRef} onScroll={onScroll} scrollEventThrottle={onScroll ? 16 : undefined} stickyHeaderIndices={stickyHeader ? [1] : undefined} contentContainerStyle={[
        styles.scrollContent,
        keyboardHeight > 0 && { paddingBottom: keyboardHeight },
        Platform.OS === 'web' && webInitialHeight > 0 && { minHeight: webInitialHeight },
      ]} keyboardShouldPersistTaps="handled">
        {listHeader && <View style={styles.headerFullWidth}>{listHeader}</View>}
        {stickyHeader && <View style={styles.stickyHeaderFullWidth}>{stickyHeader}</View>}
        <View style={styles.sectionHeaderAreaCompact}>
          <View style={styles.headingRow}>
            <ThemedText variant="h2" color="primary">
              {t('addPosition')}
            </ThemedText>
            <TouchableOpacity
              style={styles.rulesButton}
              onPress={handleOpenRules}
              accessibilityRole="button"
              accessibilityLabel={t('communityRules')}
            >
              <Ionicons name="book-outline" size={15} color={colors.primary} />
              <ThemedText variant="label" color="primary" style={styles.rulesButtonText}>{t('communityRules')}</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.form}>
          <LocationCategorySelector
            selectedLocation={selectedLocation}
            selectedCategory={selectedCategory}
            onLocationChange={setSelectedLocation}
            onCategoryChange={(id) => {
              setSelectedCategory(id)
              setCategoryAutoSelected(false)
            }}
            showLabels
            defaultLocation="last"
            categoryAutoSelected={categoryAutoSelected}
            style={{ paddingHorizontal: 0, marginBottom: 12 }}
          />

          <View style={styles.inputGroupCompact}>
            <ThemedTextInput
              style={styles.statementInput}
              placeholder={t('positionPlaceholder')}
              placeholderTextColor={colors.placeholderText}
              value={statement}
              onChangeText={setStatement}
              multiline={true}
              maxLength={MAX_STATEMENT_LENGTH + 20}
            />
            <ThemedText variant="caption" color="secondary" style={[
              styles.charCount,
              isOverLimit && styles.charCountOver
            ]}>
              {t('charsRemaining', { count: remainingChars })}
            </ThemedText>

            {/* Similar Positions Suggestions */}
            {(searchingSimilar || similarPositions.length > 0) && (
              <Animated.View style={[styles.similarContainer, { opacity: similarFadeAnim }]}>
                <View style={styles.similarHeader}>
                  <Ionicons name="bulb-outline" size={16} color={colors.primary} />
                  <ThemedText variant="label" color="primary" style={styles.similarTitle}>
                    {searchingSimilar ? t('searchingSimilar') : t('similarAdopt')}
                  </ThemedText>
                  {searchingSimilar && (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
                  )}
                </View>

                {!searchingSimilar && similarPositions.map((result) => (
                  <View key={result.position.id} style={styles.similarItem}>
                    <View style={styles.similarContent}>
                      {result.wasPreviouslyHeld && (
                        <View style={styles.previouslyHeldBadge}>
                          <Ionicons name="time-outline" size={12} color={colors.primary} />
                          <ThemedText variant="caption" color="primary" style={styles.previouslyHeldText}>{t('previouslyHeld')}</ThemedText>
                        </View>
                      )}
                      <ThemedText variant="bodySmall" color="dark" style={styles.similarStatement} numberOfLines={2}>
                        "{result.position.statement}"
                      </ThemedText>
                      <ThemedText variant="caption" color="secondary" style={styles.similarMeta}>
                        {t('matchPercent', { percent: Math.round(result.similarity * 100) })}
                        {result.position.category?.label && ` · ${result.position.category.label}`}
                      </ThemedText>
                    </View>
                    <TouchableOpacity
                      style={styles.adoptButton}
                      onPress={() => handleAdoptPosition(result.position.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t('adoptA11y', { statement: result.position.statement })}
                    >
                      <Ionicons name="add-circle" size={28} color={SemanticColors.agree} />
                    </TouchableOpacity>
                  </View>
                ))}

                {!searchingSimilar && similarPositions.length === 0 && statement.trim().length >= MIN_SEARCH_LENGTH && (
                  <ThemedText variant="bodySmall" color="secondary" style={styles.noSimilarText}>
                    {t('noSimilarFound')}
                  </ThemedText>
                )}
              </Animated.View>
            )}
          </View>

          {error && (
            <View style={styles.errorContainerCompact}>
              <ThemedText variant="bodySmall" color="error">{error}</ThemedText>
            </View>
          )}

          <TouchableOpacity
            style={[styles.createButton, (loading || isOverLimit || !statement.trim() || !selectedCategory || !selectedLocation) && styles.createButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={loading ? t('creating') : t('createPosition')}
            accessibilityState={{ disabled: loading || isOverLimit || !statement.trim() || !selectedCategory || !selectedLocation }}
          >
            <Ionicons name="add-circle" size={18} color={colors.primary} />
            <ThemedText variant="buttonSmall" color="primary">
              {loading ? t('creating') : t('createPosition')}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* My Positions Section */}
        <View style={styles.myPositionsSection} onLayout={(e) => { myPositionsSectionY.current = e.nativeEvent.layout.y }}>
          <View style={styles.sectionHeader}>
            <ThemedText variant="h2" color="primary">
              {t('myPositions')}
            </ThemedText>
            <ThemedText variant="bodySmall" color="secondary" style={styles.sectionSubtitle}>
              {t('myPositionsSubtitle')}
            </ThemedText>
          </View>
          <PositionListManager
            ref={positionsListRef}
            items={normalizedMyPositions}
            onToggleActive={handleTogglePositionActive}
            onDeleteItems={handleDeletePositions}
            onBulkToggle={handleBulkTogglePositions}
            onFloatingBarChange={(state) => setFloatingBar({ ...state, ref: positionsListRef })}
            onAddItem={handleMyPosAdopt}
            onAddSearch={setMyPosAddQuery}
            addSearchResults={myPosAddResults}
            addSearchLoading={myPosAddLoading}
            addSearchMinLength={MIN_SEARCH_LENGTH}
            onSearchFocus={scrollToMyPositions}
            emptyIcon="megaphone-outline"
            emptyTitle={t('noPositionsTitle')}
            emptySubtitle={t('noPositionsSubtitle')}
          />
        </View>

        {/* Chatting List Section */}
        <View style={styles.chattingListSection} onLayout={(e) => { chattingListSectionY.current = e.nativeEvent.layout.y }}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeadingRow}>
              <ThemedText variant="h2" color="primary">
                {t('chattingList')}
              </ThemedText>
              <TouchableOpacity
                onPress={() => setShowChattingExplanation(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('chattingListHelp')}
              >
                <Ionicons name="help-circle-outline" size={20} color={colors.secondaryText} />
              </TouchableOpacity>
            </View>
            <ThemedText variant="bodySmall" color="secondary" style={styles.sectionSubtitle}>
              {t('chattingListSubtitle')}
            </ThemedText>
          </View>

          <InfoModal
            visible={showChattingExplanation}
            onClose={() => setShowChattingExplanation(false)}
            icon="chatbubbles"
            iconColor={colors.chat}
            title={t('chattingListHelp')}
            paragraphs={[
              t('chattingListInfoP1'),
              t('chattingListInfoP2'),
            ]}
          />

          <PositionListManager
            ref={chattingListRef}
            items={normalizedChattingList}
            onToggleActive={handleToggleChattingActive}
            onDeleteItems={handleDeleteChattingItems}
            onBulkToggle={handleBulkToggleChattingItems}
            onFloatingBarChange={(state) => setFloatingBar({ ...state, ref: chattingListRef })}
            onAddItem={handleChattingAdd}
            onAddSearch={setChattingAddQuery}
            addSearchResults={chattingAddResults}
            addSearchLoading={chattingAddLoading}
            addSearchMinLength={MIN_SEARCH_LENGTH}
            onSearchFocus={scrollToChattingList}
            loading={chattingListLoading}
            emptyIcon="chatbubbles-outline"
            emptyTitle={t('emptyChattingTitle')}
            emptySubtitle={t('emptyChattingSubtitle')}
          />
        </View>
      </ScrollView>

      {/* Floating delete bar - positioned above tab bar */}
      {floatingBar.visible && (
        <View style={styles.floatingDeleteBar}>
          <ThemedText variant="body" color="dark" style={styles.floatingDeleteCount}>
            {t('countSelected', { count: floatingBar.count })}
          </ThemedText>
          <View style={styles.floatingDeleteActions}>
            <TouchableOpacity
              style={styles.floatingDeleteCancelButton}
              onPress={() => floatingBar.ref?.current?.cancelDelete()}
              accessibilityRole="button"
              accessibilityLabel={t('cancel')}
            >
              <ThemedText variant="bodySmall" color="secondary" style={styles.floatingDeleteCancelText}>{t('cancel')}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.floatingDeleteButton}
              onPress={() => floatingBar.ref?.current?.confirmDelete()}
              accessibilityRole="button"
              accessibilityLabel={t('deleteSelected')}
            >
              <Ionicons name="trash" size={18} color="#FFFFFF" />
              <ThemedText variant="buttonSmall" color="inverse">{t('deleteSelected')}</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <BottomDrawerModal
        visible={showRules}
        onClose={() => setShowRules(false)}
        title={t('communityRules')}
      >
        {rulesLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ paddingVertical: 32 }} />
        ) : rules.length === 0 ? (
          <ThemedText variant="bodySmall" color="secondary" style={styles.rulesEmptyText}>{t('noRulesDefined')}</ThemedText>
        ) : (
          <ScrollView style={styles.rulesScrollView}>
            {rules.map((rule, index) => (
              <View key={rule.id} style={[styles.ruleItem, index === rules.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.ruleHeader}>
                  <ThemedText variant="body" color="dark" style={styles.ruleTitle}>{rule.title}</ThemedText>
                  {rule.severity && (
                    <View style={[
                      styles.severityBadge,
                      rule.severity === 'high' && styles.severityHigh,
                      rule.severity === 'medium' && styles.severityMedium,
                    ]}>
                      <ThemedText variant="caption" style={[
                        styles.severityText,
                        rule.severity === 'high' && styles.severityTextHigh,
                        rule.severity === 'medium' && styles.severityTextMedium,
                      ]}>
                        {t('severity', { level: rule.severity })}
                      </ThemedText>
                    </View>
                  )}
                </View>
                <ThemedText variant="bodySmall" color="secondary">{rule.text}</ThemedText>
              </View>
            ))}
          </ScrollView>
        )}
      </BottomDrawerModal>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  headerFullWidth: {
    marginHorizontal: -20,
    marginTop: -20,
  },
  stickyHeaderFullWidth: {
    marginHorizontal: -20,
    paddingBottom: 8,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  sectionHeaderAreaCompact: {
    marginBottom: 12,
  },
  form: {
    flex: 1,
  },
  inputGroupCompact: {
    marginBottom: 12,
  },
  statementInput: {
    padding: 12,
    borderRadius: 12,
    minHeight: 70,
    textAlignVertical: 'top',
    ...Typography.body,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    color: colors.darkText,
  },
  charCount: {
    textAlign: 'right',
    marginTop: 4,
  },
  charCountOver: {
    color: SemanticColors.warning,
  },
  errorContainerCompact: {
    backgroundColor: colors.errorBannerBg,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: SemanticColors.warning,
    marginBottom: 12,
  },
  // My Positions Section
  myPositionsSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionSubtitle: {
    marginTop: 2,
  },
  // Similar Positions Suggestions
  similarContainer: {
    marginTop: 10,
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 10,
    ...Shadows.card,
  },
  similarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  similarTitle: {
    marginLeft: 6,
    flex: 1,
  },
  similarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  similarContent: {
    flex: 1,
  },
  previouslyHeldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  previouslyHeldText: {
    fontWeight: '500',
  },
  similarStatement: {
    lineHeight: 18,
    fontStyle: 'italic',
  },
  similarMeta: {
    marginTop: 2,
  },
  adoptButton: {
    padding: 4,
    marginLeft: 8,
  },
  noSimilarText: {
    textAlign: 'center',
    paddingVertical: 8,
  },
  // Chatting List Section
  chattingListSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 25,
    paddingVertical: 10,
    gap: 6,
  },
  createButtonDisabled: {
    opacity: 0.4,
  },
  // Floating delete bar (positioned above tab bar)
  floatingDeleteBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: SemanticColors.warning,
    ...Shadows.elevated,
  },
  floatingDeleteCount: {
    fontWeight: '600',
  },
  floatingDeleteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  floatingDeleteCancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 25,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  floatingDeleteCancelText: {
    fontWeight: '500',
  },
  floatingDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SemanticColors.warning,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 25,
    gap: 6,
  },
  // Community Rules
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rulesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rulesButtonText: {
    fontWeight: '500',
  },
  rulesScrollView: {
    paddingHorizontal: 16,
  },
  rulesEmptyText: {
    textAlign: 'center',
    paddingVertical: 32,
  },
  ruleItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  ruleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  ruleTitle: {
    fontWeight: '600',
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.severityLowBg,
  },
  severityHigh: {
    backgroundColor: colors.severityHighBg,
  },
  severityMedium: {
    backgroundColor: colors.severityMediumBg,
  },
  severityText: {
    fontWeight: '600',
    color: colors.severityLowText,
    textTransform: 'capitalize',
  },
  severityTextHigh: {
    color: SemanticColors.warning,
  },
  severityTextMedium: {
    color: colors.severityMediumText,
  },
})
