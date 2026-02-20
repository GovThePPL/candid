import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'

/**
 * Web-only hook that integrates modal visibility with browser history and Escape key.
 *
 * When the modal opens:
 *   - Pushes a history entry so the browser back button can close it
 *   - Listens for the Escape key
 *
 * When the browser back button is pressed (popstate):
 *   - Calls onClose instead of navigating away
 *
 * When the modal is closed via UI (X button, overlay tap, etc.):
 *   - Pops the extra history entry so the stack stays clean
 *
 * On native platforms this hook is a no-op (Android uses onRequestClose).
 */
export default function useModalBackHandler(visible, onClose) {
  const closedByBackRef = useRef(false)

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible || !onClose) return

    closedByBackRef.current = false

    // Push a history entry so browser back can close the modal
    window.history.pushState({ modal: true }, '')

    const handlePopState = () => {
      // Browser back was pressed — close the modal without popping again
      closedByBackRef.current = true
      onClose()
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('popstate', handlePopState)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)

      if (!closedByBackRef.current) {
        // Modal was closed via UI (not via browser back). We need to remove
        // the extra history entry we pushed. Replace the popstate handler
        // with a one-shot suppressor so the history.back() doesn't trigger
        // Expo Router's navigation (which would show a leave-chat prompt).
        const suppressPopState = (e) => {
          e.stopImmediatePropagation()
          window.removeEventListener('popstate', suppressPopState)
        }
        window.removeEventListener('popstate', handlePopState)
        window.addEventListener('popstate', suppressPopState)
        window.history.back()
      } else {
        window.removeEventListener('popstate', handlePopState)
      }
    }
  }, [visible, onClose])
}
