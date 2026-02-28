import { StyleSheet, View, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, Platform } from 'react-native'
import { forwardRef, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated'
import { useThemeColors } from '../../hooks/useThemeColors'
import { SemanticColors } from '../../constants/Colors'
import api from '../../lib/api'
import ThemedText from '../ThemedText'
import HighlightedText from '../HighlightedText'
import SwipeableCard from './SwipeableCard'
import CardShell from '../CardShell'
import UserCard from '../UserCard'
import LocationSessionBadge from '../LocationSessionBadge'

const MAX_CHARS = 140
const SEARCH_DEBOUNCE_MS = 500
const MIN_SEARCH_LENGTH = 20

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
  // Create mode props
  createMode = false,
  onCreateSubmit,
  onCreateCancel,
  onOpenRules,
  placeholder,
  initialStatement = '',
  locationId,
  sessionId,
  onAdopt,
  onBadgePress,
}, ref) {
  const { t } = useTranslation('cards')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  // Create mode state
  const [createPhase, setCreatePhase] = useState('write') // 'write' | 'transition' | 'vote'
  const [statement, setStatement] = useState(initialStatement)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [createdPosition, setCreatedPosition] = useState(null)
  const [inputHeight, setInputHeight] = useState(null)

  // Similar positions search (create mode only)
  const [similarPositions, setSimilarPositions] = useState([])
  const [searchingSimilar, setSearchingSimilar] = useState(false)
  const searchTimeoutRef = useRef(null)

  // Write → vote transition animation (crossfade)
  const transitionProgress = useSharedValue(0)
  const writeOpacityStyle = useAnimatedStyle(() => ({
    opacity: 1 - transitionProgress.value,
  }))
  const votePreviewOpacityStyle = useAnimatedStyle(() => ({
    opacity: transitionProgress.value,
  }))

  useEffect(() => {
    if (!createMode) return
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)

    if (statement.trim().length < MIN_SEARCH_LENGTH) {
      setSimilarPositions([])
      setSearchingSimilar(false)
      return
    }

    setSearchingSimilar(true)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await api.positions.searchSimilar(statement.trim(), {
          locationId,
          sessionId,
          limit: 3,
        })
        setSimilarPositions(results || [])
      } catch (err) {
        console.error('Error searching similar positions:', err)
        setSimilarPositions([])
      } finally {
        setSearchingSimilar(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current) }
  }, [createMode, statement, locationId, sessionId])

  const charCount = statement.length
  const isOverLimit = charCount > MAX_CHARS
  const canSubmit = statement.trim().length > 0 && !isOverLimit && !loading

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !onCreateSubmit) return
    setLoading(true)
    setError(null)
    try {
      const result = await onCreateSubmit(statement.trim())
      setCreatedPosition(result)
      setCreatePhase('transition')
      transitionProgress.value = withTiming(1, { duration: 400 }, (finished) => {
        if (finished) {
          runOnJS(setCreatePhase)('vote')
        }
      })
    } catch (err) {
      setError(t('createPositionError'))
    } finally {
      setLoading(false)
    }
  }, [canSubmit, onCreateSubmit, statement, t, transitionProgress])

  // Normal mode (or self-vote phase of create mode)
  const displayPosition = createMode && (createPhase === 'vote' || createPhase === 'transition') ? createdPosition : position
  const isWritePhase = createMode && createPhase === 'write'
  const isTransitionPhase = createMode && createPhase === 'transition'
  const isSelfVotePhase = createMode && createPhase === 'vote'

  // In self-vote phase, wrap handlers to pass the created position object
  // (the parent defers API creation to the vote handler so it can set chatsDisabled)
  // Must be above the early return to keep hook order stable
  const selfVoteAgree = useCallback(() => onAgree?.(createdPosition), [onAgree, createdPosition])
  const selfVoteDisagree = useCallback(() => onDisagree?.(createdPosition), [onDisagree, createdPosition])
  const selfVotePass = useCallback(() => onPass?.(createdPosition), [onPass, createdPosition])

  // In write/transition phase: looks exactly like a normal PositionCard, but statement area is a TextInput
  // During transition, both write content (fading out) and vote preview (fading in) are rendered
  if (isWritePhase || isTransitionPhase) {
    const { session, location, creator: writeAuthor } = position || {}
    return (
      <View style={styles.writeCardWrapper}>
        {/* Write phase content — fades out during transition */}
        <Animated.View style={[{ flex: 1 }, isTransitionPhase && writeOpacityStyle]} pointerEvents={isTransitionPhase ? 'none' : 'auto'}>
          <CardShell size="full" bodyStyle={styles.card}>
            {/* Header — same as normal card */}
            <View style={styles.header}>
              <LocationSessionBadge location={location} session={session} size="lg" />
              <View style={styles.headerRight}>
                {onOpenRules && (
                  <TouchableOpacity
                    onPress={onOpenRules}
                    style={[styles.chattingListButton, styles.chattingListButtonUnselected]}
                    accessibilityRole="button"
                    accessibilityLabel={t('communityRulesA11y')}
                  >
                    <Ionicons name="book-outline" size={20} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Statement input + similar positions */}
            <View style={styles.writeBody}>
              <TextInput
                style={[styles.statementInput, { color: colors.darkText }, inputHeight != null && { height: inputHeight }]}
                value={statement}
                onChangeText={setStatement}
                placeholder={placeholder || t('placeholderPosition')}
                placeholderTextColor={colors.placeholderText}
                multiline
                textAlignVertical="top"
                onContentSizeChange={(e) => setInputHeight(e.nativeEvent.contentSize.height + 16)}
                accessibilityLabel={t('createPositionA11y')}
                accessibilityHint={t('createPositionA11yHint')}
              />

              {/* Character count */}
              <ThemedText
                variant="caption"
                color={isOverLimit ? 'disagree' : 'secondary'}
                style={styles.charCount}
              >
                {t('charCount', { count: charCount })}
              </ThemedText>

              {/* Similar positions suggestions */}
              {(searchingSimilar || similarPositions.length > 0) && (
                <View style={styles.similarContainer}>
                  <View style={styles.similarHeader}>
                    <Ionicons name="bulb-outline" size={16} color={colors.primary} />
                    <ThemedText variant="label" color="primary" style={styles.similarTitle}>
                      {searchingSimilar ? t('searchingSimilar') : t('similarAdopt')}
                    </ThemedText>
                    {searchingSimilar && (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
                    )}
                  </View>

                  {!searchingSimilar && similarPositions.slice(0, 3).map((result) => (
                    <View key={result.position.id} style={styles.similarItem}>
                      <View style={styles.similarContent}>
                        <ThemedText variant="bodySmall" color="dark" style={styles.similarStatement} numberOfLines={1}>
                          &ldquo;{result.position.statement}&rdquo;
                        </ThemedText>
                        <ThemedText variant="caption" color="secondary" style={styles.similarMeta}>
                          {t('matchPercent', { percent: Math.round(result.similarity * 100) })}
                        </ThemedText>
                      </View>
                      <TouchableOpacity
                        style={styles.adoptButton}
                        onPress={() => onAdopt?.(result.position.id)}
                        accessibilityRole="button"
                        accessibilityLabel={t('adoptA11y', { statement: result.position.statement })}
                      >
                        <Ionicons name="add-circle" size={28} color={SemanticColors.agree} />
                      </TouchableOpacity>
                    </View>
                  ))}

                  {!searchingSimilar && similarPositions.length === 0 && statement.trim().length >= MIN_SEARCH_LENGTH && (
                    <ThemedText variant="bodySmall" color="secondary" style={styles.noSimilarText}>
                      {t('noSimilarFound')}
                    </ThemedText>
                  )}
                </View>
              )}

              {/* Error */}
              {error && (
                <ThemedText variant="bodySmall" color="error" style={styles.createError}>{error}</ThemedText>
              )}
            </View>

            {/* Footer — same visual structure as normal card: cancel | UserCard | submit */}
            <View style={styles.footer}>
              <TouchableOpacity
                onPress={onCreateCancel}
                style={[styles.iconButton, styles.flagButton]}
                accessibilityRole="button"
                accessibilityLabel={t('cancelCreate')}
              >
                <Ionicons name="close-outline" size={24} color="#E57373" />
              </TouchableOpacity>

              <View style={styles.footerCenter}>
                <View style={styles.footerCenterInner}>
                  <UserCard user={writeAuthor} avatarSize="md" />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleSubmit}
                style={[styles.iconButton, styles.addButton, !canSubmit && styles.submitButtonDisabled]}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityLabel={t('submitPosition')}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#81C784" />
                ) : (
                  <Ionicons name="checkmark-circle-outline" size={26} color="#81C784" />
                )}
              </TouchableOpacity>
            </View>
          </CardShell>
        </Animated.View>

        {/* Vote preview — fades in during transition, overlaid on write content */}
        {isTransitionPhase && (
          <Animated.View style={[StyleSheet.absoluteFill, votePreviewOpacityStyle]} pointerEvents="none">
            <CardShell size="full" bodyStyle={styles.card}>
              <View style={styles.header}>
                <LocationSessionBadge location={createdPosition?.location} session={createdPosition?.session} size="lg" />
                <View style={styles.headerRight}>
                  {(onAddToChattingList || onRemoveFromChattingList) && (
                    <TouchableOpacity
                      disabled
                      style={[styles.chattingListButton, styles.chattingListButtonUnselected, styles.headerButtonDisabled]}
                      accessibilityLabel={t('positionAddToList')}
                      accessibilityRole="button"
                    >
                      <Ionicons name="chatbubbles-outline" size={20} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.statementContainer}>
                <HighlightedText variant="statement" color="dark">{statement}</HighlightedText>
              </View>

              <ThemedText variant="label" color="secondary" style={styles.selfVotePrompt}>{t('selfVotePrompt')}</ThemedText>

              <View style={styles.footer}>
                <TouchableOpacity disabled style={[styles.iconButton, styles.flagButton, styles.headerButtonDisabled]} accessibilityLabel={t('positionReport')} accessibilityRole="button">
                  <Ionicons name="flag-outline" size={22} color="#E57373" />
                </TouchableOpacity>
                <View style={styles.footerCenter}>
                  <View style={styles.footerCenterInner}>
                    <UserCard user={createdPosition?.creator} avatarSize="md" />
                  </View>
                </View>
                <TouchableOpacity disabled style={[styles.iconButton, styles.addButton, styles.headerButtonDisabled]} accessibilityLabel={t('positionAdd')} accessibilityRole="button">
                  <Ionicons name="add-circle-outline" size={26} color="#81C784" />
                </TouchableOpacity>
              </View>
            </CardShell>
          </Animated.View>
        )}
      </View>
    )
  }

  // Normal display mode (standard position card, or self-vote phase)
  const { statement: displayStatement, session, location, creator: author } = displayPosition || {}

  return (
    <SwipeableCard
      ref={ref}
      onSwipeRight={isSelfVotePhase ? selfVoteAgree : onAgree}
      onSwipeLeft={isSelfVotePhase ? selfVoteDisagree : onDisagree}
      onSwipeUp={isSelfVotePhase ? undefined : onChatRequest}
      onSwipeDown={isSelfVotePhase ? selfVotePass : onPass}
      isBackCard={isBackCard}
      backCardAnimatedValue={backCardAnimatedValue}
      archivedMode={disabled}
      accessibilityLabel={isSelfVotePhase
        ? t('selfVoteA11yLabel', { statement: displayStatement })
        : t('positionA11yLabel', { name: author?.displayName || t('anonymous'), statement: displayStatement })}
      accessibilityHint={isSelfVotePhase
        ? t('selfVoteHint')
        : disabled ? t('archivedA11yHint') : t('positionA11yHint')}
    >
      <CardShell size="full" bodyStyle={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          {onBadgePress ? (
            <TouchableOpacity onPress={onBadgePress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common:sessionInfoA11y')}>
              <LocationSessionBadge location={location} session={session} size="lg" />
            </TouchableOpacity>
          ) : (
            <LocationSessionBadge location={location} session={session} size="lg" />
          )}
          <View style={styles.headerRight}>
            {!isSelfVotePhase && author?.fastResponder && (
              <View style={styles.fastResponderBadge}>
                <Ionicons name="flash" size={18} color={colors.chat} />
              </View>
            )}
            {(onAddToChattingList || onRemoveFromChattingList) && (
              <TouchableOpacity
                onPress={isFromChattingList ? onRemoveFromChattingList : onAddToChattingList}
                style={[
                  styles.chattingListButton,
                  isFromChattingList ? styles.chattingListButtonSelected : styles.chattingListButtonUnselected,
                  (disabled || isSelfVotePhase) && styles.headerButtonDisabled,
                ]}
                accessibilityLabel={isFromChattingList ? t('positionRemoveFromList') : t('positionAddToList')}
                accessibilityRole="button"
                disabled={disabled || isSelfVotePhase}
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
          <HighlightedText variant="statement" color="dark" onTermPress={onTermPress}>{displayStatement}</HighlightedText>
        </View>

        {/* Availability indicator */}
        {!isSelfVotePhase && displayPosition?.availability === 'none' && (
          <ThemedText variant="label" color="secondary" style={styles.availabilityNone}>{t('positionNoUsers')}</ThemedText>
        )}

        {/* Archived label */}
        {!isSelfVotePhase && disabled && (
          <ThemedText variant="label" color="secondary" style={styles.archivedLabel}>{t('archivedStageLabel')}</ThemedText>
        )}

        {/* Self-vote prompt */}
        {isSelfVotePhase && (
          <ThemedText variant="label" color="secondary" style={styles.selfVotePrompt}>{t('selfVotePrompt')}</ThemedText>
        )}

        {/* Footer */}
        <View style={[styles.footer, disabled && !isSelfVotePhase && styles.footerDisabled]}>
          {canModerate ? (
            <TouchableOpacity onPress={onModerate} style={[styles.iconButton, styles.flagButton, isSelfVotePhase && styles.headerButtonDisabled]} accessibilityLabel={t('positionModerate')} accessibilityRole="button" disabled={disabled || isSelfVotePhase}>
              <Ionicons name="shield-outline" size={22} color="#E57373" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onReport} style={[styles.iconButton, styles.flagButton, isSelfVotePhase && styles.headerButtonDisabled]} accessibilityLabel={t('positionReport')} accessibilityRole="button" disabled={disabled || isSelfVotePhase}>
              <Ionicons name="flag-outline" size={22} color="#E57373" />
            </TouchableOpacity>
          )}

          <View style={styles.footerCenter}>
            <View style={styles.footerCenterInner}>
              <UserCard user={author} avatarSize="md" />
            </View>
          </View>

          <TouchableOpacity onPress={onAddPosition} style={[styles.iconButton, styles.addButton, isSelfVotePhase && styles.headerButtonDisabled]} accessibilityLabel={t('positionAdd')} accessibilityRole="button" disabled={disabled || isSelfVotePhase}>
            <Ionicons name="add-circle-outline" size={26} color="#81C784" />
          </TouchableOpacity>
        </View>
      </CardShell>
    </SwipeableCard>
  )
})

export default PositionCard

const createStyles = (colors) => StyleSheet.create({
  writeCardWrapper: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 },
      android: { elevation: 8 },
      default: { boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)' },
    }),
  },
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
  writeBody: {
    flex: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  statementInput: {
    fontSize: 22,
    fontWeight: '500',
    lineHeight: 32,
    textAlign: 'left',
    padding: 8,
    minHeight: 64 + 16, // 2 lines (32 * 2) + vertical padding
  },
  charCount: {
    textAlign: 'right',
    marginBottom: 4,
  },
  createError: {
    textAlign: 'center',
    marginBottom: 4,
  },
  similarContainer: {
    marginTop: 10,
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 10,
  },
  similarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  similarTitle: {
    marginLeft: 6,
    flex: 1,
  },
  similarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  similarContent: {
    flex: 1,
  },
  similarStatement: {
    lineHeight: 18,
    fontStyle: 'italic',
  },
  similarMeta: {
    marginTop: 2,
  },
  adoptButton: {
    padding: 4,
    marginLeft: 8,
  },
  noSimilarText: {
    textAlign: 'center',
    paddingVertical: 8,
  },
  rulesButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.chattingListBg,
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  selfVotePrompt: {
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  selfVoteHint: {
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 8,
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
  headerButtonDisabled: {
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
