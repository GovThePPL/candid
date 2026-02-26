import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Modal,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import useKeyboardHeight from '../../hooks/useKeyboardHeight'
import useModalBackHandler from '../../hooks/useModalBackHandler'
import { Typography, Spacing, BorderRadius } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import LocationPicker from '../LocationPicker'
import WysiwygEditor from '../WysiwygEditor'
import TagSelectorModal from '../TagSelectorModal'
import DiffView from './DiffView'
import ReviewChanges from './ReviewChanges'
import api from '../../lib/api'

/**
 * Form for creating wiki suggestions (new/edit term, new/edit page).
 *
 * @param {Object} props
 * @param {'new_term'|'edit_term'|'new_page'|'edit_page'} props.suggestionType
 * @param {Object} [props.existing] - Existing term/page data when editing
 * @param {number} [props.glossaryTermId] - Term ID for edit_term
 * @param {string} [props.glossaryTermSlug] - Term slug for direct edit
 * @param {string} [props.wikiPagePath] - Page path for edit_page
 * @param {boolean} [props.directEdit=false] - Submit directly via PUT instead of creating a suggestion
 * @param {Function} props.onSuccess - Called with the created suggestion
 * @param {Function} props.onCancel - Called when user cancels
 */
export default function SuggestionForm({
  suggestionType,
  existing,
  glossaryTermId,
  glossaryTermSlug,
  wikiPagePath,
  directEdit = false,
  reviewerEdit = false,
  onSuccess,
  onCancel,
}) {
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { keyboardHeight, webInitialHeight } = useKeyboardHeight()

  const isTerm = suggestionType === 'new_term' || suggestionType === 'edit_term'
  const isEdit = suggestionType === 'edit_term' || suggestionType === 'edit_page'

  // Form fields
  const [title, setTitle] = useState(existing?.term || existing?.title || '')
  const [aliases, setAliases] = useState(existing?.aliases || [])
  const [aliasInput, setAliasInput] = useState('')
  const [summary, setSummary] = useState(existing?.summary || '')
  const [wikiCategory, setWikiCategory] = useState(existing?.wikiCategory || '')
  const [scopes, setScopes] = useState(() => {
    if (existing?.scopes && existing.scopes.length > 0) return existing.scopes
    return []
  })
  const [scopeCombine, setScopeCombine] = useState(existing?.scopeCombine || 'or')
  const [reason, setReason] = useState('')

  // Locations for scope picker
  const [allLocations, setAllLocations] = useState([])
  const [allSessions, setAllSessions] = useState([])
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [addingScopeType, setAddingScopeType] = useState(null) // 'location' or 'session'

  // Wiki category picker
  const [wikiCategories, setWikiCategories] = useState([])
  const [showWikiCategoryPicker, setShowWikiCategoryPicker] = useState(false)

  // Content state (edited via full-screen editor)
  const [contentMarkdown, setContentMarkdown] = useState(existing?.content || '')
  const editorRef = useRef(null)
  const savedPendingImagesRef = useRef(new Map()) // survives editor unmount
  const [showFullEditor, setShowFullEditor] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [diffText, setDiffText] = useState('')
  const [showReview, setShowReview] = useState(false)

  // Direct create authority (new items only)
  const [canDirectCreate, setCanDirectCreate] = useState(false)
  const checkTimerRef = useRef(null)

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Load locations, sessions, and wiki categories for pickers
  useEffect(() => {
    const load = async () => {
      try {
        const results = await Promise.all([
          api.wiki.getCategories(),
          api.users.getAllLocations(),
          api.sessions.getAll(),
        ])
        setWikiCategories(Array.isArray(results[0]) ? results[0] : [])
        setAllLocations(Array.isArray(results[1]) ? results[1] : [])
        setAllSessions(Array.isArray(results[2]) ? results[2] : [])
      } catch {
        // Non-blocking — pickers just won't work
      }
    }
    load()
  }, [])

  // Check create authority when scopes change (new items only)
  useEffect(() => {
    if (isEdit || directEdit || reviewerEdit) return
    if (scopes.length === 0) {
      setCanDirectCreate(false)
      return
    }
    clearTimeout(checkTimerRef.current)
    checkTimerRef.current = setTimeout(async () => {
      try {
        const result = await api.wiki.checkCreateAuthority(
          scopes.map(s => ({ type: s.type, id: s.id }))
        )
        setCanDirectCreate(result?.canCreate || false)
      } catch {
        setCanDirectCreate(false)
      }
    }, 500)
    return () => clearTimeout(checkTimerRef.current)
  }, [scopes, isEdit, directEdit, reviewerEdit])

  // Get form title
  const formTitle = useMemo(() => {
    if (reviewerEdit) return t('editAndApprove')
    if (suggestionType === 'new_term') return t('suggestionFormTitleNewTerm')
    if (suggestionType === 'edit_term') return t('suggestionFormTitleEditTerm')
    if (suggestionType === 'new_page') return t('suggestionFormTitleNewPage')
    if (suggestionType === 'edit_page') return t('suggestionFormTitleEditPage')
    return ''
  }, [suggestionType, reviewerEdit, t])

  // --- Alias management ---
  const handleAddAlias = useCallback(() => {
    const trimmed = aliasInput.trim()
    if (trimmed && !aliases.includes(trimmed)) {
      setAliases(prev => [...prev, trimmed])
    }
    setAliasInput('')
  }, [aliasInput, aliases])

  const handleRemoveAlias = useCallback((alias) => {
    setAliases(prev => prev.filter(a => a !== alias))
  }, [])

  // --- Scope management ---
  const handleAddLocationScope = useCallback(() => {
    setAddingScopeType('location')
    setShowLocationPicker(true)
  }, [])

  const handleLocationSelected = useCallback((locationId) => {
    const loc = allLocations.find(l => l.id === locationId)
    if (loc && !scopes.some(s => s.type === 'location' && s.id === locationId)) {
      setScopes(prev => [...prev, { type: 'location', id: locationId, label: loc.name }])
    }
    setShowLocationPicker(false)
    setAddingScopeType(null)
  }, [allLocations, scopes])

  const handleAddSessionScope = useCallback(() => {
    setAddingScopeType('session')
  }, [])

  const handleSessionSelected = useCallback((sess) => {
    const alreadySelected = scopes.some(s => s.type === 'session' && s.id === sess.id)
    if (alreadySelected) {
      setScopes(prev => prev.filter(s => !(s.type === 'session' && s.id === sess.id)))
    } else {
      setScopes(prev => [...prev, { type: 'session', id: sess.id, label: sess.label }])
    }
  }, [scopes])

  const handleCloseSessionPicker = useCallback(() => {
    setAddingScopeType(null)
  }, [])

  const handleRemoveScope = useCallback((index) => {
    setScopes(prev => prev.filter((_, i) => i !== index))
  }, [])

  // --- Full-screen editor ---
  const handleOpenFullEditor = useCallback(() => {
    setShowDiff(false)
    setShowFullEditor(true)
    // Restore saved pending images when editor remounts
    requestAnimationFrame(() => {
      if (savedPendingImagesRef.current.size > 0 && editorRef.current?.setPendingImages) {
        editorRef.current.setPendingImages(new Map(savedPendingImagesRef.current))
      }
    })
  }, [])

  const handleCloseFullEditor = useCallback(async () => {
    try {
      // Save pending images before editor unmounts (so we can upload at submit time)
      if (editorRef.current?.hasPendingImages?.()) {
        const map = editorRef.current.getPendingImages()
        // Merge into saved map (user may open/close editor multiple times)
        for (const [key, val] of map.entries()) {
          savedPendingImagesRef.current.set(key, val)
        }
      }
      const md = await Promise.race([
        editorRef.current?.getMarkdown(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
      ])
      if (md != null) setContentMarkdown(md)
    } catch {
      // getMarkdown() hung or failed — contentMarkdown already has the last known value
    }
    setShowFullEditor(false)
    setShowDiff(false)
  }, [])

  // Browser back / Escape closes modals on web (Android uses onRequestClose)
  const handleCloseReview = useCallback(() => setShowReview(false), [])
  useModalBackHandler(showFullEditor, handleCloseFullEditor)
  useModalBackHandler(showReview, handleCloseReview)

  const handleToggleDiff = useCallback(async () => {
    if (!showDiff) {
      try {
        const md = await Promise.race([
          editorRef.current?.getMarkdown(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
        ])
        const captured = md || ''
        setContentMarkdown(captured)
        // Replace data URI image markdown with a short placeholder —
        // images are shown separately, and data URIs freeze the diff
        setDiffText(captured.replace(/!\[([^\]]*)\]\(data:[^)]+\)/g, '![$1](pending-upload)'))
      } catch {
        setDiffText(contentMarkdown.replace(/!\[([^\]]*)\]\(data:[^)]+\)/g, '![$1](pending-upload)'))
      }
    }
    setShowDiff(prev => !prev)
  }, [showDiff, contentMarkdown])

  // --- Submit ---
  const canSubmit = useMemo(() => {
    if (!title.trim()) return false
    if (isTerm && scopes.length === 0) return false
    if (submitting) return false
    return true
  }, [title, isTerm, scopes, submitting])

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    try {
      // Upload any deferred images and get final markdown with real URLs
      let finalContent = contentMarkdown.trim() || undefined
      if (finalContent && editorRef.current?.hasPendingImages?.()) {
        // Editor still mounted — use its upload method directly
        finalContent = await editorRef.current.uploadPendingImages()
        finalContent = finalContent?.trim() || undefined
      } else if (finalContent && savedPendingImagesRef.current.size > 0) {
        // Editor unmounted — upload from saved pending images
        const pending = savedPendingImagesRef.current
        for (const [tempUrl, { formData }] of pending.entries()) {
          const serverUrl = await api.wiki.uploadImage(formData)
          if (serverUrl) {
            finalContent = finalContent.split(tempUrl).join(serverUrl)
          }
        }
        if (Platform.OS === 'web') {
          for (const tempUrl of pending.keys()) {
            try { URL.revokeObjectURL(tempUrl) } catch {}
          }
        }
        pending.clear()
      }

      // Fallback: if blob URLs remain (e.g. pending images map was lost on
      // editor unmount), fetch the blobs and upload them now
      if (finalContent && Platform.OS === 'web') {
        const blobRegex = /blob:https?:\/\/[^\s)]+/g
        const blobUrls = [...new Set(finalContent.match(blobRegex) || [])]
        for (const blobUrl of blobUrls) {
          try {
            const resp = await fetch(blobUrl)
            const blob = await resp.blob()
            const formData = new FormData()
            formData.append('file', blob, 'image.png')
            const serverUrl = await api.wiki.uploadImage(formData)
            if (serverUrl) {
              finalContent = finalContent.split(blobUrl).join(serverUrl)
            }
          } catch {
            // Blob URL expired or revoked — remove the broken image reference
            finalContent = finalContent.replace(
              new RegExp(`!\\[[^\\]]*\\]\\(${blobUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'),
              ''
            )
          }
        }
        finalContent = finalContent?.trim() || undefined
      }

      if (reviewerEdit) {
        // Reviewer edit — return edited data to parent, no API call
        const editedData = {
          proposedTitle: title.trim(),
          proposedAliases: isTerm ? aliases : undefined,
          proposedSummary: summary.trim() || undefined,
          proposedContent: finalContent,
          proposedWikiCategory: wikiCategory.trim() || undefined,
          proposedScopes: scopes.map(s => ({ type: s.type, id: s.id })),
          proposedScopeCombine: scopes.length > 0 ? scopeCombine : undefined,
        }
        setShowReview(false)
        onSuccess?.(editedData)
        return
      }

      if (directEdit) {
        // Direct edit — PUT to the update endpoint
        if (isTerm) {
          const editBody = {
            term: title.trim(),
            title: title.trim(),
            summary: summary.trim() || undefined,
            content: finalContent,
            wikiCategory: wikiCategory.trim() || undefined,
            aliases,
            scopes: scopes.map(s => ({ type: s.type, id: s.id })),
            scopeCombine,
          }
          const result = await api.glossary.updateTerm(glossaryTermSlug, editBody)
          setShowReview(false)
          onSuccess?.(result)
        } else {
          const editBody = {
            title: title.trim(),
            description: summary.trim() || undefined,
            content: finalContent,
            wikiCategory: wikiCategory.trim() || undefined,
            scopes: scopes.map(s => ({ type: s.type, id: s.id })),
            scopeCombine,
          }
          const result = await api.wiki.updatePage(wikiPagePath, editBody)
          setShowReview(false)
          onSuccess?.(result)
        }
      } else if (canDirectCreate && !isEdit) {
        // Direct create — POST
        if (isTerm) {
          const createBody = {
            term: title.trim(),
            summary: summary.trim() || undefined,
            content: finalContent,
            wikiCategory: wikiCategory.trim() || undefined,
            aliases,
            scopes: scopes.map(s => ({ type: s.type, id: s.id })),
            scopeCombine,
          }
          const result = await api.glossary.createTerm(createBody)
          setShowReview(false)
          onSuccess?.(result)
        } else {
          const createBody = {
            title: title.trim(),
            description: summary.trim() || undefined,
            content: finalContent,
            wikiCategory: wikiCategory.trim() || undefined,
            scopes: scopes.map(s => ({ type: s.type, id: s.id })),
            scopeCombine,
          }
          const result = await api.wiki.createPage(createBody)
          setShowReview(false)
          onSuccess?.(result)
        }
      } else {
        // Suggestion workflow
        const body = {
          suggestionType,
          proposedTitle: title.trim(),
          proposedAliases: isTerm ? aliases : undefined,
          proposedSummary: summary.trim() || undefined,
          proposedContent: finalContent,
          proposedWikiCategory: wikiCategory.trim() || undefined,
          proposedScopes: scopes.map(s => ({ type: s.type, id: s.id })),
          proposedScopeCombine: scopes.length > 0 ? scopeCombine : undefined,
          suggestionReason: reason.trim() || undefined,
        }

        if (isEdit && glossaryTermId) body.glossaryTermId = glossaryTermId
        if (isEdit && wikiPagePath) body.wikiPagePath = wikiPagePath

        const result = await api.wiki.createSuggestion(body)
        setShowReview(false)
        onSuccess?.(result)
      }
    } catch (err) {
      const status = err?.status || err?.response?.status
      if (status === 409) {
        setError(t('slugConflict'))
      } else {
        const msg = err?.body?.detail || err?.message || t('suggestionError')
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }, [
    canSubmit, suggestionType, title, aliases, summary, contentMarkdown,
    wikiCategory, scopes, scopeCombine, reason, isEdit, isTerm,
    glossaryTermId, glossaryTermSlug, wikiPagePath, directEdit, reviewerEdit, canDirectCreate, existing, onSuccess, t,
  ])

  return (
    <View style={styles.outerContainer}>
      {/* Sticky header — always visible above ScrollView */}
      <View style={styles.header}>
        <ThemedText variant="h3" color="dark">{formTitle}</ThemedText>
        <TouchableOpacity
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={t('common:cancel')}
        >
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        !showFullEditor && keyboardHeight > 0 && { paddingBottom: keyboardHeight },
        !showFullEditor && Platform.OS === 'web' && webInitialHeight > 0 && { minHeight: webInitialHeight },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Title */}
      <View style={styles.field}>
        <ThemedText variant="label" color="secondary">{t('suggestionTitle')}</ThemedText>
        <TextInput
          style={styles.textInput}
          value={title}
          onChangeText={setTitle}
          placeholder={t('suggestionTitlePlaceholder')}
          placeholderTextColor={colors.placeholderText}
          maxFontSizeMultiplier={1.5}
          accessibilityLabel={t('suggestionTitle')}
        />
      </View>

      {/* Aliases (terms only) */}
      {isTerm && (
        <View style={styles.field}>
          <ThemedText variant="label" color="secondary">{t('suggestionAliases')}</ThemedText>
          <ThemedText variant="caption" color="secondary">{t('suggestionAliasesHint')}</ThemedText>
          <View style={styles.aliasInputRow}>
            <TextInput
              style={[styles.textInput, { flex: 1 }]}
              value={aliasInput}
              onChangeText={setAliasInput}
              placeholder={t('suggestionAliasesPlaceholder')}
              placeholderTextColor={colors.placeholderText}
              onSubmitEditing={handleAddAlias}
              returnKeyType="done"
              maxFontSizeMultiplier={1.5}
              accessibilityLabel={t('suggestionAliasesPlaceholder')}
            />
            <TouchableOpacity
              onPress={handleAddAlias}
              style={styles.addButton}
              accessibilityRole="button"
              accessibilityLabel={t('common:add')}
              disabled={!aliasInput.trim()}
            >
              <Ionicons name="add-circle" size={28} color={aliasInput.trim() ? colors.primary : colors.placeholderText} />
            </TouchableOpacity>
          </View>
          {aliases.length > 0 && (
            <View style={styles.chipRow}>
              {aliases.map((alias) => (
                <View key={alias} style={styles.chip}>
                  <ThemedText variant="caption" color="dark">{alias}</ThemedText>
                  <TouchableOpacity
                    onPress={() => handleRemoveAlias(alias)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('common:remove')} ${alias}`}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={16} color={colors.secondaryText} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Summary */}
      <View style={styles.field}>
        <ThemedText variant="label" color="secondary">{t('suggestionSummary')}</ThemedText>
        <TextInput
          style={[styles.textInput, styles.multiline]}
          value={summary}
          onChangeText={setSummary}
          placeholder={t('suggestionSummaryPlaceholder')}
          placeholderTextColor={colors.placeholderText}
          multiline
          numberOfLines={3}
          maxFontSizeMultiplier={1.5}
          accessibilityLabel={t('suggestionSummary')}
        />
      </View>

      {/* Content */}
      <View style={styles.field}>
        <ThemedText variant="label" color="secondary">{t('suggestionContent')}</ThemedText>
        <TouchableOpacity
          style={styles.editContentButton}
          onPress={handleOpenFullEditor}
          accessibilityRole="button"
          accessibilityLabel={t('editPageButtonA11y')}
        >
          <View style={styles.editContentButtonInner}>
            <Ionicons name="create-outline" size={20} color={colors.primary} />
            <ThemedText variant="buttonSmall" style={{ color: colors.primary }}>
              {t('editPageButton')}
            </ThemedText>
          </View>
          {contentMarkdown.trim() ? (
            <ThemedText
              variant="caption"
              color="secondary"
              numberOfLines={2}
              style={styles.contentPreview}
            >
              {contentMarkdown.trim()}
            </ThemedText>
          ) : null}
        </TouchableOpacity>
        {isEdit && (
          <TouchableOpacity
            style={styles.viewChangesButton}
            onPress={() => { setError(null); setShowReview(true) }}
            accessibilityRole="button"
            accessibilityLabel={t('reviewChangesA11y')}
          >
            <Ionicons name="git-compare-outline" size={16} color={colors.primary} />
            <ThemedText variant="caption" style={{ color: colors.primary }}>
              {t('viewChangesForm')}
            </ThemedText>
          </TouchableOpacity>
        )}
      </View>

      {/* Wiki Category */}
      <View style={styles.field}>
        <ThemedText variant="label" color="secondary">{t('suggestionCategory')}</ThemedText>
        {wikiCategory ? (
          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <ThemedText variant="caption" color="dark">{wikiCategory}</ThemedText>
              <TouchableOpacity
                onPress={() => setWikiCategory('')}
                accessibilityRole="button"
                accessibilityLabel={t('wikiCategoryRemoveA11y', { label: wikiCategory })}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={16} color={colors.secondaryText} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.scopeButton}
            onPress={() => setShowWikiCategoryPicker(true)}
            accessibilityRole="button"
            accessibilityLabel={t('wikiCategorySelectA11y')}
          >
            <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
            <ThemedText variant="caption" color="primary">{t('wikiCategorySelect')}</ThemedText>
          </TouchableOpacity>
        )}
        <TagSelectorModal
          visible={showWikiCategoryPicker}
          onClose={() => setShowWikiCategoryPicker(false)}
          title={t('suggestionCategory')}
          items={wikiCategories.map(c => ({ id: c, label: c }))}
          selected={wikiCategory ? [wikiCategory] : []}
          onToggle={(id) => setWikiCategory(prev => prev === id ? '' : id)}
          multiSelect={false}
          allowCreate
          onCreateItem={(label) => {
            setWikiCategories(prev => [...prev, label])
            setWikiCategory(label)
          }}
          searchPlaceholder={t('suggestionCategoryPlaceholder')}
          searchA11yLabel={t('suggestionCategory')}
        />
      </View>

      {/* Scope tags */}
      <View style={styles.field}>
        <ThemedText variant="label" color="secondary">{t('suggestionScopes')}</ThemedText>
        <ThemedText variant="caption" color="secondary">
          {isTerm ? t('suggestionScopesRequired') : t('suggestionScopesOptional')}
        </ThemedText>

        {/* Current scopes */}
        {scopes.length > 0 && (
          <View style={styles.chipRow}>
            {scopes.map((scope, i) => (
              <View key={`${scope.type}-${scope.id}`} style={styles.scopeChip}>
                <Ionicons
                  name={scope.type === 'location' ? 'location-outline' : 'grid-outline'}
                  size={14}
                  color={colors.primary}
                />
                <ThemedText variant="caption" color="dark">{scope.label || scope.id}</ThemedText>
                <TouchableOpacity
                  onPress={() => handleRemoveScope(i)}
                  accessibilityRole="button"
                  accessibilityLabel={t('suggestionRemoveScopeA11y', { label: scope.label || scope.id })}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={16} color={colors.secondaryText} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Add scope buttons */}
        <View style={styles.scopeButtonRow}>
          <TouchableOpacity
            style={styles.scopeButton}
            onPress={handleAddLocationScope}
            accessibilityRole="button"
            accessibilityLabel={t('suggestionAddScopeA11y')}
          >
            <Ionicons name="location-outline" size={16} color={colors.primary} />
            <ThemedText variant="caption" color="primary">{t('suggestionScopeLocation')}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.scopeButton}
            onPress={handleAddSessionScope}
            accessibilityRole="button"
            accessibilityLabel={t('suggestionAddScopeA11y')}
          >
            <Ionicons name="grid-outline" size={16} color={colors.primary} />
            <ThemedText variant="caption" color="primary">{t('suggestionScopeSession')}</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Session picker modal */}
        <TagSelectorModal
          visible={addingScopeType === 'session'}
          onClose={handleCloseSessionPicker}
          title={t('suggestionScopeSession')}
          items={allSessions.map(c => ({ id: c.id, label: c.label }))}
          selected={scopes.filter(s => s.type === 'session').map(s => s.id)}
          onToggle={(id) => handleSessionSelected(allSessions.find(c => c.id === id))}
          multiSelect
          searchPlaceholder={t('scopeSessionSearchPlaceholder')}
          searchA11yLabel={t('scopeSessionSearchA11y')}
        />

        {/* Scope combine mode */}
        {scopes.length > 1 && (
          <View style={styles.combineRow}>
            <ThemedText variant="caption" color="secondary">{t('suggestionScopeCombine')}:</ThemedText>
            <TouchableOpacity
              style={[styles.combineOption, scopeCombine === 'or' && styles.combineOptionActive]}
              onPress={() => setScopeCombine('or')}
              accessibilityRole="radio"
              accessibilityState={{ selected: scopeCombine === 'or' }}
              accessibilityLabel={t('suggestionScopeCombineOr')}
            >
              <ThemedText
                variant="caption"
                style={{ color: scopeCombine === 'or' ? colors.buttonSelectedText : colors.text }}
              >
                {t('suggestionScopeCombineOr')}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.combineOption, scopeCombine === 'and' && styles.combineOptionActive]}
              onPress={() => setScopeCombine('and')}
              accessibilityRole="radio"
              accessibilityState={{ selected: scopeCombine === 'and' }}
              accessibilityLabel={t('suggestionScopeCombineAnd')}
            >
              <ThemedText
                variant="caption"
                style={{ color: scopeCombine === 'and' ? colors.buttonSelectedText : colors.text }}
              >
                {t('suggestionScopeCombineAnd')}
              </ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Reason (suggestion mode only) */}
      {!directEdit && !reviewerEdit && !canDirectCreate && (
        <View style={styles.field}>
          <ThemedText variant="label" color="secondary">{t('suggestionReason')}</ThemedText>
          <ThemedText variant="caption" color="secondary">{t('suggestionReasonHint')}</ThemedText>
          <TextInput
            style={[styles.textInput, styles.multiline]}
            value={reason}
            onChangeText={setReason}
            placeholder={t('suggestionReasonPlaceholder')}
            placeholderTextColor={colors.placeholderText}
            multiline
            numberOfLines={2}
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('suggestionReason')}
          />
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color={colors.warning || '#EF4C45'} />
          <ThemedText variant="bodySmall" style={{ color: colors.warning || '#EF4C45', flex: 1 }}>
            {error}
          </ThemedText>
        </View>
      )}

      {/* Direct create hint */}
      {canDirectCreate && !isEdit && (
        <View style={styles.directCreateHint}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <ThemedText variant="caption" color="secondary">{t('directCreateHint')}</ThemedText>
        </View>
      )}

      {/* Submit */}
      {isEdit ? (
        <TouchableOpacity
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          onPress={() => { setError(null); setShowReview(true) }}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={t('reviewAndSubmitA11y')}
          accessibilityState={{ disabled: !canSubmit }}
        >
          <ThemedText variant="button" style={{ color: '#FFFFFF' }}>
            {t('reviewAndSubmit')}
          </ThemedText>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={
            reviewerEdit ? t('editAndApproveA11y')
              : directEdit ? t('directEditSubmitA11y')
              : canDirectCreate ? t('directCreateSubmitA11y')
              : t('suggestionSubmitA11y')
          }
          accessibilityState={{ disabled: !canSubmit }}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <ThemedText variant="button" style={{ color: '#FFFFFF' }}>
              {reviewerEdit ? t('editAndApprove')
                : directEdit ? t('directEditSubmit')
                : canDirectCreate ? t('directCreateSubmit')
                : t('suggestionSubmit')}
            </ThemedText>
          )}
        </TouchableOpacity>
      )}

    </ScrollView>

      {/* Full-Screen Markdown Editor Modal */}
      {showFullEditor && (
      <Modal
        visible={showFullEditor}
        animationType="slide"
        onRequestClose={handleCloseFullEditor}
      >
        <SafeAreaView style={styles.fullEditorSafe}>
          {/* Sticky header */}
          <View style={styles.fullEditorHeader}>
            <ThemedText variant="h3" color="dark">{t('editPageTitle')}</ThemedText>
            <View style={styles.fullEditorHeaderActions}>
              <TouchableOpacity
                style={[
                  styles.viewChangesButton,
                  showDiff && styles.viewChangesButtonActive,
                ]}
                onPress={handleToggleDiff}
                accessibilityRole="button"
                accessibilityLabel={t('viewChangesA11y')}
                accessibilityState={{ selected: showDiff }}
              >
                <Ionicons
                  name="git-compare-outline"
                  size={16}
                  color={showDiff ? colors.buttonSelectedText : colors.primary}
                />
                <ThemedText
                  variant="caption"
                  style={{
                    color: showDiff ? colors.buttonSelectedText : colors.primary,
                  }}
                >
                  {t('viewChanges')}
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCloseFullEditor}
                accessibilityRole="button"
                accessibilityLabel={t('editPageDoneA11y')}
              >
                <ThemedText variant="button" style={{ color: colors.primary }}>
                  {t('editPageDone')}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          {/* Editor or Diff */}
          {showDiff ? (
            <ScrollView style={styles.fullEditorBody}>
              <DiffView
                original={existing?.content || ''}
                edited={diffText}
              />
            </ScrollView>
          ) : (
            <WysiwygEditor
              ref={editorRef}
              initialMarkdown={contentMarkdown}
              allowImages={true}
              deferUpload
              placeholder={t('suggestionContentPlaceholder')}
              fullScreen
              variant="wiki"
            />
          )}
        </SafeAreaView>
      </Modal>
      )}

      {/* Review Changes Modal */}
      {showReview && (
        <Modal
          visible
          animationType="slide"
          onRequestClose={handleCloseReview}
        >
          <SafeAreaView style={styles.fullEditorSafe}>
            <ReviewChanges
              original={{
                title: existing?.term || existing?.title || '',
                aliases: existing?.aliases || [],
                summary: existing?.summary || '',
                content: existing?.content || '',
                wikiCategory: existing?.wikiCategory || '',
                scopes: existing?.scopes || [],
                scopeCombine: existing?.scopeCombine || 'or',
              }}
              proposed={{
                title,
                aliases,
                summary,
                content: contentMarkdown,
                wikiCategory,
                scopes,
                scopeCombine,
              }}
              isTerm={isTerm}
              onSubmit={handleSubmit}
              onClose={handleCloseReview}
              submitLabel={reviewerEdit ? t('editAndApprove') : directEdit ? t('directEditSubmit') : canDirectCreate ? t('directCreateSubmit') : t('suggestionSubmit')}
              submitting={submitting}
              error={error}
            />
          </SafeAreaView>
        </Modal>
      )}

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <LocationPicker
          visible={showLocationPicker}
          onClose={() => { setShowLocationPicker(false); setAddingScopeType(null) }}
          allLocations={allLocations}
          currentLocationId={null}
          onSelect={handleLocationSelected}
        />
      )}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.background,
  },
  field: {
    gap: 6,
  },
  textInput: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    ...Typography.body,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  contentLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aliasInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addButton: {
    padding: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  scopeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.badgeBg,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  scopeButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  scopeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: BorderRadius.sm,
  },
  combineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  combineOption: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  combineOptionActive: {
    backgroundColor: colors.buttonSelected,
    borderColor: colors.buttonSelected,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.errorBannerBg,
    borderRadius: BorderRadius.sm,
  },
  directCreateHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  editContentButton: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: BorderRadius.sm,
    padding: 12,
    gap: 8,
    backgroundColor: colors.cardBackground,
  },
  editContentButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contentPreview: {
    marginTop: 2,
  },
  fullEditorSafe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fullEditorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.navBackground,
    zIndex: 1,
  },
  fullEditorHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  viewChangesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  viewChangesButtonActive: {
    backgroundColor: colors.buttonSelected,
    borderColor: colors.buttonSelected,
  },
  fullEditorBody: {
    flex: 1,
  },
})
