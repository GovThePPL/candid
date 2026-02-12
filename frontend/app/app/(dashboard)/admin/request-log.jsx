import { StyleSheet, View, TouchableOpacity, FlatList, ActivityIndicator, TextInput, Alert, Platform } from 'react-native'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { useUser } from '../../../hooks/useUser'
import { SemanticColors } from '../../../constants/Colors'
import { Typography } from '../../../constants/Theme'
import { ROLE_LABEL_KEYS } from '../../../lib/roles'
import api, { translateError } from '../../../lib/api'
import Avatar from '../../../components/Avatar'
import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import EmptyState from '../../../components/EmptyState'
import BottomDrawerModal from '../../../components/BottomDrawerModal'
import { useToast } from '../../../components/Toast'

const TABS = ['pending', 'all', 'mine', 'actions']

const STATUS_COLORS = {
  pending: SemanticColors.pending,
  approved: SemanticColors.success,
  auto_approved: SemanticColors.success,
  denied: SemanticColors.warning,
  rescinded: SemanticColors.neutral,
}

const STATUS_KEYS = {
  pending: 'statusPending',
  approved: 'statusApproved',
  auto_approved: 'statusAutoApproved',
  denied: 'statusDenied',
  rescinded: 'statusRescinded',
}

function CountdownTimer({ targetDate }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const target = new Date(targetDate)
      const diff = target - now
      if (diff <= 0) { setTimeLeft('—'); return }
      const days = Math.floor(diff / 86400000)
      const hours = Math.floor((diff % 86400000) / 3600000)
      if (days > 0) setTimeLeft(`${days}d ${hours}h`)
      else setTimeLeft(`${hours}h ${Math.floor((diff % 3600000) / 60000)}m`)
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [targetDate])

  return <ThemedText variant="caption" color="secondary">{timeLeft}</ThemedText>
}

