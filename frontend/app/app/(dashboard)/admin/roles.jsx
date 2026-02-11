import { StyleSheet, View, ScrollView, TouchableOpacity, FlatList, ActivityIndicator, TextInput, Alert, Platform } from 'react-native'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { SemanticColors } from '../../../constants/Colors'
import { ROLE_LABEL_KEYS, getAssignableRoles, getAssignableLocations, getAssignableCategories, canManageRoleAssignment } from '../../../lib/roles'
import { useUser } from '../../../hooks/useUser'
import api, { translateError } from '../../../lib/api'
import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import Avatar from '../../../components/Avatar'
import EmptyState from '../../../components/EmptyState'
import BottomDrawerModal from '../../../components/BottomDrawerModal'
import { useToast } from '../../../components/Toast'

const ALL_ROLES = ['admin', 'moderator', 'facilitator', 'assistant_moderator', 'expert', 'liaison']
const CATEGORY_REQUIRED_ROLES = new Set(['assistant_moderator', 'expert', 'liaison'])

export default function RolesScreen() {
  const { t } = useTranslation('admin')
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const toast = useToast()
  const { user } = useUser()

  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterRole, setFilterRole] = useState(null)
  const [filterLocation, setFilterLocation] = useState(null)
  const [locations, setLocations] = useState([])
  const [categories, setCategories] = useState([])

  // Assign role modal state
  const [assignModalVisible, setAssignModalVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedRole, setSelectedRole] = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [assignReason, setAssignReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchRoles = useCallback(async () => {
    setLoading(true)
    try {
      const filters = {}
      if (filterRole) filters.role = filterRole
      if (filterLocation) filters.locationId = filterLocation
      const data = await api.admin.listRoles(filters)
      setRoles(data || [])
    } catch (err) {
      toast?.(translateError(err.message, t) || t('loadError'), 'error')
    } finally {
      setLoading(false)
    }
  }, [filterRole, filterLocation])

  const fetchLocations = useCallback(async () => {
    try {
      const data = await api.users.getAllLocations()
      setLocations(data || [])
    } catch (err) {
      console.error('[Roles] Failed to load locations:', err)
    }
  }, [])

  const fetchCategories = useCallback(async () => {
    try {
      const data = await api.admin.getAllCategories()
      setCategories(data || [])
    } catch {}
  }, [])

  useEffect(() => { fetchRoles() }, [fetchRoles])
  useEffect(() => { fetchLocations(); fetchCategories() }, [])

  // Scope-limited options based on the logged-in user's roles
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
    if (assignableCategoryIds === null) return categories // all valid (admin roles)
    return categories.filter(c => assignableCategoryIds.has(c.id))
  }, [categories, assignableCategoryIds])

  // Cascading resets: changing role resets location & category
  useEffect(() => {
    setSelectedLocation(null)
    setSelectedCategory(null)
  }, [selectedRole])

  // Changing location resets category
  useEffect(() => {
    setSelectedCategory(null)
  }, [selectedLocation])

  // User search with debounce
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

  const handleAssignRole = useCallback(async () => {
    if (!selectedUser) { toast?.(t('userRequired'), 'error'); return }
    if (!selectedRole) { toast?.(t('roleRequired'), 'error'); return }
    if (!selectedLocation) { toast?.(t('locationRequired'), 'error'); return }
    if (CATEGORY_REQUIRED_ROLES.has(selectedRole) && !selectedCategory) {
      toast?.(t('categoryRequired'), 'error'); return
    }

    setSubmitting(true)
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
      setSubmitting(false)
    }
  }, [selectedUser, selectedRole, selectedLocation, selectedCategory, assignReason, fetchRoles, t, toast])

  const resetAssignForm = () => {
    setSelectedUser(null)
    setSelectedRole(null)
    setSelectedLocation(null)
    setSelectedCategory(null)
    setAssignReason('')
    setSearchQuery('')
    setSearchResults([])
  }

  const renderRoleItem = useCallback(({ item }) => (
    <View style={styles.roleCard}>
      <View style={styles.roleCardHeader}>
        <View style={styles.roleCardUser}>
          <ThemedText variant="button" color="dark">{item.user?.displayName}</ThemedText>
          <ThemedText variant="caption" color="secondary">@{item.user?.username}</ThemedText>
        </View>
        <View style={styles.roleBadge}>
          <ThemedText variant="badge" style={styles.roleBadgeText}>
            {t(ROLE_LABEL_KEYS[item.role] || item.role)}
          </ThemedText>
        </View>
      </View>
      <View style={styles.roleCardMeta}>
        {item.location && (
          <ThemedText variant="caption" color="secondary">
            {t('atLocation', { location: item.location.name })}
          </ThemedText>
        )}
        {item.category && (
          <ThemedText variant="caption" color="secondary">
            {t('inCategory', { category: item.category.label })}
          </ThemedText>
        )}
      </View>
      {canManageRoleAssignment(user, item, locations) && (
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handleRemoveRole(item)}
          accessibilityRole="button"
          accessibilityLabel={t('removeRoleA11y')}
        >
          <Ionicons name="trash-outline" size={16} color={SemanticColors.warning} />
          <ThemedText variant="caption" color="error">{t('removeRole')}</ThemedText>
        </TouchableOpacity>
      )}
    </View>
  ), [styles, t, handleRemoveRole, colors, user, locations])

  // Unique locations from role data for filter
  const locationOptions = useMemo(() => {
    const map = new Map()
    roles.forEach(r => {
      if (r.location) map.set(r.location.id, r.location)
    })
    return Array.from(map.values())
  }, [roles])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText variant="h1" title={true} style={styles.pageTitle}>{t('rolesTitle')}</ThemedText>
          {assignableRoles.length > 0 && (
            <TouchableOpacity
              style={styles.assignButton}
              onPress={() => setAssignModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t('assignRoleA11y')}
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <ThemedText variant="buttonSmall" color="inverse">{t('assignRole')}</ThemedText>
            </TouchableOpacity>
          )}
        </View>

        {/* Filters */}
        <View style={styles.filterRow}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[{ label: t('allRoles'), value: null }, ...ALL_ROLES.map(r => ({ label: t(ROLE_LABEL_KEYS[r]), value: r }))]}
            keyExtractor={(item) => item.value || 'all'}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.filterChip, filterRole === item.value && styles.filterChipActive]}
                onPress={() => setFilterRole(item.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: filterRole === item.value }}
              >
                <ThemedText variant="caption" style={filterRole === item.value ? styles.filterChipTextActive : styles.filterChipText}>
                  {item.label}
                </ThemedText>
              </TouchableOpacity>
            )}
          />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : roles.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title={t('noRoleAssignments')}
            subtitle={t('noRoleAssignmentsSubtitle')}
            style={styles.emptyContainer}
          />
        ) : (
          <FlatList
            data={roles}
            keyExtractor={(item) => item.id}
            renderItem={renderRoleItem}
            extraData={[user, locations]}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

      {/* Assign Role Modal */}
      <BottomDrawerModal
        visible={assignModalVisible}
        onClose={() => { setAssignModalVisible(false); resetAssignForm() }}
        title={t('assignRole')}
        maxHeight="85%"
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
                style={styles.searchInput}
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
          <View style={styles.chipRow}>
            {assignableRoles.map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.optionChip, selectedRole === r && styles.optionChipActive]}
                onPress={() => setSelectedRole(r)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedRole === r }}
              >
                <ThemedText variant="caption" style={selectedRole === r ? styles.optionChipTextActive : styles.optionChipText}>
                  {t(ROLE_LABEL_KEYS[r])}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          {/* Location picker */}
          <ThemedText variant="label" color="secondary" style={styles.fieldLabel}>{t('selectLocation')}</ThemedText>
          <View style={styles.chipRow}>
            {assignableLocations.map(l => (
              <TouchableOpacity
                key={l.id}
                style={[styles.optionChip, selectedLocation === l.id && styles.optionChipActive]}
                onPress={() => setSelectedLocation(l.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedLocation === l.id }}
              >
                <ThemedText variant="caption" style={selectedLocation === l.id ? styles.optionChipTextActive : styles.optionChipText}>
                  {l.name}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          {/* Category picker (only for category-scoped roles) */}
          {selectedRole && CATEGORY_REQUIRED_ROLES.has(selectedRole) && (
            <>
              <ThemedText variant="label" color="secondary" style={styles.fieldLabel}>{t('selectCategory')}</ThemedText>
              <View style={styles.chipRow}>
                {assignableCategories.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.optionChip, selectedCategory === c.id && styles.optionChipActive]}
                    onPress={() => setSelectedCategory(c.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selectedCategory === c.id }}
                  >
                    <ThemedText variant="caption" style={selectedCategory === c.id ? styles.optionChipTextActive : styles.optionChipText}>
                      {c.label}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Reason */}
          <TextInput
            style={styles.searchInput}
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
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel={t('submit')}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <ThemedText variant="button" color="inverse">{t('submit')}</ThemedText>
            )}
          </TouchableOpacity>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  pageTitle: {
    color: colors.primary,
    flex: 1,
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  filterRow: {
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.secondaryText,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
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
  listContent: {
    paddingBottom: 20,
    gap: 12,
  },
  roleCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  roleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  roleCardUser: {},
  roleBadge: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: {
    color: colors.badgeText,
    fontWeight: '600',
  },
  roleCardMeta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
  },
  modalContent: {
    padding: 16,
    gap: 12,
  },
  fieldLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  searchInput: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
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
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.buttonDefault,
  },
  optionChipActive: {
    backgroundColor: colors.buttonSelected,
  },
  optionChipText: {
    color: colors.buttonDefaultText,
  },
  optionChipTextActive: {
    color: colors.buttonSelectedText,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
})
