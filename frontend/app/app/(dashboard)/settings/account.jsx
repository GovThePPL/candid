import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Pressable, TextInput, Switch } from 'react-native'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { SemanticColors } from '../../../constants/Colors'
import { createSharedStyles } from '../../../constants/SharedStyles'
import api, { translateError } from '../../../lib/api'
import { useUser } from '../../../hooks/useUser'
import { CacheManager, CacheKeys, CacheDurations } from '../../../lib/cache'

import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import LoadingView from '../../../components/LoadingView'

export default function AccountSettings() {
  const { logout, user, refreshUser } = useUser()
  const router = useRouter()
  const { t } = useTranslation('settings')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const shared = useMemo(() => createSharedStyles(colors), [colors])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Email state
  const [profile, setProfile] = useState(null)
  const [email, setEmail] = useState('')
  const [editingEmail, setEditingEmail] = useState(false)
  const [hasEmailChanges, setHasEmailChanges] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const isInitialLoadRef = useRef(true)

  // Delete account state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [deletingAccount, setDeletingAccount] = useState(false)

  // Diagnostics consent state (null = never asked, true/false = opted in/out)
  const [diagnosticsConsent, setDiagnosticsConsent] = useState(user?.diagnosticsConsent ?? null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const profileCacheKey = CacheKeys.profile(user?.id)
      const cachedProfile = await CacheManager.get(profileCacheKey)
      const profileFresh = cachedProfile && !CacheManager.isStale(cachedProfile, CacheDurations.PROFILE)

      if (profileFresh) {
        setProfile(cachedProfile.data)
        setEmail(cachedProfile.data?.email || '')
      } else {
        const profileData = await api.users.getProfile()
        if (profileData) {
          setProfile(profileData)
          setEmail(profileData.email || '')
          await CacheManager.set(profileCacheKey, profileData)
        }
      }

      setTimeout(() => {
        isInitialLoadRef.current = false
      }, 100)
    } catch (err) {
      console.error('Failed to fetch account data:', err)
      setError(translateError(err.message, t) || t('failedLoadAccount'))
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useFocusEffect(
    useCallback(() => {
      fetchData()
    }, [fetchData])
  )

  const handleEmailChange = (value) => {
    setEmail(value)
    if (!isInitialLoadRef.current) {
      setHasEmailChanges(true)
    }
  }

  const handleSaveEmail = async () => {
    try {
      setSavingEmail(true)
      setError(null)

      if (email !== profile?.email) {
        await api.users.updateProfile({ email })
        setProfile(prev => ({ ...prev, email }))
        await refreshUser()
        if (user?.id) await CacheManager.invalidate(CacheKeys.profile(user.id))
      }

      setHasEmailChanges(false)
      setEditingEmail(false)
    } catch (err) {
      console.error('Failed to save email:', err)
      setError(translateError(err.message, t) || t('failedSaveEmail'))
      setTimeout(() => setError(null), 3000)
    } finally {
      setSavingEmail(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteError(null)

    try {
      setDeletingAccount(true)
      await api.users.deleteAccount()
      setDeleteModalOpen(false)
      await logout()
      router.replace('/')
    } catch (err) {
      setDeleteError(translateError(err.message, t) || t('failedDeleteAccount'))
    } finally {
      setDeletingAccount(false)
    }
  }

  const handleDiagnosticsToggle = async (value) => {
    setDiagnosticsConsent(value)
    try {
      await api.users.updateDiagnosticsConsent(value)
      await refreshUser()
    } catch (err) {
      // Revert on failure
      setDiagnosticsConsent(diagnosticsConsent)
      console.error('Failed to update diagnostics consent:', err)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onBack={() => router.back()} />
        <LoadingView message={t('loadingAccount')} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageHeader}>
          <ThemedText variant="h1" title={true} style={styles.pageTitle}>
            {t('account')}
          </ThemedText>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color={SemanticColors.warning} />
            <ThemedText variant="bodySmall" color="error" style={styles.errorText}>{error}</ThemedText>
          </View>
        )}

        {/* Email Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="mail-outline" size={22} color={colors.primary} />
            <ThemedText variant="h2" color="dark">{t('email')}</ThemedText>
          </View>

          {editingEmail ? (
            <>
              <View style={styles.inputGroup}>
                <TextInput
                  style={styles.textInput}
                  value={email}
                  onChangeText={handleEmailChange}
                  placeholder={t('emailPlaceholder')}
                  placeholderTextColor={colors.placeholderText}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoFocus
                  maxFontSizeMultiplier={1.5}
                  accessibilityLabel={t('emailA11yLabel')}
                />
              </View>

              <View style={styles.emailButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setEmail(profile?.email || '')
                    setHasEmailChanges(false)
                    setEditingEmail(false)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('cancelEmailEdit')}
                >
                  <ThemedText variant="button" color="secondary" style={styles.cancelButtonText}>{t('cancel')}</ThemedText>
                </TouchableOpacity>
                {hasEmailChanges && (
                  <TouchableOpacity
                    style={[styles.saveButton, savingEmail && styles.buttonDisabled]}
                    onPress={handleSaveEmail}
                    disabled={savingEmail}
                    accessibilityRole="button"
                    accessibilityLabel={t('saveEmailA11y')}
                    accessibilityState={{ disabled: savingEmail }}
                  >
                    {savingEmail ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <ThemedText variant="button" color="inverse">{t('save')}</ThemedText>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </>
          ) : (
            <View style={styles.emailReadOnly}>
              <ThemedText variant="button" color="dark" style={styles.emailText}>{email || t('notSetEmail')}</ThemedText>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setEditingEmail(true)}
                accessibilityRole="button"
                accessibilityLabel={t('editEmailA11y')}
              >
                <Ionicons name="pencil" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Account Security Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-outline" size={22} color={colors.primary} />
            <ThemedText variant="h2" color="dark">{t('accountSecurity')}</ThemedText>
          </View>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={logout}
            accessibilityRole="button"
            accessibilityLabel={t('logOutA11y')}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.primary} />
            <ThemedText variant="button" color="primary" style={styles.logoutButtonText}>{t('logOut')}</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Diagnostics Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="analytics-outline" size={22} color={colors.primary} />
            <ThemedText variant="h2" color="dark">{t('diagnostics')}</ThemedText>
          </View>

          <View style={styles.diagnosticsRow}>
            <View style={styles.diagnosticsText}>
              <ThemedText variant="body" color="dark">{t('sendErrorReports')}</ThemedText>
              <ThemedText variant="label" color="secondary">
                {t('diagnosticsSubtitle')}
              </ThemedText>
            </View>
            <Switch
              value={diagnosticsConsent === true}
              onValueChange={handleDiagnosticsToggle}
              trackColor={{ false: colors.cardBorder, true: colors.primaryMuted }}
              thumbColor={diagnosticsConsent === true ? colors.primary : colors.pass}
              accessibilityLabel={t('sendDiagnosticsA11y')}
              accessibilityRole="switch"
              accessibilityState={{ checked: diagnosticsConsent === true }}
            />
          </View>
        </View>

        {/* Danger Zone */}
        <View style={[styles.section, styles.dangerSection]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="warning-outline" size={22} color={SemanticColors.warning} />
            <ThemedText variant="h2" color="error">{t('dangerZone')}</ThemedText>
          </View>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => setDeleteModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('deleteAccountA11y')}
          >
            <Ionicons name="trash-outline" size={20} color={SemanticColors.warning} />
            <ThemedText variant="button" color="error" style={styles.deleteButtonText}>{t('deleteAccount')}</ThemedText>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Delete Account Modal */}
      <Modal
        visible={deleteModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteModalOpen(false)}
      >
        <Pressable style={shared.modalOverlay} onPress={() => setDeleteModalOpen(false)}>
          <View style={styles.formModalContent}>
            <ThemedText variant="h2" color="error" style={styles.modalTitle}>{t('deleteAccount')}</ThemedText>

            <View style={styles.deleteWarning}>
              <Ionicons name="warning" size={24} color={SemanticColors.warning} />
              <ThemedText variant="bodySmall" style={styles.deleteWarningText}>
                {t('deleteWarning')}
              </ThemedText>
            </View>

            {deleteError && (
              <View style={styles.modalError}>
                <ThemedText variant="bodySmall" color="error" style={styles.modalErrorText}>{deleteError}</ThemedText>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setDeleteModalOpen(false)
                  setDeleteError(null)
                }}
                accessibilityRole="button"
                accessibilityLabel={t('cancelDeletion')}
              >
                <ThemedText variant="button" color="secondary">{t('cancel')}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDeleteButton, deletingAccount && styles.modalButtonDisabled]}
                onPress={handleDeleteAccount}
                disabled={deletingAccount}
                accessibilityRole="button"
                accessibilityLabel={t('confirmDeleteA11y')}
                accessibilityState={{ disabled: deletingAccount }}
              >
                {deletingAccount ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText variant="button" color="inverse">{t('deleteAccount')}</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
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
  inputGroup: {
    marginBottom: 12,
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
  emailReadOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emailText: {
    flex: 1,
  },
  editButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  emailButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
  },
  cancelButtonText: {
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.primarySurface,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  // saveButtonText removed - handled by ThemedText variant="button" color="inverse"
  buttonDisabled: {
    opacity: 0.6,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  logoutButtonText: {
    flex: 1,
    fontWeight: '500',
  },
  diagnosticsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  diagnosticsText: {
    flex: 1,
    gap: 2,
  },
  dangerSection: {
    borderColor: SemanticColors.warning + '40',
  },
  // dangerTitle removed - handled by ThemedText color="error"
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  deleteButtonText: {
    fontWeight: '500',
  },
  // Modal styles
  formModalContent: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    width: '100%',
    maxWidth: 360,
    padding: 20,
  },
  modalTitle: {
    textAlign: 'center',
    marginBottom: 16,
  },
  deleteWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningBannerBg,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 10,
  },
  deleteWarningText: {
    flex: 1,
    color: colors.warningBannerText,
  },
  modalError: {
    backgroundColor: colors.errorBannerBg,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  modalErrorText: {
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
  },
  // modalCancelButtonText removed - handled by ThemedText variant="button" color="secondary"
  modalDeleteButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: SemanticColors.warning,
    alignItems: 'center',
  },
  // modalDeleteButtonText removed - handled by ThemedText variant="button" color="inverse"
  modalButtonDisabled: {
    opacity: 0.6,
  },
})
