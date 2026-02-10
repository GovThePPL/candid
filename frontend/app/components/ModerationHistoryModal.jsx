import { useState, useEffect, useMemo } from 'react'
import {
  View,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import { SemanticColors } from '../constants/Colors'
import ThemedText from './ThemedText'
import BottomDrawerModal from './BottomDrawerModal'
import Avatar from './Avatar'
import api from '../lib/api'

function getActionColors(colors) {
  return {
    permanent_ban: SemanticColors.warning,
    temporary_ban: '#E67E22',
    warning: '#F39C12',
    removed: colors.secondaryText,
    dismiss: SemanticColors.agree,
  }
}

const ACTION_LABELS = {
  permanent_ban: 'Permanent Ban',
  temporary_ban: 'Temporary Ban',
  warning: 'Warning',
  removed: 'Content Removed',
  dismiss: 'Dismissed',
}

function getAppealColors(colors) {
  return {
    pending: '#F39C12',
    approved: SemanticColors.agree,
    denied: SemanticColors.warning,
    escalated: '#E67E22',
    modified: colors.primary,
    overruled: '#9B59B6',
  }
}

const APPEAL_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
  escalated: 'Escalated',
  modified: 'Modified',
  overruled: 'Overruled',
}

function UserLine({ label, user, styles }) {
  if (!user) return null
  return (
    <View style={styles.userLine}>
      <ThemedText variant="caption" color="secondary" style={styles.chainLabel}>{label}</ThemedText>
      <ThemedText variant="label" style={styles.userName}>
        {user.displayName || 'Unknown'}{' '}
        <ThemedText variant="label" color="secondary" style={styles.userUsername}>@{user.username || 'unknown'}</ThemedText>
      </ThemedText>
    </View>
  )
}

