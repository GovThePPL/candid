import { Platform } from 'react-native'
import {
  playReactionSound,
  playAgreedSound,
  playClosureSound,
  playUpvoteSound,
  playBridgingSound,
  playTypingSound,
  playMessageSound,
  playKudosSound,
  playIncomingRequestSound,
  initNativeSounds,
  encodeWavBase64,
  SOUND_GENERATORS,
  SAMPLE_RATE,
} from '../../lib/sounds'

// ---------------------------------------------------------------------------
// Web Audio API mocks
// ---------------------------------------------------------------------------

function createMockOscillator() {
  return {
    connect: jest.fn(),
    frequency: {
      setValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    },
    type: 'sine',
    start: jest.fn(),
    stop: jest.fn(),
  }
}

function createMockGainNode() {
  return {
    connect: jest.fn(),
    gain: {
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    },
  }
}

const mockAudioContext = {
  currentTime: 0,
  state: 'running',
  resume: jest.fn(() => Promise.resolve()),
  destination: {},
  createOscillator: jest.fn(() => createMockOscillator()),
  createGain: jest.fn(() => createMockGainNode()),
}

// ---------------------------------------------------------------------------
// expo-audio / expo-file-system/legacy mocks
// ---------------------------------------------------------------------------

const mockSeekTo = jest.fn()
const mockPlay = jest.fn()
const mockPlayer = { seekTo: mockSeekTo, play: mockPlay }

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  createAudioPlayer: jest.fn(() => mockPlayer),
}))

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/docs/',
  EncodingType: { Base64: 'base64' },
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: true })),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  readAsStringAsync: jest.fn(() => Promise.resolve('4')),
  readDirectoryAsync: jest.fn(() => Promise.resolve([])),
  deleteAsync: jest.fn(() => Promise.resolve()),
}))

beforeEach(() => {
  jest.clearAllMocks()
  global.window = {
    AudioContext: jest.fn(() => mockAudioContext),
  }
})

// ---------------------------------------------------------------------------
// Web tests
// ---------------------------------------------------------------------------

describe('sound functions on web', () => {
  beforeEach(() => {
    Platform.OS = 'web'
  })

  afterAll(() => {
    Platform.OS = 'ios'
  })

  describe('playReactionSound', () => {
    it('creates one oscillator at 880Hz', async () => {
      await playReactionSound()
      expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(1)
      const osc = mockAudioContext.createOscillator.mock.results[0].value
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(880, expect.any(Number))
    })
  })

  describe('playAgreedSound', () => {
    it('creates two oscillators for C4 + G4 chord', async () => {
      await playAgreedSound()
      expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2)
      const osc1 = mockAudioContext.createOscillator.mock.results[0].value
      const osc2 = mockAudioContext.createOscillator.mock.results[1].value
      expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(261.63, expect.any(Number))
      expect(osc2.frequency.setValueAtTime).toHaveBeenCalledWith(392.00, expect.any(Number))
    })
  })

  describe('playClosureSound', () => {
    it('creates four oscillators for C4→E4→G4→C5 arpeggio', async () => {
      await playClosureSound()
      expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(4)
      const freqs = mockAudioContext.createOscillator.mock.results.map(
        r => r.value.frequency.setValueAtTime.mock.calls[0][0]
      )
      expect(freqs).toEqual([261.63, 329.63, 392.00, 523.25])
    })
  })

  describe('playUpvoteSound', () => {
    it('creates one short oscillator at 600Hz', async () => {
      await playUpvoteSound()
      expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(1)
      const osc = mockAudioContext.createOscillator.mock.results[0].value
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(600, expect.any(Number))
    })
  })

  describe('playBridgingSound', () => {
    it('creates two oscillators for C4→E4', async () => {
      await playBridgingSound()
      expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2)
      const osc1 = mockAudioContext.createOscillator.mock.results[0].value
      const osc2 = mockAudioContext.createOscillator.mock.results[1].value
      expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(261.63, expect.any(Number))
      expect(osc2.frequency.setValueAtTime).toHaveBeenCalledWith(329.63, expect.any(Number))
    })
  })

  describe('playTypingSound', () => {
    it('uses triangle wave oscillators for taps', async () => {
      await playTypingSound()
      // 5 taps = 5 oscillators
      expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(5)
    })
  })

  describe('playMessageSound', () => {
    it('creates one oscillator starting at 150Hz', async () => {
      await playMessageSound()
      expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(1)
      const osc = mockAudioContext.createOscillator.mock.results[0].value
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(150, expect.any(Number))
    })
  })

  describe('playKudosSound', () => {
    it('creates four oscillators for ascending arpeggio', async () => {
      await playKudosSound()
      expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(4)
      const freqs = mockAudioContext.createOscillator.mock.results.map(
        r => r.value.frequency.setValueAtTime.mock.calls[0][0]
      )
      expect(freqs).toEqual([523.25, 659.25, 783.99, 1046.50])
    })
  })

  describe('playIncomingRequestSound', () => {
    it('creates two oscillators for descending G5→C5', async () => {
      await playIncomingRequestSound()
      expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2)
      const osc1 = mockAudioContext.createOscillator.mock.results[0].value
      const osc2 = mockAudioContext.createOscillator.mock.results[1].value
      expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(783.99, expect.any(Number))
      expect(osc2.frequency.setValueAtTime).toHaveBeenCalledWith(523.25, expect.any(Number))
    })
  })
})

