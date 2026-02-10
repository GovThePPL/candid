import { StyleSheet, View, Text, TouchableOpacity } from 'react-native'
import { useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../hooks/useThemeColors'
import { SemanticColors } from '../../constants/Colors'
import Avatar from '../Avatar'

const ACTION_LABELS = {
  removed: 'Remove Content',
  warning: 'Warning',
  temporary_ban: 'Temporary Ban',
  permanent_ban: 'Permanent Ban',
}
const CLASS_LABELS = {
  submitter: 'Creator',
  active_adopter: 'Active Adopters',
  passive_adopter: 'Passive Adopters',
}
const STATE_LABELS = {
  approved: 'Appeal Approved',
  denied: 'Appeal Denied',
  modified: 'Action Modified',
}

export default function AdminResponseCard({ data, onDismiss }) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const STATE_COLORS = useMemo(() => ({
    approved: SemanticColors.agree,
    denied: SemanticColors.warning,
    modified: colors.primary,
  }), [colors])

  const {
    appealState,
    adminResponseText,
    adminResponder,
    originalAction,
    priorResponses,
  } = data || {}

  return (
    <View style={styles.card}>
      <View style={styles.iconContainer}>
        <Ionicons name="shield-checkmark" size={40} color={colors.primary} />
      </View>

      <Text style={styles.title}>Administrator Response</Text>

      <View style={[styles.outcomeBadge, { backgroundColor: STATE_COLORS[appealState] || colors.primary }]}>
        <Text style={styles.outcomeBadgeText}>{STATE_LABELS[appealState] || appealState}</Text>
      </View>

      {adminResponseText ? (
        <View style={styles.responseContainer}>
          <Text style={styles.sectionLabel}>Admin's response</Text>
          <Text style={styles.responseText}>"{adminResponseText}"</Text>
        </View>
      ) : null}

      {adminResponder && (
        <View style={styles.userRow}>
          <Text style={styles.sectionLabel}>Decided by</Text>
          <View style={styles.userInfo}>
            <Avatar user={adminResponder} size="sm" />
            <View>
              <Text style={styles.userName}>{adminResponder.displayName || 'Admin'}</Text>
              <Text style={styles.userUsername}>@{adminResponder.username || 'unknown'}</Text>
            </View>
          </View>
        </View>
      )}

      {originalAction && (
        <View style={styles.contextContainer}>
          <Text style={styles.sectionLabel}>Original action</Text>
          <View style={styles.userInfo}>
            <Avatar user={originalAction.responder} size="sm" />
            <View>
              <Text style={styles.userName}>{originalAction.responder?.displayName || 'Moderator'}</Text>
              <Text style={styles.userUsername}>@{originalAction.responder?.username || 'unknown'}</Text>
            </View>
          </View>
          {originalAction.actions?.length > 0 && (
            <View style={styles.actionDetails}>
              {originalAction.actions.map((a, i) => (
                <Text key={i} style={styles.actionDetailText}>
                  {CLASS_LABELS[a.userClass] || a.userClass}: {ACTION_LABELS[a.action] || a.action}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {priorResponses?.length > 0 && (
        <View style={styles.contextContainer}>
          <Text style={styles.sectionLabel}>Moderator reviews</Text>
          {priorResponses.map((pr, i) => (
            <View key={i} style={styles.priorResponse}>
              <View style={styles.userInfo}>
                <Avatar user={pr.responder} size="sm" />
                <View>
                  <Text style={styles.userName}>{pr.responder?.displayName || 'Moderator'}</Text>
                  <Text style={styles.userUsername}>@{pr.responder?.username || 'unknown'}</Text>
                </View>
              </View>
              {pr.responseText && (
                <Text style={styles.priorResponseText}>"{pr.responseText}"</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {onDismiss && (
        <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
          <Text style={styles.dismissButtonText}>Dismiss</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  iconContainer: {
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 12,
  },
  outcomeBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  outcomeBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  responseContainer: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondaryText,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  responseText: {
    fontSize: 14,
    color: colors.text,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  userRow: {
    width: '100%',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  userUsername: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  contextContainer: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    gap: 6,
  },
  actionDetails: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionDetailText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
    lineHeight: 18,
  },
  priorResponse: {
    gap: 4,
    marginBottom: 4,
  },
  priorResponseText: {
    fontSize: 13,
    color: colors.secondaryText,
    fontStyle: 'italic',
    marginLeft: 40,
  },
  dismissButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 8,
  },
  dismissButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
})
