import { useState, useMemo, useCallback } from 'react'
import {
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Typography, Spacing, BorderRadius } from '../../constants/Theme'
import { SemanticColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import ReviewDiffContent from './ReviewDiffContent'
import SuggestionForm from './SuggestionForm'
import api from '../../lib/api'

const STATUS_CONFIG = {
  pending: { icon: 'time-outline', colorKey: 'pending' },
  approved: { icon: 'checkmark-circle-outline', colorKey: 'success' },
  denied: { icon: 'close-circle-outline', colorKey: 'warning' },
  withdrawn: { icon: 'arrow-undo-outline', colorKey: 'neutral' },
  superseded: { icon: 'swap-horizontal-outline', colorKey: 'neutral' },
}

/**
 * Detail view for a wiki suggestion. Shows diff of proposed changes vs original,
 * status, stale warning, and action buttons for review/withdraw.
 *
 * @param {Object} props
 * @param {Object} props.suggestion - Full suggestion object from API
 * @param {string} props.currentUserId - Current logged-in user ID
 * @param {boolean} props.canReview - Whether current user can approve/deny
 * @param {Function} props.onUpdate - Called with updated suggestion after action
 * @param {Function} props.onClose - Called to close the detail view
 */
export default function SuggestionDetail({
  suggestion,
  currentUserId,
  canReview,
  onUpdate,
  onClose,
}) {
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [reviewNote, setReviewNote] = useState('')
  const [actionLoading, setActionLoading] = useState(null) // 'approved'|'denied'|'withdrawn'
  const [error, setError] = useState(null)
  const [showEditApprove, setShowEditApprove] = useState(false)

  const isPending = suggestion.status === 'pending'
  const isSubmitter = suggestion.suggestedBy?.id === currentUserId
  const statusCfg = STATUS_CONFIG[suggestion.status] || STATUS_CONFIG.pending
  const statusColor = SemanticColors[statusCfg.colorKey] || SemanticColors.neutral
  const isTerm = suggestion.suggestionType === 'new_term' || suggestion.suggestionType === 'edit_term'

  const typeLabel = useMemo(() => {
    const key = {
      new_term: 'suggestionNewTerm',
      edit_term: 'suggestionEditTerm',
      new_page: 'suggestionNewPage',
      edit_page: 'suggestionEditPage',
    }[suggestion.suggestionType]
    return key ? t(key) : suggestion.suggestionType
  }, [suggestion.suggestionType, t])

  // Build original and proposed objects for diff
  const original = useMemo(() => ({
    title: suggestion.originalTitle || '',
    aliases: suggestion.originalAliases || [],
    summary: suggestion.originalSummary || '',
    content: suggestion.originalContent || '',
    wikiCategory: suggestion.originalWikiCategory || '',
    scopes: suggestion.originalScopes || [],
    scopeCombine: suggestion.originalScopeCombine || 'or',
  }), [suggestion])

  const proposed = useMemo(() => ({
    title: suggestion.proposedTitle || '',
    aliases: suggestion.proposedAliases || [],
    summary: suggestion.proposedSummary || '',
    content: suggestion.proposedContent || '',
    wikiCategory: suggestion.proposedWikiCategory || '',
    scopes: suggestion.proposedScopes || [],
    scopeCombine: suggestion.proposedScopeCombine || 'or',
  }), [suggestion])

  const confirmAction = useCallback((title, message) => {
    if (Platform.OS === 'web') {
      return Promise.resolve(window.confirm(message))
    }
    return new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: t('common:cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: title, onPress: () => resolve(true) },
      ])
    })
  }, [t])

  const handleAction = useCallback(async (status) => {
    // Confirmation
    if (status === 'approved') {
      const confirmed = await confirmAction(t('suggestionApprove'), t('suggestionApproveConfirm'))
      if (!confirmed) return
    }
    if (status === 'denied') {
      if (!reviewNote.trim()) {
        setError(t('suggestionReviewNotePlaceholder'))
        return
      }
      const confirmed = await confirmAction(t('suggestionDeny'), t('suggestionDenyConfirm'))
      if (!confirmed) return
    }

    setActionLoading(status)
    setError(null)

    try {
      const body = { status }
      if (reviewNote.trim()) body.reviewNote = reviewNote.trim()
      const updated = await api.wiki.updateSuggestion(suggestion.id, body)
      onUpdate?.(updated)
    } catch (err) {
      const msg = err?.body?.detail || err?.message || t('suggestionError')
      setError(msg)
    } finally {
      setActionLoading(null)
    }
  }, [suggestion.id, reviewNote, onUpdate, t, confirmAction])

  // Handle "Edit & Approve" — open SuggestionForm pre-filled with proposed content
  const handleEditApproveSuccess = useCallback(async (editedData) => {
    setShowEditApprove(false)
    setActionLoading('approved')
    setError(null)

    try {
      const body = {
        status: 'approved',
        proposedTitle: editedData.title,
        proposedSummary: editedData.summary,
        proposedContent: editedData.content,
        proposedWikiCategory: editedData.wikiCategory,
        proposedAliases: editedData.aliases,
        proposedScopes: editedData.scopes,
        proposedScopeCombine: editedData.scopeCombine,
      }
      if (reviewNote.trim()) body.reviewNote = reviewNote.trim()
      const updated = await api.wiki.updateSuggestion(suggestion.id, body)
      onUpdate?.(updated)
    } catch (err) {
      const msg = err?.body?.detail || err?.message || t('suggestionError')
      setError(msg)
    } finally {
      setActionLoading(null)
    }
  }, [suggestion.id, reviewNote, onUpdate, t])

  // If showing Edit & Approve form, render SuggestionForm
  if (showEditApprove) {
    const existingForForm = {
      term: suggestion.proposedTitle,
      title: suggestion.proposedTitle,
      aliases: suggestion.proposedAliases || [],
      summary: suggestion.proposedSummary || '',
      content: suggestion.proposedContent || '',
      wikiCategory: suggestion.proposedWikiCategory || '',
      scopes: suggestion.proposedScopes || [],
      scopeCombine: suggestion.proposedScopeCombine || 'or',
    }

    return (
      <SuggestionForm
        suggestionType={suggestion.suggestionType}
        existing={existingForForm}
        glossaryTermId={suggestion.glossaryTermId}
        glossaryTermSlug={suggestion.glossaryTermSlug}
        wikiPagePath={suggestion.wikiPagePath}
        directEdit={false}
        reviewerEdit
        onSuccess={(result) => {
          // result is the edited form data
          handleEditApproveSuccess({
            title: result.proposedTitle || result.title,
            summary: result.proposedSummary || result.summary,
            content: result.proposedContent || result.content,
            wikiCategory: result.proposedWikiCategory || result.wikiCategory,
            aliases: result.proposedAliases || result.aliases || [],
            scopes: result.proposedScopes || result.scopes || [],
            scopeCombine: result.proposedScopeCombine || result.scopeCombine || 'or',
          })
        }}
        onCancel={() => setShowEditApprove(false)}
      />
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common:back')}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <ThemedText variant="h3" color="dark" numberOfLines={1}>
            {suggestion.proposedTitle}
          </ThemedText>
          <ThemedText variant="caption" color="secondary">{typeLabel}</ThemedText>
        </View>
      </View>

      {/* Status badge */}
      <View style={styles.statusRow}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <Ionicons name={statusCfg.icon} size={16} color={statusColor} />
          <ThemedText variant="label" style={{ color: statusColor }}>
            {t(`suggestionStatus${suggestion.status.charAt(0).toUpperCase() + suggestion.status.slice(1)}`)}
          </ThemedText>
        </View>
        {suggestion.suggestedBy && (
          <ThemedText variant="caption" color="secondary">
            {t('suggestionBy', { author: suggestion.suggestedBy.displayName || suggestion.suggestedBy.username })}
          </ThemedText>
        )}
      </View>

      {/* Stale warning */}
      {suggestion.isStale && isPending && (
        <View style={styles.staleWarning}>
          <Ionicons name="warning-outline" size={18} color={colors.warningBannerText} />
          <View style={{ flex: 1 }}>
            <ThemedText variant="label" style={{ color: colors.warningBannerText }}>
              {t('suggestionStaleWarning')}
            </ThemedText>
            <ThemedText variant="caption" style={{ color: colors.warningBannerText }}>
              {t('suggestionStaleWarningDetail')}
            </ThemedText>
          </View>
        </View>
      )}

      {/* Superseded notice */}
      {suggestion.status === 'superseded' && (
        <View style={styles.staleWarning}>
          <Ionicons name="information-circle-outline" size={18} color={colors.warningBannerText} />
          <ThemedText variant="bodySmall" style={{ color: colors.warningBannerText, flex: 1 }}>
            {t('suggestionSupersededNotice')}
          </ThemedText>
        </View>
      )}

      {/* Diff view of proposed changes */}
      <View style={styles.section}>
        <ThemedText variant="label" color="primary">{t('suggestionProposedChanges')}</ThemedText>
        <ReviewDiffContent
          original={original}
          proposed={proposed}
          isTerm={isTerm}
        />
      </View>

      {/* Reason */}
      {suggestion.suggestionReason && (
        <View style={styles.section}>
          <ThemedText variant="label" color="secondary">{t('suggestionReason')}</ThemedText>
          <ThemedText variant="body" color="dark">{suggestion.suggestionReason}</ThemedText>
        </View>
      )}

      {/* Review info (if reviewed) */}
      {suggestion.reviewedBy && (
        <View style={styles.section}>
          <ThemedText variant="label" color="secondary">{t('suggestionReviewNote')}</ThemedText>
          {suggestion.reviewNote && (
            <ThemedText variant="body" color="dark">{suggestion.reviewNote}</ThemedText>
          )}
          <ThemedText variant="caption" color="secondary">
            {t('suggestionBy', { author: suggestion.reviewedBy.displayName || suggestion.reviewedBy.username })}
          </ThemedText>
        </View>
      )}

      {/* Action section (only for pending suggestions) */}
      {isPending && (canReview || isSubmitter) && (
        <View style={styles.actionSection}>
          {/* Review note input (for reviewers) */}
          {canReview && (
            <View style={styles.field}>
              <ThemedText variant="label" color="secondary">{t('suggestionReviewNote')}</ThemedText>
              <TextInput
                style={[styles.textInput, styles.multiline]}
                value={reviewNote}
                onChangeText={setReviewNote}
                placeholder={t('suggestionReviewNotePlaceholder')}
                placeholderTextColor={colors.placeholderText}
                multiline
                numberOfLines={2}
                maxFontSizeMultiplier={1.5}
                accessibilityLabel={t('suggestionReviewNote')}
              />
            </View>
          )}

          {/* Error */}
          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={SemanticColors.warning} />
              <ThemedText variant="bodySmall" style={{ color: SemanticColors.warning, flex: 1 }}>
                {error}
              </ThemedText>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actionButtons}>
            {canReview && (
              <>
                <TouchableOpacity
                  style={[styles.actionButton, styles.approveButton]}
                  onPress={() => handleAction('approved')}
                  disabled={!!actionLoading}
                  accessibilityRole="button"
                  accessibilityLabel={t('suggestionApproveA11y')}
                >
                  {actionLoading === 'approved' ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                      <ThemedText variant="button" style={{ color: '#FFFFFF' }}>
                        {t('suggestionApprove')}
                      </ThemedText>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.denyButton]}
                  onPress={() => handleAction('denied')}
                  disabled={!!actionLoading}
                  accessibilityRole="button"
                  accessibilityLabel={t('suggestionDenyA11y')}
                >
                  {actionLoading === 'denied' ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="close-circle" size={18} color="#FFFFFF" />
                      <ThemedText variant="button" style={{ color: '#FFFFFF' }}>
                        {t('suggestionDeny')}
                      </ThemedText>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
            {isSubmitter && (
              <TouchableOpacity
                style={[styles.actionButton, styles.withdrawButton]}
                onPress={() => handleAction('withdrawn')}
                disabled={!!actionLoading}
                accessibilityRole="button"
                accessibilityLabel={t('suggestionWithdrawA11y')}
              >
                {actionLoading === 'withdrawn' ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <>
                    <Ionicons name="arrow-undo" size={18} color={colors.text} />
                    <ThemedText variant="button" color="dark">
                      {t('suggestionWithdraw')}
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Edit & Approve button (separate row for reviewers) */}
          {canReview && (
            <TouchableOpacity
              style={[styles.editApproveButton]}
              onPress={() => setShowEditApprove(true)}
              disabled={!!actionLoading}
              accessibilityRole="button"
              accessibilityLabel={t('editAndApproveA11y')}
            >
              <Ionicons name="create-outline" size={18} color={colors.primary} />
              <ThemedText variant="button" style={{ color: colors.primary }}>
                {t('editAndApprove')}
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCenter: {
    flex: 1,
    gap: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  staleWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: colors.warningBannerBg,
    borderRadius: BorderRadius.sm,
  },
  section: {
    gap: 8,
    padding: 12,
    backgroundColor: colors.cardBackground,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  actionSection: {
    gap: 12,
    marginTop: 8,
  },
  field: {
    gap: 6,
  },
  textInput: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    ...Typography.body,
  },
  multiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.errorBannerBg,
    borderRadius: BorderRadius.sm,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: BorderRadius.sm,
  },
  approveButton: {
    backgroundColor: SemanticColors.success,
  },
  denyButton: {
    backgroundColor: SemanticColors.warning,
  },
  withdrawButton: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  editApproveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.cardBackground,
  },
})
