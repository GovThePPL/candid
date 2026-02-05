import { StyleSheet, View, Text, TouchableOpacity, Image, Animated, Dimensions, Pressable } from 'react-native'
import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/Colors'
import { getInitials, getInitialsColor, getAvatarImageUrl } from '../lib/avatarUtils'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.65

export default function Sidebar({ visible, onClose, user, onLogout }) {
  const router = useRouter()
  const pathname = usePathname()
  const slideAnim = useRef(new Animated.Value(SIDEBAR_WIDTH)).current
  const overlayOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SIDEBAR_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [visible, slideAnim, overlayOpacity])

  const handleMenuPress = (route) => {
    onClose()
    router.push({ pathname: route, params: { returnTo: pathname } })
  }

  const handleLogout = () => {
    onClose()
    onLogout()
  }

  if (!visible) return null

  return (
    <View style={styles.container}>
      {/* Overlay */}
      <Pressable style={styles.overlayPressable} onPress={onClose}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
      </Pressable>

      {/* Sidebar */}
      <Animated.View style={[styles.sidebar, { transform: [{ translateX: slideAnim }] }]}>
        {/* User Info */}
        <View style={styles.userSection}>
          <View style={styles.avatarContainer}>
            {user?.avatarUrl ? (
              <Image source={{ uri: getAvatarImageUrl(user.avatarUrl) }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: getInitialsColor(user?.displayName) }]}>
                <Text style={styles.avatarInitial}>
                  {getInitials(user?.displayName)}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.kudosBadge}>
            <Ionicons name="star" size={14} color={Colors.primary} />
            <Text style={styles.kudosCount}>{user?.kudosCount || 0}</Text>
          </View>
          <Text style={styles.displayName}>{user?.displayName || 'Guest'}</Text>
          <Text style={styles.username}>@{user?.username || 'guest'}</Text>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem} onPress={() => handleMenuPress('/profile')}>
            <Text style={styles.menuText}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => handleMenuPress('/settings')}>
            <Text style={styles.menuText}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => handleMenuPress('/support')}>
            <Text style={styles.menuText}>Support Us</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => handleMenuPress('/reports')}>
            <Text style={styles.menuText}>Community Reports</Text>
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <View style={styles.logoutSection}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={Colors.warning} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  overlayPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: '#fff',
    paddingTop: 60,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  userSection: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  avatarContainer: {
    marginBottom: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '600',
  },
  kudosBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.kudosBadge,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginBottom: 8,
  },
  kudosCount: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  displayName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  username: {
    fontSize: 14,
    color: Colors.pass,
  },
  menuSection: {
    paddingTop: 8,
  },
  menuItem: {
    backgroundColor: Colors.primary,
    marginHorizontal: 16,
    marginVertical: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  menuText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  logoutSection: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: 8,
  },
  logoutText: {
    color: Colors.warning,
    fontSize: 16,
    fontWeight: '500',
  },
})
