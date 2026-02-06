import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, Pressable, ActivityIndicator } from 'react-native'
import { useState, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/Colors'
import { SharedStyles } from '../constants/SharedStyles'

export default function LocationPicker({ visible, onClose, allLocations, currentLocationId, onSelect, saving }) {
  const [breadcrumb, setBreadcrumb] = useState([]) // stack of {id, name} for drill-down

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
      <Pressable style={SharedStyles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalContent} onPress={e => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Select Location</Text>

          {/* Breadcrumb / Back navigation */}
          {breadcrumb.length > 0 && (
            <View style={styles.breadcrumbRow}>
              <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                <Ionicons name="chevron-back" size={20} color={Colors.primary} />
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
              <Text style={styles.breadcrumbText} numberOfLines={1}>
                {breadcrumb.map(b => b.name).join(' > ')}
              </Text>
            </View>
          )}

          {/* Select this level button (when drilled into a non-leaf) */}
          {breadcrumb.length > 0 && items.length > 0 && (
            <TouchableOpacity
              style={styles.selectThisButton}
              onPress={handleSelectCurrent}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color={Colors.primary} />
                  <Text style={styles.selectThisText}>
                    Select "{breadcrumb[breadcrumb.length - 1].name}"
                  </Text>
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
                >
                  <View style={styles.itemLeft}>
                    <Text style={[styles.itemName, isInPath && styles.itemNameHighlighted]}>
                      {loc.name}
                    </Text>
                    {loc.code && (
                      <Text style={styles.itemCode}>{loc.code}</Text>
                    )}
                  </View>
                  <View style={styles.itemRight}>
                    {isCurrentSelection && (
                      <Ionicons name="checkmark" size={20} color={Colors.primary} />
                    )}
                    {hasChildren && (
                      <Ionicons name="chevron-forward" size={18} color={Colors.pass} />
                    )}
                  </View>
                </TouchableOpacity>
              )
            })}
            {items.length === 0 && (
              <Text style={styles.emptyText}>No locations available</Text>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    width: '100%',
    maxWidth: 360,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.darkText,
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
    fontSize: 15,
    color: Colors.primary,
    fontWeight: '500',
  },
  breadcrumbText: {
    flex: 1,
    fontSize: 13,
    color: Colors.pass,
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
    borderColor: Colors.primary,
  },
  selectThisText: {
    fontSize: 14,
    color: Colors.primary,
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
    borderTopColor: Colors.cardBorder,
  },
  itemHighlighted: {
    backgroundColor: Colors.primaryLight + '40',
  },
  itemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemName: {
    fontSize: 16,
    color: Colors.darkText,
  },
  itemNameHighlighted: {
    color: Colors.primary,
    fontWeight: '500',
  },
  itemCode: {
    fontSize: 13,
    color: Colors.pass,
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.pass,
    fontSize: 15,
    padding: 20,
  },
})
