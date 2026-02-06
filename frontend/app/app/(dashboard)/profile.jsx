import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Pressable, Image, TextInput, Alert, Platform } from 'react-native'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { Colors } from '../../constants/Colors'
import { SharedStyles } from '../../constants/SharedStyles'
import api from '../../lib/api'
import { useUser } from '../../hooks/useUser'

import ThemedText from "../../components/ThemedText"
import ThemedButton from '../../components/ThemedButton'
import Header from '../../components/Header'
import ImageCropModal from '../../components/ImageCropModal'
import Avatar from '../../components/Avatar'
import LoadingView from '../../components/LoadingView'
import LocationPicker from '../../components/LocationPicker'
import { getAvatarImageUrl } from '../../lib/avatarUtils'

const AGE_RANGE_OPTIONS = [
  { value: null, label: 'Prefer not to say' },
  { value: '18-24', label: '18-24' },
  { value: '25-34', label: '25-34' },
  { value: '35-44', label: '35-44' },
  { value: '45-54', label: '45-54' },
  { value: '55-64', label: '55-64' },
  { value: '65+', label: '65+' },
]

const INCOME_RANGE_OPTIONS = [
  { value: null, label: 'Prefer not to say' },
  { value: 'under_25k', label: 'Under $25,000' },
  { value: '25k-50k', label: '$25,000 - $50,000' },
  { value: '50k-75k', label: '$50,000 - $75,000' },
  { value: '75k-100k', label: '$75,000 - $100,000' },
  { value: '100k-150k', label: '$100,000 - $150,000' },
  { value: '150k-200k', label: '$150,000 - $200,000' },
  { value: 'over_200k', label: 'Over $200,000' },
]

const POLITICAL_LEAN_OPTIONS = [
  { value: null, label: 'Prefer not to say' },
  { value: 'very_liberal', label: 'Very Liberal' },
  { value: 'liberal', label: 'Liberal' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'conservative', label: 'Conservative' },
  { value: 'very_conservative', label: 'Very Conservative' },
]

const EDUCATION_OPTIONS = [
  { value: null, label: 'Prefer not to say' },
  { value: 'less_than_high_school', label: 'Less than High School' },
  { value: 'high_school', label: 'High School' },
  { value: 'some_college', label: 'Some College' },
  { value: 'associates', label: 'Associate\'s Degree' },
  { value: 'bachelors', label: 'Bachelor\'s Degree' },
  { value: 'masters', label: 'Master\'s Degree' },
  { value: 'doctorate', label: 'Doctorate' },
  { value: 'professional', label: 'Professional Degree' },
]

const GEO_LOCALE_OPTIONS = [
  { value: null, label: 'Prefer not to say' },
  { value: 'urban', label: 'Urban' },
  { value: 'suburban', label: 'Suburban' },
  { value: 'rural', label: 'Rural' },
]

const RACE_OPTIONS = [
  { value: null, label: 'Prefer not to say' },
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black or African American' },
  { value: 'hispanic', label: 'Hispanic or Latino' },
  { value: 'asian', label: 'Asian' },
  { value: 'native_american', label: 'Native American' },
  { value: 'pacific_islander', label: 'Pacific Islander' },
  { value: 'multiracial', label: 'Multiracial' },
  { value: 'other', label: 'Other' },
]

