import { useMemo, useState, useCallback } from 'react'
import { View, Image, Modal, StyleSheet, Platform, Text, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Typography, Spacing, BorderRadius } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import { computeLineDiff, computeCharDiff } from '../../lib/lineDiff'
import { API_BASE_URL } from '../../lib/api'
import ContentPreviewModal from './ContentPreviewModal'

/**
 * Extracts compact diff groups from hunks with limited context lines.
 */
function getCompactGroups(hunks, contextLines = 2) {
  const changedIndices = []
  hunks.forEach((h, i) => {
    if (h.type !== 'same') changedIndices.push(i)
  })

  if (changedIndices.length === 0) return []

  const visible = new Set()
  for (const idx of changedIndices) {
    for (let i = Math.max(0, idx - contextLines); i <= Math.min(hunks.length - 1, idx + contextLines); i++) {
      visible.add(i)
    }
  }

  const sortedVisible = [...visible].sort((a, b) => a - b)
  const groups = []
  let currentGroup = []

  for (let i = 0; i < sortedVisible.length; i++) {
    if (currentGroup.length > 0 && sortedVisible[i] !== sortedVisible[i - 1] + 1) {
      groups.push(currentGroup)
      currentGroup = []
    }
    currentGroup.push(hunks[sortedVisible[i]])
  }
  if (currentGroup.length > 0) groups.push(currentGroup)

  return groups
}

/**
 * Pairs consecutive remove/add hunks for character-level diffing.
 */
function pairHunksForCharDiff(hunks) {
  const result = []
  let i = 0
  while (i < hunks.length) {
    if (hunks[i].type === 'remove') {
      const removes = []
      while (i < hunks.length && hunks[i].type === 'remove') {
        removes.push(hunks[i])
        i++
      }
      const adds = []
      while (i < hunks.length && hunks[i].type === 'add') {
        adds.push(hunks[i])
        i++
      }
      const pairCount = Math.min(removes.length, adds.length)
      for (let p = 0; p < pairCount; p++) {
        const { oldSegments, newSegments } = computeCharDiff(removes[p].text, adds[p].text)
        result.push({ type: 'remove', text: removes[p].text, segments: oldSegments })
        result.push({ type: 'add', text: adds[p].text, segments: newSegments })
      }
      for (let p = pairCount; p < removes.length; p++) result.push(removes[p])
      for (let p = pairCount; p < adds.length; p++) result.push(adds[p])
    } else {
      result.push(hunks[i])
      i++
    }
  }
  return result
}

const apiOrigin = API_BASE_URL.replace(/\/api\/v1\/?$/, '')
function resolveImageUrl(url) {
  if (url?.startsWith('/')) return apiOrigin + url
  return url
}

/** Replace data URIs in markdown with a short placeholder for diffing. */
function stripDataUrls(md) {
  return (md || '').replace(/!\[([^\]]*)\]\(data:[^)]+\)/g, '![$1](pending-upload)')
}

/** Short display label for image URLs (truncate data URIs). */
function shortImageLabel(url) {
  if (url?.startsWith('data:')) return '(pending upload)'
  return url
}

/**
 * Standalone diff content component — field-by-field diff display without
 * header, footer, submit button, or error banner. Used by both ReviewChanges
 * and SuggestionDetail.
 *
 * @param {Object} props
 * @param {Object} props.original - Original field values
 * @param {Object} props.proposed - Proposed field values
 * @param {boolean} props.isTerm - Whether this is a term (show aliases/scopes/scopeCombine)
 * @param {Function} [props.onImagePress] - Optional image press handler
 */
