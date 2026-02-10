import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Pressable, Switch } from 'react-native'
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
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const shared = useMemo(() => createSharedStyles(colors), [colors])

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
          <ThemedText variant="h1" title={true} style={styles.pageTitle}>
            Notifications
          </ThemedText>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color={SemanticColors.warning} />
            <ThemedText variant="bodySmall" color="error" style={styles.errorText}>{error}</ThemedText>
          </View>
        )}

        {/* Notification Settings Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="notifications-outline" size={22} color={colors.primary} />
            <ThemedText variant="h2" color="dark">Notifications</ThemedText>
          </View>
          <ThemedText variant="bodySmall" color="secondary" style={styles.sectionDescription}>
            Get notified when someone wants to chat about a position you care about.
          </ThemedText>

          {/* Enable toggle */}
          <View style={styles.notifToggleRow}>
            <ThemedText variant="body" color="dark" style={styles.notifToggleLabel}>Enable push notifications</ThemedText>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsEnabledChange}
              trackColor={{ false: colors.cardBorder, true: colors.primaryMuted }}
              thumbColor={notificationsEnabled ? colors.primary : colors.pass}
              accessibilityLabel="Enable push notifications"
            />
          </View>

          {notificationsEnabled && (
            <>
              {/* Frequency selector */}
              <ThemedText variant="bodySmall" color="dark" style={styles.notifSubLabel}>Chat request notifications</ThemedText>
              <View style={styles.likelihoodSelector}>
                {NOTIFICATION_FREQ_OPTIONS.map((option) => {
                  const isSelected = notificationFrequency === option.value
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.likelihoodOption,
                        isSelected && styles.likelihoodOptionSelected
                      ]}
                      onPress={() => handleNotificationFrequencyChange(option.value)}
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

              {/* Quiet hours */}
              <ThemedText variant="bodySmall" color="dark" style={[styles.notifSubLabel, { marginTop: 16 }]}>Quiet hours</ThemedText>
              <ThemedText variant="bodySmall" color="secondary" style={styles.sectionDescription}>
                Don't send notifications between these hours.
              </ThemedText>
              <View style={styles.quietHoursRow}>
                <TouchableOpacity
                  style={styles.quietHoursButton}
                  onPress={() => { setQuietHoursModalField('start'); setQuietHoursModalOpen(true) }}
                  accessibilityRole="button"
                  accessibilityLabel={`Quiet hours start: ${HOUR_LABELS[quietHoursStart]}`}
                >
                  <ThemedText variant="body" color="dark" style={styles.quietHoursButtonText}>{HOUR_LABELS[quietHoursStart]}</ThemedText>
                  <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
                </TouchableOpacity>
                <ThemedText variant="bodySmall" color="secondary" style={styles.quietHoursSeparator}>to</ThemedText>
                <TouchableOpacity
                  style={styles.quietHoursButton}
                  onPress={() => { setQuietHoursModalField('end'); setQuietHoursModalOpen(true) }}
                  accessibilityRole="button"
                  accessibilityLabel={`Quiet hours end: ${HOUR_LABELS[quietHoursEnd]}`}
                >
                  <ThemedText variant="body" color="dark" style={styles.quietHoursButtonText}>{HOUR_LABELS[quietHoursEnd]}</ThemedText>
                  <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Saving indicator */}
        {saving && (
          <View style={styles.savingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <ThemedText variant="bodySmall" color="primary" style={styles.savingText}>Saving...</ThemedText>
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
        <Pressable style={shared.modalOverlay} onPress={() => setQuietHoursModalOpen(false)}>
          <View style={styles.modalContent}>
            <ThemedText variant="h2" color="dark" style={styles.modalTitle}>
              {quietHoursModalField === 'start' ? 'Quiet hours start' : 'Quiet hours end'}
            </ThemedText>
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
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={label}
                  >
                    <ThemedText variant="button" color="dark" style={[
                      styles.modalItemLabel,
                      isSelected && styles.modalItemLabelSelected
                    ]}>
                      {label}
                    </ThemedText>
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
  notifToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },
  notifToggleLabel: {
    fontWeight: '500',
  },
  notifSubLabel: {
    fontWeight: '600',
    marginBottom: 8,
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
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  quietHoursButtonText: {
    fontWeight: '500',
  },
  quietHoursSeparator: {
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
  modalItemLabel: {
    fontWeight: '500',
  },
  modalItemLabelSelected: {
    color: colors.primary,
    fontWeight: '500',
  },
})
