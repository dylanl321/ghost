// Composable for admin user impersonation
// Allows admins to view GHOST as another user by overriding the user group store
// The real OIDC session is never modified — only the frontend view changes

import type { UserGroupState } from '~/stores/useUserGroupStore'

const logger = createLogger('Impersonation')

const BACKUP_KEY = 'ghost-impersonation-backup'

export interface ImpersonatedUser {
  userPrincipalName: string
  displayName: string
  mail?: string
  jobTitle?: string
  department?: string
  id?: string
}

// AWS group regex — same pattern used in useGraphApi.ts
const awsGroupRegex = /^AWS-(\d{12})[_-](.+)$/
const distributionGroupRegex = /^(.+)\.AWS$/i

export const useImpersonation = () => {
  const isImpersonating = useState<boolean>('impersonation-active', () => false)
  const impersonatedUser = useState<ImpersonatedUser | null>('impersonation-user', () => null)
  const adminBackup = useState<UserGroupState | null>('impersonation-backup', () => null)
  const isLoading = useState<boolean>('impersonation-loading', () => false)
  const error = useState<string | null>('impersonation-error', () => null)

  // On first init, check for orphaned backup from a page refresh while impersonating.
  // The persisted Pinia store may still hold the impersonated user's data — restore admin's real data.
  if (import.meta.client && !isImpersonating.value) {
    try {
      const raw = sessionStorage.getItem(BACKUP_KEY)
      if (raw) {
        const backup = JSON.parse(raw) as UserGroupState
        const store = useUserGroupStore()
        store.$patch(backup)
        sessionStorage.removeItem(BACKUP_KEY)
        logger.info('Restored admin store data from orphaned backup (page was refreshed during impersonation)')
      }
    } catch {
      sessionStorage.removeItem(BACKUP_KEY)
    }
  }

  const canImpersonate = computed(() => {
    const { isAdmin } = useUserRoles()
    return isAdmin.value
  })

  async function startImpersonation(targetUser: ImpersonatedUser) {
    const { isAdmin } = useUserRoles()
    if (!isAdmin.value) {
      throw new Error('Only administrators can impersonate users')
    }

    const { user } = useOidcAuth()
    const accessToken = user.value?.accessToken
    if (!accessToken) {
      throw new Error('No access token available')
    }

    const store = useUserGroupStore()
    const enclaveStore = useEnclaveStore()
    const { fetchUserMemberOf } = useGraphApi()

    isLoading.value = true
    error.value = null

    try {
      // Back up the admin's current store state
      adminBackup.value = JSON.parse(JSON.stringify(store.$state)) as UserGroupState
      sessionStorage.setItem(BACKUP_KEY, JSON.stringify(store.$state))

      // Fetch target user's groups from Graph API
      logger.info(`Fetching groups for ${targetUser.userPrincipalName}...`)
      const rawGroups = await fetchUserMemberOf(accessToken, targetUser.userPrincipalName)

      // Parse into allEntraGroups (display names)
      const allEntraGroups = rawGroups
        .map((g: any) => g.displayName || '')
        .filter((name: string) => name !== '')

      // Parse AWS role groups and distribution groups
      const roleGroups: Record<string, { accountId: string; role: string; groupName: string }> = {}
      const distributionGroups: Record<string, { accountName: string; groupName: string }> = {}

      for (const groupName of allEntraGroups) {
        const awsMatch = groupName.match(awsGroupRegex)
        if (awsMatch) {
          const [, accountId, roleName] = awsMatch
          roleGroups[`${accountId}-${roleName}`] = {
            accountId: accountId!,
            role: roleName!,
            groupName
          }
          continue
        }

        const distroMatch = groupName.match(distributionGroupRegex)
        if (distroMatch) {
          const [, accountName] = distroMatch
          distributionGroups[accountName!.toLowerCase()] = {
            accountName: accountName!,
            groupName
          }
        }
      }

      // Override the store with the target user's data
      store.allEntraGroups = allEntraGroups
      store.roleGroups = roleGroups
      store.distributionGroups = distributionGroups
      store.groupsLastFetch = Date.now()

      // Recompute AWS roles from the target's groups
      await store.initializeAWSRoles(enclaveStore.enclaves, true)

      // Activate impersonation
      impersonatedUser.value = targetUser
      isImpersonating.value = true

      logger.info(`Now impersonating ${targetUser.displayName} (${targetUser.userPrincipalName}) — ${allEntraGroups.length} groups, ${store.myAccountIds.length} accounts`)
    } catch (err) {
      // Restore backup on failure
      if (adminBackup.value) {
        store.$patch(adminBackup.value)
        sessionStorage.removeItem(BACKUP_KEY)
        adminBackup.value = null
      }
      error.value = err instanceof Error ? err.message : 'Failed to impersonate user'
      logger.error('Impersonation failed:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  function stopImpersonation() {
    if (!adminBackup.value) {
      logger.warn('No backup to restore')
      isImpersonating.value = false
      impersonatedUser.value = null
      return
    }

    const store = useUserGroupStore()
    store.$patch(adminBackup.value)

    sessionStorage.removeItem(BACKUP_KEY)
    adminBackup.value = null
    impersonatedUser.value = null
    isImpersonating.value = false
    error.value = null

    logger.info('Impersonation stopped, admin store restored')
    navigateTo('/')
  }

  return {
    isImpersonating: readonly(isImpersonating),
    impersonatedUser: readonly(impersonatedUser),
    isLoading: readonly(isLoading),
    error: readonly(error),
    canImpersonate,
    startImpersonation,
    stopImpersonation
  }
}
