import { useEffect, useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useThemeColors } from '../../../hooks/useThemeColors'
import useIsDesktop from '../../../hooks/useIsDesktop'
import Header from '../../../components/Header'
import CardQueueContent from '../../../components/CardQueueContent'

export default function CardQueue() {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const isDesktop = useIsDesktop()
  const router = useRouter()

  // On desktop, cards live beside the discuss feed — redirect there
  useEffect(() => {
    if (isDesktop) {
      router.replace('/discuss')
    }
  }, [isDesktop, router])

  if (isDesktop) return null

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header showCreateButton />
      <CardQueueContent />
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
})
