import { StyleSheet, View, TouchableOpacity, Platform } from 'react-native'
import { useState, useCallback, useRef, useMemo } from 'react'
import { useRouter, usePathname } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import useIsDesktop from '../hooks/useIsDesktop'
import { useAuth, useChatContext } from '../contexts/UserContext'
import { useNotificationCount } from '../contexts/NotificationContext'
import { useLocationSession } from '../contexts/LocationSessionContext'
import ChatRequestIndicator from './ChatRequestIndicator'
import IncomingChatRequestIndicator from './IncomingChatRequestIndicator'
import Avatar from './Avatar'
import ThemedText from './ThemedText'
// SessionStageBar removed — replaced by SessionInfoCard + SessionOverviewModal
import { useToast } from './Toast'
import api from '../lib/api'

export default function Header({ onBack, showCreateButton, showAvatar = true, disableAvatarPress = false, showSettingsButton = false, settingsActive = false, onSettingsBack, hideSessionBar = false }) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets])
  const showToast = useToast()
  const { user } = useAuth()
  const { pendingChatRequest, clearPendingChatRequest, incomingChatRequest, clearIncomingChatRequest } = useChatContext()
  const isDesktop = useIsDesktop()
  const { unreadCount } = useNotificationCount()
  const { openSessionSelector, openSessionOverview, viewingStage, isReadOnly } = useLocationSession()
  const [headerWidth, setHeaderWidth] = useState(0)

  const [rightWidth, setRightWidth] = useState(0)
  const logoWidthRef = useRef(0)

  // Show received indicator when: incoming request exists, no sent request, not on cards page, not desktop
  const showReceivedIndicator = !!incomingChatRequest && !pendingChatRequest && pathname !== '/cards' && !isDesktop
  const hasActiveIndicator = !!pendingChatRequest || showReceivedIndicator

  // Dynamically show logo if there's room for both logo + full indicator
  // Full indicator: avatar(40) + name(~60) + bubble(40) + gaps(16) + border+padding(12) ≈ 170px
  // Add generous spacing so elements don't feel cramped
  const COMFORTABLE_INDICATOR_WIDTH = 210
  const HEADER_PADDING = 24 // paddingHorizontal(12) * 2
  const SECTION_GAPS = 40 // minimum breathing room between logo, indicator, and right section
  const availableWidth = headerWidth - rightWidth - HEADER_PADDING
  // On sub-pages (onBack), always hide logo when indicator is active — back arrow is enough context
  const showLogo = !hasActiveIndicator ||
    (!onBack && availableWidth >= logoWidthRef.current + SECTION_GAPS + COMFORTABLE_INDICATOR_WIDTH)

  // Handle chat request timeout - rescind and add to chatting list
  const handleChatRequestTimeout = useCallback(async () => {
    const requestId = pendingChatRequest?.id
    const positionId = pendingChatRequest?.positionId
    clearPendingChatRequest()
    if (requestId) {
      try {
        await api.chat.rescindChatRequest(requestId)
      } catch (err) {
        console.error('Failed to rescind chat request:', err)
      }
    }
    // Auto-add to chatting list so user gets notified when someone is available
    if (positionId) {
      showToast(t('cards:addedToChattingList'))
      try {
        await api.chattingList.addPosition(positionId)
      } catch (err) {
        console.error('Failed to add to chatting list:', err)
      }
    }
  }, [pendingChatRequest, clearPendingChatRequest, showToast, t])

  // Handle chat request cancellation by user
  const handleChatRequestCancel = useCallback(async () => {
    const requestId = pendingChatRequest?.id
    clearPendingChatRequest()
    if (requestId) {
      try {
        await api.chat.rescindChatRequest(requestId)
      } catch (err) {
        console.error('Failed to rescind chat request:', err)
        showToast(t('errorChatRequestRescindFailed'))
      }
    }
  }, [pendingChatRequest, clearPendingChatRequest, showToast, t])

  // Desktop: tab screens don't need the header at all (DesktopNav handles navigation)
  if (isDesktop && !onBack) return null

  // Desktop sub-pages: render only a slim back button
  if (isDesktop && onBack) {
    return (
      <View style={styles.desktopBackBar}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityLabel={t('goBack')} accessibilityRole="button">
          <Ionicons name="arrow-back" size={22} color={colors.primary} />
        </TouchableOpacity>
        {pendingChatRequest && (
          <ChatRequestIndicator
            pendingRequest={pendingChatRequest}
            onTimeout={handleChatRequestTimeout}
            onCancel={handleChatRequestCancel}
          />
        )}
        {showReceivedIndicator && (
          <IncomingChatRequestIndicator
            incomingRequest={incomingChatRequest}
            onExpire={clearIncomingChatRequest}
          />
        )}
      </View>
    )
  }

  return (
    <View style={styles.headerWrapper}>
      <View style={styles.header} onLayout={e => setHeaderWidth(e.nativeEvent.layout.width)}>
        {/* Left section */}
        <View style={[styles.headerLeft, hasActiveIndicator && !showLogo && styles.headerLeftExpanded]}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityLabel={t('goBack')} accessibilityRole="button">
              <Ionicons name="arrow-back" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
          {showLogo && (
            <TouchableOpacity
              onPress={openSessionSelector}
              accessibilityRole="button"
              accessibilityLabel={t('sessionSelectorOpenA11y')}
            >
              <ThemedText
                variant="brandCompact"
                style={[styles.logo, { color: colors.logoText }]}
                onLayout={e => { logoWidthRef.current = e.nativeEvent.layout.width }}
              >
                Candid{Platform.OS !== 'web' ? ' ' : ''}
              </ThemedText>
            </TouchableOpacity>
          )}
          {/* Narrow: indicator replaces logo, left-aligned */}
          {pendingChatRequest && !showLogo && (
            <ChatRequestIndicator
              pendingRequest={pendingChatRequest}
              onTimeout={handleChatRequestTimeout}
              onCancel={handleChatRequestCancel}
            />
          )}
          {showReceivedIndicator && !showLogo && (
            <IncomingChatRequestIndicator
              incomingRequest={incomingChatRequest}
              onExpire={clearIncomingChatRequest}
            />
          )}
        </View>

        {/* Center section: indicator between logo and right when there's room */}
        {pendingChatRequest && showLogo && (
          <View style={styles.headerCenter}>
            <ChatRequestIndicator
              pendingRequest={pendingChatRequest}
              onTimeout={handleChatRequestTimeout}
              onCancel={handleChatRequestCancel}
            />
          </View>
        )}
        {showReceivedIndicator && showLogo && (
          <View style={styles.headerCenter}>
            <IncomingChatRequestIndicator
              incomingRequest={incomingChatRequest}
              onExpire={clearIncomingChatRequest}
            />
          </View>
        )}

        {/* Right section */}
        <View style={styles.headerRight} onLayout={e => setRightWidth(e.nativeEvent.layout.width)}>
          {showCreateButton && (
            <TouchableOpacity onPress={() => router.push('/profile?tab=positions')} style={styles.createButton} accessibilityLabel={t('createPositionA11y')} accessibilityRole="button">
              <ThemedText variant="bodySmall" color="secondary" style={styles.createButtonText}>{t('tabAdd')}</ThemedText>
              <Ionicons name="add" size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          )}
          {/* On desktop, notifications bell and avatar/settings are in the sidebar nav */}
          {!isDesktop && (
            <>
              {pathname === '/notifications' ? (
                <View
                  style={styles.bellButton}
                  accessibilityLabel={unreadCount > 0
                    ? t('notifications:bellA11y', { count: unreadCount })
                    : t('notifications:bellA11yNone')}
                >
                  <Ionicons
                    name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
                    size={22}
                    color={colors.secondaryText}
                  />
                  {unreadCount > 0 && (
                    <View style={styles.badge}>
                      <ThemedText variant="label" style={styles.badgeText}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </ThemedText>
                    </View>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => router.push('/notifications')}
                  style={styles.bellButton}
                  accessibilityLabel={unreadCount > 0
                    ? t('notifications:bellA11y', { count: unreadCount })
                    : t('notifications:bellA11yNone')}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
                    size={22}
                    color={colors.secondaryText}
                  />
                  {unreadCount > 0 && (
                    <View style={styles.badge}>
                      <ThemedText variant="label" style={styles.badgeText}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </ThemedText>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              {showSettingsButton ? (
                settingsActive ? (
                  <TouchableOpacity onPress={onSettingsBack} style={styles.settingsButtonActive} accessibilityLabel={t('settings:settingsTitle')} accessibilityRole="button">
                    <Ionicons name="settings" size={22} color="#FFFFFF" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => router.push('/settings')} style={styles.settingsButton} accessibilityLabel={t('settings:settingsTitle')} accessibilityRole="button">
                    <Ionicons name="settings-outline" size={22} color={colors.primary} />
                  </TouchableOpacity>
                )
              ) : showAvatar && (disableAvatarPress ? (
                <View accessibilityLabel={t('viewProfile')}>
                  <Avatar user={user} size={36} showKudosBadge showKudosCount />
                </View>
              ) : (
                <TouchableOpacity onPress={() => router.push('/profile')} accessibilityLabel={t('viewProfile')} accessibilityRole="button">
                  <Avatar user={user} size={36} showKudosBadge showKudosCount />
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      </View>
      {!hideSessionBar && !pathname.startsWith('/admin') && isReadOnly && (
        viewingStage ? (
          <TouchableOpacity
            style={styles.readOnlyBanner}
            onPress={openSessionOverview}
            accessibilityRole="button"
            accessibilityLabel={t('stageArchiveViewing')}
          >
            <Ionicons name="lock-closed" size={14} color={colors.secondaryText} />
            <ThemedText variant="caption" color="secondary">
              {t('stageArchiveViewing')}
            </ThemedText>
          </TouchableOpacity>
        ) : (
          <View style={styles.readOnlyBanner}>
            <Ionicons name="lock-closed" size={14} color={colors.secondaryText} />
            <ThemedText variant="caption" color="secondary">
              {t('stageReadOnly')}
            </ThemedText>
          </View>
        )
      )}
    </View>
  )
}

const createStyles = (colors, insets) => StyleSheet.create({
  headerWrapper: {
    backgroundColor: colors.cardBackground,
    zIndex: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 4 },
      default: { boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' },
    }),
  },
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 3,
    backgroundColor: colors.warningBannerBg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: colors.cardBackground,
    ...Platform.select({
      web: {
        height: 44,
      },
      default: {
        // Extend header background behind the status bar on native
        // Fixed height so it doesn't shift when chat request indicator appears/disappears
        marginTop: -insets.top,
        paddingTop: insets.top,
        paddingBottom: 2,
        height: insets.top + 46,
      },
    }),
  },
  desktopBackBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLeftExpanded: {
    flex: 1,
    overflow: 'hidden',
  },
  backButton: {
    padding: 4,
    marginRight: -2,
  },
  logo: {
    lineHeight: 32,
    ...Platform.select({
      web: {
        fontFamily: 'Pacifico, cursive',
      },
      default: {
        fontFamily: 'Pacifico_400Regular',
      },
    }),
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 14,
    overflow: 'hidden',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  createButtonText: {
    fontWeight: '500',
  },
  bellButton: {
    padding: 4,
    position: 'relative',
  },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.chattingListBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButtonActive: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.chattingListSelectedBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#D32F2F',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
})
