module.exports = {
  preset: 'jest-expo/ios',
  setupFilesAfterEnv: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@react-native-async-storage/async-storage|marked|turndown|@10play/tentap-editor)',
  ],
  testPathIgnorePatterns: ['/node_modules/'],
  forceExit: true,
}
