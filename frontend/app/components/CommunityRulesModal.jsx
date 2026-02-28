import { StyleSheet, View, ScrollView, ActivityIndicator } from 'react-native'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SemanticColors } from '../constants/Colors'
import { useThemeColors } from '../hooks/useThemeColors'
import api from '../lib/api'
import ThemedText from './ThemedText'
import BottomDrawerModal from './BottomDrawerModal'

/**
 * Reusable community rules modal with severity badges.
 * Fetches rules on open, filtered by optional contentType/locationId/sessionId/postType.
 *
 * Props:
 *   visible: boolean
 *   onClose: () => void
 *   contentType?: string   — e.g. 'position'
 *   locationId?: string    — UUID
 *   sessionId?: string     — UUID
 *   postType?: string      — e.g. 'discussion', 'question', 'proposal'
 */
export default function CommunityRulesModal({ visible, onClose, contentType, locationId, sessionId, postType }) {
  const { t } = useTranslation('create')
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  // Reset cache when any filter prop changes so next open re-fetches
  useEffect(() => {
    setFetched(false)
  }, [postType, locationId, sessionId, contentType])

  const fetchRules = useCallback(async () => {
    if (fetched) return
    setLoading(true)
    try {
      const data = await api.moderation.getRules(contentType, { locationId, sessionId, postType })
      setRules(data || [])
      setFetched(true)
    } catch (err) {
      console.error('Failed to fetch rules:', err)
    } finally {
      setLoading(false)
    }
  }, [fetched, contentType, locationId, sessionId, postType])

  // Fetch on first open
  const handleOpen = useCallback(() => {
    fetchRules()
  }, [fetchRules])

  // Trigger fetch when modal becomes visible
  if (visible && !fetched && !loading) {
    handleOpen()
  }

  return (
    <BottomDrawerModal
      visible={visible}
      onClose={onClose}
      title={t('communityRules')}
    >
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ paddingVertical: 32 }} />
      ) : rules.length === 0 ? (
        <ThemedText variant="bodySmall" color="secondary" style={styles.emptyText}>
          {t('noRulesDefined')}
        </ThemedText>
      ) : (
        <ScrollView style={styles.scrollView}>
          {rules.map((rule, index) => (
            <View key={rule.id} style={[styles.ruleItem, index === rules.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.ruleHeader}>
                <ThemedText variant="body" color="dark" style={styles.ruleTitle}>{rule.title}</ThemedText>
                {rule.severity && (
                  <View style={[
                    styles.severityBadge,
                    rule.severity === 'high' && styles.severityHigh,
                    rule.severity === 'medium' && styles.severityMedium,
                  ]}>
                    <ThemedText variant="caption" style={[
                      styles.severityText,
                      rule.severity === 'high' && styles.severityTextHigh,
                      rule.severity === 'medium' && styles.severityTextMedium,
                    ]}>
                      {t('severity', { level: rule.severity })}
                    </ThemedText>
                  </View>
                )}
              </View>
              <ThemedText variant="bodySmall" color="secondary">{rule.text}</ThemedText>
            </View>
          ))}
        </ScrollView>
      )}
    </BottomDrawerModal>
  )
}

const createStyles = (colors) => StyleSheet.create({
  scrollView: {
    paddingHorizontal: 16,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 32,
  },
  ruleItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  ruleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  ruleTitle: {
    fontWeight: '600',
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.severityLowBg,
  },
  severityHigh: {
    backgroundColor: colors.severityHighBg,
  },
  severityMedium: {
    backgroundColor: colors.severityMediumBg,
  },
  severityText: {
    fontWeight: '600',
    color: colors.severityLowText,
    textTransform: 'capitalize',
  },
  severityTextHigh: {
    color: SemanticColors.warning,
  },
  severityTextMedium: {
    color: colors.severityMediumText,
  },
})
