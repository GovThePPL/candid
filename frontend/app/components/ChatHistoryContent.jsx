import { StyleSheet, View, TouchableOpacity, RefreshControl, Alert } from 'react-native'
import { useCallback, useState, useContext, useMemo } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { SemanticColors } from '../constants/Colors'
import { Shadows } from '../constants/Theme'
import { useThemeColors } from '../hooks/useThemeColors'
import useChatHistory from '../hooks/useChatHistory'
import { useToast } from '../components/Toast'
import ThemedText from '../components/ThemedText'
import EmptyState from '../components/EmptyState'
import CardShell from '../components/CardShell'
import PositionInfoCard from '../components/PositionInfoCard'
import { SkeletonPulse, SkeletonBox, SkeletonCircle, SkeletonLine } from '../components/Skeleton'
import { UserContext } from '../contexts/UserContext'
import useModerateChecker from '../hooks/useModerateChecker'
import api from '../lib/api'
import ReportModal from '../components/ReportModal'
import ModerationActionModal from '../components/ModerationActionModal'
import KudosMedallion from '../components/KudosMedallion'
import StickyHeaderFlatList from '../components/StickyHeaderFlatList'

const formatDate = (dateString, t) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return t('yesterday')
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'long' })
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
  }
}

const getEndTypeLabel = (endType, endedByUserId, currentUserId, colors, t) => {
  switch (endType) {
    case 'mutual_agreement':
    case 'agreed_closure':
      return { label: t('endAgreed'), color: SemanticColors.agree, icon: 'handshake-outline', iconType: 'material-community' }
    case 'disagreement':
      return { label: t('endDisagreed'), color: SemanticColors.disagree, icon: 'close-circle' }
    case 'timeout':
      return { label: t('endTimedOut'), color: colors.pass, icon: 'time' }
    case 'abandoned':
    case 'user_exit':
      if (endedByUserId && currentUserId) {
        if (endedByUserId === currentUserId) {
          return { label: t('endYouLeft'), color: colors.pass, icon: 'exit-outline' }
        } else {
          return { label: t('endTheyLeft'), color: colors.pass, icon: 'exit-outline' }
        }
      }
      return { label: t('endEnded'), color: colors.pass, icon: 'exit' }
    default:
      return { label: t('endActive'), color: colors.primary, icon: 'chatbubbles' }
  }
}


function MetaBadgeIcon({ endTypeInfo }) {
  if (endTypeInfo.iconType === 'material-community') {
    return <MaterialCommunityIcons name={endTypeInfo.icon} size={14} color={endTypeInfo.color} />
  }
  return <Ionicons name={endTypeInfo.icon} size={14} color={endTypeInfo.color} />
}

