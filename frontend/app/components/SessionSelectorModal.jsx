import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, StyleSheet, TouchableOpacity, Modal, SectionList, Platform } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useThemeColors } from '../hooks/useThemeColors'
import useIsDesktop from '../hooks/useIsDesktop'
import { useLocationSession } from '../contexts/LocationSessionContext'
import { Spacing, BorderRadius } from '../constants/Theme'
import { usersApiWrapper, sessionsApiWrapper } from '../lib/api'
import { CacheManager, CacheKeys, CacheDurations } from '../lib/cache'
import ThemedText from './ThemedText'
import LocationSessionBadge from './LocationSessionBadge'
import SessionProgressBar from './SessionProgressBar'
import { SkeletonPulse, SkeletonBox, SkeletonLine } from './Skeleton'

export default function SessionSelectorModal({ visible, onClose }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const isDesktop = useIsDesktop()
  const styles = useMemo(() => createStyles(colors), [colors])
  const {
    selectedLocation,
    selectedSession,
    setSelectedLocation,
    setSelectedSession,
    closeSessionSelector,
  } = useLocationSession()

  const [locations, setLocations] = useState([])
  const [sessionsByLocation, setSessionsByLocation] = useState({})
  const [expandedPast, setExpandedPast] = useState({})
  const [loading, setLoading] = useState(false)

  // Show cached data instantly on open, then background-revalidate
  useEffect(() => {
    if (!visible) return
    let cancelled = false

    ;(async () => {
      const cacheKey = CacheKeys.sessionSelector()
      const cached = await CacheManager.get(cacheKey)

      // Show cached data instantly (skip loading skeleton)
      if (cached?.data) {
        setLocations(cached.data.locations)
        setSessionsByLocation(cached.data.sessionsByLocation)
      } else {
        setLoading(true) // only show skeleton on cold start
      }

      // Background revalidate
      try {
        const locData = await usersApiWrapper.getLocations()
        if (cancelled) return
        const locs = locData || []
        const sessResults = await Promise.all(
          locs.map(loc => sessionsApiWrapper.getAll(loc.id).catch(() => []))
        )
        if (cancelled) return
        const sessMap = {}
        locs.forEach((loc, i) => { sessMap[loc.id] = sessResults[i] || [] })

        setLocations(locs)
        setSessionsByLocation(sessMap)
        await CacheManager.set(cacheKey, { locations: locs, sessionsByLocation: sessMap })
      } catch (err) {
        // On error, cached data is already displayed — just log
        if (!cached?.data) console.error('SessionSelectorModal: failed to load', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [visible])

  // Reset expanded state when modal closes
  useEffect(() => {
    if (!visible) setExpandedPast({})
  }, [visible])

  const togglePast = useCallback((locationId) => {
    setExpandedPast(prev => ({ ...prev, [locationId]: !prev[locationId] }))
  }, [])

  const handleSelectSession = useCallback((locationId, sessionId) => {
    setSelectedLocation(locationId)
    setSelectedSession(sessionId)
    closeSessionSelector()
  }, [setSelectedLocation, setSelectedSession, closeSessionSelector])

  // Build sections for SectionList
  const sections = useMemo(() => {
    return locations.map(loc => {
      const allSessions = sessionsByLocation[loc.id] || []
      const sortNewestFirst = (a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0)
      const active = allSessions.filter(s => s.status === 'active').sort(sortNewestFirst)
      const past = allSessions.filter(s => s.status === 'archived' || s.status === 'cancelled').sort(sortNewestFirst)
      const showPast = expandedPast[loc.id] && past.length > 0

      const data = [
        ...active.map(s => ({ ...s, _type: 'active', _locationId: loc.id, _locationCode: loc.code })),
        ...(past.length > 0 ? [{ _type: 'toggle', _locationId: loc.id, _pastCount: past.length, id: `toggle-${loc.id}` }] : []),
        ...(showPast ? past.map(s => ({ ...s, _type: 'past', _locationId: loc.id, _locationCode: loc.code })) : []),
      ]

      return {
        location: loc,
        activeCount: active.length,
        data,
      }
    })
  }, [locations, sessionsByLocation, expandedPast])

  const hasAnySessions = sections.some(s => s.data.length > 0)

  const renderSectionHeader = ({ section }) => {
    const { location, activeCount } = section
    const displayName = location.name

    return (
      <View style={styles.sectionHeader}>
        <Ionicons name="location" size={16} color={colors.primary} />
        <ThemedText variant="h1" style={styles.sectionHeaderText}>{displayName}</ThemedText>
        <ThemedText variant="caption" color="secondary">
          {activeCount}
        </ThemedText>
      </View>
    )
  }

  const renderItem = ({ item }) => {
    if (item._type === 'toggle') {
      const isExpanded = expandedPast[item._locationId]
      return (
        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => togglePast(item._locationId)}
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? t('sessionSelectorHidePast') : t('sessionSelectorShowPast')}
        >
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.secondaryText}
          />
          <ThemedText variant="caption" color="secondary">
            {isExpanded ? t('sessionSelectorHidePast') : t('sessionSelectorShowPast')} ({item._pastCount})
          </ThemedText>
        </TouchableOpacity>
      )
    }

    const isSelected = item.id === selectedSession
    const isPast = item._type === 'past'

    const statusLabel = item.status === 'archived'
      ? t('sessionSelectorArchivedStatus')
      : item.status === 'cancelled'
        ? t('sessionSelectorCancelledStatus')
        : null

    const location = item._locationCode ? { code: item._locationCode } : null
    const session = { label: item.label || item.name }

    return (
      <TouchableOpacity
        style={[
          styles.sessionItem,
          isSelected && styles.sessionItemSelected,
          isPast && styles.sessionItemPast,
        ]}
        onPress={() => handleSelectSession(item._locationId, item.id)}
        accessibilityRole="button"
        accessibilityLabel={item.label || item.name}
        accessibilityState={{ selected: isSelected }}
      >
        <View style={styles.sessionContent}>
          <View style={styles.sessionHeader}>
            <LocationSessionBadge location={location} session={session} size="md" />
            {isSelected && (
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            )}
            {statusLabel && isPast && (
              <ThemedText variant="caption" color="secondary" style={styles.statusText}>
                {statusLabel}
              </ThemedText>
            )}
          </View>
          {item.acceptedProposalTitle && (
            <View
              style={styles.proposalIndicator}
              accessibilityLabel={t('sessionSelectorProposalA11y', { title: item.acceptedProposalTitle })}
            >
              <MaterialCommunityIcons name="script-text-outline" size={16} color={colors.primary} />
              <ThemedText variant="caption" color="primary" numberOfLines={1} style={styles.proposalTitle}>
                {item.acceptedProposalTitle}
              </ThemedText>
            </View>
          )}
          {item.stage && (
            <SessionProgressBar stage={item.stage} showStageLabel proposalMethod={item.proposalMethod} />
          )}
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isDesktop ? 'fade' : 'slide'}
      onRequestClose={selectedSession ? onClose : undefined}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <ThemedText
              variant="brandCompact"
              style={[styles.logo, { color: colors.logoText }]}
            >
              Candid{Platform.OS !== 'web' ? ' ' : ''}
            </ThemedText>
            {selectedSession && (
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel={t('close')}
              >
                <Ionicons name="close" size={24} color={colors.secondaryText} />
              </TouchableOpacity>
            )}
          </View>

          <ThemedText variant="h2" color="primary" style={styles.title}>
            {t('sessionSelectorTitle')}
          </ThemedText>

          {/* Content */}
          {loading ? (
            <SkeletonPulse style={styles.skeletonContainer}>
              {[0, 1].map(i => (
                <View key={i}>
                  <View style={styles.skeletonSectionHeader}>
                    <SkeletonBox width={16} height={16} borderRadius={8} />
                    <SkeletonLine width={120} height={16} />
                  </View>
                  {[0, 1].map(j => (
                    <View key={j} style={styles.skeletonSessionItem}>
                      <SkeletonBox width={100} height={22} borderRadius={10} />
                      <SkeletonLine width="80%" height={8} style={{ marginTop: Spacing.sm }} />
                    </View>
                  ))}
                </View>
              ))}
            </SkeletonPulse>
          ) : !hasAnySessions && locations.length > 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={48} color={colors.placeholderText} />
              <ThemedText variant="body" color="secondary" style={styles.emptyTitle}>
                {t('sessionSelectorNoSessions')}
              </ThemedText>
              <ThemedText variant="caption" color="secondary" style={styles.emptySubtitle}>
                {t('sessionSelectorNoSessionsSubtitle')}
              </ThemedText>
            </View>
          ) : locations.length === 0 && !loading ? (
            <View style={styles.emptyContainer}>
              <ThemedText variant="body" color="secondary">
                {t('noLocationsAvailable')}
              </ThemedText>
            </View>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id}
              renderSectionHeader={renderSectionHeader}
              renderItem={renderItem}
              stickySectionHeadersEnabled={false}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </View>
    </Modal>
  )
}

const createStyles = (colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    ...Platform.select({
      web: {
        maxWidth: 500,
        alignSelf: 'center',
        width: '100%',
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === 'web' ? Spacing.lg : Spacing.xxl + Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  logo: {
    ...Platform.select({
      web: { fontFamily: 'Pacifico, cursive' },
      default: { fontFamily: 'Pacifico_400Regular' },
    }),
  },
  closeButton: {
    padding: Spacing.sm,
  },
  title: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  listContent: {
    paddingBottom: Spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
  sectionHeaderText: {
    flex: 1,
    color: colors.text,
  },
  sessionItem: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginHorizontal: Spacing.sm,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBackground,
  },
  sessionItemSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  sessionItemPast: {
    opacity: 0.6,
  },
  sessionContent: {
    gap: Spacing.sm,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusText: {
    fontStyle: 'italic',
  },
  proposalIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  proposalTitle: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  skeletonContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  skeletonSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  skeletonSessionItem: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBackground,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
  },
})
