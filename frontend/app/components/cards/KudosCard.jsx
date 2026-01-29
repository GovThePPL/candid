import { StyleSheet, View, Text, Image } from 'react-native'
import { forwardRef } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import SwipeableCard from './SwipeableCard'

const KudosCard = forwardRef(function KudosCard({
  kudos,
  onSendKudos,
  onDismiss,
  isBackCard,
  backCardAnimatedValue,
}, ref) {
  const { otherParticipant, closingStatement, chatEndTime } = kudos

  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <SwipeableCard
      ref={ref}
      onSwipeRight={onSendKudos}
      onSwipeLeft={onDismiss}
      onSwipeDown={onDismiss}
      enableVerticalSwipe={true}
      isBackCard={isBackCard}
      backCardAnimatedValue={backCardAnimatedValue}
    >
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="heart" size={24} color={Colors.kudosBadge} />
          <Text style={styles.headerText}>Send Kudos?</Text>
        </View>

        {/* Other participant info */}
        <View style={styles.participantSection}>
          <View style={styles.avatarContainer}>
            {otherParticipant?.avatarUrl ? (
              <Image source={{ uri: otherParticipant.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>
                  {otherParticipant?.displayName?.[0]?.toUpperCase() || '?'}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.participantText}>
            <Text style={styles.displayName}>{otherParticipant?.displayName || 'Anonymous'}</Text>
            <Text style={styles.username}>@{otherParticipant?.username || 'anonymous'}</Text>
          </View>
          <Text style={styles.sentKudos}>sent you kudos!</Text>
        </View>

        {/* Closing statement */}
        <View style={styles.statementContainer}>
          <Text style={styles.statementLabel}>Your agreed closing statement:</Text>
          <View style={styles.statementBox}>
            <Text style={styles.statement}>"{closingStatement}"</Text>
          </View>
        </View>

        {/* Date */}
        <View style={styles.dateSection}>
          <Text style={styles.dateText}>Chat ended {formatDate(chatEndTime)}</Text>
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <View style={styles.instructionRow}>
            <Ionicons name="arrow-forward" size={20} color={Colors.agree} />
            <Text style={styles.instructionText}>Swipe right to send kudos back</Text>
          </View>
          <View style={styles.instructionRow}>
            <Ionicons name="arrow-back" size={20} color={Colors.disagree} />
            <Text style={styles.instructionText}>Swipe left to dismiss</Text>
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
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
  },
  headerText: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.primary,
  },
  participantSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  participantText: {
    alignItems: 'flex-start',
  },
  displayName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  username: {
    fontSize: 13,
    color: Colors.pass,
  },
  sentKudos: {
    fontSize: 16,
    color: Colors.primary,
    fontWeight: '500',
  },
  statementContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  statementLabel: {
    fontSize: 14,
    color: Colors.pass,
    marginBottom: 12,
    textAlign: 'center',
  },
  statementBox: {
    backgroundColor: Colors.agreedPosition,
    borderRadius: 12,
    padding: 20,
  },
  statement: {
    fontSize: 18,
    fontWeight: '500',
    color: Colors.primary,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 26,
  },
  dateSection: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 16,
  },
  dateText: {
    fontSize: 13,
    color: Colors.pass,
  },
  instructions: {
    gap: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  instructionText: {
    fontSize: 13,
    color: Colors.pass,
  },
})
