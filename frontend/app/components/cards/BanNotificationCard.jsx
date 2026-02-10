import { StyleSheet, View, Text, TouchableOpacity, TextInput, ActivityIndicator, ScrollView } from 'react-native'
import { useState, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../hooks/useThemeColors'
import { SemanticColors, BrandColor } from '../../constants/Colors'
import BottomDrawerModal from '../BottomDrawerModal'
import PositionInfoCard from '../PositionInfoCard'
import api from '../../lib/api'

const ACTION_COLORS = {
  permanent_ban: SemanticColors.warning,
  temporary_ban: '#E67E22',
  warning: '#F39C12',
}

const ACTION_LABELS = {
  permanent_ban: 'Permanent Ban',
  temporary_ban: 'Temporary Ban',
  warning: 'Warning',
  removed: 'Content Removed',
}

const APPEAL_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
  escalated: 'Escalated',
  modified: 'Modified',
  overruled: 'Overruled',
}

export default function BanNotificationCard({ banData }) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const ACTION_COLORS_DYNAMIC = useMemo(() => ({
    ...ACTION_COLORS,
    removed: colors.pass,
  }), [colors])

  const APPEAL_COLORS = useMemo(() => ({
    pending: '#F39C12',
    approved: SemanticColors.agree,
    denied: SemanticColors.warning,
    escalated: '#E67E22',
    modified: colors.primary,
    overruled: '#9B59B6',
  }), [colors])

  const { banType, reason, ruleTitle, modActionId, expiresAt, hasAppealed, targetContent, actionChain } = banData || {}
  const isPermanent = banType === 'permanent_ban'

  const [appealModalVisible, setAppealModalVisible] = useState(false)
  const [appealText, setAppealText] = useState('')
  const [appealSubmitting, setAppealSubmitting] = useState(false)
  const [appealSubmitted, setAppealSubmitted] = useState(!!hasAppealed)
  const [appealError, setAppealError] = useState(null)
  const [historyModalVisible, setHistoryModalVisible] = useState(false)

  const formattedExpiry = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      })
    : null

  const handleSubmitAppeal = async () => {
    if (!appealText.trim() || !modActionId) return
    setAppealSubmitting(true)
    setAppealError(null)
    try {
      await api.moderation.createAppeal(modActionId, appealText.trim())
      setAppealSubmitted(true)
      setTimeout(() => setAppealModalVisible(false), 1500)
    } catch (err) {
      setAppealError(err.body?.detail || err.message || 'Failed to submit appeal')
    } finally {
      setAppealSubmitting(false)
    }
  }

  return (
    <View style={styles.card}>
      <Ionicons name="warning" size={40} color={SemanticColors.warning} style={styles.warningIcon} />

      {/* Compact header */}
      <Text style={styles.title}>Account Suspended</Text>
      <Text style={styles.banType}>
        {isPermanent ? 'Permanent' : `Temporary${actionChain?.durationDays ? ` (${actionChain.durationDays} days)` : ''}`}
      </Text>
      {!isPermanent && formattedExpiry && (
        <Text style={styles.expiryText}>Expires {formattedExpiry}</Text>
      )}

      {/* Target content - the position/chat that caused the ban */}
      {targetContent && (
        <View style={styles.targetContentContainer}>
          <Text style={styles.targetContentLabel}>Content that led to this action:</Text>
          {targetContent.type === 'position' ? (
            <PositionInfoCard
              position={targetContent}
              authorSubtitle="username"
              style={styles.positionInfoCard}
              numberOfLines={2}
            />
          ) : targetContent.type === 'chat_log' ? (
            <PositionInfoCard
              position={{
                statement: targetContent.positionStatement,
                creator: targetContent.participants?.[0],
              }}
              authorSubtitle="username"
              label={`Chat: ${targetContent.participants?.map(p => p?.displayName).filter(Boolean).join(' & ')}`}
              style={styles.positionInfoCard}
              numberOfLines={2}
            />
          ) : null}
        </View>
      )}

      {/* Rule + reason combined in one compact section */}
      {(ruleTitle || reason) && (
        <View style={styles.detailsContainer}>
          {ruleTitle && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Rule:</Text>
              <Text style={styles.detailValue}>{ruleTitle}</Text>
            </View>
          )}
          {reason && (
            <View style={ruleTitle ? styles.detailRowBorder : styles.detailRow}>
              <Text style={styles.detailLabel}>Notes:</Text>
              <Text style={styles.detailValue} numberOfLines={3}>{reason}</Text>
            </View>
          )}
        </View>
      )}

      {/* Compact actions row - horizontal */}
      <View style={styles.actionsRow}>
        {modActionId && !appealSubmitted && (
          <TouchableOpacity
            style={styles.appealButton}
            onPress={() => setAppealModalVisible(true)}
          >
            <Ionicons name="megaphone-outline" size={15} color='#FFFFFF' />
            <Text style={styles.appealButtonText}>Appeal</Text>
          </TouchableOpacity>
        )}

        {appealSubmitted && (
          <View style={styles.appealSubmittedBadge}>
            <Ionicons name="checkmark-circle" size={15} color={SemanticColors.success} />
            <Text style={styles.appealSubmittedText}>Appeal Submitted</Text>
          </View>
        )}

        {actionChain && (
          <TouchableOpacity
            style={styles.detailsButton}
            onPress={() => setHistoryModalVisible(true)}
          >
            <Ionicons name="time-outline" size={15} color={colors.primary} />
            <Text style={styles.detailsButtonText}>Action Details</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.infoText}>
        You cannot create positions, vote, or chat while suspended.
      </Text>

      {/* Appeal Modal */}
      <BottomDrawerModal
        visible={appealModalVisible}
        onClose={() => setAppealModalVisible(false)}
        title="Submit Appeal"
        subtitle="Explain why you believe this action was incorrect"
      >
        <View style={styles.appealModalContent}>
          <TextInput
            style={styles.appealInput}
            placeholder="Describe why this decision should be reconsidered..."
            placeholderTextColor={colors.placeholderText}
            value={appealText}
            onChangeText={setAppealText}
            multiline
            maxLength={1000}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{appealText.length}/1000</Text>

          {appealError && (
            <Text style={styles.errorText}>{appealError}</Text>
          )}

          <TouchableOpacity
            style={[styles.submitAppealButton, (!appealText.trim() || appealSubmitting) && styles.submitAppealButtonDisabled]}
            onPress={handleSubmitAppeal}
            disabled={!appealText.trim() || appealSubmitting}
          >
            {appealSubmitting ? (
              <ActivityIndicator size="small" color='#FFFFFF' />
            ) : (
              <Text style={styles.submitAppealButtonText}>Submit Appeal</Text>
            )}
          </TouchableOpacity>
        </View>
      </BottomDrawerModal>

      {/* Action Details Modal */}
      <BottomDrawerModal
        visible={historyModalVisible}
        onClose={() => setHistoryModalVisible(false)}
        title="Action Details"
        maxHeight="85%"
      >
        {actionChain && (
          <ScrollView
            style={styles.historyScroll}
            contentContainerStyle={styles.historyScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <ActionChainCard chain={actionChain} colors={colors} styles={styles} actionColors={ACTION_COLORS_DYNAMIC} appealColors={APPEAL_COLORS} />
          </ScrollView>
        )}
      </BottomDrawerModal>
    </View>
  )
}

