import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native'
import { useContext, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/Colors'
import { UserContext } from '../contexts/UserContext'
import Sidebar from './Sidebar'
import ChatRequestIndicator from './ChatRequestIndicator'
import Avatar from './Avatar'
import api from '../lib/api'
import { getTrustBadgeColor } from '../lib/avatarUtils'

export default function Header({ onBack }) {
  const router = useRouter()
  const { user, logout, pendingChatRequest, clearPendingChatRequest } = useContext(UserContext)
  const [sidebarVisible, setSidebarVisible] = useState(false)

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
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color={Colors.primary} />
            </TouchableOpacity>
          )}
          <Text style={styles.logo}>Candid</Text>
        </View>

        {/* Centered chat request indicator */}
        {pendingChatRequest && (
          <View style={styles.headerCenter}>
            <ChatRequestIndicator
              pendingRequest={pendingChatRequest}
              onTimeout={handleChatRequestTimeout}
              onCancel={handleChatRequestCancel}
            />
          </View>
        )}

        <View style={styles.headerRight}>
          <View style={[styles.kudosBadge, { backgroundColor: getTrustBadgeColor(user?.trustScore) }]}>
            <Ionicons name="star" size={16} color={Colors.primary} />
            <Text style={styles.kudosCount}>{user?.kudosCount || 0}</Text>
          </View>
          <TouchableOpacity onPress={() => setSidebarVisible(true)}>
            <Avatar user={user} size={32} showKudosBadge={false} />
          </TouchableOpacity>
        </View>
      </View>
      <Sidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        user={user}
        onLogout={handleLogout}
      />
    </>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.white,
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
  backButton: {
    padding: 4,
    marginRight: -2,
  },
  logo: {
    fontSize: 32,
    color: Colors.primary,
    ...Platform.select({
      web: {
        fontFamily: 'Pacifico, cursive',
      },
      default: {
        // Fallback for native
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
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  kudosBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.kudosBadge,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 3,
  },
  kudosCount: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
})
