import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Pressable } from 'react-native'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import { SharedStyles } from '../../constants/SharedStyles'
import api from '../../lib/api'

import ThemedText from "../../components/ThemedText"
import Header from '../../components/Header'
import LoadingView from '../../components/LoadingView'

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

export default function Settings() {
  const router = useRouter()
  const { returnTo } = useLocalSearchParams()

  const handleBack = () => {
    if (returnTo) {
      router.navigate(returnTo)
    } else {
      router.back()
    }
  }

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Settings state
  const [categories, setCategories] = useState([])
  const [categoryWeights, setCategoryWeights] = useState({}) // { categoryId: weight }
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

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch categories and settings in parallel
      const [categoriesData, settingsData] = await Promise.all([
        api.categories.getAll(),
        api.users.getSettings(),
      ])

      setCategories(categoriesData || [])

      // Build category weights map from settings
      const weightsMap = {}
      if (settingsData?.categoryWeights) {
        settingsData.categoryWeights.forEach(cw => {
          weightsMap[cw.categoryId] = cw.weight
        })
      }
      setCategoryWeights(weightsMap)

      // Set likelihood values
      setChatRequestLikelihood(settingsData?.chatRequestLikelihood || 'normal')
      setChattingListLikelihood(settingsData?.chattingListLikelihood || 'normal')

      // Mark initial load complete after a brief delay
      setTimeout(() => {
        isInitialLoadRef.current = false
      }, 100)
    } catch (err) {
      console.error('Failed to fetch settings:', err)
      setError(err.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()

    // Cleanup timeout on unmount
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
    // Don't save during initial load
    if (isInitialLoadRef.current) return

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Debounce the save by 500ms
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        setSaving(true)
        setError(null)

        // Read current values from refs to avoid stale closures
        const currentWeights = categoryWeightsRef.current
        const currentChatRequestLikelihood = chatRequestLikelihoodRef.current
        const currentChattingListLikelihood = chattingListLikelihoodRef.current

        // Build category weights array for API
        const categoryWeightsArray = Object.entries(currentWeights)
          .filter(([_, weight]) => weight && weight !== 'default')
          .map(([categoryId, weight]) => ({ categoryId, weight }))

        await api.users.updateSettings({
          categoryWeights: categoryWeightsArray,
          chatRequestLikelihood: currentChatRequestLikelihood,
          chattingListLikelihood: currentChattingListLikelihood,
        })
      } catch (err) {
        console.error('Failed to save settings:', err)
        setError(err.message || 'Failed to save settings')
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

  const getLikelihoodLabel = (value) => {
    const option = LIKELIHOOD_OPTIONS.find(o => o.value === value)
    return option ? option.label : 'Normal'
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onBack={handleBack} />
        <LoadingView message="Loading settings..." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={handleBack} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageHeader}>
          <ThemedText title={true} style={styles.pageTitle}>
            Settings
          </ThemedText>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color={Colors.warning} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Category Preferences Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="grid-outline" size={22} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Category Preferences</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Adjust how often you see positions from each category in your feed.
          </Text>

          <View style={styles.categoryList}>
            {categories.map((category) => {
              const weight = getCategoryWeight(category.id)
              const isNonDefault = weight !== 'default'

              return (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.categoryItem, isNonDefault && styles.categoryItemModified]}
                  onPress={() => openWeightModal(category)}
                >
                  <Text style={styles.categoryName}>{category.label}</Text>
                  <View style={styles.categoryWeightButton}>
                    <Text style={[
                      styles.categoryWeightText,
                      isNonDefault && styles.categoryWeightTextModified
                    ]}>
                      {getWeightLabel(weight)}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={Colors.pass} />
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Chat Request Frequency Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="chatbubbles-outline" size={22} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Chat Request Frequency</Text>
          </View>
          <Text style={styles.sectionDescription}>
            How often do you want to receive chat requests from others who want to discuss your positions?
          </Text>

          <View style={styles.likelihoodSelector}>
            {LIKELIHOOD_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.likelihoodOption,
                  chatRequestLikelihood === option.value && styles.likelihoodOptionSelected
                ]}
                onPress={() => handleChatRequestLikelihoodChange(option.value)}
              >
                <Text style={[
                  styles.likelihoodOptionLabel,
                  chatRequestLikelihood === option.value && styles.likelihoodOptionLabelSelected
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.likelihoodDescription}>
            {LIKELIHOOD_OPTIONS.find(o => o.value === chatRequestLikelihood)?.description}
          </Text>
        </View>

        {/* Chatting List Frequency Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="list-outline" size={22} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Chatting List Frequency</Text>
          </View>
          <Text style={styles.sectionDescription}>
            How often should items reappear in your card queue from your Chatting List? This includes positions you've previously chatted about and positions you've saved by tapping the chat button on a card.
          </Text>

          <View style={styles.likelihoodSelector}>
            {LIKELIHOOD_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.likelihoodOption,
                  chattingListLikelihood === option.value && styles.likelihoodOptionSelected
                ]}
                onPress={() => handleChattingListLikelihoodChange(option.value)}
              >
                <Text style={[
                  styles.likelihoodOptionLabel,
                  chattingListLikelihood === option.value && styles.likelihoodOptionLabelSelected
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.likelihoodDescription}>
            {LIKELIHOOD_OPTIONS.find(o => o.value === chattingListLikelihood)?.description}
          </Text>
        </View>

        {/* Saving indicator */}
        {saving && (
          <View style={styles.savingContainer}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.savingText}>Saving...</Text>
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
        <Pressable style={SharedStyles.modalOverlay} onPress={() => setWeightModalOpen(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {selectedCategoryForWeight?.label || selectedCategoryForWeight?.name}
            </Text>
            <Text style={styles.modalSubtitle}>How often should this category appear?</Text>
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
                  >
                    <View style={styles.modalItemContent}>
                      <Text style={[
                        styles.modalItemLabel,
                        isSelected && styles.modalItemLabelSelected
                      ]}>
                        {option.label}
                      </Text>
                      <Text style={styles.modalItemDescription}>{option.description}</Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={Colors.primary} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
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
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffe6e6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: Colors.warning,
    fontSize: 14,
  },
  section: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.darkText,
  },
  sectionDescription: {
    fontSize: 14,
    color: Colors.pass,
    lineHeight: 20,
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
    backgroundColor: Colors.light.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  categoryItemModified: {
    backgroundColor: Colors.primaryLight + '30',
  },
  categoryName: {
    fontSize: 15,
    color: Colors.darkText,
    flex: 1,
  },
  categoryWeightButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.white,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  categoryWeightText: {
    fontSize: 14,
    color: Colors.pass,
  },
  categoryWeightTextModified: {
    color: Colors.primary,
    fontWeight: '500',
  },
  likelihoodSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 4,
  },
  likelihoodOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderRadius: 6,
  },
  likelihoodOptionSelected: {
    backgroundColor: Colors.primary,
  },
  likelihoodOptionLabel: {
    fontSize: 13,
    color: Colors.pass,
    fontWeight: '500',
  },
  likelihoodOptionLabelSelected: {
    color: Colors.white,
  },
  likelihoodDescription: {
    fontSize: 13,
    color: Colors.pass,
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  savingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  savingText: {
    fontSize: 14,
    color: Colors.primary,
  },
  // Modal styles
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    width: '100%',
    maxWidth: 340,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.darkText,
    padding: 16,
    paddingBottom: 4,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.pass,
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
    borderTopColor: Colors.cardBorder,
  },
  modalItemSelected: {
    backgroundColor: Colors.primaryLight,
  },
  modalItemLast: {
    borderBottomWidth: 0,
  },
  modalItemContent: {
    flex: 1,
  },
  modalItemLabel: {
    fontSize: 16,
    color: Colors.darkText,
    fontWeight: '500',
  },
  modalItemLabelSelected: {
    color: Colors.primary,
  },
  modalItemDescription: {
    fontSize: 13,
    color: Colors.pass,
    marginTop: 2,
  },
})
