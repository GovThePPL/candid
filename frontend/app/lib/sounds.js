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

/**
 * Play a soft bright ping when partner reacts to your message.
 * Sine wave A5 (880Hz) descending to ~660Hz, 0.12s, gain 0.08.
 */
export async function playReactionSound() {
  if (Platform.OS !== 'web') {
    // TODO: Implement native sound with expo-av
    return
  }

  const ctx = await ensureAudioReady()
  if (!ctx) return

  const now = ctx.currentTime

  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  oscillator.frequency.setValueAtTime(880, now)
  oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.12)
  oscillator.type = 'sine'

  gainNode.gain.setValueAtTime(0.08, now)
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

  oscillator.start(now)
  oscillator.stop(now + 0.12)
}

/**
 * Play a warm two-note chord when an agreed position is accepted.
 * Perfect fifth: C4 + G4, gentle swell, 0.4s decay.
 */
export async function playAgreedSound() {
  if (Platform.OS !== 'web') {
    // TODO: Implement native sound with expo-av
    return
  }

  const ctx = await ensureAudioReady()
  if (!ctx) return

  const now = ctx.currentTime
  const notes = [261.63, 392.00] // C4, G4

  notes.forEach((freq) => {
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.frequency.setValueAtTime(freq, now)
    oscillator.type = 'sine'

    // Gentle swell then decay
    gainNode.gain.setValueAtTime(0.01, now)
    gainNode.gain.linearRampToValueAtTime(0.12, now + 0.08)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4)

    oscillator.start(now)
    oscillator.stop(now + 0.4)
  })
}

/**
 * Play an ascending major chord arpeggio for mutual closure.
 * C4→E4→G4→C5, ~0.15s per note, last three sustain as chord ~0.3s.
 * Total ~0.8s. Warmer/lower octave than kudos arpeggio.
 */
export async function playClosureSound() {
  if (Platform.OS !== 'web') {
    // TODO: Implement native sound with expo-av
    return
  }

  const ctx = await ensureAudioReady()
  if (!ctx) return

  const now = ctx.currentTime
  const notes = [261.63, 329.63, 392.00, 523.25] // C4, E4, G4, C5
  const noteSpacing = 0.15

  notes.forEach((freq, i) => {
    const startTime = now + i * noteSpacing
    // Last three notes sustain together as a chord
    const endTime = i === 0
      ? startTime + noteSpacing + 0.05
      : now + notes.length * noteSpacing + 0.3

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.frequency.setValueAtTime(freq, startTime)
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(0.001, startTime)
    gainNode.gain.linearRampToValueAtTime(0.1, startTime + 0.04)
    gainNode.gain.setValueAtTime(0.1, endTime - 0.15)
    gainNode.gain.exponentialRampToValueAtTime(0.001, endTime)

    oscillator.start(startTime)
    oscillator.stop(endTime)
  })
}

/**
 * Play a soft pop for upvoting.
 * Sine wave at 600Hz, quick attack, fast decay, 0.08s total.
 */
export async function playUpvoteSound() {
  if (Platform.OS !== 'web') {
    // TODO: Implement native sound with expo-av
    return
  }

  const ctx = await ensureAudioReady()
  if (!ctx) return

  const now = ctx.currentTime

  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  oscillator.frequency.setValueAtTime(600, now)
  oscillator.frequency.exponentialRampToValueAtTime(400, now + 0.08)
  oscillator.type = 'sine'

  gainNode.gain.setValueAtTime(0.001, now)
  gainNode.gain.linearRampToValueAtTime(0.1, now + 0.01)
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08)

  oscillator.start(now)
  oscillator.stop(now + 0.08)
}

/**
 * Play a warm rising two-note interval for bridging threshold crossing.
 * Major third: C4→E4. First note 0.15s, second sustains 0.25s.
 */
export async function playBridgingSound() {
  if (Platform.OS !== 'web') {
    // TODO: Implement native sound with expo-av
    return
  }

  const ctx = await ensureAudioReady()
  if (!ctx) return

  const now = ctx.currentTime

  // First note: C4
  const osc1 = ctx.createOscillator()
  const gain1 = ctx.createGain()
  osc1.connect(gain1)
  gain1.connect(ctx.destination)
  osc1.frequency.setValueAtTime(261.63, now)
  osc1.type = 'sine'
  gain1.gain.setValueAtTime(0.001, now)
  gain1.gain.linearRampToValueAtTime(0.1, now + 0.03)
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
  osc1.start(now)
  osc1.stop(now + 0.15)

  // Second note: E4
  const osc2 = ctx.createOscillator()
  const gain2 = ctx.createGain()
  osc2.connect(gain2)
  gain2.connect(ctx.destination)
  osc2.frequency.setValueAtTime(329.63, now + 0.15)
  osc2.type = 'sine'
  gain2.gain.setValueAtTime(0.001, now + 0.15)
  gain2.gain.linearRampToValueAtTime(0.1, now + 0.18)
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
  osc2.start(now + 0.15)
  osc2.stop(now + 0.4)
}

export default {
  playTypingSound,
  playMessageSound,
  playKudosSound,
  playReactionSound,
  playAgreedSound,
  playClosureSound,
  playUpvoteSound,
  playBridgingSound,
}
