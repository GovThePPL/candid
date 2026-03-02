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

const DemographicCard = forwardRef(function DemographicCard({
  demographic,
  onRespond,
  onSkip,
  isBackCard = false,
  backCardAnimatedValue,
}, ref) {
  const { t } = useTranslation('cards')
  const colors = useThemeColors()
  const options = demographic?.options || []
  const optionSizeTier = useMemo(() => {
    if (options.length >= 7) return 'dense'
    if (options.length >= 5) return 'compact'
    return 'default'
  }, [options.length])
  const styles = useMemo(() => createStyles(colors, optionSizeTier), [colors, optionSizeTier])
  const [selectedOption, setSelectedOption] = useState(null)
  const { triggerFlash, flashStyle } = useFlashAnimation(colors.buttonDefault, colors.buttonSelected)
  const swipeableRef = useRef(null)

  // Store selectedOption in a ref so handlers can access current value
  const selectedOptionRef = useRef(selectedOption)
  selectedOptionRef.current = selectedOption

  // Handle right swipe - submit if option selected, otherwise flash
  const handleSwipeRight = useCallback(() => {
    if (selectedOptionRef.current && onRespond) {
      onRespond(demographic.field, selectedOptionRef.current)
    } else {
      // Flash options to indicate selection needed
      triggerFlash()
      // Return false to prevent the swipe (card stays in place)
      return false
    }
  }, [onRespond, demographic, triggerFlash])

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

  const questionText = demographic?.question || ''

  const headerContent = (
    <View style={styles.headerRow}>
      {/* Person Icon */}
      <View style={styles.iconContainer}>
        <Ionicons name="person-outline" size={48} color={OnBrandColors.text} />
      </View>

      {/* Title */}
      <View style={styles.titleContainer}>
        <ThemedText variant="statement" color="inverse" style={styles.headerTitle}>{t('demographicTitle')}</ThemedText>
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
      accessibilityLabel={t('demographicA11yLabel', { question: questionText })}
      accessibilityHint={t('demographicA11yHint')}
    >
      <CardShell
        size="full"
        headerColor={BrandColor}
        header={headerContent}
        bodyStyle={styles.bodyContent}
      >
        {/* Question */}
        <View style={styles.questionContainer}>
          <ThemedText
            variant="statement"
            color="dark"
            style={styles.question}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {questionText}
          </ThemedText>
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
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedOption === option.value }}
                accessibilityLabel={option.label}
              >
                <Animated.View
                  style={[
                    styles.option,
                    flashStyle,
                    selectedOption === option.value && styles.optionSelected,
                  ]}
                >
                  <ThemedText
                    variant={optionSizeTier === 'default' ? 'button' : 'buttonSmall'}
                    style={[
                      styles.optionText,
                      selectedOption === option.value && styles.optionTextSelected,
                    ]}
                    numberOfLines={2}
                  >
                    {option.label}
                  </ThemedText>
                </Animated.View>
              </TouchableOpacity>
            ))
          ) : (
            <ThemedText variant="button" color="secondary" style={styles.noOptionsText}>{t('demographicNoOptions')}</ThemedText>
          )}
        </View>

        {/* Instructions */}
        <View style={styles.footer}>
          {selectedOption ? (
            <ThemedText variant="button" color="primary">{t('demographicSubmitInstruction')}</ThemedText>
          ) : (
            <ThemedText variant="button" color="primary">{t('demographicSelectOption')}</ThemedText>
          )}
          <ThemedText variant="bodySmall" color="secondary">{t('demographicSkipInstruction')}</ThemedText>
        </View>
      </CardShell>
    </SwipeableCard>
  )
})

export default DemographicCard

const createStyles = (colors, tier) => StyleSheet.create({
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
    paddingBottom: tier === 'default' ? 24 : 16,
  },
  question: {
    textAlign: 'center',
  },
  optionsContainer: {
    gap: tier === 'dense' ? 6 : tier === 'compact' ? 8 : 12,
  },
  option: {
    backgroundColor: colors.buttonDefault,
    borderRadius: 25,
    paddingVertical: tier === 'dense' ? 7 : tier === 'compact' ? 10 : 14,
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