function HistoryItem({ event, colors, styles }) {
  const [expanded, setExpanded] = useState(false)
  const actionColors = getActionColors(colors)
  const appealColors = getAppealColors(colors)
  const color = actionColors[event.actionType] || colors.secondaryText
  const date = event.actionDate
    ? new Date(event.actionDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  return (
    <View style={styles.historyCard}>
      {/* Card header: action badge + date */}
      <View style={[styles.cardHeader, { backgroundColor: color }]}>
        <ThemedText variant="label" color="inverse" style={styles.cardHeaderText}>
          {ACTION_LABELS[event.actionType] || event.actionType}{event.actionType === 'temporary_ban' && event.durationDays ? ` (${event.durationDays} days)` : ''}
        </ThemedText>
        {date && <ThemedText variant="caption" style={styles.cardHeaderDate}>{date}</ThemedText>}
      </View>

      {/* Rule title */}
      {event.rule?.title && (
        <View style={styles.ruleRow}>
          <Ionicons name="document-text-outline" size={14} color={colors.text} />
          <ThemedText variant="label" style={styles.ruleTitle}>{event.rule.title}</ThemedText>
        </View>
      )}

      {/* Target content (expandable) */}
      {event.targetContent && (
        <TouchableOpacity
          style={styles.targetContentBox}
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.7}
        >
          <ThemedText variant="label" style={styles.targetContent} numberOfLines={expanded ? undefined : 2}>
            "{event.targetContent}"
          </ThemedText>
        </TouchableOpacity>
      )}

      {/* Comment chain */}
      <View style={styles.commentChain}>
        {/* 1. Reporter */}
        {(event.reporter || event.reportReason) && (
          <View style={styles.chainItem}>
            <View style={styles.chainDot} />
            <View style={styles.chainContent}>
              <UserLine label="Reported by" user={event.reporter} styles={styles} />
              {event.reportReason && (
                <ThemedText variant="caption" style={styles.chainComment}>"{event.reportReason}"</ThemedText>
              )}
            </View>
          </View>
        )}

        {/* 2. Moderator action */}
        <View style={styles.chainItem}>
          <View style={[styles.chainDot, { backgroundColor: color }]} />
          <View style={styles.chainContent}>
            <UserLine label="Moderator action by" user={event.moderator} styles={styles} />
            <View style={[styles.chainActionBadge, { backgroundColor: color }]}>
              <ThemedText variant="caption" color="inverse" style={styles.chainActionBadgeText}>
                {ACTION_LABELS[event.actionType] || event.actionType}{event.actionType === 'temporary_ban' && event.durationDays ? ` (${event.durationDays} days)` : ''}
              </ThemedText>
            </View>
            {event.moderatorComment && (
              <ThemedText variant="caption" style={styles.chainComment}>"{event.moderatorComment}"</ThemedText>
            )}
          </View>
        </View>

        {/* 3. Appeal */}
        {event.appealState && (
          <View style={styles.chainItem}>
            <View style={[styles.chainDot, { backgroundColor: '#F39C12' }]} />
            <View style={styles.chainContent}>
              <UserLine label="Appeal by" user={event.appealUser} styles={styles} />
              {event.appealText && (
                <ThemedText variant="caption" style={styles.chainComment}>"{event.appealText}"</ThemedText>
              )}
            </View>
          </View>
        )}

        {/* 4. Appeal responses */}
        {event.appealResponses?.map((resp, i) => {
          const outcomeColor = resp.outcome === 'overruled' ? '#9B59B6'
            : resp.outcome === 'escalated' ? '#E67E22'
            : resp.outcome === 'admin_decision' ? appealColors[event.appealState] || colors.primary
            : colors.primary
          const outcomeLabel = resp.outcome === 'overruled' ? 'Overruled by'
            : resp.outcome === 'escalated' ? 'Escalated by'
            : resp.outcome === 'admin_decision' ? 'Admin response by'
            : 'Response by'
          return (
            <View key={i} style={styles.chainItem}>
              <View style={[styles.chainDot, { backgroundColor: outcomeColor }]} />
              <View style={styles.chainContent}>
                <UserLine label={outcomeLabel} user={resp.responder} styles={styles} />
                {resp.outcome && (
                  <View style={[styles.chainActionBadge, { backgroundColor: outcomeColor }]}>
                    <ThemedText variant="caption" color="inverse" style={styles.chainActionBadgeText}>
                      {resp.outcome === 'overruled' ? 'Overruled'
                        : resp.outcome === 'escalated' ? 'Escalated'
                        : resp.outcome === 'admin_decision' ? (APPEAL_LABELS[event.appealState] || event.appealState)
                        : ''}
                    </ThemedText>
                  </View>
                )}
                {resp.responseText && (
                  <ThemedText variant="caption" style={styles.chainComment}>"{resp.responseText}"</ThemedText>
                )}
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

export default function ModerationHistoryModal({ visible, onClose, userId, user }) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (visible && userId) {
      fetchHistory()
    }
  }, [visible, userId])

  const fetchHistory = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.moderation.getUserModerationHistory(userId)
      setHistory(data || [])
    } catch (err) {
      console.error('Failed to fetch moderation history:', err)
      setError('Failed to load history')
    } finally {
      setLoading(false)
    }
  }

  return (
    <BottomDrawerModal
      visible={visible}
      onClose={onClose}
      title="Moderation History"
      maxHeight="85%"
    >
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <ThemedText variant="bodySmall" style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity style={styles.retryButton} onPress={fetchHistory}>
            <ThemedText variant="buttonSmall" color="inverse">Retry</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Full user card */}
          {user && (
            <View style={styles.userCard}>
              <Avatar user={user} size="md" showKudosCount badgePosition="bottom-left" />
              <View style={styles.userCardInfo}>
                <ThemedText variant="h3" style={styles.userCardName}>{user.displayName || 'Unknown'}</ThemedText>
                <ThemedText variant="label" color="secondary">@{user.username || 'unknown'}</ThemedText>
                {user.status && user.status !== 'active' && (
                  <View style={[styles.statusBadge, user.status === 'banned' && styles.statusBadgeBanned]}>
                    <ThemedText variant="caption" color="inverse" style={styles.statusBadgeText}>{user.status}</ThemedText>
                  </View>
                )}
              </View>
            </View>
          )}

          {history.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-circle-outline" size={40} color={colors.secondaryText} />
              <ThemedText variant="button" color="secondary" style={styles.emptyText}>No moderation history</ThemedText>
            </View>
          ) : (
            history.map((event) => (
              <HistoryItem key={event.id} event={event} colors={colors} styles={styles} />
            ))
          )}
        </ScrollView>
      )}
    </BottomDrawerModal>
  )
}

const createStyles = (colors) => StyleSheet.create({
  centerContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  errorText: {
    color: SemanticColors.warning,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
  },
  emptyText: {
    fontWeight: '500',
  },

  // User card at top
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  userCardInfo: {
    flex: 1,
    gap: 2,
  },
  userCardName: {
    fontWeight: '700',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.secondaryText,
    marginTop: 2,
  },
  statusBadgeBanned: {
    backgroundColor: SemanticColors.warning,
  },
  statusBadgeText: {
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  // History card
  historyCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cardHeaderText: {
    fontWeight: '700',
  },
  cardHeaderDate: {
    color: 'rgba(255,255,255,0.9)',
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  ruleTitle: {
    flex: 1,
  },
  targetContentBox: {
    marginHorizontal: 12,
    marginTop: 6,
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 8,
  },
  targetContent: {
    fontWeight: undefined,
    fontStyle: 'italic',
    lineHeight: 18,
  },

  // Comment chain
  commentChain: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 0,
  },
  chainItem: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 6,
  },
  chainDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.secondaryText,
    marginTop: 5,
  },
  chainContent: {
    flex: 1,
    gap: 3,
  },
  chainLabel: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  userLine: {
    gap: 1,
  },
  userName: {
  },
  userUsername: {
    fontWeight: '400',
  },
  chainActionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  chainActionBadgeText: {
    fontWeight: '600',
  },
  chainComment: {
    fontStyle: 'italic',
    lineHeight: 16,
  },
})
