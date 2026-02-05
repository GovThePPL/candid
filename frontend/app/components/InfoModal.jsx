import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/Colors'
import { SharedStyles } from '../constants/SharedStyles'

/**
 * Reusable info/explanation modal triggered by help icons throughout the app.
 *
 * Props:
 *   visible        - Whether the modal is shown
 *   onClose        - Called when dismissing
 *   title          - Modal heading text
 *   icon           - Optional Ionicons name for a hero icon at the top
 *   iconColor      - Color for the hero icon (default Colors.primary)
 *   paragraphs     - Array of description strings (centered text)
 *   items          - Array of { icon, iconColor?, text } for icon+text rows
 *   children       - Custom content (replaces paragraphs/items when provided)
 *   buttonText     - Label for the dismiss button (default "Got it!")
 */
export default function InfoModal({
  visible,
  onClose,
  title,
  icon,
  iconColor = Colors.primary,
  paragraphs,
  items,
  children,
  buttonText = 'Got it!',
}) {
  const hasHeroIcon = !!icon
  const hasCustomContent = !!children

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={SharedStyles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.container}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {hasHeroIcon && (
            <View style={[styles.iconContainer, { backgroundColor: iconColor + '20' }]}>
              <Ionicons name={icon} size={48} color={iconColor} />
            </View>
          )}

          <Text style={[styles.title, !hasHeroIcon && styles.titleLeft]}>
            {title}
          </Text>

          {hasCustomContent ? (
            children
          ) : (
            <>
              {paragraphs?.map((text, i) => (
                <Text
                  key={i}
                  style={[styles.paragraph, !hasHeroIcon && styles.paragraphLeft]}
                >
                  {text}
                </Text>
              ))}
              {items?.map((item, i) => (
                <View key={i} style={styles.item}>
                  <View style={[styles.itemBadge, { backgroundColor: (item.iconColor || Colors.primary) + '20' }]}>
                    <Ionicons
                      name={item.icon}
                      size={item.badgeSize || 14}
                      color={item.iconColor || Colors.primary}
                    />
                  </View>
                  <Text style={styles.itemText}>{item.text}</Text>
                </View>
              ))}
            </>
          )}

          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>{buttonText}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

/** Convenience sub-component for custom paragraph text inside InfoModal children */
InfoModal.Paragraph = function Paragraph({ style, children }) {
  return <Text style={[styles.paragraph, styles.paragraphLeft, style]}>{children}</Text>
}

/** Convenience sub-component for icon+text item rows inside InfoModal children */
InfoModal.Item = function Item({ icon, iconColor = Colors.primary, children }) {
  return (
    <View style={styles.item}>
      <Ionicons name={icon} size={20} color={iconColor} />
      <Text style={styles.itemText}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    padding: 24,
    maxWidth: 360,
    width: '100%',
    alignItems: 'center',
  },
  iconContainer: {
    borderRadius: 40,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 16,
    textAlign: 'center',
  },
  titleLeft: {
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  paragraph: {
    fontSize: 15,
    color: Colors.light.text,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 12,
  },
  paragraphLeft: {
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 8,
    paddingHorizontal: 8,
    width: '100%',
  },
  itemBadge: {
    borderRadius: 12,
    padding: 6,
  },
  itemText: {
    fontSize: 14,
    color: Colors.light.text,
    flex: 1,
    lineHeight: 20,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
    marginTop: 20,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
})
