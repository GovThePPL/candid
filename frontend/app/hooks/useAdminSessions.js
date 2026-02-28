/**
 * Hook for managing sessions from the dedicated admin sessions page.
 *
 * Handles: fetching all sessions with admin context, creating sessions
 * with proposal method selection, advancing session stages, and
 * managing label surveys.
 */
import { useState, useCallback, useEffect } from 'react'
import { Platform, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import api, { translateError } from '../lib/api'
import { useToast } from '../components/Toast'

const STAGE_ORDER = [
  'proposal_issue',
  'proposal_qualify',
  'proposal_stakeholders',
  'opinion_discussion',
  'reflection_curation',
  'reflection_proposals',
  'consensus',
]

const STAGE_INDEX = Object.fromEntries(STAGE_ORDER.map((s, i) => [s, i]))

export function getNextStage(current) {
  const idx = STAGE_INDEX[current]
  if (idx == null || idx >= STAGE_ORDER.length - 1) return null
  return STAGE_ORDER[idx + 1]
}

export default function useAdminSessions() {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation('common')
  const toast = useToast()

  // --- Sessions list ---
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  // --- Locations (for pickers) ---
  const [locations, setLocations] = useState([])

  // --- Label survey state (per-session) ---
  const [sessionLabelSurveys, setSessionLabelSurveys] = useState({})

  // --- Create session form ---
  const [createVisible, setCreateVisible] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newLocationId, setNewLocationId] = useState(null)
  const [newProposalMethod, setNewProposalMethod] = useState('user_driven')
  const [proposals, setProposals] = useState([])
  const [createLabelSurvey, setCreateLabelSurvey] = useState(true)
  const [labelSurveyItems, setLabelSurveyItems] = useState(['', ''])
  const [labelSurveyComparisonQuestion, setLabelSurveyComparisonQuestion] = useState('')
  const [creating, setCreating] = useState(false)

  // Sync proposals array when proposal method changes
  useEffect(() => {
    if (newProposalMethod === 'direct_proposal') {
      setProposals(prev => prev.length === 1 ? prev : [{ title: '', body: '' }])
    } else if (newProposalMethod === 'admin_provided') {
      setProposals(prev => prev.length >= 2 ? prev : [{ title: '', body: '' }, { title: '', body: '' }])
    } else {
      setProposals([])
    }
  }, [newProposalMethod])

  // --- Rename session ---
  const [renaming, setRenaming] = useState(false)

  // --- Inline label survey creation (detail page) ---
  const [inlineLabelItems, setInlineLabelItems] = useState(['', ''])
  const [inlineLabelComparison, setInlineLabelComparison] = useState('')
  const [inlineLabelCreating, setInlineLabelCreating] = useState(false)
  const [inlineLabelPhase, setInlineLabelPhase] = useState(null) // which phase's create form is open

  // --- Fetch sessions + locations ---
  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const [sessData, locData] = await Promise.all([
        api.admin.getAdminSessions(),
        api.users.getAllLocations(),
      ])
      const sessList = Array.isArray(sessData) ? sessData : []
      setSessions(sessList)
      setLocations(locData || [])

      // Fetch label surveys for all sessions (per-phase)
      const surveyMap = {}
      await Promise.all(sessList.map(async (sess) => {
        try {
          const result = await api.admin.getSessionLabelSurvey(sess.id)
          surveyMap[sess.id] = result?.labelSurveys || { proposal: null, opinion: null, reflection: null }
        } catch {
          surveyMap[sess.id] = { proposal: null, opinion: null, reflection: null }
        }
      }))
      setSessionLabelSurveys(surveyMap)
    } catch (err) {
      toast?.(translateError(err.message, t) || t('loadError'), 'error')
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  // --- Fetch roles for a specific session ---
  const fetchSessionRoles = useCallback(async (sessionId) => {
    try {
      const data = await api.admin.listRoles({ sessionId })
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }, [])

  // --- Fetch label surveys for a single session ---
  const fetchSessionLabelSurvey = useCallback(async (sessionId) => {
    try {
      const result = await api.admin.getSessionLabelSurvey(sessionId)
      const surveys = result?.labelSurveys || { proposal: null, opinion: null, reflection: null }
      setSessionLabelSurveys(prev => ({ ...prev, [sessionId]: surveys }))
      return surveys
    } catch {
      const empty = { proposal: null, opinion: null, reflection: null }
      setSessionLabelSurveys(prev => ({ ...prev, [sessionId]: empty }))
      return empty
    }
  }, [])

  // --- Create session ---
  const handleCreateSession = useCallback(async () => {
    if (!newLabel.trim()) return

    // Validate proposals for methods that require them
    if (newProposalMethod === 'direct_proposal' || newProposalMethod === 'admin_provided') {
      const hasEmpty = proposals.some(p => !p.title?.trim() || !p.body?.trim())
      if (hasEmpty) {
        toast?.(t('proposalFieldsRequired'), 'error')
        return
      }
    }

    if (createLabelSurvey) {
      const validItems = labelSurveyItems.filter(i => i.trim())
      if (validItems.length < 2) {
        toast?.(t('labelSurveyItemsRequired'), 'error')
        return
      }
    }
    setCreating(true)
    try {
      const opts = {
        locationId: newLocationId,
        proposalMethod: newProposalMethod,
      }
      if (newProposalMethod === 'direct_proposal' || newProposalMethod === 'admin_provided') {
        opts.proposals = proposals.map(p => ({ title: p.title.trim(), body: p.body.trim() }))
      }
      if (createLabelSurvey) {
        opts.createLabelSurvey = true
        opts.labelSurveyItems = labelSurveyItems.filter(i => i.trim())
        if (labelSurveyComparisonQuestion.trim()) {
          opts.labelSurveyComparisonQuestion = labelSurveyComparisonQuestion.trim()
        }
      }
      await api.admin.createSession(newLabel.trim(), null, opts)
      toast?.(t('sessionCreated'), 'success')
      setNewLabel('')
      setNewLocationId(null)
      setNewProposalMethod('user_driven')
      setProposals([])
      setLabelSurveyItems(['', ''])
      setLabelSurveyComparisonQuestion('')
      setCreateLabelSurvey(true)
      setCreateVisible(false)
      fetchSessions()
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setCreating(false)
    }
  }, [newLabel, newLocationId, newProposalMethod, proposals, createLabelSurvey, labelSurveyItems, labelSurveyComparisonQuestion, fetchSessions, t, toast])

  // --- Rename session (standalone) ---
  const handleRenameSession = useCallback(async (sessionId, newLabel) => {
    if (!newLabel?.trim()) return false
    setRenaming(true)
    try {
      await api.sessions.update(sessionId, { label: newLabel.trim() })
      toast?.(t('sessionRenamed'), 'success')
      fetchSessions()
      return true
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
      return false
    } finally {
      setRenaming(false)
    }
  }, [t, toast, fetchSessions])

  // --- Advance stage (with optional label) ---
  const handleAdvanceStage = useCallback(async (session, { label } = {}) => {
    const next = getNextStage(session.stage)
    if (!next) return

    const stageDisplay = tc(
      `stage${next.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('')}`,
      { defaultValue: next.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
    )

    const confirmed = Platform.OS === 'web'
      ? window.confirm(`${t('advanceStageConfirm')}\n${t('advanceStageTo', { stage: stageDisplay })}`)
      : await new Promise(resolve => Alert.alert(
          t('advanceStageConfirm'),
          t('advanceStageTo', { stage: stageDisplay }),
          [
            { text: t('cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('advanceStage'), onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        ))
    if (!confirmed) return

    try {
      const payload = { stage: next }
      if (label?.trim()) payload.label = label.trim()
      await api.sessions.update(session.id, payload)
      toast?.(t('advanceStageTo', { stage: stageDisplay }), 'success')
      fetchSessions()
      return next
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
      return null
    }
  }, [tc, t, toast, fetchSessions])

  // --- Create label survey for existing session (phase-specific) ---
  const handleCreateLabelSurvey = useCallback(async (sessionId, phase) => {
    const validItems = inlineLabelItems.filter(i => i.trim())
    if (validItems.length < 2) {
      toast?.(t('labelSurveyItemsRequired'), 'error')
      return
    }
    setInlineLabelCreating(true)
    try {
      const body = {
        isGroupLabeling: true,
        sessionId,
        items: validItems,
        phase,
      }
      if (inlineLabelComparison.trim()) {
        body.comparisonQuestion = inlineLabelComparison.trim()
      }
      await api.admin.createPairwiseSurvey(body)
      toast?.(t('labelSurveyCreated'), 'success')
      setInlineLabelPhase(null)
      setInlineLabelItems(['', ''])
      setInlineLabelComparison('')
      await fetchSessionLabelSurvey(sessionId)
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setInlineLabelCreating(false)
    }
  }, [inlineLabelItems, inlineLabelComparison, fetchSessionLabelSurvey, t, toast])

  // --- Delete label survey (phase-specific) ---
  const handleDeleteLabelSurvey = useCallback(async (sessionId, surveyId, phase) => {
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
      setSessionLabelSurveys(prev => ({
        ...prev,
        [sessionId]: { ...prev[sessionId], [phase]: null }
      }))
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    }
  }, [t, toast])

  // --- Reset create form ---
  const resetCreateForm = useCallback(() => {
    setNewLabel('')
    setNewLocationId(null)
    setNewProposalMethod('user_driven')
    setProposals([])
    setLabelSurveyItems(['', ''])
    setLabelSurveyComparisonQuestion('')
    setCreateLabelSurvey(true)
  }, [])

  // --- Reset inline label form ---
  const resetInlineLabelForm = useCallback(() => {
    setInlineLabelPhase(null)
    setInlineLabelItems(['', ''])
    setInlineLabelComparison('')
  }, [])

  return {
    // Sessions list
    sessions, loading, locations, sessionLabelSurveys,
    fetchSessions,

    // Create session
    createVisible, setCreateVisible,
    newLabel, setNewLabel,
    newLocationId, setNewLocationId,
    newProposalMethod, setNewProposalMethod,
    proposals, setProposals,
    createLabelSurvey, setCreateLabelSurvey,
    labelSurveyItems, setLabelSurveyItems,
    labelSurveyComparisonQuestion, setLabelSurveyComparisonQuestion,
    creating, handleCreateSession, resetCreateForm,

    // Session data
    fetchSessionRoles,
    fetchSessionLabelSurvey,

    // Stage advance
    handleAdvanceStage,

    // Rename
    renaming, handleRenameSession,

    // Inline label survey
    inlineLabelPhase, setInlineLabelPhase,
    inlineLabelItems, setInlineLabelItems,
    inlineLabelComparison, setInlineLabelComparison,
    inlineLabelCreating,
    handleCreateLabelSurvey, handleDeleteLabelSurvey,
    resetInlineLabelForm,
  }
}
