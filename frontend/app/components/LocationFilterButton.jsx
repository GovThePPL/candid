import { StyleSheet, View, TouchableOpacity } from 'react-native'
import { useState, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../hooks/useThemeColors'
import ThemedText from './ThemedText'
import LocationPicker from './LocationPicker'

/**
 * A button that displays the selected location as a breadcrumb path and opens
 * a LocationPicker modal on tap. Encapsulates breadcrumb computation, modal
 * visibility, and the button UI for reuse across screens.
 *
 * @param {Array}    allLocations      - flat location array ({ id, name, parentLocationId })
 * @param {string|null} selectedLocationId - currently selected location ID
 * @param {function} onSelect          - called with locationId when user picks a location
 * @param {string}   [placeholder]     - text when no location selected (defaults to i18n key)
 * @param {boolean}  [saving]          - pass-through to LocationPicker's saving prop
 * @param {string}   [accessibilityLabel] - override for button a11y label
 */
export default function LocationFilterButton({
  allLocations,
  selectedLocationId,
  onSelect,
  placeholder,
  saving = false,
  accessibilityLabel: a11yLabelOverride,
}) {
  const { t } = useTranslation('common')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [pickerOpen, setPickerOpen] = useState(false)

  // Build a map for quick parent lookups
  const locationMap = useMemo(() => {
    const map = {}
    for (const loc of allLocations) {
      map[loc.id] = loc
    }
    return map
  }, [allLocations])

  // Compute breadcrumb path from root to selected location
  const breadcrumbText = useMemo(() => {
    if (!selectedLocationId || !locationMap[selectedLocationId]) return null
    const path = []
    let id = selectedLocationId
    while (id && locationMap[id]) {
      path.unshift(locationMap[id].name)
      id = locationMap[id].parentLocationId
    }
    return path.join(' \u203A ')
  }, [selectedLocationId, locationMap])

  const displayText = breadcrumbText || placeholder || t('selectLocation')

  const handleSelect = (locationId) => {
    setPickerOpen(false)
    onSelect(locationId)
  }

  return (
    <>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setPickerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={a11yLabelOverride || t('locationSelectorA11y', { name: displayText })}
      >
        <Ionicons name="location-outline" size={18} color={colors.primary} />
        <ThemedText
          variant="body"
          color={breadcrumbText ? 'badge' : 'secondary'}
          style={breadcrumbText ? styles.breadcrumb : styles.placeholder}
          numberOfLines={2}
        >
          {displayText}
        </ThemedText>
        <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
      </TouchableOpacity>

      <LocationPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        allLocations={allLocations}
        currentLocationId={selectedLocationId}
        onSelect={handleSelect}
        saving={saving}
      />
    </>
  )
}

const createStyles = (colors) => StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  breadcrumb: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    fontStyle: 'italic',
  },
})
