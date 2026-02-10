import { StyleSheet, View } from 'react-native'
import { forwardRef, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../hooks/useThemeColors'
import { BrandColor, OnBrandColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import SwipeableCard from './SwipeableCard'
import Avatar from '../Avatar'
import CardShell from '../CardShell'
import PositionInfoCard from '../PositionInfoCard'

const ChatRequestCard = forwardRef(function ChatRequestCard({
  chatRequest,
  onAccept,
  onDecline,
  isBackCard,
  backCardAnimatedValue,
}, ref) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { requester, position } = chatRequest

  const headerContent = (
    <View style={styles.headerInner}>
      <ThemedText variant="statement" color="inverse" style={styles.headerTitle}>Chat Request</ThemedText>

      {/* User Info Row with Chat Bubble */}
      <View style={styles.userRow}>
        {/* Chat Bubble Icon */}
        <View style={styles.chatBubbleContainer}>
          <Ionicons name="chatbubble" size={48} color={OnBrandColors.text} />
        </View>

        {/* User Info Pill */}
        <View style={styles.userPill}>
          <Avatar user={requester} size="md" showKudosCount badgePosition="bottom-left" />
          <View style={styles.userTextContainer}>
            <ThemedText variant="label" color="dark">{requester?.displayName || 'Anonymous'}</ThemedText>
            <ThemedText variant="caption" color="secondary">@{requester?.username || 'anonymous'}</ThemedText>
          </View>
        </View>
      </View>
    </View>
  )

  return (
    <SwipeableCard
      ref={ref}
      onSwipeRight={onAccept}
      onSwipeLeft={onDecline}
      onSwipeUp={onAccept}
      onSwipeDown={onDecline}
      enableVerticalSwipe={true}
      rightSwipeAsChatAccept={true}
      leftSwipeAsPass={true}
      isBackCard={isBackCard}
      backCardAnimatedValue={backCardAnimatedValue}
      accessibilityLabel={`Chat request from ${requester?.displayName || 'Anonymous'} about: ${position?.statement || ''}`}
      accessibilityHint="Swipe right to accept, left to decline"
    >
      <CardShell
        size="full"
        headerColor={BrandColor}
        header={headerContent}
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

export default ChatRequestCard

const createStyles = (colors) => StyleSheet.create({
  // Header
  headerInner: {
    paddingTop: 2,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 16,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  chatBubbleContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  userPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 25,
    paddingVertical: 8,
    paddingHorizontal: 14,
    paddingRight: 18,
    gap: 10,
  },
  userTextContainer: {
    flexDirection: 'column',
  },
})
