import { Colors } from '../constants/Colors'

/**
 * Get initials from a display name for avatar fallback.
 * Single word → first letter; multiple words → first + last initials.
 */
export const getInitials = (name) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase()
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

/**
 * Generate a deterministic color from a string (name).
 * Uses a simple hash to select from a fixed palette.
 */
export const getInitialsColor = (name) => {
  if (!name) return Colors.primaryMuted
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colors = ['#5C005C', '#9B59B6', '#3498DB', '#1ABC9C', '#27AE60', '#F39C12', '#E74C3C', '#E91E63']
  return colors[Math.abs(hash) % colors.length]
}

/**
 * Return a badge color based on trust score tier.
 *   < 0.35 → Gray, 0.35–0.6 → Bronze, 0.6–0.9 → Silver, ≥ 0.9 → Gold
 */
export const getTrustBadgeColor = (trustScore) => {
  if (trustScore == null || trustScore < 0.35) return Colors.trustBadgeGray
  if (trustScore < 0.6) return Colors.trustBadgeBronze
  if (trustScore < 0.9) return Colors.trustBadgeSilver
  return Colors.trustBadgeGold
}

/**
 * Process an avatar URL. Passes through data URIs and regular URLs unchanged.
 * Returns null if the URL is falsy.
 */
export const getAvatarImageUrl = (url) => {
  if (!url) return null
  if (url.startsWith('data:')) return url
  return url
}
