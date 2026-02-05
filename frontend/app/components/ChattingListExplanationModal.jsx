import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/Colors'

export default function ChattingListExplanationModal({ visible, onClose }) {
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
            <Ionicons name="chatbubbles" size={48} color={Colors.chat} />
          </View>

          <Text style={styles.title}>Added to Chatting List</Text>

          <Text style={styles.description}>
            This position has been saved to your Chatting List. It will reappear in your card queue periodically.
          </Text>

          <Text style={styles.description}>
            Use this to save positions you've chatted about or topics you want to discuss again with different people.
          </Text>

          <View style={styles.featureRow}>
            <View style={styles.featureBadge}>
              <Ionicons name="chatbubbles" size={14} color={Colors.chat} />
            </View>
            <Text style={styles.featureText}>
              Look for this icon in the card queue to identify positions from your Chatting List
            </Text>
          </View>

          <View style={styles.featureRow}>
            <View style={[styles.featureBadge, styles.removeBadge]}>
              <Ionicons name="close-circle-outline" size={14} color={Colors.pass} />
            </View>
            <Text style={styles.featureText}>
              Tap this button on a card to remove a position from your Chatting List
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
    backgroundColor: Colors.chat + '20',
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
  removeBadge: {
    backgroundColor: Colors.pass + '30',
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
