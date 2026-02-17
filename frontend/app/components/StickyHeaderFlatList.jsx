import { FlatList, StyleSheet, View } from 'react-native'
import { useCallback, useMemo } from 'react'

const PROFILE_SENTINEL = { _headerType: 'profile' }
const TABS_SENTINEL = { _headerType: 'tabs' }

/**
 * FlatList wrapper that prepends a scrollable header and a sticky header as
 * sentinel data items. The scrollable header (e.g. profile card) scrolls away
 * naturally while the sticky header (e.g. tab row) pins to the top.
 *
 * Sentinel items are rendered at full width regardless of the FlatList's
 * contentContainerStyle padding, so the header looks consistent across
 * components with different padding values.
 *
 * When neither listHeader nor stickyHeader is provided, behaves like a plain FlatList.
 */
export default function StickyHeaderFlatList({
  listHeader,
  stickyHeader,
  data,
  renderItem,
  keyExtractor,
  contentContainerStyle,
  ...flatListProps
}) {
  const hasSentinels = !!(listHeader || stickyHeader)

  // Extract padding and gap from the container style so sentinel items can
  // counteract them with negative margins, rendering at full width.
  const flatStyle = useMemo(
    () => (hasSentinels ? (StyleSheet.flatten(contentContainerStyle) || {}) : null),
    [contentContainerStyle, hasSentinels]
  )
  const hPad = flatStyle ? (flatStyle.paddingHorizontal ?? flatStyle.padding ?? 0) : 0
  const topPad = flatStyle ? (flatStyle.paddingTop ?? flatStyle.paddingVertical ?? flatStyle.padding ?? 0) : 0
  const itemGap = flatStyle ? (flatStyle.gap ?? 0) : 0

  // Memoize sentinel wrapper styles to avoid recreating inline objects per render
  const profileStyle = useMemo(() => ({
    marginHorizontal: -hPad,
    marginTop: -topPad,
    ...(itemGap > 0 && { marginBottom: -itemGap }),
  }), [hPad, topPad, itemGap])

  const tabsStyle = useMemo(() => ({
    marginHorizontal: -hPad,
    // When the container has no gap, add bottom padding so there's consistent
    // spacing between the sticky tab row and the first content item.
    ...(itemGap === 0 && { paddingBottom: 8 }),
  }), [hPad, itemGap])

  const allData = useMemo(() => {
    if (!hasSentinels) return data
    return [PROFILE_SENTINEL, TABS_SENTINEL, ...(data || [])]
  }, [data, hasSentinels])

  const wrappedRenderItem = useCallback(({ item, index, ...rest }) => {
    if (item._headerType === 'profile') {
      return listHeader ? <View style={profileStyle}>{listHeader}</View> : null
    }
    if (item._headerType === 'tabs') {
      return stickyHeader ? <View style={tabsStyle}>{stickyHeader}</View> : null
    }
    return renderItem({ item, index, ...rest })
  }, [renderItem, listHeader, stickyHeader, profileStyle, tabsStyle])

  const wrappedKeyExtractor = useCallback((item, index) => {
    if (item._headerType) return item._headerType
    return keyExtractor(item, index)
  }, [keyExtractor])

  return (
    <FlatList
      data={allData}
      renderItem={wrappedRenderItem}
      keyExtractor={wrappedKeyExtractor}
      stickyHeaderIndices={stickyHeader ? [1] : undefined}
      contentContainerStyle={contentContainerStyle}
      {...flatListProps}
    />
  )
}
