import { useState, useEffect, useMemo } from 'react'
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import { SemanticColors, BrandColor } from '../constants/Colors'
import { Typography } from '../constants/Theme'
import ThemedText from './ThemedText'
import BottomDrawerModal from './BottomDrawerModal'

const getActionOptions = (t) => [
  { value: 'none', label: t('none') },
  { value: 'removed', label: t('actionRemoveContent') },
  { value: 'warning', label: t('actionWarning') },
  { value: 'temporary_ban', label: t('actionTemporaryBan') },
  { value: 'permanent_ban', label: t('actionPermanentBan') },
]

const getPositionUserClasses = (t) => [
  { value: 'submitter', label: t('classCreator') },
  { value: 'active_adopter', label: t('classActiveAdopters') },
  { value: 'passive_adopter', label: t('classPassiveAdopters') },
]

const getChatUserClasses = (t) => [
  { value: 'reported', label: t('reportedUser') },
  { value: 'reporter', label: t('reportingUser') },
]

function ActionRow({ userClass, action, onActionChange, duration, onDurationChange, colors, styles, actionOptions, t }) {

  const [open, setOpen] = useState(false)
  const selected = actionOptions.find(o => o.value === action) || actionOptions[0]
  const hasAction = action !== 'none'

  return (
    <>
      <View style={styles.actionRow}>
        <ThemedText variant="body" style={styles.rowLabel}>{userClass.label}</ThemedText>
        <TouchableOpacity
          style={[styles.dropdown, hasAction && styles.dropdownActive]}
          onPress={() => setOpen(!open)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${userClass.label}: ${selected.label}`}
          accessibilityState={{ expanded: open }}
        >
          <ThemedText variant="label" style={[styles.dropdownText, hasAction && styles.dropdownTextActive]}>
            {selected.label}
          </ThemedText>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={hasAction ? colors.primary : colors.secondaryText}
          />
        </TouchableOpacity>
      </View>

      {open && (
        <View style={styles.dropdownList}>
          {actionOptions.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.dropdownItem, action === opt.value && styles.dropdownItemSelected]}
              onPress={() => { onActionChange(opt.value); setOpen(false) }}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ checked: action === opt.value }}
              accessibilityLabel={opt.label}
            >
              <ThemedText variant="label" style={[styles.dropdownItemText, action === opt.value && styles.dropdownItemTextSelected]}>
                {opt.label}
              </ThemedText>
              {action === opt.value && (
                <Ionicons name="checkmark" size={14} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {action === 'temporary_ban' && (
        <View style={styles.durationRow}>
          <ThemedText variant="label">{t('durationDaysLabel')}</ThemedText>
          <TextInput
            style={styles.durationInput}
            value={duration}
            onChangeText={onDurationChange}
            keyboardType="number-pad"
            placeholder="7"
            placeholderTextColor={colors.placeholderText}
            maxFontSizeMultiplier={1.2}
            accessibilityLabel={t('banDurationA11y', { userClass: userClass.label })}
          />
        </View>
      )}
    </>
  )
}

function buildDefaultActions(rule, isChatReport, userClasses) {
  const classes = userClasses
  const defaults = {}
  for (const uc of classes) {
    defaults[uc.value] = { action: 'none', duration: '' }
  }
  if (rule?.defaultActions && Array.isArray(rule.defaultActions)) {
    for (const da of rule.defaultActions) {
      // Map position-oriented classes to chat classes
      let targetClass = da.userClass
      if (isChatReport && targetClass === 'submitter') targetClass = 'reported'
      if (targetClass && defaults[targetClass]) {
        defaults[targetClass] = {
          action: da.action || 'none',
          duration: da.duration ? String(da.duration) : '',
        }
      }
    }
  }
  return defaults
}

export default function ModerationActionModal({ visible, onClose, onSubmit, reportType, rule }) {
  const { t } = useTranslation('moderation')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const isChatReport = reportType === 'chat_log'
  const actionOptions = useMemo(() => getActionOptions(t), [t])
  const userClasses = useMemo(
    () => isChatReport ? getChatUserClasses(t) : getPositionUserClasses(t),
    [t, isChatReport]
  )
  const [actions, setActions] = useState(() => buildDefaultActions(rule, isChatReport, userClasses))
  const [modNotes, setModNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset actions from rule defaults when the modal opens or rule changes
  useEffect(() => {
    if (visible) {
      setActions(buildDefaultActions(rule, isChatReport, userClasses))
      setModNotes('')
    }
  }, [visible, rule, isChatReport, userClasses])

  const setAction = (userClass, action) => {
    setActions(prev => ({
      ...prev,
      [userClass]: { ...prev[userClass], action },
    }))
  }

  const setDuration = (userClass, duration) => {
    setActions(prev => ({
      ...prev,
      [userClass]: { ...prev[userClass], duration },
    }))
  }

  const hasSelectedActions = Object.values(actions).some(a => a.action !== 'none')

  const handleConfirm = async () => {
    if (!hasSelectedActions || submitting) return
    setSubmitting(true)
    try {
      const actionList = Object.entries(actions)
        .filter(([_, a]) => a.action !== 'none')
        .map(([userClass, a]) => ({
          userClass,
          action: a.action,
          ...(a.action === 'temporary_ban' ? { duration: parseInt(a.duration, 10) || 7 } : {}),
        }))

      await onSubmit({
        modResponse: 'take_action',
        modResponseText: modNotes || undefined,
        actions: actionList,
      })
    } catch (err) {
      console.error('Failed to submit action:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BottomDrawerModal
      visible={visible}
      onClose={onClose}
      title={t('takeModeratorAction')}
      maxHeight="85%"
    >
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {rule && (
          <View style={styles.ruleSection}>
            <ThemedText variant="h3" style={styles.ruleTitle}>{rule.title}</ThemedText>
            {rule.text && <ThemedText variant="label" color="secondary" style={styles.ruleText}>{rule.text}</ThemedText>}
            {rule.sentencingGuidelines && (
              <View style={styles.guidelinesBox}>
                <Ionicons name="book-outline" size={14} color={colors.primary} style={{ marginTop: 1 }} />
                <ThemedText variant="label" color="primary" style={styles.guidelinesText}>{rule.sentencingGuidelines}</ThemedText>
              </View>
            )}
          </View>
        )}

        <View style={styles.actionsGroup}>
          {userClasses.map((uc) => (
            <ActionRow
              key={uc.value}
              userClass={uc}
              action={actions[uc.value]?.action || 'none'}
              onActionChange={(v) => setAction(uc.value, v)}
              duration={actions[uc.value]?.duration || ''}
              onDurationChange={(v) => setDuration(uc.value, v)}
              colors={colors}
              styles={styles}
              actionOptions={actionOptions}
              t={t}
            />
          ))}
        </View>

        <ThemedText variant="buttonSmall" style={styles.notesLabel}>{t('moderatorNotes')}</ThemedText>
        <TextInput
          style={styles.notesInput}
          value={modNotes}
          onChangeText={setModNotes}
          placeholder={t('addNotesPlaceholder')}
          placeholderTextColor={colors.placeholderText}
          multiline
          numberOfLines={3}
          maxFontSizeMultiplier={1.5}
          accessibilityLabel={t('moderatorNotes')}
        />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmButton, !hasSelectedActions && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={!hasSelectedActions || submitting}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('confirmAction')}
          accessibilityState={{ disabled: !hasSelectedActions || submitting }}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <ThemedText variant="button" color="inverse">{t('confirmAction')}</ThemedText>
          )}
        </TouchableOpacity>
      </View>
    </BottomDrawerModal>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    paddingHorizontal: 16,
  },
  ruleSection: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  ruleTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  ruleText: {
    lineHeight: 18,
    marginBottom: 8,
  },
  guidelinesBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: BrandColor + '15',
    borderRadius: 8,
    padding: 10,
  },
  guidelinesText: {
    flex: 1,
    fontWeight: '500',
    lineHeight: 18,
  },
  actionsGroup: {
    gap: 8,
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontWeight: '600',
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    minWidth: 140,
    justifyContent: 'space-between',
  },
  dropdownActive: {
    borderColor: colors.primary,
    backgroundColor: BrandColor + '15',
  },
  dropdownText: {
    color: colors.secondaryText,
  },
  dropdownTextActive: {
    color: colors.primary,
  },
  dropdownList: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: colors.cardBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  dropdownItemSelected: {
    backgroundColor: BrandColor + '15',
  },
  dropdownItemText: {
  },
  dropdownItemTextSelected: {
    color: colors.primary,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  durationInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    width: 60,
    fontSize: 13,
    textAlign: 'center',
    color: colors.text,
  },
  notesLabel: {
    marginBottom: 8,
  },
  notesInput: {
    ...Typography.bodySmall,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    maxHeight: 100,
    marginBottom: 8,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  confirmButton: {
    backgroundColor: SemanticColors.warning,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
})
