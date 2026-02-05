import { StyleSheet, View, Text, Image } from 'react-native'
import { forwardRef } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import SwipeableCard from './SwipeableCard'
import { getInitials, getInitialsColor, getTrustBadgeColor, getAvatarImageUrl } from '../../lib/avatarUtils'

const KudosCard = forwardRef(function KudosCard({
  kudos,
  onSendKudos,
  onAcknowledge,
  onDismiss,
  isBackCard,
  backCardAnimatedValue,
}, ref) {
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
        {/* Purple Header Section */}
        <View style={styles.headerSection}>
          <Text style={styles.headerText}>
            {userAlreadySentKudos ? 'Kudos Received!' : 'You Received Kudos!'}
          </Text>
          <Text style={styles.headerSubtext}>
            {userAlreadySentKudos
              ? 'Swipe to acknowledge'
              : `${otherParticipant?.displayName || 'They'} sent you kudos. Send one back?`}
          </Text>

          {/* User Info Row with Star Icon */}
          <View style={styles.userRow}>
            {/* Star Icon */}
            <View style={styles.starContainer}>
              <Ionicons name="star" size={48} color="#FFD700" />
            </View>

            {/* User Info Pill */}
            <View style={styles.userPill}>
              <View style={styles.avatarContainer}>
                {(otherParticipant?.avatarIconUrl || otherParticipant?.avatarUrl) ? (
                  <Image source={{ uri: getAvatarImageUrl(otherParticipant.avatarIconUrl || otherParticipant.avatarUrl) }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: getInitialsColor(otherParticipant?.displayName) }]}>
                    <Text style={styles.avatarInitial}>
                      {getInitials(otherParticipant?.displayName)}
                    </Text>
                  </View>
                )}
                <View style={[styles.kudosBadge, { backgroundColor: getTrustBadgeColor(otherParticipant?.trustScore) }]}>
                  <Ionicons name="star" size={10} color={Colors.primary} />
                  <Text style={styles.kudosCount}>{otherParticipant?.kudosCount || 0}</Text>
                </View>
              </View>
              <View style={styles.userTextContainer}>
                <Text style={styles.displayName}>{otherParticipant?.displayName || 'Anonymous'}</Text>
                <Text style={styles.username}>@{otherParticipant?.username || 'anonymous'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Topic Card - Full Width with Rounded Top Corners */}
        <View style={styles.topicCardWrapper}>
          <View style={styles.topicCard}>
            {/* Position Header */}
            <View style={styles.positionHeader}>
              {position?.location?.code && (
                <Text style={styles.locationCode}>{position.location.code}</Text>
              )}
              <Text style={styles.categoryName}>
                {position?.category?.label || 'General'}
              </Text>
            </View>

            {/* Original Statement */}
            <View style={styles.statementContainer}>
              <Text style={styles.statement}>{position?.statement}</Text>
            </View>

            {/* Agreed Closure - Green Section */}
            {parsedClosingStatement && (
              <View style={styles.closureSection}>
                <View style={styles.closureHeader}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.agree} />
                  <Text style={styles.closureLabel}>Agreed Closure</Text>
                </View>
                <Text style={styles.closureText}>{parsedClosingStatement}</Text>
              </View>
            )}

            {/* Position Author - Centered */}
            {position?.creator && (
              <View style={styles.positionFooter}>
                <View style={styles.authorInfo}>
                  <View style={styles.authorAvatarContainer}>
                    {(position.creator.avatarIconUrl || position.creator.avatarUrl) ? (
                      <Image source={{ uri: getAvatarImageUrl(position.creator.avatarIconUrl || position.creator.avatarUrl) }} style={styles.authorAvatar} />
                    ) : (
                      <View style={[styles.authorAvatar, styles.avatarPlaceholder, { backgroundColor: getInitialsColor(position.creator.displayName) }]}>
                        <Text style={styles.authorAvatarInitial}>
                          {getInitials(position.creator.displayName)}
                        </Text>
                      </View>
                    )}
                    <View style={[styles.authorKudosBadge, { backgroundColor: getTrustBadgeColor(position.creator.trustScore) }]}>
                      <Ionicons name="star" size={10} color={Colors.primary} />
                      <Text style={styles.authorKudosCount}>{position.creator.kudosCount || 0}</Text>
                    </View>
                  </View>
                  <View style={styles.authorTextContainer}>
                    <Text style={styles.authorDisplayName}>{position.creator.displayName || 'Anonymous'}</Text>
                    <Text style={styles.authorUsername}>@{position.creator.username || 'anonymous'}</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </SwipeableCard>
  )
})

export default KudosCard

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
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 6,
  },
  headerSubtext: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  starContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  userPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 25,
    paddingVertical: 8,
    paddingHorizontal: 14,
    paddingRight: 18,
    gap: 10,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  kudosBadge: {
    position: 'absolute',
    bottom: -3,
    left: -3,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  kudosCount: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.primary,
  },
  userTextContainer: {
    flexDirection: 'column',
  },
  displayName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
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
    backgroundColor: '#fff',
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
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  statement: {
    fontSize: 18,
    fontWeight: '500',
    color: '#1a1a1a',
    lineHeight: 26,
  },
  closureSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.agree,
  },
  closureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  closureLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.agree,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  closureText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
    lineHeight: 22,
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
  authorAvatarContainer: {
    position: 'relative',
  },
  authorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  authorAvatarInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  authorKudosBadge: {
    position: 'absolute',
    bottom: -4,
    left: -4,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    minWidth: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  authorKudosCount: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  authorTextContainer: {
    flexDirection: 'column',
  },
  authorDisplayName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  authorUsername: {
    fontSize: 12,
    color: Colors.pass,
  },
})
