import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, ScrollView, TextInput } from 'react-native'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { SemanticColors } from '../../constants/Colors'
import { useThemeColors } from '../../hooks/useThemeColors'
import Header from '../../components/Header'
import EmptyState from '../../components/EmptyState'
import PositionInfoCard from '../../components/PositionInfoCard'
import ModerationActionModal from '../../components/ModerationActionModal'
import ModerationHistoryModal from '../../components/ModerationHistoryModal'
import BottomDrawerModal from '../../components/BottomDrawerModal'
import Avatar from '../../components/Avatar'
import api from '../../lib/api'

const ACTION_LABELS = {
  removed: 'Remove Content',
  warning: 'Warning',
  temporary_ban: 'Temporary Ban',
  permanent_ban: 'Permanent Ban',
}
const CLASS_LABELS = {
  submitter: 'Creator',
  active_adopter: 'Active Adopters',
  passive_adopter: 'Passive Adopters',
}

function ReportCard({ item, onHistoryPress, onChatPress, colors, styles }) {
  const { data } = item
  const target = data.targetContent

  return (
    <View style={styles.reportCard}>
      {/* Red header with card type + rule */}
      <View style={styles.reportHeader}>
        <View style={styles.headerRow}>
          <View style={styles.headerTypeTag}>
            <Ionicons name="shield" size={28} color="#FFFFFF" />
            <Text style={styles.headerTypeText}>Report</Text>
          </View>
          <View style={styles.headerRuleContent}>
            <Text style={styles.reportRuleTitle}>{data.rule?.title || 'Rule violation'}</Text>
            {data.rule?.text && (
              <Text style={styles.reportRuleText}>{data.rule.text}</Text>
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
              label={`Chat: ${target.participants?.map(p => p?.displayName).filter(Boolean).join(' & ')}`}
            />
          ) : (
            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: 14, color: colors.secondaryText, fontStyle: 'italic' }}>Content unavailable</Text>
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
          >
            <Ionicons name="chatbubbles-outline" size={16} color="#FFFFFF" />
            <Text style={styles.historyButtonText}>View chat log</Text>
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
            >
              <Ionicons name="time-outline" size={16} color="#FFFFFF" />
              <Text style={styles.historyButtonText}>User moderation history</Text>
            </TouchableOpacity>
          ) : null
        })()}
        <View style={styles.reporterRow}>
          <Text style={styles.reportFooterLabel}>Reported by</Text>
          <Avatar user={data.submitter} size="sm" showKudosCount badgePosition="bottom-left" />
          <View style={styles.userInfoColumn}>
            <Text style={styles.reporterName}>{data.submitter?.displayName || 'Anonymous'}</Text>
            <Text style={styles.reporterUsername}>@{data.submitter?.username || 'unknown'}</Text>
          </View>
        </View>
        {data.submitterComment && (
          <View style={styles.commentShell}>
            <Text style={styles.commentShellText}>"{data.submitterComment}"</Text>
          </View>
        )}
      </View>
    </View>
  )
}

