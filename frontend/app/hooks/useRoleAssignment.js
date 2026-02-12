/**
 * Hook for managing role assignment and removal within admin screens.
 *
 * Handles: user search with debounce, role/location/category picker state,
 * cascading field resets, role assignment submission, and role removal with
 * confirmation dialogs.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Platform, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ROLE_LABEL_KEYS, getAssignableRoles, getAssignableLocations, getAssignableCategories } from '../lib/roles'
import api, { translateError } from '../lib/api'
import { useToast } from '../components/Toast'

const CATEGORY_REQUIRED_ROLES = new Set(['assistant_moderator', 'expert', 'liaison'])

export { CATEGORY_REQUIRED_ROLES }

export default function useRoleAssignment({ user, locations, allCategories, fetchRoles }) {
  const { t } = useTranslation('admin')
  const toast = useToast()

  // --- Modal + form state ---
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

  // --- Picker visibility ---
  const [rolePickerVisible, setRolePickerVisible] = useState(false)
  const [locationPickerVisible, setLocationPickerVisible] = useState(false)
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false)

  // --- Computed values ---
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

  const showCategoryPicker = selectedRole && CATEGORY_REQUIRED_ROLES.has(selectedRole)

  // --- Cascading resets ---
  useEffect(() => {
    setSelectedLocation(prefilledLocationId)
    setSelectedCategory(null)
  }, [selectedRole, prefilledLocationId])

  useEffect(() => {
    setSelectedCategory(null)
  }, [selectedLocation])

  // --- User search debounce ---
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

  // --- Handlers ---
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

  return {
    assignModalVisible, setAssignModalVisible,
    searchQuery, setSearchQuery,
    searchResults,
    searching,
    selectedUser, setSelectedUser,
    selectedRole, setSelectedRole,
    selectedLocation, setSelectedLocation,
    selectedCategory, setSelectedCategory,
    assignReason, setAssignReason,
    assignSubmitting,
    rolePickerVisible, setRolePickerVisible,
    locationPickerVisible, setLocationPickerVisible,
    categoryPickerVisible, setCategoryPickerVisible,
    assignableRoles,
    assignableLocations,
    assignableCategories,
    allowableLocationsForPicker,
    showCategoryPicker,
    openAssignAtLocation,
    resetAssignForm,
    handleAssignRole,
    handleRemoveRole,
  }
}
