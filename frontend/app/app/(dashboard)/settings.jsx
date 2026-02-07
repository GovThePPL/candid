import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Pressable, Switch } from 'react-native'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import { SharedStyles } from '../../constants/SharedStyles'
import api from '../../lib/api'
import { useUser } from '../../hooks/useUser'
import { CacheManager, CacheKeys, CacheDurations } from '../../lib/cache'

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

const NOTIFICATION_FREQ_OPTIONS = [
  { value: 'off', label: 'Off', description: 'No notifications' },
  { value: 'rarely', label: 'Rarely', description: 'Up to 2/day' },
  { value: 'less', label: 'Less', description: 'Up to 5/day' },
  { value: 'normal', label: 'Normal', description: 'Up to 10/day' },
  { value: 'more', label: 'More', description: 'Up to 20/day' },
  { value: 'often', label: 'Often', description: 'Unlimited' },
]

const HOUR_LABELS = [
  '12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM',
  '6 AM', '7 AM', '8 AM', '9 AM', '10 AM', '11 AM',
  '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM',
  '6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM',
]

export default function Settings() {
  const { user } = useUser()
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

  // Notification settings state
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [notificationFrequency, setNotificationFrequency] = useState('normal')
  const [quietHoursStart, setQuietHoursStart] = useState(22)
  const [quietHoursEnd, setQuietHoursEnd] = useState(7)

  // Quiet hours modal state
  const [quietHoursModalOpen, setQuietHoursModalOpen] = useState(false)
  const [quietHoursModalField, setQuietHoursModalField] = useState(null) // 'start' | 'end'

  // Refs for auto-save
  const saveTimeoutRef = useRef(null)
  const isInitialLoadRef = useRef(true)

  // Refs to track current values for auto-save (avoids stale closure issues)
  const categoryWeightsRef = useRef(categoryWeights)
  const chatRequestLikelihoodRef = useRef(chatRequestLikelihood)
  const chattingListLikelihoodRef = useRef(chattingListLikelihood)
  const notificationsEnabledRef = useRef(notificationsEnabled)
  const notificationFrequencyRef = useRef(notificationFrequency)
  const quietHoursStartRef = useRef(quietHoursStart)
  const quietHoursEndRef = useRef(quietHoursEnd)

  // Keep refs in sync with state
  categoryWeightsRef.current = categoryWeights
  chatRequestLikelihoodRef.current = chatRequestLikelihood
  chattingListLikelihoodRef.current = chattingListLikelihood
  notificationsEnabledRef.current = notificationsEnabled
  notificationFrequencyRef.current = notificationFrequency
  quietHoursStartRef.current = quietHoursStart
  quietHoursEndRef.current = quietHoursEnd

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
    setNotificationsEnabled(settingsData?.notificationsEnabled || false)
    setNotificationFrequency(settingsData?.notificationFrequency || 'normal')
    if (settingsData?.quietHoursStart != null) setQuietHoursStart(settingsData.quietHoursStart)
    if (settingsData?.quietHoursEnd != null) setQuietHoursEnd(settingsData.quietHoursEnd)
  }, [])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Check caches first
      const categoriesCacheKey = CacheKeys.categories()
      const settingsCacheKey = CacheKeys.settings(user?.id)

      const [cachedCategories, cachedSettings] = await Promise.all([
        CacheManager.get(categoriesCacheKey),
        CacheManager.get(settingsCacheKey),
      ])

      // Categories are cached forever (static data)
      const categoriesFresh = cachedCategories && !CacheManager.isStale(cachedCategories, CacheDurations.CATEGORIES)
      const settingsFresh = cachedSettings && !CacheManager.isStale(cachedSettings, CacheDurations.SETTINGS)

      if (categoriesFresh) {
        setCategories(cachedCategories.data)
      }
      if (settingsFresh) {
        applySettingsData(cachedSettings.data)
      }

      // Fetch any stale data
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
  }, [user?.id, applySettingsData])

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

        const settingsPayload = {
          categoryWeights: categoryWeightsArray,
          chatRequestLikelihood: currentChatRequestLikelihood,
          chattingListLikelihood: currentChattingListLikelihood,
          notificationsEnabled: notificationsEnabledRef.current,
          notificationFrequency: notificationFrequencyRef.current,
          quietHoursStart: quietHoursStartRef.current,
          quietHoursEnd: quietHoursEndRef.current,
        }

        await api.users.updateSettings(settingsPayload)

        // Optimistic cache update
        if (user?.id) {
          await CacheManager.set(CacheKeys.settings(user.id), settingsPayload)
        }
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

  const handleNotificationsEnabledChange = (value) => {
    setNotificationsEnabled(value)
    notificationsEnabledRef.current = value
    performAutoSave()
  }

  const handleNotificationFrequencyChange = (value) => {
    setNotificationFrequency(value)
    notificationFrequencyRef.current = value
    performAutoSave()
  }

  const handleQuietHoursChange = (field, hour) => {
    if (field === 'start') {
      setQuietHoursStart(hour)
      quietHoursStartRef.current = hour
    } else {
      setQuietHoursEnd(hour)
      quietHoursEndRef.current = hour
    }
    setQuietHoursModalOpen(false)
    setQuietHoursModalField(null)
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

        {/* Notification Settings Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="notifications-outline" size={22} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Notifications</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Get notified when someone wants to chat about a position you care about.
          </Text>

          {/* Enable toggle */}
          <View style={styles.notifToggleRow}>
            <Text style={styles.notifToggleLabel}>Enable push notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsEnabledChange}
              trackColor={{ false: Colors.cardBorder, true: Colors.primaryMuted }}
              thumbColor={notificationsEnabled ? Colors.primary : Colors.pass}
            />
          </View>

          {notificationsEnabled && (
            <>
              {/* Frequency selector */}
              <Text style={styles.notifSubLabel}>Chat request notifications</Text>
              <View style={styles.likelihoodSelector}>
                {NOTIFICATION_FREQ_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.likelihoodOption,
                      notificationFrequency === option.value && styles.likelihoodOptionSelected
                    ]}
                    onPress={() => handleNotificationFrequencyChange(option.value)}
                  >
                    <Text style={[
                      styles.likelihoodOptionLabel,
                      notificationFrequency === option.value && styles.likelihoodOptionLabelSelected
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.likelihoodDescription}>
                {NOTIFICATION_FREQ_OPTIONS.find(o => o.value === notificationFrequency)?.description}
              </Text>

              {/* Quiet hours */}
              <Text style={[styles.notifSubLabel, { marginTop: 16 }]}>Quiet hours</Text>
              <Text style={styles.sectionDescription}>
                Don't send notifications between these hours.
              </Text>
              <View style={styles.quietHoursRow}>
                <TouchableOpacity
                  style={styles.quietHoursButton}
                  onPress={() => { setQuietHoursModalField('start'); setQuietHoursModalOpen(true) }}
                >
                  <Text style={styles.quietHoursButtonText}>{HOUR_LABELS[quietHoursStart]}</Text>
                  <Ionicons name="chevron-down" size={16} color={Colors.pass} />
                </TouchableOpacity>
                <Text style={styles.quietHoursSeparator}>to</Text>
                <TouchableOpacity
                  style={styles.quietHoursButton}
                  onPress={() => { setQuietHoursModalField('end'); setQuietHoursModalOpen(true) }}
                >
                  <Text style={styles.quietHoursButtonText}>{HOUR_LABELS[quietHoursEnd]}</Text>
                  <Ionicons name="chevron-down" size={16} color={Colors.pass} />
                </TouchableOpacity>
              </View>
            </>
          )}
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

      {/* Quiet Hours Selection Modal */}
      <Modal
        visible={quietHoursModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setQuietHoursModalOpen(false)}
      >
        <Pressable style={SharedStyles.modalOverlay} onPress={() => setQuietHoursModalOpen(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {quietHoursModalField === 'start' ? 'Quiet hours start' : 'Quiet hours end'}
            </Text>
            <ScrollView style={styles.modalScrollView}>
              {HOUR_LABELS.map((label, hour) => {
                const currentValue = quietHoursModalField === 'start' ? quietHoursStart : quietHoursEnd
                const isSelected = currentValue === hour

                return (
                  <TouchableOpacity
                    key={hour}
                    style={[
                      styles.modalItem,
                      isSelected && styles.modalItemSelected,
                      hour === 23 && styles.modalItemLast,
                    ]}
                    onPress={() => handleQuietHoursChange(quietHoursModalField, hour)}
                  >
                    <Text style={[
                      styles.modalItemLabel,
                      isSelected && styles.modalItemLabelSelected
                    ]}>
                      {label}
                    </Text>
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
  // Notification styles
  notifToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },
  notifToggleLabel: {
    fontSize: 15,
    color: Colors.darkText,
    fontWeight: '500',
  },
  notifSubLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.darkText,
    marginBottom: 8,
  },
  quietHoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quietHoursButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  quietHoursButtonText: {
    fontSize: 15,
    color: Colors.darkText,
    fontWeight: '500',
  },
  quietHoursSeparator: {
    fontSize: 14,
    color: Colors.pass,
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
