import { Stack, useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { CommonActions, useNavigation } from '@react-navigation/native'
import { useThemeColors } from '../../../../hooks/useThemeColors'

export default function WikiLayout() {
  const colors = useThemeColors()
  const navigation = useNavigation()

  // Reset wiki stack to index when leaving the tab
  // so returning to wiki always shows the main page
  useFocusEffect(
    useCallback(() => {
      return () => {
        const state = navigation.getState()
        const wikiRoute = state?.routes?.find(r => r.name === 'wiki')
        if (wikiRoute?.state?.key && wikiRoute?.state?.routes?.length > 1) {
          navigation.dispatch({
            ...CommonActions.reset({
              index: 0,
              routes: [{ name: 'index' }],
            }),
            target: wikiRoute.state.key,
          })
        }
      }
    }, [navigation])
  )

  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.background },
    }} />
  )
}
