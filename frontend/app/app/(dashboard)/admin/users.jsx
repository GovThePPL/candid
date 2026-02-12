import { StyleSheet, View, TouchableOpacity, FlatList, ActivityIndicator, TextInput, ScrollView } from 'react-native'
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
import Avatar from '../../../components/Avatar'
import ModerationHistoryModal from '../../../components/ModerationHistoryModal'
import BottomDrawerModal from '../../../components/BottomDrawerModal'
import LocationPicker from '../../../components/LocationPicker'
import { useToast } from '../../../components/Toast'
import { ROLE_LABEL_KEYS, getAssignableRoles, getAssignableLocations, getAssignableCategories } from '../../../lib/roles'
import { useUser } from '../../../hooks/useUser'

export default function UsersScreen() {
  const { t } = useTranslation('admin')
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const toast = useToast()
  const { user: currentUser } = useUser()

  const [searchQuery, setSearchQuery] = useState('')
  const [users, setUsers] = useState([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [processing, setProcessing] = useState(null)

  // Moderation history modal
  const [historyUser, setHistoryUser] = useState(null)
  const [historyVisible, setHistoryVisible] = useState(false)

  // Assign role modal
  const [assignModalVisible, setAssignModalVisible] = useState(false)
  const [assignTarget, setAssignTarget] = useState(null)
  const [selectedRole, setSelectedRole] = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [assignReason, setAssignReason] = useState('')
  const [assignSubmitting, setAssignSubmitting] = useState(false)
  const [locations, setLocations] = useState([])
  const [categories, setCategories] = useState([])

  // Picker modals for assign role
  const [rolePickerVisible, setRolePickerVisible] = useState(false)
  const [locationPickerVisible, setLocationPickerVisible] = useState(false)
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false)

  // Ban/unban modal
  const [banModalVisible, setBanModalVisible] = useState(false)
  const [banTarget, setBanTarget] = useState(null)
  const [banReason, setBanReason] = useState('')
  const [banAction, setBanAction] = useState(null)

  // Debounced search (reuse pattern from roles.jsx)
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setUsers([])
      setHasSearched(false)
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await api.admin.searchUsers(searchQuery)
        setUsers(data || [])
        setHasSearched(true)
      } catch {}
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch locations + categories on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [locs, cats] = await Promise.all([
          api.users.getAllLocations(),
          api.admin.getAllCategories(),
        ])
        setLocations(locs || [])
        setCategories(cats || [])
      } catch {}
    }
    load()
  }, [])

  // Role assignment helpers
  const CATEGORY_REQUIRED_ROLES = new Set(['assistant_moderator', 'expert', 'liaison'])
  const assignableRoles = useMemo(() => getAssignableRoles(currentUser), [currentUser])
  const assignableLocations = useMemo(() => getAssignableLocations(currentUser, selectedRole, locations), [currentUser, selectedRole, locations])
  const assignableCategoryIds = useMemo(() => getAssignableCategories(currentUser, selectedRole, selectedLocation), [currentUser, selectedRole, selectedLocation])
  const assignableCategories = useMemo(() => {
    if (assignableCategoryIds === null) return categories
    return categories.filter(c => assignableCategoryIds.has(c.id))
  }, [categories, assignableCategoryIds])

  const allowableLocationsForPicker = useMemo(() => {
    if (!assignableLocations.length) return []
    const allowedIds = new Set(assignableLocations.map(l => l.id))
    return assignableLocations.map(l =>
      allowedIds.has(l.parentLocationId) ? l : { ...l, parentLocationId: null })
  }, [assignableLocations])

  useEffect(() => { setSelectedLocation(null); setSelectedCategory(null) }, [selectedRole])
  useEffect(() => { setSelectedCategory(null) }, [selectedLocation])

  const handleAssignRole = useCallback(async () => {
    if (!selectedRole) { toast?.(t('roleRequired'), 'error'); return }
    if (!selectedLocation) { toast?.(t('locationRequired'), 'error'); return }
    if (CATEGORY_REQUIRED_ROLES.has(selectedRole) && !selectedCategory) {
      toast?.(t('categoryRequired'), 'error'); return
    }
    setAssignSubmitting(true)
    try {
      await api.admin.requestRoleAssignment({
        targetUserId: assignTarget.id,
        role: selectedRole,
        locationId: selectedLocation,
        positionCategoryId: selectedCategory || undefined,
        reason: assignReason || undefined,
      })
      toast?.(t('roleAssigned'), 'success')
      setAssignModalVisible(false)
      resetAssignForm()
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setAssignSubmitting(false)
    }
  }, [assignTarget, selectedRole, selectedLocation, selectedCategory, assignReason, t, toast])

  const resetAssignForm = () => {
    setAssignTarget(null)
    setSelectedRole(null)
    setSelectedLocation(null)
    setSelectedCategory(null)
    setAssignReason('')
  }

  const openAssignModal = useCallback((user) => {
    setAssignTarget(user)
    setAssignModalVisible(true)
  }, [])

  // Ban/unban handlers
  const openBanModal = useCallback((user, action) => {
    setBanTarget(user)
    setBanAction(action)
    setBanReason('')
    setBanModalVisible(true)
  }, [])

  const handleBanSubmit = useCallback(async () => {
    if (!banReason.trim()) {
      toast?.(t('banReasonRequired'), 'error')
      return
    }
    setProcessing(banTarget.id)
    try {
      if (banAction === 'ban') {
        await api.admin.banUser(banTarget.id, banReason.trim())
        toast?.(t('userBanned'), 'success')
        setUsers(prev => prev.map(u => u.id === banTarget.id ? { ...u, status: 'banned' } : u))
      } else {
        await api.admin.unbanUser(banTarget.id, banReason.trim())
        toast?.(t('userUnbanned'), 'success')
        setUsers(prev => prev.map(u => u.id === banTarget.id ? { ...u, status: 'active' } : u))
      }
      setBanModalVisible(false)
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setProcessing(null)
    }
  }, [banTarget, banAction, banReason, t, toast])

  const renderUser = useCallback(({ item }) => {
    const isBanned = item.status === 'banned'
    const name = item.displayName || item.username

    return (
      <View style={styles.userCard}>
        <View style={styles.userInfo}>
          <Avatar user={item} size="sm" />
          <View style={styles.userText}>
            <ThemedText variant="button" color="dark">{item.displayName}</ThemedText>
            <ThemedText variant="caption" color="secondary">@{item.username}</ThemedText>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: isBanned ? SemanticColors.warning : SemanticColors.success }]}>
            <ThemedText variant="badge" color="inverse" style={styles.statusBadgeText}>
              {isBanned ? t('userStatusBanned') : t('userStatusActive')}
            </ThemedText>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => { setHistoryUser(item); setHistoryVisible(true) }}
            accessibilityRole="button"
            accessibilityLabel={t('viewHistoryA11y', { name })}
          >
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <ThemedText variant="caption" color="primary">{t('viewHistory')}</ThemedText>
          </TouchableOpacity>

          {assignableRoles.length > 0 && (
            <TouchableOpacity
              style={styles.assignButton}
              onPress={() => openAssignModal(item)}
              accessibilityRole="button"
              accessibilityLabel={t('assignRoleUserA11y', { name })}
            >
              <Ionicons name="shield-outline" size={16} color={colors.primary} />
              <ThemedText variant="caption" color="primary">{t('assignRoleUser')}</ThemedText>
            </TouchableOpacity>
          )}

          {isBanned ? (
            <TouchableOpacity
              style={styles.unbanButton}
              onPress={() => openBanModal(item, 'unban')}
              disabled={processing === item.id}
              accessibilityRole="button"
              accessibilityLabel={t('unbanUserA11y', { name })}
              accessibilityState={{ disabled: processing === item.id }}
            >
              {processing === item.id ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#FFFFFF" />
                  <ThemedText variant="caption" color="inverse">{t('unbanUser')}</ThemedText>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.banButton}
              onPress={() => openBanModal(item, 'ban')}
              disabled={processing === item.id}
              accessibilityRole="button"
              accessibilityLabel={t('banUserA11y', { name })}
              accessibilityState={{ disabled: processing === item.id }}
            >
              {processing === item.id ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="ban-outline" size={16} color="#FFFFFF" />
                  <ThemedText variant="caption" color="inverse">{t('banUser')}</ThemedText>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }, [styles, t, colors, openBanModal, assignableRoles, openAssignModal, processing])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={styles.content}>
        <ThemedText variant="h1" title={true} style={styles.pageTitle}>{t('usersTitle')}</ThemedText>

        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('searchUsersPlaceholder')}
          placeholderTextColor={colors.placeholderText}
          maxFontSizeMultiplier={1.5}
          accessibilityLabel={t('searchUsersA11y')}
        />

        {searching ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : !hasSearched ? (
          <EmptyState
            icon="search-outline"
            title={t('searchPrompt')}
            subtitle={t('searchPromptSubtitle')}
            style={styles.emptyContainer}
          />
        ) : users.length === 0 ? (
          <EmptyState
            icon="person-outline"
            title={t('noSearchResults')}
            subtitle={t('noSearchResultsSubtitle')}
            style={styles.emptyContainer}
          />
        ) : (
          <FlatList
            data={users}
            keyExtractor={(item) => item.id}
            renderItem={renderUser}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

      <ModerationHistoryModal
        visible={historyVisible}
        onClose={() => { setHistoryVisible(false); setHistoryUser(null) }}
        userId={historyUser?.id}
        user={historyUser}
      />

      <BottomDrawerModal
        visible={assignModalVisible}
        onClose={() => { setAssignModalVisible(false); resetAssignForm() }}
        title={assignTarget ? `${t('assignRoleUser')} — ${assignTarget.displayName}` : t('assignRoleUser')}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
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

          <TextInput
            style={styles.reasonInput}
            value={assignReason}
            onChangeText={setAssignReason}
            placeholder={t('reasonPlaceholder')}
            placeholderTextColor={colors.placeholderText}
            maxFontSizeMultiplier={1.5}
          />

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
        <ScrollView contentContainerStyle={styles.categoryList}>
          {assignableRoles.map(r => {
            const selected = selectedRole === r
            return (
              <TouchableOpacity
                key={r}
                style={[styles.categoryRow, selected && styles.categoryRowSelected]}
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
        <ScrollView contentContainerStyle={styles.categoryList}>
          {assignableCategories.map(c => {
            const selected = selectedCategory === c.id
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.categoryRow, selected && styles.categoryRowSelected]}
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

      <BottomDrawerModal
        visible={banModalVisible}
        onClose={() => { setBanModalVisible(false); setBanTarget(null); setBanReason('') }}
        title={banAction === 'ban' ? t('banConfirm') : t('unbanConfirm')}
        shrink

      >
        <View style={styles.modalContent}>
          <ThemedText variant="body" color="dark">
            {banAction === 'ban'
              ? t('banMessage', { name: banTarget?.displayName || banTarget?.username })
              : t('unbanMessage', { name: banTarget?.displayName || banTarget?.username })}
          </ThemedText>
          <ThemedText variant="label" color="secondary" style={styles.fieldLabel}>{t('banReasonLabel')}</ThemedText>
          <TextInput
            style={styles.reasonInput}
            value={banReason}
            onChangeText={setBanReason}
            placeholder={t('banReasonPlaceholder')}
            placeholderTextColor={colors.placeholderText}
            multiline
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('banReasonLabel')}
          />
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: banAction === 'ban' ? SemanticColors.warning : SemanticColors.success }]}
            onPress={handleBanSubmit}
            disabled={!banReason.trim() || processing === banTarget?.id}
            accessibilityRole="button"
            accessibilityState={{ disabled: !banReason.trim() || processing === banTarget?.id }}
          >
            {processing === banTarget?.id ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <ThemedText variant="button" color="inverse">
                {banAction === 'ban' ? t('banUser') : t('unbanUser')}
              </ThemedText>
            )}
          </TouchableOpacity>
        </View>
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
  searchInput: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
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
  listContent: {
    paddingBottom: 20,
    gap: 12,
  },
  userCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userText: {
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.buttonDefault,
    flex: 1,
    justifyContent: 'center',
  },
  banButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 25,
    backgroundColor: SemanticColors.warning,
    flex: 1,
    justifyContent: 'center',
  },
  unbanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 25,
    backgroundColor: SemanticColors.success,
    flex: 1,
    justifyContent: 'center',
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.buttonDefault,
    flex: 1,
    justifyContent: 'center',
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
  categoryList: {
    padding: 16,
    paddingBottom: 40,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  categoryRowSelected: {
    backgroundColor: colors.primaryLight + '20',
  },
  reasonInput: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    minHeight: 60,
    maxHeight: 120,
  },
  submitButton: {
    backgroundColor: colors.primarySurface,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 8,
  },
})
