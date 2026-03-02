import { useUser } from '../../hooks/useUser'
import { useRouter, usePathname } from 'expo-router'
import { useEffect } from 'react'

import ThemedLoader from '../ThemedLoader'

const UserOnly = ({ children }) => {
  const { user, authChecked, isNewUser } = useUser()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (authChecked && user === null) {
      router.replace("/login")
    } else if (authChecked && user && isNewUser && !pathname.startsWith('/setup-profile')) {
      router.replace("/setup-profile")
    }
  }, [user, authChecked, isNewUser, pathname])


  // show loader while we wait for auth to be checked, or while redirecting if user becomes null
  if (!authChecked || !user || (isNewUser && !pathname.startsWith('/setup-profile'))) {
    return (
      <ThemedLoader />
    )
  }

  return children
}

export default UserOnly
