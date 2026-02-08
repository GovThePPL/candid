import { useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react'
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/Colors'
import ThemedTextInput from './ThemedTextInput'
import EmptyState from './EmptyState'
import LoadingView from './LoadingView'

/**
 * Shared position list management component used by both "My Positions" and "Chatting List".
 *
 * - Under 25 items: flat list (no grouping)
 * - 25+ items: grouped Location -> Category with collapsible headers
 * - Delete mode: checkboxes (right side) + floating bar to delete selected
 * - Chat mode: chat bubble toggles (right side) per item, immediate toggle; group headers get bulk toggles
 * - Inactive items grayed out in both normal and chat mode
 *
 * Props:
 *   items               - Array of normalized items { id, statement, isActive, locationName, locationCode, categoryName, categoryId, meta }
 *   onToggleActive      - (id, newActiveState) => Promise
 *   onDeleteItems       - (ids[]) => Promise
 *   onBulkToggle        - (ids[], newActiveState) => Promise
 *   onFloatingBarChange - ({ visible, count, mode }) => void  — notifies parent to show/hide floating action bar (delete mode only)
 *   loading             - boolean
 *   emptyIcon           - string (Ionicons name)
 *   emptyTitle          - string
 *   emptySubtitle       - string
 */
const PositionListManager = forwardRef(function PositionListManager({
  items,
  onToggleActive,
  onDeleteItems,
  onBulkToggle,
  onFloatingBarChange,
  loading,
  emptyIcon,
  emptyTitle,
  emptySubtitle,
}, ref) {
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteMode, setDeleteMode] = useState(false)
  const [chatMode, setChatMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [expandedLocations, setExpandedLocations] = useState({})
  const [expandedCategories, setExpandedCategories] = useState({})
  const [togglingIds, setTogglingIds] = useState(new Set())
  const [deletingIds, setDeletingIds] = useState(new Set())

  // Expose actions to parent for the floating bar (delete mode only)
  useImperativeHandle(ref, () => ({
    confirmDelete: handleDeleteSelected,
    cancelDelete: exitDeleteMode,
  }))

  // Notify parent about floating bar state (delete mode only)
  useEffect(() => {
    onFloatingBarChange?.({
      visible: deleteMode && selectedIds.size > 0,
      count: selectedIds.size,
      mode: 'delete',
    })
  }, [deleteMode, selectedIds.size])

  // Clean up selected ids when items change (delete mode only)
  useEffect(() => {
    if (deleteMode) {
      const itemIds = new Set(items.map(i => i.id))
      setSelectedIds(prev => {
        const next = new Set([...prev].filter(id => itemIds.has(id)))
        return next.size !== prev.size ? next : prev
      })
    }
  }, [items])

  const showCollapsible = items.length >= 25

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.trim().toLowerCase()
    return items.filter(item =>
      item.statement?.toLowerCase().includes(q)
    )
  }, [items, searchQuery])

  // Group items: Location -> Category (only used when collapsible)
  const grouped = useMemo(() => {
    if (!showCollapsible) return null
    const groups = {}
    filteredItems.forEach(item => {
      const loc = item.locationName || 'Unknown Location'
      const cat = item.categoryName || 'Uncategorized'
      if (!groups[loc]) groups[loc] = {}
      if (!groups[loc][cat]) groups[loc][cat] = []
      groups[loc][cat].push(item)
    })
    return groups
  }, [filteredItems, showCollapsible])

  function getLocationItems(locationName) {
    const cats = grouped?.[locationName]
    if (!cats) return []
    return Object.values(cats).flat()
  }

  function locationItemIds(locationName) {
    return getLocationItems(locationName).map(i => i.id)
  }

  function getCategoryItems(locationName, categoryName) {
    return grouped?.[locationName]?.[categoryName] || []
  }

  function categoryItemIds(locationName, categoryName) {
    return getCategoryItems(locationName, categoryName).map(i => i.id)
  }

  function toggleLocationExpanded(loc) {
    setExpandedLocations(prev => ({ ...prev, [loc]: prev[loc] === false ? true : false }))
  }

  function toggleCategoryExpanded(loc, cat) {
    const key = `${loc}|${cat}`
    setExpandedCategories(prev => ({ ...prev, [key]: prev[key] === false ? true : false }))
  }

  // Checkbox selection (delete mode only)
  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll(ids) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      const allSelected = ids.every(id => next.has(id))
      if (allSelected) {
        ids.forEach(id => next.delete(id))
      } else {
        ids.forEach(id => next.add(id))
      }
      return next
    })
  }

  function enterDeleteMode() {
    setChatMode(false)
    setDeleteMode(true)
    setSelectedIds(new Set())
  }

  function exitDeleteMode() {
    setDeleteMode(false)
    setSelectedIds(new Set())
  }

  function enterChatMode() {
    setDeleteMode(false)
    setSelectedIds(new Set())
    setChatMode(true)
  }

  function exitChatMode() {
    setChatMode(false)
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    setDeletingIds(new Set(ids))
    try {
      await onDeleteItems(ids)
    } finally {
      setDeletingIds(new Set())
      exitDeleteMode()
    }
  }

  // Immediate chat toggle for a single item
  async function handleChatToggle(item) {
    const id = item.id
    if (togglingIds.has(id)) return
    setTogglingIds(prev => new Set([...prev, id]))
    try {
      await onToggleActive(id, !item.isActive)
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  // Bulk chat toggle for a group of items
  async function handleGroupChatToggle(groupItems) {
    const allActive = groupItems.every(i => i.isActive)
    const newActive = !allActive
    const ids = groupItems.map(i => i.id)
    const idSet = new Set(ids)
    setTogglingIds(prev => new Set([...prev, ...idSet]))
    try {
      await onBulkToggle(ids, newActive)
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      })
    }
  }

  // Render delete checkbox (right side)
  function renderCheckbox(checked, onPress, header) {
    return (
      <TouchableOpacity onPress={onPress} style={header ? styles.headerRightControl : styles.rightControl}>
        <Ionicons
          name={checked ? 'checkbox' : 'checkbox-outline'}
          size={20}
          color={checked ? Colors.warning : Colors.pass}
        />
      </TouchableOpacity>
    )
  }

  // Render chat bubble toggle for a single item (right side)
  function renderChatToggle(item) {
    const isToggling = togglingIds.has(item.id)
    return (
      <TouchableOpacity
        onPress={() => handleChatToggle(item)}
        disabled={isToggling}
        style={[styles.rightControl, isToggling && { opacity: 0.4 }]}
      >
        <Ionicons
          name={item.isActive ? 'chatbubble' : 'chatbubble-outline'}
          size={20}
          color={item.isActive ? Colors.primary : Colors.pass}
        />
      </TouchableOpacity>
    )
  }

  // Render chat bubble toggle for a group header (right side)
  function renderGroupChatToggle(groupItems) {
    const allActive = groupItems.every(i => i.isActive)
    const someToggling = groupItems.some(i => togglingIds.has(i.id))
    return (
      <TouchableOpacity
        onPress={() => handleGroupChatToggle(groupItems)}
        disabled={someToggling}
        style={[styles.headerRightControl, someToggling && { opacity: 0.4 }]}
      >
        <Ionicons
          name={allActive ? 'chatbubble' : 'chatbubble-outline'}
          size={20}
          color={allActive ? Colors.primary : Colors.pass}
        />
      </TouchableOpacity>
    )
  }

  // Render a single item row (shared between flat and grouped views)
  function renderItem(item) {
    const isSelected = selectedIds.has(item.id)
    const isDeleting = deletingIds.has(item.id)

    return (
      <View
        key={item.id}
        style={[
          styles.itemRow,
          !item.isActive && styles.itemRowInactive,
          isDeleting && styles.itemRowDeleting,
        ]}
      >
        <View style={styles.itemContent}>
          {!showCollapsible && (
            <Text style={styles.itemDetail}>
              {item.locationCode || item.locationName} · {item.categoryName}
            </Text>
          )}
          <Text
            style={[
              styles.itemStatement,
              !item.isActive && styles.itemStatementInactive,
            ]}
          >
            {item.statement}
          </Text>
          {item.meta && (
            <Text style={styles.itemMeta}>{item.meta}</Text>
          )}
        </View>
        {deleteMode && renderCheckbox(isSelected, () => toggleSelect(item.id))}
        {chatMode && renderChatToggle(item)}
      </View>
    )
  }

  if (loading && items.length === 0) {
    return <LoadingView style={styles.loadingContainer} />
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        subtitle={emptySubtitle}
        style={styles.emptyContainer}
      />
    )
  }

  return (
    <View>
      {/* Toolbar: search + mode buttons */}
      <View style={styles.toolbar}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={16} color={Colors.pass} style={styles.searchIcon} />
          <ThemedTextInput
            style={styles.searchInput}
            placeholder="Filter positions..."
            placeholderTextColor={Colors.pass}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClear}>
              <Ionicons name="close-circle" size={18} color={Colors.pass} />
            </TouchableOpacity>
          )}
        </View>
        {!deleteMode && !chatMode && (
          <>
            <TouchableOpacity style={styles.modeButton} onPress={enterChatMode}>
              <Ionicons name="chatbubble-outline" size={16} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.modeButton} onPress={enterDeleteMode}>
              <Ionicons name="trash-outline" size={16} color={Colors.warning} />
            </TouchableOpacity>
          </>
        )}
        {deleteMode && (
          <TouchableOpacity style={styles.doneButton} onPress={exitDeleteMode}>
            <Text style={styles.doneButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}
        {chatMode && (
          <TouchableOpacity style={styles.doneButton} onPress={exitChatMode}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* No results from filter */}
      {filteredItems.length === 0 && searchQuery.trim().length > 0 && (
        <Text style={styles.noResultsText}>No positions match your search.</Text>
      )}

      {/* Flat list for under 25 items */}
      {!showCollapsible && filteredItems.length > 0 && (
        <View style={styles.flatList}>
          {filteredItems.map(item => renderItem(item))}
        </View>
      )}

      {/* Grouped collapsible list for 25+ items */}
      {showCollapsible && grouped && Object.entries(grouped).map(([locationName, categories]) => {
        const locItems = getLocationItems(locationName)
        const locIds = locItems.map(i => i.id)
        const locExpanded = expandedLocations[locationName] !== false
        const locAllSelected = locIds.length > 0 && locIds.every(id => selectedIds.has(id))

        return (
          <View key={locationName} style={styles.locationGroup}>
            {/* Location header */}
            <View style={styles.locationHeaderRow}>
              <TouchableOpacity
                style={styles.locationHeader}
                onPress={() => toggleLocationExpanded(locationName)}
              >
                <Ionicons
                  name={locExpanded ? 'chevron-down' : 'chevron-forward'}
                  size={18}
                  color={Colors.primary}
                />
                <Text style={styles.locationTitle}>{locationName}</Text>
                <Text style={styles.locationCount}>{locIds.length}</Text>
              </TouchableOpacity>
              {deleteMode && renderCheckbox(locAllSelected, () => toggleSelectAll(locIds), true)}
              {chatMode && renderGroupChatToggle(locItems)}
            </View>

            {locExpanded && (
              <View style={styles.categoriesContainer}>
                {Object.entries(categories).map(([categoryName, catItems]) => {
                  const catKey = `${locationName}|${categoryName}`
                  const catIds = catItems.map(i => i.id)
                  const catExpanded = expandedCategories[catKey] !== false
                  const catAllSelected = catIds.length > 0 && catIds.every(id => selectedIds.has(id))

                  return (
                    <View key={catKey} style={styles.categoryGroup}>
                      {/* Category header */}
                      <View style={styles.categoryHeaderRow}>
                        <TouchableOpacity
                          style={styles.categoryHeader}
                          onPress={() => toggleCategoryExpanded(locationName, categoryName)}
                        >
                          <Ionicons
                            name={catExpanded ? 'chevron-down' : 'chevron-forward'}
                            size={16}
                            color={Colors.primary}
                          />
                          <Text style={styles.categoryTitle}>{categoryName}</Text>
                          <Text style={styles.categoryCount}>{catIds.length}</Text>
                        </TouchableOpacity>
                        {deleteMode && renderCheckbox(catAllSelected, () => toggleSelectAll(catIds), true)}
                        {chatMode && renderGroupChatToggle(catItems)}
                      </View>

                      {catExpanded && (
                        <View style={styles.itemsList}>
                          {catItems.map(item => renderItem(item))}
                        </View>
                      )}
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
})

export default PositionListManager

const styles = StyleSheet.create({
  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  searchIcon: {
    paddingLeft: 10,
  },
  searchInput: {
    flex: 1,
    padding: 10,
    fontSize: 14,
    backgroundColor: 'transparent',
    borderRadius: 0,
  },
  searchClear: {
    paddingRight: 10,
  },
  modeButton: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.white,
  },
  doneButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.white,
  },
  doneButtonText: {
    fontSize: 13,
    color: Colors.pass,
    fontWeight: '500',
  },
  noResultsText: {
    fontSize: 14,
    color: Colors.pass,
    textAlign: 'center',
    paddingVertical: 24,
  },

  // Flat list (under 25 items)
  flatList: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },

  // Location group
  locationGroup: {
    marginBottom: 12,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  locationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  locationHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  locationTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
    marginLeft: 8,
  },
  locationCount: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
    opacity: 0.6,
  },

  // Categories
  categoriesContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  categoryGroup: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  categoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  categoryHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 24,
  },
  categoryTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
    marginLeft: 6,
  },
  categoryCount: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    opacity: 0.6,
  },

  // Items
  itemsList: {
    backgroundColor: Colors.cardBackground,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    paddingLeft: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  itemRowInactive: {
    backgroundColor: '#f5f5f5',
  },
  itemRowDeleting: {
    opacity: 0.5,
  },
  itemContent: {
    flex: 1,
  },
  itemStatement: {
    fontSize: 14,
    color: Colors.darkText,
    lineHeight: 20,
  },
  itemStatementInactive: {
    color: Colors.pass,
  },
  itemDetail: {
    fontSize: 12,
    color: Colors.pass,
    marginBottom: 2,
  },
  itemMeta: {
    fontSize: 12,
    color: Colors.pass,
    marginTop: 4,
  },

  // Right-side controls (checkbox in delete mode, chat bubble in chat mode)
  rightControl: {
    paddingLeft: 8,
    alignSelf: 'flex-start',
    marginTop: 0,
  },

  // Right-side control on group headers
  headerRightControl: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },

  // Empty & loading
  emptyContainer: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingVertical: 32,
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
})
