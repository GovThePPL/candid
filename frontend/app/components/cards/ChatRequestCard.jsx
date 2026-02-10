import { StyleSheet, View } from 'react-native'
import { forwardRef, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../hooks/useThemeColors'
import { BrandColor } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import SwipeableCard from './SwipeableCard'
import Avatar from '../Avatar'

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

  return (
    <SwipeableCard
      ref={ref}
      onSwipeRight={onAccept}
      onSwipeLeft={onDecline}
      onSwipeUp={onAccept}
      onSwipeDown={onDecline}
      enableVerticalSwipe={true}
      rightSwipeAsChatAccept={true}
      isBackCard={isBackCard}
      backCardAnimatedValue={backCardAnimatedValue}
    >
      <View style={styles.card}>
        {/* Purple Header Section */}
        <View style={styles.headerSection}>
          <ThemedText variant="statement" color="inverse" style={styles.headerText}>Chat Request</ThemedText>

          {/* User Info Row with Chat Bubble */}
          <View style={styles.userRow}>
            {/* Chat Bubble Icon */}
            <View style={styles.chatBubbleContainer}>
              <Ionicons name="chatbubble" size={48} color="#fff" />
            </View>

            {/* User Info Pill */}
            <View style={styles.userPill}>
              <Avatar user={requester} size="md" showKudosCount badgePosition="bottom-left" />
              <View style={styles.userTextContainer}>
                <ThemedText variant="body" color="dark" style={styles.displayName}>{requester?.displayName || 'Anonymous'}</ThemedText>
                <ThemedText variant="caption" color="secondary">@{requester?.username || 'anonymous'}</ThemedText>
              </View>
            </View>
          </View>
        </View>

        {/* Topic Card - Full Width with Rounded Top Corners */}
        <View style={styles.topicCardWrapper}>
          <View style={styles.topicCard}>
            {/* Position Header */}
            <View style={styles.positionHeader}>
              {position?.location && (
                <ThemedText variant="buttonSmall" color="primary">{position.location.code}</ThemedText>
              )}
              <ThemedText variant="bodySmall" color="primary">
                {position?.category?.label || 'General'}
              </ThemedText>
            </View>

            {/* Statement */}
            <View style={styles.statementContainer}>
              <ThemedText variant="statement" color="dark" style={styles.statement}>{position?.statement}</ThemedText>
            </View>

            {/* Position Author - Centered */}
            <View style={styles.positionFooter}>
              <View style={styles.authorInfo}>
                <Avatar user={position?.creator} size="md" showKudosCount badgePosition="bottom-left" />
                <View style={styles.authorTextContainer}>
                  <ThemedText variant="buttonSmall" color="dark">{position?.creator?.displayName || 'Anonymous'}</ThemedText>
                  <ThemedText variant="caption" color="secondary">@{position?.creator?.username || 'you'}</ThemedText>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    </SwipeableCard>
  )
})

export default ChatRequestCard

const createStyles = (colors) => StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: BrandColor,
  },
  headerSection: {
    backgroundColor: BrandColor,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  headerText: {
    fontWeight: '600',
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
  displayName: {
    fontWeight: '600',
  },
  topicCardWrapper: {
    flex: 1,
    backgroundColor: BrandColor,
  },
  topicCard: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  positionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  statementContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  statement: {
    lineHeight: 30,
  },
  positionFooter: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    alignItems: 'center',
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  authorTextContainer: {
    flexDirection: 'column',
  },
})
