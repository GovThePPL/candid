import { useState } from 'react'
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
import { Colors } from '../constants/Colors'
import BottomDrawerModal from './BottomDrawerModal'

const ACTION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'removed', label: 'Remove Content' },
  { value: 'warning', label: 'Warning' },
  { value: 'temporary_ban', label: 'Temporary Ban' },
  { value: 'permanent_ban', label: 'Permanent Ban' },
]

const USER_CLASSES = [
  { value: 'submitter', label: 'Creator' },
  { value: 'active_adopter', label: 'Active Adopters' },
  { value: 'passive_adopter', label: 'Passive Adopters' },
]

function ActionRow({ userClass, action, onActionChange, duration, onDurationChange, isChatReport }) {
  if (isChatReport && userClass.value !== 'submitter') return null

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
            color={hasAction ? Colors.primary : Colors.pass}
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
                <Ionicons name="checkmark" size={14} color={Colors.primary} />
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
            placeholderTextColor={Colors.pass}
          />
        </View>
      )}
    </>
  )
}

export default function ModerationActionModal({ visible, onClose, onSubmit, reportType }) {
  const [actions, setActions] = useState({
    submitter: { action: 'removed', duration: '' },
    active_adopter: { action: 'removed', duration: '' },
    passive_adopter: { action: 'removed', duration: '' },
  })
  const [modNotes, setModNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isChatReport = reportType === 'chat_log'

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
        <View style={styles.actionsGroup}>
          {USER_CLASSES.map((uc) => (
            <ActionRow
              key={uc.value}
              userClass={uc}
              action={actions[uc.value].action}
              onActionChange={(v) => setAction(uc.value, v)}
              duration={actions[uc.value].duration}
              onDurationChange={(v) => setDuration(uc.value, v)}
              isChatReport={isChatReport}
            />
          ))}
        </View>

        <Text style={styles.notesLabel}>Moderator Notes</Text>
        <TextInput
          style={styles.notesInput}
          value={modNotes}
          onChangeText={setModNotes}
          placeholder="Add notes about this action..."
          placeholderTextColor={Colors.pass}
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
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.confirmButtonText}>Confirm Action</Text>
          )}
        </TouchableOpacity>
      </View>
    </BottomDrawerModal>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
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
    color: Colors.light.text,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    minWidth: 140,
    justifyContent: 'space-between',
  },
  dropdownActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  dropdownText: {
    fontSize: 13,
    color: Colors.pass,
  },
  dropdownTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  dropdownList: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.cardBorder,
  },
  dropdownItemSelected: {
    backgroundColor: Colors.primary + '10',
  },
  dropdownItemText: {
    fontSize: 13,
    color: Colors.light.text,
  },
  dropdownItemTextSelected: {
    color: Colors.primary,
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
    color: Colors.light.text,
  },
  durationInput: {
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    width: 60,
    fontSize: 13,
    textAlign: 'center',
    color: Colors.light.text,
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 8,
  },
  notesInput: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.light.text,
    maxHeight: 100,
    marginBottom: 8,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  confirmButton: {
    backgroundColor: Colors.warning,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
})
