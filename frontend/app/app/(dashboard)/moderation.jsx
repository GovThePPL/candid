import { StyleSheet, View, TouchableOpacity, ActivityIndicator, ScrollView, TextInput } from 'react-native'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { SemanticColors } from '../../constants/Colors'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../../components/ThemedText'
import Header from '../../components/Header'
import EmptyState from '../../components/EmptyState'
import PositionInfoCard from '../../components/PositionInfoCard'
import ModerationActionModal from '../../components/ModerationActionModal'
import ModerationHistoryModal from '../../components/ModerationHistoryModal'
import BottomDrawerModal from '../../components/BottomDrawerModal'
import Avatar from '../../components/Avatar'
import { useTranslation } from 'react-i18next'
import api, { translateError } from '../../lib/api'

const getActionLabels = (t) => ({
  removed: t('actionRemoveContent'),
  warning: t('actionWarning'),
  temporary_ban: t('actionTemporaryBan'),
  permanent_ban: t('actionPermanentBan'),
})
const getClassLabels = (t) => ({
  submitter: t('classCreator'),
  active_adopter: t('classActiveAdopters'),
  passive_adopter: t('classPassiveAdopters'),
})

function ReportCard({ item, onHistoryPress, onChatPress, colors, styles }) {
  const { t } = useTranslation('moderation')
  const ACTION_LABELS = useMemo(() => getActionLabels(t), [t])
  const CLASS_LABELS = useMemo(() => getClassLabels(t), [t])
  const { data } = item
  const target = data.targetContent

  return (
    <View style={styles.reportCard}>
      {/* Red header with card type + rule */}
      <View style={styles.reportHeader}>
        <View style={styles.headerRow}>
          <View style={styles.headerTypeTag}>
            <Ionicons name="shield" size={28} color="#FFFFFF" />
            <ThemedText variant="badgeLg" color="inverse" style={styles.headerTypeText}>{t('report')}</ThemedText>
          </View>
          <View style={styles.headerRuleContent}>
            <ThemedText variant="buttonSmall" color="inverse" style={styles.reportRuleTitle}>{data.rule?.title || t('ruleViolation')}</ThemedText>
            {data.rule?.text && (
              <ThemedText variant="caption" color="inverse" style={styles.reportRuleText}>{data.rule.text}</ThemedText>
            )}
          </View>
        </View>
      </View>

      {/* White body section */}
      <View style={styles.reportBodyWrapper}>
        <View style={styles.reportBody}>
          {target?.type === 'position' ? (
            <PositionInfoCard
              position={target}
              authorSubtitle="username"
            />
          ) : target?.type === 'chat_log' ? (
            <PositionInfoCard
              position={{
                statement: target.positionStatement,
                creator: target.participants?.[0],
              }}
              authorSubtitle="username"
              label={t('chatLabel', { names: target.participants?.map(p => p?.displayName).filter(Boolean).join(' & ') })}
            />
          ) : (
            <View style={{ padding: 16 }}>
              <ThemedText variant="bodySmall" color="secondary" style={{ fontStyle: 'italic' }}>{t('contentUnavailable')}</ThemedText>
            </View>
          )}
        </View>
      </View>

      {/* White bottom curve over purple */}
      <View style={styles.reportBodyBottomCurve} />

      {/* Purple footer with reporter info */}
      <View style={styles.reportFooter}>
        {onChatPress && target?.type === 'chat_log' && (
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => onChatPress(data.targetId, data.submitter?.id)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('viewChatLogA11y')}
          >
            <Ionicons name="chatbubbles-outline" size={16} color="#FFFFFF" />
            <ThemedText variant="label" color="inverse">{t('viewChatLog')}</ThemedText>
          </TouchableOpacity>
        )}
        {onHistoryPress && (target?.creator || target?.participants) && (() => {
          const historyUser = target.creator
            || target.participants?.find(p => p?.id !== data.submitter?.id)
          return historyUser ? (
            <TouchableOpacity
              style={styles.historyButton}
              onPress={() => onHistoryPress(historyUser)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('viewHistoryA11y')}
            >
              <Ionicons name="time-outline" size={16} color="#FFFFFF" />
              <ThemedText variant="label" color="inverse">{t('userModerationHistory')}</ThemedText>
            </TouchableOpacity>
          ) : null
        })()}
        <View style={styles.reporterRow}>
          <ThemedText variant="badgeLg" style={styles.reportFooterLabel}>{t('reportedBy')}</ThemedText>
          <Avatar user={data.submitter} size="sm" showKudosCount badgePosition="bottom-left" />
          <View style={styles.userInfoColumn}>
            <ThemedText variant="buttonSmall" color="inverse">{data.submitter?.displayName || t('common:anonymous')}</ThemedText>
            <ThemedText variant="caption" style={styles.reporterUsername}>@{data.submitter?.username || t('unknown')}</ThemedText>
          </View>
        </View>
        {data.submitterComment && (
          <View style={styles.commentShell}>
            <ThemedText variant="label" style={styles.commentShellText}>"{data.submitterComment}"</ThemedText>
          </View>
        )}
      </View>
    </View>
  )
}