function ChatHistoryCard({ chat, onPress, onSendKudos, onReport, onModerate, canModerate, currentUserId, colors, styles }) {
  const { t } = useTranslation('chat')
  const { position, otherUser, agreedClosure, startTime, endTime, endType, status, endedByUserId, kudosSent, kudosReceived } = chat
  const endTypeInfo = getEndTypeLabel(endType, endedByUserId, currentUserId, colors, t)
  const isActive = status === 'active' && !endTime
  const showKudosSection = agreedClosure != null

  const positionWithOtherUser = position ? { ...position, creator: otherUser } : position

  const closureBottomSection = agreedClosure ? (
    <View>
      <View style={styles.closureRow}>
        <MaterialCommunityIcons name="handshake-outline" size={18} color="#FFFFFF" />
        <ThemedText variant="bodySmall" color="inverse" style={styles.closureText} numberOfLines={2}>{agreedClosure?.content}</ThemedText>
      </View>

      {showKudosSection && (
        <View style={styles.kudosRow}>
          <View style={styles.kudosLeft}>
            {kudosReceived ? (
              <View style={styles.kudosReceivedContainer}>
                <KudosMedallion active={true} size={28} />
                <ThemedText variant="caption" style={styles.kudosReceivedText}>{t('sentYouKudos', { name: otherUser?.displayName || t('someone') })}</ThemedText>
              </View>
            ) : (
              <View style={styles.kudosPlaceholder} />
            )}
          </View>

          <TouchableOpacity
            style={[styles.kudosPillButton, kudosSent && styles.kudosPillButtonSent]}
            onPress={(e) => {
              e.stopPropagation()
              if (!kudosSent && onSendKudos) {
                onSendKudos(chat.id)
              }
            }}
            disabled={kudosSent}
            activeOpacity={kudosSent ? 1 : 0.7}
            accessibilityRole="button"
            accessibilityLabel={kudosSent ? t('kudosSent') : t('sendKudos')}
          >
            <KudosMedallion active={kudosSent} size={22} />
            <ThemedText variant="badgeLg" style={[styles.kudosPillText, kudosSent && styles.kudosPillTextSent]}>
              {kudosSent ? t('kudosSent') : t('sendKudos')}
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}
    </View>
  ) : null

  return (
    <View style={styles.cardWrapper}>
      {/* Metadata row */}
      <View style={styles.chatMetaRow}>
        <View style={styles.metaDateRow}>
          <ThemedText variant="caption" color="secondary">{formatDate(endTime || startTime, t)}</ThemedText>
          {isActive && <View style={styles.activeDot} />}
        </View>
        <View style={styles.metaRightRow}>
          <View style={[styles.metaBadge, { backgroundColor: endTypeInfo.color + '20' }]}>
            <MetaBadgeIcon endTypeInfo={endTypeInfo} />
            <ThemedText variant="badgeLg" style={{ color: endTypeInfo.color }}>{endTypeInfo.label}</ThemedText>
          </View>
          {!isActive && (canModerate ? (
            onModerate && (
              <TouchableOpacity
                onPress={() => onModerate(chat.id)}
                style={styles.reportIconButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('moderateChatA11y')}
              >
                <Ionicons name="shield-outline" size={16} color={colors.secondaryText} />
              </TouchableOpacity>
            )
          ) : (
            onReport && (
              <TouchableOpacity
                onPress={() => onReport(chat.id)}
                style={styles.reportIconButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('reportChatA11y')}
              >
                <Ionicons name="flag-outline" size={16} color={colors.secondaryText} />
              </TouchableOpacity>
            )
          ))}
        </View>
      </View>

      <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityLabel={t('viewChatA11y')}>
        <CardShell
          accentColor={agreedClosure ? colors.agreeSurface : colors.cardBackground}
          bottomSection={closureBottomSection}
          bottomStyle={styles.closureBottom}
        >
          <PositionInfoCard
            position={positionWithOtherUser}
            authorSubtitle="username"
            numberOfLines={3}
          />
        </CardShell>
      </TouchableOpacity>
    </View>
  )
}

function ChatListSkeleton({ styles, colors }) {
  return (
    <SkeletonPulse style={styles.listContent}>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={styles.cardWrapper}>
          {/* Meta row */}
          <View style={styles.chatMetaRow}>
            <SkeletonLine width={60} height={10} />
            <SkeletonBox width={80} height={24} borderRadius={12} />
          </View>
          {/* CardShell mimic — rounded card with padding */}
          <View style={styles.skeletonChatCard}>
            {/* Badge row (LocationCategoryBadge) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <SkeletonBox width={36} height={20} borderRadius={10} />
              <SkeletonLine width={70} height={12} />
            </View>
            {/* Statement lines */}
            <View style={{ gap: 6, marginBottom: 12 }}>
              <SkeletonLine width="90%" height={13} />
              <SkeletonLine width="75%" height={13} />
            </View>
            {/* Creator row with border-top */}
            <View style={styles.skeletonCreatorRow}>
              <SkeletonCircle size={32} />
              <SkeletonLine width={80} height={11} />
            </View>
          </View>
        </View>
      ))}
    </SkeletonPulse>
  )
}

