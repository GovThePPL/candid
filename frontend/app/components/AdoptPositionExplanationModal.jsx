import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/Colors'

export default function AdoptPositionExplanationModal({ visible, onClose }) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.container}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="add-circle" size={48} color={Colors.agree} />
          </View>

          <Text style={styles.title}>Position Adopted!</Text>

          <Text style={styles.description}>
            You've adopted this position as your own. It will now appear in your "My Positions" list.
          </Text>

          <Text style={styles.description}>
            Other users who want to discuss this topic may send you chat requests.
          </Text>

          <View style={styles.featureRow}>
            <View style={styles.featureBadge}>
              <Ionicons name="chatbubble" size={14} color={Colors.chat} />
            </View>
            <Text style={styles.featureText}>
              You'll receive notifications when someone wants to chat about this position
            </Text>
          </View>

          <View style={styles.featureRow}>
            <View style={[styles.featureBadge, styles.statsBadge]}>
              <Ionicons name="stats-chart" size={14} color={Colors.primary} />
            </View>
            <Text style={styles.featureText}>
              Track responses and engagement on your positions in the Stats tab
            </Text>
          </View>

          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Got it!</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    padding: 24,
    maxWidth: 360,
    width: '100%',
    alignItems: 'center',
  },
  iconContainer: {
    backgroundColor: Colors.agree + '20',
    borderRadius: 40,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: Colors.light.text,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    paddingHorizontal: 8,
    width: '100%',
  },
  featureBadge: {
    backgroundColor: Colors.chat + '20',
    borderRadius: 12,
    padding: 6,
  },
  statsBadge: {
    backgroundColor: Colors.primary + '20',
  },
  featureText: {
    fontSize: 14,
    color: Colors.light.text,
    flex: 1,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
    marginTop: 24,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
})
