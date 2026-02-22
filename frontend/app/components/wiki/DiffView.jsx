import { useMemo } from 'react'
import { View, ScrollView, StyleSheet, Platform, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Typography, Spacing, BorderRadius } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import { computeLineDiff, computeCharDiff } from '../../lib/lineDiff'

/**
 * Renders a line-by-line diff between original and edited text.
 * When a line is modified (not wholly added/removed), highlights the
 * specific characters that changed within the line.
 *
 * @param {Object} props
 * @param {string} props.original - Original markdown text
 * @param {string} props.edited - Edited markdown text
 */
export default function DiffView({ original, edited }) {
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const hunks = useMemo(
    () => computeLineDiff(original, edited),
    [original, edited],
  )

  // Pair up consecutive remove/add hunks for character-level diffing
  const renderHunks = useMemo(() => {
    const result = []
    let i = 0
    while (i < hunks.length) {
      if (hunks[i].type === 'remove') {
        // Collect consecutive removes
        const removes = []
        while (i < hunks.length && hunks[i].type === 'remove') {
          removes.push(hunks[i])
          i++
        }
        // Collect consecutive adds that follow
        const adds = []
        while (i < hunks.length && hunks[i].type === 'add') {
          adds.push(hunks[i])
          i++
        }
        // Pair them up for character diff
        const pairCount = Math.min(removes.length, adds.length)
        for (let p = 0; p < pairCount; p++) {
          const { oldSegments, newSegments } = computeCharDiff(removes[p].text, adds[p].text)
          result.push({ type: 'remove', text: removes[p].text, segments: oldSegments })
          result.push({ type: 'add', text: adds[p].text, segments: newSegments })
        }
        // Remaining unpaired removes
        for (let p = pairCount; p < removes.length; p++) {
          result.push(removes[p])
        }
        // Remaining unpaired adds
        for (let p = pairCount; p < adds.length; p++) {
          result.push(adds[p])
        }
      } else {
        result.push(hunks[i])
        i++
      }
    }
    return result
  }, [hunks])

  const hasChanges = hunks.some(h => h.type !== 'same')

  if (!hasChanges) {
    return (
      <View style={styles.emptyContainer}>
        <ThemedText variant="h3" color="secondary">{t('diffNoChanges')}</ThemedText>
        <ThemedText variant="bodySmall" color="secondary">{t('diffNoChangesSubtitle')}</ThemedText>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {renderHunks.map((hunk, index) => (
        <View
          key={index}
          style={[styles.line, styles[hunk.type]]}
          accessibilityLabel={
            hunk.type === 'add'
              ? `${t('diffAdded')}: ${hunk.text}`
              : hunk.type === 'remove'
                ? `${t('diffRemoved')}: ${hunk.text}`
                : hunk.text
          }
        >
          <Text
            style={[styles.prefix, styles[`${hunk.type}Text`]]}
          >
            {hunk.type === 'add' ? '+' : hunk.type === 'remove' ? '-' : ' '}
          </Text>
          {hunk.segments ? (
            <Text style={[styles.text, styles[`${hunk.type}Text`]]} numberOfLines={0}>
              {hunk.segments.map((seg, si) =>
                seg.highlighted ? (
                  <Text key={si} style={styles[`${hunk.type}Highlight`]}>{seg.text}</Text>
                ) : (
                  <Text key={si}>{seg.text}</Text>
                )
              )}
            </Text>
          ) : (
            <Text
              style={[styles.text, styles[`${hunk.type}Text`]]}
              numberOfLines={0}
            >
              {hunk.text}
            </Text>
          )}
        </View>
      ))}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    padding: Spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  line: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    minHeight: 22,
  },
  same: {
    backgroundColor: 'transparent',
  },
  add: {
    backgroundColor: colors.severityLowBg,
  },
  remove: {
    backgroundColor: colors.severityHighBg,
  },
  prefix: {
    width: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    ...Typography.bodySmall,
  },
  text: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    ...Typography.bodySmall,
  },
  sameText: {
    color: colors.text,
  },
  addText: {
    color: colors.severityLowText,
  },
  removeText: {
    color: colors.warning || '#EF4C45',
  },
  // Character-level highlight backgrounds for changed segments
  addHighlight: {
    backgroundColor: (colors.severityLowText || '#81C784') + '40',
    borderRadius: 2,
  },
  removeHighlight: {
    backgroundColor: (colors.warning || '#EF4C45') + '40',
    borderRadius: 2,
  },
})
