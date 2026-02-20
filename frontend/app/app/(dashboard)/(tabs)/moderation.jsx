import { useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useThemeColors } from '../../../hooks/useThemeColors'
import Header from '../../../components/Header'
import ModerationQueueContent from '../../../components/ModerationQueueContent'

export default function ModerationQueue() {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header />
      <ModerationQueueContent />
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
})
