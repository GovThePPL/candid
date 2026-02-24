import { memo, useMemo } from 'react'
import { View, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Spacing } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import UserCard from '../UserCard'
import { formatRelativeTime } from '../../lib/timeUtils'
import ReviewDiffContent from './ReviewDiffContent'
import MarkdownRenderer from '../discuss/MarkdownRenderer'

/**
 * Expandable accordion card for a version entry in the history list.
 *
 * @param {Object} props
 * @param {Object} props.version - Version summary from API (id, title, editedBy, editedAt)
 * @param {boolean} props.expanded - Whether this card is expanded
 * @param {Function} props.onToggle - Called when header is pressed to toggle expand/collapse
 * @param {Object|null} props.versionDetail - Fetched version detail (beforeSnapshot/afterSnapshot)
 * @param {boolean} props.detailLoading - Whether the detail is currently loading
 * @param {boolean} props.isTerm - Whether this is a glossary term (shows aliases)
 */
export default memo(function VersionCard({
  version,
  expanded,
  onToggle,
  versionDetail,
  detailLoading,
  isTerm,
}) {
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const authorName = version.editedBy?.displayName || version.editedBy?.username || '?'
  const dateStr = version.editedAt ? formatRelativeTime(version.editedAt, t) : ''

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={t('historyVersionA11y', { author: authorName, date: dateStr })}
        accessibilityState={{ expanded: !!expanded }}
      >
        <View style={styles.info}>
          <ThemedText variant="body" numberOfLines={1}>
            {version.title}
          </ThemedText>
          {version.editedBy && (
            <UserCard
              user={version.editedBy}
              variant="inline"
              timestamp={version.editedAt}
              showRoleBadge={false}
              showKudosCount={false}
            />
          )}
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.secondaryText}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {detailLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : versionDetail?.afterSnapshot ? (
            <ReviewDiffContent
              original={versionDetail.beforeSnapshot}
              proposed={versionDetail.afterSnapshot}
              isTerm={isTerm}
            />
          ) : versionDetail?.beforeSnapshot ? (
            <View style={styles.earliestBanner}>
              <Ionicons name="information-circle-outline" size={20} color={colors.secondaryText} />
              <ThemedText variant="bodySmall" color="secondary">
                {t('historyEarliestVersion')}
              </ThemedText>
            </View>
          ) : (
            <View style={styles.errorBanner}>
              <ThemedText variant="bodySmall" color="secondary">
                {t('historyVersionLoadError')}
              </ThemedText>
            </View>
          )}
        </View>
      )}
    </View>
  )
})

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  earliestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: colors.surfaceSecondary || colors.background,
    borderRadius: 8,
    padding: Spacing.md,
  },
  errorBanner: {
    padding: Spacing.md,
  },
})
