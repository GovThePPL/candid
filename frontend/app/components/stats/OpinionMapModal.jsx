import { useState, useMemo } from 'react'
import { View, StyleSheet, Modal, TouchableOpacity, useWindowDimensions } from 'react-native'
import Svg, { Polygon, Circle, Text as SvgText, G, ClipPath, Defs, Image as SvgImage, Line } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { GROUP_COLORS, SemanticColors, BrandColor } from '../../constants/Colors'
import { Typography } from '../../constants/Theme'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { createSharedStyles } from '../../constants/SharedStyles'
import ThemedText from '../ThemedText'
import { getAvatarImageUrl, getInitials, getInitialsColor } from '../../lib/avatarUtils'

/**
 * Modal showing opinion map with two users highlighted
 * Supports toggling between category-specific and all-categories maps
 *
 * @param {Object} props
 * @param {boolean} props.visible - Whether modal is visible
 * @param {Function} props.onClose - Callback when modal is closed
 * @param {Array} props.groups - Category-specific opinion groups
 * @param {Array} props.allCategoriesGroups - Location-wide opinion groups
 * @param {Object} props.user1 - First user info (with mapPosition, allCategoriesMapPosition)
 * @param {Object} props.user2 - Second user info (with mapPosition, allCategoriesMapPosition)
 * @param {string} props.locationCode - Location code (e.g. "OR")
 * @param {string} props.categoryLabel - Category label (e.g. "Immigration")
 */