export default function ReviewDiffContent({
  original,
  proposed,
  isTerm,
  onImagePress: externalImagePress,
}) {
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [showContentPreview, setShowContentPreview] = useState(false)
  const handleImagePress = useCallback((url) => {
    if (externalImagePress) {
      externalImagePress(url)
    } else {
      setLightboxUrl(resolveImageUrl(url))
    }
  }, [externalImagePress])
  const handleLightboxClose = useCallback(() => setLightboxUrl(null), [])

  // --- Compute diffs for each field ---
  const titleChanged = (original.title || '') !== (proposed.title || '')
  const summaryChanged = (original.summary || '') !== (proposed.summary || '')
  const categoryChanged = (original.wikiCategory || '') !== (proposed.wikiCategory || '')
  const scopeCombineChanged = (original.scopeCombine || 'or') !== (proposed.scopeCombine || 'or')

  const aliasesDiff = useMemo(() => {
    if (!isTerm) return null
    const origSet = new Set(original.aliases || [])
    const propSet = new Set(proposed.aliases || [])
    const removed = [...origSet].filter(a => !propSet.has(a))
    const added = [...propSet].filter(a => !origSet.has(a))
    if (removed.length === 0 && added.length === 0) return null
    return { removed, added }
  }, [isTerm, original.aliases, proposed.aliases])

  const contentDiff = useMemo(() => {
    // Strip data URIs before diffing — images are shown in their own section
    const origContent = stripDataUrls(original.content)
    const propContent = stripDataUrls(proposed.content)
    if (origContent === propContent) return null
    const hunks = computeLineDiff(origContent, propContent)
    const hasChanges = hunks.some(h => h.type !== 'same')
    if (!hasChanges) return null
    const groups = getCompactGroups(hunks, 2)
    return groups.map(group => pairHunksForCharDiff(group))
  }, [original.content, proposed.content])

  const scopesDiff = useMemo(() => {
    const origScopes = original.scopes || []
    const propScopes = proposed.scopes || []
    const origKeys = new Set(origScopes.map(s => `${s.type}-${s.id}`))
    const propKeys = new Set(propScopes.map(s => `${s.type}-${s.id}`))
    const removed = origScopes.filter(s => !propKeys.has(`${s.type}-${s.id}`))
    const added = propScopes.filter(s => !origKeys.has(`${s.type}-${s.id}`))
    if (removed.length === 0 && added.length === 0) return null
    return { removed, added }
  }, [original.scopes, proposed.scopes])

  const imagesDiff = useMemo(() => {
    const extractImages = (md) => {
      const urls = []
      const regex = /!\[([^\]]*)\]\(([^)]+)\)/g
      let match
      while ((match = regex.exec(md || '')) !== null) {
        urls.push(match[2])
      }
      return urls
    }
    const origImages = new Set(extractImages(original.content))
    const propImages = new Set(extractImages(proposed.content))
    const added = [...propImages].filter(u => !origImages.has(u))
    const removed = [...origImages].filter(u => !propImages.has(u))
    if (added.length === 0 && removed.length === 0) return null
    return { added, removed }
  }, [original.content, proposed.content])

  const hasAnyChanges = titleChanged || summaryChanged || categoryChanged
    || scopeCombineChanged || aliasesDiff || contentDiff || scopesDiff || imagesDiff

  // --- Render helpers ---
  const renderTextDiff = (label, oldVal, newVal) => {
    const oldText = oldVal || ''
    const newText = newVal || ''
    const isEmpty = (s) => !s
    if (isEmpty(oldText) || isEmpty(newText)) {
      return (
        <View style={styles.section}>
          <ThemedText variant="label" color="secondary">{label}</ThemedText>
          <View style={[styles.diffLine, styles.removeBg]}>
            <Text style={styles.removeText}>{oldText || t('reviewEmpty')}</Text>
          </View>
          <View style={[styles.diffLine, styles.addBg]}>
            <Text style={styles.addText}>{newText || t('reviewEmpty')}</Text>
          </View>
        </View>
      )
    }
    const { oldSegments, newSegments } = computeCharDiff(oldText, newText)
    return (
      <View style={styles.section}>
        <ThemedText variant="label" color="secondary">{label}</ThemedText>
        <View style={[styles.diffLine, styles.removeBg]}>
          <Text style={styles.removeText}>
            {oldSegments.map((seg, i) =>
              seg.highlighted ? (
                <Text key={i} style={styles.removeHighlight}>{seg.text}</Text>
              ) : (
                <Text key={i}>{seg.text}</Text>
              )
            )}
          </Text>
        </View>
        <View style={[styles.diffLine, styles.addBg]}>
          <Text style={styles.addText}>
            {newSegments.map((seg, i) =>
              seg.highlighted ? (
                <Text key={i} style={styles.addHighlight}>{seg.text}</Text>
              ) : (
                <Text key={i}>{seg.text}</Text>
              )
            )}
          </Text>
        </View>
      </View>
    )
  }

  const renderContentLine = (hunk, index) => (
    <View
      key={index}
      style={[styles.codeLine, styles[`${hunk.type}Bg`]]}
    >
      <Text style={[styles.prefix, styles[`${hunk.type}Text`]]}>
        {hunk.type === 'add' ? '+' : hunk.type === 'remove' ? '-' : ' '}
      </Text>
      {hunk.segments ? (
        <Text style={[styles.codeText, styles[`${hunk.type}Text`]]} numberOfLines={0}>
          {hunk.segments.map((seg, si) =>
            seg.highlighted ? (
              <Text key={si} style={styles[`${hunk.type}Highlight`]}>{seg.text}</Text>
            ) : (
              <Text key={si}>{seg.text}</Text>
            )
          )}
        </Text>
      ) : (
        <Text style={[styles.codeText, styles[`${hunk.type}Text`]]} numberOfLines={0}>
          {hunk.text}
        </Text>
      )}
    </View>
  )

  if (!hasAnyChanges) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="checkmark-circle-outline" size={48} color={colors.secondaryText} />
        <ThemedText variant="h3" color="secondary">{t('reviewNoChanges')}</ThemedText>
        <ThemedText variant="bodySmall" color="secondary">{t('reviewNoChangesSubtitle')}</ThemedText>
      </View>
    )
  }

  return (
    <View style={styles.diffContainer}>
      {/* Title */}
      {titleChanged && renderTextDiff(
        t('suggestionTitle'),
        original.title,
        proposed.title,
      )}

      {/* Aliases */}
      {aliasesDiff && (
        <View style={styles.section}>
          <ThemedText variant="label" color="secondary">{t('suggestionAliases')}</ThemedText>
          <View style={styles.chipRow}>
            {aliasesDiff.removed.map(alias => (
              <View key={`rm-${alias}`} style={[styles.chip, styles.removeBg]}>
                <Ionicons name="remove" size={12} color={colors.warning || '#EF4C45'} />
                <Text style={styles.removeText}>{alias}</Text>
              </View>
            ))}
            {aliasesDiff.added.map(alias => (
              <View key={`add-${alias}`} style={[styles.chip, styles.addBg]}>
                <Ionicons name="add" size={12} color={colors.severityLowText} />
                <Text style={styles.addText}>{alias}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Summary */}
      {summaryChanged && renderTextDiff(
        t('suggestionSummary'),
        original.summary,
        proposed.summary,
      )}

      {/* Content */}
      {contentDiff && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText variant="label" color="secondary">{t('suggestionContent')}</ThemedText>
            <TouchableOpacity
              onPress={() => setShowContentPreview(true)}
              style={styles.previewButton}
              accessibilityRole="button"
              accessibilityLabel={t('previewRenderedA11y')}
            >
              <Ionicons name="eye-outline" size={16} color={colors.primary} />
              <ThemedText variant="caption" style={{ color: colors.primary }}>{t('previewRendered')}</ThemedText>
            </TouchableOpacity>
          </View>
          {contentDiff.map((group, gi) => (
            <View key={gi}>
              {gi > 0 && (
                <View style={styles.separator}>
                  <ThemedText variant="caption" color="secondary">···</ThemedText>
                </View>
              )}
              {group.map((hunk, hi) => renderContentLine(hunk, hi))}
            </View>
          ))}
        </View>
      )}

      {/* Category */}
      {categoryChanged && renderTextDiff(
        t('suggestionCategory'),
        original.wikiCategory,
        proposed.wikiCategory,
      )}

      {/* Scopes */}
      {scopesDiff && (
        <View style={styles.section}>
          <ThemedText variant="label" color="secondary">{t('suggestionScopes')}</ThemedText>
          <View style={styles.chipRow}>
            {scopesDiff.removed.map(scope => (
              <View key={`rm-${scope.type}-${scope.id}`} style={[styles.scopeChip, styles.removeBg]}>
                <Ionicons
                  name={scope.type === 'location' ? 'location-outline' : 'grid-outline'}
                  size={14}
                  color={colors.warning || '#EF4C45'}
                />
                <Text style={styles.removeText}>{scope.label || scope.id}</Text>
              </View>
            ))}
            {scopesDiff.added.map(scope => (
              <View key={`add-${scope.type}-${scope.id}`} style={[styles.scopeChip, styles.addBg]}>
                <Ionicons
                  name={scope.type === 'location' ? 'location-outline' : 'grid-outline'}
                  size={14}
                  color={colors.severityLowText}
                />
                <Text style={styles.addText}>{scope.label || scope.id}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Scope Combine */}
      {scopeCombineChanged && renderTextDiff(
        t('suggestionScopeCombine'),
        original.scopeCombine === 'and' ? t('suggestionScopeCombineAnd') : t('suggestionScopeCombineOr'),
        proposed.scopeCombine === 'and' ? t('suggestionScopeCombineAnd') : t('suggestionScopeCombineOr'),
      )}

      {/* Images */}
      {imagesDiff && (
        <View style={styles.section}>
          <ThemedText variant="label" color="secondary">{t('reviewImages')}</ThemedText>
          {imagesDiff.removed.length > 0 && (
            <View style={styles.imageGroup}>
              <ThemedText variant="caption" color="secondary">{t('reviewImagesRemoved')}</ThemedText>
              {imagesDiff.removed.map((url, i) => (
                <TouchableOpacity
                  key={`rm-${i}`}
                  style={[styles.imageCard, styles.removeBg]}
                  onPress={() => handleImagePress(url)}
                  accessibilityRole="button"
                  accessibilityLabel={t('reviewImageTapA11y')}
                >
                  <Image
                    source={{ uri: resolveImageUrl(url) }}
                    style={styles.imageThumbnail}
                    accessibilityLabel={t('reviewImageA11y', { url })}
                  />
                  <Text style={[styles.removeText, styles.imageUrl]} numberOfLines={2}>{shortImageLabel(url)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {imagesDiff.added.length > 0 && (
            <View style={styles.imageGroup}>
              <ThemedText variant="caption" color="secondary">{t('reviewImagesAdded')}</ThemedText>
              {imagesDiff.added.map((url, i) => (
                <TouchableOpacity
                  key={`add-${i}`}
                  style={[styles.imageCard, styles.addBg]}
                  onPress={() => handleImagePress(url)}
                  accessibilityRole="button"
                  accessibilityLabel={t('reviewImageTapA11y')}
                >
                  <Image
                    source={{ uri: resolveImageUrl(url) }}
                    style={styles.imageThumbnail}
                    accessibilityLabel={t('reviewImageA11y', { url })}
                  />
                  <Text style={[styles.addText, styles.imageUrl]} numberOfLines={2}>{shortImageLabel(url)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Image lightbox (only if no external handler) */}
      {!externalImagePress && (
        <Modal
          visible={!!lightboxUrl}
          transparent
          animationType="fade"
          onRequestClose={handleLightboxClose}
        >
          <TouchableOpacity
            style={styles.lightboxOverlay}
            activeOpacity={1}
            onPress={handleLightboxClose}
            accessibilityRole="button"
            accessibilityLabel={t('common:close')}
          >
            <TouchableOpacity
              style={styles.lightboxCloseButton}
              onPress={handleLightboxClose}
              accessibilityRole="button"
              accessibilityLabel={t('common:close')}
              hitSlop={12}
            >
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Image
              source={{ uri: lightboxUrl }}
              style={styles.lightboxImage}
              resizeMode="contain"
              accessibilityLabel={t('reviewImageA11y', { url: lightboxUrl || '' })}
            />
          </TouchableOpacity>
        </Modal>
      )}

      {/* Content preview modal */}
      <ContentPreviewModal
        visible={showContentPreview}
        onClose={() => setShowContentPreview(false)}
        originalContent={original.content || ''}
        proposedContent={proposed.content || ''}
      />
    </View>
  )
}

/** Expose hasAnyChanges as a static helper for parent components */
ReviewDiffContent.hasChanges = function hasChanges(original, proposed, isTerm) {
  const titleChanged = (original.title || '') !== (proposed.title || '')
  const summaryChanged = (original.summary || '') !== (proposed.summary || '')
  const categoryChanged = (original.wikiCategory || '') !== (proposed.wikiCategory || '')
  const scopeCombineChanged = (original.scopeCombine || 'or') !== (proposed.scopeCombine || 'or')

  if (titleChanged || summaryChanged || categoryChanged || scopeCombineChanged) return true

  if (isTerm) {
    const origSet = new Set(original.aliases || [])
    const propSet = new Set(proposed.aliases || [])
    if ([...origSet].some(a => !propSet.has(a)) || [...propSet].some(a => !origSet.has(a))) return true
  }

  const origContent = original.content || ''
  const propContent = proposed.content || ''
  if (origContent !== propContent) return true

  const origScopes = original.scopes || []
  const propScopes = proposed.scopes || []
  const origKeys = new Set(origScopes.map(s => `${s.type}-${s.id}`))
  const propKeys = new Set(propScopes.map(s => `${s.type}-${s.id}`))
  if (origScopes.some(s => !propKeys.has(`${s.type}-${s.id}`)) ||
      propScopes.some(s => !origKeys.has(`${s.type}-${s.id}`))) return true

  return false
}

const createStyles = (colors) => StyleSheet.create({
  diffContainer: {
    gap: Spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: Spacing.sm,
  },
  section: {
    gap: Spacing.xs,
  },
  diffLine: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 4,
  },
  removeBg: {
    backgroundColor: colors.severityHighBg,
  },
  addBg: {
    backgroundColor: colors.severityLowBg,
  },
  removeText: {
    color: colors.warning || '#EF4C45',
    ...Typography.body,
  },
  addText: {
    color: colors.severityLowText,
    ...Typography.body,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  scopeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  codeLine: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    minHeight: 22,
  },
  sameBg: {
    backgroundColor: 'transparent',
  },
  prefix: {
    width: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    ...Typography.bodySmall,
  },
  codeText: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    ...Typography.bodySmall,
  },
  sameText: {
    color: colors.text,
  },
  addHighlight: {
    backgroundColor: (colors.severityLowText || '#81C784') + '40',
    borderRadius: 2,
  },
  removeHighlight: {
    backgroundColor: (colors.warning || '#EF4C45') + '40',
    borderRadius: 2,
  },
  separator: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  imageGroup: {
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  imageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  imageThumbnail: {
    width: 64,
    height: 64,
    borderRadius: 4,
    backgroundColor: colors.background,
  },
  imageUrl: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    ...Typography.caption,
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxCloseButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 24,
    right: 20,
    zIndex: 1,
    padding: 8,
  },
  lightboxImage: {
    width: '90%',
    height: '80%',
  },
})
