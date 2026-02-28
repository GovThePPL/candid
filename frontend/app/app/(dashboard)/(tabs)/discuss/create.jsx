import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../../hooks/useThemeColors'
import useKeyboardHeight from '../../../../hooks/useKeyboardHeight'
import { Spacing, BorderRadius, Typography } from '../../../../constants/Theme'
import { SemanticColors } from '../../../../constants/Colors'
import api from '../../../../lib/api'
import { CacheManager, CacheKeys } from '../../../../lib/cache'
import { useUser } from '../../../../hooks/useUser'
import Header from '../../../../components/Header'
import ThemedText from '../../../../components/ThemedText'
import { useLocationSession } from '../../../../contexts/LocationSessionContext'
import WysiwygEditor from '../../../../components/WysiwygEditor'

const MAX_TITLE_LENGTH = 200
const MAX_BODY_LENGTH = 10000

export default function CreatePost() {
  const { type } = useLocalSearchParams()
  const router = useRouter()

  // Redirect proposal type to the wizard screen
  useEffect(() => {
    if (type === 'proposal') {
      router.replace('/discuss/proposal-wizard')
    }
  }, [type, router])
  const navigation = useNavigation()
  const { t } = useTranslation('discuss')
  const { user } = useUser()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { keyboardHeight } = useKeyboardHeight()

  const { selectedLocation, selectedSession } = useLocationSession()
  const postType = type === 'question' ? 'question' : 'discussion'
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [bodyLength, setBodyLength] = useState(0)
  const [useVisual, setUseVisual] = useState(false)
  const editorRef = useRef(null)

  const isQuestion = postType === 'question'

  const titleLength = title.length
  const isTitleOver = titleLength > MAX_TITLE_LENGTH
  const isBodyOver = bodyLength > MAX_BODY_LENGTH

  const canSubmit = title.trim().length > 0
    && bodyLength > 0
    && !isTitleOver
    && !isBodyOver
    && selectedLocation
    && (!isQuestion || selectedSession)
    && !submitting

  const handleBodyChange = useCallback((html) => {
    const text = html?.replace(/<[^>]*>/g, '').trim() || ''
    setBodyLength(text.length)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      setError(t('errorTitleRequired'))
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
    if (isQuestion && !selectedSession) {
      setError(t('errorSessionRequired'))
      return
    }

    const body = await editorRef.current?.getMarkdown()
    const trimmedBody = body?.trim()
    if (!trimmedBody) {
      setError(t('errorBodyRequired'))
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const result = await api.posts.createPost({
        title: title.trim(),
        body: trimmedBody,
        locationId: selectedLocation,
        sessionId: selectedSession || undefined,
        postType,
      })
      if (user?.id) CacheManager.invalidate(CacheKeys.activityPosts(user.id))
      navigation.replace('[id]', { id: result.id })
    } catch (err) {
      if (err?.status === 429) {
        setError(t('errorRateLimited'))
      } else {
        setError(t('errorCreatePost'))
      }
      setSubmitting(false)
    }
  }, [title, selectedLocation, selectedSession, postType, isQuestion, isTitleOver, isBodyOver, submitting, t])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />

      {/* Toolbar row: editor mode toggle + submit */}
      <View style={styles.toolbarRow}>
        <TouchableOpacity
          onPress={() => setUseVisual(!useVisual)}
          style={styles.toolbarButton}
          accessibilityRole="switch"
          accessibilityState={{ checked: useVisual }}
          accessibilityLabel={t('replyComposerEditorToggleA11y')}
        >
          <ThemedText variant="caption" color="secondary">
            {useVisual ? t('replyComposerTextEditor') : t('replyComposerVisualEditor')}
          </ThemedText>
        </TouchableOpacity>

        <View style={styles.toolbarSpacer} />

        <TouchableOpacity
          style={[styles.submitPill, !canSubmit && styles.submitPillDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={t('submitA11y')}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <ThemedText variant="buttonSmall" color="inverse">
              {isQuestion ? t('submitQuestion') : t('submitPost')}
            </ThemedText>
          )}
        </TouchableOpacity>
      </View>

      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <ThemedText variant="bodySmall" color="error">{error}</ThemedText>
        </View>
      )}

      {/* Title input — borderless, H1-sized */}
      <TextInput
        style={styles.titleInput}
        placeholder={isQuestion ? t('questionTitlePlaceholder') : t('titlePlaceholder')}
        placeholderTextColor={colors.placeholderText}
        value={title}
        onChangeText={setTitle}
        maxLength={MAX_TITLE_LENGTH + 20}
        maxFontSizeMultiplier={1.5}
        accessibilityLabel={t('titleInputA11y')}
      />
      {isTitleOver && (
        <ThemedText variant="caption" style={styles.charCountOver}>
          {t('charsRemaining', { count: titleLength, max: MAX_TITLE_LENGTH })}
        </ThemedText>
      )}

      {/* Body editor — fills remaining space */}
      <View style={[styles.editorArea, keyboardHeight > 0 && { paddingBottom: keyboardHeight }]}>
        <WysiwygEditor
          ref={editorRef}
          allowImages={false}
          placeholder={isQuestion ? t('questionBodyPlaceholder') : t('bodyPlaceholder')}
          onContentChange={handleBodyChange}
          fullScreen
          externalMode={useVisual ? 'visual' : 'markdown'}
        />
      </View>
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  toolbarSpacer: {
    flex: 1,
  },
  toolbarButton: {
    padding: Spacing.xs,
  },
  submitPill: {
    backgroundColor: colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.pill,
  },
  submitPillDisabled: {
    opacity: 0.5,
  },
  titleInput: {
    color: colors.text,
    fontSize: Typography.h1.fontSize,
    fontWeight: Typography.h1.fontWeight,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  charCountOver: {
    color: SemanticColors.warning,
    textAlign: 'right',
    paddingHorizontal: Spacing.lg,
  },
  errorBanner: {
    backgroundColor: colors.errorBannerBg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: SemanticColors.warning,
  },
  editorArea: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
})
