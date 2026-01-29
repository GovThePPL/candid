import { StyleSheet, View, Text, TouchableOpacity, Image } from 'react-native'
import { forwardRef } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import SwipeableCard from './SwipeableCard'

const PositionCard = forwardRef(function PositionCard({
  position,
  onAgree,
  onDisagree,
  onPass,
  onChatRequest,
  onReport,
  onAddPosition,
  isBackCard,
  backCardAnimatedValue,
}, ref) {
  const { statement, category, location, author } = position

  return (
    <SwipeableCard
      ref={ref}
      onSwipeRight={onAgree}
      onSwipeLeft={onDisagree}
      onSwipeUp={onChatRequest}
      onSwipeDown={onPass}
      isBackCard={isBackCard}
      backCardAnimatedValue={backCardAnimatedValue}
    >
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.categoryRow}>
            {location?.code && (
              <View style={styles.locationBadge}>
                <Text style={styles.locationCode}>{location.code}</Text>
              </View>
            )}
            {category?.name && (
              <Text style={styles.categoryName}>{category.name}</Text>
            )}
          </View>
          {author?.fastResponder && (
            <View style={styles.fastResponderBadge}>
              <Ionicons name="flash" size={18} color={Colors.chat} />
            </View>
          )}
        </View>

        {/* Statement */}
        <View style={styles.statementContainer}>
          <Text style={styles.statement}>{statement}</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={onReport} style={styles.iconButton}>
            <Ionicons name="flag-outline" size={22} color={Colors.pass} />
          </TouchableOpacity>

          <View style={styles.authorInfo}>
            <View style={styles.avatarContainer}>
              {author?.avatarUrl ? (
                <Image source={{ uri: author.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>
                    {author?.displayName?.[0]?.toUpperCase() || '?'}
                  </Text>
                </View>
              )}
              {author?.kudosCount > 0 && (
                <View style={styles.kudosBadge}>
                  <Text style={styles.kudosCount}>{author.kudosCount}</Text>
                </View>
              )}
            </View>
            <View style={styles.authorText}>
              <Text style={styles.displayName}>{author?.displayName || 'Anonymous'}</Text>
              <Text style={styles.username}>@{author?.username || 'anonymous'}</Text>
            </View>
          </View>

          <TouchableOpacity onPress={onAddPosition} style={styles.iconButton}>
            <Ionicons name="add-circle-outline" size={26} color={Colors.primaryMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </SwipeableCard>
  )
})

export default PositionCard

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationBadge: {
    backgroundColor: Colors.primaryMuted + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
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
  fastResponderBadge: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.chat,
  },
  statementContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  statement: {
    fontSize: 22,
    fontWeight: '500',
    color: '#1a1a1a',
    lineHeight: 32,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  iconButton: {
    padding: 8,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
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
    bottom: -4,
    left: -4,
    backgroundColor: Colors.kudosBadge,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  kudosCount: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  authorText: {
    flexDirection: 'column',
  },
  displayName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  username: {
    fontSize: 12,
    color: Colors.pass,
  },
})
