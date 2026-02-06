import { useEffect, useContext } from "react"
import { Tabs, useRouter } from "expo-router"
import { Platform, useWindowDimensions, View, Text, StyleSheet } from "react-native"
import { Colors } from "../../constants/Colors"
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons"

import UserOnly from "../../components/auth/UserOnly"
import { UserContext } from "../../contexts/UserContext"

// Screen width threshold for showing labels beside icons
const WIDE_SCREEN_THRESHOLD = 768

export default function DashboardLayout() {
  const { width } = useWindowDimensions()
  const isWideScreen = width >= WIDE_SCREEN_THRESHOLD
  const router = useRouter()
  const { user, activeChatNavigation, clearActiveChatNavigation, activeChat, clearActiveChat } = useContext(UserContext)
  const isModerator = user?.userType === 'moderator' || user?.userType === 'admin'

  // Handle navigation when a chat starts (via socket event) - works from any tab
  useEffect(() => {
    if (activeChatNavigation?.chatId) {
      console.log('[DashboardLayout] Navigating to chat:', activeChatNavigation.chatId)
      router.push(`/chat/${activeChatNavigation.chatId}`)
      clearActiveChatNavigation()
    }
  }, [activeChatNavigation, router, clearActiveChatNavigation])

  // Handle navigation to existing active chat on app load
  useEffect(() => {
    if (activeChat?.id) {
      console.log('[DashboardLayout] Navigating to active chat:', activeChat.id)
      router.push(`/chat/${activeChat.id}`)
      clearActiveChat()
    }
  }, [activeChat, router, clearActiveChat])

  const renderTabIcon = (IconComponent, iconName, focusedIconName, label) => {
    return ({ focused, color }) => (
      <View style={[styles.tabItem, isWideScreen && styles.tabItemWide]}>
        <IconComponent
          size={32}
          name={focused ? focusedIconName : iconName}
          color={color}
        />
        {isWideScreen && (
          <Text style={[styles.tabLabel, { color }]}>{label}</Text>
        )}
      </View>
    )
  }

  return (
    <UserOnly>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: Colors.white,
            paddingTop: 8,
            paddingBottom: 8,
            height: isWideScreen ? 70 : 60,
            borderTopWidth: 0,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 8,
            ...Platform.select({
              web: {
                boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)',
              },
            }),
          },
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.pass,
          tabBarShowLabel: false,
        }}
      >
        <Tabs.Screen
          name="cards"
          options={{
            title: "Cards",
            tabBarIcon: renderTabIcon(MaterialCommunityIcons, 'cards-outline', 'cards', 'Cards'),
          }}
        />
        <Tabs.Screen
          name="create"
          options={{
            title: "Add",
            tabBarIcon: renderTabIcon(Ionicons, 'add-circle-outline', 'add-circle', 'Add'),
          }}
        />
        <Tabs.Screen
          name="chats"
          options={{
            title: "Chats",
            tabBarIcon: renderTabIcon(Ionicons, 'chatbubbles-outline', 'chatbubbles', 'Chats'),
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: "Stats",
            tabBarIcon: renderTabIcon(Ionicons, 'stats-chart-outline', 'stats-chart', 'Stats'),
          }}
        />
        {/* Moderation queue - only visible to moderators and admins */}
        <Tabs.Screen
          name="moderation"
          options={isModerator ? {
            title: "Mod",
            tabBarIcon: renderTabIcon(Ionicons, 'shield-outline', 'shield', 'Mod'),
          } : { href: null }}
        />
        {/* Hide chat folder - requires chat ID, accessed via direct navigation */}
        <Tabs.Screen
          name="chat"
          options={{ href: null }}
        />
        {/* Hidden screens - accessed via user menu */}
        <Tabs.Screen
          name="profile"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="settings"
          options={{ href: null }}
        />
        {/* Position closures - accessed from stats page */}
        <Tabs.Screen
          name="position-closures"
          options={{ href: null }}
        />
      </Tabs>
    </UserOnly>
  )
}

const styles = StyleSheet.create({
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemWide: {
    flexDirection: 'row',
    gap: 8,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
})
