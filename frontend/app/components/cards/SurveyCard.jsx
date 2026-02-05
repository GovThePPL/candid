import { StyleSheet, View, Text, TouchableOpacity, Animated, Platform } from 'react-native'
import { useState, useRef, useImperativeHandle, forwardRef, useCallback } from 'react'
import { Colors } from '../../constants/Colors'
import SwipeableCard from './SwipeableCard'

const SurveyCard = forwardRef(function SurveyCard({
  survey,
  onRespond,
  onSkip,
  isBackCard = false,
  backCardAnimatedValue,
}, ref) {
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
    if (selectedOptionRef.current && onRespond) {
      onRespond(survey.surveyId, survey.id, selectedOptionRef.current)
    } else {
      // Flash options to indicate selection needed
      flashOptions()
      // Return false to prevent the swipe (card stays in place)
      return false
    }
  }, [onRespond, survey, flashOptions])

  // Handle down swipe - skip survey
  const handleSkip = useCallback(() => {
    onSkip?.()
  }, [onSkip])

  // Expose swipe methods via ref
  useImperativeHandle(ref, () => ({
    swipeRight: () => swipeableRef.current?.swipeRight?.(),
    swipeLeft: () => {}, // No-op for survey (only right and down swipes)
    swipeDown: () => swipeableRef.current?.swipeDown?.(),
    swipeUp: () => {}, // No-op for survey
  }), [])

  const handleOptionPress = (option) => {
    setSelectedOption(prev => prev === option.id ? null : option.id)
  }

  // Get the options from the survey data
  const options = survey?.options || []
  const questionText = survey?.question || ''
  const surveyTitle = survey?.surveyTitle || 'Survey'
  const category = survey?.category || 'General'

  // Calculate flash background color (darkens to indicate selection needed)
  const flashBackgroundColor = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.primaryLight, Colors.primaryMuted],
  })

  return (
    <SwipeableCard
      ref={swipeableRef}
      onSwipeRight={handleSwipeRight}
      onSwipeDown={handleSkip}
      enableVerticalSwipe={true}
      rightSwipeAsSubmit={true}
      isBackCard={isBackCard}
      backCardAnimatedValue={backCardAnimatedValue}
    >
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.categoryName}>{category}</Text>
          {surveyTitle && surveyTitle !== 'Survey' && (
            <Text style={styles.surveyTitle} numberOfLines={1}>{surveyTitle}</Text>
          )}
        </View>

        {/* Question */}
        <View style={styles.questionContainer}>
          <Text style={styles.question}>{questionText}</Text>
        </View>

        {/* Options */}
        <View style={styles.optionsContainer}>
          {options.length > 0 ? (
            options.map((option) => (
              <TouchableOpacity
                key={option.id}
                activeOpacity={0.7}
                onPress={() => handleOptionPress(option)}
                disabled={isBackCard}
              >
                <Animated.View
                  style={[
                    styles.option,
                    selectedOption === option.id && styles.optionSelected,
                    selectedOption !== option.id && { backgroundColor: flashBackgroundColor },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selectedOption === option.id && styles.optionTextSelected,
                    ]}
                  >
                    {option.option || option.label}
                  </Text>
                </Animated.View>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.noOptionsText}>No options available</Text>
          )}
        </View>

        {/* Instructions */}
        <View style={styles.footer}>
          {selectedOption ? (
            <Text style={styles.footerText}>Swipe right to submit</Text>
          ) : (
            <Text style={styles.footerText}>Select an option</Text>
          )}
          <Text style={styles.skipText}>Swipe down to skip</Text>
        </View>
      </View>
    </SwipeableCard>
  )
})

export default SurveyCard

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  surveyTitle: {
    flex: 1,
    fontSize: 14,
    color: Colors.pass,
  },
  questionContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 24,
  },
  question: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.darkText,
    lineHeight: 30,
    textAlign: 'center',
  },
  optionsContainer: {
    gap: 12,
  },
  option: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  optionSelected: {
    backgroundColor: Colors.primary,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.darkText,
  },
  optionTextSelected: {
    color: Colors.white,
  },
  noOptionsText: {
    fontSize: 16,
    color: Colors.pass,
    textAlign: 'center',
    paddingVertical: 20,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 24,
    gap: 4,
  },
  footerText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.primary,
  },
  skipText: {
    fontSize: 14,
    color: Colors.pass,
  },
})
