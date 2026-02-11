import { StyleSheet, View, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert, Platform } from 'react-native'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { SemanticColors } from '../../../constants/Colors'
import api, { translateError } from '../../../lib/api'
import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import EmptyState from '../../../components/EmptyState'
import BottomDrawerModal from '../../../components/BottomDrawerModal'
import { useToast } from '../../../components/Toast'
import { useUser } from '../../../hooks/useUser'
import { isAdminAtLocation } from '../../../lib/roles'

function LocationActions({ location, onEdit, onDelete, onAddChild, onManageCategories, canManage, colors, t, size = 18 }) {
  if (!canManage) return null

  return (
    <View style={{ flexDirection: 'row', gap: 14 }}>
      <TouchableOpacity onPress={() => onManageCategories(location)} accessibilityRole="button" accessibilityLabel={t('manageCategoriesA11y', { name: location.name })}>
        <Ionicons name="pricetag-outline" size={size} color={colors.primary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onAddChild(location)} accessibilityRole="button" accessibilityLabel={t('addChildLocationA11y', { name: location.name })}>
        <Ionicons name="add-circle-outline" size={size} color={colors.primary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onEdit(location)} accessibilityRole="button" accessibilityLabel={t('editLocationA11y', { name: location.name })}>
        <Ionicons name="create-outline" size={size} color={colors.primary} />
      </TouchableOpacity>
      {location.parentLocationId && (
        <TouchableOpacity onPress={() => onDelete(location)} accessibilityRole="button" accessibilityLabel={t('deleteLocationA11y', { name: location.name })}>
          <Ionicons name="trash-outline" size={size} color={SemanticColors.warning} />
        </TouchableOpacity>
      )}
    </View>
  )
}

function ChildLocationRow({ location, allLocations, depth, onEdit, onDelete, onAddChild, onManageCategories, canManageLocation, colors, styles, t }) {
  const [expanded, setExpanded] = useState(true)
  const childLocations = allLocations.filter(l => l.parentLocationId === location.id)
  const hasChildren = childLocations.length > 0

  return (
    <>
      <View style={[styles.childRow, { paddingLeft: 16 + depth * 16 }]}>
        <View style={styles.childInfo}>
          {hasChildren ? (
            <TouchableOpacity
              onPress={() => setExpanded(!expanded)}
              accessibilityRole="button"
              accessibilityLabel={expanded ? t('collapseA11y', { name: location.name }) : t('expandA11y', { name: location.name })}
            >
              <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 16 }} />
          )}
          <ThemedText variant="bodySmall" color="dark" style={styles.childName}>{location.name}</ThemedText>
          {location.code && (
            <ThemedText variant="caption" color="secondary"> ({location.code})</ThemedText>
          )}
          {hasChildren && (
            <ThemedText variant="caption" color="primary" style={styles.countBadge}>{childLocations.length}</ThemedText>
          )}
        </View>
        <LocationActions
          location={location}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
          onManageCategories={onManageCategories}
          canManage={canManageLocation(location.id)}
          colors={colors}
          t={t}
          size={16}
        />
      </View>
      {expanded && childLocations.map(child => (
        <ChildLocationRow
          key={child.id}
          location={child}
          allLocations={allLocations}
          depth={depth + 1}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
          onManageCategories={onManageCategories}
          canManageLocation={canManageLocation}
          colors={colors}
          styles={styles}
          t={t}
        />
      ))}
    </>
  )
}

function LocationCard({ location, allLocations, onEdit, onDelete, onAddChild, onManageCategories, canManageLocation, colors, styles, t }) {
  const [expanded, setExpanded] = useState(true)
  const childLocations = allLocations.filter(l => l.parentLocationId === location.id)

  return (
    <View style={styles.locationGroup}>
      {/* Header */}
      <View style={styles.locationHeaderRow}>
        <TouchableOpacity
          style={styles.locationHeader}
          onPress={() => setExpanded(!expanded)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? t('collapseA11y', { name: location.name }) : t('expandA11y', { name: location.name })}
        >
          <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.primary} />
          <ThemedText variant="h3" color="dark" style={styles.locationTitle}>{location.name}</ThemedText>
          {location.code && (
            <ThemedText variant="caption" color="secondary">({location.code})</ThemedText>
          )}
          <ThemedText variant="label" color="primary" style={styles.countBadge}>{childLocations.length}</ThemedText>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <LocationActions
            location={location}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddChild={onAddChild}
            onManageCategories={onManageCategories}
            canManage={canManageLocation(location.id)}
            colors={colors}
            t={t}
            size={18}
          />
        </View>
      </View>

      {/* Children (recursive) */}
      {expanded && childLocations.length > 0 && (
        <View style={styles.childrenContainer}>
          {childLocations.map(child => (
            <ChildLocationRow
              key={child.id}
              location={child}
              allLocations={allLocations}
              depth={0}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onManageCategories={onManageCategories}
              canManageLocation={canManageLocation}
              colors={colors}
              styles={styles}
              t={t}
            />
          ))}
        </View>
      )}

      {/* Empty state for locations with no children */}
      {expanded && childLocations.length === 0 && (
        <View style={styles.emptyChildRow}>
          <ThemedText variant="caption" color="secondary">{t('noChildLocations')}</ThemedText>
        </View>
      )}
    </View>
  )
}

