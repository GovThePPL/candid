import { StyleSheet, View, Text, TouchableOpacity, Animated } from 'react-native'
import { useState, useRef, useImperativeHandle, forwardRef, useCallback } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import SwipeableCard from './SwipeableCard'

const PairwiseCard = forwardRef(function PairwiseCard({
  pairwise,
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
    swipeLeft: () => {}, // No-op for pairwise (only right and down swipes)
    swipeDown: () => swipeableRef.current?.swipeDown?.(),
    swipeUp: () => {}, // No-op for pairwise
  }), [])

  const handleOptionPress = (optionId) => {
    setSelectedOption(prev => prev === optionId ? null : optionId)
  }

  const data = pairwise?.data || {}
  const surveyTitle = data.surveyTitle || 'Survey'
  const question = data.question || 'Which better describes your views?'
  const optionA = data.optionA || { id: 'a', text: 'Option A' }
  const optionB = data.optionB || { id: 'b', text: 'Option B' }
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
        {/* Purple Header Section */}
        <View style={styles.headerSection}>
          <View style={styles.headerRow}>
            {/* Survey Icon */}
            <View style={styles.iconContainer}>
              <Ionicons name="clipboard" size={48} color="#fff" />
            </View>

            {/* Title and Subtitle */}
            <View style={styles.titleContainer}>
              <Text style={styles.headerTitle}>Survey</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>{surveyTitle}</Text>
            </View>
          </View>
        </View>

        {/* Survey Content Card - White with Rounded Top Corners */}
        <View style={styles.contentCardWrapper}>
          <View style={styles.contentCard}>
            {/* Location & Category Header */}
            <View style={styles.contentHeader}>
              {location?.code && (
                <View style={styles.locationBadge}>
                  <Text style={styles.locationCode}>{location.code}</Text>
                </View>
              )}
              <Text style={styles.categoryName}>
                {category?.label || 'General'}
              </Text>
            </View>

            {/* Question */}
            <View style={styles.questionContainer}>
              <Text style={styles.question}>{question}</Text>
            </View>

            {/* Options */}
            <View style={styles.optionsContainer}>
              {options.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  activeOpacity={0.7}
                  onPress={() => handleOptionPress(option.id)}
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
                      {option.option}
                    </Text>
                  </Animated.View>
                </TouchableOpacity>
              ))}
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
        </View>
      </View>
    </SwipeableCard>
  )
})

export default PairwiseCard

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  headerSection: {
    backgroundColor: Colors.primary,
    paddingTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 28,
    flexShrink: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flexDirection: 'column',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  headerSubtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
  },
  contentCardWrapper: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  contentCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    padding: 16,
  },
  contentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  locationBadge: {
    backgroundColor: Colors.primaryMuted + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  locationCode: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  categoryName: {
    fontSize: 14,
    color: Colors.primary,
  },
  questionContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 20,
  },
  question: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1a1a1a',
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
    color: '#1a1a1a',
  },
  optionTextSelected: {
    color: '#fff',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 20,
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
