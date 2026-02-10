import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Pressable } from 'react-native'
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
import LocationPicker from '../../../components/LocationPicker'

const AGE_RANGE_OPTIONS = [
  { value: null, label: 'Prefer not to say' },
  { value: '18-24', label: '18-24' },
  { value: '25-34', label: '25-34' },
  { value: '35-44', label: '35-44' },
  { value: '45-54', label: '45-54' },
  { value: '55-64', label: '55-64' },
  { value: '65+', label: '65+' },
]

const INCOME_RANGE_OPTIONS = [
  { value: null, label: 'Prefer not to say' },
  { value: 'under_25k', label: 'Under $25,000' },
  { value: '25k-50k', label: '$25,000 - $50,000' },
  { value: '50k-75k', label: '$50,000 - $75,000' },
  { value: '75k-100k', label: '$75,000 - $100,000' },
  { value: '100k-150k', label: '$100,000 - $150,000' },
  { value: '150k-200k', label: '$150,000 - $200,000' },
  { value: 'over_200k', label: 'Over $200,000' },
]

const POLITICAL_LEAN_OPTIONS = [
  { value: null, label: 'Prefer not to say' },
  { value: 'very_liberal', label: 'Very Liberal' },
  { value: 'liberal', label: 'Liberal' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'conservative', label: 'Conservative' },
  { value: 'very_conservative', label: 'Very Conservative' },
]

const EDUCATION_OPTIONS = [
  { value: null, label: 'Prefer not to say' },
  { value: 'less_than_high_school', label: 'Less than High School' },
  { value: 'high_school', label: 'High School' },
  { value: 'some_college', label: 'Some College' },
  { value: 'associates', label: 'Associate\'s Degree' },
  { value: 'bachelors', label: 'Bachelor\'s Degree' },
  { value: 'masters', label: 'Master\'s Degree' },
  { value: 'doctorate', label: 'Doctorate' },
  { value: 'professional', label: 'Professional Degree' },
]

const GEO_LOCALE_OPTIONS = [
  { value: null, label: 'Prefer not to say' },
  { value: 'urban', label: 'Urban' },
  { value: 'suburban', label: 'Suburban' },
  { value: 'rural', label: 'Rural' },
]

const RACE_OPTIONS = [
  { value: null, label: 'Prefer not to say' },
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black or African American' },
  { value: 'hispanic', label: 'Hispanic or Latino' },
  { value: 'asian', label: 'Asian' },
  { value: 'native_american', label: 'Native American' },
  { value: 'pacific_islander', label: 'Pacific Islander' },
  { value: 'multiracial', label: 'Multiracial' },
  { value: 'other', label: 'Other' },
]

