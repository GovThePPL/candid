import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
import { Shadows } from '../../constants/Theme'
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
    return date.toLocaleDateString('en-US', {
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
              <Ionicons name="git-compare-outline" size={12} color={Colors.primary} />
              <Text style={styles.badgeText}>Cross-Group</Text>
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
            <MaterialCommunityIcons name="handshake-outline" size={22} color={Colors.agree} />
          </View>
          <UserMiniCard
            user={initiatorUser?.mapPosition ? initiatorUser : { ...initiatorUser, opinionGroup: null }}
            role="OPPOSER"
            reverse
          />
        </View>

        {/* Date and actions row */}
        <View style={styles.footerRow}>
          <Text style={styles.dateText}>{formatDate(closedAt)}</Text>
          <TouchableOpacity style={styles.actionButton} onPress={onShowMap}>
            <Ionicons name="map-outline" size={14} color={Colors.primary} />
            <Text style={styles.actionButtonText}>Show Map</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Green section - closure text and statements button */}
      <View style={styles.greenSection}>
        <View style={styles.closureRow}>
          <MaterialCommunityIcons name="handshake-outline" size={18} color="#FFFFFF" />
          <Text style={styles.closureText}>{closureText?.content}</Text>
        </View>
        <TouchableOpacity style={styles.statementsButton} onPress={onViewStatements}>
          <Ionicons name="list-outline" size={14} color="#FFFFFF" />
          <Text style={styles.statementsButtonText}>Statements</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 12,
    backgroundColor: Colors.agree,
    marginHorizontal: 16,
    marginBottom: 12,
    ...Shadows.card,
  },
  whiteSection: {
    backgroundColor: Colors.white,
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
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
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
    borderTopColor: Colors.cardBorder,
  },
  dateText: {
    fontSize: 12,
    color: Colors.pass,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '10',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.primary,
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
    fontSize: 14,
    color: Colors.white,
    lineHeight: 20,
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
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
  },
})
