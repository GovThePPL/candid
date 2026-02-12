import { StyleSheet, View, TouchableOpacity, Platform } from 'react-native'
import { useContext, useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useRouter, usePathname } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import { UserContext } from '../contexts/UserContext'
import Sidebar from './Sidebar'
import ChatRequestIndicator from './ChatRequestIndicator'
import Avatar from './Avatar'
import ThemedText from './ThemedText'
import BugReportModal from './BugReportModal'
import api from '../lib/api'

export default function Header({ onBack, showCreateButton }) {
  const { t } = useTranslation()
  const router = useRouter()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets])
  const { user, logout, pendingChatRequest, clearPendingChatRequest } = useContext(UserContext)
  const pathname = usePathname()
  const [sidebarVisible, setSidebarVisible] = useState(false)
  const [bugReportVisible, setBugReportVisible] = useState(false)
  const [headerWidth, setHeaderWidth] = useState(0)

  // Close sidebar and modals when navigating away
  useEffect(() => {
    setSidebarVisible(false)
    setBugReportVisible(false)
  }, [pathname])
  const [rightWidth, setRightWidth] = useState(0)
  const logoWidthRef = useRef(0)

  // Dynamically show logo if there's room for both logo + full indicator
  // Full indicator: avatar(40) + name(~60) + bubble(40) + gaps(16) + border+padding(12) ≈ 170px
  // Add generous spacing so elements don't feel cramped
  const COMFORTABLE_INDICATOR_WIDTH = 210
  const HEADER_PADDING = 24 // paddingHorizontal(12) * 2
  const SECTION_GAPS = 40 // minimum breathing room between logo, indicator, and right section
  const availableWidth = headerWidth - rightWidth - HEADER_PADDING
  // On sub-pages (onBack), always hide logo when indicator is active — back arrow is enough context
  const showLogo = !pendingChatRequest ||
    (!onBack && availableWidth >= logoWidthRef.current + SECTION_GAPS + COMFORTABLE_INDICATOR_WIDTH)

  const handleLogout = async () => {
    await logout()
    router.replace('/login')
  }

  // Handle chat request timeout - rescind the request
  const handleChatRequestTimeout = useCallback(async () => {
    if (pendingChatRequest?.id) {
      try {
        await api.chat.rescindChatRequest(pendingChatRequest.id)
      } catch (err) {
        console.error('Failed to rescind chat request:', err)
      }
    }
    clearPendingChatRequest()
  }, [pendingChatRequest, clearPendingChatRequest])

  // Handle chat request cancellation by user
  const handleChatRequestCancel = useCallback(async () => {
    if (pendingChatRequest?.id) {
      try {
        await api.chat.rescindChatRequest(pendingChatRequest.id)
      } catch (err) {
        console.error('Failed to rescind chat request:', err)
      }
    }
    clearPendingChatRequest()
  }, [pendingChatRequest, clearPendingChatRequest])

  return (
    <>
      <View style={styles.header} onLayout={e => setHeaderWidth(e.nativeEvent.layout.width)}>
        {/* Left section */}
        <View style={[styles.headerLeft, pendingChatRequest && !showLogo && styles.headerLeftExpanded]}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityLabel={t('goBack')} accessibilityRole="button">
              <Ionicons name="arrow-back" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
          {showLogo && (
            <ThemedText
              variant="brandCompact"
              style={[styles.logo, { color: colors.logoText }]}
              onLayout={e => { logoWidthRef.current = e.nativeEvent.layout.width }}
            >
              Candid{Platform.OS !== 'web' ? ' ' : ''}
            </ThemedText>
          )}
          {/* Narrow: indicator replaces logo, left-aligned */}
          {pendingChatRequest && !showLogo && (
            <ChatRequestIndicator
              pendingRequest={pendingChatRequest}
              onTimeout={handleChatRequestTimeout}
              onCancel={handleChatRequestCancel}
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

        {/* Right section */}
        <View style={styles.headerRight} onLayout={e => setRightWidth(e.nativeEvent.layout.width)}>
          {showCreateButton && (
            <TouchableOpacity onPress={() => router.push('/create')} style={styles.createButton} accessibilityLabel={t('createPositionA11y')} accessibilityRole="button">
              <ThemedText variant="bodySmall" color="secondary" style={styles.createButtonText}>{t('tabAdd')}</ThemedText>
              <Ionicons name="add" size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setSidebarVisible(true)} accessibilityLabel={t('openMenu')} accessibilityRole="button">
            <Avatar user={user} size={36} showKudosBadge showKudosCount />
          </TouchableOpacity>
        </View>
      </View>
      <Sidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        user={user}
        onLogout={handleLogout}
        onBugReport={() => setBugReportVisible(true)}
      />
      <BugReportModal
        visible={bugReportVisible}
        onClose={() => setBugReportVisible(false)}
      />
    </>
  )
}

const createStyles = (colors, insets) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: colors.cardBackground,
    zIndex: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 4 },
      default: { boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' },
    }),
    ...Platform.select({
      web: {
        height: 54,
      },
      default: {
        // Extend header background behind the status bar on native
        // Fixed height so it doesn't shift when chat request indicator appears/disappears
        marginTop: -insets.top,
        paddingTop: insets.top,
        paddingBottom: 4,
        height: insets.top + 58,
      },
    }),
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
})