function AppealCard({ item, onHistoryPress, onChatPress, colors, styles }) {
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
            <Text style={styles.headerTypeText}>{isEscalated ? 'Escalated' : isOverruled ? 'Overruled' : 'Appeal'}</Text>
          </View>
          <View style={styles.headerRuleContent}>
            <Text style={styles.reportRuleTitle}>{rule?.title || 'Rule violation'}</Text>
            {rule?.text && (
              <Text style={styles.reportRuleText}>{rule.text}</Text>
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
              label={`Chat: ${target.participants?.map(p => p?.displayName).filter(Boolean).join(' & ')}`}
            />
          ) : (
            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: 14, color: colors.secondaryText, fontStyle: 'italic' }}>Content unavailable</Text>
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
          >
            <Ionicons name="chatbubbles-outline" size={16} color="#FFFFFF" />
            <Text style={styles.historyButtonText}>View chat log</Text>
          </TouchableOpacity>
        )}
        {onHistoryPress && data.user && (
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => onHistoryPress(data.user)}
            activeOpacity={0.7}
          >
            <Ionicons name="time-outline" size={16} color="#FFFFFF" />
            <Text style={styles.historyButtonText}>User moderation history</Text>
          </TouchableOpacity>
        )}
        {/* Original reporter shell */}
        <View style={styles.sectionShell}>
          <View style={styles.reporterRow}>
            <Text style={styles.reportFooterLabel}>Reported by</Text>
            <Avatar user={submitter} size="sm" showKudosCount badgePosition="bottom-left" />
            <View style={styles.userInfoColumn}>
              <Text style={styles.reporterName}>{submitter?.displayName || 'Anonymous'}</Text>
              <Text style={styles.reporterUsername}>@{submitter?.username || 'unknown'}</Text>
            </View>
          </View>
          {data.originalReport?.submitterComment && (
            <Text style={styles.sectionShellComment}>"{data.originalReport.submitterComment}"</Text>
          )}
        </View>

        {/* Moderator action shell */}
        {data.originalAction && (
          <View style={styles.modActionShell}>
            <View style={styles.reporterRow}>
              <Text style={styles.reportFooterLabel}>Mod action</Text>
              <Avatar user={data.originalAction.responder} size="sm" showKudosCount badgePosition="bottom-left" />
              <View style={styles.userInfoColumn}>
                <Text style={styles.reporterName}>{data.originalAction.responder?.displayName || 'Moderator'}</Text>
                <Text style={styles.reporterUsername}>@{data.originalAction.responder?.username || 'unknown'}</Text>
              </View>
            </View>
            {data.originalAction.actions?.length > 0 && (
              <View style={styles.modActionDetails}>
                {data.originalAction.actions.map((a, i) => (
                  <Text key={i} style={styles.modActionDetailText}>
                    {CLASS_LABELS[a.userClass] || a.userClass}: {ACTION_LABELS[a.action] || a.action}{a.action === 'temporary_ban' && a.durationDays ? ` (${a.durationDays} days)` : ''}
                  </Text>
                ))}
              </View>
            )}
            {data.originalAction.modResponseText && (
              <Text style={styles.sectionShellComment}>"{data.originalAction.modResponseText}"</Text>
            )}
          </View>
        )}

        {/* Appeal shell */}
        <View style={styles.sectionShell}>
          <View style={styles.reporterRow}>
            <Text style={styles.reportFooterLabel}>
              Appeal by{data.userClass ? ` (${CLASS_LABELS[data.userClass] || data.userClass})` : ''}
            </Text>
            <Avatar user={data.user} size="sm" showKudosCount badgePosition="bottom-left" />
            <View style={styles.userInfoColumn}>
              <Text style={styles.reporterName}>{data.user?.displayName || 'Anonymous'}</Text>
              <Text style={styles.reporterUsername}>@{data.user?.username || 'unknown'}</Text>
            </View>
          </View>
          {data.appealText && (
            <Text style={styles.sectionShellComment}>"{data.appealText}"</Text>
          )}
        </View>

        {/* Prior moderator reviews (e.g. second mod who overruled, or original mod who escalated) */}
        {data.priorResponses?.map((pr, i) => (
          <View key={i} style={pr.outcome === 'escalated' ? styles.sectionShell : styles.modActionShell}>
            <View style={styles.reporterRow}>
              <Text style={styles.reportFooterLabel}>
                {pr.outcome === 'overruled' ? 'Overruled by' : pr.outcome === 'escalated' ? 'Escalated by' : 'Reviewed by'}
              </Text>
              <Avatar user={pr.responder} size="sm" showKudosCount badgePosition="bottom-left" />
              <View style={styles.userInfoColumn}>
                <Text style={styles.reporterName}>{pr.responder?.displayName || 'Moderator'}</Text>
                <Text style={styles.reporterUsername}>@{pr.responder?.username || 'unknown'}</Text>
              </View>
            </View>
            {pr.outcome === 'overruled' && (
              <Text style={styles.modActionDetailText}>Approved appeal — overruled original action</Text>
            )}
            {pr.outcome === 'escalated' && (
              <Text style={styles.modActionDetailText}>Escalated to admin review</Text>
            )}
            {pr.responseText && (
              <Text style={styles.sectionShellComment}>"{pr.responseText}"</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  )
}

const STATE_LABELS = {
  approved: 'Appeal Approved',
  denied: 'Appeal Denied',
  modified: 'Action Modified',
}
const getStateColors = (colors) => ({
  approved: SemanticColors.agree,
  denied: SemanticColors.warning,
  modified: colors.primary,
})

function AdminResponseNotificationCard({ item, onHistoryPress, onChatPress, colors, styles }) {
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
            <Text style={styles.headerTypeText}>Response</Text>
          </View>
          <View style={styles.headerRuleContent}>
            <View style={[styles.outcomeBadge, { backgroundColor: getStateColors(colors)[data.appealState] || colors.primary }]}>
              <Text style={styles.outcomeBadgeText}>{STATE_LABELS[data.appealState] || data.appealState}</Text>
            </View>
            {rule?.title && <Text style={styles.reportRuleTitle}>{rule.title}</Text>}
            {rule?.text && <Text style={styles.reportRuleText}>{rule.text}</Text>}
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
              label={`Chat: ${target.participants?.map(p => p?.displayName).filter(Boolean).join(' & ')}`}
            />
          ) : (
            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: 14, color: colors.secondaryText, fontStyle: 'italic' }}>Content unavailable</Text>
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
          >
            <Ionicons name="chatbubbles-outline" size={16} color="#FFFFFF" />
            <Text style={styles.historyButtonText}>View chat log</Text>
          </TouchableOpacity>
        )}
        {onHistoryPress && data.appealUser && (
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => onHistoryPress(data.appealUser)}
            activeOpacity={0.7}
          >
            <Ionicons name="time-outline" size={16} color="#FFFFFF" />
            <Text style={styles.historyButtonText}>User moderation history</Text>
          </TouchableOpacity>
        )}

        {/* Original reporter */}
        {data.originalReport?.submitter && (
          <View style={styles.sectionShell}>
            <View style={styles.reporterRow}>
              <Text style={styles.reportFooterLabel}>Reported by</Text>
              <Avatar user={data.originalReport.submitter} size="sm" showKudosCount badgePosition="bottom-left" />
              <View style={styles.userInfoColumn}>
                <Text style={styles.reporterName}>{data.originalReport.submitter?.displayName || 'Anonymous'}</Text>
                <Text style={styles.reporterUsername}>@{data.originalReport.submitter?.username || 'unknown'}</Text>
              </View>
            </View>
            {data.originalReport.submitterComment && (
              <Text style={styles.sectionShellComment}>"{data.originalReport.submitterComment}"</Text>
            )}
          </View>
        )}

        {/* 1. Original moderator action */}
        {data.originalAction && (
          <View style={styles.modActionShell}>
            <View style={styles.reporterRow}>
              <Text style={styles.reportFooterLabel}>Mod action</Text>
              <Avatar user={data.originalAction.responder} size="sm" showKudosCount badgePosition="bottom-left" />
              <View style={styles.userInfoColumn}>
                <Text style={styles.reporterName}>{data.originalAction.responder?.displayName || 'Moderator'}</Text>
                <Text style={styles.reporterUsername}>@{data.originalAction.responder?.username || 'unknown'}</Text>
              </View>
            </View>
            {data.originalAction.actions?.length > 0 && (
              <View style={styles.modActionDetails}>
                {data.originalAction.actions.map((a, i) => (
                  <Text key={i} style={styles.modActionDetailText}>
                    {CLASS_LABELS[a.userClass] || a.userClass}: {ACTION_LABELS[a.action] || a.action}{a.action === 'temporary_ban' && a.durationDays ? ` (${a.durationDays} days)` : ''}
                  </Text>
                ))}
              </View>
            )}
            {data.originalAction.modResponseText && (
              <Text style={styles.sectionShellComment}>"{data.originalAction.modResponseText}"</Text>
            )}
          </View>
        )}

        {/* 2. Appeal by user */}
        {data.appealText && (
          <View style={styles.sectionShell}>
            <View style={styles.reporterRow}>
              <Text style={styles.reportFooterLabel}>Appeal by</Text>
              <Avatar user={data.appealUser} size="sm" showKudosCount badgePosition="bottom-left" />
              <View style={styles.userInfoColumn}>
                <Text style={styles.reporterName}>{data.appealUser?.displayName || 'User'}</Text>
                <Text style={styles.reporterUsername}>@{data.appealUser?.username || 'unknown'}</Text>
              </View>
            </View>
            <Text style={styles.sectionShellComment}>"{data.appealText}"</Text>
          </View>
        )}

        {/* 3. Prior moderator reviews (overruled, escalated, etc.) */}
        {data.priorResponses?.map((pr, i) => (
          <View key={i} style={i === 1 ? styles.sectionShell : styles.modActionShell}>
            <View style={styles.reporterRow}>
              <Text style={styles.reportFooterLabel}>
                {i === 0 ? 'Overruled by' : i === 1 ? 'Escalated by' : 'Reviewed by'}
              </Text>
              <Avatar user={pr.responder} size="sm" showKudosCount badgePosition="bottom-left" />
              <View style={styles.userInfoColumn}>
                <Text style={styles.reporterName}>{pr.responder?.displayName || 'Moderator'}</Text>
                <Text style={styles.reporterUsername}>@{pr.responder?.username || 'unknown'}</Text>
              </View>
            </View>
            {i === 0 && (
              <Text style={styles.modActionDetailText}>Approved appeal — overruled original action</Text>
            )}
            {i === 1 && (
              <Text style={styles.modActionDetailText}>Escalated to admin review</Text>
            )}
            {pr.responseText && (
              <Text style={styles.sectionShellComment}>"{pr.responseText}"</Text>
            )}
          </View>
        ))}

        {/* 3. Admin decision (most recent — at bottom) */}
        <View style={styles.modActionShell}>
          <View style={styles.reporterRow}>
            <Text style={styles.reportFooterLabel}>Admin decision</Text>
            <Avatar user={data.adminResponder} size="sm" showKudosCount badgePosition="bottom-left" />
            <View style={styles.userInfoColumn}>
              <Text style={styles.reporterName}>{data.adminResponder?.displayName || 'Admin'}</Text>
              <Text style={styles.reporterUsername}>@{data.adminResponder?.username || 'unknown'}</Text>
            </View>
          </View>
          {data.adminResponseText && (
            <Text style={styles.sectionShellComment}>"{data.adminResponseText}"</Text>
          )}
        </View>
      </View>
    </View>
  )
}

