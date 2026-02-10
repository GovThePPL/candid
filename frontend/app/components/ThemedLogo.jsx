import { Image } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'

// images
import DarkLogo from '../assets/img/logo_dark.png'
import LightLogo from '../assets/img/logo_light.png'

const ThemedLogo = () => {
  const { isDark } = useTheme()
  const logo = isDark ? DarkLogo : LightLogo

  return (
    <Image source={logo} />
  )
}

export default ThemedLogo
