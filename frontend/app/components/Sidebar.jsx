import { StyleSheet, View, TouchableOpacity, Animated, Dimensions, Pressable } from 'react-native'
import { useEffect, useRef, useMemo } from 'react'
import { useRouter, usePathname } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import { SemanticColors, BadgeColors } from '../constants/Colors'
import ThemedText from './ThemedText'
import Avatar from './Avatar'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.65

export default function Sidebar({ visible, onClose, user, onLogout }) {
  const router = useRouter()
  const pathname = usePathname()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
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
      <Pressable style={styles.overlayPressable} onPress={onClose} accessibilityLabel="Close menu" accessibilityRole="button">
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
      </Pressable>

      {/* Sidebar */}
      <Animated.View style={[styles.sidebar, { transform: [{ translateX: slideAnim }] }]}>
        {/* User Info */}
        <View style={styles.userSection}>
          <Avatar user={user} size="lg" showKudosBadge={false} />
          <View style={styles.kudosBadge}>
            <Ionicons name="star" size={14} color={colors.primary} />
            <ThemedText variant="buttonSmall" color="primary">{user?.kudosCount || 0}</ThemedText>
          </View>
          <ThemedText variant="h2" color="dark">{user?.displayName || 'Guest'}</ThemedText>
          <ThemedText variant="bodySmall" color="secondary">@{user?.username || 'guest'}</ThemedText>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem} onPress={() => handleMenuPress('/settings')}>
            <ThemedText variant="button" color="inverse" style={styles.menuText}>Settings</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => handleMenuPress('/support')}>
            <ThemedText variant="button" color="inverse" style={styles.menuText}>Support Us</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => handleMenuPress('/reports')}>
            <ThemedText variant="button" color="inverse" style={styles.menuText}>Community Reports</ThemedText>

          </TouchableOpacity>
        </View>

        {/* Logout */}
        <View style={styles.logoutSection}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={SemanticColors.warning} />
            <ThemedText variant="button" color="error" style={styles.logoutText}>Log Out</ThemedText>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
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
    backgroundColor: colors.cardBackground,
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
    borderBottomColor: colors.cardBorder,
  },
  kudosBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BadgeColors.kudosBadge,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginBottom: 8,
  },
  menuSection: {
    paddingTop: 8,
  },
  menuItem: {
    backgroundColor: colors.primary,
    marginHorizontal: 16,
    marginVertical: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  menuText: {
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
    borderColor: SemanticColors.warning,
    borderRadius: 8,
  },
  logoutText: {
    fontWeight: '500',
  },
})
