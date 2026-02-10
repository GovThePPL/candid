import { useState, useEffect, useMemo } from 'react'
import {
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import { SemanticColors, BrandColor } from '../constants/Colors'
import { Typography } from '../constants/Theme'
import ThemedText from './ThemedText'
import BottomDrawerModal from './BottomDrawerModal'
import api from '../lib/api'

export default function ReportModal({ visible, onClose, onSubmit }) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

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
          <Ionicons name="checkmark-circle" size={48} color={SemanticColors.success} />
          <ThemedText variant="h2" style={styles.successText}>Report submitted</ThemedText>
        </View>
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
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
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={rule.title}
                >
                  <View style={styles.radioOuter}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                  <View style={styles.ruleTextContainer}>
                    <ThemedText variant="body" style={[styles.ruleTitle, isSelected && styles.ruleTitleSelected]}>
                      {rule.title}
                    </ThemedText>
                    <ThemedText variant="label" color="secondary" style={styles.ruleDescription}>{rule.text}</ThemedText>
                  </View>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          <View style={styles.footer}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add details (optional)..."
              placeholderTextColor={colors.placeholderText}
              value={comment}
              onChangeText={setComment}
              maxLength={255}
              multiline
              numberOfLines={2}
              maxFontSizeMultiplier={1.5}
              accessibilityLabel="Additional details"
            />
            <TouchableOpacity
              style={[styles.submitButton, !selectedRuleId && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!selectedRuleId || submitting}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Submit Report"
              accessibilityState={{ disabled: !selectedRuleId || submitting }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="flag" size={18} color="#FFFFFF" />
                  <ThemedText variant="button" color="inverse">Submit Report</ThemedText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </BottomDrawerModal>
  )
}

const createStyles = (colors) => StyleSheet.create({
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
    color: SemanticColors.success,
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
    backgroundColor: BrandColor + '15',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.secondaryText,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  ruleTextContainer: {
    flex: 1,
  },
  ruleTitle: {
    fontWeight: '600',
    marginBottom: 2,
  },
  ruleTitleSelected: {
    color: colors.primary,
  },
  ruleDescription: {
    lineHeight: 18,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: 12,
  },
  commentInput: {
    ...Typography.bodySmall,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    maxHeight: 80,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SemanticColors.warning,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
})
