// Enable built-in matchers (toBeChecked, toBeSelected, toBeExpanded, etc.)
require('@testing-library/react-native/build/matchers/extend-expect')

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  Link: 'Link',
  Stack: { Screen: 'Screen' },
}))

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native')
  const Icon = (props) => <Text {...props}>{props.name}</Text>
  return { Ionicons: Icon, MaterialIcons: Icon }
})

// Mock expo-font
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
}))

// Mock expo-constants
jest.mock('expo-constants', () => ({
  expoConfig: { extra: {} },
}))

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, bottom: 0, left: 0, right: 0 }
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children, ...props }) => {
      const { View } = require('react-native')
      return <View {...props}>{children}</View>
    },
    useSafeAreaInsets: () => insets,
  }
})

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: {
      createAnimatedComponent: (component) => component,
      Value: jest.fn(),
      event: jest.fn(),
      add: jest.fn(),
      eq: jest.fn(),
      set: jest.fn(),
      cond: jest.fn(),
      interpolate: jest.fn(),
      View,
      ScrollView: View,
    },
    useSharedValue: jest.fn((initial) => ({ value: initial })),
    useAnimatedStyle: jest.fn(() => ({})),
    withTiming: jest.fn((v) => v),
    withSpring: jest.fn((v) => v),
    interpolate: jest.fn((v) => v),
    runOnJS: jest.fn((fn) => fn),
    cancelAnimation: jest.fn(),
    FadeIn: { duration: jest.fn(() => ({})) },
    FadeOut: { duration: jest.fn(() => ({})) },
    SlideInRight: {},
    SlideOutRight: {},
  }
})

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const { View, TouchableOpacity, ScrollView } = require('react-native')
  // Chainable gesture builder mock — each method returns `this`
  const createGestureBuilder = () => {
    const builder = {}
    const chainable = [
      'minDistance', 'onStart', 'onUpdate', 'onEnd', 'onFinalize',
      'activeOffsetX', 'activeOffsetY', 'failOffsetX', 'failOffsetY',
      'enabled', 'shouldCancelWhenOutside', 'simultaneousWithExternalGesture',
      'onBegin', 'onTouchesDown', 'onTouchesMove', 'onTouchesUp', 'onTouchesCancelled',
    ]
    chainable.forEach((m) => { builder[m] = jest.fn(() => builder) })
    return builder
  }
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ children }) => children,
    PanGestureHandler: View,
    TapGestureHandler: View,
    TouchableOpacity,
    ScrollView,
    State: {},
    Directions: {},
    Gesture: {
      Pan: jest.fn(createGestureBuilder),
      Tap: jest.fn(createGestureBuilder),
      Pinch: jest.fn(createGestureBuilder),
      Rotation: jest.fn(createGestureBuilder),
      Fling: jest.fn(createGestureBuilder),
      LongPress: jest.fn(createGestureBuilder),
      Race: jest.fn((...gestures) => gestures[0] || createGestureBuilder()),
      Simultaneous: jest.fn((...gestures) => gestures[0] || createGestureBuilder()),
      Exclusive: jest.fn((...gestures) => gestures[0] || createGestureBuilder()),
    },
  }
})

// Mock expo-localization
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', languageTag: 'en-US' }],
  getCalendars: () => [{ calendar: 'gregory', timeZone: 'America/Los_Angeles' }],
}))

// Mock i18next / react-i18next — t must be a stable reference to avoid
// infinite re-renders in components that use useMemo(..., [t])
const mockT = (key, params) => {
  if (params && typeof params === 'object') {
    // Include interpolation values so tests can verify dynamic content
    const values = Object.values(params).filter(v => v != null && v !== '').map(String)
    return values.length ? key + ' ' + values.join(' ') : key
  }
  return key
}
const mockI18n = { language: 'en', changeLanguage: jest.fn() }
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT, i18n: mockI18n }),
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  Trans: ({ children }) => children,
}))

// Mock I18nContext so components using useI18n work outside I18nProvider
jest.mock('./contexts/I18nContext', () => ({
  I18nProvider: ({ children }) => children,
  useI18n: () => ({
    language: 'en',
    languagePreference: 'system',
    setLanguagePreference: jest.fn(),
  }),
  SUPPORTED_LANGUAGES: ['en', 'es'],
}))

// Mock @react-native-async-storage/async-storage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}))
