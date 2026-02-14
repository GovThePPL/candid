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
  escalate: "#B54800",
  pending: "#B58900",
  neutral: "#757575",
  overlay: "rgba(0, 0, 0, 0.5)",
  bridging: "#00796B",
}

// Text/icon colors for content placed on BrandColor surfaces (card headers/footers)
export const OnBrandColors = {
  text: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.8)',
  textTertiary: 'rgba(255, 255, 255, 0.6)',
  overlay: 'rgba(255, 255, 255, 0.15)',
}

// Badge colors (same in both themes)
export const BadgeColors = {
  trustBadgePurple: "#5C005C",
  trustBadgeBronze: "#E8B887",
  trustBadgeSilver: "#D8D8D8",
  trustBadgeGold: "#FFD966",
  kudosBadge: "#FFCCAA",
}

export const LightTheme = {
  // Brand
  primary: "#5C005C",
  primarySurface: "#5C005C",
  logoText: "#5C005C",
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
  pass: "#999999",

  // Interactive buttons (option pills on cards, tab selectors)
  buttonDefault: "#FFB8FF",
  buttonSelected: "#5C005C",
  buttonDefaultText: "#2C3842",
  buttonSelectedText: "#FFFFFF",

  // Location/category badges and accent text
  badgeBg: "#5C005C18",
  badgeText: "#5C005C",

  // Defining statement (stats consensus box)
  definingAgreeBg: "#C8E6C9",
  definingDisagreeBg: "#FFCDD2",
  definingText: "#000000",

  // Banners & alerts
  errorBannerBg: "#FFEAEA",
  warningBannerBg: "#FFF3E6",
  warningBannerText: "#8B3A00",

  // Severity indicators
  severityLowBg: "#E8F5E9",
  severityLowText: "#1B5E20",
  severityMediumBg: "#FFF3E0",
  severityMediumText: "#9E2B00",
  severityHighBg: "#FFEBEE",

  // Card shell and bubble surfaces (agree/warning — same as SemanticColors in light)
  agreeSurface: "#008800",
  agreeBubble: "#008800",
  warningSurface: "#EF4C45",
  warningBubble: "#EF4C45",

  // Chatting list button backgrounds
  chattingListBg: BrandColor + '20',
  chattingListSelectedBg: "#5C005C",
}

export const DarkTheme = {
  // Brand — muted purple, just above AA 4.5:1 on cardBackground (#242424)
  primary: "#A67EA6",
  primarySurface: "#6E206E",
  logoText: "#915091",
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
  messageYou: "#6E206E",
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

  // Defining statement (stats consensus box)
  definingAgreeBg: "#0D3D0D",
  definingDisagreeBg: "#3D1515",
  definingText: "#E8E8E8",

  // Banners & alerts
  errorBannerBg: "#2D0D0D",
  warningBannerBg: "#2D1A00",
  warningBannerText: "#FFB74D",

  // Severity indicators
  severityLowBg: "#0D2D0D",
  severityLowText: "#81C784",
  severityMediumBg: "#2D1A00",
  severityMediumText: "#FFB74D",
  severityHighBg: "#2D0D0D",

  // Card shell surfaces — deeply muted to reduce contrast with dark scene
  agreeSurface: "#004B00",
  agreeBubble: "#007700",
  warningSurface: "#6E2020",
  warningBubble: "#993333",

  // Chatting list button backgrounds
  chattingListBg: BrandColor + '45',
  chattingListSelectedBg: "#6E206E",
}

