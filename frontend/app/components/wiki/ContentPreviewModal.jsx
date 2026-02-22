import { useMemo, useState, useCallback } from 'react'
import { View, ScrollView, Modal, StyleSheet, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Typography, Spacing, BorderRadius } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import MarkdownRenderer from '../discuss/MarkdownRenderer'

/**
 * Split markdown into blocks at paragraph boundaries (\n\n),
 * preserving fenced code blocks as single blocks.
 */
export function splitIntoBlocks(markdown) {
  if (!markdown) return []
  const lines = markdown.split('\n')
  const blocks = []
  let current = []
  let inFence = false

  for (const line of lines) {
    if (/^```/.test(line.trimEnd())) {
      inFence = !inFence
      current.push(line)
      continue
    }
    if (inFence) {
      current.push(line)
      continue
    }
    if (line.trim() === '' && current.length > 0) {
      // Check if current block has any non-empty content
      const blockText = current.join('\n').trim()
      if (blockText) blocks.push(blockText)
      current = []
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) {
    const blockText = current.join('\n').trim()
    if (blockText) blocks.push(blockText)
  }
  return blocks
}

/**
 * LCS-based block diff (same algorithm as computeLineDiff but on block arrays).
 */
export function computeBlockDiff(original, proposed) {
  const origBlocks = splitIntoBlocks(original)
  const propBlocks = splitIntoBlocks(proposed)

  const m = origBlocks.length
  const n = propBlocks.length

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origBlocks[i - 1] === propBlocks[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const result = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origBlocks[i - 1] === propBlocks[j - 1]) {
      result.push({ type: 'same', text: origBlocks[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', text: propBlocks[j - 1] })
      j--
    } else {
      result.push({ type: 'remove', text: origBlocks[i - 1] })
      i--
    }
  }
  return result.reverse()
}

/**
 * Pair consecutive remove/add blocks into modified entries.
 */
export function pairBlockDiff(blocks) {
  const result = []
  let i = 0
  while (i < blocks.length) {
    if (blocks[i].type === 'remove') {
      const removes = []
      while (i < blocks.length && blocks[i].type === 'remove') {
        removes.push(blocks[i])
        i++
      }
      const adds = []
      while (i < blocks.length && blocks[i].type === 'add') {
        adds.push(blocks[i])
        i++
      }
      const pairCount = Math.min(removes.length, adds.length)
      for (let p = 0; p < pairCount; p++) {
        result.push({ type: 'modified', old: removes[p].text, new: adds[p].text })
      }
      for (let p = pairCount; p < removes.length; p++) result.push(removes[p])
      for (let p = pairCount; p < adds.length; p++) result.push(adds[p])
    } else {
      result.push(blocks[i])
      i++
    }
  }
  return result
}

const TABS = ['original', 'changes', 'diff']

/**
 * Full-screen modal showing rendered markdown with Original/Changes/Diff tabs.
 *
 * @param {Object} props
 * @param {boolean} props.visible
 * @param {Function} props.onClose
 * @param {string} props.originalContent
 * @param {string} props.proposedContent
 */
export default function ContentPreviewModal({ visible, onClose, originalContent, proposedContent }) {
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [activeTab, setActiveTab] = useState('diff')

  const diffBlocks = useMemo(() => {
    if (activeTab !== 'diff') return []
    const raw = computeBlockDiff(originalContent, proposedContent)
    return pairBlockDiff(raw)
  }, [activeTab, originalContent, proposedContent])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const tabKeys = {
    original: { label: t('previewTabOriginal'), a11y: t('previewTabOriginalA11y') },
    changes: { label: t('previewTabChanges'), a11y: t('previewTabChangesA11y') },
    diff: { label: t('previewTabDiff'), a11y: t('previewTabDiffA11y') },
  }

  const renderDiffBlock = (block, index) => {
    if (block.type === 'same') {
      return (
        <View key={index} style={styles.diffBlockSame}>
          <MarkdownRenderer content={block.text} variant="wiki" />
        </View>
      )
    }
    if (block.type === 'remove') {
      return (
        <View key={index} style={styles.diffBlockRemove}>
          <MarkdownRenderer content={block.text} variant="wiki" />
        </View>
      )
    }
    if (block.type === 'add') {
      return (
        <View key={index} style={styles.diffBlockAdd}>
          <MarkdownRenderer content={block.text} variant="wiki" />
        </View>
      )
    }
    if (block.type === 'modified') {
      return (
        <View key={index}>
          <View style={styles.diffBlockRemove}>
            <MarkdownRenderer content={block.old} variant="wiki" />
          </View>
          <View style={styles.diffBlockAdd}>
            <MarkdownRenderer content={block.new} variant="wiki" />
          </View>
        </View>
      )
    }
    return null
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel={t('common:back')}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <ThemedText variant="h3" color="dark">{t('previewTitle')}</ThemedText>
          <View style={{ width: 24 }} />
        </View>

        {/* Segmented control */}
        <View style={styles.segmentedControl}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabPill, isActive && styles.tabPillActive]}
                onPress={() => setActiveTab(tab)}
                accessibilityRole="tab"
                accessibilityLabel={tabKeys[tab].a11y}
                accessibilityState={{ selected: isActive }}
              >
                <ThemedText
                  variant="buttonSmall"
                  style={{ color: isActive ? colors.buttonSelectedText : colors.text }}
                >
                  {tabKeys[tab].label}
                </ThemedText>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Content */}
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
        >
          {activeTab === 'original' && (
            <MarkdownRenderer content={originalContent} variant="wiki" />
          )}
          {activeTab === 'changes' && (
            <MarkdownRenderer content={proposedContent} variant="wiki" />
          )}
          {activeTab === 'diff' && (
            <View style={styles.diffContainer}>
              {diffBlocks.map((block, index) => renderDiffBlock(block, index))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
  segmentedControl: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    backgroundColor: colors.navBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  tabPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
    backgroundColor: colors.cardBackground,
  },
  tabPillActive: {
    backgroundColor: colors.buttonSelected,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  diffContainer: {
    gap: Spacing.sm,
  },
  diffBlockSame: {
    paddingVertical: Spacing.xs,
  },
  diffBlockRemove: {
    backgroundColor: colors.severityHighBg,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning || '#EF4C45',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 4,
  },
  diffBlockAdd: {
    backgroundColor: colors.severityLowBg,
    borderLeftWidth: 3,
    borderLeftColor: colors.severityLowText,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 4,
  },
})
