/**
 * Sound utilities for chat notifications.
 * Uses Web Audio API on web, expo-audio + generated WAV files on native.
 *
 * Native approach: PCM samples are synthesized in JS (same oscillator math
 * as the web version), packed into WAV format, written to the filesystem
 * once at init, then preloaded as audio players for low-latency replay.
 */

import { Platform } from 'react-native'

// ---------------------------------------------------------------------------
// PCM synthesis helpers (shared between web and native)
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 44100

/** Generate sine wave samples with frequency envelope. */
function sineSegment(samples, startSample, endSample, freqStart, freqEnd, gainStart, gainEnd, type = 'sine') {
  const len = endSample - startSample
  if (len <= 0) return
  for (let i = 0; i < len; i++) {
    const t = i / len
    // Exponential interpolation for frequency (matches Web Audio exponentialRamp)
    const freq = freqStart * Math.pow(freqEnd / freqStart, t)
    // Exponential interpolation for gain
    const gain = gainStart * Math.pow(Math.max(gainEnd, 0.0001) / Math.max(gainStart, 0.0001), t)
    const phase = 2 * Math.PI * freq * (i / SAMPLE_RATE)
    let value
    if (type === 'triangle') {
      // Triangle wave: -1 to 1
      const p = ((i / SAMPLE_RATE * freq) % 1)
      value = p < 0.5 ? (4 * p - 1) : (3 - 4 * p)
    } else {
      value = Math.sin(phase)
    }
    const idx = startSample + i
    if (idx < samples.length) {
      samples[idx] += value * gain
    }
  }
}

/** Convert seconds to sample index. */
function sec(s) {
  return Math.round(s * SAMPLE_RATE)
}

// ---------------------------------------------------------------------------
// Sound definitions as PCM sample generators
// ---------------------------------------------------------------------------

function generateTypingSamples() {
  const duration = 0.35
  const samples = new Float32Array(sec(duration))
  const taps = [0, 0.05, 0.15, 0.20, 0.30]
  for (const tapTime of taps) {
    sineSegment(samples, sec(tapTime), sec(tapTime + 0.02), 400, 150, 0.02, 0.001, 'triangle')
  }
  return samples
}

function generateMessageSamples() {
  const duration = 0.2
  const samples = new Float32Array(sec(duration))
  // Bloop: 150→300 in 0.05s, then 300→100 in 0.1s
  sineSegment(samples, 0, sec(0.05), 150, 300, 0.15, 0.12)
  sineSegment(samples, sec(0.05), sec(0.2), 300, 100, 0.12, 0.001)
  return samples
}

function generateKudosSamples() {
  const notes = [523.25, 659.25, 783.99, 1046.50]
  const noteLength = 0.12
  const gap = 0.08
  const duration = notes.length * (noteLength + gap)
  const samples = new Float32Array(sec(duration))
  notes.forEach((freq, i) => {
    const start = i * (noteLength + gap)
    sineSegment(samples, sec(start), sec(start + noteLength), freq, freq, 0.2, 0.01)
  })
  return samples
}

function generateReactionSamples() {
  const duration = 0.12
  const samples = new Float32Array(sec(duration))
  sineSegment(samples, 0, sec(duration), 880, 660, 0.25, 0.001)
  return samples
}

function generateAgreedSamples() {
  const duration = 0.4
  const samples = new Float32Array(sec(duration))
  // C4 + G4 chord with swell
  for (const freq of [261.63, 392.00]) {
    sineSegment(samples, 0, sec(0.08), freq, freq, 0.01, 0.12)
    sineSegment(samples, sec(0.08), sec(0.4), freq, freq, 0.12, 0.001)
  }
  return samples
}

function generateClosureSamples() {
  const notes = [261.63, 329.63, 392.00, 523.25]
  const noteSpacing = 0.15
  const totalEnd = notes.length * noteSpacing + 0.3
  const samples = new Float32Array(sec(totalEnd))
  notes.forEach((freq, i) => {
    const startTime = i * noteSpacing
    const endTime = i === 0
      ? startTime + noteSpacing + 0.05
      : totalEnd
    sineSegment(samples, sec(startTime), sec(startTime + 0.04), freq, freq, 0.001, 0.1)
    sineSegment(samples, sec(startTime + 0.04), sec(endTime - 0.15), freq, freq, 0.1, 0.1)
    sineSegment(samples, sec(endTime - 0.15), sec(endTime), freq, freq, 0.1, 0.001)
  })
  return samples
}

