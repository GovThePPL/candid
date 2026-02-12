/**
 * Hook for managing category assignments, label surveys, and category creation
 * within the organization admin screen.
 *
 * Handles: opening/closing the categories modal, assigning/removing categories
 * from locations, creating new categories with optional label surveys, and
 * inline label survey creation/deletion for existing categories.
 */
import { useState, useMemo, useCallback } from 'react'
import { Platform, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import api, { translateError } from '../lib/api'
import { useToast } from '../components/Toast'

export default function useCategoryManagement({ allCategories, fetchAllCategories }) {
  const { t } = useTranslation('admin')
  const toast = useToast()

  // --- Modal state ---
  const [catModalVisible, setCatModalVisible] = useState(false)
  const [catLocation, setCatLocation] = useState(null)
  const [catLoading, setCatLoading] = useState(false)
  const [assignedCategories, setAssignedCategories] = useState([])

  // --- Create category form ---
  const [newCategoryLabel, setNewCategoryLabel] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [createLabelSurvey, setCreateLabelSurvey] = useState(true)
  const [labelSurveyItems, setLabelSurveyItems] = useState(['', ''])
  const [labelSurveyComparisonQuestion, setLabelSurveyComparisonQuestion] = useState('')

  // --- Label survey state ---
  const [categoryLabelSurveys, setCategoryLabelSurveys] = useState({})
  const [inlineLabelCatId, setInlineLabelCatId] = useState(null)
  const [inlineLabelItems, setInlineLabelItems] = useState(['', ''])
  const [inlineLabelComparison, setInlineLabelComparison] = useState('')
  const [inlineLabelCreating, setInlineLabelCreating] = useState(false)

  const handleManageCategories = useCallback(async (location) => {
    setCatLocation(location)
    setCatModalVisible(true)
    setCatLoading(true)
    setInlineLabelCatId(null)
    try {
      const data = await api.admin.getLocationCategories(location.id)
      const cats = data || []
      setAssignedCategories(cats)
      const surveyMap = {}
      await Promise.all(cats.map(async (cat) => {
        try {
          const result = await api.admin.getCategoryLabelSurvey(cat.id)
          surveyMap[cat.id] = result?.labelSurvey || null
        } catch {
          surveyMap[cat.id] = null
        }
      }))
      setCategoryLabelSurveys(surveyMap)
    } catch {
      setAssignedCategories([])
      setCategoryLabelSurveys({})
    } finally {
      setCatLoading(false)
    }
  }, [])

  const handleAssignCategory = useCallback(async (categoryId) => {
    if (!catLocation) return
    try {
      await api.admin.assignLocationCategory(catLocation.id, categoryId)
      toast?.(t('categoryAssigned'), 'success')
      handleManageCategories(catLocation)
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    }
  }, [catLocation, handleManageCategories, t, toast])

  const handleRemoveCategory = useCallback(async (categoryId) => {
    if (!catLocation) return
    try {
      await api.admin.removeLocationCategory(catLocation.id, categoryId)
      toast?.(t('categoryRemoved'), 'success')
      handleManageCategories(catLocation)
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    }
  }, [catLocation, handleManageCategories, t, toast])

  const handleCreateCategory = useCallback(async () => {
    if (!newCategoryLabel.trim()) return
    if (createLabelSurvey) {
      const validItems = labelSurveyItems.filter(i => i.trim())
      if (validItems.length < 2) {
        toast?.(t('labelSurveyItemsRequired'), 'error')
        return
      }
    }
    setCreatingCategory(true)
    try {
      const opts = {}
      if (createLabelSurvey) {
        opts.createLabelSurvey = true
        opts.labelSurveyItems = labelSurveyItems.filter(i => i.trim())
        if (labelSurveyComparisonQuestion.trim()) {
          opts.labelSurveyComparisonQuestion = labelSurveyComparisonQuestion.trim()
        }
      }
      const result = await api.admin.createCategory(newCategoryLabel.trim(), null, opts)
      if (catLocation && result?.id) {
        await api.admin.assignLocationCategory(catLocation.id, result.id)
      }
      toast?.(t('categoryCreated'), 'success')
      setNewCategoryLabel('')
      setLabelSurveyItems(['', ''])
      setLabelSurveyComparisonQuestion('')
      setCreateLabelSurvey(true)
      fetchAllCategories()
      if (catLocation) handleManageCategories(catLocation)
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setCreatingCategory(false)
    }
  }, [newCategoryLabel, createLabelSurvey, labelSurveyItems, labelSurveyComparisonQuestion, fetchAllCategories, catLocation, handleManageCategories, t, toast])

  const handleDeleteLabelSurvey = useCallback(async (categoryId, surveyId) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`${t('deleteLabelSurveyConfirm')}\n${t('deleteLabelSurveyMessage')}`)
      : await new Promise(resolve => Alert.alert(
          t('deleteLabelSurveyConfirm'),
          t('deleteLabelSurveyMessage'),
          [
            { text: t('cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('deleteAction'), style: 'destructive', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        ))
    if (!confirmed) return
    try {
      await api.admin.deleteSurvey(surveyId)
      toast?.(t('labelSurveyDeleted'), 'success')
      setCategoryLabelSurveys(prev => ({ ...prev, [categoryId]: null }))
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    }
  }, [t, toast])

  const handleCreateLabelSurvey = useCallback(async (categoryId) => {
    const validItems = inlineLabelItems.filter(i => i.trim())
    if (validItems.length < 2) {
      toast?.(t('labelSurveyItemsRequired'), 'error')
      return
    }
    setInlineLabelCreating(true)
    try {
      const body = {
        isGroupLabeling: true,
        positionCategoryId: categoryId,
        items: validItems,
      }
      if (inlineLabelComparison.trim()) {
        body.comparisonQuestion = inlineLabelComparison.trim()
      }
      await api.admin.createPairwiseSurvey(body)
      toast?.(t('labelSurveyCreated'), 'success')
      setInlineLabelCatId(null)
      setInlineLabelItems(['', ''])
      setInlineLabelComparison('')
      try {
        const result = await api.admin.getCategoryLabelSurvey(categoryId)
        setCategoryLabelSurveys(prev => ({ ...prev, [categoryId]: result?.labelSurvey || null }))
      } catch {
        setCategoryLabelSurveys(prev => ({ ...prev, [categoryId]: null }))
      }
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setInlineLabelCreating(false)
    }
  }, [inlineLabelItems, inlineLabelComparison, t, toast])

  const unassignedCategories = useMemo(() => {
    const assignedIds = new Set(assignedCategories.map(c => c.id))
    return allCategories.filter(c => !assignedIds.has(c.id))
  }, [allCategories, assignedCategories])

  return {
    catModalVisible, setCatModalVisible,
    catLocation,
    catLoading,
    assignedCategories,
    newCategoryLabel, setNewCategoryLabel,
    creatingCategory,
    createLabelSurvey, setCreateLabelSurvey,
    labelSurveyItems, setLabelSurveyItems,
    labelSurveyComparisonQuestion, setLabelSurveyComparisonQuestion,
    categoryLabelSurveys,
    inlineLabelCatId, setInlineLabelCatId,
    inlineLabelItems, setInlineLabelItems,
    inlineLabelComparison, setInlineLabelComparison,
    inlineLabelCreating,
    unassignedCategories,
    handleManageCategories,
    handleAssignCategory,
    handleRemoveCategory,
    handleCreateCategory,
    handleDeleteLabelSurvey,
    handleCreateLabelSurvey,
  }
}
