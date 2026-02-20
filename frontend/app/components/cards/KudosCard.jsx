import { StyleSheet, View } from 'react-native'
import { forwardRef, useMemo } from 'react'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { BrandColor, OnBrandColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import SwipeableCard from './SwipeableCard'
import CardShell from '../CardShell'
import PositionInfoCard from '../PositionInfoCard'
import UserCard from '../UserCard'

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
      {/* Kudos Icon — white star */}
      <Ionicons name="star" size={36} color="#FFFFFF" />

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
      {/* Handshake (left) + Sender info (right) */}
      <View style={styles.footerRow}>
        <MaterialCommunityIcons name="handshake-outline" size={38} color={OnBrandColors.text} />
        <View>
          <UserCard
            user={otherParticipant}
            colorScheme="onBrand"
            label={userAlreadySentKudos ? t('kudosFrom') : t('kudosSentBy')}
          />
        </View>
      </View>

      {/* Agreed-upon statement — centered in remaining space */}
      {parsedClosingStatement && (
        <View style={styles.closureWrapper}>
          <ThemedText
            variant="statement"
            color="inverse"
            style={styles.closureText}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {parsedClosingStatement}
          </ThemedText>
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
        bottomStyle={styles.footerSection}
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
  titleContainer: {
    flexDirection: 'column',
  },
  headerTitle: {
    fontStyle: 'italic',
  },
  headerSubtext: {
    color: OnBrandColors.textSecondary,
  },
  // Footer — grows into available space but yields to body when tight
  footerSection: {
    flexGrow: 0.5,
    flexShrink: 1,
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  footerInner: {
    flex: 1,
    gap: 16,
  },
  closureWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closureText: {
    textAlign: 'center',
  },
})