function generateUpvoteSamples() {
  const duration = 0.12
  const samples = new Float32Array(sec(duration))
  sineSegment(samples, 0, sec(0.015), 600, 580, 0.001, 0.3)
  sineSegment(samples, sec(0.015), sec(0.12), 580, 400, 0.3, 0.001)
  return samples
}

function generateIncomingRequestSamples() {
  // Descending two-tone chime: G5 → C5 (attention-grabbing, signals "someone reaching out")
  const duration = 0.35
  const samples = new Float32Array(sec(duration))
  // First note: G5 (783.99 Hz)
  sineSegment(samples, 0, sec(0.03), 783.99, 783.99, 0.001, 0.15)
  sineSegment(samples, sec(0.03), sec(0.15), 783.99, 783.99, 0.15, 0.001)
  // Second note: C5 (523.25 Hz)
  sineSegment(samples, sec(0.15), sec(0.18), 523.25, 523.25, 0.001, 0.15)
  sineSegment(samples, sec(0.18), sec(0.35), 523.25, 523.25, 0.15, 0.001)
  return samples
}

function generateBridgingSamples() {
  const duration = 0.4
  const samples = new Float32Array(sec(duration))
  // First note: C4
  sineSegment(samples, 0, sec(0.03), 261.63, 261.63, 0.001, 0.1)
  sineSegment(samples, sec(0.03), sec(0.15), 261.63, 261.63, 0.1, 0.001)
  // Second note: E4
  sineSegment(samples, sec(0.15), sec(0.18), 329.63, 329.63, 0.001, 0.1)
  sineSegment(samples, sec(0.18), sec(0.4), 329.63, 329.63, 0.1, 0.001)
  return samples
}

const SOUND_GENERATORS = {
  typing: generateTypingSamples,
  message: generateMessageSamples,
  kudos: generateKudosSamples,
  reaction: generateReactionSamples,
  agreed: generateAgreedSamples,
  closure: generateClosureSamples,
  upvote: generateUpvoteSamples,
  bridging: generateBridgingSamples,
  incomingRequest: generateIncomingRequestSamples,
}

// ---------------------------------------------------------------------------
// WAV encoding
// ---------------------------------------------------------------------------

/** Build a WAV file as raw bytes (Uint8Array) from Float32 PCM samples. */
function encodeWavBytes(samples) {
  // Clamp and convert Float32 → Int16
  const pcm = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }

  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = SAMPLE_RATE * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcm.byteLength

  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  // RIFF header
  view.setUint32(0, 0x52494646, false)   // "RIFF"
  view.setUint32(4, 36 + dataSize, true)
  view.setUint32(8, 0x57415645, false)   // "WAVE"
  // fmt sub-chunk
  view.setUint32(12, 0x666d7420, false)  // "fmt "
  view.setUint32(16, 16, true)           // PCM sub-chunk size
  view.setUint16(20, 1, true)            // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  // data sub-chunk
  view.setUint32(36, 0x64617461, false)  // "data"
  view.setUint32(40, dataSize, true)
  // PCM data
  new Uint8Array(buffer, 44).set(new Uint8Array(pcm.buffer))

  return new Uint8Array(buffer)
}

/** Convenience wrapper: WAV bytes → base64 string (used in tests). */
function encodeWavBase64(samples) {
  return uint8ArrayToBase64(encodeWavBytes(samples))
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function uint8ArrayToBase64(bytes) {
  let result = ''
  const len = bytes.length
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i]
    const b2 = i + 1 < len ? bytes[i + 1] : 0
    const b3 = i + 2 < len ? bytes[i + 2] : 0
    result += B64_CHARS[b1 >> 2]
    result += B64_CHARS[((b1 & 3) << 4) | (b2 >> 4)]
    result += i + 1 < len ? B64_CHARS[((b2 & 15) << 2) | (b3 >> 6)] : '='
    result += i + 2 < len ? B64_CHARS[b3 & 63] : '='
  }
  return result
}

// ---------------------------------------------------------------------------
// Native playback (expo-audio + expo-file-system/legacy)
// ---------------------------------------------------------------------------

