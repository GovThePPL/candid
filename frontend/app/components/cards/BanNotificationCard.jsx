import { StyleSheet, View, TouchableOpacity, TextInput, ActivityIndicator, ScrollView } from 'react-native'
import { useState, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { SemanticColors, BrandColor } from '../../constants/Colors'
import { Typography } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import BottomDrawerModal from '../BottomDrawerModal'
import PositionInfoCard from '../PositionInfoCard'
import api from '../../lib/api'

const ACTION_COLORS = {
  permanent_ban: SemanticColors.warning,
  temporary_ban: '#E67E22',
  warning: '#F39C12',
}

const getActionLabels = (t) => ({
  permanent_ban: t('banPermanentBan'),
  temporary_ban: t('banTemporaryBan'),
  warning: t('banWarning'),
  removed: t('banContentRemoved'),
})

const getAppealLabels = (t) => ({
  pending: t('banAppealPending'),
  approved: t('banAppealApproved'),
  denied: t('banAppealDenied'),
  escalated: t('banAppealEscalated'),
  modified: t('banAppealModified'),
  overruled: t('banAppealOverruled'),
})

export default function BanNotificationCard({ banData }) {
  const { t } = useTranslation('cards')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const ACTION_LABELS = useMemo(() => getActionLabels(t), [t])
  const APPEAL_LABELS = useMemo(() => getAppealLabels(t), [t])

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
      setAppealError(err.body?.detail || err.message || t('banAppealError'))
    } finally {
      setAppealSubmitting(false)
    }
  }

  return (
    <View style={styles.card}>
      <Ionicons name="warning" size={40} color={SemanticColors.warning} style={styles.warningIcon} accessible={false} importantForAccessibility="no-hide-descendants" />

      {/* Compact header */}
      <ThemedText variant="h4" color="error" style={styles.title}>{t('banAccountSuspended')}</ThemedText>
      <ThemedText variant="buttonSmall" style={styles.banType}>
        {isPermanent ? t('banPermanent') : actionChain?.durationDays ? t('banTemporaryDuration', { days: actionChain.durationDays }) : t('banTemporary')}
      </ThemedText>
      {!isPermanent && formattedExpiry && (
        <ThemedText variant="caption" color="secondary" style={styles.expiryText}>{t('banExpires')} {formattedExpiry}</ThemedText>
      )}

      {/* Target content - the position/chat that caused the ban */}
      {targetContent && (
        <View style={styles.targetContentContainer}>
          <ThemedText variant="caption" color="secondary" style={styles.targetContentLabel}>{t('banContentLabel')}</ThemedText>
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
              label={t('banChatLabel', { participants: targetContent.participants?.map(p => p?.displayName).filter(Boolean).join(' & ') })}
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
              <ThemedText variant="caption" color="secondary" style={styles.detailLabel}>{t('banRuleLabel')}</ThemedText>
              <ThemedText variant="label" style={styles.detailValue}>{ruleTitle}</ThemedText>
            </View>
          )}
          {reason && (
            <View style={ruleTitle ? styles.detailRowBorder : styles.detailRow}>
              <ThemedText variant="caption" color="secondary" style={styles.detailLabel}>{t('banNotesLabel')}</ThemedText>
              <ThemedText variant="label" style={styles.detailValue} numberOfLines={3}>{reason}</ThemedText>
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
            accessibilityRole="button"
            accessibilityLabel={t('banAppealButton')}
          >
            <Ionicons name="megaphone-outline" size={15} color='#FFFFFF' />
            <ThemedText variant="buttonSmall" color="inverse">{t('banAppealButton')}</ThemedText>
          </TouchableOpacity>
        )}

        {appealSubmitted && (
          <View style={styles.appealSubmittedBadge}>
            <Ionicons name="checkmark-circle" size={15} color={SemanticColors.success} />
            <ThemedText variant="label" color="agree">{t('banAppealSubmitted')}</ThemedText>
          </View>
        )}

        {actionChain && (
          <TouchableOpacity
            style={styles.detailsButton}
            onPress={() => setHistoryModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('banActionDetails')}
          >
            <Ionicons name="time-outline" size={15} color={colors.primary} />
            <ThemedText variant="label" color="primary">{t('banActionDetails')}</ThemedText>
          </TouchableOpacity>
        )}
      </View>

      <ThemedText variant="caption" color="secondary" style={styles.infoText}>
        {t('banRestrictions')}
      </ThemedText>

      {/* Appeal Modal */}
      <BottomDrawerModal
        visible={appealModalVisible}
        onClose={() => setAppealModalVisible(false)}
        title={t('banSubmitAppealTitle')}
        subtitle={t('banSubmitAppealSubtitle')}
      >
        <View style={styles.appealModalContent}>
          <TextInput
            style={styles.appealInput}
            placeholder={t('banAppealPlaceholder')}
            placeholderTextColor={colors.placeholderText}
            value={appealText}
            onChangeText={setAppealText}
            multiline
            maxLength={1000}
            textAlignVertical="top"
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('banAppealInputLabel')}
          />
          <ThemedText variant="caption" color="secondary" style={styles.charCount}>{appealText.length}/1000</ThemedText>

          {appealError && (
            <ThemedText variant="label" color="error" style={styles.errorText}>{appealError}</ThemedText>
          )}

          <TouchableOpacity
            style={[styles.submitAppealButton, (!appealText.trim() || appealSubmitting) && styles.submitAppealButtonDisabled]}
            onPress={handleSubmitAppeal}
            disabled={!appealText.trim() || appealSubmitting}
            accessibilityRole="button"
            accessibilityLabel={t('banSubmitAppealButton')}
            accessibilityState={{ disabled: !appealText.trim() || appealSubmitting }}
          >
            {appealSubmitting ? (
              <ActivityIndicator size="small" color='#FFFFFF' />
            ) : (
              <ThemedText variant="button" color="inverse">{t('banSubmitAppealButton')}</ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </BottomDrawerModal>

      {/* Action Details Modal */}
      <BottomDrawerModal
        visible={historyModalVisible}
        onClose={() => setHistoryModalVisible(false)}
        title={t('banActionDetails')}
        maxHeight="85%"
      >
        {actionChain && (
          <ScrollView
            style={styles.historyScroll}
            contentContainerStyle={styles.historyScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <ActionChainCard chain={actionChain} colors={colors} styles={styles} actionColors={ACTION_COLORS_DYNAMIC} appealColors={APPEAL_COLORS} actionLabels={ACTION_LABELS} appealLabels={APPEAL_LABELS} t={t} />
          </ScrollView>
        )}
      </BottomDrawerModal>
    </View>
  )
}

function ActionChainCard({ chain, colors, styles, actionColors, appealColors, actionLabels, appealLabels, t }) {
  const ACTION_LABELS = actionLabels
  const APPEAL_LABELS = appealLabels
  const color = actionColors[chain.actionType] || colors.pass
  const date = chain.actionDate
    ? new Date(chain.actionDate).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null

  return (
    <View style={styles.historyCard}>
      {/* Action header badge */}
      <View style={[styles.cardHeader, { backgroundColor: color }]}>
        <ThemedText variant="label" color="inverse" style={styles.cardHeaderText}>
          {ACTION_LABELS[chain.actionType] || chain.actionType}
          {chain.actionType === 'temporary_ban' && chain.durationDays ? ' ' + t('moderation:durationDays', { days: chain.durationDays }) : ''}
        </ThemedText>
        {date && <ThemedText variant="caption" style={styles.cardHeaderDate}>{date}</ThemedText>}
      </View>

      {/* Rule title */}
      {chain.ruleTitle && (
        <View style={styles.chainRuleRow}>
          <Ionicons name="document-text-outline" size={14} color={colors.text} />
          <ThemedText variant="label" style={styles.chainRuleTitle}>{chain.ruleTitle}</ThemedText>
        </View>
      )}

      {/* Comment chain */}
      <View style={styles.commentChain}>
        {/* Moderator decision */}
        <View style={styles.chainItem}>
          <View style={[styles.chainDot, { backgroundColor: color }]} />
          <View style={styles.chainContent}>
            <ThemedText variant="caption" color="secondary" style={styles.chainLabel}>{t('banModeratorDecision')}</ThemedText>
            <View style={[styles.chainActionBadge, { backgroundColor: color }]}>
              <ThemedText variant="caption" color="inverse" style={styles.chainActionBadgeText}>
                {ACTION_LABELS[chain.actionType] || chain.actionType}
                {chain.actionType === 'temporary_ban' && chain.durationDays ? ' ' + t('moderation:durationDays', { days: chain.durationDays }) : ''}
              </ThemedText>
            </View>
            {chain.moderatorComment && (
              <ThemedText variant="caption" style={styles.chainComment}>"{chain.moderatorComment}"</ThemedText>
            )}
          </View>
        </View>

        {/* User's appeal */}
        {chain.appealState && (
          <View style={styles.chainItem}>
            <View style={[styles.chainDot, { backgroundColor: '#F39C12' }]} />
            <View style={styles.chainContent}>
              <ThemedText variant="caption" color="secondary" style={styles.chainLabel}>{t('banYourAppeal')}</ThemedText>
              {chain.appealText && (
                <ThemedText variant="caption" style={styles.chainComment}>"{chain.appealText}"</ThemedText>
              )}
              <View style={[styles.appealStateBadge, { backgroundColor: appealColors[chain.appealState] || colors.pass }]}>
                <ThemedText variant="caption" color="inverse" style={styles.appealStateBadgeText}>
                  {APPEAL_LABELS[chain.appealState] || chain.appealState}
                </ThemedText>
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
          const outcomeLabel = resp.outcome === 'overruled' ? t('banOutcomeOverruled')
            : resp.outcome === 'escalated' ? t('banOutcomeEscalated')
            : resp.outcome === 'admin_decision' ? (APPEAL_LABELS[chain.appealState] || chain.appealState)
            : null
          return (
            <View key={i} style={styles.chainItem}>
              <View style={[styles.chainDot, { backgroundColor: outcomeColor }]} />
              <View style={styles.chainContent}>
                <ThemedText variant="caption" color="secondary" style={styles.chainLabel}>{resp.role || t('moderator')}</ThemedText>
                {outcomeLabel && (
                  <View style={[styles.chainActionBadge, { backgroundColor: outcomeColor }]}>
                    <ThemedText variant="caption" color="inverse" style={styles.chainActionBadgeText}>{outcomeLabel}</ThemedText>
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
    textAlign: 'center',
  },
  banType: {
    textAlign: 'center',
    marginTop: 2,
  },
  expiryText: {
    textAlign: 'center',
    marginTop: 2,
  },

  // Target content
  targetContentContainer: {
    width: '100%',
    marginTop: 8,
  },
  targetContentLabel: {
    fontWeight: '600',
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
    backgroundColor: colors.errorBannerBg,
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
    fontWeight: '700',
    minWidth: 40,
  },
  detailValue: {
    fontWeight: '400',
    flex: 1,
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
  infoText: {
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 16,
  },
  appealModalContent: {
    padding: 16,
  },
  appealInput: {
    ...Typography.body,
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    color: colors.text,
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  charCount: {
    textAlign: 'right',
    marginTop: 4,
  },
  errorText: {
    fontWeight: '400',
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
    fontWeight: '700',
  },
  cardHeaderDate: {
    color: 'rgba(255,255,255,0.9)',
  },
  chainRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  chainRuleTitle: {
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
    fontWeight: '600',
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
    fontWeight: '600',
  },
  chainComment: {
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
    fontWeight: '600',
  },
})
