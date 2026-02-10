import { useState, useEffect, useMemo } from 'react'
import {
  View,
  TextInput,
  TouchableOpacity,
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
import { bugReportsApiWrapper } from '../lib/api'

export default function BugReportModal({ visible, onClose }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (visible) {
      setDescription('')
      setSuccess(false)
      setError(null)
    }
  }, [visible])

  const handleSubmit = async () => {
    const trimmed = description.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await bugReportsApiWrapper.createReport({
        source: 'user',
        description: trimmed,
      })
      setSuccess(true)
      setTimeout(() => onClose(), 1200)
    } catch (err) {
      setError(t('failedSubmit'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BottomDrawerModal
      visible={visible}
      onClose={onClose}
      title={t('reportBugTitle')}
      subtitle={t('bugSubtitle')}
      maxHeight="60%"
    >
      {success ? (
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle" size={48} color={SemanticColors.success} />
          <ThemedText variant="h2" style={styles.successText}>{t('bugSuccess')}</ThemedText>
          <ThemedText variant="label" color="secondary">{t('bugSuccessSubtitle')}</ThemedText>
        </View>
      ) : (
        <View style={styles.container}>
          <View style={styles.body}>
            <TextInput
              style={styles.descriptionInput}
              placeholder={t('bugPlaceholder')}
              placeholderTextColor={colors.placeholderText}
              value={description}
              onChangeText={setDescription}
              maxLength={1000}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              maxFontSizeMultiplier={1.5}
              accessibilityLabel={t('bugDescription')}
              accessibilityHint={t('bugDescriptionHint')}
            />
            {error && (
              <ThemedText variant="label" style={styles.errorText}>{error}</ThemedText>
            )}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.submitButton, !description.trim() && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!description.trim() || submitting}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('submitBugReport')}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="bug" size={18} color="#FFFFFF" />
                  <ThemedText variant="button" color="inverse">{t('submitReport')}</ThemedText>
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
  },
  successContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  successText: {
    color: SemanticColors.success,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  descriptionInput: {
    ...Typography.body,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    minHeight: 120,
  },
  errorText: {
    color: SemanticColors.error,
    marginTop: 8,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColor,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
})