let nativeSounds = null    // { typing: AudioPlayer, ... } once initialized
let nativeInitPromise = null

// Bump this when the encoder or sound generators change to force WAV regeneration
const SOUND_CACHE_VERSION = '4'

async function initNativeSounds() {
  if (Platform.OS === 'web') return
  // Only skip if we actually have loaded sounds (not empty from a failed init)
  if (nativeSounds && Object.keys(nativeSounds).length > 0) return
  if (nativeInitPromise) return nativeInitPromise

  nativeSounds = null

  nativeInitPromise = (async () => {
    try {
      const { createAudioPlayer, setAudioModeAsync } = require('expo-audio')
      // Use legacy import — SDK 54 deprecated the old expo-file-system API
      // and the default import now throws for methods like getInfoAsync.
      const FileSystem = require('expo-file-system/legacy')

      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'duckOthers',
        shouldRouteThroughEarpiece: false,
      })

      const sounds = {}
      const dir = FileSystem.documentDirectory + 'sounds/'
      const dirInfo = await FileSystem.getInfoAsync(dir)
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true })
      }

      // Check cache version — regenerate all WAV files when encoder changes
      const versionFile = dir + '.version'
      let needsRegenerate = false
      try {
        const storedVersion = await FileSystem.readAsStringAsync(versionFile)
        needsRegenerate = storedVersion !== SOUND_CACHE_VERSION
      } catch {
        needsRegenerate = true
      }
      if (needsRegenerate) {
        try {
          const dirContents = await FileSystem.readDirectoryAsync(dir)
          for (const file of dirContents) {
            if (file.endsWith('.wav')) {
              await FileSystem.deleteAsync(dir + file, { idempotent: true })
            }
          }
        } catch {
          // Directory listing failed — ignore, files will be overwritten
        }
        await FileSystem.writeAsStringAsync(versionFile, SOUND_CACHE_VERSION)
      }

      for (const [name, generator] of Object.entries(SOUND_GENERATORS)) {
        try {
          const filePath = dir + name + '.wav'
          const fileInfo = await FileSystem.getInfoAsync(filePath)
          if (!fileInfo.exists) {
            const pcm = generator()
            const b64 = encodeWavBase64(pcm)
            await FileSystem.writeAsStringAsync(filePath, b64, {
              encoding: FileSystem.EncodingType.Base64,
            })
          }
          const player = createAudioPlayer({ uri: filePath })
          sounds[name] = player
        } catch (e) {
          console.warn(`Failed to init sound "${name}":`, e)
          // Continue loading other sounds — don't let one failure break all
        }
      }

      nativeSounds = sounds
    } catch (e) {
      console.warn('Failed to initialize native sounds:', e)
      // Reset so next call can retry instead of being permanently broken
      nativeSounds = null
      nativeInitPromise = null
    }
  })()

  return nativeInitPromise
}

async function playNative(name) {
  if (!nativeSounds || Object.keys(nativeSounds).length === 0) {
    await initNativeSounds()
  }
  const sound = nativeSounds?.[name]
  if (!sound) return
  try {
    sound.seekTo(0)
    sound.play()
  } catch (e) {
    console.warn(`Failed to play ${name} sound:`, e)
  }
}

// ---------------------------------------------------------------------------
// Web playback (Web Audio API)
// ---------------------------------------------------------------------------

let audioContext = null

function getAudioContext() {
  if (Platform.OS === 'web' && !audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioContext
}

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

function playSingleTap(ctx, startTime) {
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()
  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)
  oscillator.frequency.setValueAtTime(400, startTime)
  oscillator.frequency.exponentialRampToValueAtTime(150, startTime + 0.02)
  oscillator.type = 'triangle'
  gainNode.gain.setValueAtTime(0.02, startTime)
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.03)
  oscillator.start(startTime)
  oscillator.stop(startTime + 0.03)
}

// ---------------------------------------------------------------------------
// Public API — each function branches web vs native
// ---------------------------------------------------------------------------

export async function playTypingSound() {
  if (Platform.OS !== 'web') return playNative('typing')
  const ctx = await ensureAudioReady()
  if (!ctx) return
  const now = ctx.currentTime
  playSingleTap(ctx, now)
  playSingleTap(ctx, now + 0.05)
  playSingleTap(ctx, now + 0.15)
  playSingleTap(ctx, now + 0.20)
  playSingleTap(ctx, now + 0.30)
}

