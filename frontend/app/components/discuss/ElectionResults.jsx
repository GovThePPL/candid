import { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius, Shadows, Typography } from '../../constants/Theme'
import { BrandColor, OnBrandColors, SemanticColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'

/**
 * Displays election results after voting closes.
 */
export default function ElectionResults({ results }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  if (!results) return null

  const { method, winners, totalBallots, candidates, irvRounds, condorcetMatrix } = results

  // Build a map of candidate info
  const candidateMap = useMemo(() => {
    const map = {}
    for (const c of candidates || []) {
      map[c.proposalPostId] = c
    }
    return map
  }, [candidates])

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="trophy" size={22} color={BrandColor} />
        <ThemedText variant="h3" style={styles.title}>{t('resultsTitle')}</ThemedText>
      </View>

      {/* Method badge */}
      <View style={styles.methodRow}>
        <View style={styles.methodBadge}>
          <ThemedText variant="caption" style={styles.methodText}>
            {method === 'condorcet' ? t('condorcetWinner') : t('irvWinner')}
          </ThemedText>
        </View>
        <ThemedText variant="caption" color="secondary">
          {t('totalBallots', { count: totalBallots })}
        </ThemedText>
      </View>

      {/* Winners */}
      {winners?.map((winner, i) => {
        const info = candidateMap[winner.proposalPostId]
        return (
          <View key={winner.proposalPostId} style={[styles.winnerRow, i === 0 && styles.firstWinner]}>
            <View style={styles.winnerBadge}>
              <Ionicons name="trophy" size={14} color={OnBrandColors.text} />
              <ThemedText variant="caption" style={styles.winnerBadgeText}>
                #{winner.rank}
              </ThemedText>
            </View>
            <View style={styles.winnerInfo}>
              <ThemedText variant="body" style={{ fontWeight: '700' }}>
                {info?.title || winner.proposalPostId}
              </ThemedText>
              {info?.endorsementCount != null && (
                <ThemedText variant="caption" color="secondary">
                  {t('endorsementCount', { count: info.endorsementCount })}
                </ThemedText>
              )}
            </View>
          </View>
        )
      })}

      {/* IRV elimination rounds */}
      {irvRounds?.length > 0 && (
        <View style={styles.section}>
          <ThemedText variant="h4" style={styles.sectionTitle}>{t('eliminationRounds')}</ThemedText>
          {irvRounds.map((round, i) => (
            <View key={i} style={styles.roundRow}>
              <ThemedText variant="caption" style={{ fontWeight: '600' }}>
                {t('eliminationRound', { round: round.round })}
              </ThemedText>
              {round.counts && Object.entries(round.counts).map(([pid, count]) => (
                <ThemedText key={pid} variant="caption" color="secondary">
                  {t('candidateVoteCount', { name: candidateMap[pid]?.title || pid, count })}
                </ThemedText>
              ))}
              {round.eliminated && (
                <ThemedText variant="caption" color="error">
                  {t('eliminatedCandidate', { name: candidateMap[round.eliminated]?.title || round.eliminated })}
                </ThemedText>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Condorcet pairwise record for winner */}
      {method === 'condorcet' && condorcetMatrix && winners?.[0] && (
        <View style={styles.section}>
          <ThemedText variant="h4" style={styles.sectionTitle}>{t('pairwiseRecord')}</ThemedText>
          {Object.entries(condorcetMatrix[winners[0].proposalPostId] || {}).map(([opponentId, wins]) => {
            const losses = condorcetMatrix[opponentId]?.[winners[0].proposalPostId] || 0
            return (
              <ThemedText key={opponentId} variant="caption" color="secondary">
                {t('pairwiseMatchup', { opponent: candidateMap[opponentId]?.title || opponentId, wins, losses })}
              </ThemedText>
            )
          })}
        </View>
      )}

      {/* All candidates ranked */}
      <View style={styles.section}>
        <ThemedText variant="h4" style={styles.sectionTitle}>{t('allCandidates')}</ThemedText>
        {(candidates || []).map((c, i) => {
          const isWinner = winners?.some(w => w.proposalPostId === c.proposalPostId)
          return (
            <View key={c.proposalPostId} style={styles.candidateRow}>
              <ThemedText variant="caption" style={[styles.candidateRank, isWinner && { color: BrandColor }]}>
                {isWinner ? '★' : `${i + 1}.`}
              </ThemedText>
              <ThemedText variant="body" numberOfLines={1} style={{ flex: 1 }}>
                {c.title}
              </ThemedText>
              <ThemedText variant="caption" color="secondary">
                {c.endorsementCount} {t('endorsements')}
              </ThemedText>
            </View>
          )
        })}
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
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  methodBadge: {
    backgroundColor: BrandColor,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
  },
  methodText: {
    ...Typography.caption,
    color: OnBrandColors.text,
    fontWeight: '600',
  },
  winnerRow: {
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
  firstWinner: {
    backgroundColor: BrandColor + '15',
    borderColor: BrandColor + '40',
  },
  winnerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BrandColor,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  winnerBadgeText: {
    ...Typography.caption,
    color: OnBrandColors.text,
    fontWeight: '700',
  },
  winnerInfo: {
    flex: 1,
    gap: 2,
  },
  section: {
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
  },
  roundRow: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    gap: 2,
    borderLeftWidth: 2,
    borderLeftColor: colors.cardBorder,
    marginLeft: Spacing.xs,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  candidateRank: {
    ...Typography.caption,
    fontWeight: '600',
    width: 24,
    textAlign: 'center',
  },
})
