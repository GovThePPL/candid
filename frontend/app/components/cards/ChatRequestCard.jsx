import { StyleSheet, View, Text, Image } from 'react-native'
import { forwardRef } from 'react'
import { Colors } from '../../constants/Colors'
import SwipeableCard from './SwipeableCard'

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
      enableVerticalSwipe={false}
      isBackCard={isBackCard}
      backCardAnimatedValue={backCardAnimatedValue}
    >
      <View style={styles.card}>
        {/* Purple Header */}
        <View style={styles.header}>
          <Text style={styles.headerText}>Chat Request</Text>
        </View>

        {/* Requester Info */}
        <View style={styles.requesterSection}>
          <View style={styles.speechBubble} />
          <View style={styles.requesterInfo}>
            <View style={styles.avatarContainer}>
              {requester?.avatarUrl ? (
                <Image source={{ uri: requester.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>
                    {requester?.displayName?.[0]?.toUpperCase() || '?'}
                  </Text>
                </View>
              )}
              {requester?.kudosCount > 0 && (
                <View style={styles.kudosBadge}>
                  <Text style={styles.kudosCount}>{requester.kudosCount}</Text>
                </View>
              )}
            </View>
            <View style={styles.requesterText}>
              <Text style={styles.displayName}>{requester?.displayName || 'Anonymous'}</Text>
              <Text style={styles.username}>@{requester?.username || 'anonymous'}</Text>
            </View>
          </View>
        </View>

        {/* Embedded Position Card */}
        <View style={styles.positionCard}>
          {/* Position Header */}
          <View style={styles.positionHeader}>
            {position?.location && (
              <Text style={styles.locationCode}>{position.location.code}</Text>
            )}
            <Text style={styles.categoryName}>
              {position?.category?.name || 'General'}
            </Text>
          </View>

          {/* Statement */}
          <View style={styles.statementContainer}>
            <Text style={styles.statement}>{position?.statement}</Text>
          </View>

          {/* Position Author */}
          <View style={styles.positionFooter}>
            <View style={styles.authorInfo}>
              <View style={styles.smallAvatarContainer}>
                {position?.author?.avatarUrl ? (
                  <Image source={{ uri: position.author.avatarUrl }} style={styles.smallAvatar} />
                ) : (
                  <View style={[styles.smallAvatar, styles.avatarPlaceholder]}>
                    <Text style={styles.smallAvatarInitial}>
                      {position?.author?.displayName?.[0]?.toUpperCase() || '?'}
                    </Text>
                  </View>
                )}
                {position?.author?.kudosCount > 0 && (
                  <View style={styles.smallKudosBadge}>
                    <Text style={styles.smallKudosCount}>{position.author.kudosCount}</Text>
                  </View>
                )}
              </View>
              <View>
                <Text style={styles.smallDisplayName}>{position?.author?.displayName || 'Anonymous'}</Text>
                <Text style={styles.smallUsername}>@{position?.author?.username || 'you'}</Text>
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
  },
  header: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  headerText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  requesterSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: Colors.primary,
    gap: 12,
  },
  speechBubble: {
    width: 40,
    height: 30,
    backgroundColor: Colors.messageOther,
    borderRadius: 15,
  },
  requesterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 25,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  kudosBadge: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    backgroundColor: Colors.kudosBadge,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
  },
  kudosCount: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.primary,
  },
  requesterText: {},
  displayName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  username: {
    fontSize: 12,
    color: Colors.pass,
  },
  positionCard: {
    flex: 1,
    margin: 16,
    marginTop: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  positionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  locationCode: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  categoryName: {
    fontSize: 13,
    color: Colors.primary,
  },
  statementContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 20,
  },
  statement: {
    fontSize: 18,
    fontWeight: '500',
    color: '#1a1a1a',
    lineHeight: 26,
  },
  positionFooter: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smallAvatarContainer: {
    position: 'relative',
  },
  smallAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  smallAvatarInitial: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  smallKudosBadge: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    backgroundColor: Colors.kudosBadge,
    borderRadius: 6,
    paddingHorizontal: 3,
    minWidth: 14,
    alignItems: 'center',
  },
  smallKudosCount: {
    fontSize: 8,
    fontWeight: '700',
    color: Colors.primary,
  },
  smallDisplayName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  smallUsername: {
    fontSize: 11,
    color: Colors.pass,
  },
})
