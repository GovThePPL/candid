import { StyleSheet, View, Text, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/Colors'
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
const STATE_COLORS = {
  approved: Colors.agree,
  denied: Colors.warning,
  modified: Colors.primary,
}

export default function AdminResponseCard({ data, onDismiss }) {
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
        <Ionicons name="shield-checkmark" size={40} color={Colors.primary} />
      </View>

      <Text style={styles.title}>Administrator Response</Text>

      <View style={[styles.outcomeBadge, { backgroundColor: STATE_COLORS[appealState] || Colors.primary }]}>
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

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  iconContainer: {
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 12,
  },
  outcomeBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  outcomeBadgeText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  responseContainer: {
    width: '100%',
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.pass,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  responseText: {
    fontSize: 14,
    color: Colors.light.text,
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
    color: Colors.light.text,
  },
  userUsername: {
    fontSize: 12,
    color: Colors.pass,
  },
  contextContainer: {
    width: '100%',
    backgroundColor: Colors.light.background,
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
    color: Colors.light.text,
    lineHeight: 18,
  },
  priorResponse: {
    gap: 4,
    marginBottom: 4,
  },
  priorResponseText: {
    fontSize: 13,
    color: Colors.pass,
    fontStyle: 'italic',
    marginLeft: 40,
  },
  dismissButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 8,
  },
  dismissButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
})
