import { StyleSheet, View } from 'react-native'
import { forwardRef, useMemo } from 'react'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { BrandColor, OnBrandColors, SemanticColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import SwipeableCard from './SwipeableCard'
import Avatar from '../Avatar'
import CardShell from '../CardShell'
import PositionInfoCard from '../PositionInfoCard'
import KudosMedallion from '../KudosMedallion'

const KudosCard = forwardRef(function KudosCard({
  kudos,
  onSendKudos,
  onAcknowledge,
  onDismiss,
  isBackCard,
  backCardAnimatedValue,
}, ref) {
  const { t } = useTranslation('cards')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { otherParticipant, position, closingStatement, userAlreadySentKudos } = kudos

  // If user already sent kudos, any swipe just acknowledges
  const handleRightSwipe = userAlreadySentKudos ? onAcknowledge : onSendKudos
  const handleOtherSwipe = userAlreadySentKudos ? onAcknowledge : onDismiss

  const parsedClosingStatement = closingStatement?.content || null

  const headerContent = (
    <View style={styles.headerRow}>
      {/* Kudos Icon */}
      <View style={styles.iconContainer}>
        <KudosMedallion active={true} size={48} />
      </View>

      {/* Title and Subtitle */}
      <View style={styles.titleContainer}>
        <ThemedText variant="statement" color="inverse" style={styles.headerTitle}>
          {userAlreadySentKudos ? t('kudosReceived') : t('kudosYouReceived')}
        </ThemedText>
        <ThemedText variant="button" style={styles.headerSubtext}>
          {userAlreadySentKudos
            ? t('kudosAcknowledge')
            : t('kudosSendBack')}
        </ThemedText>
      </View>
    </View>
  )

  const footerContent = (
    <View style={styles.footerInner}>
      {/* Sender info */}
      <View style={styles.senderRow}>
        <ThemedText variant="badgeLg" style={styles.footerLabel}>
          {userAlreadySentKudos ? t('kudosFrom') : t('kudosSentBy')}
        </ThemedText>
        <Avatar user={otherParticipant} size="sm" showKudosCount badgePosition="bottom-left" />
        <View style={styles.senderInfo}>
          <ThemedText variant="buttonSmall" color="inverse">{otherParticipant?.displayName || t('anonymous')}</ThemedText>
          <ThemedText variant="caption" style={styles.senderUsername}>@{otherParticipant?.username || t('anonymousUsername')}</ThemedText>
        </View>
      </View>

      {/* Agreed closure */}
      {parsedClosingStatement && (
        <View style={styles.closureRow}>
          <MaterialCommunityIcons name="handshake-outline" size={18} color={OnBrandColors.text} />
          <ThemedText variant="bodySmall" color="inverse" style={styles.closureText}>{parsedClosingStatement}</ThemedText>
        </View>
      )}
    </View>
  )

  return (
    <SwipeableCard
      ref={ref}
      onSwipeRight={handleRightSwipe}
      onSwipeLeft={handleOtherSwipe}
      onSwipeDown={handleOtherSwipe}
      enableVerticalSwipe={true}
      rightSwipeAsKudos={!userAlreadySentKudos}
      leftSwipeAsPass={true}
      isBackCard={isBackCard}
      backCardAnimatedValue={backCardAnimatedValue}
      accessibilityLabel={t('kudosA11yLabel', { name: otherParticipant?.displayName || t('anonymous') })}
      accessibilityHint={userAlreadySentKudos ? t('kudosA11yHintAcknowledge') : t('kudosA11yHintSendBack')}
    >
      <CardShell
        size="full"
        headerColor={BrandColor}
        header={headerContent}
        footerColor={colors.agreeSurface}
        footer={footerContent}
      >
        <PositionInfoCard
          size="full"
          position={position}
          authorSubtitle="username"
        />
      </CardShell>
    </SwipeableCard>
  )
})

export default KudosCard

const createStyles = (colors) => StyleSheet.create({
  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 4,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
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
  // Footer
  footerInner: {
    gap: 8,
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerLabel: {
    color: OnBrandColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  senderInfo: {
    flexDirection: 'column',
  },
  senderUsername: {
    color: OnBrandColors.textSecondary,
  },
  closureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: OnBrandColors.overlay,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closureText: {
    flex: 1,
  },
})