function ActionChainCard({ chain, colors, styles, actionColors, appealColors }) {
  const color = actionColors[chain.actionType] || colors.pass
  const date = chain.actionDate
    ? new Date(chain.actionDate).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null

  return (
    <View style={styles.historyCard}>
      {/* Action header badge */}
      <View style={[styles.cardHeader, { backgroundColor: color }]}>
        <Text style={styles.cardHeaderText}>
          {ACTION_LABELS[chain.actionType] || chain.actionType}
          {chain.actionType === 'temporary_ban' && chain.durationDays ? ` (${chain.durationDays} days)` : ''}
        </Text>
        {date && <Text style={styles.cardHeaderDate}>{date}</Text>}
      </View>

      {/* Rule title */}
      {chain.ruleTitle && (
        <View style={styles.chainRuleRow}>
          <Ionicons name="document-text-outline" size={14} color={colors.text} />
          <Text style={styles.chainRuleTitle}>{chain.ruleTitle}</Text>
        </View>
      )}

      {/* Comment chain */}
      <View style={styles.commentChain}>
        {/* Moderator decision */}
        <View style={styles.chainItem}>
          <View style={[styles.chainDot, { backgroundColor: color }]} />
          <View style={styles.chainContent}>
            <Text style={styles.chainLabel}>Moderator Decision</Text>
            <View style={[styles.chainActionBadge, { backgroundColor: color }]}>
              <Text style={styles.chainActionBadgeText}>
                {ACTION_LABELS[chain.actionType] || chain.actionType}
                {chain.actionType === 'temporary_ban' && chain.durationDays ? ` (${chain.durationDays} days)` : ''}
              </Text>
            </View>
            {chain.moderatorComment && (
              <Text style={styles.chainComment}>"{chain.moderatorComment}"</Text>
            )}
          </View>
        </View>

        {/* User's appeal */}
        {chain.appealState && (
          <View style={styles.chainItem}>
            <View style={[styles.chainDot, { backgroundColor: '#F39C12' }]} />
            <View style={styles.chainContent}>
              <Text style={styles.chainLabel}>Your Appeal</Text>
              {chain.appealText && (
                <Text style={styles.chainComment}>"{chain.appealText}"</Text>
              )}
              <View style={[styles.appealStateBadge, { backgroundColor: appealColors[chain.appealState] || colors.pass }]}>
                <Text style={styles.appealStateBadgeText}>
                  {APPEAL_LABELS[chain.appealState] || chain.appealState}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Appeal responses */}
        {chain.appealResponses?.map((resp, i) => {
          const outcomeColor = resp.outcome === 'overruled' ? '#9B59B6'
            : resp.outcome === 'escalated' ? '#E67E22'
            : resp.outcome === 'admin_decision' ? (appealColors[chain.appealState] || colors.primary)
            : colors.primary
          const outcomeLabel = resp.outcome === 'overruled' ? 'Overruled'
            : resp.outcome === 'escalated' ? 'Escalated to Admin'
            : resp.outcome === 'admin_decision' ? (APPEAL_LABELS[chain.appealState] || 'Decision')
            : null
          return (
            <View key={i} style={styles.chainItem}>
              <View style={[styles.chainDot, { backgroundColor: outcomeColor }]} />
              <View style={styles.chainContent}>
                <Text style={styles.chainLabel}>{resp.role || 'Moderator'}</Text>
                {outcomeLabel && (
                  <View style={[styles.chainActionBadge, { backgroundColor: outcomeColor }]}>
                    <Text style={styles.chainActionBadgeText}>{outcomeLabel}</Text>
                  </View>
                )}
                {resp.responseText && (
                  <Text style={styles.chainComment}>"{resp.responseText}"</Text>
                )}
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: SemanticColors.warning,
  },
  warningIcon: {
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: SemanticColors.warning,
    textAlign: 'center',
  },
  banType: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginTop: 2,
  },
  expiryText: {
    fontSize: 12,
    color: colors.secondaryText,
    textAlign: 'center',
    marginTop: 2,
  },

  // Target content
  targetContentContainer: {
    width: '100%',
    marginTop: 8,
  },
  targetContentLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.secondaryText,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  positionInfoCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
    padding: 10,
  },

  // Combined details block
  detailsContainer: {
    width: '100%',
    backgroundColor: '#FFF5F5',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 6,
  },
  detailRowBorder: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondaryText,
    minWidth: 40,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },

  // Actions row - horizontal
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 12,
  },
  appealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  appealButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  appealSubmittedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: SemanticColors.success + '18',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: SemanticColors.success + '40',
  },
  appealSubmittedText: {
    color: SemanticColors.success,
    fontSize: 13,
    fontWeight: '600',
  },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: BrandColor + '18',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BrandColor + '40',
  },
  detailsButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  infoText: {
    fontSize: 12,
    color: colors.secondaryText,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 16,
  },
  appealModalContent: {
    padding: 16,
  },
  appealInput: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: colors.text,
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  charCount: {
    textAlign: 'right',
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 4,
  },
  errorText: {
    color: SemanticColors.warning,
    fontSize: 13,
    marginTop: 8,
  },
  submitAppealButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 16,
  },
  submitAppealButtonDisabled: {
    opacity: 0.5,
  },
  submitAppealButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  // History drawer
  historyScroll: {
    flex: 1,
  },
  historyScrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
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
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  cardHeaderDate: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  chainRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  chainRuleTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
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
    backgroundColor: colors.pass,
    marginTop: 5,
  },
  chainContent: {
    flex: 1,
    gap: 3,
  },
  chainLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.secondaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  chainActionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  chainActionBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  chainComment: {
    fontSize: 12,
    color: colors.text,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  appealStateBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 2,
  },
  appealStateBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
})
