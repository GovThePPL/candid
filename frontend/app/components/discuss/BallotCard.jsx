import { useState, useMemo, useCallback } from 'react'
import { View, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius, Shadows, Typography } from '../../constants/Theme'
import { BrandColor, OnBrandColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'

/**
 * Ballot card for RCV voting.
 *
 * Two modes:
 * - **Interactive** (default): Tap-to-rank candidates, submit ballot inline.
 * - **Read-only** (`readOnly` prop): Displays submitted rankings with a
 *   "Modify Ballot" button that calls `onEdit`.
 */
export default function BallotCard({ candidates, existingRankings, onSubmit, onEdit, readOnly, loading }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  // Rankings: { proposalPostId: rank }
  const [rankings, setRankings] = useState(() => {
    if (!existingRankings?.length) return {}
    const map = {}
    for (const r of existingRankings) {
      map[r.proposalPostId] = r.rank
    }
    return map
  })

  const [submitting, setSubmitting] = useState(false)

  const nextRank = useMemo(() => {
    const ranks = Object.values(rankings)
    return ranks.length > 0 ? Math.max(...ranks) + 1 : 1
  }, [rankings])

  const handleTapCandidate = useCallback((proposalPostId) => {
    setRankings(prev => {
      if (prev[proposalPostId]) {
        // Remove rank and resequence
        const removedRank = prev[proposalPostId]
        const next = {}
        for (const [pid, rank] of Object.entries(prev)) {
          if (pid === proposalPostId) continue
          next[pid] = rank > removedRank ? rank - 1 : rank
        }
        return next
      }
      // Assign next rank
      return { ...prev, [proposalPostId]: Object.keys(prev).length + 1 }
    })
  }, [])

  const handleClearAll = useCallback(() => {
    setRankings({})
  }, [])

  const handleSubmit = useCallback(async () => {
    const rankingsList = Object.entries(rankings)
      .map(([proposalPostId, rank]) => ({ proposalPostId, rank }))
      .sort((a, b) => a.rank - b.rank)

    if (rankingsList.length === 0) {
      Alert.alert(t('ballotEmptyTitle'), t('ballotEmptyMessage'))
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(rankingsList)
    } finally {
      setSubmitting(false)
    }
  }, [rankings, onSubmit, t])

  const isUpdate = existingRankings?.length > 0

  // Read-only mode: show submitted rankings sorted by rank, with edit button
  if (readOnly) {
    const rankedCandidates = candidates
      .filter(c => rankings[c.proposalPostId] != null)
      .sort((a, b) => rankings[a.proposalPostId] - rankings[b.proposalPostId])

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="checkmark-circle" size={20} color={BrandColor} />
          <ThemedText variant="h3" style={styles.title}>{t('ballotSubmittedTitle')}</ThemedText>
        </View>

        {rankedCandidates.map((candidate) => {
          const rank = rankings[candidate.proposalPostId]
          return (
            <View key={candidate.proposalPostId} style={[styles.candidateRow, styles.candidateRanked]}>
              <View style={[styles.rankBadge, styles.rankBadgeActive]}>
                <ThemedText variant="caption" style={styles.rankText}>{rank}</ThemedText>
              </View>
              <View style={styles.candidateInfo}>
                <ThemedText variant="body" numberOfLines={2} style={{ fontWeight: '600' }}>
                  {candidate.title}
                </ThemedText>
              </View>
            </View>
          )
        })}

        {onEdit && (
          <View style={styles.actions}>
            <View />
            <TouchableOpacity
              style={styles.editButton}
              onPress={onEdit}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('ballotUpdateButtonA11y')}
            >
              <Ionicons name="create-outline" size={18} color={colors.primary} />
              <ThemedText variant="buttonSmall" style={{ color: colors.primary }}>
                {t('ballotUpdateButton')}
              </ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="list-outline" size={20} color={BrandColor} />
        <ThemedText variant="h3" style={styles.title}>{t('ballotTitle')}</ThemedText>
      </View>
      <ThemedText variant="bodySmall" color="secondary" style={styles.instruction}>
        {t('ballotInstruction')}
      </ThemedText>

      {candidates.map((candidate) => {
        const rank = rankings[candidate.proposalPostId]
        const isRanked = rank != null
        return (
          <TouchableOpacity
            key={candidate.proposalPostId}
            style={[styles.candidateRow, isRanked && styles.candidateRanked]}
            onPress={() => handleTapCandidate(candidate.proposalPostId)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('rankProposalA11y', { title: candidate.title, rank: rank || t('unranked') })}
            accessibilityState={{ selected: isRanked }}
          >
            <View style={[styles.rankBadge, isRanked && styles.rankBadgeActive]}>
              {isRanked ? (
                <ThemedText variant="caption" style={styles.rankText}>{rank}</ThemedText>
              ) : (
                <Ionicons name="add" size={16} color={colors.secondaryText} />
              )}
            </View>
            <View style={styles.candidateInfo}>
              <ThemedText variant="body" numberOfLines={2} style={isRanked && { fontWeight: '600' }}>
                {candidate.title}
              </ThemedText>
              <ThemedText variant="caption" color="secondary">
                {t('endorsementCount', { count: candidate.endorsementCount })}
              </ThemedText>
            </View>
          </TouchableOpacity>
        )
      })}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.clearButton}
          onPress={handleClearAll}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('clearRankingA11y')}
        >
          <ThemedText variant="caption" color="secondary">{t('clearRanking')}</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting || Object.keys(rankings).length === 0}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={isUpdate ? t('updateBallotA11y') : t('submitBallotA11y')}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={OnBrandColors.text} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color={OnBrandColors.text} />
              <ThemedText variant="buttonSmall" style={styles.submitText}>
                {isUpdate ? t('updateBallot') : t('submitBallot')}
              </ThemedText>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    backgroundColor: colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
    ...Shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  title: {
    color: BrandColor,
  },
  instruction: {
    marginBottom: Spacing.md,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  candidateRanked: {
    backgroundColor: colors.primary + '10',
    borderColor: colors.primary + '40',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeActive: {
    backgroundColor: BrandColor,
    borderColor: BrandColor,
  },
  rankText: {
    ...Typography.caption,
    color: OnBrandColors.text,
    fontWeight: '700',
  },
  candidateInfo: {
    flex: 1,
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  clearButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: BrandColor,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: OnBrandColors.text,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
})
