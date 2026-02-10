import { StyleSheet, View, TouchableOpacity, Platform } from 'react-native'
import { useContext, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import { BadgeColors } from '../constants/Colors'
import { UserContext } from '../contexts/UserContext'
import Sidebar from './Sidebar'
import ChatRequestIndicator from './ChatRequestIndicator'
import Avatar from './Avatar'
import ThemedText from './ThemedText'
import BugReportModal from './BugReportModal'
import api from '../lib/api'
import { getTrustBadgeColor } from '../lib/avatarUtils'

export default function Header({ onBack }) {
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { user, logout, pendingChatRequest, clearPendingChatRequest } = useContext(UserContext)
  const [sidebarVisible, setSidebarVisible] = useState(false)
  const [bugReportVisible, setBugReportVisible] = useState(false)
  const [headerWidth, setHeaderWidth] = useState(0)
  const [rightWidth, setRightWidth] = useState(0)
  const logoWidthRef = useRef(0)

  // Dynamically show logo if there's room for both logo + full indicator
  // Full indicator: avatar(40) + name(~60) + bubble(40) + gaps(16) + border+padding(12) ≈ 170px
  const COMFORTABLE_INDICATOR_WIDTH = 180
  const HEADER_PADDING = 24 // paddingHorizontal(12) * 2
  const SECTION_GAPS = 26 // headerLeft gap(10) + headerCenter marginHorizontal(8*2)
  const availableWidth = headerWidth - rightWidth - HEADER_PADDING
  const showLogo = !pendingChatRequest ||
    availableWidth >= logoWidthRef.current + SECTION_GAPS + COMFORTABLE_INDICATOR_WIDTH

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
            <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityLabel="Go back" accessibilityRole="button">
              <Ionicons name="arrow-back" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
          {showLogo && (
            <ThemedText
              variant="brandCompact"
              color="primary"
              style={styles.logo}
              onLayout={e => { logoWidthRef.current = e.nativeEvent.layout.width }}
            >
              Candid
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
          <View style={[styles.kudosBadge, { backgroundColor: getTrustBadgeColor(user?.trustScore) }]}>
            <Ionicons name="star" size={16} color={colors.primary} />
            <ThemedText variant="label" color="primary">{user?.kudosCount || 0}</ThemedText>
          </View>
          <TouchableOpacity onPress={() => setSidebarVisible(true)} accessibilityLabel="Open menu" accessibilityRole="button">
            <Avatar user={user} size={32} showKudosBadge={false} />
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

const createStyles = (colors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 66,
    backgroundColor: colors.cardBackground,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
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
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        fontWeight: '600',
      },
    }),
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  kudosBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BadgeColors.kudosBadge,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 3,
  },
})
