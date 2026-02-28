import { useMemo, useCallback } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import Animated from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius, Shadows, Typography } from '../../constants/Theme'
import { SemanticColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import useExpandCollapse from '../../hooks/useExpandCollapse'

/**
 * Displays voting results after voting closes.
 * Winner is shown prominently; detailed results are behind animated "Show more".
 */
export default function ElectionResults({ results }) {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const router = useRouter()

  const {
    expanded, measured,
    handleContentLayout: handleDetailLayout,
    toggle: handleToggle, clipStyle,
  } = useExpandCollapse({ collapsedHeight: 0 })

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

  const winner = winners?.[0]
  const winnerInfo = winner ? candidateMap[winner.proposalPostId] : null

  const navigateToPost = useCallback((postId) => {
    router.push({ pathname: '/discuss/[id]', params: { id: postId } })
  }, [router])

  const hasDetails = (irvRounds?.length > 0) ||
    (method === 'condorcet' && condorcetMatrix && winner) ||
    (candidates?.length > 0)

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText variant="h3" style={styles.headerTitle}>{t('resultsTitle')}</ThemedText>
        <ThemedText variant="caption" color="secondary">
          {t('totalBallots', { count: totalBallots })}
        </ThemedText>
      </View>

      {/* Winner — tappable to view post */}
      {winner && (
        <TouchableOpacity
          style={styles.winnerRow}
          onPress={() => navigateToPost(winner.proposalPostId)}
          activeOpacity={0.7}
          accessibilityRole="link"
          accessibilityLabel={t('resultsWinnerA11y', { title: winnerInfo?.title || '' })}
        >
          <Ionicons name="trophy" size={18} color={SemanticColors.warning} />
          <ThemedText variant="body" style={styles.winnerTitle} numberOfLines={2}>
            {winnerInfo?.title || winner.proposalPostId}
          </ThemedText>
          <Ionicons name="chevron-forward" size={16} color={colors.secondaryText} />
        </TouchableOpacity>
      )}

      {/* Animated detail section */}
      {hasDetails && (
        <View style={styles.detailWrapper}>
          <Animated.View style={[
            styles.detailClip,
            !measured && { height: 0 },
            measured && clipStyle,
          ]}>
            <View
              style={!measured ? styles.measuringInner : undefined}
              onLayout={handleDetailLayout}
            >
              {/* IRV elimination rounds */}
              {irvRounds?.length > 0 && (
                <View style={styles.section}>
                  <ThemedText variant="h4" style={styles.sectionTitle}>{t('eliminationRounds')}</ThemedText>
                  {irvRounds.map((round, i) => (
                    <View key={i} style={styles.roundRow}>
                      <ThemedText variant="caption" style={styles.roundLabel}>
                        {t('eliminationRound', { round: round.round })}
                      </ThemedText>
                      {round.counts && Object.entries(round.counts).map(([pid, count]) => (
                        <View key={pid} style={styles.voteCountRow}>
                          <View style={styles.votePill}>
                            <ThemedText variant="caption" style={styles.votePillText}>{count}</ThemedText>
                          </View>
                          <ThemedText variant="caption" color="secondary" numberOfLines={1} style={styles.voteCountName}>
                            {candidateMap[pid]?.title || pid}
                          </ThemedText>
                        </View>
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
              {method === 'condorcet' && condorcetMatrix && winner && (
                <View style={styles.section}>
                  <ThemedText variant="h4" style={styles.sectionTitle}>{t('pairwiseRecord')}</ThemedText>
                  {Object.entries(condorcetMatrix[winner.proposalPostId] || {}).map(([opponentId, wins]) => {
                    const losses = condorcetMatrix[opponentId]?.[winner.proposalPostId] || 0
                    return (
                      <View key={opponentId} style={styles.voteCountRow}>
                        <View style={styles.votePill}>
                          <ThemedText variant="caption" style={styles.votePillText}>{wins}-{losses}</ThemedText>
                        </View>
                        <ThemedText variant="caption" color="secondary" numberOfLines={1} style={styles.voteCountName}>
                          {candidateMap[opponentId]?.title || opponentId}
                        </ThemedText>
                      </View>
                    )
                  })}
                </View>
              )}

              {/* All candidates — tappable titles with endorsement counts */}
              <View style={styles.section}>
                <ThemedText variant="h4" style={styles.sectionTitle}>{t('allCandidates')}</ThemedText>
                {(candidates || []).map((c, i) => {
                  const isWinner = winners?.some(w => w.proposalPostId === c.proposalPostId)
                  return (
                    <View key={c.proposalPostId} style={styles.candidateRow}>
                      <ThemedText variant="caption" style={[styles.candidateRank, isWinner && { color: colors.primary, fontWeight: '700' }]}>
                        {i + 1}.
                      </ThemedText>
                      <TouchableOpacity
                        style={styles.candidateTitleWrap}
                        onPress={() => navigateToPost(c.proposalPostId)}
                        activeOpacity={0.7}
                        accessibilityRole="link"
                        accessibilityLabel={c.title}
                      >
                        <ThemedText variant="body" style={[styles.candidateTitle, isWinner && { fontWeight: '700' }]}>
                          {c.title}
                        </ThemedText>
                        {c.endorsementCount != null && (
                          <ThemedText variant="caption" color="secondary">
                            {c.endorsementCount} {t('endorsements')}
                          </ThemedText>
                        )}
                      </TouchableOpacity>
                    </View>
                  )
                })}
              </View>
            </View>
          </Animated.View>

        </View>
      )}

      {/* Expand/collapse at bottom of card */}
      {hasDetails && (
        <TouchableOpacity
          style={styles.expandButton}
          onPress={handleToggle}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={expanded ? t('resultsShowLessA11y') : t('resultsShowMoreA11y')}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <ThemedText variant="caption" color="primary" style={styles.expandText}>
            {expanded ? t('resultsShowLess') : t('resultsShowMore')}
          </ThemedText>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.primary}
          />
        </TouchableOpacity>
      )}
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
    marginBottom: Spacing.sm,
    flexWrap: 'wrap',
  },
  headerTitle: {
    color: colors.text,
  },
  winnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.primary + '12',
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  winnerTitle: {
    flex: 1,
    fontWeight: '700',
  },
  detailWrapper: {
    position: 'relative',
    marginTop: Spacing.sm,
  },
  detailClip: {
    overflow: 'hidden',
  },
  measuringInner: {
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: Spacing.sm,
  },
  expandText: {
    fontWeight: '600',
  },
  section: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
  },
  roundRow: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    gap: 4,
    borderLeftWidth: 2,
    borderLeftColor: colors.cardBorder,
    marginLeft: Spacing.xs,
  },
  roundLabel: {
    fontWeight: '600',
  },
  voteCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 2,
  },
  votePill: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 32,
    alignItems: 'center',
  },
  votePillText: {
    ...Typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  voteCountName: {
    flex: 1,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  candidateRank: {
    ...Typography.caption,
    fontWeight: '600',
    width: 24,
    textAlign: 'center',
    marginTop: 2,
  },
  candidateTitleWrap: {
    flex: 1,
  },
  candidateTitle: {
    color: colors.primary,
  },
})
