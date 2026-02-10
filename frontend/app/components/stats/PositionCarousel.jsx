import { useState, useMemo } from 'react'
import { View, TextInput, StyleSheet, useWindowDimensions, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Typography } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import PositionCard from './PositionCard'

// Breakpoints for responsive grid
const CARD_MIN_WIDTH = 340 // Minimum width for a card before wrapping to fewer columns

/**
 * Responsive grid of position cards
 *
 * @param {Object} props
 * @param {Array} props.positions - Array of position objects
 * @param {Array} props.groups - Array of group objects { id, label }
 * @param {string} props.activeTab - Current active tab (group ID or special tab)
 * @param {Object} props.userVotes - Map of position IDs to user's vote (agree/disagree/pass)
 * @param {Array} props.userPositionIds - IDs of positions created by the user
 * @param {Function} props.onViewClosures - Optional callback when View Closures is pressed
 */
export default function PositionCarousel({
  positions = [],
  groups = [],
  activeTab,
  userVotes = {},
  userPositionIds = [],
  onViewClosures,
  onSearchFocus,
}) {
  const { t } = useTranslation('stats')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { width: screenWidth } = useWindowDimensions()
  const [searchQuery, setSearchQuery] = useState('')

  // Scroll the focused search input into view
  const handleInputFocus = Platform.OS === 'web'
    ? (e) => { setTimeout(() => e.target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 300) }
    : onSearchFocus || undefined

  // Calculate number of columns based on screen width
  const containerWidth = screenWidth - 32 // Account for horizontal padding
  const gap = 12
  const numColumns = Math.max(1, Math.floor((containerWidth + gap) / (CARD_MIN_WIDTH + gap)))
  // Cards stretch to fill available width, accounting for gaps
  const cardWidth = (containerWidth - (numColumns - 1) * gap) / numColumns

  // Filter positions based on active tab
  const filteredPositions = positions.filter((position) => {
    if (activeTab === 'majority') {
      // Show only positions with consensus (majority opinion)
      return position.consensusType != null
    }
    if (activeTab === 'my_positions') {
      // Show only positions the user has submitted that have been voted on
      if (!userPositionIds || !userPositionIds.includes(position.id)) {
        return false
      }
      // Must have at least one vote
      const dist = position.voteDistribution || {}
      const hasVotes = (dist.agree || 0) + (dist.disagree || 0) + (dist.pass || 0) > 0
      if (!hasVotes) {
        return false
      }
      // Apply search filter if there's a query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const statement = (position.statement || '').toLowerCase()
        const category = (position.category?.label || '').toLowerCase()
        return statement.includes(query) || category.includes(query)
      }
      return true
    }
    // Filter by group ID - show positions that belong to this group
    return position.groupId === activeTab
  })

  // Helper to calculate agree percentage from vote distribution
  const getAgreePercent = (position) => {
    const dist = position.voteDistribution || {}
    const agree = dist.agree || 0
    const disagree = dist.disagree || 0
    const total = agree + disagree
    if (total === 0) return 0
    return agree / total
  }

  // Sort positions appropriately
  const sortedPositions = [...filteredPositions].sort((a, b) => {
    if (activeTab === 'majority') {
      // Sort by consensus score (highest first)
      return (b.consensusScore || 0) - (a.consensusScore || 0)
    }
    if (activeTab === 'my_positions') {
      // Sort by agree percentage (highest first)
      return getAgreePercent(b) - getAgreePercent(a)
    }
    // Sort by representativeness for group tabs
    return (b.representativeness || 0) - (a.representativeness || 0)
  })

  // Count total user-submitted positions with votes (before search filter) for empty state message
  const totalUserPositions = positions.filter(p => {
    if (!userPositionIds || !userPositionIds.includes(p.id)) return false
    const dist = p.voteDistribution || {}
    return (dist.agree || 0) + (dist.disagree || 0) + (dist.pass || 0) > 0
  }).length

  if (sortedPositions.length === 0) {
    const emptyMessage =
      activeTab === 'my_positions'
        ? (searchQuery.trim()
            ? t('noPositionsMatch')
            : t('noVotedPositions'))
        : t('noPositionsDisplay')

    return (
      <View style={styles.listContainer}>
        {activeTab === 'my_positions' && totalUserPositions > 0 && (
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={colors.secondaryText} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('searchYourPositions')}
              placeholderTextColor={colors.placeholderText}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              maxFontSizeMultiplier={1.5}
              onFocus={handleInputFocus}
              accessibilityLabel={t('searchYourPositions')}
            />
            {searchQuery.length > 0 && (
              <Ionicons
                name="close-circle"
                size={18}
                color={colors.secondaryText}
                onPress={() => setSearchQuery('')}
                style={styles.clearIcon}
                accessibilityRole="button"
                accessibilityLabel={t('clearSearchA11y')}
              />
            )}
          </View>
        )}
        <View style={styles.emptyContainer}>
          <ThemedText variant="bodySmall" color="secondary">{emptyMessage}</ThemedText>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.listContainer}>
      {activeTab === 'my_positions' && (
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={colors.secondaryText} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('searchYourPositions')}
            placeholderTextColor={colors.placeholderText}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            maxFontSizeMultiplier={1.5}
            onFocus={handleInputFocus}
            accessibilityLabel={t('searchYourPositions')}
          />
          {searchQuery.length > 0 && (
            <Ionicons
              name="close-circle"
              size={18}
              color={colors.secondaryText}
              onPress={() => setSearchQuery('')}
              style={styles.clearIcon}
              accessibilityRole="button"
              accessibilityLabel={t('clearSearchA11y')}
            />
          )}
        </View>
      )}
      <View style={styles.gridContainer}>
        {sortedPositions.map((position) => (
          <View key={position.id} style={[styles.cardWrapper, { width: cardWidth }]}>
            <PositionCard
              position={position}
              groups={groups}
              activeGroup={activeTab}
              userVote={userVotes ? userVotes[position.id] : null}
              onViewClosures={onViewClosures}
            />
          </View>
        ))}
      </View>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  listContainer: {
    paddingTop: 8,
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    ...Typography.body,
    color: colors.text,
    outlineStyle: 'none',
    scrollMarginTop: 80,
  },
  clearIcon: {
    marginLeft: 8,
    padding: 4,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  cardWrapper: {
    // Width is set dynamically
  },
  emptyContainer: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
  },
})
