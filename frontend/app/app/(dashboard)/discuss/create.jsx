import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, ScrollView, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import useKeyboardHeight from '../../../hooks/useKeyboardHeight'
import { Spacing, BorderRadius, Typography } from '../../../constants/Theme'
import { SemanticColors } from '../../../constants/Colors'
import api from '../../../lib/api'
import Header from '../../../components/Header'
import ThemedText from '../../../components/ThemedText'
import ThemedTextInput from '../../../components/ThemedTextInput'
import ThemedButton from '../../../components/ThemedButton'
import LocationCategorySelector from '../../../components/LocationCategorySelector'
import MarkdownRenderer from '../../../components/discuss/MarkdownRenderer'

const MAX_TITLE_LENGTH = 200
const MAX_BODY_LENGTH = 10000

export default function CreatePost() {
  const { type } = useLocalSearchParams()
  const router = useRouter()
  const navigation = useNavigation()
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { keyboardHeight, webInitialHeight } = useKeyboardHeight()

  const [postType, setPostType] = useState(type === 'question' ? 'question' : 'discussion')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const isQuestion = postType === 'question'

  const titleLength = title.length
  const bodyLength = body.length
  const isTitleOver = titleLength > MAX_TITLE_LENGTH
  const isBodyOver = bodyLength > MAX_BODY_LENGTH

  const canSubmit = title.trim().length > 0
    && body.trim().length > 0
    && !isTitleOver
    && !isBodyOver
    && selectedLocation
    && (!isQuestion || selectedCategory)
    && !submitting

  const handleSubmit = useCallback(async () => {
    // Validate
    if (!title.trim()) {
      setError(t('errorTitleRequired'))
      return
    }
    if (!body.trim()) {
      setError(t('errorBodyRequired'))
      return
    }
    if (isTitleOver) {
      setError(t('errorTitleTooLong'))
      return
    }
    if (isBodyOver) {
      setError(t('errorBodyTooLong'))
      return
    }
    if (isQuestion && !selectedCategory) {
      setError(t('errorCategoryRequired'))
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const result = await api.posts.createPost({
        title: title.trim(),
        body: body.trim(),
        locationId: selectedLocation,
        categoryId: selectedCategory || undefined,
        postType,
      })
      navigation.replace('[id]', { id: result.id })
    } catch (err) {
      if (err?.status === 429) {
        setError(t('errorRateLimited'))
      } else {
        setError(t('errorCreatePost'))
      }
      setSubmitting(false)
    }
  }, [title, body, selectedLocation, selectedCategory, postType, isQuestion, isTitleOver, isBodyOver, submitting, router, t])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          keyboardHeight > 0 && { paddingBottom: keyboardHeight },
          Platform.OS === 'web' && webInitialHeight > 0 && { minHeight: webInitialHeight },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Screen title */}
        <ThemedText variant="h1" style={styles.heading}>
          {isQuestion ? t('createQuestionTitle') : t('createPostTitle')}
        </ThemedText>

        {/* Post type toggle */}
        <View style={styles.typeToggle} accessibilityRole="tablist">
          {['discussion', 'question'].map((typeOption) => {
            const isActive = postType === typeOption
            const label = typeOption === 'discussion' ? t('typeDiscussion') : t('typeQuestion')
            return (
              <TouchableOpacity
                key={typeOption}
                style={[styles.typeButton, isActive && styles.typeButtonActive]}
                onPress={() => setPostType(typeOption)}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={t('typeToggleA11y', { type: label })}
              >
                <ThemedText
                  variant="buttonSmall"
                  style={[styles.typeButtonLabel, isActive && styles.typeButtonLabelActive]}
                >
                  {label}
                </ThemedText>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Location & Category */}
        <LocationCategorySelector
          selectedLocation={selectedLocation}
          selectedCategory={selectedCategory}
          onLocationChange={setSelectedLocation}
          onCategoryChange={setSelectedCategory}
          showLabels
          defaultLocation="last"
          style={{ paddingHorizontal: 0, marginBottom: Spacing.md }}
        />

        {/* Title input */}
        <View style={styles.inputGroup}>
          <ThemedText variant="label" color="secondary" style={styles.inputLabel}>
            {t('titleLabel')}
          </ThemedText>
          <ThemedTextInput
            style={styles.titleInput}
            placeholder={isQuestion ? t('questionTitlePlaceholder') : t('titlePlaceholder')}
            value={title}
            onChangeText={setTitle}
            maxLength={MAX_TITLE_LENGTH + 20}
            accessibilityLabel={t('titleInputA11y')}
          />
          <ThemedText
            variant="caption"
            color="secondary"
            style={[styles.charCount, isTitleOver && styles.charCountOver]}
          >
            {t('charsRemaining', { count: titleLength, max: MAX_TITLE_LENGTH })}
          </ThemedText>
        </View>

        {/* Body input / preview */}
        <View style={styles.inputGroup}>
          <View style={styles.bodyHeader}>
            <ThemedText variant="label" color="secondary">
              {t('bodyLabel')}
            </ThemedText>
            <TouchableOpacity
              onPress={() => setShowPreview(!showPreview)}
              style={styles.previewToggle}
              accessibilityRole="button"
              accessibilityState={{ selected: showPreview }}
              accessibilityLabel={t('previewToggleA11y')}
            >
              <Ionicons
                name={showPreview ? 'eye-off-outline' : 'eye-outline'}
                size={16}
                color={colors.primary}
              />
              <ThemedText variant="caption" color="primary">
                {t('preview')}
              </ThemedText>
            </TouchableOpacity>
          </View>

          {showPreview ? (
            <View style={styles.previewContainer}>
              {body.trim() ? (
                <MarkdownRenderer content={body} variant="post" />
              ) : (
                <ThemedText variant="bodySmall" color="secondary" style={styles.previewEmpty}>
                  {t('previewEmpty')}
                </ThemedText>
              )}
            </View>
          ) : (
            <ThemedTextInput
              style={styles.bodyInput}
              placeholder={isQuestion ? t('questionBodyPlaceholder') : t('bodyPlaceholder')}
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={MAX_BODY_LENGTH + 100}
              textAlignVertical="top"
              accessibilityLabel={t('bodyInputA11y')}
            />
          )}
          <ThemedText
            variant="caption"
            color="secondary"
            style={[styles.charCount, isBodyOver && styles.charCountOver]}
          >
            {t('charsRemaining', { count: bodyLength, max: MAX_BODY_LENGTH.toLocaleString() })}
          </ThemedText>
        </View>

        {/* Error banner */}
        {error && (
          <View style={styles.errorBanner}>
            <ThemedText variant="bodySmall" color="error">{error}</ThemedText>
          </View>
        )}

        {/* Submit button */}
        <ThemedButton
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityLabel={t('submitA11y')}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            isQuestion ? t('submitQuestion') : t('submitPost')
          )}
        </ThemedButton>
      </ScrollView>
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
    padding: Spacing.xl,
  },
  heading: {
    marginBottom: Spacing.lg,
  },
  typeToggle: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  typeButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  typeButtonActive: {
    backgroundColor: colors.buttonSelected,
    borderColor: colors.buttonSelected,
  },
  typeButtonLabel: {
    fontWeight: '500',
  },
  typeButtonLabelActive: {
    color: colors.buttonSelectedText,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    marginBottom: Spacing.xs,
  },
  titleInput: {
    ...Typography.body,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: colors.text,
  },
  bodyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  previewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: Spacing.xs,
  },
  bodyInput: {
    ...Typography.body,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minHeight: 160,
    color: colors.text,
  },
  previewContainer: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minHeight: 160,
  },
  previewEmpty: {
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: Spacing.xxl,
  },
  charCount: {
    textAlign: 'right',
    marginTop: Spacing.xs,
  },
  charCountOver: {
    color: SemanticColors.warning,
  },
  errorBanner: {
    backgroundColor: colors.errorBannerBg,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: SemanticColors.warning,
    marginBottom: Spacing.lg,
  },
})
