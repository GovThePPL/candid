import { StyleSheet, View, TouchableOpacity, Modal, Pressable, Text } from 'react-native'
import { useState, useMemo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../hooks/useThemeColors'
import { useI18n, SUPPORTED_LANGUAGES } from '../contexts/I18nContext'
import ThemedText from './ThemedText'

const LANGUAGE_META = {
  en: { label: 'English', flag: '\u{1F1FA}\u{1F1F8}', code: 'EN' },
  es: { label: 'Espa\u00f1ol', flag: '\u{1F1EA}\u{1F1F8}', code: 'ES' },
}

const PILL_OPTIONS = [
  ...SUPPORTED_LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_META[code]?.label || code })),
  { value: 'system', label: null },
]

/**
 * Language picker with three variants:
 * - "pills" (default): horizontal radio-pill row for settings pages
 * - "dropdown": compact flag+code button with dropdown menu for auth screens
 * - "inline": tappable form-field row for setup-profile (card bg, border, flag + name + chevron)
 */
export default function LanguagePicker({ variant = 'pills', compact = false }) {
  if (variant === 'dropdown') return <DropdownPicker />
  if (variant === 'inline') return <InlinePicker />
  return <PillPicker compact={compact} />
}

function DropdownPicker() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const { language, languagePreference, setLanguagePreference } = useI18n()
  const [open, setOpen] = useState(false)
  const styles = useMemo(() => createDropdownStyles(colors), [colors])

  const currentMeta = LANGUAGE_META[language] || LANGUAGE_META.en

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('languageA11y', { language: currentMeta.label })}
        accessibilityHint={t('languageHintA11y')}
      >
        <Text style={styles.flag}>{currentMeta.flag}</Text>
        <ThemedText variant="label" style={styles.triggerCode}>{currentMeta.code}</ThemedText>
        <Ionicons name="chevron-down" size={14} color={colors.secondaryText} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.menuAnchor}>
            <View style={styles.menu}>
              {SUPPORTED_LANGUAGES.map((code) => {
                const meta = LANGUAGE_META[code]
                const isSelected = languagePreference === code
                return (
                  <TouchableOpacity
                    key={code}
                    style={[styles.menuItem, isSelected && styles.menuItemSelected]}
                    onPress={() => { setLanguagePreference(code); setOpen(false) }}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={meta.label}
                  >
                    <Text style={styles.menuFlag}>{meta.flag}</Text>
                    <ThemedText variant="label" style={[
                      styles.menuCode,
                      isSelected && styles.menuCodeSelected,
                    ]}>{meta.code}</ThemedText>
                    <ThemedText variant="bodySmall" style={[
                      styles.menuLabel,
                      isSelected && styles.menuLabelSelected,
                    ]}>{meta.label}</ThemedText>
                    {isSelected && (
                      <Ionicons name="checkmark" size={16} color={colors.primary} style={styles.checkmark} />
                    )}
                  </TouchableOpacity>
                )
              })}
              <View style={styles.menuDivider} />
              <TouchableOpacity
                style={[styles.menuItem, languagePreference === 'system' && styles.menuItemSelected]}
                onPress={() => { setLanguagePreference('system'); setOpen(false) }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: languagePreference === 'system' }}
                accessibilityLabel={t('systemLanguageA11y')}
              >
                <Ionicons name="phone-portrait-outline" size={16} color={colors.secondaryText} style={styles.systemIcon} />
                <ThemedText variant="bodySmall" style={[
                  styles.menuLabel,
                  languagePreference === 'system' && styles.menuLabelSelected,
                ]}>{t('systemLanguage')}</ThemedText>
                {languagePreference === 'system' && (
                  <Ionicons name="checkmark" size={16} color={colors.primary} style={styles.checkmark} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

function InlinePicker() {
  const { t } = useTranslation('auth')
  const colors = useThemeColors()
  const { language, languagePreference, setLanguagePreference } = useI18n()
  const [open, setOpen] = useState(false)
  const styles = useMemo(() => createInlineStyles(colors), [colors])

  const currentMeta = LANGUAGE_META[language] || LANGUAGE_META.en

  return (
    <View>
      <TouchableOpacity
        style={styles.selector}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('selectLanguageA11y')}
      >
        <Text style={styles.flag}>{currentMeta.flag}</Text>
        <ThemedText variant="button" color="primary" style={styles.label}>{currentMeta.label}</ThemedText>
        <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.menuContainer}>
            <View style={styles.menu}>
              {SUPPORTED_LANGUAGES.map((code) => {
                const meta = LANGUAGE_META[code]
                const isSelected = languagePreference === code
                return (
                  <TouchableOpacity
                    key={code}
                    style={[styles.menuItem, isSelected && styles.menuItemSelected]}
                    onPress={() => { setLanguagePreference(code); setOpen(false) }}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={meta.label}
                  >
                    <Text style={styles.menuFlag}>{meta.flag}</Text>
                    <ThemedText variant="bodySmall" style={[
                      styles.menuLabel,
                      isSelected && styles.menuLabelSelected,
                    ]}>{meta.label}</ThemedText>
                    {isSelected && (
                      <Ionicons name="checkmark" size={16} color={colors.primary} style={styles.checkmark} />
                    )}
                  </TouchableOpacity>
                )
              })}
              <View style={styles.menuDivider} />
              <TouchableOpacity
                style={[styles.menuItem, languagePreference === 'system' && styles.menuItemSelected]}
                onPress={() => { setLanguagePreference('system'); setOpen(false) }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: languagePreference === 'system' }}
                accessibilityLabel={t('common:systemLanguageA11y')}
              >
                <Ionicons name="phone-portrait-outline" size={16} color={colors.secondaryText} style={styles.systemIcon} />
                <ThemedText variant="bodySmall" style={[
                  styles.menuLabel,
                  languagePreference === 'system' && styles.menuLabelSelected,
                ]}>{t('common:systemLanguage')}</ThemedText>
                {languagePreference === 'system' && (
                  <Ionicons name="checkmark" size={16} color={colors.primary} style={styles.checkmark} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

function PillPicker({ compact }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const { languagePreference, setLanguagePreference } = useI18n()
  const styles = useMemo(() => createPillStyles(colors), [colors])

  return (
    <View style={styles.container}>
      {!compact && (
        <Ionicons name="globe-outline" size={18} color={colors.secondaryText} style={styles.icon} />
      )}
      {PILL_OPTIONS.map((option) => (
        <TouchableOpacity
          key={option.value}
          style={[
            styles.option,
            languagePreference === option.value && styles.optionSelected,
          ]}
          onPress={() => setLanguagePreference(option.value)}
          accessibilityRole="radio"
          accessibilityState={{ checked: languagePreference === option.value }}
          accessibilityLabel={option.label || t('systemLanguageA11y')}
        >
          {option.value === 'system' ? (
            <Ionicons
              name="phone-portrait-outline"
              size={16}
              color={languagePreference === 'system' ? '#FFFFFF' : colors.secondaryText}
            />
          ) : null}
          <ThemedText variant="label" color="secondary" style={[
            styles.optionLabel,
            languagePreference === option.value && styles.optionLabelSelected,
          ]}>
            {option.label || t('systemLanguage')}
          </ThemedText>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const createDropdownStyles = (colors) => StyleSheet.create({
  wrapper: {
    alignItems: 'flex-end',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  flag: {
    fontSize: 18,
  },
  triggerCode: {
    fontWeight: '600',
    color: colors.darkText,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  menuAnchor: {
    marginTop: 60,
    marginRight: 20,
  },
  menu: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 6,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
  },
  menuItemSelected: {
    backgroundColor: colors.primary + '18',
  },
  menuFlag: {
    fontSize: 18,
  },
  menuCode: {
    fontWeight: '700',
    color: colors.darkText,
    width: 28,
  },
  menuCodeSelected: {
    color: colors.primary,
  },
  menuLabel: {
    flex: 1,
    color: colors.secondaryText,
  },
  menuLabelSelected: {
    color: colors.darkText,
  },
  checkmark: {
    marginLeft: 4,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: 4,
    marginHorizontal: 14,
  },
  systemIcon: {
    width: 18,
    textAlign: 'center',
  },
})

const createInlineStyles = (colors) => StyleSheet.create({
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
  },
  flag: {
    fontSize: 18,
    marginRight: 10,
  },
  label: {
    flex: 1,
    fontWeight: undefined,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    width: '80%',
    maxWidth: 300,
  },
  menu: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  menuItemSelected: {
    backgroundColor: colors.primary + '18',
  },
  menuFlag: {
    fontSize: 18,
  },
  menuLabel: {
    flex: 1,
    color: colors.secondaryText,
  },
  menuLabelSelected: {
    color: colors.darkText,
  },
  checkmark: {
    marginLeft: 4,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: 4,
    marginHorizontal: 16,
  },
  systemIcon: {
    width: 18,
    textAlign: 'center',
  },
})

const createPillStyles = (colors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  icon: {
    marginLeft: 8,
    marginRight: 4,
  },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 8,
  },
  optionSelected: {
    backgroundColor: colors.primary,
  },
  optionLabel: {
    fontWeight: '500',
  },
  optionLabelSelected: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
})
