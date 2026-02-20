import { StyleSheet, View } from 'react-native'
import { forwardRef, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { SemanticColors, OnBrandColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import SwipeableCard from './SwipeableCard'
import CardShell from '../CardShell'
import BridgingBadge from '../discuss/BridgingBadge'

const BridgingKudosCard = forwardRef(function BridgingKudosCard({
  bridgingKudos,
  onDismiss,
  isBackCard,
  backCardAnimatedValue,
}, ref) {
  const { t } = useTranslation('cards')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const { itemType, itemBody, threadTitle, upvoteCount, downvoteCount, bridgingScore } = bridgingKudos

  const headerContent = (
    <View style={styles.headerRow}>
      <Ionicons name="link-outline" size={28} color={OnBrandColors.text} />
      <View style={styles.titleContainer}>
        <ThemedText variant="statement" color="inverse" style={styles.headerTitle}>
          {t('bridgingKudosTitle')}
        </ThemedText>
        <ThemedText variant="button" style={styles.headerSubtext}>
          {t('bridgingKudosSubtitle')}
        </ThemedText>
      </View>
    </View>
  )

  const footerContent = (
    <View style={styles.footerInner}>
      <View style={styles.footerRow}>
        <View style={styles.voteInfo}>
          <View style={styles.voteRow}>
            <Ionicons name="arrow-up" size={16} color={OnBrandColors.text} />
            <ThemedText variant="button" style={styles.voteText}>{upvoteCount || 0}</ThemedText>
          </View>
          <View style={styles.voteRow}>
            <Ionicons name="arrow-down" size={16} color={OnBrandColors.text} />
            <ThemedText variant="button" style={styles.voteText}>{downvoteCount || 0}</ThemedText>
          </View>
        </View>
        <BridgingBadge item={{ bridgingScore, upvoteCount, downvoteCount }} />
      </View>
    </View>
  )

  return (
    <SwipeableCard
      ref={ref}
      onSwipeRight={onDismiss}
      onSwipeLeft={onDismiss}
      onSwipeDown={onDismiss}
      enableVerticalSwipe={true}
      leftSwipeAsPass={true}
      isBackCard={isBackCard}
      backCardAnimatedValue={backCardAnimatedValue}
      accessibilityLabel={t('bridgingKudosA11yLabel')}
      accessibilityHint={t('bridgingKudosA11yHint')}
    >
      <CardShell
        size="full"
        headerColor={SemanticColors.bridging}
        header={headerContent}
        footerColor={SemanticColors.bridging}
        footer={footerContent}
        bottomStyle={styles.footerSection}
      >
        <View style={styles.bodyContent}>
          {threadTitle && (
            <ThemedText variant="caption" color="secondary" style={styles.threadTitle} numberOfLines={1}>
              {t('bridgingKudosThread')} {threadTitle}
            </ThemedText>
          )}
          <ThemedText variant="caption" color="secondary" style={styles.itemTypeLabel}>
            {itemType === 'comment' ? t('bridgingKudosComment') : t('bridgingKudosPost')}
          </ThemedText>
          <ThemedText
            variant="statement"
            color="primary"
            style={styles.itemBody}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {itemBody}
          </ThemedText>
        </View>
      </CardShell>
    </SwipeableCard>
  )
})

export default BridgingKudosCard

const createStyles = (colors) => StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 4,
  },
  titleContainer: {
    flexDirection: 'column',
  },
  headerTitle: {
    fontStyle: 'italic',
  },
  headerSubtext: {
    color: OnBrandColors.textSecondary,
  },
  bodyContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  threadTitle: {
    textAlign: 'center',
    marginBottom: 4,
  },
  itemTypeLabel: {
    textAlign: 'center',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemBody: {
    textAlign: 'center',
  },
  footerSection: {
    flexGrow: 0,
    flexShrink: 0,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  footerInner: {
    gap: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voteInfo: {
    flexDirection: 'row',
    gap: 12,
  },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  voteText: {
    color: OnBrandColors.text,
  },
})
