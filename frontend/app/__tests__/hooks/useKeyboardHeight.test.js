import { renderHook, act } from '@testing-library/react-native'
import { Platform, Keyboard } from 'react-native'
import useKeyboardHeight from '../../hooks/useKeyboardHeight'

// Track listeners for cleanup verification
let keyboardListeners

beforeEach(() => {
  jest.useFakeTimers()
  keyboardListeners = {}

  // Mock Keyboard API
  jest.spyOn(Keyboard, 'addListener').mockImplementation((event, cb) => {
    keyboardListeners[event] = cb
    return { remove: jest.fn(() => { delete keyboardListeners[event] }) }
  })
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('useKeyboardHeight - native', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios')
  })

  it('returns 0 initially', () => {
    const { result } = renderHook(() => useKeyboardHeight())
    expect(result.current.keyboardHeight).toBe(0)
    expect(result.current.webInitialHeight).toBe(0)
  })

  it('registers keyboardDidShow and keyboardDidHide listeners', () => {
    renderHook(() => useKeyboardHeight())
    expect(Keyboard.addListener).toHaveBeenCalledWith('keyboardDidShow', expect.any(Function))
    expect(Keyboard.addListener).toHaveBeenCalledWith('keyboardDidHide', expect.any(Function))
  })

  it('sets keyboardHeight on keyboardDidShow', () => {
    const { result } = renderHook(() => useKeyboardHeight())

    act(() => {
      keyboardListeners['keyboardDidShow']({ endCoordinates: { height: 300 } })
    })

    expect(result.current.keyboardHeight).toBe(300)
  })

  it('resets keyboardHeight on keyboardDidHide', () => {
    const { result } = renderHook(() => useKeyboardHeight())

    act(() => {
      keyboardListeners['keyboardDidShow']({ endCoordinates: { height: 300 } })
    })
    expect(result.current.keyboardHeight).toBe(300)

    act(() => {
      keyboardListeners['keyboardDidHide']()
    })
    expect(result.current.keyboardHeight).toBe(0)
  })

  it('removes listeners on unmount', () => {
    const { unmount } = renderHook(() => useKeyboardHeight())
    unmount()
    // Listeners were removed (our mock deletes them from the object)
    expect(keyboardListeners['keyboardDidShow']).toBeUndefined()
    expect(keyboardListeners['keyboardDidHide']).toBeUndefined()
  })
})

