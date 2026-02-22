import { memo, useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../hooks/useThemeColors'
import ThemedText from '../ThemedText'
import LocationCategoryBadge from '../LocationCategoryBadge'
import { formatRelativeTime } from '../../lib/timeUtils'

/**
 * Card component for wiki page list items.
 *
 * @param {Object} props
 * @param {Object} props.page - Wiki page summary object
 * @param {Function} props.onPress - Called when the card is pressed
 * @param {Object} [props.scope] - Resolved scope { location, category } for LocationCategoryBadge
 */
export default memo(function WikiPageCard({ page, onPress, scope }) {
  const { t } = useTranslation('glossary')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('wikiArticleA11y', { title: page.title })}
    >
      <View style={styles.topRow}>
        <LocationCategoryBadge
          location={scope?.location}
          category={scope?.category}
          locationFallback={t('wikiScopeAllLocations')}
          categoryFallback={t('wikiScopeAllCategories')}
          size="sm"
        />
        {page.updatedAt ? (
          <ThemedText variant="caption" color="secondary">
            {formatRelativeTime(page.updatedAt, t)}
          </ThemedText>
        ) : null}
      </View>

      <ThemedText variant="h4" numberOfLines={1} style={styles.title}>
        {page.title}
      </ThemedText>

      {page.description ? (
        <ThemedText variant="bodySmall" color="secondary" numberOfLines={2}>
          {page.description}
        </ThemedText>
      ) : null}
    </TouchableOpacity>
  )
})

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    marginBottom: 4,
  },
})
