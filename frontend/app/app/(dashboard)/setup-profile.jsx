import { StyleSheet, View, TouchableOpacity, Alert, Platform, ScrollView } from 'react-native'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
// react-native-keyboard-controller tracks actual keyboard frame. Native only.
const KBAvoidingView = Platform.OS !== 'web'
  ? require('react-native-keyboard-controller').KeyboardAvoidingView
  : null
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useTranslation } from 'react-i18next'
import { SemanticColors } from '../../constants/Colors'
import { Typography } from '../../constants/Theme'
import { useThemeColors } from '../../hooks/useThemeColors'
import api, { translateError } from '../../lib/api'
import { useUser } from '../../hooks/useUser'
import { useLocationSession } from '../../contexts/LocationSessionContext'

import ThemedText from '../../components/ThemedText'
import ThemedTextInput from '../../components/ThemedTextInput'
import ThemedButton from '../../components/ThemedButton'
import Spacer from '../../components/Spacer'
import Avatar from '../../components/Avatar'
import ImageCropModal from '../../components/ImageCropModal'
import LocationPicker from '../../components/LocationPicker'

export default function SetupProfile() {
  const { user, refreshUser, clearNewUser } = useUser()
  const { resolveSession } = useLocationSession()
  const router = useRouter()
  const insets = useSafeAreaInsets()

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

  // Web: track keyboard height via visualViewport (native handled by KBAvoidingView)
  const [webKeyboardHeight, setWebKeyboardHeight] = useState(0)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    // Only needed on mobile web (touch-primary devices with on-screen keyboards).
    // Desktop browsers have pointer: fine — no on-screen keyboard to track.
    if (!window.matchMedia('(pointer: coarse)').matches) return
    const vv = window.visualViewport
    if (!vv) return
    const initialHeight = window.innerHeight
    let focusTimeout = null
    // Ignore resize events during keyboard open animation to prevent
    // intermediate small diff values from briefly zeroing the spacer.
    let skipResizeUntil = 0

    const update = () => {
      if (Date.now() < skipResizeUntil) return
      const diff = initialHeight - vv.height
      setWebKeyboardHeight(diff > 150 ? diff : 0)
    }

    vv.addEventListener('resize', update)

    // Firefox fires no visualViewport resize on keyboard open — use focus events
    const onFocusIn = (e) => {
      if (!e.target?.tagName?.match?.(/INPUT|TEXTAREA/i)) return
      clearTimeout(focusTimeout)
      skipResizeUntil = Date.now() + 300
      setWebKeyboardHeight(Math.round(initialHeight * 0.4))
      setTimeout(update, 300)
    }
    const onFocusOut = () => {
      focusTimeout = setTimeout(() => {
        if (vv.height >= initialHeight - 150) setWebKeyboardHeight(0)
      }, 300)
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      vv.removeEventListener('resize', update)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      clearTimeout(focusTimeout)
    }
  }, [])

  // Image crop state
  const [imageToCrop, setImageToCrop] = useState(null)
  const [cropModalVisible, setCropModalVisible] = useState(false)

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
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    })

    if (result.canceled || !result.assets?.[0]) return

    setImageToCrop(result.assets[0].uri)
    setCropModalVisible(true)
  }

  const handleCropConfirm = (croppedBase64) => {
    setCropModalVisible(false)
    setImageToCrop(null)
    // Optimistic: display the cropped image immediately (it's a data URI)
    setAvatarUrl(croppedBase64)
    // Upload in background — don't block the user
    api.users.uploadAvatar(croppedBase64)
      .then((response) => {
        setAvatarUrl(response.avatarUrl)
      })
      .catch(() => {
        // Silent — avatar stays visible locally. If it fails to persist,
        // the user will see their initials next time they open the app.
      })
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
      await resolveSession()
      clearNewUser()
      router.replace('/cards')
    } catch (err) {
      setError(translateError(err.message, t) || t('profileSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const Wrapper = Platform.OS === 'web' ? View : KBAvoidingView
  const wrapperProps = Platform.OS === 'web' ? {} : {
    behavior: 'padding',
    keyboardVerticalOffset: 0,
  }

  return (
    <Wrapper style={[styles.container, { paddingTop: insets.top }]} {...wrapperProps}>
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
            accessibilityRole="button"
            accessibilityLabel={t('changeAvatarA11y')}
          >
            <Avatar
              user={{ ...user, displayName: displayName || user?.displayName, avatarUrl, avatarIconUrl: avatarUrl }}
              size={120}
              showKudosBadge={false}
            />
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

      {/* Web keyboard spacer */}
      {Platform.OS === 'web' && webKeyboardHeight > 0 && (
        <View style={{ height: webKeyboardHeight }} />
      )}

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
    </Wrapper>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    borderRadius: 30,
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
