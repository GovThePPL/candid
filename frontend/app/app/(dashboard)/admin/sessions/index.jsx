import { StyleSheet, View, TouchableOpacity, FlatList, ScrollView, ActivityIndicator, TextInput, Switch } from 'react-native'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../../hooks/useThemeColors'
import { SemanticColors } from '../../../../constants/Colors'
import { useUser } from '../../../../hooks/useUser'
import { hasRole } from '../../../../lib/roles'
import useAdminSessions, { getNextStage } from '../../../../hooks/useAdminSessions'
import ThemedText from '../../../../components/ThemedText'
import Header from '../../../../components/Header'
import EmptyState from '../../../../components/EmptyState'
import BottomDrawerModal from '../../../../components/BottomDrawerModal'
import LocationSessionBadge from '../../../../components/LocationSessionBadge'
import SessionProgressBar from '../../../../components/SessionProgressBar'
import LocationPicker from '../../../../components/LocationPicker'
import { useToast } from '../../../../components/Toast'

export default function AdminSessionsScreen() {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation('common')
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { user } = useUser()

  const isAdmin = useMemo(() => hasRole(user, 'admin'), [user])
  const canCreate = isAdmin
  const canManage = useMemo(() => hasRole(user, 'facilitator'), [user])

  const mgmt = useAdminSessions()

  useEffect(() => { mgmt.fetchSessions() }, [mgmt.fetchSessions])

  // Admins see all sessions; facilitators/others see only sessions they have a role for
  const visibleSessions = useMemo(() => {
    if (isAdmin) return mgmt.sessions
    if (!Array.isArray(user?.roles)) return []
    const userSessionIds = new Set(user.roles.filter(r => r.sessionId).map(r => r.sessionId))
    return mgmt.sessions.filter(s => userSessionIds.has(s.id))
  }, [isAdmin, mgmt.sessions, user?.roles])

  // Location picker for create form
  const [locationPickerVisible, setLocationPickerVisible] = useState(false)

  const getStageDisplay = (stage) => {
    if (!stage) return ''
    const key = `stage${stage.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('')}`
    return tc(key, { defaultValue: stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) })
  }

  const renderSession = useCallback(({ item }) => {
    const surveys = mgmt.sessionLabelSurveys[item.id]
    const hasLabel = surveys?.proposal || surveys?.opinion
    const nextStage = getNextStage(item.stage)

    return (
      <View style={styles.sessionCard}>
        {/* Top row: location+session badge left, labels right */}
        <View style={styles.cardTopRow}>
          <View style={styles.badgeWrap}>
            <LocationSessionBadge
              location={item.locationCode ? { code: item.locationCode } : null}
              session={{ label: item.label }}
              size="md"
            />
          </View>
          <View style={styles.labelsRow}>
            <View style={[styles.methodBadge, item.proposalMethod === 'admin_provided' ? styles.methodBadgeAdmin : styles.methodBadgeCommunity]}>
              <ThemedText variant="badge" color="inverse" style={styles.methodBadgeText}>
                {item.proposalMethod === 'admin_provided' ? t('proposalMethodAdminProvided') : t('proposalMethodUserDriven')}
              </ThemedText>
            </View>
            {hasLabel && (
              <View style={styles.labelSurveyBadge}>
                <Ionicons name="pricetag" size={12} color="#FFFFFF" />
              </View>
            )}
          </View>
        </View>

        {/* Progress bar */}
        <SessionProgressBar stage={item.stage} height={24} showStageLabel />

        {/* Actions row */}
        <View style={styles.actionRow}>
          {canManage && nextStage && (
            <TouchableOpacity
              style={styles.advanceButton}
              onPress={() => mgmt.handleAdvanceStage(item)}
              accessibilityRole="button"
              accessibilityLabel={t('advanceStageTo', { stage: getStageDisplay(nextStage) })}
            >
              <Ionicons name="arrow-forward" size={16} color={colors.primary} />
              <ThemedText variant="caption" color="primary">{t('advanceStage')}</ThemedText>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.manageButton}
            onPress={() => router.push(`/admin/sessions/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={t('manageSessionA11y', { name: item.label })}
          >
            <Ionicons name="settings-outline" size={16} color="#FFFFFF" />
            <ThemedText variant="caption" color="inverse">{t('manageSession')}</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    )
  }, [styles, colors, t, mgmt, canManage, tc, router])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText variant="h1" title={true} style={styles.pageTitle}>{t('sessionsTitle')}</ThemedText>
          {canCreate && (
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => { mgmt.resetCreateForm(); mgmt.setCreateVisible(true) }}
              accessibilityRole="button"
              accessibilityLabel={t('createSessionA11y')}
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <ThemedText variant="buttonSmall" color="inverse">{t('createNewSession')}</ThemedText>
            </TouchableOpacity>
          )}
        </View>

        {mgmt.loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : visibleSessions.length === 0 ? (
          <EmptyState
            icon="pricetag-outline"
            title={t('noSessionsAdmin')}
            subtitle={t('noSessionsAdminSubtitle')}
            style={styles.emptyContainer}
          />
        ) : (
          <FlatList
            data={visibleSessions}
            keyExtractor={(item) => item.id}
            renderItem={renderSession}
            contentContainerStyle={styles.listContent}
            style={styles.sessionList}
          />
        )}
      </View>

      {/* Create Session Modal */}
      <BottomDrawerModal
        visible={mgmt.createVisible}
        onClose={() => { mgmt.setCreateVisible(false); mgmt.resetCreateForm() }}
        title={t('createNewSession')}
      >
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          {/* Session label */}
          <ThemedText variant="label" color="secondary">{t('sessionLabelPlaceholder')}</ThemedText>
          <TextInput
            style={styles.input}
            value={mgmt.newLabel}
            onChangeText={mgmt.setNewLabel}
            placeholder={t('sessionLabelPlaceholder')}
            placeholderTextColor={colors.placeholderText}
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('sessionLabelA11y')}
          />

          {/* Location picker */}
          {mgmt.locations.length > 0 && (
            <>
              <ThemedText variant="label" color="secondary">{t('sessionLocation')}</ThemedText>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setLocationPickerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('selectLocation')}
              >
                <Ionicons name="location-outline" size={16} color={colors.secondaryText} />
                <ThemedText variant="body" color="dark" style={styles.pickerButtonText}>
                  {mgmt.newLocationId
                    ? mgmt.locations.find(l => l.id === mgmt.newLocationId)?.name || t('selectLocation')
                    : t('selectLocation')}
                </ThemedText>
                <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
              </TouchableOpacity>
            </>
          )}

          {/* Proposal method selector */}
          <ThemedText variant="label" color="secondary">{t('proposalMethod')}</ThemedText>
          <View style={styles.methodSelector}>
            <TouchableOpacity
              style={[styles.methodOption, mgmt.newProposalMethod === 'user_driven' && styles.methodOptionActive]}
              onPress={() => mgmt.setNewProposalMethod('user_driven')}
              accessibilityRole="button"
              accessibilityLabel={t('proposalMethodUserDriven')}
              accessibilityState={{ selected: mgmt.newProposalMethod === 'user_driven' }}
            >
              <Ionicons name="people" size={18} color={mgmt.newProposalMethod === 'user_driven' ? '#FFFFFF' : colors.text} />
              <ThemedText variant="caption" color={mgmt.newProposalMethod === 'user_driven' ? 'inverse' : 'dark'} style={styles.methodOptionLabel}>
                {t('proposalMethodUserDriven')}
              </ThemedText>
              <ThemedText variant="caption" color={mgmt.newProposalMethod === 'user_driven' ? 'inverse' : 'secondary'} style={styles.methodOptionDesc}>
                {t('proposalMethodUserDrivenDesc')}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodOption, mgmt.newProposalMethod === 'admin_provided' && styles.methodOptionActive]}
              onPress={() => mgmt.setNewProposalMethod('admin_provided')}
              accessibilityRole="button"
              accessibilityLabel={t('proposalMethodAdminProvided')}
              accessibilityState={{ selected: mgmt.newProposalMethod === 'admin_provided' }}
            >
              <Ionicons name="shield" size={18} color={mgmt.newProposalMethod === 'admin_provided' ? '#FFFFFF' : colors.text} />
              <ThemedText variant="caption" color={mgmt.newProposalMethod === 'admin_provided' ? 'inverse' : 'dark'} style={styles.methodOptionLabel}>
                {t('proposalMethodAdminProvided')}
              </ThemedText>
              <ThemedText variant="caption" color={mgmt.newProposalMethod === 'admin_provided' ? 'inverse' : 'secondary'} style={styles.methodOptionDesc}>
                {t('proposalMethodAdminProvidedDesc')}
              </ThemedText>
            </TouchableOpacity>
          </View>

          {/* Label survey toggle */}
          <View style={styles.switchRow}>
            <ThemedText variant="body" color="dark">{t('createLabelSurveyToggle')}</ThemedText>
            <Switch
              value={mgmt.createLabelSurvey}
              onValueChange={mgmt.setCreateLabelSurvey}
              trackColor={{ false: colors.border, true: colors.primary }}
              accessibilityRole="switch"
              accessibilityLabel={t('createLabelSurveyToggle')}
              accessibilityState={{ checked: mgmt.createLabelSurvey }}
            />
          </View>

          {mgmt.createLabelSurvey && (
            <>
              {mgmt.labelSurveyItems.map((item, i) => (
                <View key={i} style={styles.optionRow}>
                  <TextInput
                    style={[styles.input, styles.optionInput]}
                    value={item}
                    onChangeText={(text) => {
                      const updated = [...mgmt.labelSurveyItems]
                      updated[i] = text
                      mgmt.setLabelSurveyItems(updated)
                    }}
                    placeholder={t('itemPlaceholder', { number: i + 1 })}
                    placeholderTextColor={colors.placeholderText}
                    maxFontSizeMultiplier={1.5}
                    accessibilityLabel={t('itemA11y', { number: i + 1 })}
                  />
                  {mgmt.labelSurveyItems.length > 2 && (
                    <TouchableOpacity
                      onPress={() => mgmt.setLabelSurveyItems(prev => prev.filter((_, j) => j !== i))}
                      accessibilityRole="button"
                      accessibilityLabel={t('removeItemA11y', { number: i + 1 })}
                    >
                      <Ionicons name="close-circle" size={18} color={SemanticColors.warning} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {mgmt.labelSurveyItems.length < 20 && (
                <TouchableOpacity
                  style={styles.addRow}
                  onPress={() => mgmt.setLabelSurveyItems(prev => [...prev, ''])}
                  accessibilityRole="button"
                  accessibilityLabel={t('addItemA11y')}
                >
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                  <ThemedText variant="caption" color="primary">{t('addItem')}</ThemedText>
                </TouchableOpacity>
              )}
              <TextInput
                style={styles.input}
                value={mgmt.labelSurveyComparisonQuestion}
                onChangeText={mgmt.setLabelSurveyComparisonQuestion}
                placeholder={t('comparisonQuestionPlaceholder')}
                placeholderTextColor={colors.placeholderText}
                maxFontSizeMultiplier={1.5}
                accessibilityLabel={t('comparisonQuestionA11y')}
              />
            </>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitButton, { opacity: (!mgmt.newLabel.trim() || mgmt.creating) ? 0.5 : 1 }]}
            onPress={mgmt.handleCreateSession}
            disabled={!mgmt.newLabel.trim() || mgmt.creating}
            accessibilityRole="button"
            accessibilityLabel={t('createSessionA11y')}
            accessibilityState={{ disabled: !mgmt.newLabel.trim() || mgmt.creating }}
          >
            {mgmt.creating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <ThemedText variant="button" color="inverse">{t('createNewSession')}</ThemedText>
            )}
          </TouchableOpacity>
        </ScrollView>
      </BottomDrawerModal>

      {/* Location Picker Modal */}
      <LocationPicker
        visible={locationPickerVisible}
        onClose={() => setLocationPickerVisible(false)}
        allLocations={mgmt.locations}
        currentLocationId={mgmt.newLocationId}
        onSelect={(id) => { mgmt.setNewLocationId(id); setLocationPickerVisible(false) }}
        saving={false}
      />
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
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  pageTitle: {
    color: colors.primary,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySurface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 25,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sessionList: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
    paddingHorizontal: 16,
    gap: 12,
  },

  // Session card
  sessionCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeWrap: {
    flexShrink: 1,
  },
  labelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    gap: 6,
  },
  methodBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  methodBadgeCommunity: {
    backgroundColor: colors.primarySurface,
  },
  methodBadgeAdmin: {
    backgroundColor: SemanticColors.pending,
  },
  methodBadgeText: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  labelSurveyBadge: {
    backgroundColor: SemanticColors.approved,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  advanceButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 8,
    borderRadius: 25,
  },
  manageButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.primarySurface,
    paddingVertical: 8,
    borderRadius: 25,
  },

  // Modal
  modalContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  input: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
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

  // Proposal method selector
  methodSelector: {
    gap: 8,
  },
  methodOption: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBackground,
    gap: 4,
  },
  methodOptionActive: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primarySurface,
  },
  methodOptionLabel: {
    fontWeight: '600',
  },
  methodOptionDesc: {
    opacity: 0.8,
  },

  // Switch row
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },

  // Items
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionInput: {
    flex: 1,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  submitButton: {
    backgroundColor: colors.primarySurface,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 8,
  },
})
