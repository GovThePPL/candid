import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Image, useWindowDimensions } from 'react-native'
import Svg, { Polygon, Circle, Text as SvgText, G, ClipPath, Defs, Image as SvgImage } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { Colors, GROUP_COLORS } from '../../constants/Colors'
import InfoModal from '../InfoModal'
import { getAvatarImageUrl, getInitials, getInitialsColor } from '../../lib/avatarUtils'

/**
 * SVG visualization of opinion groups as convex hulls
 *
 * @param {Object} props
 * @param {Array} props.groups - Array of OpinionGroup objects
 * @param {Object} props.userPosition - User's position { x, y, groupId }
 * @param {Object} props.userInfo - User display info { displayName, avatarUrl }
 * @param {string} props.selectedGroup - Currently selected group ID
 * @param {Function} props.onGroupSelect - Callback when group is tapped
 */
export default function OpinionMapVisualization({
  groups = [],
  userPosition,
  userInfo,
  selectedGroup,
  onGroupSelect,
}) {
  const [showHelp, setShowHelp] = useState(false)
  const { width: screenWidth } = useWindowDimensions()

  // Calculate responsive map dimensions based on screen width
  // Maintain 3:2 aspect ratio, with min/max constraints
  const containerWidth = screenWidth - 64 // Account for margins and padding
  const aspectRatio = 3 / 2
  const mapWidth = Math.min(600, Math.max(280, containerWidth))
  const mapHeight = mapWidth / aspectRatio

  // Calculate bounds for viewBox from all hull points
  const allPoints = groups.flatMap((g) => g.hull || [])
  if (userPosition) {
    allPoints.push({ x: userPosition.x, y: userPosition.y })
  }

  let minX = -1, maxX = 1, minY = -1, maxY = 1
  if (allPoints.length > 0) {
    minX = Math.min(...allPoints.map((p) => p.x)) - 0.1
    maxX = Math.max(...allPoints.map((p) => p.x)) + 0.1
    minY = Math.min(...allPoints.map((p) => p.y)) - 0.1
    maxY = Math.max(...allPoints.map((p) => p.y)) + 0.1
  }

  const width = maxX - minX
  const height = maxY - minY
  const padding = 20

  // Transform data coordinates to SVG coordinates, maintaining proportional scaling
  const dataAspect = width / height
  const svgAspect = mapWidth / mapHeight

  // Use uniform scaling to prevent shape distortion
  let scaleX, scaleY, offsetX, offsetY
  if (dataAspect > svgAspect) {
    // Data is wider than SVG - fit to width
    scaleX = (mapWidth - 2 * padding) / width
    scaleY = scaleX // Use same scale to maintain proportions
    offsetX = padding
    offsetY = (mapHeight - height * scaleY) / 2
  } else {
    // Data is taller than SVG - fit to height
    scaleY = (mapHeight - 2 * padding) / height
    scaleX = scaleY // Use same scale to maintain proportions
    offsetX = (mapWidth - width * scaleX) / 2
    offsetY = padding
  }

  const toSvgX = (x) => (x - minX) * scaleX + offsetX
  const toSvgY = (y) => (maxY - y) * scaleY + offsetY // Flip Y

  const renderGroup = (group, index) => {
    const hull = group.hull || []
    const color = GROUP_COLORS[index % GROUP_COLORS.length]
    const centroid = group.centroid || { x: 0, y: 0 }

    const isSelected = selectedGroup === group.id
    const isOtherSelected = selectedGroup && selectedGroup !== group.id && selectedGroup !== 'majority'

    // For single or double member groups, render a point/circle instead of polygon
    // Single member groups are small dots, two-member groups slightly larger
    if (hull.length < 3) {
      const cx = toSvgX(centroid.x)
      const cy = toSvgY(centroid.y)
      const isSingleMember = group.memberCount === 1
      const radius = isSingleMember ? 3 : 8

      return (
        <G key={group.id}>
          {/* Single solid circle for small groups */}
          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            fill={color}
            fillOpacity={isSelected ? 0.9 : isOtherSelected ? 0.3 : 0.7}
            stroke={color}
            strokeWidth={isSelected ? 2 : 1}
            strokeOpacity={isOtherSelected ? 0.5 : 1}
            onPress={() => onGroupSelect && onGroupSelect(group.id)}
          />
          <SvgText
            x={cx}
            y={cy + radius + 10}
            fontSize={isSingleMember ? "8" : "10"}
            fontWeight="bold"
            fontFamily="sans-serif"
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
          fillOpacity={isSelected ? 0.5 : isOtherSelected ? 0.15 : 0.3}
          stroke={color}
          strokeWidth={isSelected ? 3 : 2}
          strokeOpacity={isOtherSelected ? 0.5 : 1}
          onPress={() => onGroupSelect && onGroupSelect(group.id)}
        />
        <SvgText
          x={toSvgX(centroid.x)}
          y={toSvgY(centroid.y)}
          fontSize="14"
          fontWeight="bold"
          fontFamily="sans-serif"
          fill={color}
          textAnchor="middle"
          alignmentBaseline="central"
        >
          {group.label}
        </SvgText>
      </G>
    )
  }

  const renderUserMarker = () => {
    if (!userPosition) return null

    const x = toSvgX(userPosition.x)
    const y = toSvgY(userPosition.y)
    const avatarRadius = 14
    const clipId = 'userAvatarClip'

    // Get initials and color for fallback avatar (use real name, not "You")
    const actualName = userInfo?.displayName || userInfo?.username || 'You'
    const initials = getInitials(actualName)
    const initialsColor = getInitialsColor(actualName)

    // Prefer icon URL for small avatar
    const avatarUrl = userInfo?.avatarIconUrl || userInfo?.avatarUrl

    return (
      <G>
        {/* Avatar with clipping */}
        <Defs>
          <ClipPath id={clipId}>
            <Circle cx={x} cy={y} r={avatarRadius} />
          </ClipPath>
        </Defs>

        {/* User avatar image or fallback with initials - matches Header style */}
        {avatarUrl ? (
          <>
            {/* White border for avatar */}
            <Circle
              cx={x}
              cy={y}
              r={avatarRadius + 2}
              fill="white"
            />
            <SvgImage
              x={x - avatarRadius}
              y={y - avatarRadius}
              width={avatarRadius * 2}
              height={avatarRadius * 2}
              href={{ uri: getAvatarImageUrl(avatarUrl) }}
              clipPath={`url(#${clipId})`}
              preserveAspectRatio="xMidYMid slice"
            />
          </>
        ) : (
          <>
            {/* Fallback: colored circle with white initials */}
            <Circle cx={x} cy={y} r={avatarRadius} fill={initialsColor} />
            <SvgText
              x={x}
              y={y}
              dy="5"
              fontSize={initials.length > 1 ? "12" : "16"}
              fontWeight="600"
              fontFamily="sans-serif"
              fill="white"
              textAnchor="middle"
            >
              {initials}
            </SvgText>
          </>
        )}

        {/* "You" label */}
        <SvgText
          x={x}
          y={y + avatarRadius + 12}
          fontSize="10"
          fontWeight="600"
          fontFamily="sans-serif"
          fill={Colors.primary}
          textAnchor="middle"
        >
          You
        </SvgText>
      </G>
    )
  }

  if (groups.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="analytics-outline" size={48} color={Colors.pass} />
        <Text style={styles.emptyText}>
          Not enough data to display opinion groups yet.
        </Text>
        <Text style={styles.emptySubtext}>
          Vote on more positions to see where you stand.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.helpButton} onPress={() => setShowHelp(true)}>
        <Ionicons name="help-circle-outline" size={24} color={Colors.pass} />
      </TouchableOpacity>

      <Svg width="100%" height={mapHeight} viewBox={`0 0 ${mapWidth} ${mapHeight}`}>
        {groups.map(renderGroup)}
        {renderUserMarker()}
      </Svg>

      <View style={styles.legend}>
        {groups.map((group, index) => {
          // Show custom label if available from labelRankings, with letter prefix
          const customLabel = group.labelRankings?.[0]?.label
          const displayLabel = customLabel
            ? `${group.label}: ${customLabel}`
            : group.label
          const isSelected = selectedGroup === group.id
          return (
            <TouchableOpacity
              key={group.id}
              style={[
                styles.legendItem,
                isSelected && styles.legendItemSelected
              ]}
              onPress={() => onGroupSelect && onGroupSelect(group.id)}
            >
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: GROUP_COLORS[index % GROUP_COLORS.length] },
                ]}
              />
              <Text style={[
                styles.legendLabel,
                isSelected && styles.legendLabelSelected
              ]}>
                {displayLabel}
              </Text>
              <View style={styles.legendMemberCount}>
                <Ionicons name="person" size={10} color={isSelected ? Colors.primary : Colors.pass} />
                <Text style={[
                  styles.legendMemberText,
                  isSelected && styles.legendMemberTextSelected
                ]}>{group.memberCount}</Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      <InfoModal
        visible={showHelp}
        onClose={() => setShowHelp(false)}
        title="Understanding the Opinion Map"
      >
        <InfoModal.Item icon="shapes-outline">
          Each colored shape represents a group of people with similar voting patterns.
        </InfoModal.Item>
        <InfoModal.Item icon="resize-outline">
          Distance between groups shows how different their opinions are.
        </InfoModal.Item>
        <InfoModal.Item icon="person-circle-outline">
          The "You" marker shows where you fall based on your votes.
        </InfoModal.Item>
      </InfoModal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 12,
    marginHorizontal: 16,
    padding: 16,
    position: 'relative',
  },
  helpButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    padding: 4,
  },
  emptyContainer: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 12,
    marginHorizontal: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.light.text,
    textAlign: 'center',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.pass,
    textAlign: 'center',
    marginTop: 8,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 12,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  legendItemSelected: {
    backgroundColor: Colors.primary + '15',
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendLabel: {
    fontSize: 12,
    color: Colors.light.text,
  },
  legendLabelSelected: {
    fontWeight: '600',
    color: Colors.primary,
  },
  legendMemberCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  legendMemberText: {
    fontSize: 10,
    color: Colors.pass,
  },
  legendMemberTextSelected: {
    color: Colors.primary,
  },
})
