import { useState, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import { SemanticColors, BrandColor } from '../constants/Colors'
import BottomDrawerModal from './BottomDrawerModal'

const ACTION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'removed', label: 'Remove Content' },
  { value: 'warning', label: 'Warning' },
  { value: 'temporary_ban', label: 'Temporary Ban' },
  { value: 'permanent_ban', label: 'Permanent Ban' },
]

const POSITION_USER_CLASSES = [
  { value: 'submitter', label: 'Creator' },
  { value: 'active_adopter', label: 'Active Adopters' },
  { value: 'passive_adopter', label: 'Passive Adopters' },
]

const CHAT_USER_CLASSES = [
  { value: 'reported', label: 'Reported User' },
  { value: 'reporter', label: 'Reporting User' },
]

function ActionRow({ userClass, action, onActionChange, duration, onDurationChange, colors, styles }) {

  const [open, setOpen] = useState(false)
  const selected = ACTION_OPTIONS.find(o => o.value === action) || ACTION_OPTIONS[0]
  const hasAction = action !== 'none'

  return (
    <>
      <View style={styles.actionRow}>
        <Text style={styles.rowLabel}>{userClass.label}</Text>
        <TouchableOpacity
          style={[styles.dropdown, hasAction && styles.dropdownActive]}
          onPress={() => setOpen(!open)}
          activeOpacity={0.7}
        >
          <Text style={[styles.dropdownText, hasAction && styles.dropdownTextActive]}>
            {selected.label}
          </Text>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={hasAction ? colors.primary : colors.secondaryText}
          />
        </TouchableOpacity>
      </View>

      {open && (
        <View style={styles.dropdownList}>
          {ACTION_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.dropdownItem, action === opt.value && styles.dropdownItemSelected]}
              onPress={() => { onActionChange(opt.value); setOpen(false) }}
              activeOpacity={0.7}
            >
              <Text style={[styles.dropdownItemText, action === opt.value && styles.dropdownItemTextSelected]}>
                {opt.label}
              </Text>
              {action === opt.value && (
                <Ionicons name="checkmark" size={14} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {action === 'temporary_ban' && (
        <View style={styles.durationRow}>
          <Text style={styles.durationLabel}>Duration (days):</Text>
          <TextInput
            style={styles.durationInput}
            value={duration}
            onChangeText={onDurationChange}
            keyboardType="number-pad"
            placeholder="7"
            placeholderTextColor={colors.placeholderText}
          />
        </View>
      )}
    </>
  )
}

function buildDefaultActions(rule, isChatReport) {
  const classes = isChatReport ? CHAT_USER_CLASSES : POSITION_USER_CLASSES
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
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const isChatReport = reportType === 'chat_log'
  const userClasses = isChatReport ? CHAT_USER_CLASSES : POSITION_USER_CLASSES
  const [actions, setActions] = useState(() => buildDefaultActions(rule, isChatReport))
  const [modNotes, setModNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset actions from rule defaults when the modal opens or rule changes
  useEffect(() => {
    if (visible) {
      setActions(buildDefaultActions(rule, isChatReport))
      setModNotes('')
    }
  }, [visible, rule, isChatReport])

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
      title="Take Moderator Action"
      maxHeight="85%"
    >
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {rule && (
          <View style={styles.ruleSection}>
            <Text style={styles.ruleTitle}>{rule.title}</Text>
            {rule.text && <Text style={styles.ruleText}>{rule.text}</Text>}
            {rule.sentencingGuidelines && (
              <View style={styles.guidelinesBox}>
                <Ionicons name="book-outline" size={14} color={colors.primary} style={{ marginTop: 1 }} />
                <Text style={styles.guidelinesText}>{rule.sentencingGuidelines}</Text>
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
            />
          ))}
        </View>

        <Text style={styles.notesLabel}>Moderator Notes</Text>
        <TextInput
          style={styles.notesInput}
          value={modNotes}
          onChangeText={setModNotes}
          placeholder="Add notes about this action..."
          placeholderTextColor={colors.placeholderText}
          multiline
          numberOfLines={3}
        />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmButton, !hasSelectedActions && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={!hasSelectedActions || submitting}
          activeOpacity={0.7}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.confirmButtonText}>Confirm Action</Text>
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
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  ruleText: {
    fontSize: 13,
    color: colors.secondaryText,
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
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary,
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
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
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
    fontSize: 13,
    color: colors.secondaryText,
  },
  dropdownTextActive: {
    color: colors.primary,
    fontWeight: '600',
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
    fontSize: 13,
    color: colors.text,
  },
  dropdownItemTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  durationLabel: {
    fontSize: 13,
    color: colors.text,
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
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  notesInput: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
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
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
})
