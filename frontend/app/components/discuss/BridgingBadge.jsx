import { useMemo, useRef, useEffect } from 'react'
import { View, Animated, Platform, StyleSheet } from 'react-native'
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
 */
export default function BridgingBadge({ item }) {
  const { t } = useTranslation('discuss')
  const scaleAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 180,
      useNativeDriver: Platform.OS !== 'web',
    }).start()
  }, [scaleAnim])

  if (!isBridging(item)) return null

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <View
        style={styles.badge}
        accessibilityLabel={t('bridgingBadgeA11y')}
      >
        <Ionicons name="link-outline" size={10} color={OnBrandColors.text} />
        <ThemedText style={styles.label}>{t('bridgingBadge')}</ThemedText>
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
  label: {
    ...Typography.badgeSm,
    color: OnBrandColors.text,
    letterSpacing: 0.3,
  },
})
