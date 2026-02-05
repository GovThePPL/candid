// Group colors for opinion group visualization (used by stats components)
export const GROUP_COLORS = [
  '#5C005C', // Purple (primary)
  '#9B59B6', // Light purple
  '#3498DB', // Blue
  '#2ECC71', // Green
  '#F39C12', // Orange
  '#E74C3C', // Red
  '#1ABC9C', // Teal
  '#34495E', // Dark gray
]

// Candid brand colors based on Figma design
export const Colors = {
  // Brand colors
  primary: "#5C005C",        // Dark purple (main brand color)
  primaryLight: "#FFB8FF",   // Light pink
  primaryMuted: "#F0A3FD",   // Muted pink/purple

  // Semantic colors
  agree: "#008800",          // Green for agreed statements
  disagree: "#EF4C45",       // Red for disagree
  pass: "#CCCCCC",           // Light gray for pass/skip
  chat: "#9B59B6",           // Purple for chat actions

  // UI colors
  warning: "#EF4C45",
  success: "#008800",
  overlay: 'rgba(0, 0, 0, 0.5)',
  white: '#FFFFFF',
  darkText: '#1a1a1a',

  // Badge colors (trust score based)
  kudosBadge: "#FFCCAA",     // Peach for kudos/trust badge (default/legacy)
  trustBadgeGray: "#CCCCCC",   // Gray: trust score < 0.35
  trustBadgeBronze: "#E8B887", // Bronze: trust score 0.35 - 0.6
  trustBadgeSilver: "#D8D8D8", // Silver: trust score 0.6 - 0.9
  trustBadgeGold: "#FFD966",   // Gold: trust score >= 0.9

  // Card colors
  cardBackground: "#FFFFFF",
  cardBorder: "#E0E0E0",

  // Chat message colors
  messageYou: "#5C005C",     // Purple for your messages
  messageOther: "#B5BDC4",   // Gray for other's messages
  agreedPosition: "#F0A3FD", // Pink for agreed position proposals

  dark: {
    text: "#d4d4d4",
    title: "#fff",
    background: "#1E1E1E",
    navBackground: "#2C3842",
    iconColor: "#9591a5",
    iconColorFocused: "#FFB8FF",
    uiBackground: "#2f2b3d",
    cardBackground: "#2C3842",
  },
  light: {
    text: "#2C3842",
    title: "#5C005C",
    background: "#F5F5F5",
    navBackground: "#FFFFFF",
    iconColor: "#888888",
    iconColorFocused: "#5C005C",
    uiBackground: "#FFFFFF",
    cardBackground: "#FFFFFF",
  },
}
