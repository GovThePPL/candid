import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Pressable, Image, TextInput, Alert } from 'react-native'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { SemanticColors } from '../../../constants/Colors'
import { createSharedStyles } from '../../../constants/SharedStyles'
import api from '../../../lib/api'
import { useUser } from '../../../hooks/useUser'
import { CacheManager, CacheKeys, CacheDurations } from '../../../lib/cache'

import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import ImageCropModal from '../../../components/ImageCropModal'
import Avatar from '../../../components/Avatar'
import LoadingView from '../../../components/LoadingView'

export default function ProfileSettings() {
  const { user, refreshUser } = useUser()
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const shared = useMemo(() => createSharedStyles(colors), [colors])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Profile state
  const [profile, setProfile] = useState(null)

  // Edit state
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null)

  // Track unsaved changes to profile fields (display name)
  const [hasProfileChanges, setHasProfileChanges] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)

  // Modal state
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)

  // Avatar upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  // Image crop modal state
  const [imageToCrop, setImageToCrop] = useState(null)
  const [cropModalVisible, setCropModalVisible] = useState(false)
  const [croppedImagePreview, setCroppedImagePreview] = useState(null)

  // Initial load ref
  const isInitialLoadRef = useRef(true)

  const applyProfileData = useCallback((profileData) => {
    setProfile(profileData)
    setDisplayName(profileData?.displayName || '')
    setAvatarUrl(profileData?.avatarUrl || null)
  }, [])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const profileCacheKey = CacheKeys.profile(user?.id)
      const cachedProfile = await CacheManager.get(profileCacheKey)
      const profileFresh = cachedProfile && !CacheManager.isStale(cachedProfile, CacheDurations.PROFILE)

      if (profileFresh) {
        applyProfileData(cachedProfile.data)
      } else {
        const profileData = await api.users.getProfile()
        if (profileData) {
          applyProfileData(profileData)
          await CacheManager.set(profileCacheKey, profileData)
        }
      }

      setTimeout(() => {
        isInitialLoadRef.current = false
      }, 100)
    } catch (err) {
      console.error('Failed to fetch profile:', err)
      setError(err.message || 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [user?.id, applyProfileData])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useFocusEffect(
    useCallback(() => {
      fetchData()
    }, [fetchData])
  )

  // Handler for profile field changes (display name) - no auto-save
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

      if (Object.keys(profileUpdates).length > 0) {
        await api.users.updateProfile(profileUpdates)
        setProfile(prev => ({ ...prev, ...profileUpdates }))
        await refreshUser()
        if (user?.id) await CacheManager.invalidate(CacheKeys.profile(user.id))
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

  const handlePickImage = async () => {
    setUploadError(null)

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'We need access to your photo library to upload an avatar.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    })

    if (result.canceled || !result.assets?.[0]) {
      return
    }

    setImageToCrop(result.assets[0].uri)
    setCropModalVisible(true)
    setAvatarModalOpen(false)
  }

  const handleCropConfirm = (croppedBase64) => {
    setCropModalVisible(false)
    setImageToCrop(null)
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

      setAvatarUrl(response.avatarUrl)
      setCroppedImagePreview(null)
      setAvatarModalOpen(false)

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

  const formatJoinDate = (dateStr) => {
    if (!dateStr) return 'Unknown'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onBack={() => router.back()} />
        <LoadingView message="Loading profile..." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageHeader}>
          <ThemedText variant="h1" title={true} style={styles.pageTitle}>
            Profile
          </ThemedText>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color={SemanticColors.warning} />
            <ThemedText variant="bodySmall" color="error" style={styles.errorText}>{error}</ThemedText>
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
            <ThemedText variant="bodySmall" color="secondary" style={styles.avatarHint}>{`Tap to change avatar`}</ThemedText>
          </View>
        </View>

        {/* Basic Info Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={22} color={colors.primary} />
            <ThemedText variant="h2" color="dark">Basic Information</ThemedText>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText variant="bodySmall" color="secondary" style={styles.inputLabel}>Display Name</ThemedText>
            <TextInput
              style={styles.textInput}
              value={displayName}
              onChangeText={handleProfileFieldChange(setDisplayName)}
              placeholder="Your display name"
              placeholderTextColor={colors.placeholderText}
              maxFontSizeMultiplier={1.5}
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
                <ThemedText variant="button" color="inverse">Save Changes</ThemedText>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.inputGroup}>
            <ThemedText variant="bodySmall" color="secondary" style={styles.inputLabel}>Username</ThemedText>
            <ThemedText variant="button" color="secondary" style={styles.readOnlyValue}>@{profile?.username}</ThemedText>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText variant="bodySmall" color="secondary" style={styles.inputLabel}>Member Since</ThemedText>
            <ThemedText variant="button" color="secondary" style={styles.readOnlyValue}>{formatJoinDate(profile?.joinTime)}</ThemedText>
          </View>
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
        <Pressable style={shared.modalOverlay} onPress={() => {
          setCroppedImagePreview(null)
          setAvatarModalOpen(false)
        }}>
          <Pressable style={styles.avatarModalContent} onPress={(e) => e.stopPropagation()}>
            {croppedImagePreview ? (
              <>
                <ThemedText variant="h2" color="dark" style={styles.modalTitle}>Preview Avatar</ThemedText>

                <View style={styles.previewContainer}>
                  <Image
                    source={{ uri: croppedImagePreview }}
                    style={styles.previewImage}
                  />
                </View>

                <View style={styles.previewButtons}>
                  <TouchableOpacity
                    style={styles.previewCancelButton}
                    onPress={handleCancelPreview}
                    disabled={uploadingAvatar}
                  >
                    <ThemedText variant="button" color="secondary">Cancel</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.previewAcceptButton, uploadingAvatar && styles.buttonDisabled]}
                    onPress={handleAcceptAvatar}
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <ThemedText variant="button" color="inverse">Accept</ThemedText>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <ThemedText variant="h2" color="dark" style={styles.modalTitle}>Choose Avatar</ThemedText>

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
                      <ThemedText variant="button" color="inverse">Upload Photo</ThemedText>
                    </>
                  )}
                </TouchableOpacity>

                {avatarUrl && (
                  <TouchableOpacity
                    style={styles.removeAvatarButton}
                    onPress={handleRemoveAvatar}
                    disabled={saving}
                  >
                    <Ionicons name="trash-outline" size={20} color={SemanticColors.warning} />
                    <ThemedText variant="button" color="error" style={styles.removeAvatarButtonText}>Remove Photo</ThemedText>
                  </TouchableOpacity>
                )}

                <ThemedText variant="caption" color="secondary" style={styles.avatarInfoText}>
                  Upload a square photo (max 5MB). Images are resized to 256x256.
                </ThemedText>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

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

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    color: colors.primary,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorBannerBg,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
  },
  section: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
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
    backgroundColor: colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.cardBackground,
  },
  avatarHint: {
    marginTop: 8,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontWeight: '500',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.darkText,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  readOnlyValue: {
    paddingVertical: 12,
  },
  saveProfileButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  // saveProfileButtonText removed - handled by ThemedText variant="button" color="inverse"
  buttonDisabled: {
    opacity: 0.6,
  },
  // Avatar modal styles
  avatarModalContent: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalTitle: {
    padding: 16,
    textAlign: 'center',
  },
  uploadPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 8,
    gap: 8,
  },
  // uploadPhotoButtonText removed - handled by ThemedText variant="button" color="inverse"
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
    borderColor: SemanticColors.warning,
  },
  removeAvatarButtonText: {
    fontWeight: '500',
  },
  avatarInfoText: {
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
    marginHorizontal: 16,
    lineHeight: 18,
  },
  previewContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  previewImage: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: colors.background,
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
    borderColor: colors.cardBorder,
    alignItems: 'center',
  },
  // previewCancelButtonText removed - handled by ThemedText variant="button" color="secondary"
  previewAcceptButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  // previewAcceptButtonText removed - handled by ThemedText variant="button" color="inverse"
})
