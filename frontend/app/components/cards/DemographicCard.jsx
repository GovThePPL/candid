import { StyleSheet, View, TouchableOpacity, Animated } from 'react-native'
import { useState, useRef, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../hooks/useThemeColors'
import { BrandColor, OnBrandColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import SwipeableCard from './SwipeableCard'
import CardShell from '../CardShell'

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
    swipeLeft: () => swipeableRef.current?.swipeLeft?.(),
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

  const headerContent = (
    <View style={styles.headerRow}>
      {/* Person Icon */}
      <View style={styles.iconContainer}>
        <Ionicons name="person-outline" size={48} color={OnBrandColors.text} />
      </View>

      {/* Title */}
      <View style={styles.titleContainer}>
        <ThemedText variant="statement" color="inverse" style={styles.headerTitle}>About You</ThemedText>
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
            <ThemedText variant="button" color="primary">Swipe right to submit</ThemedText>
          ) : (
            <ThemedText variant="button" color="primary">Select an option</ThemedText>
          )}
          <ThemedText variant="bodySmall" color="secondary">Swipe down to skip</ThemedText>
        </View>
      </CardShell>
    </SwipeableCard>
  )
})

export default DemographicCard

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
