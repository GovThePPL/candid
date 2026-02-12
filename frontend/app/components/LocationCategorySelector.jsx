import { useState, useEffect, useMemo } from 'react'
import { View, StyleSheet, TouchableOpacity, Modal, FlatList } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import { createSharedStyles } from '../constants/SharedStyles'
import { usersApiWrapper, categoriesApiWrapper } from '../lib/api'
import ThemedText from './ThemedText'

/**
 * Dropdown selectors for location and category
 *
 * @param {Object} props
 * @param {string} props.selectedLocation - Currently selected location ID
 * @param {string} props.selectedCategory - Currently selected category ID
 * @param {Function} props.onLocationChange - Callback when location changes
 * @param {Function} props.onCategoryChange - Callback when category changes
 * @param {boolean} [props.showAllCategories=false] - Prepend "All Categories" option
 * @param {'first'|'last'} [props.defaultLocation='first'] - Which location to auto-select on load
 * @param {boolean} [props.showLabels=false] - Show "Location"/"Category" labels above buttons (hides left icons)
 * @param {boolean} [props.categoryAutoSelected=false] - Show sparkles icon + highlight border on category button
 */
export default function LocationCategorySelector({
  selectedLocation,
  selectedCategory,
  onLocationChange,
  onCategoryChange,
  showAllCategories = false,
  defaultLocation = 'first',
  showLabels = false,
  categoryAutoSelected = false,
  style,
}) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const shared = useMemo(() => createSharedStyles(colors), [colors])
  const [locations, setLocations] = useState([])
  const [categories, setCategories] = useState([])
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [loading, setLoading] = useState(true)

  const ALL_CATEGORIES_OPTION = { id: 'all', label: t('allCategories') }

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [locData, catData] = await Promise.all([
        usersApiWrapper.getLocations(),
        categoriesApiWrapper.getAll(),
      ])
      setLocations(locData || [])

      if (showAllCategories) {
        setCategories([ALL_CATEGORIES_OPTION, ...(catData || [])])
      } else {
        setCategories(catData || [])
      }

      // Auto-select location if not set or stale (e.g. DB was reset)
      const locIds = (locData || []).map(l => l.id)
      if (locData?.length > 0 && (!selectedLocation || !locIds.includes(selectedLocation))) {
        if (defaultLocation === 'last') {
          onLocationChange(locData[locData.length - 1].id)
        } else {
          onLocationChange(locData[0].id)
        }
      }

      // Default to "All Categories" when showAllCategories is enabled, or if stored ID is stale
      const catIds = (catData || []).map(c => c.id)
      if (showAllCategories && (!selectedCategory || (selectedCategory !== 'all' && !catIds.includes(selectedCategory)))) {
        onCategoryChange('all')
      } else if (!showAllCategories && selectedCategory && !catIds.includes(selectedCategory)) {
        if (catData?.length > 0) onCategoryChange(catData[0].id)
      }
    } catch (error) {
      console.error('Error loading selector data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getSelectedLocationName = () => {
    const loc = locations.find((l) => l.id === selectedLocation)
    return loc?.name || t('selectLocation')
  }

  const getSelectedLocationDisplay = () => {
    const loc = locations.find((l) => l.id === selectedLocation)
    return loc?.code || loc?.name || t('selectLocation')
  }

  const getSelectedCategoryName = () => {
    if (selectedCategory === 'all') {
      return t('allCategories')
    }
    const cat = categories.find((c) => c.id === selectedCategory)
    return cat?.label || cat?.name || t('selectCategory')
  }

  const renderPickerModal = (
    visible,
    onClose,
    items,
    selectedId,
    onSelect,
    title,
    labelKey = 'name'
  ) => (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={shared.modalOverlay} activeOpacity={1} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('dismissModal')}>
        <View style={shared.modalContent}>
          <ThemedText variant="h2" color="primary" style={shared.modalTitle}>{title}</ThemedText>
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.pickerItem,
                  item.id === selectedId && styles.pickerItemSelected,
                ]}
                onPress={() => {
                  onSelect(item.id)
                  onClose()
                }}
                accessibilityRole="button"
                accessibilityLabel={item[labelKey] || item.name}
                accessibilityState={{ selected: item.id === selectedId }}
              >
                <ThemedText
                  variant="button"
                  style={[
                    styles.pickerItemText,
                    item.id === selectedId && styles.pickerItemTextSelected,
                  ]}
                >
                  {item[labelKey] || item.name}
                </ThemedText>
                {item.id === selectedId && (
                  <Ionicons name="checkmark" size={20} color={colors.buttonDefaultText} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  )

  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <ThemedText variant="bodySmall" color="secondary" style={styles.loadingText}>{t('loading')}</ThemedText>
      </View>
    )
  }

  return (
    <View style={[styles.container, style]}>
      {/* Location selector */}
      <View style={styles.locationWrapper}>
        {showLabels && (
          <View style={styles.labelRow}>
            <ThemedText variant="label" color="dark">{t('locationLabel')}</ThemedText>
          </View>
        )}
        <TouchableOpacity
          style={styles.selector}
          onPress={() => setShowLocationPicker(true)}
          accessibilityRole="button"
          accessibilityLabel={t('locationSelectorA11y', { name: getSelectedLocationName() })}
        >
          {!showLabels && (
            <Ionicons name="location-outline" size={18} color={colors.primary} />
          )}
          <ThemedText variant="bodySmall" numberOfLines={1}>
            {getSelectedLocationDisplay()}
          </ThemedText>
          <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
        </TouchableOpacity>
      </View>

      {/* Category selector */}
      <View style={styles.categoryWrapper}>
        {showLabels && (
          <View style={styles.labelRow}>
            <ThemedText variant="label" color="dark">{t('categoryLabel')}</ThemedText>
            {categoryAutoSelected && (
              <Ionicons name="sparkles" size={10} color={colors.primary} style={{ marginLeft: 4 }} />
            )}
          </View>
        )}
        <TouchableOpacity
          style={[
            styles.selector,
            categoryAutoSelected && styles.selectorAutoSelected,
          ]}
          onPress={() => setShowCategoryPicker(true)}
          accessibilityRole="button"
          accessibilityLabel={t('categorySelectorA11y', { name: getSelectedCategoryName() })}
        >
          {!showLabels && (
            <Ionicons name="folder-outline" size={18} color={colors.primary} />
          )}
          <ThemedText variant="bodySmall" style={styles.selectorText} numberOfLines={1}>
            {getSelectedCategoryName()}
          </ThemedText>
          <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
        </TouchableOpacity>
      </View>

      {renderPickerModal(
        showLocationPicker,
        () => setShowLocationPicker(false),
        locations,
        selectedLocation,
        onLocationChange,
        t('selectLocation'),
        'name'
      )}

      {renderPickerModal(
        showCategoryPicker,
        () => setShowCategoryPicker(false),
        categories,
        selectedCategory,
        onCategoryChange,
        t('selectCategory'),
        'label'
      )}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  locationWrapper: {
    flexShrink: 0,
  },
  categoryWrapper: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    height: 18,
  },
  selector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  selectorAutoSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  selectorText: {
    flex: 1,
  },
  loadingText: {
    textAlign: 'center',
    paddingVertical: 16,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  pickerItemSelected: {
    backgroundColor: colors.buttonDefault,
  },
  pickerItemText: {
    fontWeight: '400',
    color: colors.text,
  },
  pickerItemTextSelected: {
    color: colors.buttonDefaultText,
    fontWeight: '600',
  },
})
