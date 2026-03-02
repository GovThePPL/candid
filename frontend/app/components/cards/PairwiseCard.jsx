import { StyleSheet, View, TouchableOpacity } from 'react-native'
import Animated from 'react-native-reanimated'
import { useState, useRef, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import useFlashAnimation from '../../hooks/useFlashAnimation'
import { BrandColor, OnBrandColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import SwipeableCard from './SwipeableCard'
import CardShell from '../CardShell'
import LocationSessionBadge from '../LocationSessionBadge'

const PairwiseCard = forwardRef(function PairwiseCard({
  pairwise,
  onRespond,
  onSkip,
  isBackCard = false,
  backCardAnimatedValue,
  disabled = false,
}, ref) {
  const { t } = useTranslation('cards')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [selectedOption, setSelectedOption] = useState(null)
  const { triggerFlash, flashStyle } = useFlashAnimation(colors.buttonDefault, colors.buttonSelected)
  const swipeableRef = useRef(null)

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
      triggerFlash()
      // Return false to prevent the swipe (card stays in place)
      return false
    }
  }, [onRespond, pairwise, triggerFlash])

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
  const session = data.session

  // Build options array
  const options = [
    { id: optionA.id, option: optionA.text },
    { id: optionB.id, option: optionB.text },
  ]

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
      archivedMode={disabled}
      isBackCard={isBackCard}
      backCardAnimatedValue={backCardAnimatedValue}
      accessibilityLabel={t('pairwiseA11yLabel', { question })}
      accessibilityHint={disabled ? t('archivedA11yHint') : t('pairwiseA11yHint')}
    >
      <CardShell
        size="full"
        headerColor={BrandColor}
        header={headerContent}
        bodyStyle={styles.bodyContent}
      >
        {/* Location & Session Header */}
        <View style={styles.contentHeader}>
          <LocationSessionBadge
            location={location}
            session={session || { label: t('pairwiseDefaultSession') }}
            size="lg"
          />
        </View>

        {/* Question */}
        <View style={styles.questionContainer}>
          <ThemedText
            variant="statement"
            color="dark"
            style={styles.question}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {question}
          </ThemedText>
        </View>

        {/* Archived label */}
        {disabled && (
          <ThemedText variant="label" color="secondary" style={styles.archivedLabel}>{t('archivedStageLabel')}</ThemedText>
        )}

        {/* Options */}
        <View style={[styles.optionsContainer, disabled && styles.optionsDisabled]}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.id}
              activeOpacity={0.7}
              onPress={() => handleOptionPress(option.id)}
              disabled={isBackCard || disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedOption === option.id }}
              accessibilityLabel={option.option}
            >
              <Animated.View
                style={[
                  styles.option,
                  flashStyle,
                  selectedOption === option.id && styles.optionSelected,
                ]}
              >
                <ThemedText
                  variant="button"
                  style={[
                    styles.optionText,
                    selectedOption === option.id && styles.optionTextSelected,
                  ]}
                  numberOfLines={3}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
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
  questionContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 20,
  },
  question: {
    textAlign: 'center',
  },
  archivedLabel: {
    fontWeight: '600',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 8,
  },
  optionsContainer: {
    gap: 12,
  },
  optionsDisabled: {
    opacity: 0.4,
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
