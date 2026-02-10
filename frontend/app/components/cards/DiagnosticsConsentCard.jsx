import { StyleSheet, View } from 'react-native'
import { useRef, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../hooks/useThemeColors'
import { BrandColor, OnBrandColors } from '../../constants/Colors'
import ThemedText from '../ThemedText'
import SwipeableCard from './SwipeableCard'
import CardShell from '../CardShell'

const DiagnosticsConsentCard = forwardRef(function DiagnosticsConsentCard({
  onAccept,
  onDecline,
  isBackCard = false,
  backCardAnimatedValue,
}, ref) {
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const swipeableRef = useRef(null)

  const handleSwipeRight = useCallback(() => {
    onAccept?.()
  }, [onAccept])

  const handleSwipeLeft = useCallback(() => {
    onDecline?.()
  }, [onDecline])

  useImperativeHandle(ref, () => ({
    swipeRight: () => swipeableRef.current?.swipeRight?.(),
    swipeLeft: () => swipeableRef.current?.swipeLeft?.(),
    swipeDown: () => swipeableRef.current?.swipeDown?.(),
    swipeUp: () => {},
  }), [])

  const headerContent = (
    <View style={styles.headerRow}>
      <View style={styles.iconContainer}>
        <Ionicons name="analytics" size={48} color={OnBrandColors.text} />
      </View>
      <View style={styles.titleContainer}>
        <ThemedText variant="statement" color="inverse" style={styles.headerTitle}>Diagnostics</ThemedText>
        <ThemedText variant="button" style={styles.headerSubtitle}>Help improve Candid</ThemedText>
      </View>
    </View>
  )

  return (
    <SwipeableCard
      ref={swipeableRef}
      onSwipeRight={handleSwipeRight}
      onSwipeLeft={handleSwipeLeft}
      onSwipeDown={handleSwipeLeft}
      enableVerticalSwipe={true}
      rightSwipeAsSubmit={true}
      rightSwipeLabel="Enable"
      leftSwipeAsPass={true}
      leftSwipeLabel="No Thanks"
      isBackCard={isBackCard}
      backCardAnimatedValue={backCardAnimatedValue}
      accessibilityLabel="Send anonymous error reports?"
      accessibilityHint="Swipe right to enable, left for no thanks"
    >
      <CardShell
        size="full"
        headerColor={BrandColor}
        header={headerContent}
        bodyStyle={styles.bodyContent}
      >
        <View style={styles.questionContainer}>
          <ThemedText variant="statement" color="dark" style={styles.question}>
            Send anonymous error reports to help us fix bugs?
          </ThemedText>
          <ThemedText variant="bodySmall" color="secondary" style={styles.detail}>
            No personal data included. Change anytime in Settings.
          </ThemedText>
        </View>

        <View style={styles.footer}>
          <ThemedText variant="button" color="primary">Swipe right to enable</ThemedText>
          <ThemedText variant="bodySmall" color="secondary">Swipe left for no thanks</ThemedText>
        </View>
      </CardShell>
    </SwipeableCard>
  )
})

export default DiagnosticsConsentCard

const createStyles = (colors) => StyleSheet.create({
  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 4,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flexDirection: 'column',
  },
  headerTitle: {
    fontStyle: 'italic',
  },
  headerSubtitle: {
    color: OnBrandColors.textSecondary,
  },
  // Body
  bodyContent: {
    padding: 20,
  },
  questionContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  question: {
    textAlign: 'center',
  },
  detail: {
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 24,
    gap: 4,
  },
})
