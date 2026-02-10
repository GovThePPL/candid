import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Pressable } from 'react-native'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { SemanticColors } from '../../../constants/Colors'
import { createSharedStyles } from '../../../constants/SharedStyles'
import api from '../../../lib/api'
import { useUser } from '../../../hooks/useUser'
import { CacheManager, CacheKeys, CacheDurations } from '../../../lib/cache'

import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import LoadingView from '../../../components/LoadingView'

const WEIGHT_OPTIONS = [
  { value: 'most', label: 'Most', description: 'See much more often' },
  { value: 'more', label: 'More', description: 'See more often' },
  { value: 'default', label: 'Default', description: 'Normal frequency' },
  { value: 'less', label: 'Less', description: 'See less often' },
  { value: 'least', label: 'Least', description: 'See rarely' },
  { value: 'none', label: 'None', description: 'Never show' },
]

const LIKELIHOOD_OPTIONS = [
  { value: 'off', label: 'Off', description: 'Disabled' },
  { value: 'rarely', label: 'Rarely', description: 'Much less frequent' },
  { value: 'less', label: 'Less', description: 'Somewhat less frequent' },
  { value: 'normal', label: 'Normal', description: 'Standard frequency' },
  { value: 'more', label: 'More', description: 'Somewhat more frequent' },
  { value: 'often', label: 'Often', description: 'Much more frequent' },
]

