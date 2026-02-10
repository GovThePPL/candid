import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Image, Alert, Platform, KeyboardAvoidingView, ScrollView } from 'react-native'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { SemanticColors } from '../../constants/Colors'
import { useThemeColors } from '../../hooks/useThemeColors'
import api from '../../lib/api'
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
      Alert.alert('Permission Required', 'We need access to your photo library to upload an avatar.')
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
      Alert.alert('Upload Failed', err.message || 'Failed to upload avatar.')
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
      setError(err.message || 'Failed to set location')
    } finally {
      setSavingLocation(false)
    }
  }

  const handleContinue = async () => {
    try {
      setSaving(true)
      setError(null)

      const trimmedName = displayName.trim()
      if (trimmedName) {
        await api.users.updateProfile({ displayName: trimmedName })
      }

      await refreshUser()
      clearNewUser()
      router.replace('/cards')
    } catch (err) {
      setError(err.message || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = () => {
    clearNewUser()
    router.replace('/cards')
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
          <ThemedText title={true} style={styles.title}>
            Welcome to Candid!
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Set up your profile so others can recognize you
          </ThemedText>

          <Spacer height={32} />

          {/* Avatar */}
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={handlePickImage}
            disabled={uploadingAvatar}
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
          <Text style={styles.avatarHint}>Tap to add a photo</Text>

          <Spacer height={28} />

          {/* Display name */}
          <View style={styles.formContainer}>
            <Text style={styles.inputLabel}>Display Name</Text>
            <ThemedTextInput
              style={styles.input}
              placeholder="How should others see you?"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              returnKeyType="done"
            />
          </View>

          <Spacer height={20} />

          {/* Location */}
          <View style={styles.formContainer}>
            <Text style={styles.inputLabel}>Location</Text>
            <TouchableOpacity
              style={styles.locationSelector}
              onPress={() => setLocationPickerOpen(true)}
            >
              {userLocations.length > 0 ? (
                <Text style={styles.locationText} numberOfLines={1}>
                  {userLocations.map(loc => loc.name).join(' \u203A ')}
                </Text>
              ) : (
                <Text style={styles.locationPlaceholder}>Tap to set your location</Text>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Spacer height={24} />

          <View style={styles.buttonContainer}>
            <ThemedButton onPress={handleContinue} disabled={saving} style={styles.continueButton}>
              <Text style={styles.continueButtonText}>
                {saving ? 'Saving...' : 'Continue'}
              </Text>
            </ThemedButton>

            <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
              <Text style={styles.skipButtonText}>Skip for now</Text>
            </TouchableOpacity>
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
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: colors.secondaryText,
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
    backgroundColor: colors.primary,
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
    fontSize: 14,
    color: colors.secondaryText,
  },
  formContainer: {
    width: '100%',
    maxWidth: 320,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.secondaryText,
    marginBottom: 6,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    fontSize: 16,
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
    fontSize: 16,
    color: colors.primary,
  },
  locationPlaceholder: {
    flex: 1,
    fontSize: 16,
    color: colors.placeholderText,
  },
  errorContainer: {
    marginTop: 12,
    width: '100%',
    maxWidth: 320,
  },
  errorText: {
    color: SemanticColors.warning,
    padding: 12,
    backgroundColor: '#ffe6e6',
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
    paddingVertical: 16,
    borderRadius: 12,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    marginTop: 16,
    paddingVertical: 8,
  },
  skipButtonText: {
    color: colors.secondaryText,
    fontSize: 14,
  },
})
