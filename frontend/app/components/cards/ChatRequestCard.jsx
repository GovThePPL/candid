import { StyleSheet, View, Text } from 'react-native'
import { forwardRef } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import SwipeableCard from './SwipeableCard'
import Avatar from '../Avatar'

const ChatRequestCard = forwardRef(function ChatRequestCard({
  chatRequest,
  onAccept,
  onDecline,
  isBackCard,
  backCardAnimatedValue,
}, ref) {
  const { requester, position } = chatRequest

  return (
    <SwipeableCard
      ref={ref}
      onSwipeRight={onAccept}
      onSwipeLeft={onDecline}
      onSwipeUp={onAccept}
      enableVerticalSwipe={true}
      rightSwipeAsChatAccept={true}
      isBackCard={isBackCard}
      backCardAnimatedValue={backCardAnimatedValue}
    >
      <View style={styles.card}>
        {/* Purple Header Section */}
        <View style={styles.headerSection}>
          <Text style={styles.headerText}>Chat Request</Text>

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
                <Text style={styles.displayName}>{requester?.displayName || 'Anonymous'}</Text>
                <Text style={styles.username}>@{requester?.username || 'anonymous'}</Text>
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
                <Text style={styles.locationCode}>{position.location.code}</Text>
              )}
              <Text style={styles.categoryName}>
                {position?.category?.label || 'General'}
              </Text>
            </View>

            {/* Statement */}
            <View style={styles.statementContainer}>
              <Text style={styles.statement}>{position?.statement}</Text>
            </View>

            {/* Position Author - Centered */}
            <View style={styles.positionFooter}>
              <View style={styles.authorInfo}>
                <Avatar user={position?.creator} size="md" showKudosCount badgePosition="bottom-left" />
                <View style={styles.authorTextContainer}>
                  <Text style={styles.authorDisplayName}>{position?.creator?.displayName || 'Anonymous'}</Text>
                  <Text style={styles.authorUsername}>@{position?.creator?.username || 'you'}</Text>
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

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  headerSection: {
    backgroundColor: Colors.primary,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  headerText: {
    color: Colors.white,
    fontSize: 22,
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
    backgroundColor: Colors.white,
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
    fontSize: 15,
    fontWeight: '600',
    color: Colors.darkText,
  },
  username: {
    fontSize: 12,
    color: Colors.pass,
  },
  topicCardWrapper: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  topicCard: {
    flex: 1,
    backgroundColor: Colors.white,
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
  locationCode: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  categoryName: {
    fontSize: 14,
    color: Colors.primary,
  },
  statementContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  statement: {
    fontSize: 22,
    fontWeight: '500',
    color: Colors.darkText,
    lineHeight: 30,
  },
  positionFooter: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
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
  authorDisplayName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.darkText,
  },
  authorUsername: {
    fontSize: 12,
    color: Colors.pass,
  },
})