function AppealCard({ item, onHistoryPress, onChatPress, colors, styles }) {
  const { t } = useTranslation('moderation')
  const ACTION_LABELS = useMemo(() => getActionLabels(t), [t])
  const CLASS_LABELS = useMemo(() => getClassLabels(t), [t])
  const { data } = item
  const target = data.originalReport?.targetContent
  const rule = data.originalReport?.rule
  const submitter = data.originalReport?.submitter
  const isEscalated = data.appealState === 'escalated'
  const isOverruled = data.appealState === 'overruled'

  return (
    <View style={styles.reportCard}>
      {/* Red header with card type + rule */}
      <View style={styles.reportHeader}>
        <View style={styles.headerRow}>
          <View style={styles.headerTypeTag}>
            <Ionicons name={isEscalated ? 'arrow-up-circle' : isOverruled ? 'swap-horizontal' : 'megaphone'} size={28} color="#FFFFFF" />
            <ThemedText variant="badgeLg" color="inverse" style={styles.headerTypeText}>{isEscalated ? t('escalatedLabel') : isOverruled ? t('overruledLabel') : t('appeal')}</ThemedText>
          </View>
          <View style={styles.headerRuleContent}>
            <ThemedText variant="buttonSmall" color="inverse" style={styles.reportRuleTitle}>{rule?.title || t('ruleViolation')}</ThemedText>
            {rule?.text && (
              <ThemedText variant="caption" color="inverse" style={styles.reportRuleText}>{rule.text}</ThemedText>
            )}
          </View>
        </View>
      </View>

      {/* White body section */}
      <View style={styles.reportBodyWrapper}>
        <View style={styles.reportBody}>
          {target?.type === 'position' ? (
            <PositionInfoCard
              position={target}
              authorSubtitle="username"
            />
          ) : target?.type === 'chat_log' ? (
            <PositionInfoCard
              position={{
                statement: target.positionStatement,
                creator: target.participants?.[0],
              }}
              authorSubtitle="username"
              label={t('chatLabel', { names: target.participants?.map(p => p?.displayName).filter(Boolean).join(' & ') })}
            />
          ) : (
            <View style={{ padding: 16 }}>
              <ThemedText variant="bodySmall" color="secondary" style={{ fontStyle: 'italic' }}>{t('contentUnavailable')}</ThemedText>
            </View>
          )}
        </View>
      </View>

      {/* White bottom curve over purple */}
      <View style={styles.reportBodyBottomCurve} />

      {/* Purple footer with reporter, moderator action, and appeal as distinct shells */}
      <View style={styles.reportFooter}>
        {onChatPress && target?.type === 'chat_log' && (
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => onChatPress(data.originalReport?.targetId, data.originalReport?.submitter?.id)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('viewChatLogA11y')}
          >
            <Ionicons name="chatbubbles-outline" size={16} color="#FFFFFF" />
            <ThemedText variant="label" color="inverse">{t('viewChatLog')}</ThemedText>
          </TouchableOpacity>
        )}
        {onHistoryPress && data.user && (
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => onHistoryPress(data.user)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('viewHistoryA11y')}
          >
            <Ionicons name="time-outline" size={16} color="#FFFFFF" />
            <ThemedText variant="label" color="inverse">{t('userModerationHistory')}</ThemedText>
          </TouchableOpacity>
        )}
        {/* Original reporter shell */}
        <View style={styles.sectionShell}>
          <View style={styles.reporterRow}>
            <ThemedText variant="badgeLg" style={styles.reportFooterLabel}>{t('reportedBy')}</ThemedText>
            <Avatar user={submitter} size="sm" showKudosCount badgePosition="bottom-left" />
            <View style={styles.userInfoColumn}>
              <ThemedText variant="buttonSmall" color="inverse">{submitter?.displayName || t('common:anonymous')}</ThemedText>
              <ThemedText variant="caption" style={styles.reporterUsername}>@{submitter?.username || t('unknown')}</ThemedText>
            </View>
          </View>
          {data.originalReport?.submitterComment && (
            <ThemedText variant="label" style={styles.sectionShellComment}>"{data.originalReport.submitterComment}"</ThemedText>
          )}
        </View>

        {/* Moderator action shell */}
        {data.originalAction && (
          <View style={styles.modActionShell}>
            <View style={styles.reporterRow}>
              <ThemedText variant="badgeLg" style={styles.reportFooterLabel}>{t('modAction')}</ThemedText>
              <Avatar user={data.originalAction.responder} size="sm" showKudosCount badgePosition="bottom-left" />
              <View style={styles.userInfoColumn}>
                <ThemedText variant="buttonSmall" color="inverse">{data.originalAction.responder?.displayName || t('moderator')}</ThemedText>
                <ThemedText variant="caption" style={styles.reporterUsername}>@{data.originalAction.responder?.username || t('unknown')}</ThemedText>
              </View>
            </View>
            {data.originalAction.actions?.length > 0 && (
              <View style={styles.modActionDetails}>
                {data.originalAction.actions.map((a, i) => (
                  <ThemedText key={i} variant="caption" style={styles.modActionDetailText}>
                    {CLASS_LABELS[a.userClass] || a.userClass}: {ACTION_LABELS[a.action] || a.action}{a.action === 'temporary_ban' && a.durationDays ? ` ${t('durationDays', { days: a.durationDays })}` : ''}
                  </ThemedText>
                ))}
              </View>
            )}
            {data.originalAction.modResponseText && (
              <ThemedText variant="label" style={styles.sectionShellComment}>"{data.originalAction.modResponseText}"</ThemedText>
            )}
          </View>
        )}

        {/* Appeal shell */}
        <View style={styles.sectionShell}>
          <View style={styles.reporterRow}>
            <ThemedText variant="badgeLg" style={styles.reportFooterLabel}>
              {t('appealBy')}{data.userClass ? ` (${CLASS_LABELS[data.userClass] || data.userClass})` : ''}
            </ThemedText>
            <Avatar user={data.user} size="sm" showKudosCount badgePosition="bottom-left" />
            <View style={styles.userInfoColumn}>
              <ThemedText variant="buttonSmall" color="inverse">{data.user?.displayName || t('common:anonymous')}</ThemedText>
              <ThemedText variant="caption" style={styles.reporterUsername}>@{data.user?.username || t('unknown')}</ThemedText>
            </View>
          </View>
          {data.appealText && (
            <ThemedText variant="label" style={styles.sectionShellComment}>"{data.appealText}"</ThemedText>
          )}
        </View>

        {/* Prior moderator reviews (e.g. second mod who overruled, or original mod who escalated) */}
        {data.priorResponses?.map((pr, i) => (
          <View key={i} style={pr.outcome === 'escalated' ? styles.sectionShell : styles.modActionShell}>
            <View style={styles.reporterRow}>
              <ThemedText variant="badgeLg" style={styles.reportFooterLabel}>
                {pr.outcome === 'overruled' ? t('overruledBy') : pr.outcome === 'escalated' ? t('escalatedBy') : t('reviewedBy')}
              </ThemedText>
              <Avatar user={pr.responder} size="sm" showKudosCount badgePosition="bottom-left" />
              <View style={styles.userInfoColumn}>
                <ThemedText variant="buttonSmall" color="inverse">{pr.responder?.displayName || t('moderator')}</ThemedText>
                <ThemedText variant="caption" style={styles.reporterUsername}>@{pr.responder?.username || t('unknown')}</ThemedText>
              </View>
            </View>
            {pr.outcome === 'overruled' && (
              <ThemedText variant="caption" style={styles.modActionDetailText}>{t('approvedAppealOverruled')}</ThemedText>
            )}
            {pr.outcome === 'escalated' && (
              <ThemedText variant="caption" style={styles.modActionDetailText}>{t('escalatedToAdmin')}</ThemedText>
            )}
            {pr.responseText && (
              <ThemedText variant="label" style={styles.sectionShellComment}>"{pr.responseText}"</ThemedText>
            )}
          </View>
        ))}
      </View>
    </View>
  )
}

