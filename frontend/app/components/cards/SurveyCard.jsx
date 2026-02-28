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

const SurveyCard = forwardRef(function SurveyCard({
  survey,
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
    if (selectedOptionRef.current && onRespond) {
      onRespond(survey.surveyId, survey.id, selectedOptionRef.current)
    } else {
      // Flash options to indicate selection needed
      triggerFlash()
      // Return false to prevent the swipe (card stays in place)
      return false
    }
  }, [onRespond, survey, triggerFlash])

  // Handle down swipe - skip survey
  const handleSkip = useCallback(() => {
    onSkip?.()
  }, [onSkip])

  // Expose swipe methods via ref
  useImperativeHandle(ref, () => ({
    swipeRight: () => swipeableRef.current?.swipeRight?.(),
    swipeLeft: () => swipeableRef.current?.swipeLeft?.(),
    swipeDown: () => swipeableRef.current?.swipeDown?.(),
    swipeUp: () => {}, // No-op for survey
  }), [])

  const handleOptionPress = (option) => {
    setSelectedOption(prev => prev === option.id ? null : option.id)
  }

  // Get the options from the survey data
  const options = survey?.options || []
  const questionText = survey?.question || ''
  const surveyTitle = survey?.surveyTitle || null
  const session = survey?.session || t('surveyDefaultSession')

  const headerContent = (
    <View style={styles.headerRow}>
      {/* Survey Icon */}
      <View style={styles.iconContainer}>
        <Ionicons name="clipboard" size={48} color={OnBrandColors.text} />
      </View>

      {/* Title and Session */}
      <View style={styles.titleContainer}>
        <ThemedText variant="statement" color="inverse" style={styles.headerTitle}>{t('surveyTitle')}</ThemedText>
        <ThemedText variant="button" style={styles.headerSubtitle} numberOfLines={1}>{session}</ThemedText>
        {surveyTitle && (
          <ThemedText variant="bodySmall" style={styles.headerSurveyTitle} numberOfLines={1}>{surveyTitle}</ThemedText>
        )}
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
      accessibilityLabel={t('surveyA11yLabel', { question: questionText })}
      accessibilityHint={disabled ? t('archivedA11yHint') : t('surveyA11yHint')}
    >
      <CardShell
        size="full"
        headerColor={BrandColor}
        header={headerContent}
        bodyStyle={styles.bodyContent}
      >
        {/* Question */}
        <View style={styles.questionContainer}>
          <ThemedText variant="statement" color="dark" style={styles.question}>{questionText}</ThemedText>
        </View>

        {/* Archived label */}
        {disabled && (
          <ThemedText variant="label" color="secondary" style={styles.archivedLabel}>{t('archivedStageLabel')}</ThemedText>
        )}

        {/* Options */}
        <View style={[styles.optionsContainer, disabled && styles.optionsDisabled]}>
          {options.length > 0 ? (
            options.map((option) => (
              <TouchableOpacity
                key={option.id}
                activeOpacity={0.7}
                onPress={() => handleOptionPress(option)}
                disabled={isBackCard || disabled}
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedOption === option.id }}
                accessibilityLabel={option.option || option.label}
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
                  >
                    {option.option || option.label}
                  </ThemedText>
                </Animated.View>
              </TouchableOpacity>
            ))
          ) : (
            <ThemedText variant="button" color="secondary" style={styles.noOptionsText}>{t('surveyNoOptions')}</ThemedText>
          )}
        </View>

        {/* Instructions */}
        <View style={styles.footer}>
          {selectedOption ? (
            <ThemedText variant="button" color="primary">{t('surveySubmitInstruction')}</ThemedText>
          ) : (
            <ThemedText variant="button" color="primary">{t('surveySelectOption')}</ThemedText>
          )}
          <ThemedText variant="bodySmall" color="secondary">{t('surveySkipInstruction')}</ThemedText>
        </View>
      </CardShell>
    </SwipeableCard>
  )
})

export default SurveyCard

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
  headerSurveyTitle: {
    color: OnBrandColors.textTertiary,
    marginTop: 2,
  },
  // Body
  bodyContent: {
    padding: 20,
  },
  questionContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 24,
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
  noOptionsText: {
    textAlign: 'center',
    paddingVertical: 20,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 24,
    gap: 4,
  },
})