export default function ChatHistoryContent({ showHeader = true, onScroll, listHeader, stickyHeader }) {
  const { user } = useContext(UserContext)
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { t } = useTranslation('chat')
  const showToast = useToast()

  const {
    chats, loading, refreshing, error,
    fetchChats, handleSendKudos, handleRefresh,
  } = useChatHistory()

  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [reportChatId, setReportChatId] = useState(null)

  // Moderation state
  const checkModerateScope = useModerateChecker()
  const [moderateTarget, setModerateTarget] = useState(null)
  const [moderateRule, setModerateRule] = useState(null)
  const [moderateComment, setModerateComment] = useState(null)
  const [actionModalVisible, setActionModalVisible] = useState(false)

  const handleChatPress = useCallback((chat) => {
    router.push(`/chat/${chat.id}?mode=history`)
  }, [router])

  const handleReportChat = useCallback((chatId) => {
    setReportChatId(chatId)
    setReportModalVisible(true)
  }, [])

  const handleSubmitChatReport = useCallback(async (ruleId, comment) => {
    if (!reportChatId) return
    try {
      await api.moderation.reportChat(reportChatId, ruleId, comment)
      setReportModalVisible(false)
    } catch (err) {
      console.error('Failed to submit chat report:', err)
      showToast(t('errorReportFailed'))
    }
  }, [reportChatId, showToast, t])

  const handleModerateChat = useCallback((chatId) => {
    setModerateTarget({ type: 'chat_log', id: chatId })
    setReportModalVisible(true)
  }, [])

  const handleModerateRuleSelected = useCallback(async (ruleId, comment, rule) => {
    setModerateRule(rule)
    setModerateComment(comment)
    setReportModalVisible(false)
    setTimeout(() => setActionModalVisible(true), 300)
  }, [])

  const handleModerateActionSubmit = useCallback(async (actionData) => {
    if (!moderateTarget || !moderateRule) return
    try {
      await api.moderation.inlineAction({
        targetType: moderateTarget.type,
        targetId: moderateTarget.id,
        ruleId: moderateRule.id,
        comment: moderateComment,
        ...actionData,
      })
      setActionModalVisible(false)
      Alert.alert(t('discuss:moderationSuccess'))
      handleRefresh()
    } catch (err) {
      if (err?.status === 403) {
        Alert.alert(t('discuss:moderationForbidden'))
      } else {
        console.error('Inline moderation failed:', err)
      }
      throw err
    }
  }, [moderateTarget, moderateRule, moderateComment, t, handleRefresh])

  const renderChatItem = useCallback(({ item }) => {
    const canMod = checkModerateScope(item.position?.location?.id, item.position?.category?.id)
    return (
      <ChatHistoryCard
        chat={item}
        onPress={() => handleChatPress(item)}
        onSendKudos={handleSendKudos}
        onReport={handleReportChat}
        onModerate={handleModerateChat}
        canModerate={canMod}
        currentUserId={user?.id}
        colors={colors}
        styles={styles}
      />
    )
  }, [handleChatPress, handleSendKudos, handleReportChat, handleModerateChat, checkModerateScope, user?.id, colors, styles])

  const keyExtractor = useCallback((item) => item.id, [])

  const renderEmpty = () => {
    if (loading) return null
    return (
      <EmptyState
        icon="chatbubbles-outline"
        title={t('noChatsTitle')}
        subtitle={t('noChatsSubtitle')}
        style={styles.emptyContainer}
      />
    )
  }

  return (
    <View style={{ flex: 1 }}>
      {showHeader && (
        <View style={styles.sectionHeader}>
          <ThemedText variant="h1" color="primary">{t('chatHistory')}</ThemedText>
          <ThemedText variant="bodySmall" color="secondary" style={styles.subtitle}>{chats.length === 1 ? t('conversationCountOne', { count: chats.length }) : t('conversationCount', { count: chats.length })}</ThemedText>
        </View>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={24} color={SemanticColors.warning} />
          <ThemedText variant="bodySmall" style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity onPress={() => fetchChats()} style={styles.retryButton} accessibilityRole="button" accessibilityLabel={t('retry')}>
            <ThemedText variant="badgeLg" color="inverse">{t('retry')}</ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {loading && !refreshing && chats.length === 0 ? (
        <>{listHeader}{stickyHeader}<ChatListSkeleton styles={styles} colors={colors} /></>
      ) : (
        <StickyHeaderFlatList
          listHeader={listHeader}
          stickyHeader={stickyHeader}
          data={chats}
          renderItem={renderChatItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          onScroll={onScroll}
          scrollEventThrottle={onScroll ? 16 : undefined}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      )}

      <ReportModal
        visible={reportModalVisible}
        onClose={() => { setReportModalVisible(false); setReportChatId(null) }}
        onSubmit={moderateTarget ? handleModerateRuleSelected : handleSubmitChatReport}
        contentType="chat_log"
        isModerating={!!moderateTarget}
      />

      <ModerationActionModal
        visible={actionModalVisible}
        onClose={() => { setActionModalVisible(false); setModerateTarget(null); setModerateRule(null); setModerateComment(null) }}
        onSubmit={handleModerateActionSubmit}
        reportType={moderateTarget?.type}
        rule={moderateRule}
      />
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  subtitle: {
    marginTop: 4,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
    flexGrow: 1,
  },
  skeletonChatCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    ...Shadows.card,
    overflow: 'hidden',
  },
  skeletonCreatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorBannerBg,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: SemanticColors.warning,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: SemanticColors.warning,
    borderRadius: 6,
  },
  emptyContainer: {
    paddingBottom: 100,
  },

  // Card wrapper and metadata row
  cardWrapper: {
    marginBottom: 16,
  },
  chatMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  metaDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  metaRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reportIconButton: {
    padding: 2,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: SemanticColors.agree,
  },

  // Closure bottom section
  closureBottom: {
    padding: 12,
  },
  closureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closureText: {
    flex: 1,
  },

  // Kudos row styles (for agreed closures)
  kudosRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  kudosLeft: {
    flex: 1,
    alignItems: 'flex-start',
  },
  kudosReceivedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kudosReceivedText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  kudosPlaceholder: {
    width: 28,
    height: 28,
  },
  kudosPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 248, 220, 0.25)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 25,
    width: 130,
    justifyContent: 'center',
  },
  kudosPillButtonSent: {
    backgroundColor: 'rgba(255, 215, 0, 0.3)',
  },
  kudosPillText: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  kudosPillTextSent: {
    color: '#FFFFFF',
  },
})
