// Group colors for opinion group visualization (used by stats components)
export const GROUP_COLORS = [
  '#8B3A8B', // Purple (primary — visible on both light and dark)
  '#9B59B6', // Light purple
  '#3498DB', // Blue
  '#2ECC71', // Green
  '#F39C12', // Orange
  '#E74C3C', // Red
  '#1ABC9C', // Teal
  '#34495E', // Dark gray
]

// The original brand purple — always used for card headers/footers with white text
export const BrandColor = "#5C005C"

// Semantic colors that don't change between themes
export const SemanticColors = {
  agree: "#008800",
  disagree: "#EF4C45",
  warning: "#EF4C45",
  success: "#008800",
  overlay: "rgba(0, 0, 0, 0.5)",
}

// Badge colors (same in both themes)
export const BadgeColors = {
  trustBadgeGray: "#CCCCCC",
  trustBadgeBronze: "#E8B887",
  trustBadgeSilver: "#D8D8D8",
  trustBadgeGold: "#FFD966",
  kudosBadge: "#FFCCAA",
}

export const LightTheme = {
  // Brand
  primary: "#5C005C",
  primaryLight: "#FFB8FF",
  primaryMuted: "#F0A3FD",
  chat: "#9B59B6",

  // Backgrounds
  background: "#F5F5F5",
  navBackground: "#FFFFFF",
  uiBackground: "#FFFFFF",
  cardBackground: "#FFFFFF",

  // Text
  text: "#2C3842",
  title: "#5C005C",
  darkText: "#1a1a1a",
  secondaryText: "#666666",
  placeholderText: "#999999",

  // Borders & dividers
  cardBorder: "#E0E0E0",
  border: "#E0E0E0",

  // Icons
  iconColor: "#888888",
  iconColorFocused: "#5C005C",
  tabInactive: "#999999",

  // Chat
  messageYou: "#5C005C",
  messageOther: "#B5BDC4",
  agreedPosition: "#F0A3FD",

  // Pass button (not for text — only for pass/skip UI elements)
  pass: "#CCCCCC",

  // Interactive buttons (option pills on cards, tab selectors)
  buttonDefault: "#FFB8FF",
  buttonSelected: "#5C005C",
  buttonDefaultText: "#2C3842",
  buttonSelectedText: "#FFFFFF",

  // Location/category badges and accent text
  badgeBg: "#5C005C18",
  badgeText: "#5C005C",

  // Chatting list button backgrounds
  chattingListBg: BrandColor + '20',
  chattingListSelectedBg: "#5C005C",
}

export const DarkTheme = {
  // Brand — light enough for readable small text on dark backgrounds
  primary: "#B878B8",
  primaryLight: "#FFB8FF",
  primaryMuted: "#E0A0E0",
  chat: "#C88FE0",

  // Backgrounds — near-black but above #000 so shadows (pure black) create depth
  background: "#121212",
  navBackground: "#1C1C1C",
  uiBackground: "#181818",
  cardBackground: "#242424",

  // Text
  text: "#E8E8E8",
  title: "#FFFFFF",
  darkText: "#F0F0F0",
  secondaryText: "#A8A8A8",
  placeholderText: "#666666",

  // Borders & dividers
  cardBorder: "#2E2E2E",
  border: "#2E2E2E",

  // Icons
  iconColor: "#999999",
  iconColorFocused: "#FFB8FF",
  tabInactive: "#777777",

  // Chat
  messageYou: "#D070D0",
  messageOther: "#2A2A2A",
  agreedPosition: "#7A4D7A",

  // Pass button
  pass: "#444444",

  // Interactive buttons — inverted: lighter when selected in dark mode
  buttonDefault: "#6E206E",
  buttonSelected: "#FFB8FF",
  buttonDefaultText: "#E8E8E8",
  buttonSelectedText: "#1A1A1A",

  // Location/category badges and accent text — solid colors for dark backgrounds
  badgeBg: "#6E206E",
  badgeText: "#BBBBBB",

  // Chatting list button backgrounds
  chattingListBg: BrandColor + '45',
  chattingListSelectedBg: "#6E206E",
}