export default function ModerationQueue() {
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
      setError(err.message || 'Failed to load moderation queue')
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
          <Text style={styles.loadingText}>Loading queue...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header />
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchQueue}>
            <Text style={styles.retryButtonText}>Retry</Text>
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
          title="Queue is clear"
          subtitle="No pending reports or appeals to review"
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
            <TouchableOpacity style={styles.actionButton} onPress={handlePass}>
              <Ionicons name="arrow-forward" size={20} color={colors.pass} />
              <Text style={styles.actionButtonText}>Pass</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonDismiss]}
              onPress={() => setDismissModalVisible(true)}
            >
              <Ionicons name="close-circle-outline" size={20} color={colors.primary} />
              <Text style={[styles.actionButtonText, styles.actionButtonTextPrimary]}>Dismiss</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonAction]}
              onPress={() => setActionModalVisible(true)}
            >
              <MaterialCommunityIcons name="gavel" size={20} color="#FFFFFF" />
              <Text style={styles.actionButtonTextWhite}>Action</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleMarkSpurious}
              disabled={processing}
            >
              <Ionicons name="trash-outline" size={20} color={colors.pass} />
              <Text style={styles.actionButtonText}>Spurious</Text>
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
              >
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonTextWhite}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonEscalate]}
                onPress={() => {
                  setAppealResponseType('escalate')
                  setResponseText('')
                  setAppealResponseModalVisible(true)
                }}
              >
                <Ionicons name="arrow-up-circle-outline" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonTextWhite}>Escalate</Text>
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
              >
                <Text style={styles.escalatedButtonLabel}>Side with</Text>
                <View style={styles.escalatedButtonContent}>
                  <Avatar user={currentItem.data.priorResponses?.[0]?.responder} size="sm" showKudosCount badgePosition="bottom-left" />
                  <View style={styles.userInfoColumn}>
                    <Text style={styles.actionButtonTextWhite}>{currentItem.data.priorResponses?.[0]?.responder?.displayName || 'Moderator'}</Text>
                    <Text style={styles.escalatedButtonUsername}>@{currentItem.data.priorResponses?.[0]?.responder?.username || 'unknown'}</Text>
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
              >
                <Text style={styles.escalatedButtonLabel}>Side with</Text>
                <View style={styles.escalatedButtonContent}>
                  <Avatar user={currentItem.data.originalAction?.responder} size="sm" showKudosCount badgePosition="bottom-left" />
                  <View style={styles.userInfoColumn}>
                    <Text style={styles.actionButtonTextWhite}>{currentItem.data.originalAction?.responder?.displayName || 'Moderator'}</Text>
                    <Text style={styles.escalatedButtonUsername}>@{currentItem.data.originalAction?.responder?.username || 'unknown'}</Text>
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
              >
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonTextWhite}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonModify]}
                onPress={() => setModifyModalVisible(true)}
              >
                <Ionicons name="create-outline" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonTextWhite}>Modify</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonDeny]}
                onPress={() => {
                  setAppealResponseType('deny')
                  setResponseText('')
                  setAppealResponseModalVisible(true)
                }}
              >
                <Ionicons name="close-circle-outline" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonTextWhite}>Deny</Text>
              </TouchableOpacity>
            </>
          )
        ) : currentItem?.type === 'admin_response_notification' ? (
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonDismissNotification]}
            onPress={handleDismissAdminResponse}
            disabled={processing}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonTextWhite}>Dismiss</Text>
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
        title="Dismiss Report"
        maxHeight="40%"
      >
        <View style={styles.responseModalContent}>
          <TextInput
            style={styles.responseInput}
            value={responseText}
            onChangeText={setResponseText}
            placeholder="Moderator comment (optional)..."
            placeholderTextColor={colors.placeholderText}
            multiline
          />
          <TouchableOpacity
            style={styles.responseSubmitButton}
            onPress={handleDismiss}
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.responseSubmitText}>Dismiss Report</Text>
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
          appealResponseType === 'accept' ? 'Accept Overruling' :
          appealResponseType === 'escalate' ? 'Escalate to Admin' :
          appealResponseType === 'approve' && currentItem?.data?.appealState === 'escalated'
            ? `Side with ${currentItem?.data?.priorResponses?.[0]?.responder?.displayName || 'Moderator'}`
            : appealResponseType === 'deny' && currentItem?.data?.appealState === 'escalated'
              ? `Side with ${currentItem?.data?.originalAction?.responder?.displayName || 'Moderator'}`
              : appealResponseType === 'approve' ? 'Approve Appeal' : 'Deny Appeal'
        }
        maxHeight="40%"
      >
        <View style={styles.responseModalContent}>
          <TextInput
            style={styles.responseInput}
            value={responseText}
            onChangeText={setResponseText}
            placeholder={appealResponseType === 'escalate' ? "Explain why you stand by your decision..." : "Your response..."}
            placeholderTextColor={colors.placeholderText}
            multiline
          />
          <TouchableOpacity
            style={[
              styles.responseSubmitButton,
              (appealResponseType === 'approve' || appealResponseType === 'accept') && styles.responseSubmitApprove,
              appealResponseType === 'escalate' && styles.responseSubmitEscalate,
            ]}
            onPress={handleAppealResponse}
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.responseSubmitText}>
                {appealResponseType === 'accept' ? 'Accept Overruling' :
                 appealResponseType === 'escalate' ? 'Escalate to Admin' :
                 appealResponseType === 'approve' ? 'Approve Appeal' : 'Deny Appeal'}
              </Text>
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
    fontSize: 16,
    color: colors.secondaryText,
  },
  errorText: {
    fontSize: 16,
    color: SemanticColors.warning,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
    backgroundColor: colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  reportHeader: {
    backgroundColor: SemanticColors.warning,
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
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 64,
  },
  headerTypeText: {
    color: '#FFFFFF',
    fontSize: 12,
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
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  headerRuleContent: {
    flex: 1,
  },
  reportRuleTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  reportRuleText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 1,
    lineHeight: 16,
  },
  reportBodyWrapper: {
    backgroundColor: SemanticColors.warning,
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
    backgroundColor: colors.primary,
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
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reporterName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  reporterUsername: {
    fontSize: 12,
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
    fontSize: 13,
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
    fontSize: 13,
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
    fontSize: 12,
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
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 4,
    minWidth: 70,
  },
  actionButtonDismiss: {
    borderColor: colors.primary,
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
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    flex: 1,
  },
  actionButtonDeny: {
    backgroundColor: SemanticColors.warning,
    borderColor: SemanticColors.warning,
    flex: 1,
  },
  actionButtonEscalated: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    flex: 1,
  },
  escalatedButtonLabel: {
    fontSize: 11,
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
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  actionButtonTextPrimary: {
    color: colors.primary,
  },
  actionButtonTextWhite: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
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
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  responseSubmitApprove: {
    backgroundColor: SemanticColors.agree,
  },
  responseSubmitEscalate: {
    backgroundColor: '#E67E22',
  },
  actionButtonEscalate: {
    backgroundColor: '#E67E22',
    borderColor: '#E67E22',
    flex: 1,
  },
  responseSubmitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  outcomeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 4,
  },
  outcomeBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  actionButtonDismissNotification: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    flex: 1,
  },
})
