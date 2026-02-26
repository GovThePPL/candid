import { useState, useEffect, useMemo } from 'react'
import { View, StyleSheet, TouchableOpacity, Pressable, Modal, FlatList } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import useIsDesktop from '../hooks/useIsDesktop'
import { createSharedStyles } from '../constants/SharedStyles'
import { usersApiWrapper, sessionsApiWrapper } from '../lib/api'
import ThemedText from './ThemedText'

/**
 * Dropdown selectors for location and session
 *
 * @param {Object} props
 * @param {string} props.selectedLocation - Currently selected location ID
 * @param {string} props.selectedSession - Currently selected session ID
 * @param {Function} props.onLocationChange - Callback when location changes
 * @param {Function} props.onSessionChange - Callback when session changes
 * @param {boolean} [props.showAllSessions=false] - Prepend "All Sessions" option
 * @param {'first'|'last'} [props.defaultLocation='first'] - Which location to auto-select on load
 * @param {boolean} [props.showLabels=false] - Show "Location"/"Session" labels above buttons (hides left icons)
 * @param {boolean} [props.sessionAutoSelected=false] - Show sparkles icon + highlight border on session button
 */
export default function LocationSessionSelector({
  selectedLocation,
  selectedSession,
  onLocationChange,
  onSessionChange,
  showAllSessions = false,
  defaultLocation = 'first',
  showLabels = false,
  sessionAutoSelected = false,
  style,
}) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const isDesktop = useIsDesktop()
  const styles = useMemo(() => createStyles(colors), [colors])
  const shared = useMemo(() => createSharedStyles(colors), [colors])
  const [locations, setLocations] = useState([])
  const [sessions, setSessions] = useState([])
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [showSessionPicker, setShowSessionPicker] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessionsLoading, setSessionsLoading] = useState(false)

  const ALL_SESSIONS_OPTION = { id: 'all', label: t('allSessions') }

  // Load locations on mount
  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        const locData = await usersApiWrapper.getLocations()
        setLocations(locData || [])

        // Auto-select location if not set or stale
        const locIds = (locData || []).map(l => l.id)
        if (locData?.length > 0 && (!selectedLocation || !locIds.includes(selectedLocation))) {
          if (defaultLocation === 'last') {
            onLocationChange(locData[locData.length - 1].id)
          } else {
            onLocationChange(locData[0].id)
          }
        }
      } catch (error) {
        console.error('Error loading locations:', error)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Load sessions when selectedLocation changes
  useEffect(() => {
    if (!selectedLocation) return
    let cancelled = false
    ;(async () => {
      try {
        setSessionsLoading(true)
        const sessData = await sessionsApiWrapper.getAll(selectedLocation)

        if (cancelled) return
        if (showAllSessions) {
          setSessions([ALL_SESSIONS_OPTION, ...(sessData || [])])
        } else {
          setSessions(sessData || [])
        }

        // Reset session selection if current is stale for this location
        const sessIds = (sessData || []).map(s => s.id)
        if (showAllSessions && (!selectedSession || (selectedSession !== 'all' && !sessIds.includes(selectedSession)))) {
          onSessionChange('all')
        } else if (!showAllSessions && (!selectedSession || !sessIds.includes(selectedSession))) {
          if (sessData?.length > 0) onSessionChange(sessData[0].id)
        }
      } catch (error) {
        console.error('Error loading sessions:', error)
      } finally {
        if (!cancelled) setSessionsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [selectedLocation])

  const getSelectedLocationName = () => {
    const loc = locations.find((l) => l.id === selectedLocation)
    return loc?.name || t('selectLocation')
  }

  const getSelectedLocationDisplay = () => {
    const loc = locations.find((l) => l.id === selectedLocation)
    return loc?.code || loc?.name || t('selectLocation')
  }

  const getSelectedSessionName = () => {
    if (selectedSession === 'all') {
      return t('allSessions')
    }
    const sess = sessions.find((s) => s.id === selectedSession)
    return sess?.label || sess?.name || t('selectSession')
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
      <Pressable style={shared.modalOverlay} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('dismissModal')}>
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
      </Pressable>
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
            {isDesktop ? getSelectedLocationName() : getSelectedLocationDisplay()}
          </ThemedText>
          <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
        </TouchableOpacity>
      </View>

      {/* Session selector */}
      <View style={styles.sessionWrapper}>
        {showLabels && (
          <View style={styles.labelRow}>
            <ThemedText variant="label" color="dark">{t('sessionLabel')}</ThemedText>
            {sessionAutoSelected && (
              <Ionicons name="sparkles" size={10} color={colors.primary} style={{ marginLeft: 4 }} />
            )}
          </View>
        )}
        <TouchableOpacity
          style={[
            styles.selector,
            sessionAutoSelected && styles.selectorAutoSelected,
          ]}
          onPress={() => setShowSessionPicker(true)}
          accessibilityRole="button"
          accessibilityLabel={t('sessionSelectorA11y', { name: getSelectedSessionName() })}
        >
          {!showLabels && (
            <Ionicons name="folder-outline" size={18} color={colors.primary} />
          )}
          <ThemedText variant="bodySmall" style={styles.selectorText} numberOfLines={1}>
            {getSelectedSessionName()}
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
        showSessionPicker,
        () => setShowSessionPicker(false),
        sessions,
        selectedSession,
        onSessionChange,
        t('selectSession'),
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
  sessionWrapper: {
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
