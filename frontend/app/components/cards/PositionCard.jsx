import { StyleSheet, View, Text, TouchableOpacity } from 'react-native'
import { forwardRef } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import SwipeableCard from './SwipeableCard'
import Avatar from '../Avatar'

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
  isFromChattingList = false,
  hasPendingRequests = false,
  onRemoveFromChattingList,
  onAddToChattingList,
}, ref) {
  const { statement, category, location, creator: author } = position

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
            {category?.label && (
              <Text style={styles.categoryName}>{category.label}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            {author?.fastResponder && (
              <View style={styles.fastResponderBadge}>
                <Ionicons name="flash" size={18} color={Colors.chat} />
              </View>
            )}
            <TouchableOpacity
              onPress={isFromChattingList ? onRemoveFromChattingList : onAddToChattingList}
              style={[
                styles.chattingListButton,
                isFromChattingList ? styles.chattingListButtonSelected : styles.chattingListButtonUnselected
              ]}
            >
              <Ionicons
                name={isFromChattingList ? "chatbubbles" : "chatbubbles-outline"}
                size={20}
                color={isFromChattingList ? '#FFFFFF' : Colors.primary}
              />
              {hasPendingRequests && <View style={styles.pendingDot} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Statement */}
        <View style={styles.statementContainer}>
          <Text style={styles.statement}>{statement}</Text>
        </View>

        {/* Availability indicator */}
        {position.availability === 'none' && (
          <Text style={styles.availabilityNone}>No users available to chat right now</Text>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={onReport} style={[styles.iconButton, styles.flagButton]}>
            <Ionicons name="flag-outline" size={22} color="#E57373" />
          </TouchableOpacity>

          <View style={styles.authorInfo}>
            <Avatar user={author} size="md" showKudosCount badgePosition="bottom-left" />
            <View style={styles.authorText}>
              <Text style={styles.displayName}>{author?.displayName || 'Anonymous'}</Text>
              <Text style={styles.username}>@{author?.username || 'anonymous'}</Text>
            </View>
          </View>

          <TouchableOpacity onPress={onAddPosition} style={[styles.iconButton, styles.addButton]}>
            <Ionicons name="add-circle-outline" size={26} color="#81C784" />
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
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
  chattingListButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  chattingListButtonUnselected: {
    backgroundColor: Colors.primaryMuted + '40',
  },
  chattingListButtonSelected: {
    backgroundColor: Colors.primary,
  },
  pendingDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.agree,
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
    color: Colors.darkText,
    lineHeight: 32,
  },
  availabilityNone: {
    fontSize: 13,
    fontStyle: 'italic',
    color: Colors.pass,
    textAlign: 'center',
    marginBottom: 8,
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
    borderRadius: 20,
  },
  flagButton: {
    backgroundColor: '#FFEBEE',
  },
  addButton: {
    backgroundColor: '#E8F5E9',
  },
  removeButton: {
    backgroundColor: Colors.pass + '30',
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  authorText: {
    flexDirection: 'column',
  },
  displayName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.darkText,
  },
  username: {
    fontSize: 12,
    color: Colors.pass,
  },
})
