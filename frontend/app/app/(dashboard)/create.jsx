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

const MAX_STATEMENT_LENGTH = 512
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
  const [categories, setCategories] = useState([])
  const [locations, setLocations] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false)
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

  const router = useRouter()
  const searchTimeoutRef = useRef(null)
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

  useEffect(() => {
    async function fetchData() {
      try {
        const categoriesData = await api.categories.getAll()
        setCategories(categoriesData || [])
      } catch (err) {
        console.error('Failed to fetch categories:', err)
      }

      try {
        const locationsData = await api.users.getLocations()
        setLocations(locationsData || [])
        // Default to the most specific location (last in the list)
        if (locationsData && locationsData.length > 0) {
          setSelectedLocation(locationsData[locationsData.length - 1].id)
        }
      } catch (err) {
        console.error('Failed to fetch locations:', err)
        setError('Failed to load locations: ' + err.message)
      }

      await fetchMyPositions()
      lastFetchedVersion.current = positionsVersion
    }
    fetchData()
  }, [fetchMyPositions, positionsVersion])

  // Refresh positions when screen comes into focus, but only if version changed
  useFocusEffect(
    useCallback(() => {
      if (lastFetchedVersion.current !== positionsVersion) {
        fetchMyPositions()
        lastFetchedVersion.current = positionsVersion
      }
    }, [fetchMyPositions, positionsVersion])
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
            const catName = result.position.category?.name
            if (catId && catName) {
              if (!categoryScores[catId]) {
                categoryScores[catId] = { id: catId, name: catName, score: 0, count: 0 }
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
              category: { id: topCategory.id, label: topCategory.name },
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

  const getSelectedCategoryName = () => {
    const category = categories.find(c => c.id === selectedCategory)
    return category ? category.name : 'Select a category'
  }

  const getSelectedLocationName = () => {
    const location = locations.find(l => l.id === selectedLocation)
    return location ? location.name : 'Select a location'
  }

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
          <View style={styles.sectionHeaderArea}>
            <ThemedText title={true} style={styles.heading}>
              Add a Position
            </ThemedText>
            <Text style={styles.subtitle}>
              Share your perspective on an issue
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Your Statement</Text>
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
                          {result.position.category?.name && ` · ${result.position.category.name}`}
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

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Category</Text>
                {categoryAutoSelected && (
                  <View style={styles.autoSelectedBadge}>
                    <Ionicons name="sparkles" size={12} color={Colors.primary} />
                    <Text style={styles.autoSelectedText}>Auto-suggested</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
                style={[styles.dropdown, categoryAutoSelected && styles.dropdownAutoSelected]}
                onPress={() => {
                  setCategoryDropdownOpen(!categoryDropdownOpen)
                  setLocationDropdownOpen(false)
                }}
              >
                <Text style={[styles.dropdownText, !selectedCategory && styles.dropdownPlaceholder]}>
                  {getSelectedCategoryName()}
                </Text>
                <Ionicons
                  name={categoryDropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={Colors.pass}
                />
              </TouchableOpacity>
              {categoryDropdownOpen && (
                <View style={styles.dropdownList}>
                  {categories.map((category, index) => (
                    <TouchableOpacity
                      key={category.id}
                      style={[
                        styles.dropdownItem,
                        selectedCategory === category.id && styles.dropdownItemSelected,
                        index === 0 && styles.dropdownItemFirst,
                        index === categories.length - 1 && styles.dropdownItemLast,
                      ]}
                      onPress={() => {
                        setSelectedCategory(category.id)
                        setCategoryDropdownOpen(false)
                        setCategoryAutoSelected(false)
                      }}
                    >
                      <Text style={[
                        styles.dropdownItemText,
                        selectedCategory === category.id && styles.dropdownItemTextSelected
                      ]}>
                        {category.name}
                      </Text>
                      {selectedCategory === category.id && (
                        <Ionicons name="checkmark" size={20} color={Colors.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Location</Text>
              <Text style={styles.locationHint}>
                Choose who can see this position based on location
              </Text>
              <TouchableOpacity
                style={styles.dropdown}
                onPress={() => {
                  setLocationDropdownOpen(!locationDropdownOpen)
                  setCategoryDropdownOpen(false)
                }}
              >
                <Text style={[styles.dropdownText, !selectedLocation && styles.dropdownPlaceholder]}>
                  {getSelectedLocationName()}
                </Text>
                <Ionicons
                  name={locationDropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={Colors.pass}
                />
              </TouchableOpacity>
              {locationDropdownOpen && (
                <View style={styles.dropdownList}>
                  {locations.map((location, index) => (
                    <TouchableOpacity
                      key={location.id}
                      style={[
                        styles.dropdownItem,
                        selectedLocation === location.id && styles.dropdownItemSelected,
                        index === 0 && styles.dropdownItemFirst,
                        index === locations.length - 1 && styles.dropdownItemLast,
                      ]}
                      onPress={() => {
                        setSelectedLocation(location.id)
                        setLocationDropdownOpen(false)
                      }}
                    >
                      <View style={[styles.locationIndent, { marginLeft: location.level * 16 }]}>
                        <Text style={[
                          styles.dropdownItemText,
                          selectedLocation === location.id && styles.dropdownItemTextSelected
                        ]}>
                          {location.name}
                        </Text>
                        {location.code && (
                          <Text style={styles.locationCode}>{location.code}</Text>
                        )}
                      </View>
                      {selectedLocation === location.id && (
                        <Ionicons name="checkmark" size={20} color={Colors.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Spacer height={20} />

            <ThemedButton
              onPress={handleSubmit}
              disabled={loading || isOverLimit || !statement.trim() || !selectedCategory || !selectedLocation}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
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
                  Manage your existing positions
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
  heading: {
    fontWeight: "bold",
    fontSize: 24,
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
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  autoSelectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  autoSelectedText: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '500',
  },
  dropdownAutoSelected: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  statementInput: {
    padding: 16,
    borderRadius: 12,
    minHeight: 120,
    textAlignVertical: 'top',
    fontSize: 16,
    lineHeight: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    color: '#1a1a1a',
  },
  charCount: {
    fontSize: 13,
    color: Colors.pass,
    textAlign: 'right',
    marginTop: 6,
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
  locationHint: {
    fontSize: 13,
    color: Colors.pass,
    marginBottom: 8,
  },
  dropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 12,
    padding: 14,
  },
  dropdownText: {
    fontSize: 16,
    color: '#1a1a1a',
  },
  dropdownPlaceholder: {
    color: Colors.pass,
  },
  dropdownList: {
    marginTop: 8,
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 12,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  dropdownItemFirst: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  dropdownItemSelected: {
    backgroundColor: Colors.primaryLight,
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#1a1a1a',
  },
  dropdownItemTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  locationIndent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationCode: {
    fontSize: 13,
    color: Colors.pass,
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
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    // Shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  similarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  similarTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
    marginLeft: 6,
    flex: 1,
  },
  similarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
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
    fontSize: 14,
    color: '#1a1a1a',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  similarMeta: {
    fontSize: 12,
    color: Colors.pass,
    marginTop: 4,
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
})
