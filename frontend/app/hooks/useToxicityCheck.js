import { useState, useCallback, useRef, useEffect } from 'react'
import api from '../lib/api'

const COUNTDOWN_SECONDS = 5

/**
 * Hook that checks text for toxicity before sending.
 *
 * Usage:
 *   const toxicity = useToxicityCheck()
 *   // In send handler: toxicity.checkAndSend(text, doSend)
 *   // In JSX: <ReconsiderModal {...toxicity.modalProps} />
 *
 * If the text is toxic, shows the ReconsiderModal with a 5-second countdown.
 * If the text is clean (or the NLP service fails), calls sendFn immediately.
 */
export default function useToxicityCheck() {
  const [visible, setVisible] = useState(false)
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [checking, setChecking] = useState(false)

  const sendFnRef = useRef(null)
  const timerRef = useRef(null)

  // Countdown timer
  useEffect(() => {
    if (!visible) return

    if (countdown <= 0) {
      clearInterval(timerRef.current)
      return
    }

    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current)
          return 0
        }
        return c - 1
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [visible, countdown <= 0])

  const reset = useCallback(() => {
    setVisible(false)
    setCountdown(COUNTDOWN_SECONDS)
    setChecking(false)
    clearInterval(timerRef.current)
    sendFnRef.current = null
  }, [])

  /**
   * Check text for toxicity, then either show the modal or call sendFn.
   * @param {string} text - The message text
   * @param {function} sendFn - Function to call if text is clean
   * @param {function} [sendAnywayFn] - Function to call if user sends despite toxicity flag.
   *   If not provided, sendFn is used. This allows the caller to pass a
   *   wasFlaggedToxic metadata flag to the server when the user overrides.
   */
  const checkAndSend = useCallback(async (text, sendFn, sendAnywayFn) => {
    if (!text?.trim()) return

    setChecking(true)
    try {
      const result = await api.moderation.checkToxicity(text)
      if (result?.isToxic) {
        sendFnRef.current = sendAnywayFn || sendFn
        setCountdown(COUNTDOWN_SECONDS)
        setVisible(true)
        setChecking(false)
        return
      }
    } catch {
      // Fail open — if API call fails, just send the message
    }

    setChecking(false)
    sendFn()
  }, [])

  const handleRevise = useCallback(() => {
    reset()
  }, [reset])

  const handleSendAnyway = useCallback(() => {
    const fn = sendFnRef.current
    reset()
    if (fn) fn()
  }, [reset])

  return {
    checking,
    checkAndSend,
    modalProps: {
      visible,
      countdown,
      checking,
      onRevise: handleRevise,
      onSendAnyway: handleSendAnyway,
    },
  }
}