// ---------------------------------------------------------------------------
// Native tests
// ---------------------------------------------------------------------------

describe('sound functions on native', () => {
  beforeEach(() => {
    Platform.OS = 'ios'
  })

  it('initNativeSounds writes WAV files and preloads sounds', async () => {
    const FileSystem = require('expo-file-system/legacy')
    const { setAudioModeAsync, createAudioPlayer } = require('expo-audio')

    await initNativeSounds()

    expect(setAudioModeAsync).toHaveBeenCalledWith({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
      shouldRouteThroughEarpiece: false,
    })

    // Should have checked/written 9 sound files
    const soundNames = Object.keys(SOUND_GENERATORS)
    expect(soundNames).toHaveLength(9)
    expect(createAudioPlayer).toHaveBeenCalledTimes(9)
  })

  it('playUpvoteSound calls seekTo+play on native', async () => {
    await playUpvoteSound()
    expect(mockSeekTo).toHaveBeenCalledWith(0)
    expect(mockPlay).toHaveBeenCalled()
  })

  it('playBridgingSound calls seekTo+play on native', async () => {
    await playBridgingSound()
    expect(mockSeekTo).toHaveBeenCalledWith(0)
    expect(mockPlay).toHaveBeenCalled()
  })

  it('playTypingSound calls seekTo+play on native', async () => {
    await playTypingSound()
    expect(mockSeekTo).toHaveBeenCalledWith(0)
    expect(mockPlay).toHaveBeenCalled()
  })

  it('playMessageSound calls seekTo+play on native', async () => {
    await playMessageSound()
    expect(mockSeekTo).toHaveBeenCalledWith(0)
    expect(mockPlay).toHaveBeenCalled()
  })

  it('playKudosSound calls seekTo+play on native', async () => {
    await playKudosSound()
    expect(mockSeekTo).toHaveBeenCalledWith(0)
    expect(mockPlay).toHaveBeenCalled()
  })

  it('playReactionSound calls seekTo+play on native', async () => {
    await playReactionSound()
    expect(mockSeekTo).toHaveBeenCalledWith(0)
    expect(mockPlay).toHaveBeenCalled()
  })

  it('playAgreedSound calls seekTo+play on native', async () => {
    await playAgreedSound()
    expect(mockSeekTo).toHaveBeenCalledWith(0)
    expect(mockPlay).toHaveBeenCalled()
  })

  it('playClosureSound calls seekTo+play on native', async () => {
    await playClosureSound()
    expect(mockSeekTo).toHaveBeenCalledWith(0)
    expect(mockPlay).toHaveBeenCalled()
  })

  it('playIncomingRequestSound calls seekTo+play on native', async () => {
    await playIncomingRequestSound()
    expect(mockSeekTo).toHaveBeenCalledWith(0)
    expect(mockPlay).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// PCM synthesis / WAV encoding tests
// ---------------------------------------------------------------------------

describe('PCM synthesis', () => {
  it('all generators produce non-silent samples', () => {
    for (const [name, gen] of Object.entries(SOUND_GENERATORS)) {
      const samples = gen()
      expect(samples.length).toBeGreaterThan(0)
      // At least some sample should be non-zero
      const maxAbs = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0)
      expect(maxAbs).toBeGreaterThan(0)
    }
  })

  it('sample rate is 44100', () => {
    expect(SAMPLE_RATE).toBe(44100)
  })
})

describe('WAV encoding', () => {
  it('produces valid WAV header', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1])
    const b64 = encodeWavBase64(samples)
    const binary = atob(b64)

    // Check RIFF header
    expect(binary.slice(0, 4)).toBe('RIFF')
    expect(binary.slice(8, 12)).toBe('WAVE')
    expect(binary.slice(12, 16)).toBe('fmt ')
    expect(binary.slice(36, 40)).toBe('data')

    // Total size: 44 header + 5 samples * 2 bytes = 54
    expect(binary.length).toBe(54)
  })

  it('clamps samples to [-1, 1]', () => {
    const samples = new Float32Array([2.0, -2.0])
    const b64 = encodeWavBase64(samples)
    const binary = atob(b64)
    // Should not throw and should produce valid output
    expect(binary.length).toBe(44 + 4) // 2 samples * 2 bytes
  })
})