export default function LocationsScreen() {
  const { t } = useTranslation('admin')
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const toast = useToast()
  const { user } = useUser()

  const [locations, setLocations] = useState([])
  const [allCategories, setAllCategories] = useState([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editingLocation, setEditingLocation] = useState(null) // null = creating new
  const [editParentId, setEditParentId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Categories modal
  const [catModalVisible, setCatModalVisible] = useState(false)
  const [catLocation, setCatLocation] = useState(null)
  const [catLoading, setCatLoading] = useState(false)
  const [assignedCategories, setAssignedCategories] = useState([])

  const fetchLocations = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    try {
      const data = await api.users.getAllLocations()
      setLocations(data || [])
    } catch (err) {
      toast?.(translateError(err.message, t) || t('loadError'), 'error')
    } finally {
      if (initial) setLoading(false)
    }
  }, [])

  const fetchAllCategories = useCallback(async () => {
    try {
      const data = await api.admin.getAllCategories()
      setAllCategories(Array.isArray(data) ? data : [])
    } catch (err) {
      console.warn('[locations] Failed to fetch categories:', err)
    }
  }, [])

  useEffect(() => { fetchLocations(true); fetchAllCategories() }, [])

  // Build tree from flat list
  const rootLocations = useMemo(() => {
    return locations.filter(l => !l.parentLocationId)
  }, [locations])

  const canManageLocation = useCallback((locationId) => {
    return isAdminAtLocation(user, locationId, locations)
  }, [user, locations])

  const handleEdit = useCallback((location) => {
    setEditingLocation(location)
    setEditParentId(location.parentLocationId)
    setEditName(location.name)
    setEditCode(location.code || '')
    setEditModalVisible(true)
  }, [])

  const handleAddChild = useCallback((parentLocation) => {
    setEditingLocation(null)
    setEditParentId(parentLocation.id)
    setEditName('')
    setEditCode('')
    setEditModalVisible(true)
  }, [])

  const handleDelete = useCallback(async (location) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`${t('deleteLocationConfirm')}\n${t('deleteLocationMessage', { name: location.name })}`)
      : await new Promise(resolve => Alert.alert(
          t('deleteLocationConfirm'),
          t('deleteLocationMessage', { name: location.name }),
          [
            { text: t('cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('deleteLocation'), style: 'destructive', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        ))
    if (!confirmed) return
    try {
      await api.admin.deleteLocation(location.id)
      toast?.(t('locationDeleted'), 'success')
      fetchLocations()
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    }
  }, [fetchLocations, t, toast])

  const handleSaveLocation = useCallback(async () => {
    if (!editName.trim()) return
    setSubmitting(true)
    try {
      if (editingLocation) {
        await api.admin.updateLocation(editingLocation.id, {
          name: editName.trim(),
          code: editCode.trim() || undefined,
        })
        toast?.(t('locationUpdated'), 'success')
      } else {
        await api.admin.createLocation(editParentId, editName.trim(), editCode.trim() || undefined)
        toast?.(t('locationCreated'), 'success')
      }
      setEditModalVisible(false)
      fetchLocations()
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setSubmitting(false)
    }
  }, [editingLocation, editParentId, editName, editCode, fetchLocations, t, toast])

  const handleManageCategories = useCallback(async (location) => {
    setCatLocation(location)
    setCatModalVisible(true)
    setCatLoading(true)
    try {
      const data = await api.admin.getLocationCategories(location.id)
      setAssignedCategories(data || [])
    } catch {
      setAssignedCategories([])
    } finally {
      setCatLoading(false)
    }
  }, [])

  const handleAssignCategory = useCallback(async (categoryId) => {
    if (!catLocation) return
    try {
      await api.admin.assignLocationCategory(catLocation.id, categoryId)
      toast?.(t('categoryAssigned'), 'success')
      // Refresh
      handleManageCategories(catLocation)
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    }
  }, [catLocation, handleManageCategories, t, toast])

  const handleRemoveCategory = useCallback(async (categoryId) => {
    if (!catLocation) return
    try {
      await api.admin.removeLocationCategory(catLocation.id, categoryId)
      toast?.(t('categoryRemoved'), 'success')
      handleManageCategories(catLocation)
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    }
  }, [catLocation, handleManageCategories, t, toast])

  const unassignedCategories = useMemo(() => {
    const assignedIds = new Set(assignedCategories.map(c => c.id))
    return allCategories.filter(c => !assignedIds.has(c.id))
  }, [allCategories, assignedCategories])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={styles.content}>
        <ThemedText variant="h1" title={true} style={styles.pageTitle}>{t('locationsTitle')}</ThemedText>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : rootLocations.length === 0 ? (
          <EmptyState
            icon="location-outline"
            title={t('noLocations')}
            subtitle={t('noLocationsSubtitle')}
            style={styles.emptyContainer}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {rootLocations.map(root => (
              <LocationCard
                key={root.id}
                location={root}
                allLocations={locations}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onAddChild={handleAddChild}
                onManageCategories={handleManageCategories}
                canManageLocation={canManageLocation}
                colors={colors}
                styles={styles}
                t={t}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {/* Edit/Create Location Modal */}
      <BottomDrawerModal
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
        title={editingLocation ? t('editLocation') : t('addLocation')}
        maxHeight="50%"
      >
        <View style={styles.modalContent}>
          <ThemedText variant="label" color="secondary">{t('locationName')}</ThemedText>
          <TextInput
            style={styles.modalInput}
            value={editName}
            onChangeText={setEditName}
            placeholder={t('locationName')}
            placeholderTextColor={colors.placeholderText}
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('locationNameA11y')}
          />
          <ThemedText variant="label" color="secondary">{t('locationCode')}</ThemedText>
          <TextInput
            style={styles.modalInput}
            value={editCode}
            onChangeText={setEditCode}
            placeholder={t('locationCode')}
            placeholderTextColor={colors.placeholderText}
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('locationCodeA11y')}
          />
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveLocation}
            disabled={submitting || !editName.trim()}
            accessibilityRole="button"
            accessibilityLabel={t('save')}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <ThemedText variant="button" color="inverse">{t('save')}</ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </BottomDrawerModal>

      {/* Categories Modal */}
      <BottomDrawerModal
        visible={catModalVisible}
        onClose={() => setCatModalVisible(false)}
        title={catLocation ? t('manageCategoriesFor', { name: catLocation.name }) : t('manageCategories')}
        maxHeight="70%"
      >
        <ScrollView contentContainerStyle={styles.modalContent}>
          {catLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <ThemedText variant="label" color="secondary" style={styles.catSectionLabel}>{t('assignedCategories')}</ThemedText>
              {assignedCategories.length === 0 ? (
                <ThemedText variant="caption" color="secondary">{t('noCategories')}</ThemedText>
              ) : (
                assignedCategories.map(cat => (
                  <View key={cat.id} style={styles.catRow}>
                    <ThemedText variant="bodySmall" color="dark" style={styles.catLabel}>{cat.label}</ThemedText>
                    <TouchableOpacity
                      onPress={() => handleRemoveCategory(cat.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t('removeCategoryA11y', { category: cat.label })}
                    >
                      <Ionicons name="close-circle" size={20} color={SemanticColors.warning} />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {unassignedCategories.length > 0 && (
                <>
                  <ThemedText variant="label" color="secondary" style={styles.catSectionLabel}>{t('addCategory')}</ThemedText>
                  <View style={styles.catChipRow}>
                    {unassignedCategories.map(cat => (
                      <TouchableOpacity
                        key={cat.id}
                        style={styles.catChip}
                        onPress={() => handleAssignCategory(cat.id)}
                        accessibilityRole="button"
                        accessibilityLabel={t('addCategoryA11y', { category: cat.label })}
                      >
                        <Ionicons name="add" size={14} color={colors.primary} />
                        <ThemedText variant="caption" color="dark">{cat.label}</ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {allCategories.length === 0 && (
                <ThemedText variant="caption" color="secondary" style={{ marginTop: 8 }}>{t('noCategoriesAvailable')}</ThemedText>
              )}
            </>
          )}
        </ScrollView>
      </BottomDrawerModal>
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  pageTitle: {
    color: colors.primary,
    marginBottom: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // Card group
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
    gap: 10,
  },
  locationHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  locationTitle: {
    marginLeft: 8,
  },
  countBadge: {
    opacity: 0.6,
    marginLeft: 8,
  },
  headerActions: {
    paddingRight: 12,
  },

  // Child rows
  childrenContainer: {
    backgroundColor: colors.cardBackground,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 16,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: 10,
  },
  childInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  childName: {
    marginLeft: 6,
    fontWeight: '600',
  },
  emptyChildRow: {
    padding: 12,
    paddingLeft: 16,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },

  // Modals
  modalContent: {
    padding: 16,
    gap: 12,
  },
  modalInput: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  catSectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  catLabel: {
    flex: 1,
  },
  catChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.buttonDefault,
  },
})
