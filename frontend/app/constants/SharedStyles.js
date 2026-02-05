import { StyleSheet } from 'react-native'
import { Colors } from './Colors'
import { BorderRadius, Spacing, Shadows, Typography } from './Theme'

export const SharedStyles = StyleSheet.create({
  // Modal overlay (used in 16+ files)
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },

  // Modal content container
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    padding: Spacing.lg,
  },

  // Modal title
  modalTitle: {
    ...Typography.h2,
    color: Colors.primary,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },

  // Standard card container (shadow + border)
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    ...Shadows.card,
  },

  // Centered container for loading/empty states
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },

  // Picker item row (used in LocationCategorySelector, profile, settings)
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },

  // Section header row
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
})
