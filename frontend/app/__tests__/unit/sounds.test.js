import { Platform } from 'react-native'
import {
  playReactionSound,
  playAgreedSound,
  playClosureSound,
  playUpvoteSound,
  playBridgingSound,
} from '../../lib/sounds'

// Mock Web Audio API — each call returns a fresh object
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

beforeEach(() => {
  jest.clearAllMocks()
  // Reset AudioContext to force fresh creation
  global.window = {
    AudioContext: jest.fn(() => mockAudioContext),
  }
})

describe('sound functions on web', () => {
  beforeEach(() => {
    Platform.OS = 'web'
  })

  afterAll(() => {
    Platform.OS = 'ios' // Reset to default
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
})

describe('sound functions on native', () => {
  beforeEach(() => {
    Platform.OS = 'ios'
  })

  it('playReactionSound no-ops without error', async () => {
    await expect(playReactionSound()).resolves.toBeUndefined()
  })

  it('playAgreedSound no-ops without error', async () => {
    await expect(playAgreedSound()).resolves.toBeUndefined()
  })

  it('playClosureSound no-ops without error', async () => {
    await expect(playClosureSound()).resolves.toBeUndefined()
  })

  it('playUpvoteSound no-ops without error', async () => {
    await expect(playUpvoteSound()).resolves.toBeUndefined()
  })

  it('playBridgingSound no-ops without error', async () => {
    await expect(playBridgingSound()).resolves.toBeUndefined()
  })
})
