import { StyleSheet, View, TouchableOpacity, ScrollView, Pressable, ActivityIndicator, TextInput, Alert, Platform, Modal } from 'react-native'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../../../hooks/useThemeColors'
import { SemanticColors } from '../../../constants/Colors'
import api, { translateError } from '../../../lib/api'
import ThemedText from '../../../components/ThemedText'
import Header from '../../../components/Header'
import EmptyState from '../../../components/EmptyState'
import BottomDrawerModal from '../../../components/BottomDrawerModal'
import LocationPicker from '../../../components/LocationPicker'
import { useToast } from '../../../components/Toast'
import { useUser } from '../../../hooks/useUser'
import { getHighestRole, canManageRuleScope, getDescendantLocationIds } from '../../../lib/roles'

// User classes that apply to each content type
const USER_CLASSES_BY_CONTENT_TYPE = {
  position: ['submitter', 'active_adopter', 'passive_adopter'],
  chat_log: ['reported', 'reporter'],
  post: ['submitter'],
  comment: ['submitter'],
}

const USER_CLASS_LABEL_KEYS = {
  submitter: 'classCreator',
  active_adopter: 'classActiveAdopters',
  passive_adopter: 'classPassiveAdopters',
  reported: 'reportedUser',
  reporter: 'reportingUser',
}

const ACTION_OPTIONS = ['none', 'removed', 'warning', 'temporary_ban', 'permanent_ban']

const ACTION_LABEL_KEYS = {
  none: 'none',
  removed: 'actionRemoveContent',
  warning: 'actionWarning',
  temporary_ban: 'actionTemporaryBan',
  permanent_ban: 'actionPermanentBan',
}


/**
 * Build an empty default actions state keyed by content type.
 * Each content type maps to an object of { userClass: { action, duration } }.
 */
function buildEmptyDefaultActions(contentTypes) {
  const result = {}
  for (const ct of contentTypes) {
    const classes = USER_CLASSES_BY_CONTENT_TYPE[ct] || []
    result[ct] = {}
    for (const uc of classes) {
      result[ct][uc] = { action: 'none', duration: '' }
    }
  }
  return result
}

/**
 * Parse stored defaultActions (either old flat array or new per-content-type object)
 * into the structured form state.
 */
function parseDefaultActions(stored, contentTypes) {
  const base = buildEmptyDefaultActions(contentTypes)
  if (!stored) return base

  if (typeof stored === 'object' && !Array.isArray(stored)) {
    // New format: { position: [...], chat_log: [...] }
    for (const ct of contentTypes) {
      if (Array.isArray(stored[ct])) {
        for (const da of stored[ct]) {
          if (da.userClass && base[ct]?.[da.userClass]) {
            base[ct][da.userClass] = {
              action: da.action || 'none',
              duration: da.duration ? String(da.duration) : '',
            }
          }
        }
      }
    }
  } else if (Array.isArray(stored)) {
    // Old format: flat array — apply to all applicable content types
    for (const da of stored) {
      for (const ct of contentTypes) {
        if (da.userClass && base[ct]?.[da.userClass]) {
          base[ct][da.userClass] = {
            action: da.action || 'none',
            duration: da.duration ? String(da.duration) : '',
          }
        }
      }
    }
  }
  return base
}

/**
 * Serialize structured default actions state to the per-content-type object format.
 * Only includes entries where action !== 'none'. Returns undefined if empty.
 */
function serializeDefaultActions(state) {
  const result = {}
  let hasAny = false
  for (const [ct, classes] of Object.entries(state)) {
    const actions = []
    for (const [uc, val] of Object.entries(classes)) {
      if (val.action && val.action !== 'none') {
        const entry = { userClass: uc, action: val.action }
        if (val.action === 'temporary_ban' && val.duration) {
          entry.duration = parseInt(val.duration, 10) || 7
        }
        actions.push(entry)
      }
    }
    if (actions.length > 0) {
      result[ct] = actions
      hasAny = true
    }
  }
  return hasAny ? result : undefined
}

const CONTENT_TYPES = ['position', 'chat_log', 'post', 'comment']
const CONTENT_TYPE_LABELS = {
  position: 'contentTypePosition',
  chat_log: 'contentTypeChatLog',
  post: 'contentTypePost',
  comment: 'contentTypeComment',
}

const SEVERITY_LEVELS = [1, 2, 3, 4, 5]
const SEVERITY_LABELS = {
  1: 'severity1',
  2: 'severity2',
  3: 'severity3',
  4: 'severity4',
  5: 'severity5',
}

function getSeverityColor(severity, colors) {
  if (severity >= 1 && severity <= 5) {
    return { bg: colors.primarySurface, text: '#FFFFFF' }
  }
  return { bg: colors.buttonDefault, text: colors.text }
}

