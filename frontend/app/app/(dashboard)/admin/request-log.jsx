import { StyleSheet, View, TouchableOpacity, FlatList, ActivityIndicator, TextInput, Alert, Platform, ScrollView } from 'react-native'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { useUser } from '../../../hooks/useUser'
import { SemanticColors } from '../../../constants/Colors'
import { Typography } from '../../../constants/Theme'
import { ROLE_LABEL_KEYS } from '../../../lib/roles'
import { ROLE_COLORS } from '../../../components/discuss/RoleBadge'
import api, { translateError } from '../../../lib/api'
import UserCard from '../../../components/UserCard'
import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import EmptyState from '../../../components/EmptyState'
import BottomDrawerModal from '../../../components/BottomDrawerModal'
import LocationCategoryBadge from '../../../components/LocationCategoryBadge'
import { useToast } from '../../../components/Toast'

const TABS = ['pending', 'all', 'mine']

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
  const toastRef = useRef(toast)
  toastRef.current = toast

  const [activeTab, setActiveTab] = useState('pending')
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)

  // Deny modal state
  const [denyModalVisible, setDenyModalVisible] = useState(false)
  const [denyTargetId, setDenyTargetId] = useState(null)
  const [denyReason, setDenyReason] = useState('')

  const fetchRequests = useCallback(async (tab) => {
    setLoading(true)
    try {
      if (tab === 'all') {
        // Merge role requests + admin actions into a unified activity feed
        const [reqData, actionData] = await Promise.all([
          api.admin.getRoleRequests(tab),
          api.admin.getAdminActions(),
        ])
        const merged = [...(reqData || []), ...(actionData || [])]
        merged.sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0))
        setRequests(merged)
      } else {
        const data = await api.admin.getRoleRequests(tab)
        setRequests(data || [])
      }
    } catch (err) {
      toastRef.current?.(translateError(err.message, t) || t('loadError'), 'error')
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchRequests(activeTab)
  }, [activeTab, fetchRequests])

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
    if (activeTab === 'all') return t('noActivitySubtitle')
    return t('noRequestsMineSubtitle')
  }

  const renderItem = useCallback(({ item }) => {
    const isAdminAction = item.action === 'ban' || item.action === 'unban'

    if (isAdminAction) {
      const isBan = item.action === 'ban'
      return (
        <View style={styles.requestCard}>
          <View style={styles.cardTopRow}>
            <View style={{ flex: 1 }} />
            <View style={[styles.actionBadge, isBan ? styles.actionBadgeRemove : styles.actionBadgeAssign]}>
              <ThemedText variant="badge" color="inverse" style={styles.actionBadgeText}>
                {isBan ? t('actionBan') : t('actionUnban')}
              </ThemedText>
            </View>
          </View>
          <View style={styles.targetSection}>
            <UserCard user={item.targetUser} avatarSize="sm" nameVariant="label" style={{ flex: 1, minWidth: 0 }} />
          </View>
          <View style={styles.requesterSection}>
            <UserCard user={item.performedBy} avatarSize="sm" nameVariant="label" label={t('performedByLabel')} />
            {item.reason && (
              <ThemedText variant="body" color="dark" style={styles.reasonText}>
                {item.reason}
              </ThemedText>
            )}
          </View>
          {item.createdTime && (
            <ThemedText variant="caption" color="secondary">
              {t('createdAt')}: {new Date(item.createdTime).toLocaleDateString()}
            </ThemedText>
          )}
        </View>
      )
    }

    const isAssign = item.action === 'assign'
    const isPending = item.status === 'pending'
    const statusColor = STATUS_COLORS[item.status] || colors.secondaryText
    const roleColor = ROLE_COLORS[item.role] || colors.badgeBg

    return (
      <View style={styles.requestCard}>
        {/* Top row: location+category left, status + action right */}
        <View style={styles.cardTopRow}>
          <LocationCategoryBadge
            location={item.location}
            category={item.category}
            size="md"
          />
          <View style={styles.topRowRight}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <ThemedText variant="badge" color="inverse" style={styles.statusBadgeText}>
                {t(STATUS_KEYS[item.status] || item.status)}
              </ThemedText>
            </View>
            <View style={[styles.actionBadge, isAssign ? styles.actionBadgeAssign : styles.actionBadgeRemove]}>
              <ThemedText variant="badge" color="inverse" style={styles.actionBadgeText}>
                {isAssign ? t('actionAssign') : t('actionRemove')}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Target user + role in colored section */}
        <View style={[styles.targetSection, { backgroundColor: roleColor + '18' }]}>
          <View style={styles.requestInfo}>
            <UserCard user={item.targetUser} avatarSize="sm" nameVariant="label" style={{ flex: 1, minWidth: 0 }} />
            <View style={[styles.roleBadge, { backgroundColor: roleColor + '30' }]}>
              <ThemedText variant="badge" style={[styles.roleBadgeText, { color: roleColor }]}>
                {t(ROLE_LABEL_KEYS[item.role] || item.role)}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Requester + reason */}
        <View style={styles.requesterSection}>
          <UserCard user={item.requester} avatarSize="sm" nameVariant="label" label={t('requestedBy')} />
          {item.reason ? (
            <ThemedText variant="body" color="dark" style={styles.reasonText}>
              {item.reason}
            </ThemedText>
          ) : null}
        </View>

        {/* Reviewer section (for resolved requests) */}
        {item.reviewer && (
          <View style={styles.reviewerSection}>
            <UserCard user={item.reviewer} avatarSize="sm" nameVariant="label" label={t('reviewedByLabel')} />
            {item.status === 'approved' || item.status === 'auto_approved' ? (
              <View style={[styles.decisionBadge, styles.decisionApproved]}>
                <Ionicons name="checkmark-circle" size={14} color={SemanticColors.success} />
                <ThemedText variant="badge" style={{ color: SemanticColors.success, fontWeight: '600' }}>
                  {t(STATUS_KEYS.approved)}
                </ThemedText>
              </View>
            ) : item.status === 'denied' ? (
              <>
                <View style={[styles.decisionBadge, styles.decisionDenied]}>
                  <Ionicons name="close-circle" size={14} color={SemanticColors.warning} />
                  <ThemedText variant="badge" style={{ color: SemanticColors.warning, fontWeight: '600' }}>
                    {t(STATUS_KEYS.denied)}
                  </ThemedText>
                </View>
                {item.denialReason ? (
                  <ThemedText variant="body" color="dark" style={styles.reasonText}>
                    {t('denialReasonLabel')}: {item.denialReason}
                  </ThemedText>
                ) : null}
              </>
            ) : null}
          </View>
        )}

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={styles.content}>
        <ThemedText variant="h1" title={true} style={styles.pageTitle}>{t('requestLogTitle')}</ThemedText>

        {/* Tab row */}
        <View style={styles.tabRow} accessibilityRole="tablist">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabScrollContent}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab
              const tabKey = tab === 'pending' ? 'tabNeedsReview' : tab === 'all' ? 'tabActivity' : 'tabMyRequests'
              const a11yKey = tabKey + 'A11y'
              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tab, isActive && styles.tabActive]}
                  onPress={() => handleTabChange(tab)}
                  activeOpacity={0.7}
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
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : requests.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title={activeTab === 'all' ? t('noActivity') : t('noRequests')}
            subtitle={getEmptySubtitle()}
            style={styles.emptyContainer}
          />
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
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
  },
  pageTitle: {
    color: colors.primary,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  tabRow: {
    marginBottom: 16,
  },
  tabScrollContent: {
    gap: 8,
    paddingHorizontal: 16,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  tabActive: {
    backgroundColor: colors.buttonSelected,
    borderColor: colors.buttonSelected,
  },
  tabText: {
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.buttonSelectedText,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  listContent: {
    paddingBottom: 20,
    paddingHorizontal: 16,
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
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  targetSection: {
    borderRadius: 10,
    padding: 12,
    gap: 8,
    backgroundColor: colors.background,
  },
  requestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontWeight: '600',
  },
  requesterSection: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  reviewerSection: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  decisionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  decisionApproved: {
    backgroundColor: SemanticColors.success + '18',
  },
  decisionDenied: {
    backgroundColor: SemanticColors.warning + '18',
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
