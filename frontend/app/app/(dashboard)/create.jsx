import { StyleSheet, Text, View, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert as RNAlert, ActivityIndicator, Animated, LayoutAnimation, UIManager } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { useState, useEffect, useCallback, useRef, useContext } from 'react'

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import { UserContext } from '../../contexts/UserContext'
import api from '../../lib/api'

import ThemedText from "../../components/ThemedText"
import ThemedTextInput from "../../components/ThemedTextInput"
import ThemedButton from '../../components/ThemedButton'
import Spacer from '../../components/Spacer'
import Header from '../../components/Header'
import InfoModal from '../../components/InfoModal'
import LocationCategorySelector from '../../components/LocationCategorySelector'

const MAX_STATEMENT_LENGTH = 140  // Polis has a 140 character limit
const SEARCH_DEBOUNCE_MS = 500
const MIN_SEARCH_LENGTH = 20

// Cross-platform alert that works on web
const Alert = {
  alert: (title, message, buttons) => {
    if (Platform.OS === 'web') {
      // For web, use window.confirm for destructive actions
      if (buttons && buttons.length === 2) {
        const destructiveButton = buttons.find(b => b.style === 'destructive')
        const cancelButton = buttons.find(b => b.style === 'cancel')
        if (destructiveButton && cancelButton) {
          if (window.confirm(`${title}\n\n${message}`)) {
            destructiveButton.onPress?.()
          }
          return
        }
      }
      // For simple alerts
      window.alert(`${title}\n\n${message}`)
    } else {
      RNAlert.alert(title, message, buttons)
    }
  }
}

