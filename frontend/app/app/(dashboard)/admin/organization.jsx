import { StyleSheet, View, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert, Platform, Switch, Modal } from 'react-native'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { SemanticColors } from '../../../constants/Colors'
import { createSharedStyles } from '../../../constants/SharedStyles'
import { ROLE_LABEL_KEYS, getAssignableRoles, getAssignableLocations, getAssignableCategories, canManageRoleAssignment, isAdminAtLocation } from '../../../lib/roles'
import { useUser } from '../../../hooks/useUser'
import api, { translateError } from '../../../lib/api'
import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import Avatar from '../../../components/Avatar'
import EmptyState from '../../../components/EmptyState'
import BottomDrawerModal from '../../../components/BottomDrawerModal'
import LocationPicker from '../../../components/LocationPicker'
import { useToast } from '../../../components/Toast'

const ALL_ROLES = ['admin', 'moderator', 'facilitator', 'assistant_moderator', 'expert', 'liaison']
const CATEGORY_REQUIRED_ROLES = new Set(['assistant_moderator', 'expert', 'liaison'])
const ROLE_HIERARCHY_ORDER = ['admin', 'moderator', 'facilitator', 'assistant_moderator', 'expert', 'liaison']

function RoleUserCard({ item, user, locations, onRemove, colors, styles, t }) {
  const canRemove = canManageRoleAssignment(user, item, locations)
  const [menuVisible, setMenuVisible] = useState(false)

  return (
    <View style={styles.roleCard}>
      <Avatar user={item.user} size={32} showKudosBadge={true} />
      <View style={styles.roleCardInfo}>
        <ThemedText variant="label" color="dark" numberOfLines={1}>{item.user?.displayName}</ThemedText>
        <ThemedText variant="caption" color="secondary">@{item.user?.username}</ThemedText>
      </View>
      <View style={styles.roleCardBadges}>
        <View style={styles.roleBadge}>
          <ThemedText variant="badge" style={styles.roleBadgeText}>
            {t(ROLE_LABEL_KEYS[item.role] || item.role)}
          </ThemedText>
        </View>
        {item.category && (
          <View style={styles.categoryBadge}>
            <ThemedText variant="micro" color="secondary">
              {item.category.label}
            </ThemedText>
          </View>
        )}
      </View>
      {canRemove && (
        <>
          <TouchableOpacity
            style={styles.roleMenuButton}
            onPress={() => setMenuVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('roleActionsA11y', { name: item.user?.displayName })}
          >
            <Ionicons name="ellipsis-vertical" size={16} color={colors.secondaryText} />
          </TouchableOpacity>
          <Modal
            visible={menuVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setMenuVisible(false)}
          >
            <TouchableOpacity
              style={styles.actionMenuOverlay}
              activeOpacity={1}
              onPress={() => setMenuVisible(false)}
            >
              <TouchableOpacity
                style={styles.actionMenuPopup}
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
                accessible={false}
                importantForAccessibility="no"
              >
                <ThemedText variant="h4" color="primary" style={styles.actionMenuTitle}>
                  {item.user?.displayName}
                </ThemedText>
                <TouchableOpacity
                  style={[styles.actionMenuRow, styles.actionMenuRowLast]}
                  onPress={() => { setMenuVisible(false); onRemove(item) }}
                  accessibilityRole="button"
                  accessibilityLabel={t('removeRoleA11y')}
                >
                  <Ionicons name="trash-outline" size={20} color={SemanticColors.warning} />
                  <ThemedText variant="bodySmall" color="error">{t('removeRole')}</ThemedText>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        </>
      )}
    </View>
  )
}

function getDescendantIds(locationId, allLocations) {
  const descendants = new Set()
  const queue = [locationId]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const loc of allLocations) {
      if (loc.parentLocationId === current && !descendants.has(loc.id)) {
        descendants.add(loc.id)
        queue.push(loc.id)
      }
    }
  }
  return descendants
}

