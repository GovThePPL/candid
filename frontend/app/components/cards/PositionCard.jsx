import { StyleSheet, View, TouchableOpacity } from 'react-native'
import { forwardRef, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../hooks/useThemeColors'
import { SemanticColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import SwipeableCard from './SwipeableCard'
import Avatar from '../Avatar'
import CardShell from '../CardShell'

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
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
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
      <CardShell size="full" bodyStyle={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.categoryRow}>
            {location?.code && (
              <View style={styles.locationBadge}>
                <ThemedText variant="buttonSmall" color="badge">{location.code}</ThemedText>
              </View>
            )}
            {category?.label && (
              <ThemedText variant="bodySmall" color="badge">{category.label}</ThemedText>
            )}
          </View>
          <View style={styles.headerRight}>
            {author?.fastResponder && (
              <View style={styles.fastResponderBadge}>
                <Ionicons name="flash" size={18} color={colors.chat} />
              </View>
            )}
            <TouchableOpacity
              onPress={isFromChattingList ? onRemoveFromChattingList : onAddToChattingList}
              style={[
                styles.chattingListButton,
                isFromChattingList ? styles.chattingListButtonSelected : styles.chattingListButtonUnselected
              ]}
              accessibilityLabel={isFromChattingList ? "Remove from chatting list" : "Add to chatting list"}
              accessibilityRole="button"
            >
              <Ionicons
                name={isFromChattingList ? "chatbubbles" : "chatbubbles-outline"}
                size={20}
                color={isFromChattingList ? '#FFFFFF' : colors.primary}
              />
              {hasPendingRequests && <View style={styles.pendingDot} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Statement */}
        <View style={styles.statementContainer}>
          <ThemedText variant="statement" color="dark">{statement}</ThemedText>
        </View>

        {/* Availability indicator */}
        {position.availability === 'none' && (
          <ThemedText variant="label" color="secondary" style={styles.availabilityNone}>No users available to chat right now</ThemedText>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={onReport} style={[styles.iconButton, styles.flagButton]} accessibilityLabel="Report position" accessibilityRole="button">
            <Ionicons name="flag-outline" size={22} color="#E57373" />
          </TouchableOpacity>

          <View style={styles.authorInfo}>
            <Avatar user={author} size="md" showKudosCount badgePosition="bottom-left" />
            <View style={styles.authorText}>
              <ThemedText variant="buttonSmall" color="dark">{author?.displayName || 'Anonymous'}</ThemedText>
              <ThemedText variant="caption" color="secondary">@{author?.username || 'anonymous'}</ThemedText>
            </View>
          </View>

          <TouchableOpacity onPress={onAddPosition} style={[styles.iconButton, styles.addButton]} accessibilityLabel="Add position" accessibilityRole="button">
            <Ionicons name="add-circle-outline" size={26} color="#81C784" />
          </TouchableOpacity>
        </View>
      </CardShell>
    </SwipeableCard>
  )
})

export default PositionCard

const createStyles = (colors) => StyleSheet.create({
  card: {
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
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
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
    backgroundColor: colors.chattingListBg,
  },
  chattingListButtonSelected: {
    backgroundColor: colors.chattingListSelectedBg,
  },
  pendingDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: SemanticColors.agree,
  },
  fastResponderBadge: {
    backgroundColor: colors.cardBackground,
    borderRadius: 20,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.chat,
  },
  statementContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  availabilityNone: {
    fontWeight: '400',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flagButton: {
    backgroundColor: SemanticColors.disagree + '20',
  },
  addButton: {
    backgroundColor: SemanticColors.agree + '20',
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  authorText: {
    flexDirection: 'column',
  },
})
