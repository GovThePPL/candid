/**
 * Hook for managing the survey creation form within the admin surveys screen.
 *
 * Handles: form state for both standard and pairwise survey types,
 * question/option/item CRUD, location/session picker state,
 * form validation, submission, and reset.
 */
import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import api, { translateError } from '../lib/api'
import { useToast } from '../components/Toast'
import { getDescendantLocationIds } from '../lib/roles'

export default function useSurveyForm({ user, locations, allSessions, defaultLocationId, fetchSurveys }) {
  const { t } = useTranslation('admin')
  const toast = useToast()

  // --- Modal visibility ---
  const [createVisible, setCreateVisible] = useState(false)

  // --- Form fields ---
  const [surveyType, setSurveyType] = useState('standard')
  const [surveyTitle, setSurveyTitle] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Standard survey: questions with options
  const [questions, setQuestions] = useState([{ text: '', options: ['', ''] }])

  // Pairwise survey: items + comparison question
  const [items, setItems] = useState(['', ''])
  const [comparisonQuestion, setComparisonQuestion] = useState('')

  // --- Location/session pickers ---
  const [selectedLocationId, setSelectedLocationId] = useState(null)
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [locationPickerVisible, setLocationPickerVisible] = useState(false)
  const [sessionPickerVisible, setSessionPickerVisible] = useState(false)

  // Locations the user can scope surveys to (admin + facilitator scope)
  const allowableLocations = useMemo(() => {
    if (!user?.roles?.length || !locations.length) return []
    const allowedIds = new Set()
    for (const r of user.roles) {
      if (r.role === 'admin' && r.locationId) {
        for (const id of getDescendantLocationIds(r.locationId, locations)) {
          allowedIds.add(id)
        }
      } else if (r.role === 'facilitator' && r.locationId) {
        allowedIds.add(r.locationId)
      }
    }
    // Reparent locations whose parent isn't in the filtered set so they appear at root
    return locations
      .filter(l => allowedIds.has(l.id))
      .map(l => allowedIds.has(l.parentLocationId) ? l : { ...l, parentLocationId: null })
  }, [user, locations])

  // Sessions the user can scope surveys to (admin = all, facilitator = assigned only)
  const allowableSessions = useMemo(() => {
    if (!user?.roles?.length || !allSessions.length) return allSessions
    const isAdmin = user.roles.some(r => r.role === 'admin')
    if (isAdmin) return allSessions
    // Facilitator: only sessions matching their role + selected location
    const allowedSessionIds = new Set()
    for (const r of user.roles) {
      if (r.role === 'facilitator' && r.sessionId) {
        if (!selectedLocationId || r.locationId === selectedLocationId) {
          allowedSessionIds.add(r.sessionId)
        }
      }
    }
    return allSessions.filter(c => allowedSessionIds.has(c.id))
  }, [user, allSessions, selectedLocationId])

  // --- Standard form helpers ---
  const addQuestion = useCallback(() => {
    setQuestions(prev => [...prev, { text: '', options: ['', ''] }])
  }, [])
  const removeQuestion = useCallback((index) => {
    setQuestions(prev => prev.filter((_, i) => i !== index))
  }, [])
  const updateQuestion = useCallback((index, text) => {
    setQuestions(prev => prev.map((q, i) => i === index ? { ...q, text } : q))
  }, [])
  const addOption = useCallback((qIndex) => {
    setQuestions(prev => prev.map((q, i) => i === qIndex ? { ...q, options: [...q.options, ''] } : q))
  }, [])
  const removeOption = useCallback((qIndex, oIndex) => {
    setQuestions(prev => prev.map((q, i) => i === qIndex ? { ...q, options: q.options.filter((_, j) => j !== oIndex) } : q))
  }, [])
  const updateOption = useCallback((qIndex, oIndex, text) => {
    setQuestions(prev => prev.map((q, i) => i === qIndex ? { ...q, options: q.options.map((o, j) => j === oIndex ? text : o) } : q))
  }, [])

  // --- Pairwise form helpers ---
  const addItem = useCallback(() => {
    setItems(prev => [...prev, ''])
  }, [])
  const removeItem = useCallback((index) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }, [])
  const updateItem = useCallback((index, text) => {
    setItems(prev => prev.map((item, i) => i === index ? text : item))
  }, [])

  // --- Reset + Submit ---
  const resetForm = useCallback(() => {
    setSurveyTitle('')
    setStartTime('')
    setEndTime('')
    setSurveyType('standard')
    setQuestions([{ text: '', options: ['', ''] }])
    setItems(['', ''])
    setComparisonQuestion('')
    setSelectedLocationId(defaultLocationId)
    setSelectedSessionId(null)
  }, [defaultLocationId])

  const openCreateForm = useCallback(() => {
    setSelectedLocationId(defaultLocationId)
    setCreateVisible(true)
  }, [defaultLocationId])

  const handleCreate = useCallback(async () => {
    if (!surveyTitle.trim()) {
      toast?.(t('surveyTitleRequired'), 'error')
      return
    }
    if (!startTime.trim() || !endTime.trim()) {
      toast?.(t('surveyDatesRequired'), 'error')
      return
    }

    if (surveyType === 'standard') {
      const valid = questions.every(q => q.text.trim() && q.options.filter(o => o.trim()).length >= 2)
      if (!valid || questions.length === 0) {
        toast?.(t('surveyQuestionRequired'), 'error')
        return
      }
    } else {
      const validItems = items.filter(i => i.trim())
      if (validItems.length < 2) {
        toast?.(t('surveyMinItems'), 'error')
        return
      }
    }

    setSubmitting(true)
    try {
      if (surveyType === 'standard') {
        await api.admin.createSurvey({
          surveyTitle: surveyTitle.trim(),
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          locationId: selectedLocationId || undefined,
          sessionId: selectedSessionId || undefined,
          questions: questions.map(q => ({
            question: q.text.trim(),
            options: q.options.filter(o => o.trim()),
          })),
        })
      } else {
        await api.admin.createPairwiseSurvey({
          surveyTitle: surveyTitle.trim(),
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          locationId: selectedLocationId || undefined,
          sessionId: selectedSessionId || undefined,
          items: items.filter(i => i.trim()),
          comparisonQuestion: comparisonQuestion.trim() || undefined,
        })
      }
      toast?.(t('surveyCreated'), 'success')
      setCreateVisible(false)
      resetForm()
      fetchSurveys()
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setSubmitting(false)
    }
  }, [surveyType, surveyTitle, startTime, endTime, selectedLocationId, selectedSessionId, questions, items, comparisonQuestion, fetchSurveys, resetForm, t, toast])

  return {
    // Modal
    createVisible, setCreateVisible,
    openCreateForm,
    // Form fields
    surveyType, setSurveyType,
    surveyTitle, setSurveyTitle,
    startTime, setStartTime,
    endTime, setEndTime,
    submitting,
    // Standard questions
    questions,
    addQuestion, removeQuestion, updateQuestion,
    addOption, removeOption, updateOption,
    // Pairwise items
    items, comparisonQuestion, setComparisonQuestion,
    addItem, removeItem, updateItem,
    // Location/session pickers
    selectedLocationId, setSelectedLocationId,
    selectedSessionId, setSelectedSessionId,
    locationPickerVisible, setLocationPickerVisible,
    sessionPickerVisible, setSessionPickerVisible,
    allowableLocations,
    allowableSessions,
    // Actions
    resetForm, handleCreate,
  }
}
