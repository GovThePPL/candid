import { StyleSheet, View, TouchableOpacity, Animated } from 'react-native'
import { useState, useRef, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { BrandColor, OnBrandColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import SwipeableCard from './SwipeableCard'
import CardShell from '../CardShell'

const PairwiseCard = forwardRef(function PairwiseCard({
  pairwise,
  onRespond,
  onSkip,
  isBackCard = false,
  backCardAnimatedValue,
}, ref) {
  const { t } = useTranslation('cards')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [selectedOption, setSelectedOption] = useState(null)
  const flashAnim = useRef(new Animated.Value(0)).current
  const swipeableRef = useRef(null)

  // Flash animation to indicate selection needed (delayed until card stops moving)
  const flashOptions = useCallback(() => {
    // Wait for card to return to center before flashing
    setTimeout(() => {
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 250, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 0, duration: 250, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 1, duration: 250, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 0, duration: 250, useNativeDriver: false }),
      ]).start()
    }, 500)
  }, [flashAnim])

  // Store selectedOption in a ref so handlers can access current value
  const selectedOptionRef = useRef(selectedOption)
  selectedOptionRef.current = selectedOption

  // Handle right swipe - submit if option selected, otherwise flash
  const handleSwipeRight = useCallback(() => {
    const data = pairwise?.data
    if (!data) return false

    if (selectedOptionRef.current && onRespond) {
      // Determine winner and loser based on selection
      const winnerId = selectedOptionRef.current
      const loserId = winnerId === data.optionA.id ? data.optionB.id : data.optionA.id
      onRespond(data.surveyId, winnerId, loserId)
    } else {
      // Flash options to indicate selection needed
      flashOptions()
      // Return false to prevent the swipe (card stays in place)
      return false
    }
  }, [onRespond, pairwise, flashOptions])

  // Handle down swipe - skip
  const handleSkip = useCallback(() => {
    onSkip?.()
  }, [onSkip])

  // Expose swipe methods via ref
  useImperativeHandle(ref, () => ({
    swipeRight: () => swipeableRef.current?.swipeRight?.(),
    swipeLeft: () => swipeableRef.current?.swipeLeft?.(),
    swipeDown: () => swipeableRef.current?.swipeDown?.(),
    swipeUp: () => {}, // No-op for pairwise
  }), [])

  const handleOptionPress = (optionId) => {
    setSelectedOption(prev => prev === optionId ? null : optionId)
  }

  const data = pairwise?.data || {}
  const surveyTitle = data.surveyTitle || t('pairwiseTitle')
  const question = data.question || t('pairwiseDefaultQuestion')
  const optionA = data.optionA || { id: 'a', text: t('pairwiseOptionA') }
  const optionB = data.optionB || { id: 'b', text: t('pairwiseOptionB') }
  const location = data.location
  const category = data.category

  // Build options array
  const options = [
    { id: optionA.id, option: optionA.text },
    { id: optionB.id, option: optionB.text },
  ]

  // Calculate flash background color (darkens to indicate selection needed)
  const flashBackgroundColor = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.buttonDefault, colors.buttonSelected],
  })

  const headerContent = (
    <View style={styles.headerRow}>
      {/* Survey Icon */}
      <View style={styles.iconContainer}>
        <Ionicons name="clipboard" size={48} color={OnBrandColors.text} />
      </View>

      {/* Title and Subtitle */}
      <View style={styles.titleContainer}>
        <ThemedText variant="statement" color="inverse" style={styles.headerTitle}>{t('pairwiseTitle')}</ThemedText>
        <ThemedText variant="button" style={styles.headerSubtitle} numberOfLines={1}>{surveyTitle}</ThemedText>
      </View>
    </View>
  )

  return (
    <SwipeableCard
      ref={swipeableRef}
      onSwipeRight={handleSwipeRight}
      onSwipeLeft={handleSkip}
      onSwipeDown={handleSkip}
      enableVerticalSwipe={true}
      rightSwipeAsSubmit={true}
      leftSwipeAsPass={true}
      isBackCard={isBackCard}
      backCardAnimatedValue={backCardAnimatedValue}
      accessibilityLabel={t('pairwiseA11yLabel', { question })}
      accessibilityHint={t('pairwiseA11yHint')}
    >
      <CardShell
        size="full"
        headerColor={BrandColor}
        header={headerContent}
        bodyStyle={styles.bodyContent}
      >
        {/* Location & Category Header */}
        <View style={styles.contentHeader}>
          {location?.code && (
            <View style={styles.locationBadge}>
              <ThemedText variant="buttonSmall" color="badge">{location.code}</ThemedText>
            </View>
          )}
          <ThemedText variant="bodySmall" color="badge">
            {category?.label || t('pairwiseDefaultCategory')}
          </ThemedText>
        </View>

        {/* Question */}
        <View style={styles.questionContainer}>
          <ThemedText variant="statement" color="dark" style={styles.question}>{question}</ThemedText>
        </View>

        {/* Options */}
        <View style={styles.optionsContainer}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.id}
              activeOpacity={0.7}
              onPress={() => handleOptionPress(option.id)}
              disabled={isBackCard}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedOption === option.id }}
              accessibilityLabel={option.option}
            >
              <Animated.View
                style={[
                  styles.option,
                  selectedOption === option.id && styles.optionSelected,
                  selectedOption !== option.id && { backgroundColor: flashBackgroundColor },
                ]}
              >
                <ThemedText
                  variant="button"
                  style={[
                    styles.optionText,
                    selectedOption === option.id && styles.optionTextSelected,
                  ]}
                >
                  {option.option}
                </ThemedText>
              </Animated.View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Instructions */}
        <View style={styles.footer}>
          {selectedOption ? (
            <ThemedText variant="button" color="primary">{t('pairwiseSubmitInstruction')}</ThemedText>
          ) : (
            <ThemedText variant="button" color="primary">{t('pairwiseSelectOption')}</ThemedText>
          )}
          <ThemedText variant="bodySmall" color="secondary">{t('pairwiseSkipInstruction')}</ThemedText>
        </View>
      </CardShell>
    </SwipeableCard>
  )
})

export default PairwiseCard

const createStyles = (colors) => StyleSheet.create({
  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 4,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flexDirection: 'column',
  },
  headerTitle: {
    fontStyle: 'italic',
  },
  headerSubtitle: {
    color: OnBrandColors.textSecondary,
  },
  // Body
  bodyContent: {
    padding: 16,
  },
  contentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  locationBadge: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  questionContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 20,
  },
  question: {
    textAlign: 'center',
  },
  optionsContainer: {
    gap: 12,
  },
  option: {
    backgroundColor: colors.buttonDefault,
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  optionSelected: {
    backgroundColor: colors.buttonSelected,
  },
  optionText: {
    color: colors.buttonDefaultText,
  },
  optionTextSelected: {
    color: colors.buttonSelectedText,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 20,
    gap: 4,
  },
})