export default function RequestLogScreen() {
  const { t } = useTranslation('admin')
  const router = useRouter()
  const colors = useThemeColors()
  const { user } = useUser()
  const styles = useMemo(() => createStyles(colors), [colors])
  const toast = useToast()

  const [activeTab, setActiveTab] = useState('pending')
  const [requests, setRequests] = useState([])
  const [adminActions, setAdminActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)

  // Deny modal state
  const [denyModalVisible, setDenyModalVisible] = useState(false)
  const [denyTargetId, setDenyTargetId] = useState(null)
  const [denyReason, setDenyReason] = useState('')

  const fetchRequests = useCallback(async (tab) => {
    setLoading(true)
    try {
      const data = await api.admin.getRoleRequests(tab)
      setRequests(data || [])
    } catch (err) {
      toast?.(translateError(err.message, t) || t('loadError'), 'error')
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  const fetchAdminActions = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.admin.getAdminActions()
      setAdminActions(data || [])
    } catch (err) {
      toast?.(translateError(err.message, t) || t('loadError'), 'error')
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  useEffect(() => {
    if (activeTab === 'actions') {
      fetchAdminActions()
    } else {
      fetchRequests(activeTab)
    }
  }, [activeTab, fetchRequests, fetchAdminActions])

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab)
  }, [])

  const handleApprove = useCallback(async (requestId) => {
    setProcessing(requestId)
    try {
      await api.admin.approveRoleRequest(requestId)
      toast?.(t('roleApproved'), 'success')
      fetchRequests(activeTab)
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setProcessing(null)
    }
  }, [activeTab, fetchRequests, t, toast])

  const handleDeny = useCallback(async () => {
    if (!denyTargetId) return
    setProcessing(denyTargetId)
    try {
      await api.admin.denyRoleRequest(denyTargetId, denyReason)
      toast?.(t('roleDenied'), 'success')
      setDenyModalVisible(false)
      setDenyReason('')
      setDenyTargetId(null)
      fetchRequests(activeTab)
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setProcessing(null)
    }
  }, [denyTargetId, denyReason, activeTab, fetchRequests, t, toast])

  const handleRescind = useCallback(async (requestId) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`${t('rescindConfirm')}\n${t('rescindMessage')}`)
      : await new Promise(resolve => Alert.alert(
          t('rescindConfirm'),
          t('rescindMessage'),
          [
            { text: t('cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('rescind'), style: 'destructive', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        ))
    if (!confirmed) return
    setProcessing(requestId)
    try {
      await api.admin.rescindRoleRequest(requestId)
      toast?.(t('roleRescinded'), 'success')
      fetchRequests(activeTab)
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setProcessing(null)
    }
  }, [activeTab, fetchRequests, t, toast])

  const pendingCount = useMemo(() => {
    if (activeTab === 'pending') return requests.length
    return 0
  }, [activeTab, requests])

  const getEmptySubtitle = () => {
    if (activeTab === 'pending') return t('noRequestsReviewSubtitle')
    if (activeTab === 'all') return t('noRequestsAllSubtitle')
    if (activeTab === 'mine') return t('noRequestsMineSubtitle')
    return t('noAdminActionsSubtitle')
  }

  const renderRequest = useCallback(({ item }) => {
    const isAssign = item.action === 'assign'
    const isPending = item.status === 'pending'
    const statusColor = STATUS_COLORS[item.status] || colors.secondaryText

    return (
      <View style={styles.requestCard}>
        {/* Top row: action badge + status badge */}
        <View style={styles.badgeRow}>
          <View style={[styles.actionBadge, isAssign ? styles.actionBadgeAssign : styles.actionBadgeRemove]}>
            <ThemedText variant="badge" color="inverse" style={styles.actionBadgeText}>
              {isAssign ? t('actionAssign') : t('actionRemove')}
            </ThemedText>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <ThemedText variant="badge" color="inverse" style={styles.statusBadgeText}>
              {t(STATUS_KEYS[item.status] || item.status)}
            </ThemedText>
          </View>
        </View>

        {/* Target user + role */}
        <View style={styles.requestInfo}>
          <ThemedText variant="button" color="dark">
            {item.targetUser?.displayName} (@{item.targetUser?.username})
          </ThemedText>
          <View style={styles.roleBadge}>
            <ThemedText variant="badge" style={styles.roleBadgeText}>
              {t(ROLE_LABEL_KEYS[item.role] || item.role)}
            </ThemedText>
          </View>
        </View>

        {/* Location + category */}
        <View style={styles.requestMeta}>
          {item.location && (
            <ThemedText variant="caption" color="secondary">
              {t('atLocation', { location: item.location.name })}
            </ThemedText>
          )}
          {item.category && (
            <ThemedText variant="caption" color="secondary">
              {t('inCategory', { category: item.category.label })}
            </ThemedText>
          )}
        </View>

        {/* Requester */}
        <ThemedText variant="caption" color="secondary">
          {t('requestedBy')}: {item.requester?.displayName} (@{item.requester?.username})
        </ThemedText>

        {/* Reason */}
        {item.reason ? (
          <ThemedText variant="caption" color="secondary" style={styles.reasonText}>
            {t('reason')}: {item.reason}
          </ThemedText>
        ) : null}

        {/* Reviewer line (for resolved requests) */}
        {item.reviewer && (
          <ThemedText variant="caption" color="secondary">
            {t('reviewedBy', { name: `${item.reviewer.displayName} (@${item.reviewer.username})` })}
          </ThemedText>
        )}

        {/* Denial reason */}
        {item.status === 'denied' && item.denialReason ? (
          <ThemedText variant="caption" color="secondary" style={styles.reasonText}>
            {t('denialReasonLabel')}: {item.denialReason}
          </ThemedText>
        ) : null}

        {/* Timestamps */}
        <View style={styles.timestampRow}>
          {item.createdTime && (
            <ThemedText variant="caption" color="secondary">
              {t('createdAt')}: {new Date(item.createdTime).toLocaleDateString()}
            </ThemedText>
          )}
          {item.updatedTime && !isPending && (
            <ThemedText variant="caption" color="secondary">
              {t('resolvedAt')}: {new Date(item.updatedTime).toLocaleDateString()}
            </ThemedText>
          )}
        </View>

        {/* Auto-approve countdown (pending only) */}
        {isPending && item.autoApproveAt && (
          <View style={styles.countdownRow}>
            <ThemedText variant="caption" color="secondary">{t('autoApproveAt')}: </ThemedText>
            <CountdownTimer targetDate={item.autoApproveAt} />
          </View>
        )}

        {/* Action buttons */}
        {activeTab === 'pending' && isPending && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.approveButton}
              onPress={() => handleApprove(item.id)}
              disabled={processing === item.id}
              accessibilityRole="button"
              accessibilityLabel={t('approveA11y')}
              accessibilityState={{ disabled: processing === item.id }}
            >
              {processing === item.id ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  <ThemedText variant="buttonSmall" color="inverse">{t('approve')}</ThemedText>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.denyButton}
              onPress={() => { setDenyTargetId(item.id); setDenyModalVisible(true) }}
              disabled={processing === item.id}
              accessibilityRole="button"
              accessibilityLabel={t('denyA11y')}
              accessibilityState={{ disabled: processing === item.id }}
            >
              <Ionicons name="close" size={18} color={SemanticColors.warning} />
              <ThemedText variant="buttonSmall" color="error">{t('deny')}</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'mine' && isPending && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.rescindButton}
              onPress={() => handleRescind(item.id)}
              disabled={processing === item.id}
              accessibilityRole="button"
              accessibilityLabel={t('rescindA11y')}
              accessibilityState={{ disabled: processing === item.id }}
            >
              {processing === item.id ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="arrow-undo" size={18} color={colors.buttonDefaultText} />
                  <ThemedText variant="buttonSmall" style={{ color: colors.buttonDefaultText }}>{t('rescind')}</ThemedText>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    )
  }, [styles, t, activeTab, handleApprove, handleRescind, processing, colors])

  const renderAdminAction = useCallback(({ item }) => {
    const isBan = item.action === 'ban'
    return (
      <View style={styles.requestCard}>
        <View style={styles.badgeRow}>
          <View style={[styles.actionBadge, isBan ? styles.actionBadgeRemove : styles.actionBadgeAssign]}>
            <ThemedText variant="badge" color="inverse" style={styles.actionBadgeText}>
              {isBan ? t('actionBan') : t('actionUnban')}
            </ThemedText>
          </View>
        </View>
        <View style={styles.requestInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Avatar user={item.targetUser} size="sm" />
            <View>
              <ThemedText variant="button" color="dark">{item.targetUser?.displayName}</ThemedText>
              <ThemedText variant="caption" color="secondary">@{item.targetUser?.username}</ThemedText>
            </View>
          </View>
        </View>
        <ThemedText variant="caption" color="secondary">
          {t('performedBy', { name: `${item.performedBy?.displayName} (@${item.performedBy?.username})` })}
        </ThemedText>
        {item.reason && (
          <ThemedText variant="caption" color="secondary" style={styles.reasonText}>
            {t('reason')}: {item.reason}
          </ThemedText>
        )}
        {item.createdTime && (
          <ThemedText variant="caption" color="secondary">
            {t('createdAt')}: {new Date(item.createdTime).toLocaleDateString()}
          </ThemedText>
        )}
      </View>
    )
  }, [styles, t])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={styles.content}>
        <ThemedText variant="h1" title={true} style={styles.pageTitle}>{t('requestLogTitle')}</ThemedText>

        {/* Tab row */}
        <View style={styles.tabRow}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab
            const tabKey = tab === 'pending' ? 'tabNeedsReview' : tab === 'all' ? 'tabAllRequests' : tab === 'mine' ? 'tabMyRequests' : 'tabAdminActions'
            const a11yKey = tabKey + 'A11y'
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => handleTabChange(tab)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={t(a11yKey)}
              >
                <ThemedText
                  variant="buttonSmall"
                  style={[styles.tabText, isActive && styles.tabTextActive]}
                >
                  {t(tabKey)}
                </ThemedText>
              </TouchableOpacity>
            )
          })}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : activeTab === 'actions' ? (
          adminActions.length === 0 ? (
            <EmptyState
              icon="shield-outline"
              title={t('noAdminActions')}
              subtitle={getEmptySubtitle()}
              style={styles.emptyContainer}
            />
          ) : (
            <FlatList
              data={adminActions}
              keyExtractor={(item) => item.id}
              renderItem={renderAdminAction}
              contentContainerStyle={styles.listContent}
            />
          )
        ) : requests.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title={t('noRequests')}
            subtitle={getEmptySubtitle()}
            style={styles.emptyContainer}
          />
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.id}
            renderItem={renderRequest}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

      {/* Deny reason modal */}
      <BottomDrawerModal
        visible={denyModalVisible}
        onClose={() => { setDenyModalVisible(false); setDenyReason(''); setDenyTargetId(null) }}
        title={t('denyReason')}
        shrink

      >
        <View style={styles.modalContent}>
          <TextInput
            style={styles.reasonInput}
            value={denyReason}
            onChangeText={setDenyReason}
            placeholder={t('denyReasonPlaceholder')}
            placeholderTextColor={colors.placeholderText}
            multiline
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('denyReasonA11y')}
          />
          <TouchableOpacity
            style={styles.denySubmitButton}
            onPress={handleDeny}
            disabled={processing === denyTargetId}
            accessibilityRole="button"
            accessibilityLabel={t('deny')}
            accessibilityState={{ disabled: processing === denyTargetId }}
          >
            {processing === denyTargetId ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <ThemedText variant="button" color="inverse">{t('deny')}</ThemedText>
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
  content: {
    flex: 1,
    padding: 20,
  },
  pageTitle: {
    color: colors.primary,
    marginBottom: 16,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.buttonDefault,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.primarySurface,
  },
  tabText: {
    color: colors.buttonDefaultText,
  },
  tabTextActive: {
    color: colors.buttonSelectedText,
    fontWeight: '700',
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
  listContent: {
    paddingBottom: 20,
    gap: 12,
  },
  requestCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  actionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  actionBadgeAssign: {
    backgroundColor: SemanticColors.success,
  },
  actionBadgeRemove: {
    backgroundColor: SemanticColors.warning,
  },
  actionBadgeText: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  requestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  roleBadge: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: {
    color: colors.badgeText,
    fontWeight: '600',
  },
  requestMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  reasonText: {
    fontStyle: 'italic',
  },
  timestampRow: {
    flexDirection: 'row',
    gap: 16,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  approveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySurface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    flex: 1,
    justifyContent: 'center',
  },
  denyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: SemanticColors.warning,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    flex: 1,
    justifyContent: 'center',
  },
  rescindButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.buttonDefault,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    flex: 1,
    justifyContent: 'center',
  },
  modalContent: {
    padding: 16,
    gap: 16,
  },
  reasonInput: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: Typography.bodySmall.fontSize,
    color: colors.text,
    minHeight: 60,
    maxHeight: 120,
  },
  denySubmitButton: {
    backgroundColor: colors.primarySurface,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
  },
})
