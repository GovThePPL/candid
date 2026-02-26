/**
 * Hook for managing role assignment and removal within admin screens.
 *
 * Handles: user search with debounce, role/location/session picker state,
 * cascading field resets, role assignment submission, and role removal with
 * confirmation dialogs.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Platform, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ROLE_LABEL_KEYS, getAssignableRoles, getAssignableLocations, getAssignableSessions } from '../lib/roles'
import api, { translateError } from '../lib/api'
import { useToast } from '../components/Toast'

const SESSION_REQUIRED_ROLES = new Set(['assistant_moderator', 'expert', 'liaison'])

export { SESSION_REQUIRED_ROLES }

export default function useRoleAssignment({ user, locations, allSessions, fetchRoles }) {
  const { t } = useTranslation('admin')
  const toast = useToast()

  // --- Modal + form state ---
  const [assignModalVisible, setAssignModalVisible] = useState(false)
  const [prefilledLocationId, setPrefilledLocationId] = useState(null)
  const [prefilledSessionId, setPrefilledSessionId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedRole, setSelectedRole] = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [selectedSession, setSelectedSession] = useState(null)
  const [assignReason, setAssignReason] = useState('')
  const [assignSubmitting, setAssignSubmitting] = useState(false)

  // --- Picker visibility ---
  const [rolePickerVisible, setRolePickerVisible] = useState(false)
  const [locationPickerVisible, setLocationPickerVisible] = useState(false)
  const [sessionPickerVisible, setSessionPickerVisible] = useState(false)

  // --- Computed values ---
  const assignableRoles = useMemo(() => getAssignableRoles(user), [user])

  const assignableLocations = useMemo(
    () => getAssignableLocations(user, selectedRole, locations),
    [user, selectedRole, locations]
  )

  const assignableSessionIds = useMemo(
    () => getAssignableSessions(user, selectedRole, selectedLocation),
    [user, selectedRole, selectedLocation]
  )

  const assignableSessions = useMemo(() => {
    if (assignableSessionIds === null) return allSessions
    return allSessions.filter(c => assignableSessionIds.has(c.id))
  }, [allSessions, assignableSessionIds])

  const allowableLocationsForPicker = useMemo(() => {
    if (!assignableLocations.length) return []
    const allowedIds = new Set(assignableLocations.map(l => l.id))
    return assignableLocations.map(l =>
      allowedIds.has(l.parentLocationId) ? l : { ...l, parentLocationId: null })
  }, [assignableLocations])

  const showSessionPicker = selectedRole && SESSION_REQUIRED_ROLES.has(selectedRole)

  // --- Cascading resets ---
  useEffect(() => {
    setSelectedLocation(prefilledLocationId)
    setSelectedSession(prefilledSessionId)
  }, [selectedRole, prefilledLocationId, prefilledSessionId])

  useEffect(() => {
    setSelectedSession(prefilledSessionId)
  }, [selectedLocation, prefilledSessionId])

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
    setPrefilledSessionId(null)
    setSelectedUser(null)
    setSelectedRole(null)
    setSelectedLocation(locationId)
    setSelectedSession(null)
    setAssignReason('')
    setSearchQuery('')
    setSearchResults([])
    setAssignModalVisible(true)
  }, [])

  const openAssignForSession = useCallback((locationId, sessionId) => {
    setPrefilledLocationId(locationId)
    setPrefilledSessionId(sessionId)
    setSelectedUser(null)
    setSelectedRole(null)
    setSelectedLocation(locationId)
    setSelectedSession(sessionId)
    setAssignReason('')
    setSearchQuery('')
    setSearchResults([])
    setAssignModalVisible(true)
  }, [])

  const resetAssignForm = useCallback(() => {
    setSelectedUser(null)
    setSelectedRole(null)
    setSelectedLocation(null)
    setSelectedSession(null)
    setAssignReason('')
    setSearchQuery('')
    setSearchResults([])
    setPrefilledLocationId(null)
    setPrefilledSessionId(null)
  }, [])

  const handleAssignRole = useCallback(async () => {
    if (!selectedUser) { toast?.(t('userRequired'), 'error'); return }
    if (!selectedRole) { toast?.(t('roleRequired'), 'error'); return }
    if (!selectedLocation) { toast?.(t('locationRequired'), 'error'); return }
    if (SESSION_REQUIRED_ROLES.has(selectedRole) && !selectedSession) {
      toast?.(t('sessionRequired'), 'error'); return
    }

    setAssignSubmitting(true)
    try {
      await api.admin.requestRoleAssignment({
        targetUserId: selectedUser.id,
        role: selectedRole,
        locationId: selectedLocation,
        sessionId: selectedSession || undefined,
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
  }, [selectedUser, selectedRole, selectedLocation, selectedSession, assignReason, fetchRoles, resetAssignForm, t, toast])

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
    selectedSession, setSelectedSession,
    assignReason, setAssignReason,
    assignSubmitting,
    rolePickerVisible, setRolePickerVisible,
    locationPickerVisible, setLocationPickerVisible,
    sessionPickerVisible, setSessionPickerVisible,
    assignableRoles,
    assignableLocations,
    assignableSessions,
    allowableLocationsForPicker,
    showSessionPicker,
    openAssignAtLocation,
    openAssignForSession,
    resetAssignForm,
    handleAssignRole,
    handleRemoveRole,
  }
}
