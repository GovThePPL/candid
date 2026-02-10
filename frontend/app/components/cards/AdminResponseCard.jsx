import { StyleSheet, View, TouchableOpacity } from 'react-native'
import { useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../hooks/useThemeColors'
import { SemanticColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
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

      <ThemedText variant="statement" color="primary" style={styles.title}>Administrator Response</ThemedText>

      <View style={[styles.outcomeBadge, { backgroundColor: STATE_COLORS[appealState] || colors.primary }]}>
        <ThemedText variant="buttonSmall" color="inverse">{STATE_LABELS[appealState] || appealState}</ThemedText>
      </View>

      {adminResponseText ? (
        <View style={styles.responseContainer}>
          <ThemedText variant="badgeLg" color="secondary" style={styles.sectionLabel}>Admin's response</ThemedText>
          <ThemedText variant="bodySmall" style={styles.responseText}>"{adminResponseText}"</ThemedText>
        </View>
      ) : null}

      {adminResponder && (
        <View style={styles.userRow}>
          <ThemedText variant="badgeLg" color="secondary" style={styles.sectionLabel}>Decided by</ThemedText>
          <View style={styles.userInfo}>
            <Avatar user={adminResponder} size="sm" />
            <View>
              <ThemedText variant="buttonSmall">{adminResponder.displayName || 'Admin'}</ThemedText>
              <ThemedText variant="caption" color="secondary">@{adminResponder.username || 'unknown'}</ThemedText>
            </View>
          </View>
        </View>
      )}

      {originalAction && (
        <View style={styles.contextContainer}>
          <ThemedText variant="badgeLg" color="secondary" style={styles.sectionLabel}>Original action</ThemedText>
          <View style={styles.userInfo}>
            <Avatar user={originalAction.responder} size="sm" />
            <View>
              <ThemedText variant="buttonSmall">{originalAction.responder?.displayName || 'Moderator'}</ThemedText>
              <ThemedText variant="caption" color="secondary">@{originalAction.responder?.username || 'unknown'}</ThemedText>
            </View>
          </View>
          {originalAction.actions?.length > 0 && (
            <View style={styles.actionDetails}>
              {originalAction.actions.map((a, i) => (
                <ThemedText key={i} variant="caption" style={styles.actionDetailText}>
                  {CLASS_LABELS[a.userClass] || a.userClass}: {ACTION_LABELS[a.action] || a.action}
                </ThemedText>
              ))}
            </View>
          )}
        </View>
      )}

      {priorResponses?.length > 0 && (
        <View style={styles.contextContainer}>
          <ThemedText variant="badgeLg" color="secondary" style={styles.sectionLabel}>Moderator reviews</ThemedText>
          {priorResponses.map((pr, i) => (
            <View key={i} style={styles.priorResponse}>
              <View style={styles.userInfo}>
                <Avatar user={pr.responder} size="sm" />
                <View>
                  <ThemedText variant="buttonSmall">{pr.responder?.displayName || 'Moderator'}</ThemedText>
                  <ThemedText variant="caption" color="secondary">@{pr.responder?.username || 'unknown'}</ThemedText>
                </View>
              </View>
              {pr.responseText && (
                <ThemedText variant="label" color="secondary" style={styles.priorResponseText}>"{pr.responseText}"</ThemedText>
              )}
            </View>
          ))}
        </View>
      )}

      {onDismiss && (
        <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
          <ThemedText variant="button" color="inverse">Dismiss</ThemedText>
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
    fontWeight: '700',
    marginBottom: 12,
  },
  outcomeBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  responseContainer: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  responseText: {
    fontStyle: 'italic',
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
    fontWeight: '500',
    lineHeight: 18,
  },
  priorResponse: {
    gap: 4,
    marginBottom: 4,
  },
  priorResponseText: {
    fontWeight: '400',
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
})
