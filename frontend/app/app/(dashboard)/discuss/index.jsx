import { useState, useMemo, useContext, useCallback } from 'react'
import { View, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { Spacing } from '../../../constants/Theme'
import { UserContext } from '../../../contexts/UserContext'
import { hasQAAuthority } from '../../../lib/roles'
import usePostsFeed from '../../../hooks/usePostsFeed'
import Header from '../../../components/Header'
import LocationCategorySelector from '../../../components/LocationCategorySelector'
import FeedTabBar from '../../../components/discuss/FeedTabBar'
import SortDropdown from '../../../components/discuss/SortDropdown'
import PostCard from '../../../components/discuss/PostCard'
import EmptyState from '../../../components/EmptyState'
import ThemedText from '../../../components/ThemedText'

export default function DiscussFeed() {
  const { t } = useTranslation('discuss')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user } = useContext(UserContext)

  const [selectedLocation, setSelectedLocation] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [postType, setPostType] = useState('discussion')

  const isQAAuthority = hasQAAuthority(user)

  const {
    posts,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore,
    sort,
    setSort,
    answeredFilter,
    setAnsweredFilter,
    fetchPosts,
    loadMore,
    handleRefresh,
    handleUpvote,
  } = usePostsFeed(selectedLocation, selectedCategory, postType)

  // Reset answered filter when switching tabs
  const handleTabChange = useCallback((tab) => {
    setPostType(tab)
    setAnsweredFilter(null)
  }, [setAnsweredFilter])

  const handlePostPress = useCallback((post) => {
    router.push(`/discuss/${post.id}`)
  }, [router])

  const renderPostCard = useCallback(({ item }) => (
    <PostCard
      post={item}
      onPress={() => handlePostPress(item)}
      onUpvote={handleUpvote}
    />
  ), [handlePostPress, handleUpvote])

  const keyExtractor = useCallback((item) => item.id, [])

  const renderEmpty = useCallback(() => {
    if (loading) return null
    if (error) {
      return (
        <EmptyState
          icon="alert-circle-outline"
          title={t('errorLoadPosts')}
          subtitle={error.message}
        />
      )
    }
    const isQA = postType === 'question'
    return (
      <EmptyState
        icon={isQA ? 'help-circle-outline' : 'chatbubbles-outline'}
        title={isQA ? t('emptyQATitle') : t('emptyFeedTitle')}
        subtitle={isQA ? t('emptyQASubtitle') : t('emptyFeedSubtitle')}
      />
    )
  }, [loading, error, postType, t])

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    )
  }, [loadingMore, colors.primary, styles.footer])

  // Q&A answered filter options
  const answerFilterOptions = postType === 'question' ? (
    isQAAuthority
      ? [
          { id: null, label: t('filterAll') },
          { id: 'false', label: t('filterUnanswered') },
        ]
      : [
          { id: null, label: t('filterAll') },
          { id: 'true', label: t('filterAnswered') },
        ]
  ) : null

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header />

      <FlatList
        data={posts}
        renderItem={renderPostCard}
        keyExtractor={keyExtractor}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        ListHeaderComponent={
          <>
            <LocationCategorySelector
              selectedLocation={selectedLocation}
              selectedCategory={selectedCategory}
              onLocationChange={setSelectedLocation}
              onCategoryChange={setSelectedCategory}
              showAllCategories
            />

            {/* Tab bar + sort dropdown row */}
            <View style={styles.controlsRow}>
              <FeedTabBar activeTab={postType} onTabChange={handleTabChange} />
              <SortDropdown sort={sort} onSortChange={setSort} />
            </View>

            {/* Q&A filter row */}
            {answerFilterOptions && (
              <View style={styles.filterRow}>
                {answerFilterOptions.map((option) => {
                  const isActive = answeredFilter === option.id
                  return (
                    <TouchableOpacity
                      key={String(option.id)}
                      style={[styles.filterButton, isActive && styles.filterButtonActive]}
                      onPress={() => setAnsweredFilter(option.id)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={t('filterA11y', { filter: option.label })}
                    >
                      <ThemedText
                        variant="caption"
                        style={[styles.filterButtonText, isActive && styles.filterButtonTextActive]}
                      >
                        {option.label}
                      </ThemedText>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}

            {/* Loading indicator for initial load */}
            {loading && !refreshing && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}
          </>
        }
        contentContainerStyle={posts.length === 0 && !loading ? styles.emptyContainer : styles.listContent}
      />
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  filterButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 12,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  filterButtonActive: {
    backgroundColor: colors.buttonSelected,
    borderColor: colors.buttonSelected,
  },
  filterButtonText: {
    color: colors.secondaryText,
  },
  filterButtonTextActive: {
    color: colors.buttonSelectedText,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: Spacing.xxl,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  loadingContainer: {
    padding: Spacing.xxl,
    alignItems: 'center',
  },
  footer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
})
