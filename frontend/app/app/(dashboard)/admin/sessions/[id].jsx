import { StyleSheet, View, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Platform, Alert } from 'react-native'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../../hooks/useThemeColors'
import { SemanticColors } from '../../../../constants/Colors'
import { useUser } from '../../../../hooks/useUser'
import { hasRole, ROLE_LABEL_KEYS, canManageRoleAssignment } from '../../../../lib/roles'
import { sessionsApiWrapper } from '../../../../lib/api'
import { STAGE_TO_ROUND_TYPE } from '../../../../constants/Sessions'
import useAdminSessions, { getNextStage } from '../../../../hooks/useAdminSessions'
import useRoleAssignment from '../../../../hooks/useRoleAssignment'
import ThemedText from '../../../../components/ThemedText'
import Header from '../../../../components/Header'
import LocationSessionBadge from '../../../../components/LocationSessionBadge'
import UserCard from '../../../../components/UserCard'
import BottomDrawerModal from '../../../../components/BottomDrawerModal'
import LocationPicker from '../../../../components/LocationPicker'
import { useToast } from '../../../../components/Toast'

const SESSION_SCOPED_ROLES = ['facilitator', 'expert', 'liaison', 'assistant_moderator']

const VR_STATUS_ORDER = ['proposals_open', 'finalization_open', 'proposals_closed', 'voting_open', 'voting_closed']
const VR_STATUS_INDEX = Object.fromEntries(VR_STATUS_ORDER.map((s, i) => [s, i]))

// Stages where voting round controls should appear
const VR_CREATION_STAGES = new Set(['proposal_qualify', 'opinion_proposals'])

const STAGE_ORDER = [
  'proposal_issue', 'proposal_qualify', 'proposal_stakeholders',
  'opinion_discussion', 'opinion_curation', 'opinion_proposals',
  'reflection', 'consensus',
]
const STAGE_INDEX = Object.fromEntries(STAGE_ORDER.map((s, i) => [s, i]))

