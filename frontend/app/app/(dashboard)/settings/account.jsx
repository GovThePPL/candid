import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Pressable, TextInput } from 'react-native'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../../constants/Colors'
import { SharedStyles } from '../../../constants/SharedStyles'
import api from '../../../lib/api'
import { useUser } from '../../../hooks/useUser'
import { CacheManager, CacheKeys, CacheDurations } from '../../../lib/cache'

import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import LoadingView from '../../../components/LoadingView'

export default function AccountSettings() {
  const { logout, user, refreshUser } = useUser()
  const router = useRouter()

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
      setError(err.message || 'Failed to load account data')
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
      setError(err.message || 'Failed to save email')
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
      setDeleteError(err.message || 'Failed to delete account')
    } finally {
      setDeletingAccount(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onBack={() => router.back()} />
        <LoadingView message="Loading account..." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageHeader}>
          <ThemedText title={true} style={styles.pageTitle}>
            Account
          </ThemedText>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color={Colors.warning} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Email Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="mail-outline" size={22} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Email</Text>
          </View>

          {editingEmail ? (
            <>
              <View style={styles.inputGroup}>
                <TextInput
                  style={styles.textInput}
                  value={email}
                  onChangeText={handleEmailChange}
                  placeholder="your@email.com"
                  placeholderTextColor={Colors.pass}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoFocus
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
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                {hasEmailChanges && (
                  <TouchableOpacity
                    style={[styles.saveButton, savingEmail && styles.buttonDisabled]}
                    onPress={handleSaveEmail}
                    disabled={savingEmail}
                  >
                    {savingEmail ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.saveButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </>
          ) : (
            <View style={styles.emailReadOnly}>
              <Text style={styles.emailText}>{email || 'Not set'}</Text>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setEditingEmail(true)}
              >
                <Ionicons name="pencil" size={18} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Account Security Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-outline" size={22} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Account Security</Text>
          </View>

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

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setDeleteModalOpen(false)
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
  inputGroup: {
    marginBottom: 12,
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
  emailReadOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emailText: {
    fontSize: 16,
    color: Colors.darkText,
    flex: 1,
  },
  editButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  emailButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
  },
  saveButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
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
    textAlign: 'center',
    marginBottom: 16,
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
})
