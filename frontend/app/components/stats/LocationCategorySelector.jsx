import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import { usersApiWrapper, categoriesApiWrapper } from '../../lib/api'

/**
 * Dropdown selectors for location and category
 *
 * @param {Object} props
 * @param {string} props.selectedLocation - Currently selected location ID
 * @param {string} props.selectedCategory - Currently selected category ID
 * @param {Function} props.onLocationChange - Callback when location changes
 * @param {Function} props.onCategoryChange - Callback when category changes
 */
export default function LocationCategorySelector({
  selectedLocation,
  selectedCategory,
  onLocationChange,
  onCategoryChange,
}) {
  const [locations, setLocations] = useState([])
  const [categories, setCategories] = useState([])
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [loading, setLoading] = useState(true)

  // Special "All Categories" option
  const ALL_CATEGORIES_OPTION = { id: 'all', label: 'All Categories' }

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
      // Add "All Categories" option at the beginning
      setCategories([ALL_CATEGORIES_OPTION, ...(catData || [])])

      // Auto-select first options if not already selected
      if (!selectedLocation && locData?.length > 0) {
        onLocationChange(locData[0].id)
      }
      // Default to "All Categories"
      if (!selectedCategory) {
        onCategoryChange('all')
      }
    } catch (error) {
      console.error('Error loading selector data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getSelectedLocationName = () => {
    const loc = locations.find((l) => l.id === selectedLocation)
    return loc?.name || 'Select Location'
  }

  const getSelectedCategoryName = () => {
    if (selectedCategory === 'all') {
      return 'All Categories'
    }
    const cat = categories.find((c) => c.id === selectedCategory)
    return cat?.label || cat?.name || 'Select Category'
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
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{title}</Text>
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
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    item.id === selectedId && styles.pickerItemTextSelected,
                  ]}
                >
                  {item[labelKey] || item.name}
                </Text>
                {item.id === selectedId && (
                  <Ionicons name="checkmark" size={20} color={Colors.primary} />
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
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.selector}
        onPress={() => setShowLocationPicker(true)}
      >
        <Ionicons name="location-outline" size={18} color={Colors.primary} />
        <Text style={styles.selectorText} numberOfLines={1}>
          {getSelectedLocationName()}
        </Text>
        <Ionicons name="chevron-down" size={16} color={Colors.pass} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.selector}
        onPress={() => setShowCategoryPicker(true)}
      >
        <Ionicons name="folder-outline" size={18} color={Colors.primary} />
        <Text style={styles.selectorText} numberOfLines={1}>
          {getSelectedCategoryName()}
        </Text>
        <Ionicons name="chevron-down" size={16} color={Colors.pass} />
      </TouchableOpacity>

      {renderPickerModal(
        showLocationPicker,
        () => setShowLocationPicker(false),
        locations,
        selectedLocation,
        onLocationChange,
        'Select Location',
        'name'
      )}

      {renderPickerModal(
        showCategoryPicker,
        () => setShowCategoryPicker(false),
        categories,
        selectedCategory,
        onCategoryChange,
        'Select Category',
        'label'
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  selector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  selectorText: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.text,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.pass,
    textAlign: 'center',
    paddingVertical: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 12,
    width: '100%',
    maxHeight: '60%',
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 16,
    textAlign: 'center',
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
    backgroundColor: Colors.primaryLight,
  },
  pickerItemText: {
    fontSize: 16,
    color: Colors.light.text,
  },
  pickerItemTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
})
