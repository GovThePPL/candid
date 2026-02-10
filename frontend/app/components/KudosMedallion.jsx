import { View, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

/**
 * Gold medallion with star icon, used for kudos badges.
 *
 * @param {Object} props
 * @param {boolean} [props.active=true] - Gold when active, gray when inactive
 * @param {number} [props.size=32] - Diameter in pixels
 */
export default function KudosMedallion({ active = true, size = 32 }) {
  const goldColor = active ? '#FFD700' : '#9CA3AF'
  const starColor = active ? '#B8860B' : '#6B7280'
  const ringColor = active ? '#DAA520' : '#D1D5DB'

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View style={[
        styles.ring,
        { borderColor: ringColor, width: size, height: size, borderRadius: size / 2 }
      ]}>
        <View style={[
          styles.medallion,
          { backgroundColor: goldColor, width: size - 6, height: size - 6, borderRadius: (size - 6) / 2 }
        ]}>
          <Ionicons name="star" size={size * 0.5} color={starColor} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medallion: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
