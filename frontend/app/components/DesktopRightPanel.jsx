import { StyleSheet, View, TouchableOpacity, Platform, useWindowDimensions } from 'react-native'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useThemeColors } from '../hooks/useThemeColors'
import { useUser } from '../hooks/useUser'
import { canModerate } from '../lib/roles'
import ThemedText from './ThemedText'

const PANEL_COLLAPSED_KEY = '@desktop_panel_collapsed'
const PANEL_ACTIVE_TAB_KEY = '@desktop_panel_active_tab'
const MAX_PANEL_WIDTH = 380
const MIN_PANEL_WIDTH = 280
const PANEL_WIDTH_RATIO = 0.3

export default function DesktopRightPanel({ renderCards, renderModeration }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const { user } = useUser()
  const isModerator = canModerate(user)
  const { width: screenWidth } = useWindowDimensions()
  const panelWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, Math.round(screenWidth * PANEL_WIDTH_RATIO)))
  const [activeTab, setActiveTabState] = useState('cards')
  const setActiveTab = useCallback((tab) => {
    setActiveTabState(tab)
    AsyncStorage.setItem(PANEL_ACTIVE_TAB_KEY, tab).catch(() => {})
  }, [])
  const [collapsed, setCollapsed] = useState(false)
  const styles = useMemo(() => createStyles(colors, collapsed), [colors, collapsed])

  // Load persisted state on mount
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(PANEL_COLLAPSED_KEY),
      AsyncStorage.getItem(PANEL_ACTIVE_TAB_KEY),
    ]).then(([collapsedVal, tabVal]) => {
      if (collapsedVal !== null) setCollapsed(JSON.parse(collapsedVal))
      if (tabVal === 'cards' || tabVal === 'moderation') setActiveTab(tabVal)
    }).catch(() => {})
  }, [])

  const toggleCollapsed = useCallback(async () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      await AsyncStorage.setItem(PANEL_COLLAPSED_KEY, JSON.stringify(next))
    } catch {}
  }, [collapsed])

  if (collapsed) {
    return (
      <View style={styles.collapsedContainer}>
        <TouchableOpacity
          onPress={toggleCollapsed}
          style={styles.expandButton}
          accessibilityRole="button"
          accessibilityLabel={t('desktopExpandPanel')}
        >
          <Ionicons name="chevron-back" size={18} color={colors.secondaryText} />
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={[styles.container, { width: panelWidth }]}>
      {/* Header with tabs and collapse */}
      <View style={styles.header}>
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'cards' && styles.tabActive]}
            onPress={() => setActiveTab('cards')}
            accessibilityRole="tab"
            accessibilityLabel={t('tabCards')}
            accessibilityState={{ selected: activeTab === 'cards' }}
          >
            <ThemedText
              variant="bodySmall"
              style={[styles.tabText, activeTab === 'cards' && styles.tabTextActive]}
            >
              {t('tabCards')}
            </ThemedText>
          </TouchableOpacity>
          {isModerator && (
            <TouchableOpacity
              style={[styles.tab, activeTab === 'moderation' && styles.tabActive]}
              onPress={() => setActiveTab('moderation')}
              accessibilityRole="tab"
              accessibilityLabel={t('tabMod')}
              accessibilityState={{ selected: activeTab === 'moderation' }}
            >
              <ThemedText
                variant="bodySmall"
                style={[styles.tabText, activeTab === 'moderation' && styles.tabTextActive]}
              >
                {t('tabMod')}
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          onPress={toggleCollapsed}
          style={styles.collapseButton}
          accessibilityRole="button"
          accessibilityLabel={t('desktopCollapsePanel')}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'cards' && renderCards
          ? renderCards()
          : activeTab === 'moderation' && renderModeration
            ? renderModeration()
            : (
              <View style={styles.placeholder}>
                <Ionicons
                  name={activeTab === 'cards' ? 'cards-outline' : 'shield-outline'}
                  size={40}
                  color={colors.placeholderText}
                />
                <ThemedText variant="body" color="secondary" style={styles.placeholderText}>
                  {activeTab === 'cards' ? t('tabCards') : t('tabMod')}
                </ThemedText>
              </View>
            )}
      </View>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    backgroundColor: colors.navBackground,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  collapsedContainer: {
    width: 36,
    alignSelf: 'stretch',
    backgroundColor: colors.navBackground,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    alignItems: 'center',
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabs: {
    flexDirection: 'row',
    gap: 4,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  tabActive: {
    backgroundColor: colors.chattingListBg,
  },
  tabText: {
    color: colors.secondaryText,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  collapseButton: {
    padding: 4,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  expandButton: {
    padding: 6,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  placeholderText: {
    textAlign: 'center',
  },
})
