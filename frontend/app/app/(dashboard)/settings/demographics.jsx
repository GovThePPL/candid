import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Pressable } from 'react-native'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { SemanticColors } from '../../../constants/Colors'
import { createSharedStyles } from '../../../constants/SharedStyles'
import api, { translateError } from '../../../lib/api'
import { useUser } from '../../../hooks/useUser'
import { CacheManager, CacheKeys, CacheDurations } from '../../../lib/cache'

import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import LoadingView from '../../../components/LoadingView'

const getAgeRangeOptions = (t) => [
  { value: null, label: t('preferNotToSay') },
  { value: '18-24', label: '18-24' },
  { value: '25-34', label: '25-34' },
  { value: '35-44', label: '35-44' },
  { value: '45-54', label: '45-54' },
  { value: '55-64', label: '55-64' },
  { value: '65+', label: '65+' },
]

const getIncomeRangeOptions = (t) => [
  { value: null, label: t('preferNotToSay') },
  { value: 'under_25k', label: t('incomeUnder25k') },
  { value: '25k-50k', label: t('income25k50k') },
  { value: '50k-75k', label: t('income50k75k') },
  { value: '75k-100k', label: t('income75k100k') },
  { value: '100k-150k', label: t('income100k150k') },
  { value: '150k-200k', label: t('income150k200k') },
  { value: 'over_200k', label: t('incomeOver200k') },
]

const getPoliticalLeanOptions = (t) => [
  { value: null, label: t('preferNotToSay') },
  { value: 'very_liberal', label: t('leanVeryLiberal') },
  { value: 'liberal', label: t('leanLiberal') },
  { value: 'moderate', label: t('leanModerate') },
  { value: 'conservative', label: t('leanConservative') },
  { value: 'very_conservative', label: t('leanVeryConservative') },
]

const getEducationOptions = (t) => [
  { value: null, label: t('preferNotToSay') },
  { value: 'less_than_high_school', label: t('eduLessHighSchool') },
  { value: 'high_school', label: t('eduHighSchool') },
  { value: 'some_college', label: t('eduSomeCollege') },
  { value: 'associates', label: t('eduAssociates') },
  { value: 'bachelors', label: t('eduBachelors') },
  { value: 'masters', label: t('eduMasters') },
  { value: 'doctorate', label: t('eduDoctorate') },
  { value: 'professional', label: t('eduProfessional') },
]

const getGeoLocaleOptions = (t) => [
  { value: null, label: t('preferNotToSay') },
  { value: 'urban', label: t('localeUrban') },
  { value: 'suburban', label: t('localeSuburban') },
  { value: 'rural', label: t('localeRural') },
]

const getRaceOptions = (t) => [
  { value: null, label: t('preferNotToSay') },
  { value: 'white', label: t('raceWhite') },
  { value: 'black', label: t('raceBlack') },
  { value: 'hispanic', label: t('raceHispanic') },
  { value: 'asian', label: t('raceAsian') },
  { value: 'native_american', label: t('raceNativeAmerican') },
  { value: 'pacific_islander', label: t('racePacificIslander') },
  { value: 'multiracial', label: t('raceMultiracial') },
  { value: 'other', label: t('raceOther') },
]

const getSexOptions = (t) => [
  { value: null, label: t('preferNotToSay') },
  { value: 'male', label: t('sexMale') },
  { value: 'female', label: t('sexFemale') },
  { value: 'other', label: t('sexOther') },
]