const PHASES = [
  { key: 'proposal', stages: ['proposal_issue', 'proposal_qualify', 'proposal_stakeholders'] },
  { key: 'opinion', stages: ['opinion_discussion', 'opinion_curation', 'opinion_proposals'] },
  { key: 'reflection', stages: ['reflection'] },
  { key: 'consensus', stages: ['consensus'] },
]

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams()
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation('common')
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { user } = useUser()
  const toast = useToast()

  const canManage = useMemo(() => hasRole(user, 'facilitator'), [user])

  const mgmt = useAdminSessions()

  // --- Local state for this session ---
  const [session, setSession] = useState(null)
  const [roles, setRoles] = useState([])
  const [rolesLoading, setRolesLoading] = useState(true)
  const [labelSurveys, setLabelSurveys] = useState({ proposal: null, opinion: null })
  const [votingRounds, setVotingRounds] = useState({})
  const [vrLoading, setVrLoading] = useState(false)

  // --- Load session data ---
  useEffect(() => {
    mgmt.fetchSessions()
  }, [mgmt.fetchSessions])

  // Find the current session from the list
  useEffect(() => {
    if (mgmt.sessions.length > 0 && id) {
      const found = mgmt.sessions.find(s => s.id === id)
      if (found) setSession(found)
    }
  }, [mgmt.sessions, id])

  // Fetch roles for this session
  const fetchRoles = useCallback(async () => {
    if (!id) return
    setRolesLoading(true)
    const data = await mgmt.fetchSessionRoles(id)
    setRoles(data)
    setRolesLoading(false)
  }, [id, mgmt.fetchSessionRoles])

  useEffect(() => { fetchRoles() }, [fetchRoles])

  // Get label surveys from shared state (per-phase)
  useEffect(() => {
    if (id && mgmt.sessionLabelSurveys[id] !== undefined) {
      setLabelSurveys(mgmt.sessionLabelSurveys[id] || { proposal: null, opinion: null })
    }
  }, [id, mgmt.sessionLabelSurveys])

  // --- Voting rounds ---
  const fetchVotingRounds = useCallback(async () => {
    if (!id) return
    setVrLoading(true)
    try {
      const [issueRound, policyRound] = await Promise.all([
        sessionsApiWrapper.getVotingRound(id, { roundType: 'issue_selection' }).catch(() => null),
        sessionsApiWrapper.getVotingRound(id, { roundType: 'policy_selection' }).catch(() => null),
      ])
      setVotingRounds({ issue_selection: issueRound, policy_selection: policyRound })
    } catch {
      // swallow — rounds may not exist
    }
    setVrLoading(false)
  }, [id])

  useEffect(() => {
    if (session) fetchVotingRounds()
  }, [session, fetchVotingRounds])

  const handleCreateVotingRound = useCallback((sessionId) => {
    Alert.alert(
      tc('startVotingRound'),
      tc('startVotingRoundConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: tc('confirm'),
          onPress: async () => {
            try {
              await sessionsApiWrapper.createVotingRound(sessionId)
              fetchVotingRounds()
            } catch (e) {
              Alert.alert(t('error'), e?.message || tc('failedSubmit'))
            }
          },
        },
      ]
    )
  }, [fetchVotingRounds, t, tc])

  const handleAdvanceVotingRound = useCallback((sessionId) => {
    Alert.alert(
      tc('advanceVotingRound'),
      '',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: tc('confirm'),
          onPress: async () => {
            try {
              await sessionsApiWrapper.advanceVotingRound(sessionId)
              fetchVotingRounds()
            } catch (e) {
              Alert.alert(t('error'), e?.message || tc('failedSubmit'))
            }
          },
        },
      ]
    )
  }, [fetchVotingRounds, t, tc])

  // --- Role assignment ---
  const roleAssign = useRoleAssignment({
    user,
    locations: mgmt.locations,
    allSessions: mgmt.sessions,
    fetchRoles,
  })

  const handleOpenAssign = useCallback(() => {
    if (session?.locationId) {
      roleAssign.openAssignForSession(session.locationId, session.id)
    } else {
      roleAssign.openAssignAtLocation(null)
    }
  }, [session, roleAssign])

  // --- Stage advance ---
  const handleAdvance = useCallback(async () => {
    if (!session) return
    const next = await mgmt.handleAdvanceStage(session)
    if (next) {
      setSession(prev => prev ? { ...prev, stage: next } : null)
    }
  }, [session, mgmt.handleAdvanceStage])

  if (mgmt.loading || !session) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  const currentIdx = STAGE_INDEX[session.stage] ?? 0
  const nextStage = getNextStage(session.stage)

  const getStageDisplay = (stage) => {
    if (!stage) return ''
    const key = `stage${stage.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('')}`
    return tc(key, { defaultValue: stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) })
  }

  const getStageDesc = (stage) => {
    const key = `stageDesc${stage.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('')}`
    return tc(key, { defaultValue: '' })
  }

  const getPhaseDisplay = (phaseKey) => {
    const key = `phase${phaseKey[0].toUpperCase() + phaseKey.slice(1)}`
    return tc(key, { defaultValue: phaseKey })
  }

  const getStageStatus = (stage) => {
    const idx = STAGE_INDEX[stage]
    if (idx < currentIdx) return 'completed'
    if (idx === currentIdx) return 'current'
    return 'upcoming'
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Session header */}
        <View style={styles.headerSection}>
          <View style={styles.cardTopRow}>
            <LocationSessionBadge
              location={session.locationCode ? { code: session.locationCode } : null}
              session={{ label: session.label }}
              size="lg"
            />
            <View style={[styles.methodBadge, session.proposalMethod === 'admin_provided' ? styles.methodBadgeAdmin : styles.methodBadgeCommunity]}>
              <ThemedText variant="badge" color="inverse" style={styles.methodBadgeText}>
                {session.proposalMethod === 'admin_provided' ? t('proposalMethodAdminProvided') : t('proposalMethodUserDriven')}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Vertical Stage Timeline */}
        <View style={styles.timelineContainer}>
          {PHASES.map((phase, phaseIdx) => {
            const phaseStatuses = phase.stages.map(getStageStatus)
            const phaseAllUpcoming = phaseStatuses.every(s => s === 'upcoming')
            const phaseHasCurrent = phaseStatuses.includes('current')

            return (
              <View key={phase.key} style={styles.phaseGroup}>
                {/* Stage (phase) header */}
                <View style={styles.phaseHeader}>
                  <ThemedText
                    variant="label"
                    color={phaseAllUpcoming ? 'placeholder' : phaseHasCurrent ? 'primary' : 'secondary'}
                    style={styles.phaseLabel}
                  >
                    {t('sessionStage')}: {getPhaseDisplay(phase.key)}
                  </ThemedText>
                </View>

                {/* Substages */}
                {phase.stages.map((stage, stageIdx) => {
                  const status = getStageStatus(stage)
                  const isLast = phaseIdx === PHASES.length - 1 && stageIdx === phase.stages.length - 1

                  return (
                    <View
                      key={stage}
                      style={[
                        styles.stageRow,
                        status === 'completed' && styles.stageRowCompleted,
                        status === 'current' && styles.stageRowCurrent,
                        status === 'upcoming' && styles.stageRowUpcoming,
                      ]}
                      accessibilityLabel={`${getStageDisplay(stage)}, ${t(status === 'completed' ? 'stageCompleted' : status === 'current' ? 'stageCurrent' : 'stageUpcoming')}`}
                    >
                      <View style={styles.stageIconColumn}>
                        <Ionicons
                          name={
                            status === 'completed' ? 'checkmark-circle' :
                            status === 'current' ? 'radio-button-on' :
                            'ellipse-outline'
                          }
                          size={20}
                          color={
                            status === 'completed' ? SemanticColors.success :
                            status === 'current' ? colors.primary :
                            colors.placeholderText
                          }
                        />
                      </View>
                      <View style={styles.stageContent}>
                        <ThemedText
                          variant="bodySmall"
                          color={status === 'upcoming' ? 'placeholder' : 'dark'}
                          style={[styles.stageName, status === 'current' && styles.stageNameCurrent]}
                        >
                          {getStageDisplay(stage)}
                        </ThemedText>
                        <ThemedText
                          variant="caption"
                          color={status === 'upcoming' ? 'placeholder' : 'secondary'}
                          style={styles.stageDesc}
                        >
                          {getStageDesc(stage)}
                        </ThemedText>

                        {/* Voting round sub-section for creation stages — only when stage is reached */}
                        {VR_CREATION_STAGES.has(stage) && status !== 'upcoming' && (() => {
                          const roundType = STAGE_TO_ROUND_TYPE[stage]
                          const round = votingRounds[roundType] || null
                          const vrStatus = round?.status
                          const vrIdx = vrStatus ? VR_STATUS_INDEX[vrStatus] : -1
                          const isTerminal = vrStatus === 'voting_closed'

                          const VR_STATUS_LABELS = {
                            proposals_open: tc('vrProposalsOpen'),
                            finalization_open: tc('vrFinalizationOpen'),
                            proposals_closed: tc('vrProposalsClosed'),
                            voting_open: tc('vrVotingOpen'),
                            voting_closed: tc('vrVotingClosed'),
                          }

                          const ROUND_TYPE_LABELS = {
                            issue_selection: t('roundTypeIssueSelection'),
                            policy_selection: t('roundTypePolicySelection'),
                          }

                          return (
                            <View style={styles.vrSection}>
                              <ThemedText variant="caption" color="secondary" style={styles.vrLabel}>
                                {t('votingRound')} — {ROUND_TYPE_LABELS[roundType] || roundType}
                              </ThemedText>

                              {round ? (
                                <>
                                  {/* 5-dot progress indicator */}
                                  <View
                                    style={styles.vrProgressRow}
                                    accessibilityRole="text"
                                    accessibilityLabel={t('votingRoundStatusA11y', {
                                      status: VR_STATUS_LABELS[vrStatus] || vrStatus,
                                      current: vrIdx + 1,
                                      total: VR_STATUS_ORDER.length,
                                    })}
                                  >
                                    {VR_STATUS_ORDER.map((s, i) => {
                                      const isCompleted = isTerminal || i < vrIdx
                                      const isCurrent = !isTerminal && i === vrIdx
                                      return (
                                        <View key={s} style={{ flexDirection: 'row', alignItems: 'center', flexGrow: i < VR_STATUS_ORDER.length - 1 ? 1 : 0 }}>
                                          <View style={[
                                            styles.vrDot,
                                            isCompleted && styles.vrDotCompleted,
                                            isCurrent && styles.vrDotCurrent,
                                            !isCompleted && !isCurrent && styles.vrDotUpcoming,
                                          ]}>
                                            {isCompleted && (
                                              <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                                            )}
                                          </View>
                                          {i < VR_STATUS_ORDER.length - 1 && (
                                            <View style={[
                                              styles.vrLine,
                                              isTerminal || i < vrIdx ? styles.vrLineCompleted : styles.vrLineUpcoming,
                                            ]} />
                                          )}
                                        </View>
                                      )
                                    })}
                                  </View>
                                  <ThemedText variant="caption" color="dark" style={styles.vrStatusLabel}>
                                    {VR_STATUS_LABELS[vrStatus] || vrStatus}
                                  </ThemedText>

                                  {/* Advance voting round button */}
                                  {canManage && vrStatus !== 'voting_closed' && (
                                    <TouchableOpacity
                                      style={styles.vrActionButton}
                                      onPress={() => handleAdvanceVotingRound(id)}
                                      accessibilityRole="button"
                                      accessibilityLabel={t('advanceVotingRoundA11y')}
                                    >
                                      <Ionicons name="play-forward" size={16} color="#FFFFFF" />
                                      <ThemedText variant="caption" color="inverse" style={styles.advanceButtonText}>
                                        {tc('advanceVotingRound')}
                                      </ThemedText>
                                    </TouchableOpacity>
                                  )}
                                </>
                              ) : status === 'current' && canManage ? (
                                <TouchableOpacity
                                  style={styles.vrActionButton}
                                  onPress={() => handleCreateVotingRound(id)}
                                  accessibilityRole="button"
                                  accessibilityLabel={t('createVotingRoundA11y')}
                                >
                                  <Ionicons name="play" size={16} color="#FFFFFF" />
                                  <ThemedText variant="caption" color="inverse" style={styles.advanceButtonText}>
                                    {tc('startVotingRound')}
                                  </ThemedText>
                                </TouchableOpacity>
                              ) : (
                                <ThemedText variant="caption" color="placeholder">
                                  {t('noVotingRound')}
                                </ThemedText>
                              )}
                            </View>
                          )
                        })()}

                        {/* Advance button — at bottom of current stage */}
                        {status === 'current' && canManage && nextStage && (
                          <TouchableOpacity
                            style={styles.advanceButton}
                            onPress={handleAdvance}
                            accessibilityRole="button"
                            accessibilityLabel={t('advanceStageTo', { stage: getStageDisplay(nextStage) })}
                          >
                            <Ionicons name="arrow-forward-circle" size={18} color="#FFFFFF" />
                            <ThemedText variant="caption" color="inverse" style={styles.advanceButtonText}>
                              {t('advanceStageTo', { stage: getStageDisplay(nextStage) })}
                            </ThemedText>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )
                })}
              </View>
            )
          })}
        </View>

        {/* User Management Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <ThemedText variant="label" color="secondary" style={styles.cardTitle}>{t('userManagement')}</ThemedText>
            {canManage && (
              <TouchableOpacity
                style={styles.assignButton}
                onPress={handleOpenAssign}
                accessibilityRole="button"
                accessibilityLabel={t('assignSessionRoleA11y')}
              >
                <Ionicons name="person-add" size={14} color="#FFFFFF" />
                <ThemedText variant="caption" color="inverse">{t('assignSessionRole')}</ThemedText>
              </TouchableOpacity>
            )}
          </View>
          {rolesLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : roles.length === 0 ? (
            <ThemedText variant="bodySmall" color="secondary">{t('noRolesAssigned')}</ThemedText>
          ) : (
            <View style={styles.rolesList}>
              {SESSION_SCOPED_ROLES.map(roleType => {
                const rolesOfType = roles.filter(r => r.role === roleType)
                if (rolesOfType.length === 0) return null
                return (
                  <View key={roleType} style={styles.roleGroup}>
                    <ThemedText variant="caption" color="secondary" style={styles.roleGroupLabel}>
                      {t(ROLE_LABEL_KEYS[roleType] || roleType)}
                    </ThemedText>
                    {rolesOfType.map((r) => {
                      const canRemove = canManage && canManageRoleAssignment(user, r, mgmt.locations)
                      return (
                        <View key={r.id || `${r.userId}-${r.role}`} style={styles.roleUserRow}>
                          <View style={styles.roleUserInfo}>
                            <UserCard user={r.user || { id: r.userId, username: r.username, displayName: r.displayName }} avatarSize={28} nameVariant="bodySmall" />
                          </View>
                          {canRemove && (
                            <TouchableOpacity
                              style={styles.removeButton}
                              onPress={() => roleAssign.handleRemoveRole(r)}
                              accessibilityRole="button"
                              accessibilityLabel={t('removeRoleA11y')}
                            >
                              <Ionicons name="close-circle" size={18} color={SemanticColors.warning} />
                            </TouchableOpacity>
                          )}
                        </View>
                      )
                    })}
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* Survey Management Card */}
        <View style={styles.card}>
          <ThemedText variant="label" color="secondary" style={styles.cardTitle}>{t('surveyManagement')}</ThemedText>

          {/* Label Surveys (per phase) */}
          {['proposal', 'opinion'].map((phase) => {
            const survey = labelSurveys[phase]
            const isFormOpen = mgmt.inlineLabelPhase === phase
            const phaseLabel = t(`labelSurveyPhase_${phase}`)
            return (
              <View key={phase} style={styles.cardSection}>
                <ThemedText variant="caption" color="secondary" style={styles.subSectionLabel}>
                  {t('labelSurvey')} — {phaseLabel}
                </ThemedText>
                {survey ? (
                  <View style={styles.labelSurveyInfo}>
                    <ThemedText variant="bodySmall" color="dark">{survey.surveyTitle || t('labelSurvey')}</ThemedText>
                    <ThemedText variant="caption" color="secondary">
                      {(survey.items || []).length} {t('surveyItems').toLowerCase()}
                    </ThemedText>
                    {canManage && (
                      <TouchableOpacity
                        style={styles.deleteLabelButton}
                        onPress={() => mgmt.handleDeleteLabelSurvey(session.id, survey.id, phase)}
                        accessibilityRole="button"
                        accessibilityLabel={t('deleteLabelSurveyPhaseA11y', { phase: phaseLabel })}
                      >
                        <Ionicons name="trash-outline" size={14} color="#FFFFFF" />
                        <ThemedText variant="caption" color="inverse">{t('deleteLabelSurvey')}</ThemedText>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : isFormOpen ? (
                  <View style={styles.inlineLabelForm}>
                    {mgmt.inlineLabelItems.map((item, i) => (
                      <View key={i} style={styles.optionRow}>
                        <TextInput
                          style={[styles.input, styles.optionInput]}
                          value={item}
                          onChangeText={(text) => {
                            const updated = [...mgmt.inlineLabelItems]
                            updated[i] = text
                            mgmt.setInlineLabelItems(updated)
                          }}
                          placeholder={t('itemPlaceholder', { number: i + 1 })}
                          placeholderTextColor={colors.placeholderText}
                          maxFontSizeMultiplier={1.5}
                          accessibilityLabel={t('itemA11y', { number: i + 1 })}
                        />
                        {mgmt.inlineLabelItems.length > 2 && (
                          <TouchableOpacity
                            onPress={() => mgmt.setInlineLabelItems(prev => prev.filter((_, j) => j !== i))}
                            accessibilityRole="button"
                            accessibilityLabel={t('removeItemA11y', { number: i + 1 })}
                          >
                            <Ionicons name="close-circle" size={18} color={SemanticColors.warning} />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                    {mgmt.inlineLabelItems.length < 20 && (
                      <TouchableOpacity
                        style={styles.addRow}
                        onPress={() => mgmt.setInlineLabelItems(prev => [...prev, ''])}
                        accessibilityRole="button"
                        accessibilityLabel={t('addItemA11y')}
                      >
                        <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                        <ThemedText variant="caption" color="primary">{t('addItem')}</ThemedText>
                      </TouchableOpacity>
                    )}
                    <TextInput
                      style={styles.input}
                      value={mgmt.inlineLabelComparison}
                      onChangeText={mgmt.setInlineLabelComparison}
                      placeholder={t('comparisonQuestionPlaceholder')}
                      placeholderTextColor={colors.placeholderText}
                      maxFontSizeMultiplier={1.5}
                      accessibilityLabel={t('comparisonQuestionA11y')}
                    />
                    <View style={styles.inlineLabelActions}>
                      <TouchableOpacity
                        style={styles.cancelChip}
                        onPress={mgmt.resetInlineLabelForm}
                        accessibilityRole="button"
                        accessibilityLabel={t('cancel')}
                      >
                        <ThemedText variant="caption" color="dark">{t('cancel')}</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.createChip, { opacity: mgmt.inlineLabelCreating ? 0.5 : 1 }]}
                        onPress={() => mgmt.handleCreateLabelSurvey(session.id, phase)}
                        disabled={mgmt.inlineLabelCreating}
                        accessibilityRole="button"
                        accessibilityLabel={t('createLabelSurveyPhaseA11y', { phase: phaseLabel })}
                      >
                        {mgmt.inlineLabelCreating ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <ThemedText variant="caption" color="inverse">{t('createLabelSurvey')}</ThemedText>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : canManage ? (
                  <TouchableOpacity
                    style={styles.createLabelButton}
                    onPress={() => { mgmt.resetInlineLabelForm(); mgmt.setInlineLabelPhase(phase) }}
                    accessibilityRole="button"
                    accessibilityLabel={t('createLabelSurveyPhaseA11y', { phase: phaseLabel })}
                  >
                    <Ionicons name="add" size={16} color={colors.primary} />
                    <ThemedText variant="caption" color="primary">{t('createLabelSurvey')}</ThemedText>
                  </TouchableOpacity>
                ) : (
                  <ThemedText variant="bodySmall" color="secondary">{t('noLabelSurvey')}</ThemedText>
                )}
              </View>
            )
          })}

          {/* Manage Surveys link */}
          <TouchableOpacity
            style={styles.manageSurveysButton}
            onPress={() => router.push(`/admin/surveys?sessionId=${session.id}&sessionName=${encodeURIComponent(session.label)}`)}
            accessibilityRole="button"
            accessibilityLabel={t('manageSurveysForSessionA11y')}
          >
            <Ionicons name="clipboard-outline" size={18} color={colors.primary} />
            <ThemedText variant="button" color="primary" style={styles.manageSurveysText}>{t('manageSurveysForSession')}</ThemedText>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Assign Role Modal */}
      <BottomDrawerModal
        visible={roleAssign.assignModalVisible}
        onClose={() => { roleAssign.setAssignModalVisible(false); roleAssign.resetAssignForm() }}
        title={t('assignRole')}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
          {/* User search */}
          <ThemedText variant="label" color="secondary" style={styles.fieldLabel}>{t('selectUser')}</ThemedText>
          {roleAssign.selectedUser ? (
            <View style={styles.selectedChip}>
              <ThemedText variant="button" color="dark">{roleAssign.selectedUser.displayName} (@{roleAssign.selectedUser.username})</ThemedText>
              <TouchableOpacity onPress={() => roleAssign.setSelectedUser(null)} accessibilityRole="button" accessibilityLabel={t('cancel')}>
                <Ionicons name="close" size={18} color={colors.secondaryText} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.modalInput}
                value={roleAssign.searchQuery}
                onChangeText={roleAssign.setSearchQuery}
                placeholder={t('searchUsersPlaceholder')}
                placeholderTextColor={colors.placeholderText}
                maxFontSizeMultiplier={1.5}
                accessibilityLabel={t('searchUsersA11y')}
              />
              {roleAssign.searching && <ActivityIndicator size="small" color={colors.primary} />}
              {roleAssign.searchResults.map(u => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.searchResultItem}
                  onPress={() => { roleAssign.setSelectedUser(u); roleAssign.setSearchQuery(''); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('userSearchResultA11y', { displayName: u.displayName, username: u.username })}
                >
                  <UserCard user={u} />
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* Role picker */}
          <ThemedText variant="label" color="secondary" style={styles.fieldLabel}>{t('selectRole')}</ThemedText>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => roleAssign.setRolePickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('selectRole')}
          >
            <Ionicons name="shield-outline" size={16} color={colors.secondaryText} />
            <ThemedText variant="body" color="dark" style={styles.pickerButtonText}>
              {roleAssign.selectedRole ? t(ROLE_LABEL_KEYS[roleAssign.selectedRole]) : t('selectRole')}
            </ThemedText>
            <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
          </TouchableOpacity>

          {/* Location picker */}
          <ThemedText variant="label" color="secondary" style={styles.fieldLabel}>{t('selectLocation')}</ThemedText>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => roleAssign.setLocationPickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('selectLocation')}
          >
            <Ionicons name="location-outline" size={16} color={colors.secondaryText} />
            <ThemedText variant="body" color="dark" style={styles.pickerButtonText}>
              {roleAssign.selectedLocation
                ? mgmt.locations.find(l => l.id === roleAssign.selectedLocation)?.name || t('selectLocation')
                : t('selectLocation')}
            </ThemedText>
            <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
          </TouchableOpacity>

          {/* Session picker */}
          {roleAssign.showSessionPicker && (
            <>
              <ThemedText variant="label" color="secondary" style={styles.fieldLabel}>{t('selectSession')}</ThemedText>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => roleAssign.setSessionPickerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('selectSession')}
              >
                <Ionicons name="pricetag-outline" size={16} color={colors.secondaryText} />
                <ThemedText variant="body" color="dark" style={styles.pickerButtonText}>
                  {roleAssign.selectedSession
                    ? roleAssign.assignableSessions.find(s => s.id === roleAssign.selectedSession)?.label || t('selectSession')
                    : t('selectSession')}
                </ThemedText>
                <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
              </TouchableOpacity>
            </>
          )}

          {/* Reason */}
          <TextInput
            style={styles.modalInput}
            value={roleAssign.assignReason}
            onChangeText={roleAssign.setAssignReason}
            placeholder={t('reasonPlaceholder')}
            placeholderTextColor={colors.placeholderText}
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('reasonPlaceholder')}
          />

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitButton, { opacity: roleAssign.assignSubmitting ? 0.5 : 1 }]}
            onPress={roleAssign.handleAssignRole}
            disabled={roleAssign.assignSubmitting}
            accessibilityRole="button"
            accessibilityLabel={t('submit')}
          >
            {roleAssign.assignSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <ThemedText variant="button" color="inverse">{t('submit')}</ThemedText>
            )}
          </TouchableOpacity>
        </ScrollView>
      </BottomDrawerModal>

      {/* Role Picker Modal */}
      <BottomDrawerModal
        visible={roleAssign.rolePickerVisible}
        onClose={() => roleAssign.setRolePickerVisible(false)}
        title={t('selectRole')}
      >
        <ScrollView contentContainerStyle={styles.pickerList}>
          {roleAssign.assignableRoles.map(r => {
            const selected = roleAssign.selectedRole === r
            return (
              <TouchableOpacity
                key={r}
                style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                onPress={() => { roleAssign.setSelectedRole(r); roleAssign.setRolePickerVisible(false) }}
                accessibilityRole="button"
                accessibilityLabel={t(ROLE_LABEL_KEYS[r])}
                accessibilityState={{ selected }}
              >
                <ThemedText variant="body" color={selected ? 'primary' : 'dark'}>
                  {t(ROLE_LABEL_KEYS[r])}
                </ThemedText>
                {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </BottomDrawerModal>

      {/* Location Picker Modal */}
      <LocationPicker
        visible={roleAssign.locationPickerVisible}
        onClose={() => roleAssign.setLocationPickerVisible(false)}
        allLocations={roleAssign.allowableLocationsForPicker}
        currentLocationId={roleAssign.selectedLocation}
        onSelect={(locId) => { roleAssign.setSelectedLocation(locId); roleAssign.setLocationPickerVisible(false) }}
      />

      {/* Session Picker Modal */}
      <BottomDrawerModal
        visible={roleAssign.sessionPickerVisible}
        onClose={() => roleAssign.setSessionPickerVisible(false)}
        title={t('selectSession')}
      >
        <ScrollView contentContainerStyle={styles.pickerList}>
          {roleAssign.assignableSessions.map(c => {
            const selected = roleAssign.selectedSession === c.id
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                onPress={() => { roleAssign.setSelectedSession(c.id); roleAssign.setSessionPickerVisible(false) }}
                accessibilityRole="button"
                accessibilityLabel={c.label}
                accessibilityState={{ selected }}
              >
                <ThemedText variant="body" color={selected ? 'primary' : 'dark'}>
                  {c.label}
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 20,
  },

  // Header section
  headerSection: {
    gap: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  methodBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  methodBadgeCommunity: {
    backgroundColor: colors.primarySurface,
  },
  methodBadgeAdmin: {
    backgroundColor: SemanticColors.pending,
  },
  methodBadgeText: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Stage timeline
  timelineContainer: {
    gap: 4,
  },
  phaseGroup: {
    gap: 0,
  },
  phaseHeader: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  phaseLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
  },
  stageRow: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 12,
    marginBottom: 4,
  },
  stageRowCompleted: {
    backgroundColor: colors.cardBackground,
  },
  stageRowCurrent: {
    backgroundColor: colors.cardBackground,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  stageRowUpcoming: {
    backgroundColor: colors.uiBackground,
  },
  stageIconColumn: {
    width: 28,
    paddingTop: 1,
    alignItems: 'center',
  },
  stageContent: {
    flexGrow: 1,
    flexShrink: 1,
    gap: 4,
  },
  stageName: {
    fontWeight: '600',
  },
  stageNameCurrent: {
    fontWeight: '700',
  },
  stageDesc: {
    lineHeight: 18,
  },
  advanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primarySurface,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 8,
  },
  advanceButtonText: {
    fontWeight: '600',
  },

  // Voting round sub-section
  vrSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  vrLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  vrProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  vrDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vrDotCompleted: {
    backgroundColor: SemanticColors.success,
  },
  vrDotCurrent: {
    backgroundColor: colors.primary,
  },
  vrDotUpcoming: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.placeholderText,
  },
  vrLine: {
    flexGrow: 1,
    height: 2,
  },
  vrLineCompleted: {
    backgroundColor: SemanticColors.success,
  },
  vrLineUpcoming: {
    backgroundColor: colors.border,
  },
  vrStatusLabel: {
    fontWeight: '600',
    textAlign: 'center',
  },
  vrActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primarySurface,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 4,
  },

  // Cards
  card: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardSection: {
    gap: 8,
  },
  subSectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },

  // Assign role button
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySurface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  // Roles list
  rolesList: {
    gap: 8,
  },
  roleGroup: {
    gap: 4,
  },
  roleGroupLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  roleUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingVertical: 4,
  },
  roleUserInfo: {
    flexGrow: 1,
    flexShrink: 1,
  },
  removeButton: {
    padding: 4,
  },

  // Label survey
  labelSurveyInfo: {
    backgroundColor: colors.uiBackground,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  deleteLabelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: SemanticColors.warning,
    paddingVertical: 8,
    borderRadius: 25,
    marginTop: 4,
  },
  inlineLabelForm: {
    backgroundColor: colors.uiBackground,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  inlineLabelActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  cancelChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.buttonDefault,
  },
  createChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.primarySurface,
  },
  createLabelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
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

  // Manage surveys link
  manageSurveysButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 25,
  },
  manageSurveysText: {
    flexGrow: 1,
    flexShrink: 1,
  },

  // Modals
  modalContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  fieldLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  modalInput: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
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
  pickerList: {
    padding: 16,
    paddingBottom: 40,
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  pickerRowSelected: {
    backgroundColor: colors.primaryLight + '20',
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  submitButton: {
    backgroundColor: colors.primarySurface,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 8,
  },
})
