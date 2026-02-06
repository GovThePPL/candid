import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/Colors'
import BottomDrawerModal from './BottomDrawerModal'
import api from '../lib/api'

export default function ReportModal({ visible, onClose, onSubmit }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedRuleId, setSelectedRuleId] = useState(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (visible) {
      setSelectedRuleId(null)
      setComment('')
      setSuccess(false)
      fetchRules()
    }
  }, [visible])

  const fetchRules = async () => {
    setLoading(true)
    try {
      const data = await api.moderation.getRules()
      setRules(data || [])
    } catch (err) {
      console.error('Failed to fetch rules:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!selectedRuleId || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(selectedRuleId, comment || null)
      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 800)
    } catch (err) {
      console.error('Failed to submit report:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BottomDrawerModal
      visible={visible}
      onClose={onClose}
      title="Report Content"
      subtitle="Select the rule that was violated"
      maxHeight="75%"
    >
      {success ? (
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
          <Text style={styles.successText}>Report submitted</Text>
        </View>
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <View style={styles.container}>
          <ScrollView style={styles.rulesList} showsVerticalScrollIndicator={false}>
            {rules.map((rule) => {
              const isSelected = selectedRuleId === rule.id
              return (
                <TouchableOpacity
                  key={rule.id}
                  style={[styles.ruleRow, isSelected && styles.ruleRowSelected]}
                  onPress={() => setSelectedRuleId(rule.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.radioOuter}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                  <View style={styles.ruleTextContainer}>
                    <Text style={[styles.ruleTitle, isSelected && styles.ruleTitleSelected]}>
                      {rule.title}
                    </Text>
                    <Text style={styles.ruleDescription}>{rule.text}</Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          <View style={styles.footer}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add details (optional)..."
              placeholderTextColor={Colors.pass}
              value={comment}
              onChangeText={setComment}
              maxLength={255}
              multiline
              numberOfLines={2}
            />
            <TouchableOpacity
              style={[styles.submitButton, !selectedRuleId && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!selectedRuleId || submitting}
              activeOpacity={0.7}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="flag" size={18} color={Colors.white} />
                  <Text style={styles.submitButtonText}>Submit Report</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </BottomDrawerModal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    maxHeight: 500,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  successContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  successText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.success,
  },
  rulesList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    gap: 12,
  },
  ruleRowSelected: {
    backgroundColor: Colors.primary + '10',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.pass,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  ruleTextContainer: {
    flex: 1,
  },
  ruleTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  ruleTitleSelected: {
    color: Colors.primary,
  },
  ruleDescription: {
    fontSize: 13,
    color: Colors.pass,
    lineHeight: 18,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    gap: 12,
  },
  commentInput: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.light.text,
    maxHeight: 80,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.warning,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
})
