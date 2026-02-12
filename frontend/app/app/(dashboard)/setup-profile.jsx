import { StyleSheet, View, TouchableOpacity, ActivityIndicator, Image, Alert, Platform, KeyboardAvoidingView, ScrollView } from 'react-native'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useTranslation } from 'react-i18next'
import { SemanticColors } from '../../constants/Colors'
import { Typography } from '../../constants/Theme'
import { useThemeColors } from '../../hooks/useThemeColors'
import api, { translateError } from '../../lib/api'
import { useUser } from '../../hooks/useUser'

import ThemedText from '../../components/ThemedText'
import ThemedTextInput from '../../components/ThemedTextInput'
import ThemedButton from '../../components/ThemedButton'
import Spacer from '../../components/Spacer'
import Avatar from '../../components/Avatar'
import ImageCropModal from '../../components/ImageCropModal'
import LocationPicker from '../../components/LocationPicker'

export default function SetupProfile() {
  const { user, refreshUser, clearNewUser } = useUser()
  const router = useRouter()

  const { t } = useTranslation('auth')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Location state
  const [allLocations, setAllLocations] = useState([])
  const [userLocations, setUserLocations] = useState([])
  const [locationPickerOpen, setLocationPickerOpen] = useState(false)
  const [savingLocation, setSavingLocation] = useState(false)

  // Image crop state
  const [imageToCrop, setImageToCrop] = useState(null)
  const [cropModalVisible, setCropModalVisible] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Fetch available locations on mount
  useEffect(() => {
    api.users.getAllLocations().then(setAllLocations).catch(() => {})
  }, [])

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(t('permissionRequired'), t('photoLibraryPermission'))
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    })

    if (result.canceled || !result.assets?.[0]) return

    setImageToCrop(result.assets[0].uri)
    setCropModalVisible(true)
  }

  const handleCropConfirm = async (croppedBase64) => {
    setCropModalVisible(false)
    setImageToCrop(null)

    try {
      setUploadingAvatar(true)
      const response = await api.users.uploadAvatar(croppedBase64)
      setAvatarUrl(response.avatarUrl)
    } catch (err) {
      Alert.alert(t('uploadFailed'), translateError(err.message, t) || t('uploadFailedMessage'))
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleCropCancel = () => {
    setCropModalVisible(false)
    setImageToCrop(null)
  }

  const handleSetLocation = async (locationId) => {
    try {
      setSavingLocation(true)
      const updatedLocations = await api.users.setLocation(locationId)
      setUserLocations(updatedLocations || [])
      setLocationPickerOpen(false)
    } catch (err) {
      setError(translateError(err.message, t) || t('locationFailed'))
    } finally {
      setSavingLocation(false)
    }
  }

  const handleContinue = async () => {
    try {
      setSaving(true)
      setError(null)

      if (userLocations.length === 0) {
        setError(t('locationRequired'))
        return
      }

      const trimmedName = displayName.trim()
      if (trimmedName) {
        await api.users.updateProfile({ displayName: trimmedName })
      }

      await refreshUser()
      clearNewUser()
      router.replace('/cards')
    } catch (err) {
      setError(translateError(err.message, t) || t('profileSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Spacer height={40} />
          <ThemedText variant="h1" title={true} style={styles.title}>
            {t('setupTitle')}
          </ThemedText>
          <ThemedText variant="body" style={styles.subtitle}>
            {t('setupSubtitle')}
          </ThemedText>

          <Spacer height={32} />

          {/* Avatar */}
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={handlePickImage}
            disabled={uploadingAvatar}
            accessibilityRole="button"
            accessibilityLabel={t('changeAvatarA11y')}
          >
            {uploadingAvatar ? (
              <View style={styles.avatarPlaceholder}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <Avatar
                user={{ ...user, displayName: displayName || user?.displayName, avatarUrl }}
                size={120}
                showKudosBadge={false}
              />
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={18} color="#fff" />
            </View>
          </TouchableOpacity>
          <ThemedText variant="bodySmall" color="secondary" style={styles.avatarHint}>{t('tapAddPhoto')}</ThemedText>

          <Spacer height={28} />

          {/* Display name */}
          <View style={styles.formContainer}>
            <ThemedText variant="bodySmall" color="secondary" style={styles.inputLabel}>{t('displayNameLabel')}</ThemedText>
            <ThemedTextInput
              style={styles.input}
              placeholder={t('displayNamePlaceholder')}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              returnKeyType="done"
            />
          </View>

          <Spacer height={20} />

          {/* Location */}
          <View style={styles.formContainer}>
            <ThemedText variant="bodySmall" color="secondary" style={styles.inputLabel}>{t('locationLabel')}</ThemedText>
            <TouchableOpacity
              style={styles.locationSelector}
              onPress={() => setLocationPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('selectLocationA11y')}
            >
              {userLocations.length > 0 ? (
                <ThemedText variant="button" color="primary" style={styles.locationText} numberOfLines={1}>
                  {userLocations.map(loc => loc.name).join(' \u203A ')}
                </ThemedText>
              ) : (
                <ThemedText variant="button" color="placeholder" style={styles.locationPlaceholder}>{t('locationPlaceholder')}</ThemedText>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>

          {error && (
            <View style={styles.errorContainer}>
              <ThemedText variant="bodySmall" style={styles.errorText}>{error}</ThemedText>
            </View>
          )}

          <Spacer height={24} />

          <View style={styles.buttonContainer}>
            <ThemedButton onPress={handleContinue} disabled={saving} style={styles.continueButton}>
              <ThemedText variant="button" color="inverse">
                {saving ? t('saving') : t('continue')}
              </ThemedText>
            </ThemedButton>
          </View>

          <Spacer height={40} />
        </ScrollView>
      </KeyboardAvoidingView>

      <ImageCropModal
        visible={cropModalVisible}
        imageUri={imageToCrop}
        onCancel={handleCropCancel}
        onConfirm={handleCropConfirm}
      />

      <LocationPicker
        visible={locationPickerOpen}
        onClose={() => setLocationPickerOpen(false)}
        allLocations={allLocations}
        currentLocationId={userLocations.length > 0 ? userLocations[userLocations.length - 1].id : null}
        onSelect={handleSetLocation}
        saving={savingLocation}
      />
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 20,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 280,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primarySurface,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.cardBackground,
  },
  avatarHint: {
    marginTop: 8,
  },
  formContainer: {
    width: '100%',
    maxWidth: 320,
  },
  inputLabel: {
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    ...Typography.button,
    fontWeight: undefined,
    backgroundColor: colors.cardBackground,
    color: colors.darkText,
  },
  locationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
  },
  locationText: {
    flex: 1,
    fontWeight: undefined,
  },
  locationPlaceholder: {
    flex: 1,
    fontWeight: undefined,
  },
  errorContainer: {
    marginTop: 12,
    width: '100%',
    maxWidth: 320,
  },
  errorText: {
    color: SemanticColors.warning,
    padding: 12,
    backgroundColor: colors.errorBannerBg,
    borderColor: SemanticColors.warning,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  continueButton: {
    width: '100%',
  },
})