function ActionDropdown({ userClass, value, onActionChange, duration, onDurationChange, colors, styles, t }) {
  const [open, setOpen] = useState(false)
  const hasAction = value !== 'none'
  const tMod = (key) => t(key, { ns: 'moderation' })

  return (
    <>
      <View style={styles.daRow}>
        <ThemedText variant="bodySmall" style={styles.daRowLabel}>
          {tMod(USER_CLASS_LABEL_KEYS[userClass] || userClass)}
        </ThemedText>
        <TouchableOpacity
          style={[styles.daDropdown, hasAction && styles.daDropdownActive]}
          onPress={() => setOpen(!open)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${tMod(USER_CLASS_LABEL_KEYS[userClass])}: ${tMod(ACTION_LABEL_KEYS[value] || 'none')}`}
          accessibilityState={{ expanded: open }}
        >
          <ThemedText variant="caption" style={[styles.daDropdownText, hasAction && styles.daDropdownTextActive]}>
            {tMod(ACTION_LABEL_KEYS[value] || 'none')}
          </ThemedText>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={12}
            color={hasAction ? colors.primary : colors.secondaryText}
          />
        </TouchableOpacity>
      </View>

      {open && (
        <View style={styles.daDropdownList}>
          {ACTION_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt}
              style={[styles.daDropdownItem, value === opt && styles.daDropdownItemSelected]}
              onPress={() => { onActionChange(opt); setOpen(false) }}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ checked: value === opt }}
              accessibilityLabel={tMod(ACTION_LABEL_KEYS[opt])}
            >
              <ThemedText variant="caption" style={[styles.daDropdownItemText, value === opt && styles.daDropdownItemTextActive]}>
                {tMod(ACTION_LABEL_KEYS[opt])}
              </ThemedText>
              {value === opt && <Ionicons name="checkmark" size={14} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {value === 'temporary_ban' && (
        <View style={styles.daDurationRow}>
          <ThemedText variant="caption" color="secondary">{tMod('durationDaysLabel')}</ThemedText>
          <TextInput
            style={styles.daDurationInput}
            value={duration}
            onChangeText={onDurationChange}
            keyboardType="number-pad"
            placeholder="7"
            placeholderTextColor={colors.placeholderText}
            maxFontSizeMultiplier={1.2}
            accessibilityLabel={tMod('banDurationA11y', { userClass: tMod(USER_CLASS_LABEL_KEYS[userClass]) })}
          />
        </View>
      )}
    </>
  )
}

function DefaultActionsEditor({ contentTypes, defaultActions, onChange, colors, styles, t }) {
  const activeTypes = contentTypes

  const handleActionChange = (ct, uc, action) => {
    onChange(prev => ({
      ...prev,
      [ct]: {
        ...(prev[ct] || {}),
        [uc]: { ...(prev[ct]?.[uc] || { action: 'none', duration: '' }), action },
      },
    }))
  }

  const handleDurationChange = (ct, uc, duration) => {
    onChange(prev => ({
      ...prev,
      [ct]: {
        ...(prev[ct] || {}),
        [uc]: { ...(prev[ct]?.[uc] || { action: 'temporary_ban', duration: '' }), duration },
      },
    }))
  }

  return (
    <View style={styles.daContainer}>
      {activeTypes.map(ct => {
        const userClasses = USER_CLASSES_BY_CONTENT_TYPE[ct] || []
        if (userClasses.length === 0) return null
        return (
          <View key={ct} style={styles.daSection}>
            <ThemedText variant="label" color="primary" style={styles.daSectionHeader}>
              {t(CONTENT_TYPE_LABELS[ct])}
            </ThemedText>
            {userClasses.map(uc => (
              <ActionDropdown
                key={uc}
                userClass={uc}
                value={defaultActions[ct]?.[uc]?.action || 'none'}
                onActionChange={(action) => handleActionChange(ct, uc, action)}
                duration={defaultActions[ct]?.[uc]?.duration || ''}
                onDurationChange={(dur) => handleDurationChange(ct, uc, dur)}
                colors={colors}
                styles={styles}
                t={t}
              />
            ))}
          </View>
        )
      })}
    </View>
  )
}

function RuleCard({ rule, canEdit, onView, onEdit, onDelete, deleting, colors, styles, t }) {
  const sevColor = getSeverityColor(rule.severity, colors)
  const isActive = rule.status !== 'inactive'
  const [menuVisible, setMenuVisible] = useState(false)

  return (
    <View style={styles.ruleCard}>
      <View style={styles.ruleCardHeader}>
        <View style={styles.ruleCardTitleRow}>
          <View style={[styles.severityBadge, { backgroundColor: sevColor.bg }]}>
            <ThemedText variant="badge" style={{ color: sevColor.text, fontWeight: '700', letterSpacing: 0.5 }}>
              {t(SEVERITY_LABELS[rule.severity] || 'severity3')}
            </ThemedText>
          </View>
          {!isActive && (
            <View style={[styles.statusBadge, styles.statusInactive]}>
              <ThemedText variant="badge" color="inverse" style={styles.statusBadgeText}>
                {t('ruleStatusInactive')}
              </ThemedText>
            </View>
          )}
          <ThemedText variant="label" style={{ flex: 1 }}>{rule.title}</ThemedText>
        </View>
        {rule.categoryLabel && (
          <View style={styles.categoryChip}>
            <Ionicons name="pricetag-outline" size={10} color={colors.secondaryText} />
            <ThemedText variant="micro" color="secondary">{rule.categoryLabel}</ThemedText>
          </View>
        )}
      </View>
      <ThemedText variant="bodySmall" color="secondary" numberOfLines={2}>
        {rule.text || rule.description}
      </ThemedText>
      {rule.applicableContentTypes && rule.applicableContentTypes.length > 0 && rule.applicableContentTypes.length < 4 && (
        <View style={styles.contentTypeRow}>
          {rule.applicableContentTypes.map(ct => (
            <View key={ct} style={styles.contentTypeChip}>
              <ThemedText variant="badge" style={{ color: colors.badgeText, fontWeight: '600' }}>
                {t(CONTENT_TYPE_LABELS[ct] || ct)}
              </ThemedText>
            </View>
          ))}
        </View>
      )}
      {canEdit && (
        <>
          <TouchableOpacity
            style={styles.ruleMenuButton}
            onPress={() => setMenuVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('editRuleA11y')}
          >
            <Ionicons name="ellipsis-vertical" size={16} color={colors.secondaryText} />
          </TouchableOpacity>
          <Modal
            visible={menuVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setMenuVisible(false)}
          >
            <Pressable style={styles.actionMenuOverlay} onPress={() => setMenuVisible(false)}>
              <Pressable style={styles.actionMenuPopup} onPress={(e) => e.stopPropagation()} accessible={false} importantForAccessibility="no">
                <ThemedText variant="h4" color="primary" style={styles.actionMenuTitle}>{rule.title}</ThemedText>
                <TouchableOpacity
                  style={styles.actionMenuRow}
                  onPress={() => { setMenuVisible(false); onView(rule) }}
                  accessibilityRole="button"
                  accessibilityLabel={t('viewRuleA11y')}
                >
                  <Ionicons name="eye-outline" size={20} color={colors.primary} />
                  <ThemedText variant="bodySmall" color="dark">{t('viewRule')}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionMenuRow}
                  onPress={() => { setMenuVisible(false); onEdit(rule) }}
                  accessibilityRole="button"
                  accessibilityLabel={t('editRuleA11y')}
                >
                  <Ionicons name="create-outline" size={20} color={colors.primary} />
                  <ThemedText variant="bodySmall" color="dark">{t('editRule')}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionMenuRow, styles.actionMenuRowLast]}
                  onPress={() => { setMenuVisible(false); onDelete(rule) }}
                  disabled={deleting === rule.id}
                  accessibilityRole="button"
                  accessibilityLabel={t('deleteRuleA11y')}
                >
                  <Ionicons name="trash-outline" size={20} color={SemanticColors.warning} />
                  <ThemedText variant="bodySmall" color="error">{t('deleteRule')}</ThemedText>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
      {!canEdit && (
        <TouchableOpacity
          style={styles.ruleMenuButton}
          onPress={() => onView(rule)}
          accessibilityRole="button"
          accessibilityLabel={t('viewRuleA11y')}
        >
          <Ionicons name="eye-outline" size={16} color={colors.secondaryText} />
        </TouchableOpacity>
      )}
    </View>
  )
}

function LocationRulesSection({ location, allLocations, depth, expandedLocations, toggleLocation, rulesByLocationId, onView, onEdit, onDelete, deleting, canManageAtScope, user, colors, styles, t }) {
  const childLocations = allLocations.filter(l => l.parentLocationId === location.id)
  const hasChildren = childLocations.length > 0
  const isExpanded = expandedLocations.has(location.id)
  const locationRules = rulesByLocationId.get(location.id) || []
  const headingVariant = depth === 0 ? 'h1' : depth === 1 ? 'h2' : depth === 2 ? 'h3' : 'label'

  return (
    <View style={depth > 0 ? styles.locationSectionChild : styles.locationSectionRoot}>
      <View style={styles.locationHeaderRow}>
        <TouchableOpacity
          style={styles.locationHeaderTouch}
          onPress={() => toggleLocation(location.id)}
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? t('collapseA11y', { name: location.name }) : t('expandA11y', { name: location.name })}
        >
          <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={depth === 0 ? 20 : depth === 1 ? 18 : 16} color={colors.primary} />
          <ThemedText variant={headingVariant} color="dark" style={styles.locationTitle}>{location.name}</ThemedText>
          {location.code && (
            <ThemedText variant="caption" color="secondary"> ({location.code})</ThemedText>
          )}
          {locationRules.length > 0 && (
            <ThemedText variant="caption" color="primary" style={styles.countBadge}>
              {locationRules.length}
            </ThemedText>
          )}
        </TouchableOpacity>
      </View>

      {isExpanded && (
        <>
          {locationRules.length > 0 ? (
            <View style={styles.rulesContainer}>
              {locationRules.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  canEdit={canManageAtScope(rule)}
                  onView={onView}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  deleting={deleting}
                  colors={colors}
                  styles={styles}
                  t={t}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyRulesRow}>
              <ThemedText variant="caption" color="secondary">{t('noRulesFound')}</ThemedText>
            </View>
          )}

          {hasChildren && childLocations.map(child => (
            <LocationRulesSection
              key={child.id}
              location={child}
              allLocations={allLocations}
              depth={depth + 1}
              expandedLocations={expandedLocations}
              toggleLocation={toggleLocation}
              rulesByLocationId={rulesByLocationId}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
              deleting={deleting}
              canManageAtScope={canManageAtScope}
              user={user}
              colors={colors}
              styles={styles}
              t={t}
            />
          ))}
        </>
      )}
    </View>
  )
}

export default function RulesScreen() {
  const { t } = useTranslation('admin')
  const router = useRouter()
  const colors = useThemeColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const toast = useToast()
  const { user } = useUser()

  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)

  // Location/category data
  const [locations, setLocations] = useState([])
  const [allCategories, setAllCategories] = useState([])

  // Expand/collapse state
  const [expandedLocations, setExpandedLocations] = useState(new Set())

  // View modal state
  const [viewRule, setViewRule] = useState(null)
  const [viewVisible, setViewVisible] = useState(false)

  // Create/Edit modal state
  const [formVisible, setFormVisible] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Form fields
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formSeverity, setFormSeverity] = useState(3)
  const [formContentTypes, setFormContentTypes] = useState([])
  const [formLocationId, setFormLocationId] = useState(null)
  const [formCategoryId, setFormCategoryId] = useState(null)
  const [formSentencingGuidelines, setFormSentencingGuidelines] = useState('')
  const [formDefaultActions, setFormDefaultActions] = useState(() => buildEmptyDefaultActions(CONTENT_TYPES))
  const [formReason, setFormReason] = useState('')

  // Location picker for form
  const [locationPickerVisible, setLocationPickerVisible] = useState(false)
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [rulesData, locs, cats] = await Promise.all([
        api.admin.getAdminRules({}),
        api.users.getAllLocations(),
        api.admin.getAllCategories(),
      ])
      setRules(rulesData || [])
      setLocations(locs || [])
      setAllCategories(cats || [])
    } catch (err) {
      toast?.(translateError(err.message, t) || t('loadError'), 'error')
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  useEffect(() => { fetchData() }, [fetchData])

  // Default expand: user's highest role location + ancestors
  useEffect(() => {
    if (locations.length > 0 && user?.roles?.length > 0) {
      const highest = getHighestRole(user)
      const match = user.roles.find(r => r.role === highest)
      const locId = match?.locationId
      if (locId) {
        const expanded = new Set([locId])
        const locMap = new Map(locations.map(l => [l.id, l]))
        let current = locMap.get(locId)
        while (current?.parentLocationId) {
          expanded.add(current.parentLocationId)
          current = locMap.get(current.parentLocationId)
        }
        setExpandedLocations(expanded)
      }
    }
  }, [locations, user])

  const rootLocations = useMemo(() => locations.filter(l => !l.parentLocationId), [locations])

  // Group rules by location. null locationId → global
  const rulesByLocationId = useMemo(() => {
    const map = new Map()
    for (const rule of rules) {
      const locId = rule.locationId || null
      if (!map.has(locId)) map.set(locId, [])
      map.get(locId).push(rule)
    }
    // Sort each group by severity descending
    for (const [, list] of map) {
      list.sort((a, b) => (b.severity || 0) - (a.severity || 0))
    }
    return map
  }, [rules])

  const globalRules = useMemo(() => rulesByLocationId.get(null) || [], [rulesByLocationId])

  const canManageAtScope = useCallback((rule) => {
    return canManageRuleScope(user, rule.locationId || null, rule.positionCategoryId || null, locations)
  }, [user, locations])

  const userCanCreateRules = useMemo(() => {
    return canManageRuleScope(user, null, null, locations) ||
      (user?.roles || []).some(r => ['admin', 'moderator', 'facilitator'].includes(r.role))
  }, [user, locations])

  // Compute allowed scopes for create/edit form
  const canCreateGlobal = useMemo(() => canManageRuleScope(user, null, null, locations), [user, locations])

  const allowedLocationIds = useMemo(() => {
    if (!Array.isArray(user?.roles) || !locations.length) return new Set()
    const ids = new Set()
    for (const r of user.roles) {
      if ((r.role === 'admin' || r.role === 'moderator') && r.locationId) {
        for (const id of getDescendantLocationIds(r.locationId, locations)) {
          ids.add(id)
        }
      }
      if (r.role === 'facilitator' && r.locationId) {
        ids.add(r.locationId)
      }
    }
    return ids
  }, [user, locations])

  const allowedFormLocations = useMemo(
    () => locations.filter(l => allowedLocationIds.has(l.id)),
    [locations, allowedLocationIds]
  )

  // Categories the user can scope rules to at the selected form location
  const allowedFormCategories = useMemo(() => {
    if (!formLocationId || !Array.isArray(user?.roles)) return allCategories
    // Admin/moderator at this location → all categories
    for (const r of user.roles) {
      if ((r.role === 'admin' || r.role === 'moderator') && r.locationId) {
        if (getDescendantLocationIds(r.locationId, locations).has(formLocationId)) {
          return allCategories
        }
      }
    }
    // Facilitator → only their specific categories at this location
    const catIds = new Set()
    for (const r of user.roles) {
      if (r.role === 'facilitator' && r.locationId === formLocationId && r.positionCategoryId) {
        catIds.add(r.positionCategoryId)
      }
    }
    return allCategories.filter(c => catIds.has(c.id))
  }, [formLocationId, user, locations, allCategories])

  const toggleLocation = useCallback((locationId) => {
    setExpandedLocations(prev => {
      const next = new Set(prev)
      if (next.has(locationId)) next.delete(locationId)
      else next.add(locationId)
      return next
    })
  }, [])

  // Compute default location/category from user's highest role
  const defaultFormScope = useMemo(() => {
    if (!Array.isArray(user?.roles) || user.roles.length === 0) return { locationId: null, categoryId: null }
    const highest = getHighestRole(user)
    const match = user.roles.find(r => r.role === highest)
    return {
      locationId: match?.locationId || null,
      categoryId: match?.positionCategoryId || null,
    }
  }, [user])

  const resetForm = useCallback(() => {
    setFormTitle('')
    setFormDescription('')
    setFormSeverity(3)
    setFormContentTypes([])
    setFormLocationId(defaultFormScope.locationId)
    setFormCategoryId(defaultFormScope.categoryId)
    setFormSentencingGuidelines('')
    setFormDefaultActions(buildEmptyDefaultActions(CONTENT_TYPES))
    setFormReason('')
    setEditingRule(null)
  }, [defaultFormScope])

  const openCreateForm = useCallback(() => {
    resetForm()
    setFormVisible(true)
  }, [resetForm])

  const openEditForm = useCallback((rule) => {
    setEditingRule(rule)
    setFormTitle(rule.title || '')
    setFormDescription(rule.text || '')
    setFormSeverity(rule.severity || 3)
    const cts = rule.applicableContentTypes || []
    setFormContentTypes(cts)
    setFormLocationId(rule.locationId || null)
    setFormCategoryId(rule.positionCategoryId || null)
    setFormSentencingGuidelines(rule.sentencingGuidelines || '')
    setFormDefaultActions(parseDefaultActions(rule.defaultActions, cts.length > 0 ? cts : CONTENT_TYPES))
    setFormReason('')
    setFormVisible(true)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!formTitle.trim()) {
      toast?.(t('ruleTitleRequired'), 'error')
      return
    }
    if (!formDescription.trim()) {
      toast?.(t('ruleDescriptionRequired'), 'error')
      return
    }

    setSubmitting(true)
    try {
      const proposedRule = {
        title: formTitle.trim(),
        text: formDescription.trim(),
        severity: formSeverity,
        applicableContentTypes: formContentTypes.length > 0 ? formContentTypes : undefined,
        locationId: formLocationId || undefined,
        positionCategoryId: formCategoryId || undefined,
        sentencingGuidelines: formSentencingGuidelines.trim() || undefined,
        defaultActions: serializeDefaultActions(formDefaultActions),
      }

      const body = {
        action: editingRule ? 'update' : 'create',
        proposedRule,
        reason: formReason.trim() || undefined,
      }

      if (editingRule) {
        body.ruleId = editingRule.id
      }

      const result = await api.admin.createRuleRequest(body)

      if (result?.status === 'approved' || result?.status === 'auto_approved') {
        toast?.(t('ruleChangeApplied'), 'success')
      } else {
        toast?.(t('ruleRequestSubmitted'), 'success')
      }

      setFormVisible(false)
      resetForm()
      fetchData()
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setSubmitting(false)
    }
  }, [formTitle, formDescription, formSeverity, formContentTypes, formLocationId, formCategoryId, formSentencingGuidelines, formDefaultActions, formReason, editingRule, t, toast, fetchData, resetForm])

  const handleDelete = useCallback(async (rule) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`${t('deleteRuleConfirm')}\n${t('deleteRuleMessage')}`)
      : await new Promise(resolve => Alert.alert(
          t('deleteRuleConfirm'),
          t('deleteRuleMessage'),
          [
            { text: t('cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('deleteAction'), style: 'destructive', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        ))
    if (!confirmed) return
    setDeleting(rule.id)
    try {
      const result = await api.admin.createRuleRequest({
        action: 'delete',
        ruleId: rule.id,
        proposedRule: {
          title: rule.title,
          text: rule.text,
          severity: rule.severity,
        },
      })
      if (result?.status === 'approved' || result?.status === 'auto_approved') {
        toast?.(t('ruleChangeApplied'), 'success')
      } else {
        toast?.(t('ruleRequestSubmitted'), 'success')
      }
      fetchData()
    } catch (err) {
      toast?.(translateError(err.message, t) || t('error'), 'error')
    } finally {
      setDeleting(null)
    }
  }, [fetchData, t, toast])

  const handleView = useCallback((rule) => {
    setViewRule(rule)
    setViewVisible(true)
  }, [])

  const toggleContentType = useCallback((ct) => {
    setFormContentTypes(prev =>
      prev.includes(ct) ? prev.filter(c => c !== ct) : [...prev, ct]
    )
  }, [])

  const renderViewContent = () => {
    if (!viewRule) return null
    const sevColor = getSeverityColor(viewRule.severity, colors)
    const isActive = viewRule.status !== 'inactive'

    return (
      <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
        <View style={styles.badgeRow}>
          <View style={[styles.severityBadge, { backgroundColor: sevColor.bg }]}>
            <ThemedText variant="badge" style={{ color: sevColor.text, fontWeight: '700', letterSpacing: 0.5 }}>
              {t(SEVERITY_LABELS[viewRule.severity] || 'severity3')}
            </ThemedText>
          </View>
          {!isActive && (
            <View style={[styles.statusBadge, styles.statusInactive]}>
              <ThemedText variant="badge" color="inverse" style={styles.statusBadgeText}>
                {t('ruleStatusInactive')}
              </ThemedText>
            </View>
          )}
        </View>

        <ThemedText variant="label" color="secondary">{t('ruleDescription')}</ThemedText>
        <ThemedText variant="body" color="dark">{viewRule.text}</ThemedText>

        {viewRule.applicableContentTypes && viewRule.applicableContentTypes.length > 0 && (
          <>
            <ThemedText variant="label" color="secondary">{t('ruleContentTypes')}</ThemedText>
            <View style={styles.contentTypeRow}>
              {viewRule.applicableContentTypes.map(ct => (
                <View key={ct} style={styles.contentTypeChip}>
                  <ThemedText variant="badge" style={{ color: colors.badgeText, fontWeight: '600' }}>
                    {t(CONTENT_TYPE_LABELS[ct] || ct)}
                  </ThemedText>
                </View>
              ))}
            </View>
          </>
        )}

        {viewRule.sentencingGuidelines && (
          <>
            <ThemedText variant="label" color="secondary">{t('ruleSentencingGuidelines')}</ThemedText>
            <ThemedText variant="body" color="dark">{viewRule.sentencingGuidelines}</ThemedText>
          </>
        )}

        {viewRule.defaultActions && (() => {
          const da = viewRule.defaultActions
          const isPerType = typeof da === 'object' && !Array.isArray(da)
          const sections = isPerType
            ? Object.entries(da).filter(([, actions]) => Array.isArray(actions) && actions.length > 0)
            : Array.isArray(da) && da.length > 0 ? [['_flat', da]] : []
          if (sections.length === 0) return null
          return (
            <>
              <ThemedText variant="label" color="secondary">{t('ruleDefaultActions')}</ThemedText>
              <View style={styles.defaultActionsContainer}>
                {sections.map(([ct, actions]) => (
                  <View key={ct}>
                    {ct !== '_flat' && (
                      <ThemedText variant="caption" color="primary" style={styles.daSectionHeaderView}>
                        {t(CONTENT_TYPE_LABELS[ct] || ct)}
                      </ThemedText>
                    )}
                    {actions.map((entry, i) => {
                      const actionBg = entry.action === 'removed' || entry.action === 'permanent_ban'
                        ? SemanticColors.warning + '20'
                        : entry.action === 'warning' || entry.action === 'temporary_ban'
                          ? SemanticColors.escalate + '20'
                          : colors.buttonDefault
                      const actionColor = entry.action === 'removed' || entry.action === 'permanent_ban'
                        ? SemanticColors.warning
                        : entry.action === 'warning' || entry.action === 'temporary_ban'
                          ? SemanticColors.escalate
                          : colors.text
                      return (
                        <View key={i} style={styles.defaultActionRow}>
                          <ThemedText variant="bodySmall" color="dark" style={styles.defaultActionClass}>
                            {tMod(USER_CLASS_LABEL_KEYS[entry.userClass] || entry.userClass)}
                          </ThemedText>
                          <Ionicons name="arrow-forward" size={12} color={colors.secondaryText} />
                          <View style={[styles.defaultActionBadge, { backgroundColor: actionBg }]}>
                            <ThemedText variant="badge" style={{ color: actionColor }}>
                              {tMod(ACTION_LABEL_KEYS[entry.action] || entry.action)}
                            </ThemedText>
                          </View>
                          {entry.action === 'temporary_ban' && entry.duration && (
                            <ThemedText variant="caption" color="secondary"> ({entry.duration}d)</ThemedText>
                          )}
                        </View>
                      )
                    })}
                  </View>
                ))}
              </View>
            </>
          )
        })()}
      </ScrollView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText variant="h1" title={true} style={styles.pageTitle}>{t('rulesTitle')}</ThemedText>
          {userCanCreateRules && (
            <TouchableOpacity
              style={styles.createButton}
              onPress={openCreateForm}
              accessibilityRole="button"
              accessibilityLabel={t('createRuleA11y')}
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <ThemedText variant="buttonSmall" color="inverse">{t('createRule')}</ThemedText>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : rules.length === 0 && rootLocations.length === 0 ? (
          <EmptyState
            icon="shield-outline"
            title={t('noRulesFound')}
            subtitle={t('noRulesFoundSubtitle')}
            style={styles.emptyContainer}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Global rules section */}
            {globalRules.length > 0 && (
              <View style={styles.globalSection}>
                <View style={styles.globalHeader}>
                  <Ionicons name="globe-outline" size={20} color={colors.primary} />
                  <ThemedText variant="h2" color="dark" style={styles.locationTitle}>
                    {t('ruleLocationGlobal')}
                  </ThemedText>
                  <ThemedText variant="caption" color="primary" style={styles.countBadge}>
                    {globalRules.length}
                  </ThemedText>
                </View>
                <View style={styles.rulesContainer}>
                  {globalRules.map(rule => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      canEdit={canManageAtScope(rule)}
                      onView={handleView}
                      onEdit={openEditForm}
                      onDelete={handleDelete}
                      deleting={deleting}
                      colors={colors}
                      styles={styles}
                      t={t}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Location tree */}
            {rootLocations.map(root => (
              <LocationRulesSection
                key={root.id}
                location={root}
                allLocations={locations}
                depth={0}
                expandedLocations={expandedLocations}
                toggleLocation={toggleLocation}
                rulesByLocationId={rulesByLocationId}
                onView={handleView}
                onEdit={openEditForm}
                onDelete={handleDelete}
                deleting={deleting}
                canManageAtScope={canManageAtScope}
                user={user}
                colors={colors}
                styles={styles}
                t={t}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {/* Create/Edit Rule Modal */}
      <BottomDrawerModal
        visible={formVisible}
        onClose={() => { setFormVisible(false); resetForm() }}
        title={editingRule ? t('editRule') : t('createRule')}
      >
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <ThemedText variant="label" color="secondary">{t('ruleTitle')}</ThemedText>
          <TextInput
            style={styles.input}
            value={formTitle}
            onChangeText={setFormTitle}
            placeholder={t('ruleTitlePlaceholder')}
            placeholderTextColor={colors.placeholderText}
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('ruleTitleA11y')}
          />

          <ThemedText variant="label" color="secondary">{t('ruleDescription')}</ThemedText>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={formDescription}
            onChangeText={setFormDescription}
            placeholder={t('ruleDescriptionPlaceholder')}
            placeholderTextColor={colors.placeholderText}
            multiline
            numberOfLines={3}
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('ruleDescriptionA11y')}
          />

          <ThemedText variant="label" color="secondary">{t('ruleSeverity')}</ThemedText>
          <View style={styles.chipRow}>
            {SEVERITY_LEVELS.map(level => {
              const isSelected = formSeverity === level
              return (
                <TouchableOpacity
                  key={level}
                  style={[styles.severityChip, { backgroundColor: isSelected ? colors.buttonSelected : colors.buttonDefault }]}
                  onPress={() => setFormSeverity(level)}
                  accessibilityRole="button"
                  accessibilityLabel={t('ruleSeverityA11y', { level: t(SEVERITY_LABELS[level]) })}
                  accessibilityState={{ selected: isSelected }}
                >
                  <ThemedText variant="caption" style={{ color: isSelected ? colors.buttonSelectedText : colors.buttonDefaultText }}>
                    {t(SEVERITY_LABELS[level])}
                  </ThemedText>
                </TouchableOpacity>
              )
            })}
          </View>

          <ThemedText variant="label" color="secondary">{t('ruleContentTypes')}</ThemedText>
          <View style={styles.chipRow}>
            {CONTENT_TYPES.map(ct => {
              const isSelected = formContentTypes.includes(ct)
              return (
                <TouchableOpacity
                  key={ct}
                  style={[styles.chip, isSelected && styles.chipActive]}
                  onPress={() => toggleContentType(ct)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <ThemedText variant="caption" style={{ color: isSelected ? colors.buttonSelectedText : colors.buttonDefaultText }}>
                    {t(CONTENT_TYPE_LABELS[ct])}
                  </ThemedText>
                </TouchableOpacity>
              )
            })}
          </View>

          {(canCreateGlobal || allowedFormLocations.length > 0) && (
            <>
              <ThemedText variant="label" color="secondary">{t('ruleLocation')}</ThemedText>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setLocationPickerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('selectLocationA11y')}
              >
                <Ionicons name="location-outline" size={16} color={colors.secondaryText} />
                <ThemedText variant="body" color="dark" style={styles.pickerButtonText}>
                  {formLocationId
                    ? locations.find(l => l.id === formLocationId)?.name || t('selectLocation')
                    : t('ruleLocationGlobal')}
                </ThemedText>
                <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
              </TouchableOpacity>
            </>
          )}

          {formLocationId && allowedFormCategories.length > 0 && (
            <>
              <ThemedText variant="label" color="secondary">{t('ruleCategory')}</ThemedText>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setCategoryPickerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('selectCategoryA11y')}
              >
                <Ionicons name="pricetag-outline" size={16} color={colors.secondaryText} />
                <ThemedText variant="body" color="dark" style={styles.pickerButtonText}>
                  {formCategoryId
                    ? allCategories.find(c => c.id === formCategoryId)?.label || t('allCategories')
                    : t('allCategories')}
                </ThemedText>
                <Ionicons name="chevron-down" size={16} color={colors.secondaryText} />
              </TouchableOpacity>
            </>
          )}

          <ThemedText variant="label" color="secondary">{t('ruleSentencingGuidelines')}</ThemedText>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={formSentencingGuidelines}
            onChangeText={setFormSentencingGuidelines}
            placeholder={t('ruleSentencingGuidelinesPlaceholder')}
            placeholderTextColor={colors.placeholderText}
            multiline
            numberOfLines={3}
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('ruleSentencingGuidelinesA11y')}
          />

          <ThemedText variant="label" color="secondary">{t('ruleDefaultActions')}</ThemedText>
          <DefaultActionsEditor
            contentTypes={formContentTypes}
            defaultActions={formDefaultActions}
            onChange={setFormDefaultActions}
            colors={colors}
            styles={styles}
            t={t}
          />

          <ThemedText variant="label" color="secondary">{t('ruleChangeReason')}</ThemedText>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={formReason}
            onChangeText={setFormReason}
            placeholder={t('ruleChangeReasonPlaceholder')}
            placeholderTextColor={colors.placeholderText}
            multiline
            numberOfLines={2}
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={t('ruleChangeReasonA11y')}
          />

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmit}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel={editingRule ? t('requestUpdate') : t('requestCreate')}
            accessibilityState={{ disabled: submitting }}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <ThemedText variant="button" color="inverse">
                {editingRule ? t('requestUpdate') : t('requestCreate')}
              </ThemedText>
            )}
          </TouchableOpacity>
        </ScrollView>
      </BottomDrawerModal>

      {/* View Rule Detail Modal */}
      <BottomDrawerModal
        visible={viewVisible}
        onClose={() => { setViewVisible(false); setViewRule(null) }}
        title={viewRule ? viewRule.title : t('rulesTitle')}
      >
        {renderViewContent()}
      </BottomDrawerModal>

      {/* Location Picker Modal */}
      <LocationPicker
        visible={locationPickerVisible}
        onClose={() => setLocationPickerVisible(false)}
        allLocations={allowedFormLocations}
        currentLocationId={formLocationId}
        onSelect={(id) => { setFormLocationId(id); setFormCategoryId(null); setLocationPickerVisible(false) }}
        showGlobal={canCreateGlobal}
        globalSelected={!formLocationId}
        onSelectGlobal={() => { setFormLocationId(null); setFormCategoryId(null); setLocationPickerVisible(false) }}
      />

      {/* Category Picker Modal */}
      <BottomDrawerModal
        visible={categoryPickerVisible}
        onClose={() => setCategoryPickerVisible(false)}
        title={t('selectCategory')}
      >
        <ScrollView contentContainerStyle={styles.categoryList}>
          <TouchableOpacity
            style={[styles.categoryRow, !formCategoryId && styles.categoryRowSelected]}
            onPress={() => { setFormCategoryId(null); setCategoryPickerVisible(false) }}
            accessibilityRole="button"
            accessibilityLabel={t('allCategories')}
            accessibilityState={{ selected: !formCategoryId }}
          >
            <ThemedText variant="body" color={!formCategoryId ? 'primary' : 'dark'}>
              {t('allCategories')}
            </ThemedText>
            {!formCategoryId && <Ionicons name="checkmark" size={20} color={colors.primary} />}
          </TouchableOpacity>
          {allowedFormCategories.map(cat => {
            const selected = formCategoryId === cat.id
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryRow, selected && styles.categoryRowSelected]}
                onPress={() => { setFormCategoryId(cat.id); setCategoryPickerVisible(false) }}
                accessibilityRole="button"
                accessibilityLabel={cat.label}
                accessibilityState={{ selected }}
              >
                <ThemedText variant="body" color={selected ? 'primary' : 'dark'}>
                  {cat.label}
                </ThemedText>
                {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </BottomDrawerModal>
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  pageTitle: {
    color: colors.primary,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySurface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 25,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingBottom: 20,
    paddingHorizontal: 16,
  },

  // Global rules section
  globalSection: {
    marginBottom: 8,
  },
  globalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },

  // Location tree
  locationSectionRoot: {
    marginBottom: 4,
  },
  locationSectionChild: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  locationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  locationHeaderTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationTitle: {
    marginLeft: 6,
  },
  countBadge: {
    opacity: 0.6,
    marginLeft: 8,
  },

  // Rule cards
  rulesContainer: {
    gap: 8,
    paddingBottom: 8,
  },
  ruleCard: {
    flexDirection: 'column',
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 6,
  },
  ruleCardHeader: {
    flexDirection: 'column',
    gap: 4,
  },
  ruleCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: colors.cardBorder,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ruleMenuButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 4,
  },
  emptyRulesRow: {
    paddingVertical: 6,
    paddingLeft: 24,
  },

  // Badges
  severityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusInactive: {
    backgroundColor: SemanticColors.neutral,
  },
  statusBadgeText: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  contentTypeRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  contentTypeChip: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },

  // Default actions display (view modal)
  defaultActionsContainer: {
    gap: 6,
  },
  defaultActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  defaultActionClass: {
    minWidth: 80,
  },
  defaultActionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  daSectionHeaderView: {
    marginTop: 4,
    marginBottom: 2,
    fontWeight: '600',
  },

  // Default actions editor (form)
  daContainer: {
    gap: 12,
  },
  daSection: {
    gap: 4,
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 10,
  },
  daSectionHeader: {
    fontWeight: '600',
    marginBottom: 4,
  },
  daRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  daRowLabel: {
    flex: 1,
  },
  daDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 100,
    justifyContent: 'space-between',
  },
  daDropdownActive: {
    backgroundColor: colors.primaryLight + '30',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  daDropdownText: {
    color: colors.secondaryText,
  },
  daDropdownTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  daDropdownList: {
    marginLeft: '40%',
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 4,
    overflow: 'hidden',
  },
  daDropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  daDropdownItemSelected: {
    backgroundColor: colors.primaryLight + '20',
  },
  daDropdownItemText: {
    color: colors.text,
  },
  daDropdownItemTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  daDurationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: '40%',
    paddingBottom: 4,
  },
  daDurationInput: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 50,
    fontSize: 13,
    color: colors.text,
    textAlign: 'center',
  },

  // Action menu
  actionMenuOverlay: {
    flex: 1,
    backgroundColor: SemanticColors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  actionMenuPopup: {
    backgroundColor: colors.cardBackground,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 8,
    maxWidth: 340,
    width: '100%',
  },
  actionMenuTitle: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  actionMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  actionMenuRowLast: {
    borderBottomWidth: 0,
  },

  // Modal
  modalContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  input: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  multilineInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.buttonDefault,
  },
  chipActive: {
    backgroundColor: colors.buttonSelected,
  },
  severityChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerButtonText: {
    flex: 1,
  },
  submitButton: {
    backgroundColor: colors.primarySurface,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 8,
  },

  // Category picker
  categoryList: {
    padding: 16,
    paddingBottom: 40,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  categoryRowSelected: {
    backgroundColor: colors.primaryLight + '20',
  },
})
