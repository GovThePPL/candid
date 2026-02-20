import { View, TouchableOpacity, Animated, Platform, StyleSheet } from 'react-native'
import { useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../ThemedText'
import { REACTIONS } from './ReactionBar'

const EMOJI_MAP = {}
for (const r of REACTIONS) {
  EMOJI_MAP[r.key] = { emoji: r.emoji, labelKey: r.labelKey }
}

// Prosocial emojis get a larger bounce
const PROSOCIAL_KEYS = new Set(['appreciate', 'grateful', 'respect'])

function AnimatedBadge({ emojiKey, emoji, labelKey, count, hasOwn, onToggle, styles, t }) {
  const scaleAnim = useRef(new Animated.Value(1)).current
  const prevCountRef = useRef(count)

  useEffect(() => {
    if (count > prevCountRef.current) {
      const isProsocial = PROSOCIAL_KEYS.has(emojiKey)
      Animated.spring(scaleAnim, {
        toValue: isProsocial ? 1.4 : 1.25,
        friction: isProsocial ? 4 : 6,
        tension: 200,
        useNativeDriver: Platform.OS !== 'web',
      }).start(() => {
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 5,
          tension: 150,
          useNativeDriver: Platform.OS !== 'web',
        }).start()
      })
    }
    prevCountRef.current = count
  }, [count, emojiKey, scaleAnim])

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.badge, hasOwn && styles.badgeOwn]}
        onPress={() => onToggle(hasOwn ? null : emojiKey)}
        accessibilityRole="button"
        accessibilityLabel={t('reactionCountA11y', { label: t(labelKey), count })}
        accessibilityState={{ selected: hasOwn }}
      >
        <ThemedText style={styles.badgeEmoji}>{emoji}</ThemedText>
        <ThemedText style={[styles.badgeCount, hasOwn && styles.badgeCountOwn]}>{count}</ThemedText>
      </TouchableOpacity>
    </Animated.View>
  )
}

export default function ReactionBadges({ reactions, currentUserId, onToggle }) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { t } = useTranslation('chat')

  if (!reactions || reactions.length === 0) return null

  // Group reactions by emoji key
  const grouped = {}
  let ownEmoji = null
  for (const r of reactions) {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, hasOwn: false }
    grouped[r.emoji].count++
    if (r.userId === currentUserId) {
      grouped[r.emoji].hasOwn = true
      ownEmoji = r.emoji
    }
  }

  // Sort by REACTIONS order
  const ordered = REACTIONS
    .filter(r => grouped[r.key])
    .map(r => ({ ...r, ...grouped[r.key] }))

  return (
    <View style={styles.container}>
      {ordered.map(({ key, emoji, labelKey, count, hasOwn }) => (
        <AnimatedBadge
          key={key}
          emojiKey={key}
          emoji={emoji}
          labelKey={labelKey}
          count={count}
          hasOwn={hasOwn}
          onToggle={onToggle}
          styles={styles}
          t={t}
        />
      ))}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 3,
  },
  badgeOwn: {
    backgroundColor: colors.primarySurface + '20',
    borderColor: colors.primarySurface,
  },
  badgeEmoji: {
    fontSize: 13,
  },
  badgeCount: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  badgeCountOwn: {
    color: colors.primary,
  },
})
