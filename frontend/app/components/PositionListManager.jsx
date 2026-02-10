import { useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react'
import { StyleSheet, View, TouchableOpacity, TextInput, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../hooks/useThemeColors'
import { SemanticColors } from '../constants/Colors'
import { Typography } from '../constants/Theme'
import ThemedText from './ThemedText'
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
  onSearchFocus,
  onSearchBlur,
  loading,
  emptyIcon,
  emptyTitle,
  emptySubtitle,
}, ref) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [searchQuery, setSearchQuery] = useState('')
  const [deleteMode, setDeleteMode] = useState(false)
  const [chatMode, setChatMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [expandedLocations, setExpandedLocations] = useState({})
  const [expandedCategories, setExpandedCategories] = useState({})
  const [togglingIds, setTogglingIds] = useState(new Set())
  const [deletingIds, setDeletingIds] = useState(new Set())

  // Scroll the focused search input into view
  const handleInputFocus = Platform.OS === 'web'
    ? (e) => {
        onSearchFocus?.()
        setTimeout(() => e.target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 300)
      }
    : onSearchFocus || undefined

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
      const loc = item.locationName || t('stats:unknownLocation')
      const cat = item.categoryName || t('uncategorized')
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
      <TouchableOpacity
        onPress={onPress}
        style={header ? styles.headerRightControl : styles.rightControl}
        accessibilityLabel={checked ? t('deselectA11y') : t('selectA11y')}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        <Ionicons
          name={checked ? 'checkbox' : 'checkbox-outline'}
          size={20}
          color={checked ? SemanticColors.warning : colors.secondaryText}
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
        accessibilityLabel={item.isActive ? t('disableChat') : t('enableChat')}
        accessibilityRole="switch"
        accessibilityState={{ checked: item.isActive }}
      >
        <Ionicons
          name={item.isActive ? 'chatbubble' : 'chatbubble-outline'}
          size={20}
          color={item.isActive ? colors.primary : colors.secondaryText}
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
        accessibilityLabel={allActive ? t('disableAllGroupChats') : t('enableAllGroupChats')}
        accessibilityRole="switch"
        accessibilityState={{ checked: allActive }}
      >
        <Ionicons
          name={allActive ? 'chatbubble' : 'chatbubble-outline'}
          size={20}
          color={allActive ? colors.primary : colors.secondaryText}
        />
      </TouchableOpacity>
    )
  }

  // Render a single item row (shared between flat and grouped views)
  function renderItem(item) {
    const isSelected = selectedIds.has(item.id)
    const isDeleting = deletingIds.has(item.id)
    const isInteractive = deleteMode || chatMode

    const rowContent = (
      <>
        <View style={styles.itemContent}>
          {!showCollapsible && (
            <ThemedText variant="caption" color="secondary" style={styles.itemDetail}>
              {item.locationCode || item.locationName} · {item.categoryName}
            </ThemedText>
          )}
          <ThemedText
            variant="bodySmall"
            color="dark"
            style={[
              !item.isActive && styles.itemStatementInactive,
            ]}
          >
            {item.statement}
          </ThemedText>
          {item.meta && (
            <ThemedText variant="caption" color="secondary" style={styles.itemMeta}>{item.meta}</ThemedText>
          )}
        </View>
        {deleteMode && renderCheckbox(isSelected, () => toggleSelect(item.id))}
        {chatMode && renderChatToggle(item)}
      </>
    )

    const rowStyle = [
      styles.itemRow,
      !item.isActive && styles.itemRowInactive,
      isDeleting && styles.itemRowDeleting,
    ]

    if (isInteractive) {
      return (
        <TouchableOpacity
          key={item.id}
          style={rowStyle}
          onPress={() => deleteMode ? toggleSelect(item.id) : handleChatToggle(item)}
          activeOpacity={0.6}
          accessibilityRole={deleteMode ? "checkbox" : "switch"}
          accessibilityState={{ checked: deleteMode ? isSelected : item.isActive }}
          accessibilityLabel={item.statement}
        >
          {rowContent}
        </TouchableOpacity>
      )
    }

    return (
      <View key={item.id} style={rowStyle}>
        {rowContent}
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
          <Ionicons name="search" size={16} color={colors.secondaryText} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('filterPositions')}
            placeholderTextColor={colors.placeholderText}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={handleInputFocus}
            onBlur={onSearchBlur}
            autoCapitalize="none"
            autoCorrect={false}
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('filterPositions')}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClear} accessibilityLabel={t('clearSearch')} accessibilityRole="button">
              <Ionicons name="close-circle" size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          )}
        </View>
        {!deleteMode && !chatMode && (
          <>
            <TouchableOpacity style={styles.modeButton} onPress={enterChatMode} accessibilityLabel={t('chatMode')} accessibilityRole="button">
              <Ionicons name="chatbubble-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.modeButton} onPress={enterDeleteMode} accessibilityLabel={t('deleteMode')} accessibilityRole="button">
              <Ionicons name="trash-outline" size={16} color={SemanticColors.warning} />
            </TouchableOpacity>
          </>
        )}
        {deleteMode && (
          <TouchableOpacity style={styles.doneButton} onPress={exitDeleteMode} accessibilityRole="button" accessibilityLabel={t('cancel')}>
            <ThemedText variant="label" color="secondary" style={styles.doneButtonText}>{t('cancel')}</ThemedText>
          </TouchableOpacity>
        )}
        {chatMode && (
          <TouchableOpacity style={styles.doneButton} onPress={exitChatMode} accessibilityRole="button" accessibilityLabel={t('done')}>
            <ThemedText variant="label" color="secondary" style={styles.doneButtonText}>{t('done')}</ThemedText>
          </TouchableOpacity>
        )}
      </View>

      {/* No results from filter */}
      {filteredItems.length === 0 && searchQuery.trim().length > 0 && (
        <ThemedText variant="bodySmall" color="secondary" style={styles.noResultsText}>{t('noFilterResults')}</ThemedText>
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
                accessibilityRole="button"
                accessibilityLabel={t('locationGroupA11y', { location: locationName, count: locIds.length })}
                accessibilityState={{ expanded: locExpanded }}
              >
                <Ionicons
                  name={locExpanded ? 'chevron-down' : 'chevron-forward'}
                  size={18}
                  color={colors.primary}
                />
                <ThemedText variant="h3" color="primary" style={styles.locationTitle}>{locationName}</ThemedText>
                <ThemedText variant="label" color="primary" style={styles.locationCount}>{locIds.length}</ThemedText>
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
                          accessibilityRole="button"
                          accessibilityLabel={t('categoryGroupA11y', { category: categoryName, count: catIds.length })}
                          accessibilityState={{ expanded: catExpanded }}
                        >
                          <Ionicons
                            name={catExpanded ? 'chevron-down' : 'chevron-forward'}
                            size={16}
                            color={colors.primary}
                          />
                          <ThemedText variant="bodySmall" color="primary" style={styles.categoryTitle}>{categoryName}</ThemedText>
                          <ThemedText variant="caption" color="primary" style={styles.categoryCount}>{catIds.length}</ThemedText>
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

const createStyles = (colors) => StyleSheet.create({
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
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    paddingVertical: 10,
    ...Typography.body,
    color: colors.text,
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    outlineStyle: 'none',
    scrollMarginTop: 80,
  },
  searchClear: {
    marginLeft: 8,
    padding: 4,
  },
  modeButton: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBackground,
  },
  doneButton: {
    width: 84, // matches two modeButtons (38px each) + 8px gap
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBackground,
    alignItems: 'center',
  },
  doneButtonText: {
    fontWeight: '500',
  },
  noResultsText: {
    textAlign: 'center',
    paddingVertical: 24,
  },

  // Flat list (under 25 items)
  flatList: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },

  // Location group
  locationGroup: {
    marginBottom: 12,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  locationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.uiBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  locationHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  locationTitle: {
    flex: 1,
    fontWeight: '700',
    marginLeft: 8,
  },
  locationCount: {
    opacity: 0.6,
  },

  // Categories
  categoriesContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  categoryGroup: {
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  categoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.uiBackground,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
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
    fontWeight: '700',
    marginLeft: 6,
  },
  categoryCount: {
    fontWeight: '600',
    opacity: 0.6,
  },

  // Items
  itemsList: {
    backgroundColor: colors.cardBackground,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 16,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  itemRowInactive: {
    opacity: 0.4,
  },
  itemRowDeleting: {
    opacity: 0.5,
  },
  itemContent: {
    flex: 1,
  },
  itemStatementInactive: {
    color: colors.secondaryText,
  },
  itemDetail: {
    marginBottom: 2,
  },
  itemMeta: {
    marginTop: 4,
  },

  // Right-side controls (checkbox in delete mode, chat bubble in chat mode)
  rightControl: {
    paddingLeft: 8,
  },

  // Right-side control on group headers
  headerRightControl: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },

  // Empty & loading
  emptyContainer: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 32,
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
})
