import { StyleSheet, View, TouchableOpacity, FlatList, ScrollView, ActivityIndicator, TextInput, Alert, Platform } from 'react-native'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { SemanticColors } from '../../../constants/Colors'
import api, { translateError } from '../../../lib/api'
import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import EmptyState from '../../../components/EmptyState'
import BottomDrawerModal from '../../../components/BottomDrawerModal'
import LocationFilterButton from '../../../components/LocationFilterButton'
import { useToast } from '../../../components/Toast'
import { useUser } from '../../../hooks/useUser'
import { getHighestRole } from '../../../lib/roles'
import LocationPicker from '../../../components/LocationPicker'
import useSurveyForm from '../../../hooks/useSurveyForm'

const SURVEY_TYPES = ['standard', 'pairwise']

export default function SurveysScreen() {
  const { t } = useTranslation('admin')
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const toast = useToast()
  const { user } = useUser()

  const defaultLocationId = useMemo(() => {
    if (!user?.roles?.length) return null
    const highest = getHighestRole(user)
    const match = user.roles.find(r => r.role === highest)
    return match?.locationId || null
  }, [user])

  const [surveys, setSurveys] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)

  // Location/category data
  const [locations, setLocations] = useState([])
  const [allCategories, setAllCategories] = useState([])

  // Location filter for survey list — default to user's highest role location
  const [filterLocationId, setFilterLocationId] = useState(defaultLocationId)

  // Sync filter when user data loads after mount
  useEffect(() => {
    if (defaultLocationId != null && filterLocationId == null) {
      setFilterLocationId(defaultLocationId)
    }
  }, [defaultLocationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // View modal state
  const [viewSurvey, setViewSurvey] = useState(null)
  const [viewVisible, setViewVisible] = useState(false)

  const fetchSurveys = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.admin.getSurveys({ locationId: filterLocationId || undefined })
      setSurveys(data || [])
    } catch (err) {
      toast?.(translateError(err.message, t) || t('loadError'), 'error')
    } finally {
      setLoading(false)
    }
  }, [t, toast, filterLocationId])

  useEffect(() => { fetchSurveys() }, [fetchSurveys])

  // Fetch locations and categories for pickers
  useEffect(() => {
    const load = async () => {
      try {
        const [locs, cats] = await Promise.all([
          api.users.getAllLocations(),
          api.admin.getAllCategories(),
        ])
        setLocations(locs || [])
        setAllCategories(cats || [])
      } catch {
        // non-critical — pickers will just be empty
      }
    }
    load()
  }, [])

  // --- Survey form (hook) ---
  const form = useSurveyForm({ user, locations, allCategories, defaultLocationId, fetchSurveys })

  const handleDelete = useCallback(async (survey) => {
    const title = survey.surveyTitle || survey.survey_title || ''
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`${t('deleteSurveyConfirm')}\n${t('deleteSurveyMessage')}`)
      : await new Promise(resolve => Alert.alert(
          t('deleteSurveyConfirm'),
          t('deleteSurveyMessage'),
          [
            { text: t('cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('deleteAction'), style: 'destructive', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        ))
    if (!confirmed) return
    setDeleting(survey.id)
    try {
      await api.admin.deleteSurvey(survey.id)
      toast?.(t('surveyDeleted'), 'success')
      fetchSurveys()
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setDeleting(null)
    }
  }, [fetchSurveys, t, toast])

  const handleView = useCallback((survey) => {
    setViewSurvey(survey)
    setViewVisible(true)
  }, [])

  const getSurveyTitle = (survey) => survey.surveyTitle || survey.survey_title || ''
  const getSurveyType = (survey) => {
    if (survey.surveyType === 'pairwise' || survey.survey_type === 'pairwise') return 'pairwise'
    return 'standard'
  }
  const getLocationName = (survey) => survey.locationName || survey.location_name
  const getCategoryName = (survey) => survey.categoryName || survey.category_name

  const renderSurvey = useCallback(({ item }) => {
    const title = getSurveyTitle(item)
    const type = getSurveyType(item)
    const start = item.startTime || item.start_time
    const end = item.endTime || item.end_time
    const locName = getLocationName(item)
    const catName = getCategoryName(item)

    return (
      <View style={styles.surveyCard}>
        <View style={styles.badgeRow}>
          <View style={[styles.typeBadge, type === 'pairwise' ? styles.typeBadgePairwise : styles.typeBadgeStandard]}>
            <ThemedText variant="badge" color="inverse" style={styles.typeBadgeText}>
              {type === 'pairwise' ? t('typePairwise') : t('typeStandard')}
            </ThemedText>
          </View>
          {locName && (
            <View style={styles.metaBadge}>
              <Ionicons name="location-outline" size={12} color={colors.badgeText} />
              <ThemedText variant="badge" style={{ color: colors.badgeText }}>{locName}</ThemedText>
            </View>
          )}
          {catName && (
            <View style={styles.metaBadge}>
              <Ionicons name="pricetag-outline" size={12} color={colors.badgeText} />
              <ThemedText variant="badge" style={{ color: colors.badgeText }}>{catName}</ThemedText>
            </View>
          )}
        </View>

        <ThemedText variant="button" color="dark">{title}</ThemedText>

        {(start || end) && (
          <ThemedText variant="caption" color="secondary">
            {t('surveyDateRange', {
              start: start ? new Date(start).toLocaleDateString() : '—',
              end: end ? new Date(end).toLocaleDateString() : '—',
            })}
          </ThemedText>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.viewButton}
            onPress={() => handleView(item)}
            accessibilityRole="button"
            accessibilityLabel={t('viewSurveyA11y', { title })}
          >
            <Ionicons name="eye-outline" size={16} color={colors.primary} />
            <ThemedText variant="caption" color="primary">{t('viewSurvey')}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(item)}
            disabled={deleting === item.id}
            accessibilityRole="button"
            accessibilityLabel={t('deleteSurveyA11y', { title })}
            accessibilityState={{ disabled: deleting === item.id }}
          >
            {deleting === item.id ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                <ThemedText variant="caption" color="inverse">{t('deleteAction')}</ThemedText>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    )
  }, [styles, colors, t, handleDelete, handleView, deleting])

  // View modal content helpers
  const renderViewContent = () => {
    if (!viewSurvey) return null
    const type = getSurveyType(viewSurvey)
    const start = viewSurvey.startTime || viewSurvey.start_time
    const end = viewSurvey.endTime || viewSurvey.end_time
    const locName = getLocationName(viewSurvey)
    const catName = getCategoryName(viewSurvey)

    return (
      <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
        {/* Type + dates */}
        <View style={styles.badgeRow}>
          <View style={[styles.typeBadge, type === 'pairwise' ? styles.typeBadgePairwise : styles.typeBadgeStandard]}>
            <ThemedText variant="badge" color="inverse" style={styles.typeBadgeText}>
              {type === 'pairwise' ? t('typePairwise') : t('typeStandard')}
            </ThemedText>
          </View>
        </View>

        {(start || end) && (
          <ThemedText variant="caption" color="secondary">
            {t('surveyDateRange', {
              start: start ? new Date(start).toLocaleDateString() : '—',
              end: end ? new Date(end).toLocaleDateString() : '—',
            })}
          </ThemedText>
        )}

        {/* Location/category badges */}
        {(locName || catName) && (
          <View style={styles.badgeRow}>
            {locName && (
              <View style={styles.metaBadge}>
                <Ionicons name="location-outline" size={12} color={colors.badgeText} />
                <ThemedText variant="badge" style={{ color: colors.badgeText }}>{locName}</ThemedText>
              </View>
            )}
            {catName && (
              <View style={styles.metaBadge}>
                <Ionicons name="pricetag-outline" size={12} color={colors.badgeText} />
                <ThemedText variant="badge" style={{ color: colors.badgeText }}>{catName}</ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Standard survey: questions with options */}
        {type === 'standard' && viewSurvey.questions && viewSurvey.questions.length > 0 && (
          <>
            <ThemedText variant="label" color="secondary">{t('surveyQuestions')}</ThemedText>
            {viewSurvey.questions.map((q, qi) => (
              <View key={q.id || qi} style={styles.questionBlock}>
                <ThemedText variant="bodySmall" color="dark">
                  {qi + 1}. {q.question || q.survey_question}
                </ThemedText>
                {(q.options || []).map((opt, oi) => (
                  <ThemedText key={opt.id || oi} variant="caption" color="secondary" style={styles.viewOption}>
                    {'\u2022'} {opt.option || opt.survey_question_option || opt}
                  </ThemedText>
                ))}
              </View>
            ))}
          </>
        )}

        {/* Pairwise survey: items + comparison question */}
        {type === 'pairwise' && (
          <>
            {viewSurvey.comparisonQuestion && (
              <>
                <ThemedText variant="label" color="secondary">{t('surveyComparisonQuestion')}</ThemedText>
                <ThemedText variant="body" color="dark">{viewSurvey.comparisonQuestion}</ThemedText>
              </>
            )}
            {viewSurvey.items && viewSurvey.items.length > 0 && (
              <>
                <ThemedText variant="label" color="secondary">{t('surveyItems')}</ThemedText>
                {viewSurvey.items.map((item, i) => (
                  <View key={item.id || i} style={styles.viewItemRow}>
                    <ThemedText variant="bodySmall" color="dark">
                      {i + 1}. {item.text || item}
                    </ThemedText>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText variant="h1" title={true} style={styles.pageTitle}>{t('surveysTitle')}</ThemedText>
          <TouchableOpacity
            style={styles.createButton}
            onPress={form.openCreateForm}
            accessibilityRole="button"
            accessibilityLabel={t('createSurveyA11y')}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <ThemedText variant="buttonSmall" color="inverse">{t('createSurvey')}</ThemedText>
          </TouchableOpacity>
        </View>

        {locations.length > 0 && (
          <LocationFilterButton
            allLocations={locations}
            selectedLocationId={filterLocationId}
            onSelect={setFilterLocationId}
            accessibilityLabel={t('filterLocationA11y', { location: filterLocationId ? '' : t('allLocations') })}
          />
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : surveys.length === 0 ? (
          <EmptyState
            icon="clipboard-outline"
            title={t('noSurveys')}
            subtitle={t('noSurveysSubtitle')}
            style={styles.emptyContainer}
          />
        ) : (
          <FlatList
            data={surveys}
            keyExtractor={(item) => item.id}
            renderItem={renderSurvey}
            contentContainerStyle={styles.listContent}
            style={styles.surveyList}
          />
        )}
      </View>

      {/* Create Survey Modal */}
      <BottomDrawerModal
        visible={form.createVisible}
        onClose={() => { form.setCreateVisible(false); form.resetForm() }}
        title={t('createSurvey')}
      >
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          {/* Type selector */}
          <ThemedText variant="label" color="secondary">{t('surveyTypeLabel')}</ThemedText>
          <View style={styles.chipRow}>
            {SURVEY_TYPES.map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.chip, form.surveyType === type && styles.chipActive]}
                onPress={() => form.setSurveyType(type)}
                accessibilityRole="button"
                accessibilityState={{ selected: form.surveyType === type }}
              >
                <ThemedText variant="caption" color={form.surveyType === type ? 'inverse' : 'dark'}>
                  {type === 'standard' ? t('typeStandard') : t('typePairwise')}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          {/* Title */}
          <ThemedText variant="label" color="secondary">{t('surveyTitleLabel')}</ThemedText>
          <TextInput
            style={styles.input}
            value={form.surveyTitle}
            onChangeText={form.setSurveyTitle}
            placeholder={t('surveyTitlePlaceholder')}
            placeholderTextColor={colors.placeholderText}
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('surveyTitleA11y')}
          />

          {/* Dates */}
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <ThemedText variant="label" color="secondary">{t('startTimeLabel')}</ThemedText>
              <TextInput
                style={styles.input}
                value={form.startTime}
                onChangeText={form.setStartTime}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.placeholderText}
                maxFontSizeMultiplier={1.5}
                accessibilityLabel={t('startTimeA11y')}
              />
            </View>
            <View style={styles.dateField}>
              <ThemedText variant="label" color="secondary">{t('endTimeLabel')}</ThemedText>
              <TextInput
                style={styles.input}
                value={form.endTime}
                onChangeText={form.setEndTime}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.placeholderText}
                maxFontSizeMultiplier={1.5}
                accessibilityLabel={t('endTimeA11y')}
              />
            </View>
          </View>

          {/* Location picker */}
          {form.allowableLocations.length > 0 && (
            <>
              <ThemedText variant="label" color="secondary">{t('selectLocationOptional')}</ThemedText>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => form.setLocationPickerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('selectLocationA11y')}
              >
                <Ionicons name="location-outline" size={16} color={colors.secondaryText} />
                <ThemedText variant="body" color="dark" style={styles.pickerButtonText}>
                  {form.selectedLocationId
                    ? locations.find(l => l.id === form.selectedLocationId)?.name || t('selectLocation')
                    : t('selectLocation')}
                </ThemedText>
                <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
              </TouchableOpacity>
            </>
          )}

          {/* Category picker */}
          {allCategories.length > 0 && (
            <>
              <ThemedText variant="label" color="secondary">{t('selectCategoryOptional')}</ThemedText>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => form.setCategoryPickerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('selectCategoryA11y')}
              >
                <Ionicons name="pricetag-outline" size={16} color={colors.secondaryText} />
                <ThemedText variant="body" color="dark" style={styles.pickerButtonText}>
                  {form.selectedCategoryId
                    ? allCategories.find(c => c.id === form.selectedCategoryId)?.label || t('allCategories')
                    : t('allCategories')}
                </ThemedText>
                <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
              </TouchableOpacity>
            </>
          )}

          {/* Standard form: questions */}
          {form.surveyType === 'standard' && (
            <>
              <ThemedText variant="label" color="secondary">{t('questionsLabel')}</ThemedText>
              {form.questions.map((q, qi) => (
                <View key={qi} style={styles.questionBlock}>
                  <View style={styles.questionHeader}>
                    <ThemedText variant="bodySmall" color="dark">{t('questionNumber', { number: qi + 1 })}</ThemedText>
                    {form.questions.length > 1 && (
                      <TouchableOpacity
                        onPress={() => form.removeQuestion(qi)}
                        accessibilityRole="button"
                        accessibilityLabel={t('removeQuestionA11y', { number: qi + 1 })}
                      >
                        <Ionicons name="close-circle" size={20} color={SemanticColors.warning} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput
                    style={styles.input}
                    value={q.text}
                    onChangeText={(text) => form.updateQuestion(qi, text)}
                    placeholder={t('questionPlaceholder')}
                    placeholderTextColor={colors.placeholderText}
                    maxFontSizeMultiplier={1.5}
                    accessibilityLabel={t('questionA11y', { number: qi + 1 })}
                  />
                  {q.options.map((opt, oi) => (
                    <View key={oi} style={styles.optionRow}>
                      <TextInput
                        style={[styles.input, styles.optionInput]}
                        value={opt}
                        onChangeText={(text) => form.updateOption(qi, oi, text)}
                        placeholder={t('optionPlaceholder', { number: oi + 1 })}
                        placeholderTextColor={colors.placeholderText}
                        maxFontSizeMultiplier={1.5}
                        accessibilityLabel={t('optionA11y', { number: oi + 1, question: qi + 1 })}
                      />
                      {q.options.length > 2 && (
                        <TouchableOpacity
                          onPress={() => form.removeOption(qi, oi)}
                          accessibilityRole="button"
                          accessibilityLabel={t('removeOptionA11y', { number: oi + 1, question: qi + 1 })}
                        >
                          <Ionicons name="close-circle" size={18} color={SemanticColors.warning} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.addRow}
                    onPress={() => form.addOption(qi)}
                    accessibilityRole="button"
                    accessibilityLabel={t('addOptionA11y', { number: qi + 1 })}
                  >
                    <Ionicons name="add" size={16} color={colors.primary} />
                    <ThemedText variant="caption" color="primary">{t('addOption')}</ThemedText>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={styles.addRow}
                onPress={form.addQuestion}
                accessibilityRole="button"
                accessibilityLabel={t('addQuestionA11y')}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <ThemedText variant="caption" color="primary">{t('addQuestion')}</ThemedText>
              </TouchableOpacity>
            </>
          )}

          {/* Pairwise form: items */}
          {form.surveyType === 'pairwise' && (
            <>
              <ThemedText variant="label" color="secondary">{t('itemsLabel')}</ThemedText>
              {form.items.map((item, i) => (
                <View key={i} style={styles.optionRow}>
                  <TextInput
                    style={[styles.input, styles.optionInput]}
                    value={item}
                    onChangeText={(text) => form.updateItem(i, text)}
                    placeholder={t('itemPlaceholder', { number: i + 1 })}
                    placeholderTextColor={colors.placeholderText}
                    maxFontSizeMultiplier={1.5}
                    accessibilityLabel={t('itemA11y', { number: i + 1 })}
                  />
                  {form.items.length > 2 && (
                    <TouchableOpacity
                      onPress={() => form.removeItem(i)}
                      accessibilityRole="button"
                      accessibilityLabel={t('removeItemA11y', { number: i + 1 })}
                    >
                      <Ionicons name="close-circle" size={18} color={SemanticColors.warning} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {form.items.length < 20 && (
                <TouchableOpacity
                  style={styles.addRow}
                  onPress={form.addItem}
                  accessibilityRole="button"
                  accessibilityLabel={t('addItemA11y')}
                >
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                  <ThemedText variant="caption" color="primary">{t('addItem')}</ThemedText>
                </TouchableOpacity>
              )}

              <ThemedText variant="label" color="secondary">{t('comparisonQuestionLabel')}</ThemedText>
              <TextInput
                style={styles.input}
                value={form.comparisonQuestion}
                onChangeText={form.setComparisonQuestion}
                placeholder={t('comparisonQuestionPlaceholder')}
                placeholderTextColor={colors.placeholderText}
                maxFontSizeMultiplier={1.5}
                accessibilityLabel={t('comparisonQuestionA11y')}
              />
            </>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={styles.submitButton}
            onPress={form.handleCreate}
            disabled={form.submitting}
            accessibilityRole="button"
            accessibilityLabel={t('createSurveyA11y')}
            accessibilityState={{ disabled: form.submitting }}
          >
            {form.submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <ThemedText variant="button" color="inverse">{t('createSurvey')}</ThemedText>
            )}
          </TouchableOpacity>
        </ScrollView>
      </BottomDrawerModal>

      {/* View Survey Detail Modal */}
      <BottomDrawerModal
        visible={viewVisible}
        onClose={() => { setViewVisible(false); setViewSurvey(null) }}
        title={viewSurvey ? getSurveyTitle(viewSurvey) : t('surveyDetails')}
      >
        {renderViewContent()}
      </BottomDrawerModal>
      {/* Location Picker Modal */}
      <LocationPicker
        visible={form.locationPickerVisible}
        onClose={() => form.setLocationPickerVisible(false)}
        allLocations={form.allowableLocations}
        currentLocationId={form.selectedLocationId}
        onSelect={(id) => { form.setSelectedLocationId(id); form.setLocationPickerVisible(false) }}
        saving={false}
      />

      {/* Category Picker Modal */}
      <BottomDrawerModal
        visible={form.categoryPickerVisible}
        onClose={() => form.setCategoryPickerVisible(false)}
        title={t('selectCategory')}
      >
        <ScrollView contentContainerStyle={styles.categoryList}>
          <TouchableOpacity
            style={[styles.categoryRow, !form.selectedCategoryId && styles.categoryRowSelected]}
            onPress={() => { form.setSelectedCategoryId(null); form.setCategoryPickerVisible(false) }}
            accessibilityRole="button"
            accessibilityLabel={t('allCategories')}
            accessibilityState={{ selected: !form.selectedCategoryId }}
          >
            <ThemedText variant="body" color={!form.selectedCategoryId ? 'primary' : 'dark'}>
              {t('allCategories')}
            </ThemedText>
            {!form.selectedCategoryId && <Ionicons name="checkmark" size={20} color={colors.primary} />}
          </TouchableOpacity>
          {allCategories.map(cat => {
            const selected = form.selectedCategoryId === cat.id
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryRow, selected && styles.categoryRowSelected]}
                onPress={() => { form.setSelectedCategoryId(cat.id); form.setCategoryPickerVisible(false) }}
                accessibilityRole="button"
                accessibilityLabel={cat.label || cat.name}
                accessibilityState={{ selected }}
              >
                <ThemedText variant="body" color={selected ? 'primary' : 'dark'}>
                  {cat.label || cat.name}
                </ThemedText>
                {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </BottomDrawerModal>
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pageTitle: {
    color: colors.primary,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySurface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 25,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  surveyList: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
    gap: 12,
  },
  surveyCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  typeBadgeStandard: {
    backgroundColor: colors.primarySurface,
  },
  typeBadgePairwise: {
    backgroundColor: SemanticColors.pending,
  },
  typeBadgeText: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  viewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 8,
    borderRadius: 25,
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: SemanticColors.warning,
    paddingVertical: 8,
    borderRadius: 25,
  },

  // Modal
  modalContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerButtonText: {
    flex: 1,
  },
  categoryList: {
    padding: 16,
    paddingBottom: 40,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  categoryRowSelected: {
    backgroundColor: colors.primaryLight + '20',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.buttonDefault,
  },
  chipActive: {
    backgroundColor: colors.primarySurface,
  },
  input: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateField: {
    flex: 1,
    gap: 4,
  },
  questionBlock: {
    backgroundColor: colors.uiBackground,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionInput: {
    flex: 1,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  submitButton: {
    backgroundColor: colors.primarySurface,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 8,
  },

  // View modal
  viewOption: {
    paddingLeft: 12,
  },
  viewItemRow: {
    paddingLeft: 4,
    paddingVertical: 2,
  },
})
