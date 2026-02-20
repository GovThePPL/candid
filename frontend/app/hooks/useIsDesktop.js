import { useWindowDimensions } from 'react-native'

const DESKTOP_BREAKPOINT = 768

export default function useIsDesktop() {
  const { width } = useWindowDimensions()
  return width >= DESKTOP_BREAKPOINT
}
