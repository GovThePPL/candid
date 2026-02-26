import { useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react'
import { StyleSheet, View, TouchableOpacity, TextInput, Platform, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../hooks/useThemeColors'
import { SemanticColors } from '../constants/Colors'
import { Typography } from '../constants/Theme'
import ThemedText from './ThemedText'
import LocationSessionBadge from './LocationSessionBadge'
import EmptyState from './EmptyState'
import LoadingView from './LoadingView'

/**
 * Shared position list management component used by both "My Positions" and "Chatting List".
 *
 * - Under 25 items: flat list (no grouping)
 * - 25+ items: grouped Location -> Session with collapsible headers
 * - Delete mode: checkboxes (right side) + floating bar to delete selected
 * - Chat mode: chat bubble toggles (right side) per item, immediate toggle; group headers get bulk toggles
 * - Inactive items grayed out in both normal and chat mode
 *
 * Props:
 *   items               - Array of normalized items { id, statement, isActive, locationName, locationCode, sessionName, sessionId, meta }
 *   onToggleActive      - (id, newActiveState) => Promise
 *   onDeleteItems       - (ids[]) => Promise
 *   onBulkToggle        - (ids[], newActiveState) => Promise
 *   onFloatingBarChange - ({ visible, count, mode }) => void  — notifies parent to show/hide floating action bar (delete mode only)
 *   onAddItem           - (positionId) => Promise — called when user taps + on an add-mode result (opt-in: shows + button when provided)
 *   onAddSearch         - (query) => void — called when search text changes in add mode
 *   addSearchResults    - Array<{ id, statement, similarity, sessionLabel, locationCode, wasPreviouslyHeld }>
 *   addSearchLoading    - boolean
 *   addSearchMinLength  - number (default 20)
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
  onAddItem,
  onAddSearch,
  addSearchResults = [],
  addSearchLoading = false,
  addSearchMinLength = 20,
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
  const [addMode, setAddMode] = useState(false)
  const [addingIds, setAddingIds] = useState(new Set())
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [expandedLocations, setExpandedLocations] = useState({})
  const [expandedSessions, setExpandedSessions] = useState({})
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

  // Group items: Location -> Session (only used when collapsible)
  const grouped = useMemo(() => {
    if (!showCollapsible) return null
    const groups = {}
    filteredItems.forEach(item => {
      const loc = item.locationName || t('stats:unknownLocation')
      const sess = item.sessionName || t('uncategorized')
      if (!groups[loc]) groups[loc] = {}
      if (!groups[loc][sess]) groups[loc][sess] = []
      groups[loc][sess].push(item)
    })
    return groups
  }, [filteredItems, showCollapsible])

  function getLocationItems(locationName) {
    const sessions = grouped?.[locationName]
    if (!sessions) return []
    return Object.values(sessions).flat()
  }

  function locationItemIds(locationName) {
    return getLocationItems(locationName).map(i => i.id)
  }

  function getSessionItems(locationName, sessionName) {
    return grouped?.[locationName]?.[sessionName] || []
  }

  function sessionItemIds(locationName, sessionName) {
    return getSessionItems(locationName, sessionName).map(i => i.id)
  }

  function toggleLocationExpanded(loc) {
    setExpandedLocations(prev => ({ ...prev, [loc]: prev[loc] === false ? true : false }))
  }

  function toggleSessionExpanded(loc, sess) {
    const key = `${loc}|${sess}`
    setExpandedSessions(prev => ({ ...prev, [key]: prev[key] === false ? true : false }))
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
    if (addMode) exitAddMode()
    setDeleteMode(true)
    setSelectedIds(new Set())
  }

  function exitDeleteMode() {
    setDeleteMode(false)
    setSelectedIds(new Set())
  }

  function enterChatMode() {
    setDeleteMode(false)
    if (addMode) exitAddMode()
    setSelectedIds(new Set())
    setChatMode(true)
  }

  function exitChatMode() {
    setChatMode(false)
  }

  function enterAddMode() {
    setDeleteMode(false)
    setChatMode(false)
    setSelectedIds(new Set())
    setSearchQuery('')
    setAddMode(true)
  }

  function exitAddMode() {
    setAddMode(false)
    setSearchQuery('')
    onAddSearch?.('')
  }

  function toggleAddMode() {
    if (addMode) exitAddMode()
    else enterAddMode()
  }

  // Handle search input changes — routes to onAddSearch in add mode
  function handleSearchChange(text) {
    setSearchQuery(text)
    if (addMode) {
      onAddSearch?.(text)
    }
  }

  // Handle tapping + on an add-mode result
  async function handleAddResult(id) {
    if (addingIds.has(id)) return
    setAddingIds(prev => new Set([...prev, id]))
    try {
      await onAddItem?.(id)
    } finally {
      setAddingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
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
            <View style={styles.itemDetail}>
              <LocationSessionBadge
                location={{ code: item.locationCode, name: item.locationName }}
                session={{ label: item.sessionName }}
                size="sm"
              />
            </View>
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

  // Early return for empty list only when add mode is not available
  if (items.length === 0 && !onAddItem) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        subtitle={emptySubtitle}
        style={styles.emptyContainer}
      />
    )
  }

  // Render add-mode search results
  function renderAddResults() {
    const query = searchQuery.trim()

    // Min chars hint
    if (query.length > 0 && query.length < addSearchMinLength) {
      return (
        <ThemedText variant="bodySmall" color="secondary" style={styles.noResultsText}>
          {t('create:searchMinChars', { min: addSearchMinLength })}
        </ThemedText>
      )
    }

    // Loading
    if (addSearchLoading) {
      return (
        <View style={styles.addSearchLoading}>
          <ActivityIndicator size="small" color={colors.primary} />
          <ThemedText variant="bodySmall" color="secondary">{t('create:searching')}</ThemedText>
        </View>
      )
    }

    // Results
    if (addSearchResults.length > 0) {
      return (
        <View style={styles.addSearchResults}>
          {addSearchResults.map(result => {
            const isAdding = addingIds.has(result.id)
            return (
              <View key={result.id} style={styles.addSearchResultRow}>
                <View style={styles.addSearchResultContent}>
                  {result.wasPreviouslyHeld && (
                    <View style={styles.addSearchPreviouslyHeld}>
                      <Ionicons name="time-outline" size={12} color={colors.primary} />
                      <ThemedText variant="caption" color="primary" style={styles.addSearchPreviouslyHeldText}>
                        {t('create:previouslyHeld')}
                      </ThemedText>
                    </View>
                  )}
                  <ThemedText variant="bodySmall" color="dark" style={styles.addSearchStatement} numberOfLines={2}>
                    {"\u201C"}{result.statement}{"\u201D"}
                  </ThemedText>
                  <View style={styles.addSearchMeta}>
                    <ThemedText variant="caption" color="secondary">
                      {t('create:matchPercent', { percent: Math.round(result.similarity * 100) })}
                    </ThemedText>
                    {result.sessionLabel && (
                      <LocationSessionBadge
                        location={{ code: result.locationCode }}
                        session={{ label: result.sessionLabel }}
                        size="sm"
                      />
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => handleAddResult(result.id)}
                  disabled={isAdding}
                  style={[styles.addSearchButton, isAdding && { opacity: 0.4 }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('addItemA11y', { statement: result.statement })}
                >
                  <Ionicons name="add-circle" size={28} color={SemanticColors.agree} />
                </TouchableOpacity>
              </View>
            )
          })}
        </View>
      )
    }

    // No results (only when query meets min length)
    if (query.length >= addSearchMinLength) {
      return (
        <ThemedText variant="bodySmall" color="secondary" style={styles.noResultsText}>
          {t('create:noMatchingPositions')}
        </ThemedText>
      )
    }

    return null
  }

  const hasItems = items.length > 0

  return (
    <View>
      {/* Toolbar: search + mode buttons */}
      <View style={styles.toolbar}>
        {/* Add mode toggle (left of search bar, only when onAddItem provided) */}
        {onAddItem && (
          <TouchableOpacity
            style={[styles.modeButton, addMode && styles.modeButtonActive]}
            onPress={toggleAddMode}
            accessibilityLabel={t('addMode')}
            accessibilityRole="button"
            accessibilityState={{ selected: addMode }}
          >
            <Ionicons name="add" size={16} color={addMode ? '#FFFFFF' : colors.primary} />
          </TouchableOpacity>
        )}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={16} color={colors.secondaryText} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={addMode ? t('create:searchPositions') : t('filterPositions')}
            placeholderTextColor={colors.placeholderText}
            value={searchQuery}
            onChangeText={handleSearchChange}
            onFocus={handleInputFocus}
            onBlur={onSearchBlur}
            autoCapitalize="none"
            autoCorrect={false}
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={addMode ? t('create:searchPositions') : t('filterPositions')}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearchChange('')} style={styles.searchClear} accessibilityLabel={t('clearSearch')} accessibilityRole="button">
              <Ionicons name="close-circle" size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          )}
        </View>
        {!deleteMode && !chatMode && !addMode && (
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

      {/* Add mode: show search results instead of normal list */}
      {addMode && renderAddResults()}

      {/* Empty state shown below toolbar when add mode is available */}
      {!hasItems && !addMode && (
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          subtitle={emptySubtitle}
          style={styles.emptyContainer}
        />
      )}

      {/* No results from filter */}
      {!addMode && filteredItems.length === 0 && searchQuery.trim().length > 0 && (
        <ThemedText variant="bodySmall" color="secondary" style={styles.noResultsText}>{t('noFilterResults')}</ThemedText>
      )}

      {/* Flat list for under 25 items */}
      {!addMode && !showCollapsible && filteredItems.length > 0 && (
        <View style={styles.flatList}>
          {filteredItems.map(item => renderItem(item))}
        </View>
      )}

      {/* Grouped collapsible list for 25+ items */}
      {!addMode && showCollapsible && grouped && Object.entries(grouped).map(([locationName, sessions]) => {
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
              <View style={styles.sessionsContainer}>
                {Object.entries(sessions).map(([sessionName, sessItems]) => {
                  const sessKey = `${locationName}|${sessionName}`
                  const sessIds = sessItems.map(i => i.id)
                  const sessExpanded = expandedSessions[sessKey] !== false
                  const sessAllSelected = sessIds.length > 0 && sessIds.every(id => selectedIds.has(id))

                  return (
                    <View key={sessKey} style={styles.sessionGroup}>
                      {/* Session header */}
                      <View style={styles.sessionHeaderRow}>
                        <TouchableOpacity
                          style={styles.sessionHeader}
                          onPress={() => toggleSessionExpanded(locationName, sessionName)}
                          accessibilityRole="button"
                          accessibilityLabel={t('sessionGroupA11y', { session: sessionName, count: sessIds.length })}
                          accessibilityState={{ expanded: sessExpanded }}
                        >
                          <Ionicons
                            name={sessExpanded ? 'chevron-down' : 'chevron-forward'}
                            size={16}
                            color={colors.primary}
                          />
                          <ThemedText variant="bodySmall" color="primary" style={styles.sessionTitle}>{sessionName}</ThemedText>
                          <ThemedText variant="caption" color="primary" style={styles.sessionCount}>{sessIds.length}</ThemedText>
                        </TouchableOpacity>
                        {deleteMode && renderCheckbox(sessAllSelected, () => toggleSelectAll(sessIds), true)}
                        {chatMode && renderGroupChatToggle(sessItems)}
                      </View>

                      {sessExpanded && (
                        <View style={styles.itemsList}>
                          {sessItems.map(item => renderItem(item))}
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
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingLeft: 12,
    paddingRight: 6,
    height: 38,
  },
  searchIcon: {
    marginRight: 6,
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    margin: 0,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    outlineStyle: 'none',
    scrollMarginTop: 80,
  },
  searchClear: {
    padding: 4,
    flexShrink: 0,
  },
  modeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  doneButton: {
    width: 84, // matches two modeButtons (38px each) + 8px gap
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
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

  // Sessions
  sessionsContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  sessionGroup: {
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.uiBackground,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  sessionHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 24,
  },
  sessionTitle: {
    flex: 1,
    fontWeight: '700',
    marginLeft: 6,
  },
  sessionCount: {
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

  // Add mode search results
  addSearchLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  addSearchResults: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  addSearchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  addSearchResultContent: {
    flex: 1,
  },
  addSearchPreviouslyHeld: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  addSearchPreviouslyHeldText: {
    fontWeight: '500',
  },
  addSearchStatement: {
    fontStyle: 'italic',
    lineHeight: 18,
  },
  addSearchMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  addSearchButton: {
    padding: 4,
    marginLeft: 8,
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
