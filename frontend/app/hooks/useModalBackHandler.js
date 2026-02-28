import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'

// ── Global modal-history stack ──────────────────────────────────
//
// The `popstate` event is dispatched directly on `window` and does
// not bubble.  This means the capture/bubble distinction has no effect
// — all listeners fire in **registration order** during the target
// phase.  Per-modal popstate listeners therefore can't suppress each
// other reliably.
//
// Instead we keep a single global listener and a stack of open modals.
// When the browser back button fires popstate, only the topmost modal
// closes.  When a modal closes via the UI, it sets `_popToIgnore` so
// the global handler skips the popstate caused by history.back().

const _modalStack = []
let _popToIgnore = 0
let _handlerInstalled = false

function _ensureGlobalHandler() {
  if (_handlerInstalled || typeof window === 'undefined') return
  _handlerInstalled = true
  window.addEventListener('popstate', () => {
    if (_popToIgnore > 0) {
      _popToIgnore--
      return
    }
    if (_modalStack.length > 0) {
      const entry = _modalStack[_modalStack.length - 1]
      entry.closedByBack = true
      entry.onClose?.()
    }
  })
}

/**
 * Web-only hook that integrates modal visibility with browser history.
 *
 * When the modal opens:
 *   - Pushes a history entry so the browser back button can close it
 *
 * When the browser back button is pressed (popstate):
 *   - Closes the topmost modal only (via global stack)
 *
 * When the modal is closed via UI (X button, overlay tap, etc.):
 *   - Pops the extra history entry and tells the global handler to
 *     ignore the resulting popstate so outer modals are unaffected
 *
 * Escape key handling is delegated to React Native Web's Modal component,
 * which correctly fires onRequestClose only on the topmost modal.
 *
 * On native platforms this hook is a no-op (Android uses onRequestClose).
 */
export default function useModalBackHandler(visible, onClose) {
  // Keep onClose in a ref so the effect only depends on `visible`.
  // Inline callbacks (e.g. () => setVisible(false)) change identity every
  // render; without the ref the effect would cycle (cleanup → back → push)
  // on every parent re-render, churning the history stack.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  const entryRef = useRef(null)

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return

    _ensureGlobalHandler()

    const entry = {
      onClose: () => onCloseRef.current?.(),
      closedByBack: false,
    }
    entryRef.current = entry
    _modalStack.push(entry)

    // Push a history entry so browser back can close the modal.
    // Preserve existing history.state (e.g. Expo Router's navigation state)
    // so that the popstate triggered by cleanup's back() doesn't cause the
    // router to reconcile/remount the screen.
    window.history.pushState({ ...window.history.state, _modal: true }, '')

    return () => {
      const idx = _modalStack.indexOf(entry)
      if (idx !== -1) _modalStack.splice(idx, 1)

      if (!entry.closedByBack) {
        // Modal was closed via UI (not via browser back). Pop the extra
        // history entry and tell the global handler to ignore the popstate.
        _popToIgnore++
        window.history.back()
      }
    }
  }, [visible])
}
