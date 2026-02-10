import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Pressable, Switch } from 'react-native'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../../constants/Colors'
import { SharedStyles } from '../../../constants/SharedStyles'
import api from '../../../lib/api'
import { useUser } from '../../../hooks/useUser'
import { CacheManager, CacheKeys, CacheDurations } from '../../../lib/cache'

import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import LoadingView from '../../../components/LoadingView'

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

export default function NotificationSettings() {
  const { user } = useUser()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Notification settings state
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [notificationFrequency, setNotificationFrequency] = useState('normal')
  const [quietHoursStart, setQuietHoursStart] = useState(22)
  const [quietHoursEnd, setQuietHoursEnd] = useState(7)

  // Quiet hours modal state
  const [quietHoursModalOpen, setQuietHoursModalOpen] = useState(false)
  const [quietHoursModalField, setQuietHoursModalField] = useState(null)

  // Refs for auto-save
  const saveTimeoutRef = useRef(null)
  const isInitialLoadRef = useRef(true)

  const notificationsEnabledRef = useRef(notificationsEnabled)
  const notificationFrequencyRef = useRef(notificationFrequency)
  const quietHoursStartRef = useRef(quietHoursStart)
  const quietHoursEndRef = useRef(quietHoursEnd)

  // Keep refs in sync with state
  notificationsEnabledRef.current = notificationsEnabled
  notificationFrequencyRef.current = notificationFrequency
  quietHoursStartRef.current = quietHoursStart
  quietHoursEndRef.current = quietHoursEnd

  const applySettingsData = useCallback((settingsData) => {
    setNotificationsEnabled(settingsData?.notificationsEnabled || false)
    setNotificationFrequency(settingsData?.notificationFrequency || 'normal')
    if (settingsData?.quietHoursStart != null) setQuietHoursStart(settingsData.quietHoursStart)
    if (settingsData?.quietHoursEnd != null) setQuietHoursEnd(settingsData.quietHoursEnd)
  }, [])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const settingsCacheKey = CacheKeys.settings(user?.id)
      const cachedSettings = await CacheManager.get(settingsCacheKey)
      const settingsFresh = cachedSettings && !CacheManager.isStale(cachedSettings, CacheDurations.SETTINGS)

      if (settingsFresh) {
        applySettingsData(cachedSettings.data)
      } else {
        const settingsData = await api.users.getSettings()
        if (settingsData) {
          applySettingsData(settingsData)
          await CacheManager.set(settingsCacheKey, settingsData)
        }
      }

      setTimeout(() => {
        isInitialLoadRef.current = false
      }, 100)
    } catch (err) {
      console.error('Failed to fetch notification settings:', err)
      setError(err.message || 'Failed to load notification settings')
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

        const settingsPayload = {
          notificationsEnabled: notificationsEnabledRef.current,
          notificationFrequency: notificationFrequencyRef.current,
          quietHoursStart: quietHoursStartRef.current,
          quietHoursEnd: quietHoursEndRef.current,
        }

        await api.users.updateSettings(settingsPayload)

        if (user?.id) {
          // Merge with cached settings to preserve other fields
          const settingsCacheKey = CacheKeys.settings(user.id)
          const cachedSettings = await CacheManager.get(settingsCacheKey)
          const merged = { ...(cachedSettings?.data || {}), ...settingsPayload }
          await CacheManager.set(settingsCacheKey, merged)
        }
      } catch (err) {
        console.error('Failed to save notification settings:', err)
        setError(err.message || 'Failed to save notification settings')
      } finally {
        setSaving(false)
      }
    }, 500)
  }, [])

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

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onBack={() => router.back()} />
        <LoadingView message="Loading notifications..." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageHeader}>
          <ThemedText title={true} style={styles.pageTitle}>
            Notifications
          </ThemedText>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color={Colors.warning} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

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
  modalItemLabel: {
    fontSize: 16,
    color: Colors.darkText,
    fontWeight: '500',
  },
  modalItemLabelSelected: {
    color: Colors.primary,
  },
})
