import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { Colors } from '../constants/Colors'

/**
 * Loading spinner with optional message text.
 *
 * @param {Object} props
 * @param {string} [props.message='Loading...'] - Text shown below spinner
 * @param {Object} [props.style] - Additional container style
 */
export default function LoadingView({ message = 'Loading...', style }) {
  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.text}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  text: {
    fontSize: 15,
    color: Colors.pass,
    marginTop: 12,
  },
})
