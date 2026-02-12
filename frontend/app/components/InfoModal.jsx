import { useMemo } from 'react'
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import { createSharedStyles } from '../constants/SharedStyles'
import ThemedText from './ThemedText'

/**
 * Reusable info/explanation modal triggered by help icons throughout the app.
 *
 * Props:
 *   visible        - Whether the modal is shown
 *   onClose        - Called when dismissing
 *   title          - Modal heading text
 *   icon           - Optional Ionicons name for a hero icon at the top
 *   iconColor      - Color for the hero icon (default colors.primary)
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
  iconColor,
  paragraphs,
  items,
  children,
  buttonText,
}) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const shared = useMemo(() => createSharedStyles(colors), [colors])

  const resolvedIconColor = iconColor || colors.primary
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
        style={shared.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('dismissModal')}
      >
        <TouchableOpacity
          style={styles.container}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          accessible={false}
          importantForAccessibility="no"
        >
          {hasHeroIcon && (
            <View style={[styles.iconContainer, { backgroundColor: resolvedIconColor + '20' }]}>
              <Ionicons name={icon} size={48} color={resolvedIconColor} />
            </View>
          )}

          <ThemedText variant="h4" color="primary" style={[styles.title, !hasHeroIcon && styles.titleLeft]}>
            {title}
          </ThemedText>

          {hasCustomContent ? (
            children
          ) : (
            <>
              {paragraphs?.map((text, i) => (
                <ThemedText
                  key={i}
                  variant="body"
                  style={[styles.paragraph, !hasHeroIcon && styles.paragraphLeft]}
                >
                  {text}
                </ThemedText>
              ))}
              {items?.map((item, i) => (
                <View key={i} style={styles.item}>
                  <View style={[styles.itemBadge, { backgroundColor: (item.iconColor || colors.primary) + '20' }]}>
                    <Ionicons
                      name={item.icon}
                      size={item.badgeSize || 14}
                      color={item.iconColor || colors.primary}
                    />
                  </View>
                  <ThemedText variant="bodySmall" style={styles.itemText}>{item.text}</ThemedText>
                </View>
              ))}
            </>
          )}

          <TouchableOpacity style={styles.button} onPress={onClose} accessibilityRole="button" accessibilityLabel={buttonText || t('gotIt')}>
            <ThemedText variant="button" color="inverse">{buttonText || t('gotIt')}</ThemedText>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

/** Convenience sub-component for custom paragraph text inside InfoModal children */
InfoModal.Paragraph = function Paragraph({ style, children }) {
  return <ThemedText variant="body" style={[staticStyles.paragraphLeft, style]}>{children}</ThemedText>
}

/** Convenience sub-component for icon+text item rows inside InfoModal children */
InfoModal.Item = function Item({ icon, iconColor, children }) {
  return (
    <View style={staticStyles.item}>
      <Ionicons name={icon} size={20} color={iconColor} />
      <ThemedText variant="bodySmall" style={staticStyles.itemText}>{children}</ThemedText>
    </View>
  )
}

// Static styles for sub-components that can't use hooks (not React components with hooks)
const staticStyles = StyleSheet.create({
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
  itemText: {
    flex: 1,
  },
})

const createStyles = (colors) => StyleSheet.create({
  container: {
    backgroundColor: colors.cardBackground,
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
    marginBottom: 16,
    textAlign: 'center',
  },
  titleLeft: {
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  paragraph: {
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
    flex: 1,
  },
  button: {
    backgroundColor: colors.primarySurface,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
    marginTop: 20,
  },
})
