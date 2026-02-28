import { useState, useCallback } from 'react'
import { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated'

const TIMING_CONFIG = { duration: 250, easing: Easing.out(Easing.cubic) }

/**
 * @param {Object} options
 * @param {number} options.collapsedHeight - Height when collapsed (0 for fully hidden)
 * @param {number} [options.collapsedOpacity=1] - Opacity when collapsed
 */
export default function useExpandCollapse({ collapsedHeight, collapsedOpacity = 1 }) {
  const [expanded, setExpanded] = useState(false)
  const [contentHeight, setContentHeight] = useState(0)
  const [measured, setMeasured] = useState(false)
  const progress = useSharedValue(0)

  const handleContentLayout = useCallback((e) => {
    const h = e.nativeEvent.layout.height
    if (h > 0) {
      setContentHeight(prev => Math.max(prev, h))
      setMeasured(true)
    }
  }, [])

  const toggle = useCallback((e) => {
    e?.stopPropagation?.()
    const toExpanded = !expanded
    setExpanded(toExpanded)
    progress.value = withTiming(toExpanded ? 1 : 0, TIMING_CONFIG)
  }, [expanded, progress])

  const clipStyle = useAnimatedStyle(() => {
    if (!measured) return {}
    return {
      height: collapsedHeight + (contentHeight - collapsedHeight) * progress.value,
      opacity: collapsedOpacity + (1 - collapsedOpacity) * progress.value,
    }
  }, [measured, contentHeight, collapsedHeight, collapsedOpacity])

  const fadeOverlayStyle = useAnimatedStyle(() => {
    if (!measured) return { opacity: 1 }
    return { opacity: 1 - progress.value }
  }, [measured])

  return { expanded, contentHeight, measured, handleContentLayout, toggle, clipStyle, fadeOverlayStyle }
}
