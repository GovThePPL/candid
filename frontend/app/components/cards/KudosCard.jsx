import { StyleSheet, View } from 'react-native'
import { forwardRef, useMemo } from 'react'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useThemeColors } from '../../hooks/useThemeColors'
import { SemanticColors, BrandColor } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import SwipeableCard from './SwipeableCard'
import Avatar from '../Avatar'
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
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { otherParticipant, position, closingStatement, userAlreadySentKudos } = kudos

  // If user already sent kudos, any swipe just acknowledges
  const handleRightSwipe = userAlreadySentKudos ? onAcknowledge : onSendKudos
  const handleOtherSwipe = userAlreadySentKudos ? onAcknowledge : onDismiss

  const parsedClosingStatement = closingStatement?.content || null

  return (
    <SwipeableCard
      ref={ref}
      onSwipeRight={handleRightSwipe}
      onSwipeLeft={handleOtherSwipe}
      onSwipeDown={handleOtherSwipe}
      enableVerticalSwipe={true}
      rightSwipeAsKudos={!userAlreadySentKudos}
      isBackCard={isBackCard}
      backCardAnimatedValue={backCardAnimatedValue}
    >
      <View style={styles.card}>
        {/* Purple header — kudos medallion + sender info */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerTypeTag}>
              <KudosMedallion active={true} size={36} />
              <ThemedText variant="badgeLg" color="inverse" style={styles.headerTypeText}>Kudos</ThemedText>
            </View>
            <View style={styles.headerContent}>
              <ThemedText variant="buttonSmall" color="inverse" style={styles.headerTitle}>
                {userAlreadySentKudos ? 'Kudos Received!' : 'You Received Kudos!'}
              </ThemedText>
              <ThemedText variant="caption" style={styles.headerSubtext}>
                {userAlreadySentKudos
                  ? 'Swipe to acknowledge'
                  : 'Swipe right to send kudos back'}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* White body — position card with rounded corners over colored sections */}
        <View style={styles.bodyWrapper}>
          <View style={styles.body}>
            <PositionInfoCard
              position={position}
              authorSubtitle="username"
            />
          </View>
        </View>

        {/* White bottom curve over green */}
        <View style={styles.bodyBottomCurve} />

        {/* Green footer — sender info + closure */}
        <View style={styles.footer}>
          {/* Sender info */}
          <View style={styles.senderRow}>
            <ThemedText variant="badgeLg" style={styles.footerLabel}>
              {userAlreadySentKudos ? 'Kudos from' : 'Sent by'}
            </ThemedText>
            <Avatar user={otherParticipant} size="sm" showKudosCount badgePosition="bottom-left" />
            <View style={styles.senderInfo}>
              <ThemedText variant="buttonSmall" color="inverse">{otherParticipant?.displayName || 'Anonymous'}</ThemedText>
              <ThemedText variant="caption" style={styles.senderUsername}>@{otherParticipant?.username || 'anonymous'}</ThemedText>
            </View>
          </View>

          {/* Agreed closure */}
          {parsedClosingStatement && (
            <View style={styles.closureRow}>
              <MaterialCommunityIcons name="handshake-outline" size={18} color="#FFFFFF" />
              <ThemedText variant="bodySmall" color="inverse" style={styles.closureText}>{parsedClosingStatement}</ThemedText>
            </View>
          )}
        </View>
      </View>
    </SwipeableCard>
  )
})

export default KudosCard

const createStyles = (colors) => StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: SemanticColors.agree,
  },
  // Purple header — matches moderation card pattern
  header: {
    backgroundColor: BrandColor,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTypeTag: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 64,
  },
  headerTypeText: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
  },
  headerSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 1,
  },
  // White body — rounded corners over colored sections
  bodyWrapper: {
    backgroundColor: BrandColor,
  },
  body: {
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  bodyBottomCurve: {
    height: 16,
    backgroundColor: colors.cardBackground,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  // Green footer
  footer: {
    backgroundColor: SemanticColors.agree,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerLabel: {
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  senderInfo: {
    flexDirection: 'column',
  },
  senderUsername: {
    color: 'rgba(255,255,255,0.85)',
  },
  closureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closureText: {
    flex: 1,
  },
})