export default function OpinionMapModal({
  visible,
  onClose,
  onDismiss,
  groups = [],
  allCategoriesGroups = [],
  user1,
  user2,
  locationCode,
  categoryLabel,
}) {
  const colors = useThemeColors()
  const { t } = useTranslation()
  const styles = useMemo(() => createStyles(colors), [colors])
  const shared = useMemo(() => createSharedStyles(colors), [colors])
  const { width: screenWidth } = useWindowDimensions()
  const [showAllCategories, setShowAllCategories] = useState(false)

  // Select which data to render based on toggle
  const activeGroups = showAllCategories ? allCategoriesGroups : groups
  const activeUser1 = user1 ? {
    ...user1,
    mapPosition: showAllCategories ? user1.allCategoriesMapPosition : user1.mapPosition,
  } : null
  const activeUser2 = user2 ? {
    ...user2,
    mapPosition: showAllCategories ? user2.allCategoriesMapPosition : user2.mapPosition,
  } : null

  const hasAllCategoriesData = allCategoriesGroups.length > 0

  // Calculate responsive map dimensions
  const containerWidth = screenWidth - 64
  const aspectRatio = 3 / 2
  const mapWidth = Math.min(500, Math.max(280, containerWidth))
  const mapHeight = mapWidth / aspectRatio

  // Calculate bounds from hull points and user positions
  const allPoints = activeGroups.flatMap((g) => g.hull || [])
  if (activeUser1?.mapPosition) {
    allPoints.push({ x: activeUser1.mapPosition.x, y: activeUser1.mapPosition.y })
  }
  if (activeUser2?.mapPosition) {
    allPoints.push({ x: activeUser2.mapPosition.x, y: activeUser2.mapPosition.y })
  }

  let minX = -1, maxX = 1, minY = -1, maxY = 1
  if (allPoints.length > 0) {
    minX = Math.min(...allPoints.map((p) => p.x)) - 0.15
    maxX = Math.max(...allPoints.map((p) => p.x)) + 0.15
    minY = Math.min(...allPoints.map((p) => p.y)) - 0.15
    maxY = Math.max(...allPoints.map((p) => p.y)) + 0.15
  }

  const width = maxX - minX
  const height = maxY - minY
  const padding = 30

  // Uniform scaling
  const dataAspect = width / height
  const svgAspect = mapWidth / mapHeight

  let scaleX, scaleY, offsetX, offsetY
  if (dataAspect > svgAspect) {
    scaleX = (mapWidth - 2 * padding) / width
    scaleY = scaleX
    offsetX = padding
    offsetY = (mapHeight - height * scaleY) / 2
  } else {
    scaleY = (mapHeight - 2 * padding) / height
    scaleX = scaleY
    offsetX = (mapWidth - width * scaleX) / 2
    offsetY = padding
  }

  const toSvgX = (x) => (x - minX) * scaleX + offsetX
  const toSvgY = (y) => (maxY - y) * scaleY + offsetY

  const renderGroup = (group, index) => {
    const hull = group.hull || []
    const color = GROUP_COLORS[index % GROUP_COLORS.length]
    const centroid = group.centroid || { x: 0, y: 0 }

    if (hull.length < 3) {
      const cx = toSvgX(centroid.x)
      const cy = toSvgY(centroid.y)
      const radius = group.memberCount === 1 ? 3 : 8

      return (
        <G key={group.id}>
          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            fill={color}
            fillOpacity={0.5}
            stroke={color}
            strokeWidth={1}
          />
          <SvgText
            x={cx}
            y={cy + radius + 10}
            fontSize={Typography.badge.fontSize}
            fontWeight="bold"
            fill={color}
            textAnchor="middle"
          >
            {group.label}
          </SvgText>
        </G>
      )
    }

    const points = hull.map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(' ')

    return (
      <G key={group.id}>
        <Polygon
          points={points}
          fill={color}
          fillOpacity={0.25}
          stroke={color}
          strokeWidth={2}
        />
        <SvgText
          x={toSvgX(centroid.x)}
          y={toSvgY(centroid.y)}
          fontSize={Typography.bodySmall.fontSize}
          fontWeight="bold"
          fill={color}
          textAnchor="middle"
          alignmentBaseline="central"
        >
          {group.label}
        </SvgText>
      </G>
    )
  }

  const renderUserMarker = (user, index) => {
    if (!user?.mapPosition) return null

    const x = toSvgX(user.mapPosition.x)
    const y = toSvgY(user.mapPosition.y)
    const avatarRadius = 16
    const clipId = `userClip${index}`

    const displayName = user.displayName || 'User'
    const initials = getInitials(displayName)
    const initialsColor = getInitialsColor(displayName)
    const avatarUrl = user.avatarIconUrl || user.avatarUrl

    // Border color based on role
    const borderColor = index === 0 ? SemanticColors.agree : colors.primary

    return (
      <G key={index}>
        <Defs>
          <ClipPath id={clipId}>
            <Circle cx={x} cy={y} r={avatarRadius} />
          </ClipPath>
        </Defs>

        {/* Border ring */}
        <Circle
          cx={x}
          cy={y}
          r={avatarRadius + 3}
          fill="white"
          stroke={borderColor}
          strokeWidth={3}
        />

        {avatarUrl ? (
          <SvgImage
            x={x - avatarRadius}
            y={y - avatarRadius}
            width={avatarRadius * 2}
            height={avatarRadius * 2}
            href={{ uri: getAvatarImageUrl(avatarUrl) }}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <>
            <Circle cx={x} cy={y} r={avatarRadius} fill={initialsColor} />
            <SvgText
              x={x}
              y={y}
              dy="5"
              fontSize={initials.length > 1 ? "12" : "16"}
              fontWeight="600"
              fill="white"
              textAnchor="middle"
            >
              {initials}
            </SvgText>
          </>
        )}

        {/* Name label */}
        <SvgText
          x={x}
          y={y + avatarRadius + 14}
          fontSize={Typography.caption.fontSize}
          fontWeight="600"
          fill={borderColor}
          textAnchor="middle"
        >
          {displayName.split(' ')[0]}
        </SvgText>
      </G>
    )
  }

  // Draw line between users if both have positions
  const renderConnectionLine = () => {
    if (!activeUser1?.mapPosition || !activeUser2?.mapPosition) return null

    const x1 = toSvgX(activeUser1.mapPosition.x)
    const y1 = toSvgY(activeUser1.mapPosition.y)
    const x2 = toSvgX(activeUser2.mapPosition.x)
    const y2 = toSvgY(activeUser2.mapPosition.y)

    return (
      <Line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={colors.pass}
        strokeWidth={2}
        strokeDasharray="4,4"
        opacity={0.6}
      />
    )
  }

  const hasValidPositions = activeUser1?.mapPosition || activeUser2?.mapPosition

  // Build tab labels with location code
  const categoryTabLabel = [locationCode, categoryLabel].filter(Boolean).join(' - ') || 'Category'
  const allCategoriesTabLabel = [locationCode, t('common:allCategories')].filter(Boolean).join(' - ')

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onDismiss={onDismiss}>
      <TouchableOpacity
        style={shared.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('stats:closeA11y')}
      >
        <TouchableOpacity activeOpacity={1} style={styles.content}>
          <View style={styles.header}>
            <ThemedText variant="h3" color="primary" style={styles.title}>{t('stats:opinionMapTitle')}</ThemedText>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('stats:closeA11y')}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Category toggle tabs with location labels */}
          {hasAllCategoriesData && (
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, !showAllCategories && styles.tabActive]}
                onPress={() => setShowAllCategories(false)}
                accessibilityRole="tab"
                accessibilityState={{ selected: !showAllCategories }}
                accessibilityLabel={categoryTabLabel}
              >
                <ThemedText variant="caption" style={[styles.tabText, !showAllCategories && styles.tabTextActive]}>
                  {categoryTabLabel}
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, showAllCategories && styles.tabActive]}
                onPress={() => setShowAllCategories(true)}
                accessibilityRole="tab"
                accessibilityState={{ selected: showAllCategories }}
                accessibilityLabel={allCategoriesTabLabel}
              >
                <ThemedText variant="caption" style={[styles.tabText, showAllCategories && styles.tabTextActive]}>
                  {allCategoriesTabLabel}
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}

          {hasValidPositions ? (
            <>
              <View style={styles.mapContainer}>
                <Svg width="100%" height={mapHeight} viewBox={`0 0 ${mapWidth} ${mapHeight}`}>
                  {activeGroups.map(renderGroup)}
                  {renderConnectionLine()}
                  {renderUserMarker(activeUser1, 0)}
                  {renderUserMarker(activeUser2, 1)}
                </Svg>
              </View>

              {/* Group legend */}
              <View style={styles.legend}>
                {activeGroups.map((group, index) => {
                  const customLabel = group.labelRankings?.[0]?.label
                  const displayLabel = customLabel
                    ? `${group.label}: ${customLabel}`
                    : group.label
                  return (
                    <View key={group.id} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: GROUP_COLORS[index % GROUP_COLORS.length] }]} />
                      <ThemedText variant="caption">{displayLabel}</ThemedText>
                    </View>
                  )
                })}
              </View>
            </>
          ) : (
            <View style={styles.noDataContainer}>
              <Ionicons name="analytics-outline" size={48} color={colors.secondaryText} />
              <ThemedText variant="bodySmall" style={styles.noDataText}>
                {t('stats:noMapData')}
              </ThemedText>
              <ThemedText variant="caption" color="secondary" style={styles.noDataSubtext}>
                {t('stats:noMapDataHint')}
              </ThemedText>
            </View>
          )}

          <TouchableOpacity style={styles.doneButton} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('done')}>
            <ThemedText variant="button" color="inverse">{t('done')}</ThemedText>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

const createStyles = (colors) => StyleSheet.create({
  content: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontWeight: '700',
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: colors.cardBackground,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: {
    fontWeight: '500',
    color: colors.secondaryText,
    textAlign: 'center',
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  mapContainer: {
    backgroundColor: colors.uiBackground,
    borderRadius: 12,
    padding: 8,
    marginBottom: 12,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
  },
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  noDataText: {
    textAlign: 'center',
    marginTop: 12,
  },
  noDataSubtext: {
    textAlign: 'center',
    marginTop: 4,
  },
  doneButton: {
    backgroundColor: colors.primarySurface,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
})
