import { StyleSheet, View, ScrollView, TouchableOpacity, Modal, Pressable, ActivityIndicator } from 'react-native'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import { createSharedStyles } from '../constants/SharedStyles'
import ThemedText from './ThemedText'

export default function LocationPicker({ visible, onClose, allLocations, currentLocationId, onSelect, saving }) {
  const [breadcrumb, setBreadcrumb] = useState([]) // stack of {id, name} for drill-down
  const { t } = useTranslation()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const shared = useMemo(() => createSharedStyles(colors), [colors])

  // Build tree from flat list
  const { childrenMap, locationMap } = useMemo(() => {
    const cMap = {} // parentId -> children[]
    const lMap = {} // id -> location
    for (const loc of allLocations) {
      lMap[loc.id] = loc
      const parentKey = loc.parentLocationId || 'root'
      if (!cMap[parentKey]) cMap[parentKey] = []
      cMap[parentKey].push(loc)
    }
    // Sort children by name
    for (const key in cMap) {
      cMap[key].sort((a, b) => a.name.localeCompare(b.name))
    }
    return { childrenMap: cMap, locationMap: lMap }
  }, [allLocations])

  // Build the path from root to the current location for pre-highlighting
  const currentPath = useMemo(() => {
    if (!currentLocationId || !locationMap[currentLocationId]) return []
    const path = []
    let id = currentLocationId
    while (id && locationMap[id]) {
      path.unshift(id)
      id = locationMap[id].parentLocationId
    }
    return path
  }, [currentLocationId, locationMap])

  const currentParentId = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].id : 'root'
  const items = childrenMap[currentParentId] || []

  const handleOpen = () => {
    // Pre-navigate to the parent of the current location so user sees their selection context
    if (currentPath.length > 1) {
      // Navigate to the parent of the deepest location
      const pathWithoutLast = currentPath.slice(0, -1)
      setBreadcrumb(pathWithoutLast.map(id => ({ id, name: locationMap[id].name })))
    } else {
      setBreadcrumb([])
    }
  }

  const handleDrillDown = (loc) => {
    const hasChildren = childrenMap[loc.id] && childrenMap[loc.id].length > 0
    if (hasChildren) {
      setBreadcrumb(prev => [...prev, { id: loc.id, name: loc.name }])
    } else {
      // Leaf node — select it
      onSelect(loc.id)
    }
  }

  const handleBack = () => {
    setBreadcrumb(prev => prev.slice(0, -1))
  }

  const handleSelectCurrent = () => {
    // Select the current breadcrumb level's location (non-leaf selection)
    if (breadcrumb.length > 0) {
      onSelect(breadcrumb[breadcrumb.length - 1].id)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      onShow={handleOpen}
    >
      <Pressable style={shared.modalOverlay} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('dismissModal')}>
        <Pressable style={styles.modalContent} onPress={e => e.stopPropagation()}>
          <ThemedText variant="h2" color="dark" style={styles.modalTitle}>{t('selectLocation')}</ThemedText>

          {/* Breadcrumb / Back navigation */}
          {breadcrumb.length > 0 && (
            <View style={styles.breadcrumbRow}>
              <TouchableOpacity onPress={handleBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel={t('back')}>
                <Ionicons name="chevron-back" size={20} color={colors.primary} />
                <ThemedText variant="body" color="primary" style={styles.backText}>{t('back')}</ThemedText>
              </TouchableOpacity>
              <ThemedText variant="label" color="secondary" style={styles.breadcrumbText} numberOfLines={1}>
                {breadcrumb.map(b => b.name).join(' > ')}
              </ThemedText>
            </View>
          )}

          {/* Select this level button (when drilled into a non-leaf) */}
          {breadcrumb.length > 0 && items.length > 0 && (
            <TouchableOpacity
              style={styles.selectThisButton}
              onPress={handleSelectCurrent}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={t('selectName', { name: breadcrumb[breadcrumb.length - 1].name })}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color={colors.primary} />
                  <ThemedText variant="bodySmall" color="primary" style={styles.selectThisText}>
                    {t('selectName', { name: breadcrumb[breadcrumb.length - 1].name })}
                  </ThemedText>
                </>
              )}
            </TouchableOpacity>
          )}

          <ScrollView style={styles.scrollView}>
            {items.map((loc) => {
              const hasChildren = childrenMap[loc.id] && childrenMap[loc.id].length > 0
              const isInPath = currentPath.includes(loc.id)
              const isCurrentSelection = loc.id === currentLocationId

              return (
                <TouchableOpacity
                  key={loc.id}
                  style={[styles.item, isInPath && styles.itemHighlighted]}
                  onPress={() => handleDrillDown(loc)}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={loc.name}
                  accessibilityState={{ selected: isCurrentSelection }}
                >
                  <View style={styles.itemLeft}>
                    <ThemedText variant="button" color="dark" style={[styles.itemName, isInPath && styles.itemNameHighlighted]}>
                      {loc.name}
                    </ThemedText>
                    {loc.code && (
                      <ThemedText variant="label" color="secondary" style={styles.itemCode}>{loc.code}</ThemedText>
                    )}
                  </View>
                  <View style={styles.itemRight}>
                    {isCurrentSelection && (
                      <Ionicons name="checkmark" size={20} color={colors.primary} />
                    )}
                    {hasChildren && (
                      <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
                    )}
                  </View>
                </TouchableOpacity>
              )
            })}
            {items.length === 0 && (
              <ThemedText variant="body" color="secondary" style={styles.emptyText}>{t('noLocationsAvailable')}</ThemedText>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const createStyles = (colors) => StyleSheet.create({
  modalContent: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    width: '100%',
    maxWidth: 360,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  modalTitle: {
    padding: 16,
    textAlign: 'center',
  },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  backText: {
    fontWeight: '500',
  },
  breadcrumbText: {
    flex: 1,
    fontWeight: '400',
  },
  selectThisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  selectThisText: {
    fontWeight: '500',
  },
  scrollView: {
    maxHeight: 350,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  itemHighlighted: {
    backgroundColor: colors.primaryLight + '40',
  },
  itemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemName: {
    fontWeight: '400',
  },
  itemNameHighlighted: {
    color: colors.primary,
    fontWeight: '500',
  },
  itemCode: {
    fontWeight: '400',
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  emptyText: {
    textAlign: 'center',
    padding: 20,
  },
})
