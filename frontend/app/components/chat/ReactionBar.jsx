import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../ThemedText'

const REACTIONS = [
  { key: 'agree', emoji: '\u{1F44D}', labelKey: 'reactionAgree' },
  { key: 'appreciate', emoji: '\u2764\uFE0F', labelKey: 'reactionAppreciate' },
  { key: 'grateful', emoji: '\u{1F64F}', labelKey: 'reactionGrateful' },
  { key: 'considering', emoji: '\u{1F914}', labelKey: 'reactionConsidering' },
  { key: 'respect', emoji: '\u{1F91D}', labelKey: 'reactionRespect' },
]

export { REACTIONS }

export default function ReactionBar({ currentReaction, onReact }) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { t } = useTranslation('chat')

  return (
    <View style={styles.container}>
      {REACTIONS.map(({ key, emoji, labelKey }) => {
        const isSelected = currentReaction === key
        return (
          <TouchableOpacity
            key={key}
            style={[styles.emojiButton, isSelected && styles.emojiButtonSelected]}
            onPress={() => onReact(isSelected ? null : key)}
            accessibilityRole="button"
            accessibilityLabel={isSelected ? t('removeReactionA11y', { label: t(labelKey) }) : t('addReactionA11y', { label: t(labelKey) })}
            accessibilityState={{ selected: isSelected }}
          >
            <ThemedText style={styles.emoji}>{emoji}</ThemedText>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  emojiButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiButtonSelected: {
    backgroundColor: colors.primarySurface + '30',
  },
  emoji: {
    fontSize: 18,
  },
})