export default function Create() {
  const [statement, setStatement] = useState("")
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [myPositions, setMyPositions] = useState([])
  const [expandedLocations, setExpandedLocations] = useState({})
  const [expandedCategories, setExpandedCategories] = useState({})
  const [similarPositions, setSimilarPositions] = useState([])
  const [searchingSimilar, setSearchingSimilar] = useState(false)
  const [suggestedCategory, setSuggestedCategory] = useState(null)
  const [categoryAutoSelected, setCategoryAutoSelected] = useState(false)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null)

  // Chatting List state
  const [chattingList, setChattingList] = useState([])
  const [chattingListLoading, setChattingListLoading] = useState(false)
  const [expandedChattingCategories, setExpandedChattingCategories] = useState({})
  const [expandedChattingLocations, setExpandedChattingLocations] = useState({})
  const [confirmingChattingDeleteId, setConfirmingChattingDeleteId] = useState(null)
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(null) // { type: 'category'|'location', categoryId?, categoryName?, locationCode?, locationName?, count }
  const [showChattingSearch, setShowChattingSearch] = useState(false)
  const [chattingSearchQuery, setChattingSearchQuery] = useState('')
  const [chattingSearchResults, setChattingSearchResults] = useState([])
  const [searchingChatting, setSearchingChatting] = useState(false)
  const [showChattingExplanation, setShowChattingExplanation] = useState(false)

  const router = useRouter()
  const searchTimeoutRef = useRef(null)
  const chattingSearchTimeoutRef = useRef(null)
  const { positionsVersion } = useContext(UserContext)
  const lastFetchedVersion = useRef(-1) // -1 means never fetched

  // Animation values for similar positions
  const similarFadeAnim = useRef(new Animated.Value(0)).current
  const previousSimilarCount = useRef(0)

  const fetchMyPositions = useCallback(async () => {
    try {
      const positionsData = await api.users.getMyPositions('all')
      setMyPositions(positionsData || [])
    } catch (err) {
      console.error('Failed to fetch my positions:', err)
    }
  }, [])

  const fetchChattingList = useCallback(async () => {
    try {
      setChattingListLoading(true)
      const data = await api.chattingList.getList()
      setChattingList(data || [])
    } catch (err) {
      console.error('Failed to fetch chatting list:', err)
    } finally {
      setChattingListLoading(false)
    }
  }, [])

  useEffect(() => {
    async function fetchData() {
      await fetchMyPositions()
      await fetchChattingList()
      lastFetchedVersion.current = positionsVersion
    }
    fetchData()
  }, [fetchMyPositions, fetchChattingList, positionsVersion])

  // Refresh positions and chatting list when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (lastFetchedVersion.current !== positionsVersion) {
        fetchMyPositions()
        lastFetchedVersion.current = positionsVersion
      }
      // Always refetch chatting list on focus - it can change from the cards page
      fetchChattingList()
    }, [fetchMyPositions, fetchChattingList, positionsVersion])
  )

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
        useNativeDriver: true,
      }).start()
    } else if (!showingSimilar && wasShowingSimilar) {
      // Fade out when similar positions disappear
      Animated.timing(similarFadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start()
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    }

    previousSimilarCount.current = showingSimilar ? 1 : 0
  }, [searchingSimilar, similarPositions.length, similarFadeAnim])

  async function handleAdoptPosition(positionId) {
    try {
      await api.positions.adopt(positionId)
      // Clear form and refresh my positions
      setStatement('')
      setSimilarPositions([])
      setSelectedCategory(null)
      setCategoryAutoSelected(false)
      setSuggestedCategory(null)
      await fetchMyPositions()
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to adopt position')
    }
  }

  async function handleSubmit() {
    if (!statement.trim()) {
      setError('Please enter a statement')
      return
    }
    if (!selectedCategory) {
      setError('Please select a category')
      return
    }
    if (!selectedLocation) {
      setError('Please select a location')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await api.positions.create(statement.trim(), selectedCategory, selectedLocation)

      setStatement("")
      setSelectedCategory(null)
      setCategoryAutoSelected(false)
      setSuggestedCategory(null)
      setSimilarPositions([])

      // Refresh the positions list to show the new position
      await fetchMyPositions()
    } catch (err) {
      setError(err.message || 'Failed to create position')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleStatus(position) {
    const newStatus = position.status === 'active' ? 'inactive' : 'active'
    try {
      await api.users.updatePosition(position.id, newStatus)
      // Update local state
      setMyPositions(prev => prev.map(p =>
        p.id === position.id ? { ...p, status: newStatus } : p
      ))
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update position')
    }
  }

  function handleDeletePosition(position) {
    setConfirmingDeleteId(position.id)
  }

  async function confirmDeletePosition(positionId) {
    try {
      await api.users.deletePosition(positionId)
      // Remove from local state
      setMyPositions(prev => prev.filter(p => p.id !== positionId))
      setConfirmingDeleteId(null)
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to delete position')
      setConfirmingDeleteId(null)
    }
  }

  function cancelDeletePosition() {
    setConfirmingDeleteId(null)
  }

  // Chatting List handlers
  async function handleToggleChattingActive(item) {
    try {
      await api.chattingList.toggleActive(item.id, !item.isActive)
      setChattingList(prev => prev.map(i =>
        i.id === item.id ? { ...i, isActive: !item.isActive } : i
      ))
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update item')
    }
  }

  function handleDeleteChattingItem(item) {
    setConfirmingChattingDeleteId(item.id)
  }

  async function confirmDeleteChattingItem(itemId) {
    try {
      await api.chattingList.remove(itemId)
      setChattingList(prev => prev.filter(i => i.id !== itemId))
      setConfirmingChattingDeleteId(null)
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to remove item')
      setConfirmingChattingDeleteId(null)
    }
  }

  function cancelDeleteChattingItem() {
    setConfirmingChattingDeleteId(null)
  }

  function handleBulkDelete(type, params) {
    setConfirmingBulkDelete({ type, ...params })
  }

  async function confirmBulkDelete() {
    if (!confirmingBulkDelete) return

    try {
      const { type, categoryId, locationCode } = confirmingBulkDelete
      if (type === 'category') {
        await api.chattingList.bulkRemove({ categoryId })
      } else if (type === 'location') {
        await api.chattingList.bulkRemove({ locationCode })
      } else if (type === 'categoryLocation') {
        await api.chattingList.bulkRemove({ categoryId, locationCode })
      }
      await fetchChattingList()
      setConfirmingBulkDelete(null)
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to remove items')
      setConfirmingBulkDelete(null)
    }
  }

  function cancelBulkDelete() {
    setConfirmingBulkDelete(null)
  }

  // Chatting list search with debounce
  useEffect(() => {
    if (chattingSearchTimeoutRef.current) {
      clearTimeout(chattingSearchTimeoutRef.current)
    }

    if (!showChattingSearch || chattingSearchQuery.trim().length < MIN_SEARCH_LENGTH) {
      setChattingSearchResults([])
      setSearchingChatting(false)
      return
    }

    setSearchingChatting(true)

    chattingSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await api.positions.searchSimilar(chattingSearchQuery.trim(), {
          limit: 10,
        })

        // Filter out positions already in chatting list
        const chattingListPositionIds = new Set(chattingList.map(item => item.positionId))
        const filtered = (results || []).filter(
          result => !chattingListPositionIds.has(result.position.id)
        )

        setChattingSearchResults(filtered.slice(0, 5))
      } catch (err) {
        console.error('Error searching positions for chatting list:', err)
        setChattingSearchResults([])
      } finally {
        setSearchingChatting(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (chattingSearchTimeoutRef.current) {
        clearTimeout(chattingSearchTimeoutRef.current)
      }
    }
  }, [chattingSearchQuery, showChattingSearch, chattingList])

  async function handleAddToChattingList(positionId) {
    try {
      await api.chattingList.addPosition(positionId)
      await fetchChattingList()
      // Remove from search results
      setChattingSearchResults(prev => prev.filter(r => r.position.id !== positionId))
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to add to chatting list')
    }
  }

  // Group chatting list by category, then by location
  function groupChattingList(items) {
    const grouped = {}
    items.forEach(item => {
      const catName = item.position?.category?.label || 'Uncategorized'
      const catId = item.position?.categoryId
      const locCode = item.position?.location?.code || 'unknown'
      const locName = item.position?.location?.name || 'Unknown Location'

      if (!grouped[catName]) {
        grouped[catName] = { categoryId: catId, locations: {} }
      }
      if (!grouped[catName].locations[locName]) {
        grouped[catName].locations[locName] = { locationCode: locCode, items: [] }
      }
      grouped[catName].locations[locName].items.push(item)
    })
    return grouped
  }

  function toggleChattingCategoryExpanded(categoryName) {
    setExpandedChattingCategories(prev => ({
      ...prev,
      [categoryName]: prev[categoryName] === false ? true : false
    }))
  }

  function toggleChattingLocationExpanded(categoryName, locationName) {
    const key = `${categoryName}|${locationName}`
    setExpandedChattingLocations(prev => ({
      ...prev,
      [key]: prev[key] === false ? true : false
    }))
  }

  // Group positions by location, then by category
  function groupPositions(positions) {
    const grouped = {}
    positions.forEach(position => {
      const locName = position.locationName || 'Unknown Location'
      const catName = position.categoryName || 'Uncategorized'

      if (!grouped[locName]) {
        grouped[locName] = {}
      }
      if (!grouped[locName][catName]) {
        grouped[locName][catName] = []
      }
      grouped[locName][catName].push(position)
    })
    return grouped
  }

  function toggleLocationExpanded(locationName) {
    setExpandedLocations(prev => ({
      ...prev,
      [locationName]: prev[locationName] === false ? true : false
    }))
  }

  function toggleCategoryExpanded(locationName, categoryName) {
    const key = `${locationName}|${categoryName}`
    setExpandedCategories(prev => ({
      ...prev,
      [key]: prev[key] === false ? true : false
    }))
  }

  const groupedPositions = groupPositions(myPositions)
  const showCollapsible = myPositions.length >= 25

  const groupedChattingList = groupChattingList(chattingList)
  const showChattingCollapsible = chattingList.length >= 25

  const remainingChars = MAX_STATEMENT_LENGTH - statement.length
  const isOverLimit = remainingChars < 0

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.sectionHeaderAreaCompact}>
            <ThemedText title={true} style={styles.headingCompact}>
              Add a Position
            </ThemedText>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroupCompact}>
              <ThemedTextInput
                style={styles.statementInput}
                placeholder="What's your position?"
                placeholderTextColor={Colors.pass}
                value={statement}
                onChangeText={setStatement}
                multiline={true}
                maxLength={MAX_STATEMENT_LENGTH + 20}
              />
              <Text style={[
                styles.charCount,
                isOverLimit && styles.charCountOver
              ]}>
                {remainingChars} characters remaining
              </Text>

              {/* Similar Positions Suggestions */}
              {(searchingSimilar || similarPositions.length > 0) && (
                <Animated.View style={[styles.similarContainer, { opacity: similarFadeAnim }]}>
                  <View style={styles.similarHeader}>
                    <Ionicons name="bulb-outline" size={16} color={Colors.primary} />
                    <Text style={styles.similarTitle}>
                      {searchingSimilar ? 'Searching for similar positions...' : 'Similar positions you could adopt:'}
                    </Text>
                    {searchingSimilar && (
                      <ActivityIndicator size="small" color={Colors.primary} style={{ marginLeft: 8 }} />
                    )}
                  </View>

                  {!searchingSimilar && similarPositions.map((result) => (
                    <View key={result.position.id} style={styles.similarItem}>
                      <View style={styles.similarContent}>
                        {result.wasPreviouslyHeld && (
                          <View style={styles.previouslyHeldBadge}>
                            <Ionicons name="time-outline" size={12} color={Colors.primary} />
                            <Text style={styles.previouslyHeldText}>Previously held</Text>
                          </View>
                        )}
                        <Text style={styles.similarStatement} numberOfLines={2}>
                          "{result.position.statement}"
                        </Text>
                        <Text style={styles.similarMeta}>
                          {Math.round(result.similarity * 100)}% match
                          {result.position.category?.label && ` · ${result.position.category.label}`}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.adoptButton}
                        onPress={() => handleAdoptPosition(result.position.id)}
                      >
                        <Ionicons name="add-circle" size={28} color={Colors.agree} />
                      </TouchableOpacity>
                    </View>
                  ))}

                  {!searchingSimilar && similarPositions.length === 0 && statement.trim().length >= MIN_SEARCH_LENGTH && (
                    <Text style={styles.noSimilarText}>
                      No similar positions found. Create your own!
                    </Text>
                  )}
                </Animated.View>
              )}
            </View>

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

            {error && (
              <View style={styles.errorContainerCompact}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <ThemedButton
              onPress={handleSubmit}
              disabled={loading || isOverLimit || !statement.trim() || !selectedCategory || !selectedLocation}
              style={{ paddingVertical: 12 }}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
                {loading ? "Creating..." : "Create Position"}
              </Text>
            </ThemedButton>
          </View>

          {/* My Positions Section */}
          {myPositions.length > 0 && (
            <View style={styles.myPositionsSection}>
              <View style={styles.sectionHeader}>
                <ThemedText title={true} style={styles.sectionHeading}>
                  My Positions
                </ThemedText>
                <Text style={styles.sectionSubtitle}>
                  Positions you hold that others can chat with you about
                </Text>
              </View>

              {/* Simple flat list for fewer than 25 positions */}
              {!showCollapsible && (
                <View style={styles.flatPositionsList}>
                  {myPositions.map(position => (
                    <View
                      key={position.id}
                      style={[
                        styles.positionItem,
                        styles.positionItemFlat,
                        position.status === 'inactive' && styles.positionItemInactive,
                      ]}
                    >
                      {/* Normal position UI - always rendered to maintain height */}
                      <View style={[styles.positionContent, confirmingDeleteId === position.id && styles.hiddenContent]}>
                        <Text
                          style={[
                            styles.positionStatement,
                            position.status === 'inactive' && styles.positionStatementInactive
                          ]}
                          numberOfLines={2}
                        >
                          {position.statement}
                        </Text>
                        <Text style={styles.positionMeta}>
                          {position.locationName} · {position.categoryName}
                        </Text>
                      </View>
                      <View style={[styles.positionActions, confirmingDeleteId === position.id && styles.hiddenContent]}>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => handleToggleStatus(position)}
                        >
                          <Ionicons
                            name={position.status === 'active' ? 'chatbubble' : 'chatbubble-outline'}
                            size={22}
                            color={position.status === 'active' ? Colors.primary : Colors.pass}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => handleDeletePosition(position)}
                        >
                          <Ionicons name="trash-outline" size={22} color={Colors.warning} />
                        </TouchableOpacity>
                      </View>

                      {/* Delete confirmation overlay */}
                      {confirmingDeleteId === position.id && (
                        <View style={styles.deleteConfirmOverlay}>
                          <Text style={styles.deleteConfirmText}>Are you sure?</Text>
                          <View style={styles.deleteConfirmButtons}>
                            <TouchableOpacity
                              style={styles.deleteConfirmButton}
                              onPress={() => confirmDeletePosition(position.id)}
                            >
                              <Ionicons name="trash" size={18} color="#fff" />
                              <Text style={styles.deleteConfirmButtonText}>Delete</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.cancelDeleteButton}
                              onPress={cancelDeletePosition}
                            >
                              <Text style={styles.cancelDeleteButtonText}>Cancel</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Collapsible grouped view for 25+ positions */}
              {showCollapsible && Object.entries(groupedPositions).map(([locationName, categories]) => (
                <View key={locationName} style={styles.locationGroup}>
                  <TouchableOpacity
                    style={styles.locationHeader}
                    onPress={() => toggleLocationExpanded(locationName)}
                  >
                    <Ionicons
                      name={expandedLocations[locationName] !== false ? 'chevron-down' : 'chevron-forward'}
                      size={18}
                      color={Colors.primary}
                    />
                    <Text style={styles.locationTitle}>{locationName}</Text>
                    <Text style={styles.locationCount}>
                      {Object.values(categories).flat().length}
                    </Text>
                  </TouchableOpacity>

                  {expandedLocations[locationName] !== false && (
                    <View style={styles.categoriesContainer}>
                      {Object.entries(categories).map(([categoryName, positions]) => {
                        const categoryKey = `${locationName}|${categoryName}`
                        const isCategoryExpanded = expandedCategories[categoryKey] !== false

                        return (
                          <View key={categoryKey} style={styles.categoryGroup}>
                            <TouchableOpacity
                              style={styles.categoryHeader}
                              onPress={() => toggleCategoryExpanded(locationName, categoryName)}
                            >
                              <Ionicons
                                name={isCategoryExpanded ? 'chevron-down' : 'chevron-forward'}
                                size={16}
                                color={Colors.pass}
                              />
                              <Text style={styles.categoryTitle}>{categoryName}</Text>
                              <Text style={styles.categoryCount}>{positions.length}</Text>
                            </TouchableOpacity>

                            {isCategoryExpanded && (
                              <View style={styles.positionsList}>
                                {positions.map(position => (
                                  <View
                                    key={position.id}
                                    style={[
                                      styles.positionItem,
                                      position.status === 'inactive' && styles.positionItemInactive,
                                    ]}
                                  >
                                    {/* Normal position UI - always rendered to maintain height */}
                                    <Text
                                      style={[
                                        styles.positionStatement,
                                        position.status === 'inactive' && styles.positionStatementInactive,
                                        confirmingDeleteId === position.id && styles.hiddenContent,
                                      ]}
                                      numberOfLines={2}
                                    >
                                      {position.statement}
                                    </Text>
                                    <View style={[styles.positionActions, confirmingDeleteId === position.id && styles.hiddenContent]}>
                                      <TouchableOpacity
                                        style={styles.actionButton}
                                        onPress={() => handleToggleStatus(position)}
                                      >
                                        <Ionicons
                                          name={position.status === 'active' ? 'chatbubble' : 'chatbubble-outline'}
                                          size={22}
                                          color={position.status === 'active' ? Colors.primary : Colors.pass}
                                        />
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        style={styles.actionButton}
                                        onPress={() => handleDeletePosition(position)}
                                      >
                                        <Ionicons name="trash-outline" size={22} color={Colors.warning} />
                                      </TouchableOpacity>
                                    </View>

                                    {/* Delete confirmation overlay */}
                                    {confirmingDeleteId === position.id && (
                                      <View style={styles.deleteConfirmOverlay}>
                                        <Text style={styles.deleteConfirmText}>Are you sure?</Text>
                                        <View style={styles.deleteConfirmButtons}>
                                          <TouchableOpacity
                                            style={styles.deleteConfirmButton}
                                            onPress={() => confirmDeletePosition(position.id)}
                                          >
                                            <Ionicons name="trash" size={18} color="#fff" />
                                            <Text style={styles.deleteConfirmButtonText}>Delete</Text>
                                          </TouchableOpacity>
                                          <TouchableOpacity
                                            style={styles.cancelDeleteButton}
                                            onPress={cancelDeletePosition}
                                          >
                                            <Text style={styles.cancelDeleteButtonText}>Cancel</Text>
                                          </TouchableOpacity>
                                        </View>
                                      </View>
                                    )}
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        )
                      })}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Chatting List Section */}
          <View style={styles.chattingListSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeadingRow}>
                <ThemedText title={true} style={styles.sectionHeading}>
                  Chatting List
                </ThemedText>
                <TouchableOpacity onPress={() => setShowChattingExplanation(true)} hitSlop={8}>
                  <Ionicons name="help-circle-outline" size={20} color={Colors.pass} />
                </TouchableOpacity>
              </View>
              <Text style={styles.sectionSubtitle}>
                Positions you've chatted about or saved to discuss later
              </Text>
            </View>

            <InfoModal
              visible={showChattingExplanation}
              onClose={() => setShowChattingExplanation(false)}
              icon="chatbubbles"
              iconColor={Colors.chat}
              title="What is the Chatting List?"
              paragraphs={[
                "This list contains other people's positions that you've previously chatted about, as well as positions you've saved by tapping the chat button on a card.",
                'These will periodically reappear in your card queue. Toggle items on/off to control which ones are active, or remove them entirely.',
              ]}
            />

            {/* Add Position Button */}
            <TouchableOpacity
              style={styles.addToListButton}
              onPress={() => setShowChattingSearch(!showChattingSearch)}
            >
              <Ionicons
                name={showChattingSearch ? 'close-circle' : 'add-circle'}
                size={22}
                color={Colors.primary}
              />
              <Text style={styles.addToListButtonText}>
                {showChattingSearch ? 'Close Search' : 'Add Position to List'}
              </Text>
            </TouchableOpacity>

            {/* Search Interface */}
            {showChattingSearch && (
              <View style={styles.chattingSearchContainer}>
                <ThemedTextInput
                  style={styles.chattingSearchInput}
                  placeholder="Search for positions to add..."
                  placeholderTextColor={Colors.pass}
                  value={chattingSearchQuery}
                  onChangeText={setChattingSearchQuery}
                />

                {searchingChatting && (
                  <View style={styles.chattingSearchLoading}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={styles.chattingSearchLoadingText}>Searching...</Text>
                  </View>
                )}

                {!searchingChatting && chattingSearchResults.length > 0 && (
                  <View style={styles.chattingSearchResults}>
                    {chattingSearchResults.map(result => (
                      <View key={result.position.id} style={styles.chattingSearchResult}>
                        <View style={styles.chattingSearchResultContent}>
                          <Text style={styles.chattingSearchResultStatement} numberOfLines={2}>
                            "{result.position.statement}"
                          </Text>
                          <Text style={styles.chattingSearchResultMeta}>
                            {Math.round(result.similarity * 100)}% match
                            {result.position.category?.label && ` · ${result.position.category.label}`}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.addToListItemButton}
                          onPress={() => handleAddToChattingList(result.position.id)}
                        >
                          <Ionicons name="add-circle" size={28} color={Colors.agree} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {!searchingChatting && chattingSearchQuery.trim().length >= MIN_SEARCH_LENGTH && chattingSearchResults.length === 0 && (
                  <Text style={styles.noSearchResultsText}>
                    No matching positions found, or all matches are already in your list.
                  </Text>
                )}

                {chattingSearchQuery.trim().length > 0 && chattingSearchQuery.trim().length < MIN_SEARCH_LENGTH && (
                  <Text style={styles.searchHintText}>
                    Type at least {MIN_SEARCH_LENGTH} characters to search
                  </Text>
                )}
              </View>
            )}

            {/* Empty State */}
            {chattingList.length === 0 && !chattingListLoading && (
              <View style={styles.emptyChattingList}>
                <Ionicons name="chatbubbles-outline" size={48} color={Colors.pass} />
                <Text style={styles.emptyChattingListText}>
                  Your chatting list is empty
                </Text>
                <Text style={styles.emptyChattingListSubtext}>
                  Swipe up on position cards to add them here. You'll be able to request chats with the people who hold these positions.
                </Text>
              </View>
            )}

            {/* Loading State */}
            {chattingListLoading && chattingList.length === 0 && (
              <View style={styles.chattingListLoading}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            )}

            {/* Flat list for fewer than 25 items */}
            {chattingList.length > 0 && !showChattingCollapsible && (
              <View style={styles.flatChattingList}>
                {chattingList.map(item => (
                  <View
                    key={item.id}
                    style={[
                      styles.chattingListItem,
                      styles.chattingListItemFlat,
                      !item.isActive && styles.chattingListItemInactive,
                    ]}
                  >
                    <View style={[styles.chattingListItemContent, confirmingChattingDeleteId === item.id && styles.hiddenContent]}>
                      <Text
                        style={[
                          styles.chattingListItemStatement,
                          !item.isActive && styles.chattingListItemStatementInactive
                        ]}
                        numberOfLines={2}
                      >
                        {item.position?.statement}
                      </Text>
                      <Text style={styles.chattingListItemMeta}>
                        {item.position?.location?.name || 'Unknown'} · {item.position?.category?.label || 'Uncategorized'}
                        {item.pendingRequestCount > 0 && ` · ${item.pendingRequestCount} pending`}
                      </Text>
                    </View>
                    <View style={[styles.chattingListItemActions, confirmingChattingDeleteId === item.id && styles.hiddenContent]}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleToggleChattingActive(item)}
                      >
                        <Ionicons
                          name={item.isActive ? 'chatbubble' : 'chatbubble-outline'}
                          size={22}
                          color={item.isActive ? Colors.primary : Colors.pass}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleDeleteChattingItem(item)}
                      >
                        <Ionicons name="trash-outline" size={22} color={Colors.warning} />
                      </TouchableOpacity>
                    </View>

                    {/* Delete confirmation overlay */}
                    {confirmingChattingDeleteId === item.id && (
                      <View style={styles.deleteConfirmOverlay}>
                        <Text style={styles.deleteConfirmText}>Remove from list?</Text>
                        <View style={styles.deleteConfirmButtons}>
                          <TouchableOpacity
                            style={styles.deleteConfirmButton}
                            onPress={() => confirmDeleteChattingItem(item.id)}
                          >
                            <Ionicons name="trash" size={18} color="#fff" />
                            <Text style={styles.deleteConfirmButtonText}>Remove</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.cancelDeleteButton}
                            onPress={cancelDeleteChattingItem}
                          >
                            <Text style={styles.cancelDeleteButtonText}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Hierarchical view for 25+ items */}
            {chattingList.length > 0 && showChattingCollapsible && Object.entries(groupedChattingList).map(([categoryName, categoryData]) => {
              const isCategoryExpanded = expandedChattingCategories[categoryName] !== false
              const categoryItemCount = Object.values(categoryData.locations).reduce((sum, loc) => sum + loc.items.length, 0)

              return (
                <View key={categoryName} style={styles.chattingCategoryGroup}>
                  <View style={styles.chattingCategoryHeaderRow}>
                    <TouchableOpacity
                      style={styles.chattingCategoryHeader}
                      onPress={() => toggleChattingCategoryExpanded(categoryName)}
                    >
                      <Ionicons
                        name={isCategoryExpanded ? 'chevron-down' : 'chevron-forward'}
                        size={18}
                        color={Colors.primary}
                      />
                      <Text style={styles.chattingCategoryTitle}>{categoryName}</Text>
                      <Text style={styles.chattingCategoryCount}>{categoryItemCount}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.bulkRemoveButton}
                      onPress={() => handleBulkDelete('category', {
                        categoryId: categoryData.categoryId,
                        categoryName,
                        count: categoryItemCount
                      })}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.warning} />
                    </TouchableOpacity>
                  </View>

                  {isCategoryExpanded && (
                    <View style={styles.chattingLocationsContainer}>
                      {Object.entries(categoryData.locations).map(([locationName, locationData]) => {
                        const locationKey = `${categoryName}|${locationName}`
                        const isLocationExpanded = expandedChattingLocations[locationKey] !== false

                        return (
                          <View key={locationKey} style={styles.chattingLocationGroup}>
                            <View style={styles.chattingLocationHeaderRow}>
                              <TouchableOpacity
                                style={styles.chattingLocationHeader}
                                onPress={() => toggleChattingLocationExpanded(categoryName, locationName)}
                              >
                                <Ionicons
                                  name={isLocationExpanded ? 'chevron-down' : 'chevron-forward'}
                                  size={16}
                                  color={Colors.pass}
                                />
                                <Text style={styles.chattingLocationTitle}>{locationName}</Text>
                                <Text style={styles.chattingLocationCount}>{locationData.items.length}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.bulkRemoveButtonSmall}
                                onPress={() => handleBulkDelete('categoryLocation', {
                                  categoryId: categoryData.categoryId,
                                  categoryName,
                                  locationCode: locationData.locationCode,
                                  locationName,
                                  count: locationData.items.length
                                })}
                              >
                                <Ionicons name="trash-outline" size={14} color={Colors.warning} />
                              </TouchableOpacity>
                            </View>

                            {isLocationExpanded && (
                              <View style={styles.chattingItemsList}>
                                {locationData.items.map(item => (
                                  <View
                                    key={item.id}
                                    style={[
                                      styles.chattingListItem,
                                      !item.isActive && styles.chattingListItemInactive,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.chattingListItemStatement,
                                        !item.isActive && styles.chattingListItemStatementInactive,
                                        confirmingChattingDeleteId === item.id && styles.hiddenContent,
                                      ]}
                                      numberOfLines={2}
                                    >
                                      {item.position?.statement}
                                    </Text>
                                    <View style={[styles.chattingListItemActions, confirmingChattingDeleteId === item.id && styles.hiddenContent]}>
                                      <TouchableOpacity
                                        style={styles.actionButton}
                                        onPress={() => handleToggleChattingActive(item)}
                                      >
                                        <Ionicons
                                          name={item.isActive ? 'chatbubble' : 'chatbubble-outline'}
                                          size={22}
                                          color={item.isActive ? Colors.primary : Colors.pass}
                                        />
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        style={styles.actionButton}
                                        onPress={() => handleDeleteChattingItem(item)}
                                      >
                                        <Ionicons name="trash-outline" size={22} color={Colors.warning} />
                                      </TouchableOpacity>
                                    </View>

                                    {/* Delete confirmation overlay */}
                                    {confirmingChattingDeleteId === item.id && (
                                      <View style={styles.deleteConfirmOverlay}>
                                        <Text style={styles.deleteConfirmText}>Remove?</Text>
                                        <View style={styles.deleteConfirmButtons}>
                                          <TouchableOpacity
                                            style={styles.deleteConfirmButton}
                                            onPress={() => confirmDeleteChattingItem(item.id)}
                                          >
                                            <Ionicons name="trash" size={18} color="#fff" />
                                            <Text style={styles.deleteConfirmButtonText}>Remove</Text>
                                          </TouchableOpacity>
                                          <TouchableOpacity
                                            style={styles.cancelDeleteButton}
                                            onPress={cancelDeleteChattingItem}
                                          >
                                            <Text style={styles.cancelDeleteButtonText}>Cancel</Text>
                                          </TouchableOpacity>
                                        </View>
                                      </View>
                                    )}
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        )
                      })}
                    </View>
                  )}
                </View>
              )
            })}

            {/* Bulk Delete Confirmation Modal */}
            {confirmingBulkDelete && (
              <View style={styles.bulkDeleteOverlay}>
                <View style={styles.bulkDeleteModal}>
                  <Text style={styles.bulkDeleteTitle}>
                    Remove {confirmingBulkDelete.count} positions?
                  </Text>
                  <Text style={styles.bulkDeleteMessage}>
                    {confirmingBulkDelete.type === 'category' && (
                      `All positions in "${confirmingBulkDelete.categoryName}" will be removed from your chatting list.`
                    )}
                    {confirmingBulkDelete.type === 'location' && (
                      `All positions in "${confirmingBulkDelete.locationName}" will be removed from your chatting list.`
                    )}
                    {confirmingBulkDelete.type === 'categoryLocation' && (
                      `All positions in "${confirmingBulkDelete.categoryName}" from "${confirmingBulkDelete.locationName}" will be removed from your chatting list.`
                    )}
                  </Text>
                  <View style={styles.bulkDeleteButtons}>
                    <TouchableOpacity
                      style={styles.bulkDeleteConfirmButton}
                      onPress={confirmBulkDelete}
                    >
                      <Ionicons name="trash" size={18} color="#fff" />
                      <Text style={styles.bulkDeleteConfirmButtonText}>Remove All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.bulkDeleteCancelButton}
                      onPress={cancelBulkDelete}
                    >
                      <Text style={styles.bulkDeleteCancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  sectionHeaderArea: {
    marginBottom: 24,
  },
  sectionHeaderAreaCompact: {
    marginBottom: 12,
  },
  heading: {
    fontWeight: "bold",
    fontSize: 24,
    color: Colors.primary,
  },
  headingCompact: {
    fontWeight: "bold",
    fontSize: 18,
    color: Colors.primary,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.pass,
    marginTop: 4,
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputGroupCompact: {
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  statementInput: {
    padding: 12,
    borderRadius: 10,
    minHeight: 70,
    textAlignVertical: 'top',
    fontSize: 15,
    lineHeight: 22,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    color: '#1a1a1a',
  },
  charCount: {
    fontSize: 11,
    color: Colors.pass,
    textAlign: 'right',
    marginTop: 4,
  },
  charCountOver: {
    color: Colors.warning,
  },
  errorContainer: {
    backgroundColor: '#ffe6e6',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  errorText: {
    color: Colors.warning,
    fontSize: 14,
  },
  errorContainerCompact: {
    backgroundColor: '#ffe6e6',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.warning,
    marginBottom: 12,
  },
  // My Positions Section
  myPositionsSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionHeading: {
    fontWeight: "bold",
    fontSize: 20,
    color: Colors.primary,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: Colors.pass,
    marginTop: 2,
  },
  locationGroup: {
    marginBottom: 12,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: Colors.cardBackground,
  },
  locationTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
    marginLeft: 8,
  },
  locationCount: {
    fontSize: 14,
    color: Colors.pass,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  categoriesContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  categoryGroup: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 24,
    backgroundColor: Colors.light.background,
  },
  categoryTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
    marginLeft: 6,
  },
  categoryCount: {
    fontSize: 13,
    color: Colors.pass,
  },
  positionsList: {
    backgroundColor: Colors.cardBackground,
  },
  flatPositionsList: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  positionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 40,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  positionItemFlat: {
    paddingLeft: 12,
    borderTopWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  positionContent: {
    flex: 1,
  },
  positionMeta: {
    fontSize: 12,
    color: Colors.pass,
    marginTop: 4,
  },
  positionItemInactive: {
    backgroundColor: '#f9f9f9',
  },
  positionStatement: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
    lineHeight: 20,
  },
  positionStatementInactive: {
    color: Colors.pass,
  },
  positionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    gap: 8,
  },
  actionButton: {
    padding: 6,
  },
  // Delete confirmation styles
  hiddenContent: {
    opacity: 0,
  },
  deleteConfirmOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFEBEE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  deleteConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warning,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  deleteConfirmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteConfirmText: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  deleteConfirmButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelDeleteButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cancelDeleteButtonText: {
    fontSize: 14,
    color: Colors.pass,
    fontWeight: '500',
  },
  // Similar Positions Suggestions
  similarContainer: {
    marginTop: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  similarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  similarTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
    marginLeft: 6,
    flex: 1,
  },
  similarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
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
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '500',
  },
  similarStatement: {
    fontSize: 13,
    color: '#1a1a1a',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  similarMeta: {
    fontSize: 11,
    color: Colors.pass,
    marginTop: 2,
  },
  adoptButton: {
    padding: 4,
    marginLeft: 8,
  },
  noSimilarText: {
    fontSize: 13,
    color: Colors.pass,
    textAlign: 'center',
    paddingVertical: 8,
  },
  // Chatting List Section
  chattingListSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addToListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  addToListButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
  },
  chattingSearchContainer: {
    marginBottom: 16,
  },
  chattingSearchInput: {
    padding: 14,
    borderRadius: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    color: '#1a1a1a',
  },
  chattingSearchLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  chattingSearchLoadingText: {
    fontSize: 14,
    color: Colors.pass,
  },
  chattingSearchResults: {
    marginTop: 12,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  chattingSearchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  chattingSearchResultContent: {
    flex: 1,
  },
  chattingSearchResultStatement: {
    fontSize: 14,
    color: '#1a1a1a',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  chattingSearchResultMeta: {
    fontSize: 12,
    color: Colors.pass,
    marginTop: 4,
  },
  addToListItemButton: {
    padding: 4,
    marginLeft: 8,
  },
  noSearchResultsText: {
    fontSize: 13,
    color: Colors.pass,
    textAlign: 'center',
    paddingVertical: 16,
  },
  searchHintText: {
    fontSize: 13,
    color: Colors.pass,
    textAlign: 'center',
    paddingVertical: 12,
  },
  emptyChattingList: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  emptyChattingListText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 12,
  },
  emptyChattingListSubtext: {
    fontSize: 14,
    color: Colors.pass,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  chattingListLoading: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  flatChattingList: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  chattingListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 40,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  chattingListItemFlat: {
    paddingLeft: 12,
    borderTopWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  chattingListItemInactive: {
    backgroundColor: '#f9f9f9',
  },
  chattingListItemContent: {
    flex: 1,
  },
  chattingListItemStatement: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
    lineHeight: 20,
  },
  chattingListItemStatementInactive: {
    color: Colors.pass,
  },
  chattingListItemMeta: {
    fontSize: 12,
    color: Colors.pass,
    marginTop: 4,
  },
  chattingListItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    gap: 8,
  },
  chattingCategoryGroup: {
    marginBottom: 12,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  chattingCategoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chattingCategoryHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: Colors.cardBackground,
  },
  chattingCategoryTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
    marginLeft: 8,
  },
  chattingCategoryCount: {
    fontSize: 14,
    color: Colors.pass,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  bulkRemoveButton: {
    padding: 14,
    paddingLeft: 8,
  },
  bulkRemoveButtonSmall: {
    padding: 12,
    paddingLeft: 8,
  },
  chattingLocationsContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  chattingLocationGroup: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  chattingLocationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chattingLocationHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 24,
    backgroundColor: Colors.light.background,
  },
  chattingLocationTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
    marginLeft: 6,
  },
  chattingLocationCount: {
    fontSize: 13,
    color: Colors.pass,
  },
  chattingItemsList: {
    backgroundColor: Colors.cardBackground,
  },
  bulkDeleteOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  bulkDeleteModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    margin: 20,
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  bulkDeleteTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'center',
  },
  bulkDeleteMessage: {
    fontSize: 14,
    color: Colors.pass,
    lineHeight: 20,
    marginBottom: 20,
    textAlign: 'center',
  },
  bulkDeleteButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  bulkDeleteConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warning,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
  },
  bulkDeleteConfirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  bulkDeleteCancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  bulkDeleteCancelButtonText: {
    fontSize: 15,
    color: Colors.pass,
    fontWeight: '500',
  },
})
