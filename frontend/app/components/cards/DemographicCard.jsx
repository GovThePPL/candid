import { StyleSheet, View, TouchableOpacity, Animated } from 'react-native'
import { useState, useRef, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../ThemedText'
import SwipeableCard from './SwipeableCard'

const DemographicCard = forwardRef(function DemographicCard({
  demographic,
  onRespond,
  onSkip,
  isBackCard = false,
  backCardAnimatedValue,
}, ref) {
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
    if (selectedOptionRef.current && onRespond) {
      onRespond(demographic.field, selectedOptionRef.current)
    } else {
      // Flash options to indicate selection needed
      flashOptions()
      // Return false to prevent the swipe (card stays in place)
      return false
    }
  }, [onRespond, demographic, flashOptions])

  // Handle down swipe - skip demographic
  const handleSkip = useCallback(() => {
    onSkip?.()
  }, [onSkip])

  // Expose swipe methods via ref
  useImperativeHandle(ref, () => ({
    swipeRight: () => swipeableRef.current?.swipeRight?.(),
    swipeLeft: () => {}, // No-op for demographic (only right and down swipes)
    swipeDown: () => swipeableRef.current?.swipeDown?.(),
    swipeUp: () => {}, // No-op for demographic
  }), [])

  const handleOptionPress = (option) => {
    setSelectedOption(prev => prev === option.value ? null : option.value)
  }

  // Get the options from the demographic data
  const options = demographic?.options || []
  const questionText = demographic?.question || ''

  // Calculate flash background color (darkens to indicate selection needed)
  const flashBackgroundColor = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.buttonDefault, colors.buttonSelected],
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
          <ThemedText variant="buttonSmall" color="badge" style={styles.categoryName}>About You</ThemedText>
        </View>

        {/* Question */}
        <View style={styles.questionContainer}>
          <ThemedText variant="statement" color="dark" style={styles.question}>{questionText}</ThemedText>
        </View>

        {/* Options */}
        <View style={styles.optionsContainer}>
          {options.length > 0 ? (
            options.map((option) => (
              <TouchableOpacity
                key={option.value}
                activeOpacity={0.7}
                onPress={() => handleOptionPress(option)}
                disabled={isBackCard}
              >
                <Animated.View
                  style={[
                    styles.option,
                    selectedOption === option.value && styles.optionSelected,
                    selectedOption !== option.value && { backgroundColor: flashBackgroundColor },
                  ]}
                >
                  <ThemedText
                    variant="button"
                    style={[
                      styles.optionText,
                      selectedOption === option.value && styles.optionTextSelected,
                    ]}
                  >
                    {option.label}
                  </ThemedText>
                </Animated.View>
              </TouchableOpacity>
            ))
          ) : (
            <ThemedText variant="button" color="secondary" style={styles.noOptionsText}>No options available</ThemedText>
          )}
        </View>

        {/* Instructions */}
        <View style={styles.footer}>
          {selectedOption ? (
            <ThemedText variant="button" color="badge" style={styles.footerText}>Swipe right to submit</ThemedText>
          ) : (
            <ThemedText variant="button" color="badge" style={styles.footerText}>Select an option</ThemedText>
          )}
          <ThemedText variant="bodySmall" color="secondary">Swipe down to skip</ThemedText>
        </View>
      </View>
    </SwipeableCard>
  )
})

export default DemographicCard

const createStyles = (colors) => StyleSheet.create({
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
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  questionContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 24,
  },
  question: {
    fontWeight: '600',
    lineHeight: 30,
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
    fontWeight: '500',
    color: colors.buttonDefaultText,
  },
  optionTextSelected: {
    color: colors.buttonSelectedText,
  },
  noOptionsText: {
    fontWeight: '400',
    textAlign: 'center',
    paddingVertical: 20,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 24,
    gap: 4,
  },
  footerText: {
    fontWeight: '500',
  },
})
