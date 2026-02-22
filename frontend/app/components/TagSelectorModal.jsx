import { useState, useMemo, useCallback } from 'react'
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../hooks/useThemeColors'
import { Typography, Spacing, BorderRadius } from '../constants/Theme'
import ThemedText from './ThemedText'
import BottomDrawerModal from './BottomDrawerModal'

/**
 * Reusable tag selector modal with search, multi/single select, and optional
 * "create new" capability. Wraps BottomDrawerModal.
 *
 * @param {Object} props
 * @param {boolean} props.visible - Controls modal visibility
 * @param {Function} props.onClose - Close callback
 * @param {string} props.title - Modal title
 * @param {{id: string, label: string}[]} props.items - Available items
 * @param {string[]} props.selected - Selected item IDs
 * @param {Function} props.onToggle - Called with item ID when toggled
 * @param {boolean} [props.multiSelect=true] - Multi-select keeps modal open; single-select auto-closes
 * @param {boolean} [props.allowCreate=false] - Show "Create new" when search has no exact match
 * @param {Function} [props.onCreateItem] - Called with label when creating a new item
 * @param {string} [props.searchPlaceholder] - Placeholder for search input
 * @param {string} [props.searchA11yLabel] - Accessibility label for search input
 */
export default function TagSelectorModal({
  visible,
  onClose,
  title,
  items,
  selected,
  onToggle,
  multiSelect = true,
  allowCreate = false,
  onCreateItem,
  searchPlaceholder,
  searchA11yLabel,
}) {
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [searchText, setSearchText] = useState('')

  const handleClose = useCallback(() => {
    setSearchText('')
    onClose()
  }, [onClose])

  const filteredItems = useMemo(() => {
    if (!searchText) return items
    const lower = searchText.toLowerCase()
    return items.filter(item => item.label.toLowerCase().includes(lower))
  }, [items, searchText])

  const showCreate = useMemo(() => {
    if (!allowCreate || !searchText.trim()) return false
    const lower = searchText.trim().toLowerCase()
    return !items.some(item => item.label.toLowerCase() === lower)
  }, [allowCreate, searchText, items])

  const handleToggle = useCallback((id) => {
    onToggle(id)
    if (!multiSelect) {
      setSearchText('')
      onClose()
    }
  }, [onToggle, multiSelect, onClose])

  const handleCreate = useCallback(() => {
    const label = searchText.trim()
    if (!label) return
    onCreateItem?.(label)
    if (!multiSelect) {
      setSearchText('')
      onClose()
    } else {
      setSearchText('')
    }
  }, [searchText, onCreateItem, multiSelect, onClose])

  return (
    <BottomDrawerModal
      visible={visible}
      onClose={handleClose}
      title={title}
    >
      <View style={styles.content}>
        {/* Search input */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.secondaryText} />
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.placeholderText}
            autoFocus
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={searchA11yLabel}
          />
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchText('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common:clearSearch')}
            >
              <Ionicons name="close-circle" size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          )}
        </View>

        {/* Item list */}
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {/* Create new option */}
          {showCreate && (
            <TouchableOpacity
              style={styles.createItem}
              onPress={handleCreate}
              accessibilityRole="button"
              accessibilityLabel={t('tagSelectorCreateA11y', { label: searchText.trim() })}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <ThemedText variant="body" style={{ color: colors.primary }}>
                {t('tagSelectorCreate', { label: searchText.trim() })}
              </ThemedText>
            </TouchableOpacity>
          )}

          {filteredItems.length === 0 && !showCreate && (
            <View style={styles.emptyState}>
              <ThemedText variant="body" color="secondary">
                {t('tagSelectorNoResults')}
              </ThemedText>
            </View>
          )}

          {filteredItems.map((item) => {
            const isSelected = selected.includes(item.id)
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.item, isSelected && styles.itemSelected]}
                onPress={() => handleToggle(item.id)}
                accessibilityRole={multiSelect ? 'checkbox' : 'button'}
                accessibilityState={multiSelect ? { checked: isSelected } : undefined}
                accessibilityLabel={item.label}
              >
                <ThemedText variant="body" color="dark">{item.label}</ThemedText>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>
    </BottomDrawerModal>
  )
}

const createStyles = (colors) => StyleSheet.create({
  content: {
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: BorderRadius.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    ...Typography.body,
    paddingVertical: 2,
  },
  list: {
    flex: 1,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  itemSelected: {
    backgroundColor: colors.badgeBg,
  },
  createItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  emptyState: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
})