const SEX_OPTIONS = [
  { value: null, label: 'Prefer not to say' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
]

export default function Profile() {
  const { logout, user, refreshUser } = useUser()
  const router = useRouter()
  const { returnTo } = useLocalSearchParams()

  const handleBack = () => {
    if (returnTo) {
      router.navigate(returnTo)
    } else {
      router.back()
    }
  }

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  // Profile state
  const [profile, setProfile] = useState(null)
  const [demographics, setDemographics] = useState(null)
  const [locations, setLocations] = useState([])

  // Edit state
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [ageRange, setAgeRange] = useState(null)
  const [incomeRange, setIncomeRange] = useState(null)
  const [lean, setLean] = useState(null)
  const [education, setEducation] = useState(null)
  const [geoLocale, setGeoLocale] = useState(null)
  const [race, setRace] = useState(null)
  const [sex, setSex] = useState(null)

  // Auto-save debounce timer
  const saveTimeoutRef = useRef(null)
  const isInitialLoadRef = useRef(true)

  // Track unsaved changes to profile fields (display name, email)
  const [hasProfileChanges, setHasProfileChanges] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)

  // Location picker state
  const [allLocations, setAllLocations] = useState([])
  const [locationPickerOpen, setLocationPickerOpen] = useState(false)
  const [savingLocation, setSavingLocation] = useState(false)

  // Modal state
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const [pickerModalOpen, setPickerModalOpen] = useState(false)
  const [pickerModalConfig, setPickerModalConfig] = useState(null)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState(null)
  const [changingPassword, setChangingPassword] = useState(false)

  // Delete account state
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState(null)
  const [deletingAccount, setDeletingAccount] = useState(false)

  // Avatar upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  // Image crop modal state
  const [imageToCrop, setImageToCrop] = useState(null)
  const [cropModalVisible, setCropModalVisible] = useState(false)
  const [croppedImagePreview, setCroppedImagePreview] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [profileData, demographicsData, locationsData, allLocationsData] = await Promise.all([
        api.users.getProfile(),
        api.users.getDemographics().catch(() => null),
        api.users.getLocations().catch(() => []),
        api.users.getAllLocations().catch(() => []),
      ])

      setProfile(profileData)
      setDemographics(demographicsData)
      setLocations(locationsData || [])
      setAllLocations(allLocationsData || [])

      // Initialize edit state
      setDisplayName(profileData?.displayName || '')
      setEmail(profileData?.email || '')
      setAvatarUrl(profileData?.avatarUrl || null)

      if (demographicsData) {
        setAgeRange(demographicsData.ageRange || null)
        setIncomeRange(demographicsData.incomeRange || null)
        setLean(demographicsData.lean || null)
        setEducation(demographicsData.education || null)
        setGeoLocale(demographicsData.geoLocale || null)
        setRace(demographicsData.race || null)
        setSex(demographicsData.sex || null)
      }

      // Mark initial load complete after a short delay to prevent auto-save on load
      setTimeout(() => {
        isInitialLoadRef.current = false
      }, 100)
    } catch (err) {
      console.error('Failed to fetch profile:', err)
      setError(err.message || 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useFocusEffect(
    useCallback(() => {
      fetchData()
    }, [fetchData])
  )

  // Handler for profile field changes (display name, email) - no auto-save
  const handleProfileFieldChange = (setter) => (value) => {
    setter(value)
    if (!isInitialLoadRef.current) {
      setHasProfileChanges(true)
    }
  }

  // Save profile fields (display name, email)
  const handleSaveProfile = async () => {
    try {
      setSavingProfile(true)
      setError(null)

      const profileUpdates = {}
      if (displayName !== profile?.displayName) profileUpdates.displayName = displayName
      if (email !== profile?.email) profileUpdates.email = email

      if (Object.keys(profileUpdates).length > 0) {
        await api.users.updateProfile(profileUpdates)
        // Update local profile state
        setProfile(prev => ({ ...prev, ...profileUpdates }))
        await refreshUser()
      }

      setHasProfileChanges(false)
    } catch (err) {
      console.error('Failed to save profile:', err)
      setError(err.message || 'Failed to save profile')
      setTimeout(() => setError(null), 3000)
    } finally {
      setSavingProfile(false)
    }
  }

  // Auto-save function for demographics (called after debounce)
  const performAutoSave = useCallback(async (updates) => {
    if (isInitialLoadRef.current) return

    try {
      setSaving(true)
      setError(null)

      // Update demographics
      await api.users.updateDemographics({
        ageRange: updates.ageRange ?? ageRange,
        incomeRange: updates.incomeRange ?? incomeRange,
        lean: updates.lean ?? lean,
        education: updates.education ?? education,
        geoLocale: updates.geoLocale ?? geoLocale,
        race: updates.race ?? race,
        sex: updates.sex ?? sex,
      })

      // Refresh user context to update header/sidebar
      await refreshUser()
    } catch (err) {
      console.error('Failed to auto-save demographics:', err)
      setError(err.message || 'Failed to save changes')
      setTimeout(() => setError(null), 3000)
    } finally {
      setSaving(false)
    }
  }, [ageRange, incomeRange, lean, education, geoLocale, race, sex, refreshUser])

  // Handle location selection
  const handleSetLocation = async (locationId) => {
    try {
      setSavingLocation(true)
      setError(null)
      const updatedLocations = await api.users.setLocation(locationId)
      setLocations(updatedLocations || [])
      setLocationPickerOpen(false)
    } catch (err) {
      console.error('Failed to set location:', err)
      setError(err.message || 'Failed to update location')
      setTimeout(() => setError(null), 3000)
    } finally {
      setSavingLocation(false)
    }
  }

  // Debounced field change handler
  const handleFieldChange = (setter, fieldName) => (value) => {
    setter(value)

    // Skip auto-save during initial load
    if (isInitialLoadRef.current) return

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Set new timeout for auto-save (500ms debounce)
    saveTimeoutRef.current = setTimeout(() => {
      performAutoSave({ [fieldName]: value })
    }, 500)
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  const openPickerModal = (title, options, currentValue, onSelect) => {
    setPickerModalConfig({ title, options, currentValue, onSelect })
    setPickerModalOpen(true)
  }

  const getOptionLabel = (options, value) => {
    const option = options.find(o => o.value === value)
    return option ? option.label : 'Not set'
  }

  const handlePickImage = async () => {
    setUploadError(null)

    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'We need access to your photo library to upload an avatar.')
      return
    }

    // Launch image picker - don't use native editing, we'll use our custom crop modal
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    })

    if (result.canceled || !result.assets?.[0]) {
      return
    }

    // Open crop modal with the selected image
    setImageToCrop(result.assets[0].uri)
    setCropModalVisible(true)
    setAvatarModalOpen(false)
  }

  const handleCropConfirm = (croppedBase64) => {
    setCropModalVisible(false)
    setImageToCrop(null)
    // Show preview in avatar modal instead of uploading immediately
    setCroppedImagePreview(croppedBase64)
    setAvatarModalOpen(true)
  }

  const handleCropCancel = () => {
    setCropModalVisible(false)
    setImageToCrop(null)
  }

  const handleAcceptAvatar = async () => {
    if (!croppedImagePreview) return

    try {
      setUploadingAvatar(true)
      const response = await api.users.uploadAvatar(croppedImagePreview)

      // Update local state with the new avatar URL (already saved by upload API)
      setAvatarUrl(response.avatarUrl)
      setCroppedImagePreview(null)
      setAvatarModalOpen(false)

      // Refresh user context to update header/sidebar
      await refreshUser()
    } catch (err) {
      console.error('Failed to upload avatar:', err)
      setUploadError(err.message || 'Failed to upload avatar')
      Alert.alert('Upload Failed', err.message || 'Failed to upload avatar. Please try again.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleCancelPreview = () => {
    setCroppedImagePreview(null)
    setAvatarModalOpen(false)
  }

  const handleRemoveAvatar = async () => {
    try {
      setSaving(true)
      await api.users.updateProfile({ avatarUrl: null })
      setAvatarUrl(null)
      setAvatarModalOpen(false)
      await refreshUser()
    } catch (err) {
      console.error('Failed to remove avatar:', err)
      setError(err.message || 'Failed to remove avatar')
      setTimeout(() => setError(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    setPasswordError(null)

    if (!currentPassword) {
      setPasswordError('Current password is required')
      return
    }
    if (!newPassword) {
      setPasswordError('New password is required')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }

    try {
      setChangingPassword(true)
      await api.users.changePassword(currentPassword, newPassword)
      setPasswordModalOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccessMessage('Password changed successfully')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteError(null)

    if (!deletePassword) {
      setDeleteError('Password is required')
      return
    }

    try {
      setDeletingAccount(true)
      await api.users.deleteAccount(deletePassword)
      setDeleteModalOpen(false)
      await logout()
      router.replace('/')
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete account')
    } finally {
      setDeletingAccount(false)
    }
  }

  const formatJoinDate = (dateStr) => {
    if (!dateStr) return 'Unknown'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onBack={handleBack} />
        <LoadingView message="Loading profile..." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={handleBack} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageHeader}>
          <ThemedText title={true} style={styles.pageTitle}>
            Profile
          </ThemedText>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color={Colors.warning} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {successMessage && (
          <View style={styles.successContainer}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        )}

        {/* Avatar Section */}
        <View style={styles.section}>
          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={() => setAvatarModalOpen(true)}
            >
              <Avatar user={{ ...profile, displayName, avatarUrl }} size={100} showKudosBadge={false} />
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={16} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>Tap to change avatar</Text>
          </View>
        </View>

        {/* Basic Info Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={22} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Basic Information</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Display Name</Text>
            <TextInput
              style={styles.textInput}
              value={displayName}
              onChangeText={handleProfileFieldChange(setDisplayName)}
              placeholder="Your display name"
              placeholderTextColor={Colors.pass}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.textInput}
              value={email}
              onChangeText={handleProfileFieldChange(setEmail)}
              placeholder="your@email.com"
              placeholderTextColor={Colors.pass}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {hasProfileChanges && (
            <TouchableOpacity
              style={[styles.saveProfileButton, savingProfile && styles.buttonDisabled]}
              onPress={handleSaveProfile}
              disabled={savingProfile}
            >
              {savingProfile ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveProfileButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Username</Text>
            <Text style={styles.readOnlyValue}>@{profile?.username}</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Member Since</Text>
            <Text style={styles.readOnlyValue}>{formatJoinDate(profile?.joinTime)}</Text>
          </View>
        </View>

        {/* Demographics Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="stats-chart-outline" size={22} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Demographics</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Optional information used for aggregate statistics. All data is anonymized.
          </Text>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal('Age Range', AGE_RANGE_OPTIONS, ageRange, handleFieldChange(setAgeRange, 'ageRange'))}
          >
            <Text style={styles.pickerLabel}>Age Range</Text>
            <View style={styles.pickerValue}>
              <Text style={styles.pickerValueText}>{getOptionLabel(AGE_RANGE_OPTIONS, ageRange)}</Text>
              <Ionicons name="chevron-down" size={16} color={Colors.pass} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal('Income Range', INCOME_RANGE_OPTIONS, incomeRange, handleFieldChange(setIncomeRange, 'incomeRange'))}
          >
            <Text style={styles.pickerLabel}>Income Range</Text>
            <View style={styles.pickerValue}>
              <Text style={styles.pickerValueText}>{getOptionLabel(INCOME_RANGE_OPTIONS, incomeRange)}</Text>
              <Ionicons name="chevron-down" size={16} color={Colors.pass} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal('Political Lean', POLITICAL_LEAN_OPTIONS, lean, handleFieldChange(setLean, 'lean'))}
          >
            <Text style={styles.pickerLabel}>Political Lean</Text>
            <View style={styles.pickerValue}>
              <Text style={styles.pickerValueText}>{getOptionLabel(POLITICAL_LEAN_OPTIONS, lean)}</Text>
              <Ionicons name="chevron-down" size={16} color={Colors.pass} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal('Education', EDUCATION_OPTIONS, education, handleFieldChange(setEducation, 'education'))}
          >
            <Text style={styles.pickerLabel}>Education</Text>
            <View style={styles.pickerValue}>
              <Text style={styles.pickerValueText}>{getOptionLabel(EDUCATION_OPTIONS, education)}</Text>
              <Ionicons name="chevron-down" size={16} color={Colors.pass} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal('Geographic Locale', GEO_LOCALE_OPTIONS, geoLocale, handleFieldChange(setGeoLocale, 'geoLocale'))}
          >
            <Text style={styles.pickerLabel}>Geographic Locale</Text>
            <View style={styles.pickerValue}>
              <Text style={styles.pickerValueText}>{getOptionLabel(GEO_LOCALE_OPTIONS, geoLocale)}</Text>
              <Ionicons name="chevron-down" size={16} color={Colors.pass} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => openPickerModal('Race/Ethnicity', RACE_OPTIONS, race, handleFieldChange(setRace, 'race'))}
          >
            <Text style={styles.pickerLabel}>Race/Ethnicity</Text>
            <View style={styles.pickerValue}>
              <Text style={styles.pickerValueText}>{getOptionLabel(RACE_OPTIONS, race)}</Text>
              <Ionicons name="chevron-down" size={16} color={Colors.pass} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pickerItem, styles.pickerItemLast]}
            onPress={() => openPickerModal('Sex', SEX_OPTIONS, sex, handleFieldChange(setSex, 'sex'))}
          >
            <Text style={styles.pickerLabel}>Sex</Text>
            <View style={styles.pickerValue}>
              <Text style={styles.pickerValueText}>{getOptionLabel(SEX_OPTIONS, sex)}</Text>
              <Ionicons name="chevron-down" size={16} color={Colors.pass} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Location Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="location-outline" size={22} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Location</Text>
          </View>
          <TouchableOpacity
            style={styles.locationSelector}
            onPress={() => setLocationPickerOpen(true)}
          >
            {locations.length > 0 ? (
              <Text style={styles.locationBreadcrumb} numberOfLines={2}>
                {locations.map(loc => loc.name).join(' \u203A ')}
              </Text>
            ) : (
              <Text style={styles.locationPlaceholder}>Tap to set your location</Text>
            )}
            <Ionicons name="chevron-forward" size={18} color={Colors.pass} />
          </TouchableOpacity>
        </View>

        {/* Auto-save indicator */}
        {saving && (
          <View style={styles.savingIndicator}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.savingText}>Saving...</Text>
          </View>
        )}

        {/* Account Security Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-outline" size={22} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Account Security</Text>
          </View>

          <TouchableOpacity
            style={styles.securityButton}
            onPress={() => setPasswordModalOpen(true)}
          >
            <Ionicons name="key-outline" size={20} color={Colors.primary} />
            <Text style={styles.securityButtonText}>Change Password</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.pass} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={logout}
          >
            <Ionicons name="log-out-outline" size={20} color={Colors.primary} />
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={[styles.section, styles.dangerSection]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="warning-outline" size={22} color={Colors.warning} />
            <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>
          </View>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => setDeleteModalOpen(true)}
          >
            <Ionicons name="trash-outline" size={20} color={Colors.warning} />
            <Text style={styles.deleteButtonText}>Delete Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Avatar Selection Modal */}
      <Modal
        visible={avatarModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setCroppedImagePreview(null)
          setAvatarModalOpen(false)
        }}
      >
        <Pressable style={SharedStyles.modalOverlay} onPress={() => {
          setCroppedImagePreview(null)
          setAvatarModalOpen(false)
        }}>
          <Pressable style={styles.avatarModalContent} onPress={(e) => e.stopPropagation()}>
            {croppedImagePreview ? (
              <>
                <Text style={styles.modalTitle}>Preview Avatar</Text>

                {/* Preview Image */}
                <View style={styles.previewContainer}>
                  <Image
                    source={{ uri: croppedImagePreview }}
                    style={styles.previewImage}
                  />
                </View>

                {/* Accept/Cancel Buttons */}
                <View style={styles.previewButtons}>
                  <TouchableOpacity
                    style={styles.previewCancelButton}
                    onPress={handleCancelPreview}
                    disabled={uploadingAvatar}
                  >
                    <Text style={styles.previewCancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.previewAcceptButton, uploadingAvatar && styles.buttonDisabled]}
                    onPress={handleAcceptAvatar}
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.previewAcceptButtonText}>Accept</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Choose Avatar</Text>

                {/* Upload Photo Button */}
                <TouchableOpacity
                  style={styles.uploadPhotoButton}
                  onPress={handlePickImage}
                  disabled={uploadingAvatar}
                >
                  {uploadingAvatar ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="camera-outline" size={20} color="#fff" />
                      <Text style={styles.uploadPhotoButtonText}>Upload Photo</Text>
                    </>
                  )}
                </TouchableOpacity>

                {avatarUrl && (
                  <TouchableOpacity
                    style={styles.removeAvatarButton}
                    onPress={handleRemoveAvatar}
                    disabled={saving}
                  >
                    <Ionicons name="trash-outline" size={20} color={Colors.warning} />
                    <Text style={styles.removeAvatarButtonText}>Remove Photo</Text>
                  </TouchableOpacity>
                )}

                <Text style={styles.avatarInfoText}>
                  Upload a square photo (max 5MB). Images are resized to 256x256.
                </Text>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Picker Modal */}
      <Modal
        visible={pickerModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPickerModalOpen(false)}
      >
        <Pressable style={SharedStyles.modalOverlay} onPress={() => setPickerModalOpen(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{pickerModalConfig?.title}</Text>
            <ScrollView style={styles.modalScrollView}>
              {pickerModalConfig?.options.map((option, index) => {
                const isSelected = pickerModalConfig.currentValue === option.value

                return (
                  <TouchableOpacity
                    key={option.value ?? 'null'}
                    style={[
                      styles.modalItem,
                      isSelected && styles.modalItemSelected,
                      index === pickerModalConfig.options.length - 1 && styles.modalItemLast,
                    ]}
                    onPress={() => {
                      pickerModalConfig.onSelect(option.value)
                      setPickerModalOpen(false)
                    }}
                  >
                    <Text style={[
                      styles.modalItemLabel,
                      isSelected && styles.modalItemLabelSelected
                    ]}>
                      {option.label}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        visible={passwordModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPasswordModalOpen(false)}
      >
        <Pressable style={SharedStyles.modalOverlay} onPress={() => setPasswordModalOpen(false)}>
          <View style={styles.formModalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>

            {passwordError && (
              <View style={styles.modalError}>
                <Text style={styles.modalErrorText}>{passwordError}</Text>
              </View>
            )}

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Current Password</Text>
              <TextInput
                style={styles.modalInput}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                placeholder="Enter current password"
                placeholderTextColor={Colors.pass}
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>New Password</Text>
              <TextInput
                style={styles.modalInput}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="Enter new password (min 8 chars)"
                placeholderTextColor={Colors.pass}
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Confirm New Password</Text>
              <TextInput
                style={styles.modalInput}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="Confirm new password"
                placeholderTextColor={Colors.pass}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setPasswordModalOpen(false)
                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                  setPasswordError(null)
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmButton, changingPassword && styles.modalButtonDisabled]}
                onPress={handleChangePassword}
                disabled={changingPassword}
              >
                {changingPassword ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmButtonText}>Change Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Delete Account Modal */}
      <Modal
        visible={deleteModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteModalOpen(false)}
      >
        <Pressable style={SharedStyles.modalOverlay} onPress={() => setDeleteModalOpen(false)}>
          <View style={styles.formModalContent}>
            <Text style={[styles.modalTitle, styles.dangerTitle]}>Delete Account</Text>

            <View style={styles.deleteWarning}>
              <Ionicons name="warning" size={24} color={Colors.warning} />
              <Text style={styles.deleteWarningText}>
                This action cannot be undone. Your account will be permanently deleted.
              </Text>
            </View>

            {deleteError && (
              <View style={styles.modalError}>
                <Text style={styles.modalErrorText}>{deleteError}</Text>
              </View>
            )}

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Enter your password to confirm</Text>
              <TextInput
                style={styles.modalInput}
                value={deletePassword}
                onChangeText={setDeletePassword}
                secureTextEntry
                placeholder="Password"
                placeholderTextColor={Colors.pass}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setDeleteModalOpen(false)
                  setDeletePassword('')
                  setDeleteError(null)
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDeleteButton, deletingAccount && styles.modalButtonDisabled]}
                onPress={handleDeleteAccount}
                disabled={deletingAccount}
              >
                {deletingAccount ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalDeleteButtonText}>Delete Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Location Picker Modal */}
      <LocationPicker
        visible={locationPickerOpen}
        onClose={() => setLocationPickerOpen(false)}
        allLocations={allLocations}
        currentLocationId={locations.length > 0 ? locations[locations.length - 1].id : null}
        onSelect={handleSetLocation}
        saving={savingLocation}
      />

      {/* Image Crop Modal */}
      <ImageCropModal
        visible={cropModalVisible}
        imageUri={imageToCrop}
        onCancel={handleCropCancel}
        onConfirm={handleCropConfirm}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },
  pageHeader: {
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffe6e6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: Colors.warning,
    fontSize: 14,
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6ffe6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  successText: {
    flex: 1,
    color: Colors.success,
    fontSize: 14,
  },
  section: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.darkText,
  },
  sectionDescription: {
    fontSize: 14,
    color: Colors.pass,
    lineHeight: 20,
    marginBottom: 16,
  },
  // Avatar styles
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  avatarHint: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.pass,
  },
  // Input styles
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.darkText,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  readOnlyValue: {
    fontSize: 16,
    color: Colors.pass,
    paddingVertical: 12,
  },
  // Picker styles
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  pickerItemLast: {
    borderBottomWidth: 0,
  },
  pickerLabel: {
    fontSize: 15,
    color: Colors.darkText,
  },
  pickerValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pickerValueText: {
    fontSize: 15,
    color: Colors.pass,
  },
  // Location styles
  locationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 8,
  },
  locationBreadcrumb: {
    flex: 1,
    fontSize: 15,
    color: Colors.primary,
  },
  locationPlaceholder: {
    flex: 1,
    fontSize: 15,
    color: Colors.pass,
    fontStyle: 'italic',
  },
  // Auto-save indicator
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 16,
    gap: 8,
  },
  savingText: {
    fontSize: 14,
    color: Colors.pass,
  },
  // Save profile button
  saveProfileButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  saveProfileButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  // Security buttons
  securityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  securityButtonText: {
    flex: 1,
    fontSize: 16,
    color: Colors.darkText,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  logoutButtonText: {
    flex: 1,
    fontSize: 16,
    color: Colors.primary,
    fontWeight: '500',
  },
  // Danger zone
  dangerSection: {
    borderColor: Colors.warning + '40',
  },
  dangerTitle: {
    color: Colors.warning,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  deleteButtonText: {
    fontSize: 16,
    color: Colors.warning,
    fontWeight: '500',
  },
  // Modal styles
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    width: '100%',
    maxWidth: 340,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  avatarModalContent: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  formModalContent: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    width: '100%',
    maxWidth: 360,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.darkText,
    padding: 16,
    textAlign: 'center',
  },
  modalScrollView: {
    maxHeight: 350,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  modalItemSelected: {
    backgroundColor: Colors.primaryLight + '40',
  },
  modalItemLast: {
    borderBottomWidth: 0,
  },
  modalItemLabel: {
    fontSize: 16,
    color: Colors.darkText,
  },
  modalItemLabelSelected: {
    color: Colors.primary,
    fontWeight: '500',
  },
  // Avatar modal
  uploadPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 8,
    gap: 8,
  },
  uploadPhotoButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  removeAvatarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  removeAvatarButtonText: {
    color: Colors.warning,
    fontSize: 16,
    fontWeight: '500',
  },
  avatarInfoText: {
    textAlign: 'center',
    color: Colors.pass,
    fontSize: 13,
    marginTop: 16,
    marginBottom: 8,
    marginHorizontal: 16,
    lineHeight: 18,
  },
  // Avatar preview styles
  previewContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  previewImage: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: Colors.light.background,
  },
  previewButtons: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  previewCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  previewCancelButtonText: {
    fontSize: 16,
    color: '#666',
  },
  previewAcceptButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  previewAcceptButtonText: {
    fontSize: 16,
    color: Colors.white,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  // Form modal styles
  modalInputGroup: {
    marginBottom: 16,
  },
  modalInputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.darkText,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  modalError: {
    backgroundColor: '#ffe6e6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  modalErrorText: {
    color: Colors.warning,
    fontSize: 14,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 16,
    color: '#666',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  modalConfirmButtonText: {
    fontSize: 16,
    color: Colors.white,
    fontWeight: '600',
  },
  modalDeleteButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Colors.warning,
    alignItems: 'center',
  },
  modalDeleteButtonText: {
    fontSize: 16,
    color: Colors.white,
    fontWeight: '600',
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
  deleteWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 10,
  },
  deleteWarningText: {
    flex: 1,
    fontSize: 14,
    color: '#b35900',
    lineHeight: 20,
  },
})
