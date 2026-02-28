import { useCallback } from 'react'
import { useSharedValue, useAnimatedStyle, withSequence, withTiming, withDelay, interpolateColor } from 'react-native-reanimated'

const FLASH_DURATION = 350

/**
 * Shared hook for card option flash animation.
 * Used by PairwiseCard, SurveyCard, and DemographicCard to flash
 * unselected option backgrounds when the user tries to swipe without selecting.
 *
 * @param {string} defaultColor - The default button background color
 * @param {string} selectedColor - The selected/highlighted button background color
 * @returns {{ triggerFlash: Function, flashStyle: Object }}
 */
export default function useFlashAnimation(defaultColor, selectedColor) {
  const flash = useSharedValue(0)

  const triggerFlash = useCallback(() => {
    flash.value = withDelay(500,
      withSequence(
        withTiming(0.4, { duration: FLASH_DURATION }),
        withTiming(0, { duration: FLASH_DURATION }),
        withTiming(0.4, { duration: FLASH_DURATION }),
        withTiming(0, { duration: FLASH_DURATION }),
      )
    )
  }, [flash])

  const flashStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(flash.value, [0, 1], [defaultColor, selectedColor]),
  }), [defaultColor, selectedColor])

  return { triggerFlash, flashStyle }
}
