import { useState, useEffect, useRef } from 'react'
import { Platform, Keyboard } from 'react-native'

/**
 * Cross-platform keyboard height detection hook.
 *
 * - Native: uses Keyboard.addListener (keyboardDidShow / keyboardDidHide)
 * - Web (Chrome/Safari): uses visualViewport resize events
 * - Web (Firefox Mobile): estimate-first on focusin + polling to refine
 *
 * Returns { keyboardHeight, webInitialHeight } — no scroll logic.
 */
export default function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const webInitialHeightRef = useRef(0)
  // Expose as a plain number so consumers don't need .current
  const [webInitialHeight, setWebInitialHeight] = useState(0)

  useEffect(() => {
    if (Platform.OS === 'web') {
      const vv = typeof window !== 'undefined' && window.visualViewport
      if (!vv) return

      // Capture initial height before keyboard opens — Firefox doesn't update
      // vv.height on first keyboard open, and window.innerHeight never changes.
      const initialHeight = window.innerHeight
      webInitialHeightRef.current = initialHeight
      setWebInitialHeight(initialHeight)

      const detectKeyboard = () => {
        const kbHeight = initialHeight - vv.height
        const isOpen = kbHeight > 150
        setKeyboardHeight(isOpen ? kbHeight : 0)
      }

      // Resize events work on Chrome/Safari (not Firefox Mobile)
      vv.addEventListener('resize', detectKeyboard)
      window.addEventListener('resize', detectKeyboard)

      // Focus-based handling for Firefox (where resize events don't fire).
      // On first keyboard open, Firefox may not update vv.height at all,
      // so we immediately estimate keyboard height, then poll to refine
      // if vv.height eventually changes.
      let pollTimer = null
      let focusOutTimer = null

      const handleFocusIn = () => {
        clearTimeout(focusOutTimer)
        clearTimeout(pollTimer)

        // If keyboard already detected (vv.height changed), just update
        const currentKB = initialHeight - vv.height
        if (currentKB > 150) {
          detectKeyboard()
          return
        }

        // Keyboard not yet detected — estimate at 40% of screen height.
        const estimate = Math.round(initialHeight * 0.4)
        setKeyboardHeight(estimate)

        // Poll to refine with actual vv.height if it changes
        let attempts = 0
        const poll = () => {
          attempts++
          const kb = initialHeight - vv.height
          if (kb > 150) {
            detectKeyboard()
            return
          }
          if (attempts < 30) {
            pollTimer = setTimeout(poll, 100)
          }
        }
        pollTimer = setTimeout(poll, 200)
      }

      const handleFocusOut = () => {
        clearTimeout(pollTimer)
        focusOutTimer = setTimeout(() => {
          const kb = initialHeight - vv.height
          if (kb <= 150) {
            setKeyboardHeight(0)
          }
        }, 300)
      }

      document.addEventListener('focusin', handleFocusIn)
      document.addEventListener('focusout', handleFocusOut)

      return () => {
        vv.removeEventListener('resize', detectKeyboard)
        window.removeEventListener('resize', detectKeyboard)
        document.removeEventListener('focusin', handleFocusIn)
        document.removeEventListener('focusout', handleFocusOut)
        clearTimeout(pollTimer)
        clearTimeout(focusOutTimer)
      }
    } else {
      // Native: Keyboard API
      const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
        setKeyboardHeight(e.endCoordinates.height)
      })
      const hideSub = Keyboard.addListener('keyboardDidHide', () => {
        setKeyboardHeight(0)
      })
      return () => {
        showSub.remove()
        hideSub.remove()
      }
    }
  }, [])

  return { keyboardHeight, webInitialHeight }
}