export default function PreferencesSettings() {
  const { user } = useUser()
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const shared = useMemo(() => createSharedStyles(colors), [colors])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Settings state
  const [categories, setCategories] = useState([])
  const [categoryWeights, setCategoryWeights] = useState({})
  const [chatRequestLikelihood, setChatRequestLikelihood] = useState('normal')
  const [chattingListLikelihood, setChattingListLikelihood] = useState('normal')

  // Refs for auto-save
  const saveTimeoutRef = useRef(null)
  const isInitialLoadRef = useRef(true)

  // Refs to track current values for auto-save (avoids stale closure issues)
  const categoryWeightsRef = useRef(categoryWeights)
  const chatRequestLikelihoodRef = useRef(chatRequestLikelihood)
  const chattingListLikelihoodRef = useRef(chattingListLikelihood)

  // Keep refs in sync with state
  categoryWeightsRef.current = categoryWeights
  chatRequestLikelihoodRef.current = chatRequestLikelihood
  chattingListLikelihoodRef.current = chattingListLikelihood

  // Modal state
  const [weightModalOpen, setWeightModalOpen] = useState(false)
  const [selectedCategoryForWeight, setSelectedCategoryForWeight] = useState(null)

  const applySettingsData = useCallback((settingsData) => {
    const weightsMap = {}
    if (settingsData?.categoryWeights) {
      settingsData.categoryWeights.forEach(cw => {
        weightsMap[cw.categoryId] = cw.weight
      })
    }
    setCategoryWeights(weightsMap)
    setChatRequestLikelihood(settingsData?.chatRequestLikelihood || 'normal')
    setChattingListLikelihood(settingsData?.chattingListLikelihood || 'normal')
  }, [])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const categoriesCacheKey = CacheKeys.categories()
      const settingsCacheKey = CacheKeys.settings(user?.id)

      const [cachedCategories, cachedSettings] = await Promise.all([
        CacheManager.get(categoriesCacheKey),
        CacheManager.get(settingsCacheKey),
      ])

      const categoriesFresh = cachedCategories && !CacheManager.isStale(cachedCategories, CacheDurations.CATEGORIES)
      const settingsFresh = cachedSettings && !CacheManager.isStale(cachedSettings, CacheDurations.SETTINGS)

      if (categoriesFresh) {
        setCategories(cachedCategories.data)
      }
      if (settingsFresh) {
        applySettingsData(cachedSettings.data)
      }

      if (!categoriesFresh || !settingsFresh) {
        const fetches = []
        if (!categoriesFresh) fetches.push(api.categories.getAll())
        else fetches.push(null)
        if (!settingsFresh) fetches.push(api.users.getSettings())
        else fetches.push(null)

        const [categoriesData, settingsData] = await Promise.all(fetches)

        if (categoriesData) {
          setCategories(categoriesData)
          await CacheManager.set(categoriesCacheKey, categoriesData)
        }
        if (settingsData) {
          applySettingsData(settingsData)
          await CacheManager.set(settingsCacheKey, settingsData)
        }
      }

      setTimeout(() => {
        isInitialLoadRef.current = false
      }, 100)
    } catch (err) {
      console.error('Failed to fetch preferences:', err)
      setError(err.message || 'Failed to load preferences')
    } finally {
      setLoading(false)
    }
  }, [user?.id, applySettingsData])

  useEffect(() => {
    fetchData()

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [fetchData])

  useFocusEffect(
    useCallback(() => {
      isInitialLoadRef.current = true
      fetchData()
    }, [fetchData])
  )

  // Auto-save function with debouncing
  const performAutoSave = useCallback(() => {
    if (isInitialLoadRef.current) return

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        setSaving(true)
        setError(null)

        const currentWeights = categoryWeightsRef.current
        const currentChatRequestLikelihood = chatRequestLikelihoodRef.current
        const currentChattingListLikelihood = chattingListLikelihoodRef.current

        const categoryWeightsArray = Object.entries(currentWeights)
          .filter(([_, weight]) => weight && weight !== 'default')
          .map(([categoryId, weight]) => ({ categoryId, weight }))

        const settingsPayload = {
          categoryWeights: categoryWeightsArray,
          chatRequestLikelihood: currentChatRequestLikelihood,
          chattingListLikelihood: currentChattingListLikelihood,
        }

        await api.users.updateSettings(settingsPayload)

        if (user?.id) {
          // Merge with cached settings to preserve notification fields
          const settingsCacheKey = CacheKeys.settings(user.id)
          const cachedSettings = await CacheManager.get(settingsCacheKey)
          const merged = { ...(cachedSettings?.data || {}), ...settingsPayload }
          await CacheManager.set(settingsCacheKey, merged)
        }
      } catch (err) {
        console.error('Failed to save preferences:', err)
        setError(err.message || 'Failed to save preferences')
      } finally {
        setSaving(false)
      }
    }, 500)
  }, [])

  const handleCategoryWeightChange = (categoryId, weight) => {
    setCategoryWeights(prev => {
      const newWeights = { ...prev, [categoryId]: weight }
      categoryWeightsRef.current = newWeights
      return newWeights
    })
    setWeightModalOpen(false)
    setSelectedCategoryForWeight(null)
    performAutoSave()
  }

  const handleChatRequestLikelihoodChange = (value) => {
    setChatRequestLikelihood(value)
    chatRequestLikelihoodRef.current = value
    performAutoSave()
  }

  const handleChattingListLikelihoodChange = (value) => {
    setChattingListLikelihood(value)
    chattingListLikelihoodRef.current = value
    performAutoSave()
  }

  const openWeightModal = (category) => {
    setSelectedCategoryForWeight(category)
    setWeightModalOpen(true)
  }

  const getCategoryWeight = (categoryId) => {
    return categoryWeights[categoryId] || 'default'
  }

  const getWeightLabel = (weight) => {
    const option = WEIGHT_OPTIONS.find(o => o.value === weight)
    return option ? option.label : 'Default'
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onBack={() => router.back()} />
        <LoadingView message="Loading preferences..." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageHeader}>
          <ThemedText variant="h1" title={true} style={styles.pageTitle}>
            Preferences
          </ThemedText>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color={SemanticColors.warning} />
            <ThemedText variant="bodySmall" color="error" style={styles.errorText}>{error}</ThemedText>
          </View>
        )}

        {/* Category Preferences Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="grid-outline" size={22} color={colors.primary} />
            <ThemedText variant="h2" color="dark">Category Preferences</ThemedText>
          </View>
          <ThemedText variant="bodySmall" color="secondary" style={styles.sectionDescription}>
            Adjust how often you see positions from each category in your feed.
          </ThemedText>

          <View style={styles.categoryList}>
            {categories.map((category) => {
              const weight = getCategoryWeight(category.id)
              const isNonDefault = weight !== 'default'

              return (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.categoryItem, isNonDefault && styles.categoryItemModified]}
                  onPress={() => openWeightModal(category)}
                  accessibilityRole="button"
                  accessibilityLabel={`${category.label}, weight: ${getWeightLabel(weight)}`}
                >
                  <ThemedText variant="body" color="dark" style={styles.categoryName}>{category.label}</ThemedText>
                  <View style={styles.categoryWeightButton}>
                    <ThemedText variant="bodySmall" color="secondary" style={[
                      styles.categoryWeightText,
                      isNonDefault && styles.categoryWeightTextModified
                    ]}>
                      {getWeightLabel(weight)}
                    </ThemedText>
                    <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Chat Request Frequency Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="chatbubbles-outline" size={22} color={colors.primary} />
            <ThemedText variant="h2" color="dark">Chat Request Frequency</ThemedText>
          </View>
          <ThemedText variant="bodySmall" color="secondary" style={styles.sectionDescription}>
            How often do you want to receive chat requests from others who want to discuss your positions?
          </ThemedText>

          <View style={styles.likelihoodSelector}>
            {LIKELIHOOD_OPTIONS.map((option) => {
              const isSelected = chatRequestLikelihood === option.value
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.likelihoodOption,
                    isSelected && styles.likelihoodOptionSelected
                  ]}
                  onPress={() => handleChatRequestLikelihoodChange(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={`${option.label}: ${option.description}`}
                >
                  <ThemedText variant="label" color="secondary" style={[
                    styles.likelihoodOptionLabel,
                    isSelected && styles.likelihoodOptionLabelSelected
                  ]}>
                    {option.label}
                  </ThemedText>
                  <ThemedText variant="caption" color="secondary" style={[
                    styles.likelihoodOptionDescription,
                    isSelected && styles.likelihoodOptionLabelSelected
                  ]}>
                    {option.description}
                  </ThemedText>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Chatting List Frequency Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="list-outline" size={22} color={colors.primary} />
            <ThemedText variant="h2" color="dark">Chatting List Frequency</ThemedText>
          </View>
          <ThemedText variant="bodySmall" color="secondary" style={styles.sectionDescription}>
            How often should items reappear in your card queue from your Chatting List? This includes positions you've previously chatted about and positions you've saved by tapping the chat button on a card.
          </ThemedText>

          <View style={styles.likelihoodSelector}>
            {LIKELIHOOD_OPTIONS.map((option) => {
              const isSelected = chattingListLikelihood === option.value
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.likelihoodOption,
                    isSelected && styles.likelihoodOptionSelected
                  ]}
                  onPress={() => handleChattingListLikelihoodChange(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={`${option.label}: ${option.description}`}
                >
                  <ThemedText variant="label" color="secondary" style={[
                    styles.likelihoodOptionLabel,
                    isSelected && styles.likelihoodOptionLabelSelected
                  ]}>
                    {option.label}
                  </ThemedText>
                  <ThemedText variant="caption" color="secondary" style={[
                    styles.likelihoodOptionDescription,
                    isSelected && styles.likelihoodOptionLabelSelected
                  ]}>
                    {option.description}
                  </ThemedText>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Saving indicator */}
        {saving && (
          <View style={styles.savingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <ThemedText variant="bodySmall" color="primary" style={styles.savingText}>Saving...</ThemedText>
          </View>
        )}
      </ScrollView>

      {/* Weight Selection Modal */}
      <Modal
        visible={weightModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setWeightModalOpen(false)}
      >
        <Pressable style={shared.modalOverlay} onPress={() => setWeightModalOpen(false)}>
          <View style={styles.modalContent}>
            <ThemedText variant="h2" color="dark" style={styles.modalTitle}>
              {selectedCategoryForWeight?.label || selectedCategoryForWeight?.name}
            </ThemedText>
            <ThemedText variant="bodySmall" color="secondary" style={styles.modalSubtitle}>How often should this category appear?</ThemedText>
            <ScrollView style={styles.modalScrollView}>
              {WEIGHT_OPTIONS.map((option, index) => {
                const isSelected = getCategoryWeight(selectedCategoryForWeight?.id) === option.value

                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.modalItem,
                      isSelected && styles.modalItemSelected,
                      index === WEIGHT_OPTIONS.length - 1 && styles.modalItemLast,
                    ]}
                    onPress={() => handleCategoryWeightChange(selectedCategoryForWeight?.id, option.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={option.label}
                  >
                    <View style={styles.modalItemContent}>
                      <ThemedText variant="button" color="dark" style={[
                        styles.modalItemLabel,
                        isSelected && styles.modalItemLabelSelected
                      ]}>
                        {option.label}
                      </ThemedText>
                      <ThemedText variant="caption" color="secondary" style={styles.modalItemDescription}>{option.description}</ThemedText>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },
  pageHeader: {
    marginBottom: 20,
  },
  pageTitle: {
    color: colors.primary,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorBannerBg,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
  },
  section: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  sectionDescription: {
    marginBottom: 16,
  },
  categoryList: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  categoryItemModified: {
    backgroundColor: colors.primaryLight + '30',
  },
  categoryName: {
    flex: 1,
  },
  categoryWeightButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.uiBackground,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  categoryWeightText: {
  },
  categoryWeightTextModified: {
    color: colors.primary,
  },
  likelihoodSelector: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 4,
    gap: 2,
  },
  likelihoodOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  likelihoodOptionSelected: {
    backgroundColor: colors.primary,
  },
  likelihoodOptionLabel: {
    fontWeight: '500',
  },
  likelihoodOptionDescription: {
    fontStyle: 'italic',
  },
  likelihoodOptionLabelSelected: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  savingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  savingText: {
  },
  // Modal styles
  modalContent: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    width: '100%',
    maxWidth: 340,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  modalTitle: {
    padding: 16,
    paddingBottom: 4,
    textAlign: 'center',
  },
  modalSubtitle: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    textAlign: 'center',
  },
  modalScrollView: {
    maxHeight: 350,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  modalItemSelected: {
    backgroundColor: colors.primaryLight,
  },
  modalItemLast: {
    borderBottomWidth: 0,
  },
  modalItemContent: {
    flex: 1,
  },
  modalItemLabel: {
    fontWeight: '500',
  },
  modalItemLabelSelected: {
    color: colors.primary,
    fontWeight: '500',
  },
  modalItemDescription: {
    marginTop: 2,
  },
})
