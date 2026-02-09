import { useUser } from '../../hooks/useUser'
import { useRouter } from 'expo-router'
import { useEffect } from 'react'

import ThemedLoader from '../ThemedLoader'

const GuestOnly = ({ children }) => {
  const { user, authChecked, isNewUser } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (authChecked && user !== null) {
      if (isNewUser) {
        router.replace("/setup-profile")
      } else {
        router.replace("/cards")
      }
    }
  }, [user, authChecked, isNewUser])

  if (!authChecked || user) {
    return (
      <ThemedLoader />
    )
  }

  return children
}

export default GuestOnly
