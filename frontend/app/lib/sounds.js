/**
 * Sound utilities for chat notifications.
 * Uses Web Audio API for web, expo-av for native.
 */

import { Platform } from 'react-native'

let audioContext = null

// Initialize audio context (web only)
function getAudioContext() {
  if (Platform.OS === 'web' && !audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioContext
}

// Ensure audio context is ready to play
async function ensureAudioReady() {
  const ctx = getAudioContext()
  if (!ctx) return null

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch (e) {
      console.warn('Could not resume audio context:', e)
      return null
    }
  }

  return ctx
}

// Play a single soft tap
function playSingleTap(ctx, startTime) {
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  // Very soft, short tick
  oscillator.frequency.setValueAtTime(400, startTime)
  oscillator.frequency.exponentialRampToValueAtTime(150, startTime + 0.02)
  oscillator.type = 'triangle'

  // Very quiet volume
  gainNode.gain.setValueAtTime(0.02, startTime)
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.03)

  oscillator.start(startTime)
  oscillator.stop(startTime + 0.03)
}

/**
 * Play a soft typing/tapping sound - 5 taps with varied rhythm.
 * Subtle tap sound when other user starts typing.
 * Pattern: tap-tap...tap-tap...tap (alternating close/far spacing)
 */
export async function playTypingSound() {
  if (Platform.OS !== 'web') {
    // TODO: Implement native sound with expo-av
    return
  }

  const ctx = await ensureAudioReady()
  if (!ctx) return

  const now = ctx.currentTime

  // Play 5 soft taps with alternating close/far spacing
  // Pattern: close (50ms), far (100ms), close (50ms), far (100ms)
  playSingleTap(ctx, now)
  playSingleTap(ctx, now + 0.05)   // 50ms - close
  playSingleTap(ctx, now + 0.15)   // 100ms - far
  playSingleTap(ctx, now + 0.20)   // 50ms - close
  playSingleTap(ctx, now + 0.30)   // 100ms - far
}

/**
 * Play a message received notification sound.
 * Soft "bloop" sound - low, round, bubbly.
 */
export async function playMessageSound() {
  if (Platform.OS !== 'web') {
    // TODO: Implement native sound with expo-av
    return
  }

  const ctx = await ensureAudioReady()
  if (!ctx) return

  const now = ctx.currentTime

  // Create a soft "bloop" - low frequency bubble sound
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  // Bloop: start low, briefly rise, then fall - like a water drop
  oscillator.frequency.setValueAtTime(150, now)
  oscillator.frequency.exponentialRampToValueAtTime(300, now + 0.05)
  oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.15)
  oscillator.type = 'sine' // Smooth, round sound

  // Soft volume with gentle decay
  gainNode.gain.setValueAtTime(0.15, now)
  gainNode.gain.setValueAtTime(0.12, now + 0.05)
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2)

  oscillator.start(now)
  oscillator.stop(now + 0.2)
}

/**
 * Play a cheerful "1 up" kudos sound.
 * Ascending arpeggio like classic video game power-up.
 */
export async function playKudosSound() {
  if (Platform.OS !== 'web') {
    // TODO: Implement native sound with expo-av
    return
  }

  const ctx = await ensureAudioReady()
  if (!ctx) return

  const now = ctx.currentTime

  // Play ascending arpeggio - C E G C (one octave up)
  const notes = [523.25, 659.25, 783.99, 1046.50] // C5, E5, G5, C6
  const noteLength = 0.12
  const gap = 0.08

  notes.forEach((freq, i) => {
    const startTime = now + i * (noteLength + gap)

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.frequency.setValueAtTime(freq, startTime)
    oscillator.type = 'sine'

    // Bright, cheerful volume
    gainNode.gain.setValueAtTime(0.2, startTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + noteLength)

    oscillator.start(startTime)
    oscillator.stop(startTime + noteLength)
  })
}

export default {
  playTypingSound,
  playMessageSound,
  playKudosSound,
}