export default function DemographicsSettings() {
  const { user, refreshUser } = useUser()
  const router = useRouter()
  const colors = useThemeColors()
  const { t } = useTranslation('settings')
  const styles = useMemo(() => createStyles(colors), [colors])
  const shared = useMemo(() => createSharedStyles(colors), [colors])

  const AGE_RANGE_OPTIONS = useMemo(() => getAgeRangeOptions(t), [t])
  const INCOME_RANGE_OPTIONS = useMemo(() => getIncomeRangeOptions(t), [t])
  const POLITICAL_LEAN_OPTIONS = useMemo(() => getPoliticalLeanOptions(t), [t])
  const EDUCATION_OPTIONS = useMemo(() => getEducationOptions(t), [t])
  const GEO_LOCALE_OPTIONS = useMemo(() => getGeoLocaleOptions(t), [t])
  const RACE_OPTIONS = useMemo(() => getRaceOptions(t), [t])
  const SEX_OPTIONS = useMemo(() => getSexOptions(t), [t])

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
      } else {
        const demographicsData = await api.users.getDemographics().catch(() => null)
        if (demographicsData !== undefined) {
          applyDemographicsData(demographicsData)
          await CacheManager.set(demographicsCacheKey, demographicsData)
        }
      }

      setTimeout(() => {
        isInitialLoadRef.current = false
      }, 100)
    } catch (err) {
      console.error('Failed to fetch demographics:', err)
      setError(translateError(err.message, t) || t('failedLoadDemographics'))
    } finally {
      setLoading(false)
    }
  }, [user?.id, applyDemographicsData, t])

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
      setError(translateError(err.message, t) || t('failedSaveChanges'))
      setTimeout(() => setError(null), 3000)
    } finally {
      setSaving(false)
    }
  }, [ageRange, incomeRange, lean, education, geoLocale, race, sex, refreshUser, t])

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
    return option ? option.label : t('notSet')
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onBack={() => router.back()} />
        <LoadingView message={t('loadingDemographics')} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageHeader}>
          <ThemedText variant="h1" title={true} style={styles.pageTitle}>
            {t('demographics')}
          </ThemedText>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color={SemanticColors.warning} />
            <ThemedText variant="bodySmall" color="error" style={styles.errorText}>{error}</ThemedText>
          </View>
        )}

        {/* Demographics Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="stats-chart-outline" size={22} color={colors.badgeText} />
            <ThemedText variant="h2" color="dark">{t('demographics')}</ThemedText>
          </View>
          <ThemedText variant="bodySmall" color="secondary" style={styles.sectionDescription}>
            {t('demographicsDesc')}
          </ThemedText>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal(t('ageRange'), AGE_RANGE_OPTIONS, ageRange, handleFieldChange(setAgeRange, 'ageRange'))}
            accessibilityRole="button"
            accessibilityLabel={`${t('ageRange')}: ${getOptionLabel(AGE_RANGE_OPTIONS, ageRange)}`}
          >
            <ThemedText variant="body" color="dark" style={styles.pickerLabel}>{t('ageRange')}</ThemedText>
            <View style={styles.pickerValue}>
              <ThemedText variant="body" color="secondary" style={styles.pickerValueText}>{getOptionLabel(AGE_RANGE_OPTIONS, ageRange)}</ThemedText>
              <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal(t('incomeRange'), INCOME_RANGE_OPTIONS, incomeRange, handleFieldChange(setIncomeRange, 'incomeRange'))}
            accessibilityRole="button"
            accessibilityLabel={`${t('incomeRange')}: ${getOptionLabel(INCOME_RANGE_OPTIONS, incomeRange)}`}
          >
            <ThemedText variant="body" color="dark" style={styles.pickerLabel}>{t('incomeRange')}</ThemedText>
            <View style={styles.pickerValue}>
              <ThemedText variant="body" color="secondary" style={styles.pickerValueText}>{getOptionLabel(INCOME_RANGE_OPTIONS, incomeRange)}</ThemedText>
              <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal(t('politicalLean'), POLITICAL_LEAN_OPTIONS, lean, handleFieldChange(setLean, 'lean'))}
            accessibilityRole="button"
            accessibilityLabel={`${t('politicalLean')}: ${getOptionLabel(POLITICAL_LEAN_OPTIONS, lean)}`}
          >
            <ThemedText variant="body" color="dark" style={styles.pickerLabel}>{t('politicalLean')}</ThemedText>
            <View style={styles.pickerValue}>
              <ThemedText variant="body" color="secondary" style={styles.pickerValueText}>{getOptionLabel(POLITICAL_LEAN_OPTIONS, lean)}</ThemedText>
              <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal(t('education'), EDUCATION_OPTIONS, education, handleFieldChange(setEducation, 'education'))}
            accessibilityRole="button"
            accessibilityLabel={`${t('education')}: ${getOptionLabel(EDUCATION_OPTIONS, education)}`}
          >
            <ThemedText variant="body" color="dark" style={styles.pickerLabel}>{t('education')}</ThemedText>
            <View style={styles.pickerValue}>
              <ThemedText variant="body" color="secondary" style={styles.pickerValueText}>{getOptionLabel(EDUCATION_OPTIONS, education)}</ThemedText>
              <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal(t('geoLocale'), GEO_LOCALE_OPTIONS, geoLocale, handleFieldChange(setGeoLocale, 'geoLocale'))}
            accessibilityRole="button"
            accessibilityLabel={`${t('geoLocale')}: ${getOptionLabel(GEO_LOCALE_OPTIONS, geoLocale)}`}
          >
            <ThemedText variant="body" color="dark" style={styles.pickerLabel}>{t('geoLocale')}</ThemedText>
            <View style={styles.pickerValue}>
              <ThemedText variant="body" color="secondary" style={styles.pickerValueText}>{getOptionLabel(GEO_LOCALE_OPTIONS, geoLocale)}</ThemedText>
              <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal(t('raceEthnicity'), RACE_OPTIONS, race, handleFieldChange(setRace, 'race'))}
            accessibilityRole="button"
            accessibilityLabel={`${t('raceEthnicity')}: ${getOptionLabel(RACE_OPTIONS, race)}`}
          >
            <ThemedText variant="body" color="dark" style={styles.pickerLabel}>{t('raceEthnicity')}</ThemedText>
            <View style={styles.pickerValue}>
              <ThemedText variant="body" color="secondary" style={styles.pickerValueText}>{getOptionLabel(RACE_OPTIONS, race)}</ThemedText>
              <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pickerItem, styles.pickerItemLast]}
            onPress={() => openPickerModal(t('sex'), SEX_OPTIONS, sex, handleFieldChange(setSex, 'sex'))}
            accessibilityRole="button"
            accessibilityLabel={`${t('sex')}: ${getOptionLabel(SEX_OPTIONS, sex)}`}
          >
            <ThemedText variant="body" color="dark" style={styles.pickerLabel}>{t('sex')}</ThemedText>
            <View style={styles.pickerValue}>
              <ThemedText variant="body" color="secondary" style={styles.pickerValueText}>{getOptionLabel(SEX_OPTIONS, sex)}</ThemedText>
              <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Auto-save indicator */}
        {saving && (
          <View style={styles.savingIndicator}>
            <ActivityIndicator size="small" color={colors.primary} />
            <ThemedText variant="bodySmall" color="secondary" style={styles.savingText}>{t('saving')}</ThemedText>
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
            <ThemedText variant="h2" color="dark" style={styles.modalTitle}>{pickerModalConfig?.title}</ThemedText>
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
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={option.label}
                  >
                    <ThemedText variant="button" color="dark" style={[
                      styles.modalItemLabel,
                      isSelected && styles.modalItemLabelSelected
                    ]}>
                      {option.label}
                    </ThemedText>
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
    color: colors.badgeText,
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
    marginBottom: 12,
  },
  sectionDescription: {
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
  },
  pickerValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pickerValueText: {
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
  },
  modalItemLabelSelected: {
    color: colors.badgeText,
  },
})