const getStateLabels = (t) => ({
  approved: t('stateApproved'),
  denied: t('stateDenied'),
  modified: t('stateModified'),
})
const getStateColors = (colors) => ({
  approved: SemanticColors.agree,
  denied: SemanticColors.warning,
  modified: colors.primary,
})

function AdminResponseNotificationCard({ item, onHistoryPress, onChatPress, colors, styles }) {
  const { t } = useTranslation('moderation')
  const ACTION_LABELS = useMemo(() => getActionLabels(t), [t])
  const CLASS_LABELS = useMemo(() => getClassLabels(t), [t])
  const STATE_LABELS = useMemo(() => getStateLabels(t), [t])
  const { data } = item
  const target = data.originalReport?.targetContent
  const rule = data.originalReport?.rule

  return (
    <View style={styles.reportCard}>
      {/* Header with type tag + outcome */}
      <View style={styles.reportHeader}>
        <View style={styles.headerRow}>
          <View style={styles.headerTypeTag}>
            <Ionicons name="shield-checkmark" size={28} color="#FFFFFF" />
            <ThemedText variant="badgeLg" color="inverse" style={styles.headerTypeText}>{t('response')}</ThemedText>
          </View>
          <View style={styles.headerRuleContent}>
            <View style={[styles.outcomeBadge, { backgroundColor: getStateColors(colors)[data.appealState] || colors.primary }]}>
              <ThemedText variant="badge" color="inverse" style={styles.outcomeBadgeText}>{STATE_LABELS[data.appealState] || data.appealState}</ThemedText>
            </View>
            {rule?.title && <ThemedText variant="buttonSmall" color="inverse" style={styles.reportRuleTitle}>{rule.title}</ThemedText>}
            {rule?.text && <ThemedText variant="caption" color="inverse" style={styles.reportRuleText}>{rule.text}</ThemedText>}
          </View>
        </View>
      </View>

      {/* White body section */}
      <View style={styles.reportBodyWrapper}>
        <View style={styles.reportBody}>
          {target?.type === 'position' ? (
            <PositionInfoCard
              position={target}
              authorSubtitle="username"
            />
          ) : target?.type === 'chat_log' ? (
            <PositionInfoCard
              position={{
                statement: target.positionStatement,
                creator: target.participants?.[0],
              }}
              authorSubtitle="username"
              label={t('chatLabel', { names: target.participants?.map(p => p?.displayName).filter(Boolean).join(' & ') })}
            />
          ) : (
            <View style={{ padding: 16 }}>
              <ThemedText variant="bodySmall" color="secondary" style={{ fontStyle: 'italic' }}>{t('contentUnavailable')}</ThemedText>
            </View>
          )}
        </View>
      </View>

      {/* White bottom curve over purple */}
      <View style={styles.reportBodyBottomCurve} />

      {/* Purple footer — chronological order: mod action → reviews → admin decision */}
      <View style={styles.reportFooter}>
        {onChatPress && target?.type === 'chat_log' && (
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => onChatPress(data.originalReport?.targetId, data.originalReport?.submitter?.id)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('viewChatLogA11y')}
          >
            <Ionicons name="chatbubbles-outline" size={16} color="#FFFFFF" />
            <ThemedText variant="label" color="inverse">{t('viewChatLog')}</ThemedText>
          </TouchableOpacity>
        )}
        {onHistoryPress && data.appealUser && (
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => onHistoryPress(data.appealUser)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('viewHistoryA11y')}
          >
            <Ionicons name="time-outline" size={16} color="#FFFFFF" />
            <ThemedText variant="label" color="inverse">{t('userModerationHistory')}</ThemedText>
          </TouchableOpacity>
        )}

        {/* Original reporter */}
        {data.originalReport?.submitter && (
          <View style={styles.sectionShell}>
            <View style={styles.reporterRow}>
              <ThemedText variant="badgeLg" style={styles.reportFooterLabel}>{t('reportedBy')}</ThemedText>
              <Avatar user={data.originalReport.submitter} size="sm" showKudosCount badgePosition="bottom-left" />
              <View style={styles.userInfoColumn}>
                <ThemedText variant="buttonSmall" color="inverse">{data.originalReport.submitter?.displayName || t('common:anonymous')}</ThemedText>
                <ThemedText variant="caption" style={styles.reporterUsername}>@{data.originalReport.submitter?.username || t('unknown')}</ThemedText>
              </View>
            </View>
            {data.originalReport.submitterComment && (
              <ThemedText variant="label" style={styles.sectionShellComment}>"{data.originalReport.submitterComment}"</ThemedText>
            )}
          </View>
        )}

        {/* 1. Original moderator action */}
        {data.originalAction && (
          <View style={styles.modActionShell}>
            <View style={styles.reporterRow}>
              <ThemedText variant="badgeLg" style={styles.reportFooterLabel}>{t('modAction')}</ThemedText>
              <Avatar user={data.originalAction.responder} size="sm" showKudosCount badgePosition="bottom-left" />
              <View style={styles.userInfoColumn}>
                <ThemedText variant="buttonSmall" color="inverse">{data.originalAction.responder?.displayName || t('moderator')}</ThemedText>
                <ThemedText variant="caption" style={styles.reporterUsername}>@{data.originalAction.responder?.username || t('unknown')}</ThemedText>
              </View>
            </View>
            {data.originalAction.actions?.length > 0 && (
              <View style={styles.modActionDetails}>
                {data.originalAction.actions.map((a, i) => (
                  <ThemedText key={i} variant="caption" style={styles.modActionDetailText}>
                    {CLASS_LABELS[a.userClass] || a.userClass}: {ACTION_LABELS[a.action] || a.action}{a.action === 'temporary_ban' && a.durationDays ? ` ${t('durationDays', { days: a.durationDays })}` : ''}
                  </ThemedText>
                ))}
              </View>
            )}
            {data.originalAction.modResponseText && (
              <ThemedText variant="label" style={styles.sectionShellComment}>"{data.originalAction.modResponseText}"</ThemedText>
            )}
          </View>
        )}

        {/* 2. Appeal by user */}
        {data.appealText && (
          <View style={styles.sectionShell}>
            <View style={styles.reporterRow}>
              <ThemedText variant="badgeLg" style={styles.reportFooterLabel}>{t('appealBy')}</ThemedText>
              <Avatar user={data.appealUser} size="sm" showKudosCount badgePosition="bottom-left" />
              <View style={styles.userInfoColumn}>
                <ThemedText variant="buttonSmall" color="inverse">{data.appealUser?.displayName || t('userFallback')}</ThemedText>
                <ThemedText variant="caption" style={styles.reporterUsername}>@{data.appealUser?.username || t('unknown')}</ThemedText>
              </View>
            </View>
            <ThemedText variant="label" style={styles.sectionShellComment}>"{data.appealText}"</ThemedText>
          </View>
        )}

        {/* 3. Prior moderator reviews (overruled, escalated, etc.) */}
        {data.priorResponses?.map((pr, i) => (
          <View key={i} style={i === 1 ? styles.sectionShell : styles.modActionShell}>
            <View style={styles.reporterRow}>
              <ThemedText variant="badgeLg" style={styles.reportFooterLabel}>
                {i === 0 ? t('overruledBy') : i === 1 ? t('escalatedBy') : t('reviewedBy')}
              </ThemedText>
              <Avatar user={pr.responder} size="sm" showKudosCount badgePosition="bottom-left" />
              <View style={styles.userInfoColumn}>
                <ThemedText variant="buttonSmall" color="inverse">{pr.responder?.displayName || t('moderator')}</ThemedText>
                <ThemedText variant="caption" style={styles.reporterUsername}>@{pr.responder?.username || t('unknown')}</ThemedText>
              </View>
            </View>
            {i === 0 && (
              <ThemedText variant="caption" style={styles.modActionDetailText}>{t('approvedAppealOverruled')}</ThemedText>
            )}
            {i === 1 && (
              <ThemedText variant="caption" style={styles.modActionDetailText}>{t('escalatedToAdmin')}</ThemedText>
            )}
            {pr.responseText && (
              <ThemedText variant="label" style={styles.sectionShellComment}>"{pr.responseText}"</ThemedText>
            )}
          </View>
        ))}

        {/* 3. Admin decision (most recent — at bottom) */}
        <View style={styles.modActionShell}>
          <View style={styles.reporterRow}>
            <ThemedText variant="badgeLg" style={styles.reportFooterLabel}>{t('adminDecision')}</ThemedText>
            <Avatar user={data.adminResponder} size="sm" showKudosCount badgePosition="bottom-left" />
            <View style={styles.userInfoColumn}>
              <ThemedText variant="buttonSmall" color="inverse">{data.adminResponder?.displayName || t('admin')}</ThemedText>
              <ThemedText variant="caption" style={styles.reporterUsername}>@{data.adminResponder?.username || t('unknown')}</ThemedText>
            </View>
          </View>
          {data.adminResponseText && (
            <ThemedText variant="label" style={styles.sectionShellComment}>"{data.adminResponseText}"</ThemedText>
          )}
        </View>
      </View>
    </View>
  )
}

