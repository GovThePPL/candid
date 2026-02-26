import { StyleSheet, View, TouchableOpacity } from 'react-native'
import { forwardRef, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { SemanticColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import HighlightedText from '../HighlightedText'
import SwipeableCard from './SwipeableCard'
import CardShell from '../CardShell'
import UserCard from '../UserCard'
import LocationSessionBadge from '../LocationSessionBadge'

const PositionCard = forwardRef(function PositionCard({
  position,
  onAgree,
  onDisagree,
  onPass,
  onChatRequest,
  onReport,
  onModerate,
  canModerate = false,
  onAddPosition,
  isBackCard,
  backCardAnimatedValue,
  isFromChattingList = false,
  hasPendingRequests = false,
  onRemoveFromChattingList,
  onAddToChattingList,
  onTermPress,
  disabled = false,
}, ref) {
  const { t } = useTranslation('cards')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { statement, session, location, creator: author } = position

  return (
    <SwipeableCard
      ref={ref}
      onSwipeRight={onAgree}
      onSwipeLeft={onDisagree}
      onSwipeUp={onChatRequest}
      onSwipeDown={onPass}
      isBackCard={isBackCard}
      backCardAnimatedValue={backCardAnimatedValue}
      archivedMode={disabled}
      accessibilityLabel={t('positionA11yLabel', { name: author?.displayName || t('anonymous'), statement })}
      accessibilityHint={disabled ? t('archivedA11yHint') : t('positionA11yHint')}
    >
      <CardShell size="full" bodyStyle={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <LocationSessionBadge location={location} session={session} size="lg" />
          <View style={styles.headerRight}>
            {author?.fastResponder && (
              <View style={styles.fastResponderBadge}>
                <Ionicons name="flash" size={18} color={colors.chat} />
              </View>
            )}
            {(onAddToChattingList || onRemoveFromChattingList) && (
              <TouchableOpacity
                onPress={isFromChattingList ? onRemoveFromChattingList : onAddToChattingList}
                style={[
                  styles.chattingListButton,
                  isFromChattingList ? styles.chattingListButtonSelected : styles.chattingListButtonUnselected
                ]}
                accessibilityLabel={isFromChattingList ? t('positionRemoveFromList') : t('positionAddToList')}
                accessibilityRole="button"
              >
                <Ionicons
                  name={isFromChattingList ? "chatbubbles" : "chatbubbles-outline"}
                  size={20}
                  color={isFromChattingList ? '#FFFFFF' : colors.primary}
                />
                {hasPendingRequests && <View style={styles.pendingDot} />}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Statement */}
        <View style={styles.statementContainer}>
          <HighlightedText variant="statement" color="dark" onTermPress={onTermPress}>{statement}</HighlightedText>
        </View>

        {/* Availability indicator */}
        {position.availability === 'none' && (
          <ThemedText variant="label" color="secondary" style={styles.availabilityNone}>{t('positionNoUsers')}</ThemedText>
        )}

        {/* Archived label */}
        {disabled && (
          <ThemedText variant="label" color="secondary" style={styles.archivedLabel}>{t('archivedStageLabel')}</ThemedText>
        )}

        {/* Footer */}
        <View style={[styles.footer, disabled && styles.footerDisabled]}>
          {canModerate ? (
            <TouchableOpacity onPress={onModerate} style={[styles.iconButton, styles.flagButton]} accessibilityLabel={t('positionModerate')} accessibilityRole="button" disabled={disabled}>
              <Ionicons name="shield-outline" size={22} color="#E57373" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onReport} style={[styles.iconButton, styles.flagButton]} accessibilityLabel={t('positionReport')} accessibilityRole="button" disabled={disabled}>
              <Ionicons name="flag-outline" size={22} color="#E57373" />
            </TouchableOpacity>
          )}

          <View style={styles.footerCenter}>
            <View style={styles.footerCenterInner}>
              <UserCard user={author} avatarSize="md" />
            </View>
          </View>

          <TouchableOpacity onPress={onAddPosition} style={[styles.iconButton, styles.addButton]} accessibilityLabel={t('positionAdd')} accessibilityRole="button" disabled={disabled}>
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
  archivedLabel: {
    fontWeight: '600',
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
  footerDisabled: {
    opacity: 0.4,
  },
  footerCenter: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  footerCenterInner: {
    alignItems: 'center',
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
