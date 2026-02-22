import { useMemo, useState, useCallback } from 'react'
import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing, BorderRadius } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import ReviewDiffContent from './ReviewDiffContent'

/**
 * Comprehensive field-by-field diff viewer for wiki edit review.
 *
 * @param {Object} props
 * @param {Object} props.original - Original field values
 * @param {Object} props.proposed - Proposed field values
 * @param {boolean} props.isTerm - Whether this is a term (show aliases/scopes/scopeCombine)
 * @param {Function} props.onSubmit - Submit handler
 * @param {Function} props.onClose - Close handler
 * @param {string} props.submitLabel - Label for submit button
 * @param {boolean} props.submitting - Whether submission is in progress
 * @param {string|null} props.error - Error message to display
 */
export default function ReviewChanges({
  original,
  proposed,
  isTerm,
  onSubmit,
  onClose,
  submitLabel,
  submitting,
  error,
}) {
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const hasAnyChanges = ReviewDiffContent.hasChanges(original, proposed, isTerm)

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common:back')}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <ThemedText variant="h3" color="dark">{t('reviewChangesTitle')}</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        <ReviewDiffContent
          original={original}
          proposed={proposed}
          isTerm={isTerm}
        />

        {/* Error */}
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={colors.warning || '#EF4C45'} />
            <ThemedText variant="bodySmall" style={{ color: colors.warning || '#EF4C45', flex: 1 }}>
              {error}
            </ThemedText>
          </View>
        )}
      </ScrollView>

      {/* Submit button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitButton, (!hasAnyChanges || submitting) && styles.submitButtonDisabled]}
          onPress={onSubmit}
          disabled={!hasAnyChanges || submitting}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          accessibilityState={{ disabled: !hasAnyChanges || submitting }}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <ThemedText variant="button" style={{ color: '#FFFFFF' }}>
              {submitLabel}
            </ThemedText>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.navBackground,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: colors.errorBannerBg,
    borderRadius: BorderRadius.sm,
  },
  footer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.navBackground,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
})
