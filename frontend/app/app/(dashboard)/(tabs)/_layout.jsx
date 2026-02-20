import { useMemo, useState, useCallback, useEffect } from "react"
import { Tabs } from "expo-router"
import { Platform, View, StyleSheet } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons"
import { getFocusedRouteNameFromRoute } from "@react-navigation/core"
import { useTranslation } from "react-i18next"
import { useThemeColors } from "../../../hooks/useThemeColors"
import { canModerate } from "../../../lib/roles"
import { useUser } from "../../../hooks/useUser"
import useIsDesktop from "../../../hooks/useIsDesktop"
import api from "../../../lib/api"

export default function TabsLayout() {
  const { user } = useUser()
  const isModerator = canModerate(user)
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const isDesktop = useIsDesktop()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [modQueueCount, setModQueueCount] = useState(0)

  // Fetch mod queue count for badge
  const fetchModQueueCount = useCallback(() => {
    if (!isModerator) return
    api.moderation.getQueue()
      .then(data => setModQueueCount(Array.isArray(data) ? data.length : 0))
      .catch(() => {})
  }, [isModerator])

  useEffect(() => {
    fetchModQueueCount()
  }, [fetchModQueueCount])

  const renderTabIcon = (IconComponent, iconName, focusedIconName) => {
    return ({ focused, color }) => (
      <View style={styles.tabItem}>
        <IconComponent
          size={26}
          name={focused ? focusedIconName : iconName}
          color={color}
        />
      </View>
    )
  }

  return (
    <Tabs
      screenListeners={{
        focus: () => {
          // On web, blur the previously focused element so React Navigation can
          // set aria-hidden on the inactive tab without the browser blocking it
          if (Platform.OS === 'web' && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur()
          }
        },
      }}
      sceneStyle={{ backgroundColor: colors.background }}
      screenOptions={{
        headerShown: false,
        tabBarStyle: isDesktop
          ? { display: 'none' }
          : {
              backgroundColor: colors.navBackground,
              paddingBottom: Platform.OS === 'web' ? 0 : insets.bottom,
              borderTopWidth: 0,
              ...Platform.select({
                ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 4 },
                android: { elevation: 8 },
                default: { boxShadow: '0 -2px 4px rgba(0, 0, 0, 0.1)' },
              }),
            },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="cards"
        options={isDesktop ? { href: null } : {
          title: t('tabCards'),
          tabBarIcon: renderTabIcon(MaterialCommunityIcons, 'cards-outline', 'cards'),
        }}
      />
      <Tabs.Screen
        name="discuss"
        options={({ route }) => {
          const focusedRoute = getFocusedRouteNameFromRoute(route) ?? 'index'
          return {
            title: t('discuss:tabDiscuss'),
            tabBarIcon: renderTabIcon(Ionicons, 'chatbubbles-outline', 'chatbubbles'),
            ...(!isDesktop && focusedRoute !== 'index' ? { tabBarStyle: { display: 'none' } } : {}),
          }
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: t('tabStats'),
          tabBarIcon: renderTabIcon(Ionicons, 'stats-chart-outline', 'stats-chart'),
        }}
      />
      {/* Moderation queue - only visible to moderators, facilitators, and admins */}
      <Tabs.Screen
        name="moderation"
        options={isDesktop ? { href: null } : (isModerator ? {
          title: t('tabMod'),
          tabBarIcon: renderTabIcon(Ionicons, 'shield-outline', 'shield'),
          tabBarBadge: modQueueCount > 0 ? modQueueCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary, fontSize: 11 },
        } : { href: null })}
      />
    </Tabs>
  )
}

const createStyles = (colors) => StyleSheet.create({
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
