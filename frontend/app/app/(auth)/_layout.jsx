import { Stack } from "expo-router"
import { StatusBar } from "react-native"

import GuestOnly from "../../components/auth/GuestOnly"
import { useThemeColors } from "../../hooks/useThemeColors"

export default function AuthLayout() {
  const colors = useThemeColors()

  return (
    <GuestOnly>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </GuestOnly>
  )
}