import { useMemo } from 'react'
import { View, StyleSheet, TouchableOpacity } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { SemanticColors, BrandColor } from '../../constants/Colors'
import { useThemeColors } from '../../hooks/useThemeColors'
import { Shadows, Typography } from '../../constants/Theme'
import ThemedText from '../ThemedText'
import UserMiniCard from './UserMiniCard'

/**
 * Card displaying an agreed closure with both users
 * White card on top of green card layout (matching stats PositionCard pattern)
 *
 * @param {Object} props
 * @param {Object} props.closure - Closure object from API
 * @param {Function} props.onShowMap - Callback when "Show on Map" is pressed
 * @param {Function} props.onViewStatements - Callback when "View Statements" is pressed
 */
export default function ClosureCard({ closure, onShowMap, onViewStatements }) {
  const { t, i18n } = useTranslation('stats')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const {
    closureText,
    closedAt,
    crossGroup,
    positionHolderUser,
    initiatorUser,
  } = closure

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString(i18n.language, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <View style={styles.cardContainer}>
      {/* White section - users, badges, date, actions */}
      <View style={styles.whiteSection}>
        {/* Cross-group badge */}
        {crossGroup && (
          <View style={styles.badgesRow}>
            <View style={styles.crossGroupBadge}>
              <Ionicons name="git-compare-outline" size={12} color={colors.primary} />
              <ThemedText variant="badgeSm" color="primary" style={styles.badgeText}>{t('crossGroup')}</ThemedText>
            </View>
          </View>
        )}

        {/* Users row with handshake */}
        <View style={styles.usersRow}>
          <UserMiniCard
            user={positionHolderUser?.mapPosition ? positionHolderUser : { ...positionHolderUser, opinionGroup: null }}
            role="PROPOSER"
          />
          <View style={styles.handshakeContainer}>
            <MaterialCommunityIcons name="handshake-outline" size={22} color={SemanticColors.agree} />
          </View>
          <UserMiniCard
            user={initiatorUser?.mapPosition ? initiatorUser : { ...initiatorUser, opinionGroup: null }}
            role="OPPOSER"
            reverse
          />
        </View>

        {/* Date and actions row */}
        <View style={styles.footerRow}>
          <ThemedText variant="caption" color="secondary">{formatDate(closedAt)}</ThemedText>
          <TouchableOpacity style={styles.actionButton} onPress={onShowMap} accessibilityRole="button" accessibilityLabel={t('showMapA11y')}>
            <Ionicons name="map-outline" size={14} color={colors.primary} />
            <ThemedText variant="caption" color="primary" style={styles.actionButtonText}>{t('showMap')}</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      {/* Green section - closure text and statements button */}
      <View style={styles.greenSection}>
        <View style={styles.closureRow}>
          <MaterialCommunityIcons name="handshake-outline" size={18} color="#FFFFFF" />
          <ThemedText variant="bodySmall" color="inverse" style={styles.closureText}>{closureText?.content}</ThemedText>
        </View>
        <TouchableOpacity style={styles.statementsButton} onPress={onViewStatements} accessibilityRole="button" accessibilityLabel={t('viewStatementsA11y')}>
          <Ionicons name="list-outline" size={14} color="#FFFFFF" />
          <ThemedText variant="caption" color="inverse" style={styles.statementsButtonText}>{t('statements')}</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  cardContainer: {
    borderRadius: 12,
    backgroundColor: SemanticColors.agree,
    marginHorizontal: 16,
    marginBottom: 12,
    ...Shadows.card,
  },
  whiteSection: {
    backgroundColor: colors.cardBackground,
    padding: 16,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  crossGroupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BrandColor + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: BrandColor + '40',
  },
  badgeText: {
    fontWeight: '600',
    marginLeft: 2,
  },
  usersRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  handshakeContainer: {
    paddingHorizontal: 6,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  dateText: {
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BrandColor + '18',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  actionButtonText: {
    fontWeight: '500',
  },
  greenSection: {
    padding: 16,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  closureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closureText: {
    flex: 1,
  },
  statementsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 12,
    gap: 6,
  },
  statementsButtonText: {
    fontWeight: '600',
  },
})