function LocationSection({ location, allLocations, depth, expandedLocations, toggleLocation, rolesByLocationId, onEdit, onDelete, onAddChild, onManageCategories, onAssignRole, onRemoveRole, canManageLocation, user, colors, styles, t }) {
  const childLocations = allLocations.filter(l => l.parentLocationId === location.id)
  const hasChildren = childLocations.length > 0
  const isExpanded = expandedLocations.has(location.id)
  const locationRoles = rolesByLocationId.get(location.id) || []
  const headingVariant = depth === 0 ? 'h1' : depth === 1 ? 'h2' : depth === 2 ? 'h3' : 'label'
  const canManage = canManageLocation(location.id)
  const isFacilitatorHere = user?.roles?.some(r => r.role === 'facilitator' && r.locationId === location.id)
  const showMenu = canManage || isFacilitatorHere
  const [actionsMenuVisible, setActionsMenuVisible] = useState(false)

  return (
    <View style={depth > 0 ? styles.locationSectionChild : styles.locationSectionRoot}>
      {/* Header row */}
      <View style={styles.locationHeaderRow}>
        <TouchableOpacity
          style={styles.locationHeaderTouch}
          onPress={() => toggleLocation(location.id)}
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? t('collapseA11y', { name: location.name }) : t('expandA11y', { name: location.name })}
        >
          <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={depth === 0 ? 20 : depth === 1 ? 18 : 16} color={colors.primary} />
          <ThemedText variant={headingVariant} color="dark" style={styles.locationTitle}>{location.name}</ThemedText>
          {location.code && (
            <ThemedText variant="caption" color="secondary"> ({location.code})</ThemedText>
          )}
          {locationRoles.length > 0 && (
            <ThemedText variant="caption" color="primary" style={styles.countBadge}>
              {t('rolesCount', { count: locationRoles.length })}
            </ThemedText>
          )}
        </TouchableOpacity>
        {showMenu && (
          <TouchableOpacity
            onPress={() => setActionsMenuVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('locationActionsA11y', { name: location.name })}
            style={styles.menuButton}
          >
            <Ionicons name="ellipsis-vertical" size={depth === 0 ? 20 : 18} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Action menu */}
      <Modal
        visible={actionsMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setActionsMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.actionMenuOverlay}
          activeOpacity={1}
          onPress={() => setActionsMenuVisible(false)}
        >
          <TouchableOpacity
            style={styles.actionMenuPopup}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            accessible={false}
            importantForAccessibility="no"
          >
            <ThemedText variant="h4" color="primary" style={styles.actionMenuTitle}>
              {t('locationActionsTitle', { name: location.name })}
            </ThemedText>
            {canManage && (
              <>
                <TouchableOpacity
                  style={styles.actionMenuRow}
                  onPress={() => { setActionsMenuVisible(false); onManageCategories(location) }}
                  accessibilityRole="button"
                  accessibilityLabel={t('actionManageCategories')}
                >
                  <Ionicons name="pricetag-outline" size={20} color={colors.primary} />
                  <ThemedText variant="bodySmall" color="dark">{t('actionManageCategories')}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionMenuRow}
                  onPress={() => { setActionsMenuVisible(false); onAddChild(location) }}
                  accessibilityRole="button"
                  accessibilityLabel={t('actionAddChildLocation')}
                >
                  <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                  <ThemedText variant="bodySmall" color="dark">{t('actionAddChildLocation')}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionMenuRow}
                  onPress={() => { setActionsMenuVisible(false); onEdit(location) }}
                  accessibilityRole="button"
                  accessibilityLabel={t('actionEditLocation')}
                >
                  <Ionicons name="create-outline" size={20} color={colors.primary} />
                  <ThemedText variant="bodySmall" color="dark">{t('actionEditLocation')}</ThemedText>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={styles.actionMenuRow}
              onPress={() => { setActionsMenuVisible(false); onAssignRole(location.id) }}
              accessibilityRole="button"
              accessibilityLabel={t('actionAssignRole')}
            >
              <Ionicons name="person-add-outline" size={20} color={colors.primary} />
              <ThemedText variant="bodySmall" color="dark">{t('actionAssignRole')}</ThemedText>
            </TouchableOpacity>
            {canManage && location.parentLocationId && (
              <TouchableOpacity
                style={[styles.actionMenuRow, styles.actionMenuRowLast]}
                onPress={() => { setActionsMenuVisible(false); onDelete(location) }}
                accessibilityRole="button"
                accessibilityLabel={t('actionDeleteLocation')}
              >
                <Ionicons name="trash-outline" size={20} color={SemanticColors.warning} />
                <ThemedText variant="bodySmall" color="error">{t('actionDeleteLocation')}</ThemedText>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Expanded content: role holders */}
      {isExpanded && (
        <>
          {locationRoles.length > 0 ? (
            <View style={styles.rolesContainer}>
              {locationRoles.map(item => (
                <RoleUserCard
                  key={item.id}
                  item={item}
                  user={user}
                  locations={allLocations}
                  onRemove={onRemoveRole}
                  colors={colors}
                  styles={styles}
                  t={t}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyRolesRow}>
              <ThemedText variant="caption" color="secondary">{t('noRolesHere')}</ThemedText>
            </View>
          )}

          {/* Child locations */}
          {hasChildren && childLocations.map(child => (
            <LocationSection
              key={child.id}
              location={child}
              allLocations={allLocations}
              depth={depth + 1}
              expandedLocations={expandedLocations}
              toggleLocation={toggleLocation}
              rolesByLocationId={rolesByLocationId}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onManageCategories={onManageCategories}
              onAssignRole={onAssignRole}
              onRemoveRole={onRemoveRole}
              canManageLocation={canManageLocation}
              user={user}
              colors={colors}
              styles={styles}
              t={t}
            />
          ))}
        </>
      )}
    </View>
  )
}

export default function OrganizationScreen() {
  const { t } = useTranslation('admin')
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const toast = useToast()
  const { user } = useUser()

  // --- Location state ---
  const [locations, setLocations] = useState([])
  const [allCategories, setAllCategories] = useState([])
  const [loading, setLoading] = useState(true)

  // --- Roles state ---
  const [roles, setRoles] = useState([])

  // --- Expand/collapse ---
  const [expandedLocations, setExpandedLocations] = useState(new Set())

  // --- Edit location modal ---
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editingLocation, setEditingLocation] = useState(null)
  const [editParentId, setEditParentId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editNewParentId, setEditNewParentId] = useState(null)
  const [editParentPickerOpen, setEditParentPickerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // --- Categories modal ---
  const [catModalVisible, setCatModalVisible] = useState(false)
  const [catLocation, setCatLocation] = useState(null)
  const [catLoading, setCatLoading] = useState(false)
  const [assignedCategories, setAssignedCategories] = useState([])
  const [newCategoryLabel, setNewCategoryLabel] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [createLabelSurvey, setCreateLabelSurvey] = useState(true)
  const [labelSurveyItems, setLabelSurveyItems] = useState(['', ''])
  const [labelSurveyComparisonQuestion, setLabelSurveyComparisonQuestion] = useState('')
  const [categoryLabelSurveys, setCategoryLabelSurveys] = useState({})
  const [inlineLabelCatId, setInlineLabelCatId] = useState(null)
  const [inlineLabelItems, setInlineLabelItems] = useState(['', ''])
  const [inlineLabelComparison, setInlineLabelComparison] = useState('')
  const [inlineLabelCreating, setInlineLabelCreating] = useState(false)

  // --- Assign role modal ---
  const [assignModalVisible, setAssignModalVisible] = useState(false)
  const [prefilledLocationId, setPrefilledLocationId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedRole, setSelectedRole] = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [assignReason, setAssignReason] = useState('')
  const [assignSubmitting, setAssignSubmitting] = useState(false)
  const [rolePickerVisible, setRolePickerVisible] = useState(false)
  const [locationPickerVisible, setLocationPickerVisible] = useState(false)
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false)

  // --- Data fetching ---
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [locs, roleData, cats] = await Promise.all([
        api.users.getAllLocations(),
        api.admin.listRoles(),
        api.admin.getAllCategories(),
      ])
      setLocations(locs || [])
      setRoles(roleData || [])
      setAllCategories(Array.isArray(cats) ? cats : [])
    } catch (err) {
      toast?.(translateError(err.message, t) || t('loadError'), 'error')
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  const fetchRoles = useCallback(async () => {
    try {
      const data = await api.admin.listRoles()
      setRoles(data || [])
    } catch (err) {
      console.warn('[organization] Failed to refresh roles:', err)
    }
  }, [])

  const fetchLocations = useCallback(async () => {
    try {
      const data = await api.users.getAllLocations()
      setLocations(data || [])
    } catch (err) {
      console.warn('[organization] Failed to refresh locations:', err)
    }
  }, [])

  const fetchAllCategories = useCallback(async () => {
    try {
      const data = await api.admin.getAllCategories()
      setAllCategories(Array.isArray(data) ? data : [])
    } catch (err) {
      console.warn('[organization] Failed to fetch categories:', err)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // --- Computed values ---
  const rootLocations = useMemo(() => {
    return locations.filter(l => !l.parentLocationId)
  }, [locations])

  // Valid parents for the location being edited (exclude self + descendants)
  const validParentLocations = useMemo(() => {
    if (!editingLocation) return locations
    const excluded = getDescendantIds(editingLocation.id, locations)
    excluded.add(editingLocation.id)
    return locations.filter(l => !excluded.has(l.id))
  }, [editingLocation, locations])

  // Breadcrumb path for the selected parent
  const editParentBreadcrumb = useMemo(() => {
    if (!editNewParentId) return ''
    const path = []
    const locMap = new Map(locations.map(l => [l.id, l]))
    let current = locMap.get(editNewParentId)
    while (current) {
      path.unshift(current.name)
      current = current.parentLocationId ? locMap.get(current.parentLocationId) : null
    }
    return path.join(' \u203A ')
  }, [editNewParentId, locations])

  const rolesByLocationId = useMemo(() => {
    const map = new Map()
    for (const r of roles) {
      const locId = r.location?.id
      if (!locId) continue
      if (!map.has(locId)) map.set(locId, [])
      map.get(locId).push(r)
    }
    // Sort each location's roles by hierarchy (highest first)
    for (const [, list] of map) {
      list.sort((a, b) =>
        ROLE_HIERARCHY_ORDER.indexOf(a.role) - ROLE_HIERARCHY_ORDER.indexOf(b.role)
      )
    }
    return map
  }, [roles])

  // Default expanded: location of user's highest role + all ancestors
  useEffect(() => {
    if (locations.length > 0 && user?.roles?.length > 0) {
      const sorted = [...user.roles].sort((a, b) =>
        ROLE_HIERARCHY_ORDER.indexOf(a.role) - ROLE_HIERARCHY_ORDER.indexOf(b.role)
      )
      const locId = sorted[0]?.locationId
      if (locId) {
        const expanded = new Set([locId])
        const locMap = new Map(locations.map(l => [l.id, l]))
        let current = locMap.get(locId)
        while (current?.parentLocationId) {
          expanded.add(current.parentLocationId)
          current = locMap.get(current.parentLocationId)
        }
        setExpandedLocations(expanded)
      }
    }
  }, [locations, user])

  const canManageLocation = useCallback((locationId) => {
    return isAdminAtLocation(user, locationId, locations)
  }, [user, locations])

  const toggleLocation = useCallback((locationId) => {
    setExpandedLocations(prev => {
      const next = new Set(prev)
      if (next.has(locationId)) next.delete(locationId)
      else next.add(locationId)
      return next
    })
  }, [])

  // --- Assign role helpers ---
  const assignableRoles = useMemo(() => getAssignableRoles(user), [user])

  const assignableLocations = useMemo(
    () => getAssignableLocations(user, selectedRole, locations),
    [user, selectedRole, locations]
  )

  const assignableCategoryIds = useMemo(
    () => getAssignableCategories(user, selectedRole, selectedLocation),
    [user, selectedRole, selectedLocation]
  )

  const assignableCategories = useMemo(() => {
    if (assignableCategoryIds === null) return allCategories
    return allCategories.filter(c => assignableCategoryIds.has(c.id))
  }, [allCategories, assignableCategoryIds])

  const allowableLocationsForPicker = useMemo(() => {
    if (!assignableLocations.length) return []
    const allowedIds = new Set(assignableLocations.map(l => l.id))
    return assignableLocations.map(l =>
      allowedIds.has(l.parentLocationId) ? l : { ...l, parentLocationId: null })
  }, [assignableLocations])

  // Cascading resets
  useEffect(() => {
    setSelectedLocation(prefilledLocationId)
    setSelectedCategory(null)
  }, [selectedRole, prefilledLocationId])

  useEffect(() => {
    setSelectedCategory(null)
  }, [selectedLocation])

  // User search debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await api.admin.searchUsers(searchQuery)
        setSearchResults(data || [])
      } catch {}
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // --- Location handlers ---
  const handleEdit = useCallback((location) => {
    setEditingLocation(location)
    setEditParentId(location.parentLocationId)
    setEditNewParentId(location.parentLocationId)
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
        const updates = {
          name: editName.trim(),
          code: editCode.trim() || undefined,
        }
        if (editNewParentId && editNewParentId !== editingLocation.parentLocationId) {
          updates.parentLocationId = editNewParentId
        }
        await api.admin.updateLocation(editingLocation.id, updates)
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
  }, [editingLocation, editParentId, editNewParentId, editName, editCode, fetchLocations, t, toast])

  // --- Category handlers ---
  const handleManageCategories = useCallback(async (location) => {
    setCatLocation(location)
    setCatModalVisible(true)
    setCatLoading(true)
    setInlineLabelCatId(null)
    try {
      const data = await api.admin.getLocationCategories(location.id)
      const cats = data || []
      setAssignedCategories(cats)
      const surveyMap = {}
      await Promise.all(cats.map(async (cat) => {
        try {
          const result = await api.admin.getCategoryLabelSurvey(cat.id)
          surveyMap[cat.id] = result?.labelSurvey || null
        } catch {
          surveyMap[cat.id] = null
        }
      }))
      setCategoryLabelSurveys(surveyMap)
    } catch {
      setAssignedCategories([])
      setCategoryLabelSurveys({})
    } finally {
      setCatLoading(false)
    }
  }, [])

  const handleAssignCategory = useCallback(async (categoryId) => {
    if (!catLocation) return
    try {
      await api.admin.assignLocationCategory(catLocation.id, categoryId)
      toast?.(t('categoryAssigned'), 'success')
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

  const handleCreateCategory = useCallback(async () => {
    if (!newCategoryLabel.trim()) return
    if (createLabelSurvey) {
      const validItems = labelSurveyItems.filter(i => i.trim())
      if (validItems.length < 2) {
        toast?.(t('labelSurveyItemsRequired'), 'error')
        return
      }
    }
    setCreatingCategory(true)
    try {
      const opts = {}
      if (createLabelSurvey) {
        opts.createLabelSurvey = true
        opts.labelSurveyItems = labelSurveyItems.filter(i => i.trim())
        if (labelSurveyComparisonQuestion.trim()) {
          opts.labelSurveyComparisonQuestion = labelSurveyComparisonQuestion.trim()
        }
      }
      const result = await api.admin.createCategory(newCategoryLabel.trim(), null, opts)
      if (catLocation && result?.id) {
        await api.admin.assignLocationCategory(catLocation.id, result.id)
      }
      toast?.(t('categoryCreated'), 'success')
      setNewCategoryLabel('')
      setLabelSurveyItems(['', ''])
      setLabelSurveyComparisonQuestion('')
      setCreateLabelSurvey(true)
      fetchAllCategories()
      if (catLocation) handleManageCategories(catLocation)
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setCreatingCategory(false)
    }
  }, [newCategoryLabel, createLabelSurvey, labelSurveyItems, labelSurveyComparisonQuestion, fetchAllCategories, catLocation, handleManageCategories, t, toast])

  const handleDeleteLabelSurvey = useCallback(async (categoryId, surveyId) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`${t('deleteLabelSurveyConfirm')}\n${t('deleteLabelSurveyMessage')}`)
      : await new Promise(resolve => Alert.alert(
          t('deleteLabelSurveyConfirm'),
          t('deleteLabelSurveyMessage'),
          [
            { text: t('cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('deleteAction'), style: 'destructive', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        ))
    if (!confirmed) return
    try {
      await api.admin.deleteSurvey(surveyId)
      toast?.(t('labelSurveyDeleted'), 'success')
      setCategoryLabelSurveys(prev => ({ ...prev, [categoryId]: null }))
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    }
  }, [t, toast])

  const handleCreateLabelSurvey = useCallback(async (categoryId) => {
    const validItems = inlineLabelItems.filter(i => i.trim())
    if (validItems.length < 2) {
      toast?.(t('labelSurveyItemsRequired'), 'error')
      return
    }
    setInlineLabelCreating(true)
    try {
      const body = {
        isGroupLabeling: true,
        positionCategoryId: categoryId,
        items: validItems,
      }
      if (inlineLabelComparison.trim()) {
        body.comparisonQuestion = inlineLabelComparison.trim()
      }
      await api.admin.createPairwiseSurvey(body)
      toast?.(t('labelSurveyCreated'), 'success')
      setInlineLabelCatId(null)
      setInlineLabelItems(['', ''])
      setInlineLabelComparison('')
      try {
        const result = await api.admin.getCategoryLabelSurvey(categoryId)
        setCategoryLabelSurveys(prev => ({ ...prev, [categoryId]: result?.labelSurvey || null }))
      } catch {
        setCategoryLabelSurveys(prev => ({ ...prev, [categoryId]: null }))
      }
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setInlineLabelCreating(false)
    }
  }, [inlineLabelItems, inlineLabelComparison, t, toast])

  const unassignedCategories = useMemo(() => {
    const assignedIds = new Set(assignedCategories.map(c => c.id))
    return allCategories.filter(c => !assignedIds.has(c.id))
  }, [allCategories, assignedCategories])

  // --- Assign role handlers ---
  const openAssignAtLocation = useCallback((locationId) => {
    setPrefilledLocationId(locationId)
    setSelectedUser(null)
    setSelectedRole(null)
    setSelectedLocation(locationId)
    setSelectedCategory(null)
    setAssignReason('')
    setSearchQuery('')
    setSearchResults([])
    setAssignModalVisible(true)
  }, [])

  const resetAssignForm = useCallback(() => {
    setSelectedUser(null)
    setSelectedRole(null)
    setSelectedLocation(null)
    setSelectedCategory(null)
    setAssignReason('')
    setSearchQuery('')
    setSearchResults([])
    setPrefilledLocationId(null)
  }, [])

  const handleAssignRole = useCallback(async () => {
    if (!selectedUser) { toast?.(t('userRequired'), 'error'); return }
    if (!selectedRole) { toast?.(t('roleRequired'), 'error'); return }
    if (!selectedLocation) { toast?.(t('locationRequired'), 'error'); return }
    if (CATEGORY_REQUIRED_ROLES.has(selectedRole) && !selectedCategory) {
      toast?.(t('categoryRequired'), 'error'); return
    }

    setAssignSubmitting(true)
    try {
      await api.admin.requestRoleAssignment({
        targetUserId: selectedUser.id,
        role: selectedRole,
        locationId: selectedLocation,
        positionCategoryId: selectedCategory || undefined,
        reason: assignReason || undefined,
      })
      toast?.(t('roleAssigned'), 'success')
      setAssignModalVisible(false)
      resetAssignForm()
      fetchRoles()
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setAssignSubmitting(false)
    }
  }, [selectedUser, selectedRole, selectedLocation, selectedCategory, assignReason, fetchRoles, resetAssignForm, t, toast])

  const handleRemoveRole = useCallback(async (roleAssignment) => {
    const roleName = t(ROLE_LABEL_KEYS[roleAssignment.role] || roleAssignment.role)
    const userName = roleAssignment.user?.displayName || roleAssignment.user?.username
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`${t('removeRoleConfirm')}\n${t('removeRoleMessage', { role: roleName, user: userName })}`)
      : await new Promise(resolve => Alert.alert(
          t('removeRoleConfirm'),
          t('removeRoleMessage', { role: roleName, user: userName }),
          [
            { text: t('cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('removeRole'), style: 'destructive', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        ))
    if (!confirmed) return
    try {
      const result = await api.admin.requestRoleRemoval(roleAssignment.id)
      const msg = result?.status === 'auto_approved' ? t('roleRemovedApproved') : t('roleRemovedPending')
      toast?.(msg, 'success')
      fetchRoles()
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    }
  }, [fetchRoles, t, toast])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={styles.content}>
        <ThemedText variant="h1" title={true} style={styles.pageTitle}>{t('organizationTitle')}</ThemedText>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : rootLocations.length === 0 ? (
          <EmptyState
            icon="business-outline"
            title={t('noLocations')}
            subtitle={t('noLocationsSubtitle')}
            style={styles.emptyContainer}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {rootLocations.map(root => (
              <LocationSection
                key={root.id}
                location={root}
                allLocations={locations}
                depth={0}
                expandedLocations={expandedLocations}
                toggleLocation={toggleLocation}
                rolesByLocationId={rolesByLocationId}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onAddChild={handleAddChild}
                onManageCategories={handleManageCategories}
                onAssignRole={openAssignAtLocation}
                onRemoveRole={handleRemoveRole}
                canManageLocation={canManageLocation}
                user={user}
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
        shrink

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
          {editingLocation && editingLocation.parentLocationId && (
            <>
              <ThemedText variant="label" color="secondary">{t('parentLocation')}</ThemedText>
              <TouchableOpacity
                style={styles.parentSelector}
                onPress={() => setEditParentPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('selectParentA11y', { name: editParentBreadcrumb })}
              >
                <ThemedText variant="bodySmall" color={editNewParentId ? 'primary' : 'placeholder'} numberOfLines={1} style={{ flex: 1 }}>
                  {editParentBreadcrumb || t('selectLocation')}
                </ThemedText>
                <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
              </TouchableOpacity>
            </>
          )}
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

          {/* Parent Location Picker (must be inside BottomDrawerModal to layer on top) */}
          <LocationPicker
            visible={editParentPickerOpen}
            onClose={() => setEditParentPickerOpen(false)}
            allLocations={validParentLocations}
            currentLocationId={editNewParentId}
            onSelect={(id) => { setEditNewParentId(id); setEditParentPickerOpen(false) }}
          />
        </View>
      </BottomDrawerModal>

      {/* Categories Modal */}
      <BottomDrawerModal
        visible={catModalVisible}
        onClose={() => setCatModalVisible(false)}
        title={catLocation ? t('manageCategoriesFor', { name: catLocation.name }) : t('manageCategories')}
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
                assignedCategories.map(cat => {
                  const labelSurvey = categoryLabelSurveys[cat.id]
                  const hasLabelSurvey = !!labelSurvey
                  return (
                    <View key={cat.id} style={styles.catRowExpanded}>
                      <View style={styles.catRow}>
                        <ThemedText variant="bodySmall" color="dark" style={styles.catLabel}>{cat.label}</ThemedText>
                        <View style={styles.catBadgeRow}>
                          <View style={[styles.labelSurveyBadge, hasLabelSurvey ? styles.labelSurveyBadgeActive : styles.labelSurveyBadgeInactive]}>
                            <ThemedText variant="micro" style={hasLabelSurvey ? styles.labelSurveyBadgeTextActive : styles.labelSurveyBadgeTextInactive}>
                              {hasLabelSurvey ? t('labelSurvey') : t('noLabelSurvey')}
                            </ThemedText>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleRemoveCategory(cat.id)}
                            accessibilityRole="button"
                            accessibilityLabel={t('removeCategoryA11y', { category: cat.label })}
                          >
                            <Ionicons name="close-circle" size={20} color={SemanticColors.warning} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      {hasLabelSurvey ? (
                        <TouchableOpacity
                          style={styles.labelSurveyAction}
                          onPress={() => handleDeleteLabelSurvey(cat.id, labelSurvey.id)}
                          accessibilityRole="button"
                          accessibilityLabel={t('deleteLabelSurvey')}
                        >
                          <Ionicons name="trash-outline" size={14} color={SemanticColors.warning} />
                          <ThemedText variant="caption" color="error">{t('deleteLabelSurvey')}</ThemedText>
                        </TouchableOpacity>
                      ) : (
                        inlineLabelCatId === cat.id ? (
                          <View style={styles.inlineLabelForm}>
                            {inlineLabelItems.map((item, i) => (
                              <View key={i} style={styles.inlineLabelRow}>
                                <TextInput
                                  style={[styles.modalInput, { flex: 1 }]}
                                  value={item}
                                  onChangeText={(text) => {
                                    const updated = [...inlineLabelItems]
                                    updated[i] = text
                                    setInlineLabelItems(updated)
                                  }}
                                  placeholder={t('itemPlaceholder', { number: i + 1 })}
                                  placeholderTextColor={colors.placeholderText}
                                  maxFontSizeMultiplier={1.5}
                                  accessibilityLabel={t('itemA11y', { number: i + 1 })}
                                />
                                {inlineLabelItems.length > 2 && (
                                  <TouchableOpacity
                                    onPress={() => setInlineLabelItems(prev => prev.filter((_, j) => j !== i))}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('removeItemA11y', { number: i + 1 })}
                                  >
                                    <Ionicons name="close-circle" size={18} color={SemanticColors.warning} />
                                  </TouchableOpacity>
                                )}
                              </View>
                            ))}
                            {inlineLabelItems.length < 20 && (
                              <TouchableOpacity
                                style={styles.addItemRow}
                                onPress={() => setInlineLabelItems(prev => [...prev, ''])}
                                accessibilityRole="button"
                                accessibilityLabel={t('addItemA11y')}
                              >
                                <Ionicons name="add" size={14} color={colors.primary} />
                                <ThemedText variant="caption" color="primary">{t('addItem')}</ThemedText>
                              </TouchableOpacity>
                            )}
                            <TextInput
                              style={styles.modalInput}
                              value={inlineLabelComparison}
                              onChangeText={setInlineLabelComparison}
                              placeholder={t('comparisonQuestionPlaceholder')}
                              placeholderTextColor={colors.placeholderText}
                              maxFontSizeMultiplier={1.5}
                              accessibilityLabel={t('comparisonQuestionA11y')}
                            />
                            <View style={styles.inlineLabelActions}>
                              <TouchableOpacity
                                style={[styles.catChip, { backgroundColor: colors.cardBorder }]}
                                onPress={() => { setInlineLabelCatId(null); setInlineLabelItems(['', '']); setInlineLabelComparison('') }}
                                accessibilityRole="button"
                                accessibilityLabel={t('cancel')}
                              >
                                <ThemedText variant="caption" color="secondary">{t('cancel')}</ThemedText>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.catChip, styles.catChipActive, { opacity: inlineLabelCreating ? 0.5 : 1 }]}
                                onPress={() => handleCreateLabelSurvey(cat.id)}
                                disabled={inlineLabelCreating}
                                accessibilityRole="button"
                                accessibilityLabel={t('createLabelSurvey')}
                              >
                                {inlineLabelCreating ? (
                                  <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                  <ThemedText variant="caption" color="inverse">{t('createLabelSurvey')}</ThemedText>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.labelSurveyAction}
                            onPress={() => { setInlineLabelCatId(cat.id); setInlineLabelItems(['', '']); setInlineLabelComparison('') }}
                            accessibilityRole="button"
                            accessibilityLabel={t('createLabelSurvey')}
                          >
                            <Ionicons name="add-circle-outline" size={14} color={colors.primary} />
                            <ThemedText variant="caption" color="primary">{t('createLabelSurvey')}</ThemedText>
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                  )
                })
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

              <ThemedText variant="label" color="secondary" style={styles.catSectionLabel}>{t('createNewCategory')}</ThemedText>
              <TextInput
                style={styles.modalInput}
                value={newCategoryLabel}
                onChangeText={setNewCategoryLabel}
                placeholder={t('categoryLabelPlaceholder')}
                placeholderTextColor={colors.placeholderText}
                maxFontSizeMultiplier={1.5}
                accessibilityLabel={t('categoryLabelA11y')}
              />
              <View style={styles.labelSurveyToggleRow}>
                <ThemedText variant="bodySmall" color="dark">{t('createLabelSurveyToggle')}</ThemedText>
                <Switch
                  value={createLabelSurvey}
                  onValueChange={setCreateLabelSurvey}
                  trackColor={{ false: colors.cardBorder, true: colors.primary }}
                  accessibilityRole="switch"
                  accessibilityLabel={t('createLabelSurveyToggle')}
                  accessibilityState={{ checked: createLabelSurvey }}
                />
              </View>
              {createLabelSurvey && (
                <View style={styles.inlineLabelForm}>
                  {labelSurveyItems.map((item, i) => (
                    <View key={i} style={styles.inlineLabelRow}>
                      <TextInput
                        style={[styles.modalInput, { flex: 1 }]}
                        value={item}
                        onChangeText={(text) => {
                          const updated = [...labelSurveyItems]
                          updated[i] = text
                          setLabelSurveyItems(updated)
                        }}
                        placeholder={t('itemPlaceholder', { number: i + 1 })}
                        placeholderTextColor={colors.placeholderText}
                        maxFontSizeMultiplier={1.5}
                        accessibilityLabel={t('itemA11y', { number: i + 1 })}
                      />
                      {labelSurveyItems.length > 2 && (
                        <TouchableOpacity
                          onPress={() => setLabelSurveyItems(prev => prev.filter((_, j) => j !== i))}
                          accessibilityRole="button"
                          accessibilityLabel={t('removeItemA11y', { number: i + 1 })}
                        >
                          <Ionicons name="close-circle" size={18} color={SemanticColors.warning} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  {labelSurveyItems.length < 20 && (
                    <TouchableOpacity
                      style={styles.addItemRow}
                      onPress={() => setLabelSurveyItems(prev => [...prev, ''])}
                      accessibilityRole="button"
                      accessibilityLabel={t('addItemA11y')}
                    >
                      <Ionicons name="add" size={14} color={colors.primary} />
                      <ThemedText variant="caption" color="primary">{t('addItem')}</ThemedText>
                    </TouchableOpacity>
                  )}
                  <TextInput
                    style={styles.modalInput}
                    value={labelSurveyComparisonQuestion}
                    onChangeText={setLabelSurveyComparisonQuestion}
                    placeholder={t('comparisonQuestionPlaceholder')}
                    placeholderTextColor={colors.placeholderText}
                    maxFontSizeMultiplier={1.5}
                    accessibilityLabel={t('comparisonQuestionA11y')}
                  />
                </View>
              )}
              <TouchableOpacity
                style={[styles.saveButton, { opacity: (!newCategoryLabel.trim() || creatingCategory) ? 0.5 : 1 }]}
                onPress={handleCreateCategory}
                disabled={!newCategoryLabel.trim() || creatingCategory}
                accessibilityRole="button"
                accessibilityLabel={t('createCategoryA11y')}
              >
                {creatingCategory ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <ThemedText variant="button" color="inverse">{t('createNewCategory')}</ThemedText>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </BottomDrawerModal>

      {/* Assign Role Modal */}
      <BottomDrawerModal
        visible={assignModalVisible}
        onClose={() => { setAssignModalVisible(false); resetAssignForm() }}
        title={t('assignRole')}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
          {/* User search */}
          <ThemedText variant="label" color="secondary" style={styles.fieldLabel}>{t('selectUser')}</ThemedText>
          {selectedUser ? (
            <View style={styles.selectedChip}>
              <ThemedText variant="button" color="dark">{selectedUser.displayName} (@{selectedUser.username})</ThemedText>
              <TouchableOpacity onPress={() => setSelectedUser(null)} accessibilityRole="button" accessibilityLabel={t('cancel')}>
                <Ionicons name="close" size={18} color={colors.secondaryText} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.modalInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('searchUsersPlaceholder')}
                placeholderTextColor={colors.placeholderText}
                maxFontSizeMultiplier={1.5}
                accessibilityLabel={t('searchUsersA11y')}
              />
              {searching && <ActivityIndicator size="small" color={colors.primary} />}
              {searchResults.map(u => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.searchResultItem}
                  onPress={() => { setSelectedUser(u); setSearchQuery(''); setSearchResults([]) }}
                  accessibilityRole="button"
                  accessibilityLabel={`${u.displayName} @${u.username}`}
                >
                  <Avatar user={u} size="sm" showKudosBadge={false} />
                  <View style={styles.searchResultText}>
                    <ThemedText variant="bodySmall" color="dark">{u.displayName}</ThemedText>
                    <ThemedText variant="caption" color="secondary">@{u.username}</ThemedText>
                  </View>
                  {u.status && u.status !== 'active' && (
                    <View style={[styles.statusBadge, u.status === 'banned' && styles.statusBadgeBanned]}>
                      <ThemedText variant="micro" style={styles.statusBadgeText}>{u.status}</ThemedText>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* Role picker */}
          <ThemedText variant="label" color="secondary" style={styles.fieldLabel}>{t('selectRole')}</ThemedText>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setRolePickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('selectRole')}
          >
            <Ionicons name="shield-outline" size={16} color={colors.secondaryText} />
            <ThemedText variant="body" color="dark" style={styles.pickerButtonText}>
              {selectedRole ? t(ROLE_LABEL_KEYS[selectedRole]) : t('selectRole')}
            </ThemedText>
            <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
          </TouchableOpacity>

          {/* Location picker */}
          <ThemedText variant="label" color="secondary" style={styles.fieldLabel}>{t('selectLocation')}</ThemedText>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setLocationPickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('selectLocation')}
          >
            <Ionicons name="location-outline" size={16} color={colors.secondaryText} />
            <ThemedText variant="body" color="dark" style={styles.pickerButtonText}>
              {selectedLocation
                ? locations.find(l => l.id === selectedLocation)?.name || t('selectLocation')
                : t('selectLocation')}
            </ThemedText>
            <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
          </TouchableOpacity>

          {/* Category picker */}
          {selectedRole && CATEGORY_REQUIRED_ROLES.has(selectedRole) && (
            <>
              <ThemedText variant="label" color="secondary" style={styles.fieldLabel}>{t('selectCategory')}</ThemedText>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setCategoryPickerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('selectCategory')}
              >
                <Ionicons name="pricetag-outline" size={16} color={colors.secondaryText} />
                <ThemedText variant="body" color="dark" style={styles.pickerButtonText}>
                  {selectedCategory
                    ? assignableCategories.find(c => c.id === selectedCategory)?.label || t('selectCategory')
                    : t('selectCategory')}
                </ThemedText>
                <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
              </TouchableOpacity>
            </>
          )}

          {/* Reason */}
          <TextInput
            style={styles.modalInput}
            value={assignReason}
            onChangeText={setAssignReason}
            placeholder={t('reasonPlaceholder')}
            placeholderTextColor={colors.placeholderText}
            maxFontSizeMultiplier={1.5}
          />

          {/* Submit */}
          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleAssignRole}
            disabled={assignSubmitting}
            accessibilityRole="button"
            accessibilityLabel={t('submit')}
          >
            {assignSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <ThemedText variant="button" color="inverse">{t('submit')}</ThemedText>
            )}
          </TouchableOpacity>
        </ScrollView>
      </BottomDrawerModal>

      {/* Role Picker Modal */}
      <BottomDrawerModal
        visible={rolePickerVisible}
        onClose={() => setRolePickerVisible(false)}
        title={t('selectRole')}
      >
        <ScrollView contentContainerStyle={styles.pickerList}>
          {assignableRoles.map(r => {
            const selected = selectedRole === r
            return (
              <TouchableOpacity
                key={r}
                style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                onPress={() => { setSelectedRole(r); setRolePickerVisible(false) }}
                accessibilityRole="button"
                accessibilityLabel={t(ROLE_LABEL_KEYS[r])}
                accessibilityState={{ selected }}
              >
                <ThemedText variant="body" color={selected ? 'primary' : 'dark'}>
                  {t(ROLE_LABEL_KEYS[r])}
                </ThemedText>
                {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </BottomDrawerModal>

      {/* Location Picker Modal */}
      <LocationPicker
        visible={locationPickerVisible}
        onClose={() => setLocationPickerVisible(false)}
        allLocations={allowableLocationsForPicker}
        currentLocationId={selectedLocation}
        onSelect={(id) => { setSelectedLocation(id); setLocationPickerVisible(false) }}
      />

      {/* Category Picker Modal */}
      <BottomDrawerModal
        visible={categoryPickerVisible}
        onClose={() => setCategoryPickerVisible(false)}
        title={t('selectCategory')}
      >
        <ScrollView contentContainerStyle={styles.pickerList}>
          {assignableCategories.map(c => {
            const selected = selectedCategory === c.id
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                onPress={() => { setSelectedCategory(c.id); setCategoryPickerVisible(false) }}
                accessibilityRole="button"
                accessibilityLabel={c.label}
                accessibilityState={{ selected }}
              >
                <ThemedText variant="body" color={selected ? 'primary' : 'dark'}>
                  {c.label}
                </ThemedText>
                {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
              </TouchableOpacity>
            )
          })}
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

  // Location sections
  locationSectionRoot: {
    marginBottom: 4,
  },
  locationSectionChild: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  locationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  locationHeaderTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationTitle: {
    marginLeft: 6,
  },
  countBadge: {
    opacity: 0.6,
    marginLeft: 8,
  },
  menuButton: {
    padding: 4,
  },
  actionMenuOverlay: {
    flex: 1,
    backgroundColor: SemanticColors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  actionMenuPopup: {
    backgroundColor: colors.cardBackground,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 8,
    maxWidth: 340,
    width: '100%',
  },
  actionMenuTitle: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  actionMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  actionMenuRowLast: {
    borderBottomWidth: 0,
  },

  // Role cards
  rolesContainer: {
    gap: 8,
    paddingBottom: 8,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 10,
  },
  roleCardInfo: {
    flex: 1,
  },
  roleCardBadges: {
    alignItems: 'flex-end',
    gap: 4,
  },
  roleBadge: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  roleBadgeText: {
    color: colors.badgeText,
    fontWeight: '600',
  },
  categoryBadge: {
    backgroundColor: colors.cardBorder,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleMenuButton: {
    padding: 6,
  },
  emptyRolesRow: {
    paddingVertical: 6,
    paddingLeft: 24,
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
  parentSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  saveButton: {
    backgroundColor: colors.primarySurface,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 4,
  },
  submitButton: {
    backgroundColor: colors.primarySurface,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 8,
  },
  fieldLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  catChipActive: {
    backgroundColor: colors.primarySurface,
  },
  catRowExpanded: {
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    paddingBottom: 10,
    gap: 6,
  },
  catBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  labelSurveyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  labelSurveyBadgeActive: {
    backgroundColor: SemanticColors.success,
  },
  labelSurveyBadgeInactive: {
    backgroundColor: colors.cardBorder,
  },
  labelSurveyBadgeTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  labelSurveyBadgeTextInactive: {
    color: colors.secondaryText,
  },
  labelSurveyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 4,
  },
  labelSurveyToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  inlineLabelForm: {
    gap: 8,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
  },
  inlineLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineLabelActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  addItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },

  // Assign modal
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerButtonText: {
    flex: 1,
  },
  pickerList: {
    padding: 16,
    paddingBottom: 40,
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  pickerRowSelected: {
    backgroundColor: colors.primaryLight + '20',
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  searchResultText: {
    flex: 1,
  },
  statusBadge: {
    backgroundColor: colors.cardBorder,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeBanned: {
    backgroundColor: SemanticColors.warning,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
})