export default function ModerationQueue() {
  const { t } = useTranslation('moderation')
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [queue, setQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionModalVisible, setActionModalVisible] = useState(false)
  const [dismissModalVisible, setDismissModalVisible] = useState(false)
  const [appealResponseModalVisible, setAppealResponseModalVisible] = useState(false)
  const [appealResponseType, setAppealResponseType] = useState(null) // 'approve' or 'deny'
  const [modifyModalVisible, setModifyModalVisible] = useState(false)
  const [responseText, setResponseText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [historyModalVisible, setHistoryModalVisible] = useState(false)
  const [historyUserId, setHistoryUserId] = useState(null)
  const [historyUser, setHistoryUser] = useState(null)

  const handleChatPress = useCallback((chatId, reporterId) => {
    if (chatId) {
      router.push(`/chat/${chatId}?from=moderation${reporterId ? `&reporterId=${reporterId}` : ''}`)
    }
  }, [router])

  const handleHistoryPress = useCallback((user) => {
    setHistoryUserId(user.id)
    setHistoryUser(user)
    setHistoryModalVisible(true)
  }, [])

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.moderation.getQueue()
      setQueue(data || [])
      setCurrentIndex(0)
    } catch (err) {
      console.error('Failed to fetch mod queue:', err)
      setError(translateError(err.message, t) || t('failedLoadQueue'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  const currentItem = queue[currentIndex]

  // Auto-claim reports when they become the current item
  const currentReportId = currentItem?.type === 'report' ? currentItem.data.id : null
  useEffect(() => {
    if (currentReportId) {
      api.moderation.claimReport(currentReportId).catch(err => {
        console.error('Failed to claim report:', err)
      })
    }
  }, [currentReportId])

  const advanceQueue = useCallback(() => {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      // Re-fetch when we reach the end
      fetchQueue()
    }
  }, [currentIndex, queue.length, fetchQueue])

  // Report actions
  const handlePass = useCallback(async () => {
    if (currentItem?.type === 'report') {
      try {
        await api.moderation.releaseReport(currentItem.data.id)
      } catch (err) {
        console.error('Failed to release report:', err)
      }
    }
    advanceQueue()
  }, [currentItem, advanceQueue])

  const handleDismiss = useCallback(async () => {
    if (!currentItem || processing) return
    setProcessing(true)
    try {
      await api.moderation.takeAction(currentItem.data.id, {
        modResponse: 'dismiss',
        modResponseText: responseText || undefined,
      })
      setDismissModalVisible(false)
      setResponseText('')
      advanceQueue()
    } catch (err) {
      console.error('Failed to dismiss report:', err)
    } finally {
      setProcessing(false)
    }
  }, [currentItem, responseText, advanceQueue, processing])

  const handleMarkSpurious = useCallback(async () => {
    if (!currentItem || processing) return
    setProcessing(true)
    try {
      await api.moderation.takeAction(currentItem.data.id, {
        modResponse: 'mark_spurious',
      })
      advanceQueue()
    } catch (err) {
      console.error('Failed to mark spurious:', err)
    } finally {
      setProcessing(false)
    }
  }, [currentItem, advanceQueue, processing])

  const handleTakeAction = useCallback(async (actionRequest) => {
    if (!currentItem || processing) return
    setProcessing(true)
    try {
      await api.moderation.takeAction(currentItem.data.id, actionRequest)
      setActionModalVisible(false)
      advanceQueue()
    } catch (err) {
      console.error('Failed to take action:', err)
    } finally {
      setProcessing(false)
    }
  }, [currentItem, advanceQueue, processing])

  // Appeal actions
  const handleAppealResponse = useCallback(async () => {
    if (!currentItem || !appealResponseType || processing) return
    setProcessing(true)
    try {
      await api.moderation.respondToAppeal(currentItem.data.id, {
        response: appealResponseType,
        responseText: responseText,
      })
      setAppealResponseModalVisible(false)
      setResponseText('')
      setAppealResponseType(null)
      advanceQueue()
    } catch (err) {
      console.error('Failed to respond to appeal:', err)
    } finally {
      setProcessing(false)
    }
  }, [currentItem, appealResponseType, responseText, advanceQueue, processing])

  const handleDismissAdminResponse = useCallback(async () => {
    if (!currentItem || currentItem.type !== 'admin_response_notification' || processing) return
    setProcessing(true)
    try {
      await api.moderation.dismissAdminResponseNotification(currentItem.data.modActionAppealId)
      advanceQueue()
    } catch (err) {
      console.error('Failed to dismiss admin response notification:', err)
    } finally {
      setProcessing(false)
    }
  }, [currentItem, advanceQueue, processing])

  const handleModifyAction = useCallback(async (actionRequest) => {
    if (!currentItem || processing) return
    setProcessing(true)
    try {
      await api.moderation.respondToAppeal(currentItem.data.id, {
        response: 'modify',
        responseText: actionRequest.modResponseText || '',
        actions: actionRequest.actions,
      })
      setModifyModalVisible(false)
      advanceQueue()
    } catch (err) {
      console.error('Failed to modify action:', err)
    } finally {
      setProcessing(false)
    }
  }, [currentItem, advanceQueue, processing])

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText variant="body" color="secondary" style={styles.loadingText}>{t('loadingQueue')}</ThemedText>
        </View>
      </SafeAreaView>
    )
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header />
        <View style={styles.centerContent}>
          <ThemedText variant="body" color="error" style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity style={styles.retryButton} onPress={fetchQueue} accessibilityRole="button" accessibilityLabel={t('retryA11y')}>
            <ThemedText variant="button" color="inverse">{t('common:retry')}</ThemedText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  if (queue.length === 0 || currentIndex >= queue.length) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header />
        <EmptyState
          icon="shield-checkmark-outline"
          title={t('queueClear')}
          subtitle={t('queueClearSubtitle')}
          style={styles.emptyContainer}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header />

      <ScrollView style={styles.cardContainer} contentContainerStyle={styles.cardContainerContent}>
        {currentItem?.type === 'report' ? (
          <ReportCard item={currentItem} onHistoryPress={handleHistoryPress} onChatPress={handleChatPress} colors={colors} styles={styles} />
        ) : currentItem?.type === 'appeal' ? (
          <AppealCard item={currentItem} onHistoryPress={handleHistoryPress} onChatPress={handleChatPress} colors={colors} styles={styles} />
        ) : currentItem?.type === 'admin_response_notification' ? (
          <AdminResponseNotificationCard item={currentItem} onHistoryPress={handleHistoryPress} onChatPress={handleChatPress} colors={colors} styles={styles} />
        ) : null}
      </ScrollView>

      {/* Action buttons */}
      <View style={styles.actionsContainer}>
        {currentItem?.type === 'report' ? (
          <>
            <TouchableOpacity style={styles.actionButton} onPress={handlePass} accessibilityRole="button" accessibilityLabel={t('passAction')}>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              <ThemedText variant="badgeLg" color="inverse">{t('passAction')}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonDismiss]}
              onPress={() => setDismissModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t('dismissAction')}
            >
              <Ionicons name="close-circle-outline" size={20} color="#FFFFFF" />
              <ThemedText variant="badgeLg" color="inverse">{t('dismissAction')}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonAction]}
              onPress={() => setActionModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t('actionButton')}
            >
              <MaterialCommunityIcons name="gavel" size={20} color="#FFFFFF" />
              <ThemedText variant="badgeLg" color="inverse">{t('actionButton')}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleMarkSpurious}
              disabled={processing}
              accessibilityRole="button"
              accessibilityLabel={t('spurious')}
            >
              <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
              <ThemedText variant="badgeLg" color="inverse">{t('spurious')}</ThemedText>
            </TouchableOpacity>
          </>
        ) : currentItem?.type === 'appeal' ? (
          currentItem.data.appealState === 'overruled' ? (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonApprove]}
                onPress={() => {
                  setAppealResponseType('accept')
                  setResponseText('')
                  setAppealResponseModalVisible(true)
                }}
                accessibilityRole="button"
                accessibilityLabel={t('acceptAction')}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                <ThemedText variant="badgeLg" color="inverse" style={styles.actionButtonTextWhite}>{t('acceptAction')}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonEscalate]}
                onPress={() => {
                  setAppealResponseType('escalate')
                  setResponseText('')
                  setAppealResponseModalVisible(true)
                }}
                accessibilityRole="button"
                accessibilityLabel={t('escalateAction')}
              >
                <Ionicons name="arrow-up-circle-outline" size={20} color="#FFFFFF" />
                <ThemedText variant="badgeLg" color="inverse" style={styles.actionButtonTextWhite}>{t('escalateAction')}</ThemedText>
              </TouchableOpacity>
            </>
          ) : currentItem.data.appealState === 'escalated' ? (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonEscalated]}
                onPress={() => {
                  setAppealResponseType('approve')
                  setResponseText('')
                  setAppealResponseModalVisible(true)
                }}
                accessibilityRole="button"
                accessibilityLabel={t('approveAction')}
              >
                <ThemedText variant="caption" style={styles.escalatedButtonLabel}>{t('sideWith')}</ThemedText>
                <View style={styles.escalatedButtonContent}>
                  <Avatar user={currentItem.data.priorResponses?.[0]?.responder} size="sm" showKudosCount badgePosition="bottom-left" />
                  <View style={styles.userInfoColumn}>
                    <ThemedText variant="badgeLg" color="inverse" style={styles.actionButtonTextWhite}>{currentItem.data.priorResponses?.[0]?.responder?.displayName || t('moderator')}</ThemedText>
                    <ThemedText variant="caption" style={styles.escalatedButtonUsername}>@{currentItem.data.priorResponses?.[0]?.responder?.username || t('unknown')}</ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonEscalated]}
                onPress={() => {
                  setAppealResponseType('deny')
                  setResponseText('')
                  setAppealResponseModalVisible(true)
                }}
                accessibilityRole="button"
                accessibilityLabel={t('denyAction')}
              >
                <ThemedText variant="caption" style={styles.escalatedButtonLabel}>{t('sideWith')}</ThemedText>
                <View style={styles.escalatedButtonContent}>
                  <Avatar user={currentItem.data.originalAction?.responder} size="sm" showKudosCount badgePosition="bottom-left" />
                  <View style={styles.userInfoColumn}>
                    <ThemedText variant="badgeLg" color="inverse" style={styles.actionButtonTextWhite}>{currentItem.data.originalAction?.responder?.displayName || t('moderator')}</ThemedText>
                    <ThemedText variant="caption" style={styles.escalatedButtonUsername}>@{currentItem.data.originalAction?.responder?.username || t('unknown')}</ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonApprove]}
                onPress={() => {
                  setAppealResponseType('approve')
                  setResponseText('')
                  setAppealResponseModalVisible(true)
                }}
                accessibilityRole="button"
                accessibilityLabel={t('approveAction')}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                <ThemedText variant="badgeLg" color="inverse" style={styles.actionButtonTextWhite}>{t('approveAction')}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonModify]}
                onPress={() => setModifyModalVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('modifyAction')}
              >
                <Ionicons name="create-outline" size={20} color="#FFFFFF" />
                <ThemedText variant="badgeLg" color="inverse" style={styles.actionButtonTextWhite}>{t('modifyAction')}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonDeny]}
                onPress={() => {
                  setAppealResponseType('deny')
                  setResponseText('')
                  setAppealResponseModalVisible(true)
                }}
                accessibilityRole="button"
                accessibilityLabel={t('denyAction')}
              >
                <Ionicons name="close-circle-outline" size={20} color="#FFFFFF" />
                <ThemedText variant="badgeLg" color="inverse" style={styles.actionButtonTextWhite}>{t('denyAction')}</ThemedText>
              </TouchableOpacity>
            </>
          )
        ) : currentItem?.type === 'admin_response_notification' ? (
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonDismissNotification]}
            onPress={handleDismissAdminResponse}
            disabled={processing}
            accessibilityRole="button"
            accessibilityLabel={t('dismissAction')}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
            <ThemedText variant="badgeLg" color="inverse" style={styles.actionButtonTextWhite}>{t('dismissAction')}</ThemedText>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Take Action Modal */}
      <ModerationActionModal
        visible={actionModalVisible}
        onClose={() => setActionModalVisible(false)}
        onSubmit={handleTakeAction}
        reportType={currentItem?.data?.reportType}
        rule={currentItem?.data?.rule}
      />

      {/* Modify Action Modal (for appeals) */}
      <ModerationActionModal
        visible={modifyModalVisible}
        onClose={() => setModifyModalVisible(false)}
        onSubmit={handleModifyAction}
        reportType={currentItem?.data?.originalReport?.reportType}
        rule={currentItem?.data?.originalReport?.rule}
      />

      {/* Dismiss Modal */}
      <BottomDrawerModal
        visible={dismissModalVisible}
        onClose={() => setDismissModalVisible(false)}
        title={t('dismissReport')}
        shrink

      >
        <View style={styles.responseModalContent}>
          <TextInput
            style={styles.responseInput}
            value={responseText}
            onChangeText={setResponseText}
            placeholder={t('modCommentPlaceholder')}
            placeholderTextColor={colors.placeholderText}
            multiline
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('responseInputA11y')}
          />
          <TouchableOpacity
            style={styles.responseSubmitButton}
            onPress={handleDismiss}
            disabled={processing}
            accessibilityRole="button"
            accessibilityLabel={t('submitResponseA11y')}
          >
            {processing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <ThemedText variant="button" color="inverse">{t('dismissReport')}</ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </BottomDrawerModal>

      {/* Moderation History Modal */}
      <ModerationHistoryModal
        visible={historyModalVisible}
        onClose={() => setHistoryModalVisible(false)}
        userId={historyUserId}
        user={historyUser}
      />

      {/* Appeal Response Modal */}
      <BottomDrawerModal
        visible={appealResponseModalVisible}
        onClose={() => setAppealResponseModalVisible(false)}
        title={
          appealResponseType === 'accept' ? t('acceptOverruling') :
          appealResponseType === 'escalate' ? t('escalateToAdmin') :
          appealResponseType === 'approve' && currentItem?.data?.appealState === 'escalated'
            ? t('sideWithName', { name: currentItem?.data?.priorResponses?.[0]?.responder?.displayName || t('moderator') })
            : appealResponseType === 'deny' && currentItem?.data?.appealState === 'escalated'
              ? t('sideWithName', { name: currentItem?.data?.originalAction?.responder?.displayName || t('moderator') })
              : appealResponseType === 'approve' ? t('approveAppeal') : t('denyAppeal')
        }
        shrink
      >
        <View style={styles.responseModalContent}>
          <TextInput
            style={styles.responseInput}
            value={responseText}
            onChangeText={setResponseText}
            placeholder={appealResponseType === 'escalate' ? t('escalateExplain') : t('yourResponse')}
            placeholderTextColor={colors.placeholderText}
            multiline
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('responseInputA11y')}
          />
          <TouchableOpacity
            style={[
              styles.responseSubmitButton,
              (appealResponseType === 'approve' || appealResponseType === 'accept') && styles.responseSubmitApprove,
              appealResponseType === 'escalate' && styles.responseSubmitEscalate,
            ]}
            onPress={handleAppealResponse}
            disabled={processing}
            accessibilityRole="button"
            accessibilityLabel={t('submitResponseA11y')}
          >
            {processing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <ThemedText variant="button" color="inverse">
                {appealResponseType === 'accept' ? t('acceptOverruling') :
                 appealResponseType === 'escalate' ? t('escalateToAdmin') :
                 appealResponseType === 'approve' ? t('approveAppeal') : t('denyAppeal')}
              </ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </BottomDrawerModal>
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
  },
  errorText: {
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primarySurface,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  cardContainer: {
    flex: 1,
    paddingHorizontal: 12,
  },
  cardContainerContent: {
    paddingVertical: 8,
  },
  reportCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.primarySurface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  reportHeader: {
    backgroundColor: colors.warningSurface,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTypeTag: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 64,
  },
  headerTypeText: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  historyButtonText: {
  },
  headerRuleContent: {
    flex: 1,
  },
  reportRuleTitle: {
  },
  reportRuleText: {
    color: 'rgba(255,255,255,0.9)',
    marginTop: 1,
    lineHeight: 16,
  },
  reportBodyWrapper: {
    backgroundColor: colors.warningSurface,
  },
  reportBody: {
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  reportBodyBottomCurve: {
    height: 16,
    backgroundColor: colors.cardBackground,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  reportFooter: {
    backgroundColor: colors.primarySurface,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  reporterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reportFooterLabel: {
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reporterName: {
  },
  reporterUsername: {
    color: 'rgba(255,255,255,0.6)',
  },
  userInfoColumn: {
    flexDirection: 'column',
  },
  commentShell: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  commentShellText: {
    fontWeight: undefined,
    color: 'rgba(255,255,255,0.85)',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  sectionShell: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  sectionShellComment: {
    fontWeight: undefined,
    color: 'rgba(255,255,255,0.85)',
    fontStyle: 'italic',
    lineHeight: 18,
    marginLeft: 2,
  },
  modActionShell: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  modActionDetails: {
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modActionDetailText: {
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 18,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.primarySurface,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: 4,
    minWidth: 70,
  },
  actionButtonDismiss: {
  },
  actionButtonAction: {
    backgroundColor: SemanticColors.warning,
    borderColor: SemanticColors.warning,
  },
  actionButtonApprove: {
    backgroundColor: SemanticColors.agree,
    borderColor: SemanticColors.agree,
    flex: 1,
  },
  actionButtonModify: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primary,
    flex: 1,
  },
  actionButtonDeny: {
    backgroundColor: SemanticColors.warning,
    borderColor: SemanticColors.warning,
    flex: 1,
  },
  actionButtonEscalated: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primary,
    flex: 1,
  },
  escalatedButtonLabel: {
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  escalatedButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  escalatedButtonUsername: {
    color: 'rgba(255,255,255,0.7)',
  },
  actionButtonText: {
  },
  actionButtonTextWhite: {
  },
  responseModalContent: {
    padding: 16,
    gap: 16,
  },
  responseInput: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    minHeight: 60,
    maxHeight: 120,
  },
  responseSubmitButton: {
    backgroundColor: colors.primarySurface,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  responseSubmitApprove: {
    backgroundColor: SemanticColors.agree,
  },
  responseSubmitEscalate: {
    backgroundColor: SemanticColors.escalate,
  },
  actionButtonEscalate: {
    backgroundColor: SemanticColors.escalate,
    borderColor: SemanticColors.escalate,
    flex: 1,
  },
  responseSubmitText: {
  },
  outcomeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 4,
  },
  outcomeBadgeText: {
  },
  actionButtonDismissNotification: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primary,
    flex: 1,
  },
})