const SEX_OPTIONS = [
  { value: null, label: 'Prefer not to say' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
]

export default function DemographicsSettings() {
  const { user, refreshUser } = useUser()
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const shared = useMemo(() => createSharedStyles(colors), [colors])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Demographics state
  const [ageRange, setAgeRange] = useState(null)
  const [incomeRange, setIncomeRange] = useState(null)
  const [lean, setLean] = useState(null)
  const [education, setEducation] = useState(null)
  const [geoLocale, setGeoLocale] = useState(null)
  const [race, setRace] = useState(null)
  const [sex, setSex] = useState(null)

  // Location state
  const [locations, setLocations] = useState([])
  const [allLocations, setAllLocations] = useState([])
  const [locationPickerOpen, setLocationPickerOpen] = useState(false)
  const [savingLocation, setSavingLocation] = useState(false)

  // Picker modal state
  const [pickerModalOpen, setPickerModalOpen] = useState(false)
  const [pickerModalConfig, setPickerModalConfig] = useState(null)

  // Auto-save debounce timer
  const saveTimeoutRef = useRef(null)
  const isInitialLoadRef = useRef(true)

  const applyDemographicsData = useCallback((demographicsData) => {
    if (demographicsData) {
      setAgeRange(demographicsData.ageRange || null)
      setIncomeRange(demographicsData.incomeRange || null)
      setLean(demographicsData.lean || null)
      setEducation(demographicsData.education || null)
      setGeoLocale(demographicsData.geoLocale || null)
      setRace(demographicsData.race || null)
      setSex(demographicsData.sex || null)
    }
  }, [])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const demographicsCacheKey = CacheKeys.demographics(user?.id)
      const cachedDemographics = await CacheManager.get(demographicsCacheKey)
      const demographicsFresh = cachedDemographics && !CacheManager.isStale(cachedDemographics, CacheDurations.DEMOGRAPHICS)

      if (demographicsFresh) {
        applyDemographicsData(cachedDemographics.data)
      }

      // Always fetch locations directly (not cached via profile)
      const fetches = [
        api.users.getLocations().catch(() => []),
        api.users.getAllLocations().catch(() => []),
      ]
      if (!demographicsFresh) {
        fetches.push(api.users.getDemographics().catch(() => null))
      }

      const [locationsData, allLocationsData, demographicsData] = await Promise.all(fetches)

      setLocations(locationsData || [])
      setAllLocations(allLocationsData || [])

      if (!demographicsFresh && demographicsData !== undefined) {
        applyDemographicsData(demographicsData)
        await CacheManager.set(demographicsCacheKey, demographicsData)
      }

      setTimeout(() => {
        isInitialLoadRef.current = false
      }, 100)
    } catch (err) {
      console.error('Failed to fetch demographics:', err)
      setError(err.message || 'Failed to load demographics')
    } finally {
      setLoading(false)
    }
  }, [user?.id, applyDemographicsData])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useFocusEffect(
    useCallback(() => {
      fetchData()
    }, [fetchData])
  )

  // Auto-save function for demographics (called after debounce)
  const performAutoSave = useCallback(async (updates) => {
    if (isInitialLoadRef.current) return

    try {
      setSaving(true)
      setError(null)

      const demographicsPayload = {
        ageRange: updates.ageRange ?? ageRange,
        incomeRange: updates.incomeRange ?? incomeRange,
        lean: updates.lean ?? lean,
        education: updates.education ?? education,
        geoLocale: updates.geoLocale ?? geoLocale,
        race: updates.race ?? race,
        sex: updates.sex ?? sex,
      }
      await api.users.updateDemographics(demographicsPayload)

      if (user?.id) {
        await CacheManager.set(CacheKeys.demographics(user.id), demographicsPayload)
      }

      await refreshUser()
    } catch (err) {
      console.error('Failed to auto-save demographics:', err)
      setError(err.message || 'Failed to save changes')
      setTimeout(() => setError(null), 3000)
    } finally {
      setSaving(false)
    }
  }, [ageRange, incomeRange, lean, education, geoLocale, race, sex, refreshUser])

  // Handle location selection
  const handleSetLocation = async (locationId) => {
    try {
      setSavingLocation(true)
      setError(null)
      const updatedLocations = await api.users.setLocation(locationId)
      setLocations(updatedLocations || [])
      setLocationPickerOpen(false)
      if (user?.id) await CacheManager.invalidate(CacheKeys.profile(user.id))
    } catch (err) {
      console.error('Failed to set location:', err)
      setError(err.message || 'Failed to update location')
      setTimeout(() => setError(null), 3000)
    } finally {
      setSavingLocation(false)
    }
  }

  // Debounced field change handler
  const handleFieldChange = (setter, fieldName) => (value) => {
    setter(value)

    if (isInitialLoadRef.current) return

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      performAutoSave({ [fieldName]: value })
    }, 500)
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  const openPickerModal = (title, options, currentValue, onSelect) => {
    setPickerModalConfig({ title, options, currentValue, onSelect })
    setPickerModalOpen(true)
  }

  const getOptionLabel = (options, value) => {
    const option = options.find(o => o.value === value)
    return option ? option.label : 'Not set'
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onBack={() => router.back()} />
        <LoadingView message="Loading demographics..." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageHeader}>
          <ThemedText title={true} style={styles.pageTitle}>
            Demographics
          </ThemedText>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color={SemanticColors.warning} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Demographics Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="stats-chart-outline" size={22} color={colors.badgeText} />
            <Text style={styles.sectionTitle}>Demographics</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Optional information used for aggregate statistics. All data is anonymized.
          </Text>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal('Age Range', AGE_RANGE_OPTIONS, ageRange, handleFieldChange(setAgeRange, 'ageRange'))}
          >
            <Text style={styles.pickerLabel}>Age Range</Text>
            <View style={styles.pickerValue}>
              <Text style={styles.pickerValueText}>{getOptionLabel(AGE_RANGE_OPTIONS, ageRange)}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal('Income Range', INCOME_RANGE_OPTIONS, incomeRange, handleFieldChange(setIncomeRange, 'incomeRange'))}
          >
            <Text style={styles.pickerLabel}>Income Range</Text>
            <View style={styles.pickerValue}>
              <Text style={styles.pickerValueText}>{getOptionLabel(INCOME_RANGE_OPTIONS, incomeRange)}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal('Political Lean', POLITICAL_LEAN_OPTIONS, lean, handleFieldChange(setLean, 'lean'))}
          >
            <Text style={styles.pickerLabel}>Political Lean</Text>
            <View style={styles.pickerValue}>
              <Text style={styles.pickerValueText}>{getOptionLabel(POLITICAL_LEAN_OPTIONS, lean)}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal('Education', EDUCATION_OPTIONS, education, handleFieldChange(setEducation, 'education'))}
          >
            <Text style={styles.pickerLabel}>Education</Text>
            <View style={styles.pickerValue}>
              <Text style={styles.pickerValueText}>{getOptionLabel(EDUCATION_OPTIONS, education)}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal('Geographic Locale', GEO_LOCALE_OPTIONS, geoLocale, handleFieldChange(setGeoLocale, 'geoLocale'))}
          >
            <Text style={styles.pickerLabel}>Geographic Locale</Text>
            <View style={styles.pickerValue}>
              <Text style={styles.pickerValueText}>{getOptionLabel(GEO_LOCALE_OPTIONS, geoLocale)}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal('Race/Ethnicity', RACE_OPTIONS, race, handleFieldChange(setRace, 'race'))}
          >
            <Text style={styles.pickerLabel}>Race/Ethnicity</Text>
            <View style={styles.pickerValue}>
              <Text style={styles.pickerValueText}>{getOptionLabel(RACE_OPTIONS, race)}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pickerItem, styles.pickerItemLast]}
            onPress={() => openPickerModal('Sex', SEX_OPTIONS, sex, handleFieldChange(setSex, 'sex'))}
          >
            <Text style={styles.pickerLabel}>Sex</Text>
            <View style={styles.pickerValue}>
              <Text style={styles.pickerValueText}>{getOptionLabel(SEX_OPTIONS, sex)}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Location Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="location-outline" size={22} color={colors.badgeText} />
            <Text style={styles.sectionTitle}>Location</Text>
          </View>
          <TouchableOpacity
            style={styles.locationSelector}
            onPress={() => setLocationPickerOpen(true)}
          >
            {locations.length > 0 ? (
              <Text style={styles.locationBreadcrumb} numberOfLines={2}>
                {locations.map(loc => loc.name).join(' \u203A ')}
              </Text>
            ) : (
              <Text style={styles.locationPlaceholder}>Tap to set your location</Text>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Auto-save indicator */}
        {saving && (
          <View style={styles.savingIndicator}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.savingText}>Saving...</Text>
          </View>
        )}
      </ScrollView>

      {/* Picker Modal */}
      <Modal
        visible={pickerModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPickerModalOpen(false)}
      >
        <Pressable style={shared.modalOverlay} onPress={() => setPickerModalOpen(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{pickerModalConfig?.title}</Text>
            <ScrollView style={styles.modalScrollView}>
              {pickerModalConfig?.options.map((option, index) => {
                const isSelected = pickerModalConfig.currentValue === option.value

                return (
                  <TouchableOpacity
                    key={option.value ?? 'null'}
                    style={[
                      styles.modalItem,
                      isSelected && styles.modalItemSelected,
                      index === pickerModalConfig.options.length - 1 && styles.modalItemLast,
                    ]}
                    onPress={() => {
                      pickerModalConfig.onSelect(option.value)
                      setPickerModalOpen(false)
                    }}
                  >
                    <Text style={[
                      styles.modalItemLabel,
                      isSelected && styles.modalItemLabelSelected
                    ]}>
                      {option.label}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={colors.badgeText} />
                    )}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Location Picker Modal */}
      <LocationPicker
        visible={locationPickerOpen}
        onClose={() => setLocationPickerOpen(false)}
        allLocations={allLocations}
        currentLocationId={locations.length > 0 ? locations[locations.length - 1].id : null}
        onSelect={handleSetLocation}
        saving={savingLocation}
      />
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
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.badgeText,
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
    color: SemanticColors.warning,
    fontSize: 14,
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
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.darkText,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.secondaryText,
    lineHeight: 20,
    marginBottom: 16,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  pickerItemLast: {
    borderBottomWidth: 0,
  },
  pickerLabel: {
    fontSize: 15,
    color: colors.darkText,
  },
  pickerValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pickerValueText: {
    fontSize: 15,
    color: colors.secondaryText,
  },
  locationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 8,
  },
  locationBreadcrumb: {
    flex: 1,
    fontSize: 15,
    color: colors.badgeText,
  },
  locationPlaceholder: {
    flex: 1,
    fontSize: 15,
    color: colors.secondaryText,
    fontStyle: 'italic',
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 16,
    gap: 8,
  },
  savingText: {
    fontSize: 14,
    color: colors.secondaryText,
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
    fontSize: 18,
    fontWeight: '600',
    color: colors.darkText,
    padding: 16,
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
    backgroundColor: colors.badgeBg,
  },
  modalItemLast: {
    borderBottomWidth: 0,
  },
  modalItemLabel: {
    fontSize: 16,
    color: colors.darkText,
  },
  modalItemLabelSelected: {
    color: colors.badgeText,
    fontWeight: '500',
  },
})
