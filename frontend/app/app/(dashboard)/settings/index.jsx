import { StyleSheet, View, Text, TouchableOpacity } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../../constants/Colors'
import { useUser } from '../../../hooks/useUser'

import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import Avatar from '../../../components/Avatar'

const MENU_ITEMS = [
  { label: 'Demographics', icon: 'stats-chart-outline', route: '/settings/demographics' },
  { label: 'Preferences', icon: 'options-outline', route: '/settings/preferences' },
  { label: 'Notifications', icon: 'notifications-outline', route: '/settings/notifications' },
  { label: 'Account', icon: 'shield-outline', route: '/settings/account' },
]

export default function SettingsHub() {
  const { user } = useUser()
  const router = useRouter()
  const { returnTo } = useLocalSearchParams()

  const handleBack = () => {
    if (returnTo) {
      router.navigate(returnTo)
    } else {
      router.back()
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={handleBack} />
      <View style={styles.content}>
        <View style={styles.pageHeader}>
          <ThemedText title={true} style={styles.pageTitle}>
            Settings
          </ThemedText>
        </View>

        {/* User avatar + name */}
        <TouchableOpacity
          style={styles.userSection}
          onPress={() => router.push('/settings/profile')}
          activeOpacity={0.7}
        >
          <Avatar user={user} size={64} showKudosBadge={false} />
          <View style={styles.userInfo}>
            <Text style={styles.displayName}>{user?.displayName || 'Guest'}</Text>
            <Text style={styles.username}>@{user?.username || 'guest'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.pass} />
        </TouchableOpacity>

        {/* Menu items */}
        <View style={styles.menuSection}>
          {MENU_ITEMS.map((item, index) => (
            <TouchableOpacity
              key={item.route}
              style={[
                styles.menuItem,
                index === MENU_ITEMS.length - 1 && styles.menuItemLast,
              ]}
              onPress={() => router.push(item.route)}
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon} size={22} color={Colors.primary} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.pass} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  pageHeader: {
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  userInfo: {
    flex: 1,
    marginLeft: 14,
  },
  displayName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.darkText,
  },
  username: {
    fontSize: 14,
    color: Colors.pass,
    marginTop: 2,
  },
  menuSection: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    gap: 14,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: Colors.darkText,
    fontWeight: '500',
  },
})