describe('useKeyboardHeight - web', () => {
  let mockVV
  let vvListeners
  let windowListeners
  let documentListeners

  let savedDocument

  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')

    vvListeners = {}
    windowListeners = {}
    documentListeners = {}

    // Mock visualViewport
    mockVV = {
      height: 800,
      addEventListener: jest.fn((event, cb) => { vvListeners[event] = cb }),
      removeEventListener: jest.fn((event) => { delete vvListeners[event] }),
    }

    // Define web globals that don't exist in RN test env
    global.window.visualViewport = mockVV
    global.window.innerHeight = 800
    global.window.addEventListener = jest.fn((event, cb) => { windowListeners[event] = cb })
    global.window.removeEventListener = jest.fn((event) => { delete windowListeners[event] })

    // document may not exist in RN test env
    savedDocument = global.document
    global.document = {
      addEventListener: jest.fn((event, cb) => { documentListeners[event] = cb }),
      removeEventListener: jest.fn((event) => { delete documentListeners[event] }),
    }
  })

  // Don't delete window.addEventListener/removeEventListener in afterEach — React's
  // auto-cleanup unmounts the hook AFTER this runs, and the cleanup function needs them.
  // They get overwritten by beforeEach in the next test anyway.

  it('captures webInitialHeight from window.innerHeight', () => {
    const { result } = renderHook(() => useKeyboardHeight())
    expect(result.current.webInitialHeight).toBe(800)
  })

  it('registers resize listener on visualViewport only (not window)', () => {
    renderHook(() => useKeyboardHeight())
    expect(mockVV.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
    // window.resize is intentionally NOT used — it fires during navigation
    // transitions and address bar changes, causing false keyboard detection
    expect(window.addEventListener).not.toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('registers focusin/focusout listeners on document', () => {
    renderHook(() => useKeyboardHeight())
    expect(document.addEventListener).toHaveBeenCalledWith('focusin', expect.any(Function))
    expect(document.addEventListener).toHaveBeenCalledWith('focusout', expect.any(Function))
  })

  it('detects keyboard via visualViewport resize (Chrome/Safari path)', () => {
    const { result } = renderHook(() => useKeyboardHeight())

    // Simulate keyboard opening: vv.height shrinks
    act(() => {
      mockVV.height = 500
      vvListeners['resize']()
    })

    expect(result.current.keyboardHeight).toBe(300)
  })

  it('ignores small viewport changes (< 150px)', () => {
    const { result } = renderHook(() => useKeyboardHeight())

    act(() => {
      mockVV.height = 700 // Only 100px difference
      vvListeners['resize']()
    })

    expect(result.current.keyboardHeight).toBe(0)
  })

  it('resets on keyboard close via resize', () => {
    const { result } = renderHook(() => useKeyboardHeight())

    act(() => {
      mockVV.height = 500
      vvListeners['resize']()
    })
    expect(result.current.keyboardHeight).toBe(300)

    act(() => {
      mockVV.height = 800
      vvListeners['resize']()
    })
    expect(result.current.keyboardHeight).toBe(0)
  })

  it('estimates keyboard height on focusin when vv.height unchanged (Firefox Mobile)', () => {
    // Simulate mobile Firefox user agent
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/109.0 Firefox/109.0', configurable: true })
    const { result } = renderHook(() => useKeyboardHeight())

    // Firefox: vv.height stays at 800 (unchanged)
    act(() => {
      documentListeners['focusin']()
    })

    // Should estimate at 40% of 800 = 320
    expect(result.current.keyboardHeight).toBe(320)
  })

  it('skips focusin estimate on desktop browsers', () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/109.0', configurable: true })
    const { result } = renderHook(() => useKeyboardHeight())

    act(() => {
      documentListeners['focusin']()
    })

    // Desktop: should NOT estimate keyboard height
    expect(result.current.keyboardHeight).toBe(0)
  })

  it('refines estimate when vv.height eventually changes (Firefox Mobile poll)', () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/109.0 Firefox/109.0', configurable: true })
    const { result } = renderHook(() => useKeyboardHeight())

    act(() => {
      documentListeners['focusin']()
    })
    expect(result.current.keyboardHeight).toBe(320) // estimate

    // After 200ms, poll starts. Simulate vv.height changing.
    act(() => {
      mockVV.height = 480
      jest.advanceTimersByTime(200)
    })

    // Poll detected real keyboard height: 800 - 480 = 320
    expect(result.current.keyboardHeight).toBe(320)
  })

  it('resets on focusout after delay', () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/109.0 Firefox/109.0', configurable: true })
    const { result } = renderHook(() => useKeyboardHeight())

    act(() => {
      mockVV.height = 500
      vvListeners['resize']()
    })
    expect(result.current.keyboardHeight).toBe(300)

    // Simulate blur
    act(() => {
      mockVV.height = 800 // keyboard closed
      documentListeners['focusout']()
    })
    // Not yet reset — 300ms delay
    expect(result.current.keyboardHeight).toBe(300)

    act(() => {
      jest.advanceTimersByTime(300)
    })
    expect(result.current.keyboardHeight).toBe(0)
  })

  it('cancels focusout timer when focusin fires again', () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/109.0 Firefox/109.0', configurable: true })
    const { result } = renderHook(() => useKeyboardHeight())

    act(() => {
      mockVV.height = 500
      vvListeners['resize']()
    })
    expect(result.current.keyboardHeight).toBe(300)

    // Blur starts close timer
    act(() => {
      documentListeners['focusout']()
    })

    // Before 300ms elapses, focus fires again (tab between inputs)
    act(() => {
      jest.advanceTimersByTime(100)
      documentListeners['focusin']()
    })

    // 300ms passes but keyboard should still be detected
    act(() => {
      jest.advanceTimersByTime(300)
    })
    expect(result.current.keyboardHeight).toBe(300)
  })

  it('removes all listeners and timers on unmount', () => {
    const { unmount } = renderHook(() => useKeyboardHeight())

    unmount()

    expect(mockVV.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(document.removeEventListener).toHaveBeenCalledWith('focusin', expect.any(Function))
    expect(document.removeEventListener).toHaveBeenCalledWith('focusout', expect.any(Function))
  })
})
