import { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import ThemedText from '../ThemedText'
import { Typography } from '../../constants/Theme'
import { SemanticColors, OnBrandColors } from '../../constants/Colors'
import { isBridging } from '../../lib/bridging'

/**
 * Small pill badge indicating a post or comment bridges ideological divides.
 * Only renders if the item qualifies via isBridging().
 * Animates in with a spring scale on mount.
 *
 * @param {Object} props
 * @param {Object} props.item - Post or comment object with bridgingScore, upvoteCount, downvoteCount
 * @param {boolean} [props.compact] - When true, show only the link icon in a circle (no text)
 */
export default function BridgingBadge({ item, compact }) {
  const { t } = useTranslation('discuss')
  const scale = useSharedValue(0)

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  useEffect(() => {
    scale.value = withSpring(1, { damping: 10, stiffness: 180 })
  }, [scale])

  if (!isBridging(item)) return null

  return (
    <Animated.View style={scaleStyle}>
      <View
        style={compact ? styles.badgeCompact : styles.badge}
        accessibilityLabel={t('bridgingBadgeA11y')}
      >
        <Ionicons name="link-outline" size={compact ? 12 : 10} color={OnBrandColors.text} />
        {!compact && <ThemedText style={styles.label}>{t('bridgingBadge')}</ThemedText>}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: SemanticColors.bridging,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  badgeCompact: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: SemanticColors.bridging,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...Typography.badgeSm,
    color: OnBrandColors.text,
    letterSpacing: 0.3,
  },
})