export async function playMessageSound() {
  if (Platform.OS !== 'web') return playNative('message')
  const ctx = await ensureAudioReady()
  if (!ctx) return
  const now = ctx.currentTime
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()
  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)
  oscillator.frequency.setValueAtTime(150, now)
  oscillator.frequency.exponentialRampToValueAtTime(300, now + 0.05)
  oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.15)
  oscillator.type = 'sine'
  gainNode.gain.setValueAtTime(0.15, now)
  gainNode.gain.setValueAtTime(0.12, now + 0.05)
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
  oscillator.start(now)
  oscillator.stop(now + 0.2)
}

export async function playKudosSound() {
  if (Platform.OS !== 'web') return playNative('kudos')
  const ctx = await ensureAudioReady()
  if (!ctx) return
  const now = ctx.currentTime
  const notes = [523.25, 659.25, 783.99, 1046.50]
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
    gainNode.gain.setValueAtTime(0.2, startTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + noteLength)
    oscillator.start(startTime)
    oscillator.stop(startTime + noteLength)
  })
}

export async function playReactionSound() {
  if (Platform.OS !== 'web') return playNative('reaction')
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

export async function playAgreedSound() {
  if (Platform.OS !== 'web') return playNative('agreed')
  const ctx = await ensureAudioReady()
  if (!ctx) return
  const now = ctx.currentTime
  const notes = [261.63, 392.00]
  notes.forEach((freq) => {
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()
    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)
    oscillator.frequency.setValueAtTime(freq, now)
    oscillator.type = 'sine'
    gainNode.gain.setValueAtTime(0.01, now)
    gainNode.gain.linearRampToValueAtTime(0.12, now + 0.08)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
    oscillator.start(now)
    oscillator.stop(now + 0.4)
  })
}

export async function playClosureSound() {
  if (Platform.OS !== 'web') return playNative('closure')
  const ctx = await ensureAudioReady()
  if (!ctx) return
  const now = ctx.currentTime
  const notes = [261.63, 329.63, 392.00, 523.25]
  const noteSpacing = 0.15
  notes.forEach((freq, i) => {
    const startTime = now + i * noteSpacing
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

export async function playUpvoteSound() {
  if (Platform.OS !== 'web') return playNative('upvote')
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

export async function playIncomingRequestSound() {
  if (Platform.OS !== 'web') return playNative('incomingRequest')
  const ctx = await ensureAudioReady()
  if (!ctx) return
  const now = ctx.currentTime
  // G5
  const osc1 = ctx.createOscillator()
  const gain1 = ctx.createGain()
  osc1.connect(gain1)
  gain1.connect(ctx.destination)
  osc1.frequency.setValueAtTime(783.99, now)
  osc1.type = 'sine'
  gain1.gain.setValueAtTime(0.001, now)
  gain1.gain.linearRampToValueAtTime(0.15, now + 0.03)
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
  osc1.start(now)
  osc1.stop(now + 0.15)
  // C5
  const osc2 = ctx.createOscillator()
  const gain2 = ctx.createGain()
  osc2.connect(gain2)
  gain2.connect(ctx.destination)
  osc2.frequency.setValueAtTime(523.25, now + 0.15)
  osc2.type = 'sine'
  gain2.gain.setValueAtTime(0.001, now + 0.15)
  gain2.gain.linearRampToValueAtTime(0.15, now + 0.18)
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
  osc2.start(now + 0.15)
  osc2.stop(now + 0.35)
}

export async function playBridgingSound() {
  if (Platform.OS !== 'web') return playNative('bridging')
  const ctx = await ensureAudioReady()
  if (!ctx) return
  const now = ctx.currentTime
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

/**
 * Pre-initialize native sounds. Call early (e.g., on app mount or chat join)
 * so sounds are ready for instant playback. No-op on web.
 */
export { initNativeSounds }

// For testing — expose synthesis helpers
export { encodeWavBase64, SOUND_GENERATORS, SAMPLE_RATE }

export default {
  playTypingSound,
  playMessageSound,
  playKudosSound,
  playReactionSound,
  playAgreedSound,
  playClosureSound,
  playUpvoteSound,
  playBridgingSound,
  playIncomingRequestSound,
  initNativeSounds,
}
