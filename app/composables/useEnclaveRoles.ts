/**
 * Composable for checking user's AWS enclave administrative roles
 * Uses the enclave store (local cached data) rather than Entra APIs
 */

export interface EnclaveRoleInfo {
  isPrimaryAdmin: boolean
  isDelegateAdmin: boolean
  isCostManager: boolean
  primaryAdminAccounts: string[]   // Account IDs where user is primary admin
  delegateAdminAccounts: string[]  // Account IDs where user is delegate admin
  costManagerAccounts: string[]    // Account IDs where user is cost manager
  totalAdminAccounts: number       // Total unique accounts where user has any admin role
}

export function useEnclaveRoles() {
  const enclaveStore = useEnclaveStore()

  /**
   * Check if a username (first.last format) matches a user principal name
   * Handles variations like:
   * - john.doe matches john.doe@gd-ms.com
   * - john.doe matches john.doe
   */
  const usernameMatches = (username: string, userPrincipalName: string): boolean => {
    if (!username || !userPrincipalName) return false

    // Extract the username part before @ symbol
    const upnUsername = userPrincipalName.split('@')[0].toLowerCase()
    const checkUsername = username.toLowerCase()

    return upnUsername === checkUsername
  }

  /**
   * Get all enclave roles for a user based on their username
   * Searches through ALL accounts in the enclave store
   */
  const getUserEnclaveRoles = (userPrincipalName: string): EnclaveRoleInfo => {
    const result: EnclaveRoleInfo = {
      isPrimaryAdmin: false,
      isDelegateAdmin: false,
      isCostManager: false,
      primaryAdminAccounts: [],
      delegateAdminAccounts: [],
      costManagerAccounts: [],
      totalAdminAccounts: 0
    }

    if (!userPrincipalName) return result

    const allAccounts = Object.values(enclaveStore.enclaves)
    const uniqueAdminAccounts = new Set<string>()

    for (const account of allAccounts) {
      const accountId = account.accountId || account.awsStandardAccountID
      if (!accountId) continue

      // Check if user is primary admin
      if (account.primaryAccountAdminUsername &&
          usernameMatches(account.primaryAccountAdminUsername, userPrincipalName)) {
        result.isPrimaryAdmin = true
        result.primaryAdminAccounts.push(accountId)
        uniqueAdminAccounts.add(accountId)
      }

      // Check if user is delegate admin
      if (account.delegateAccountAdminUsername &&
          usernameMatches(account.delegateAccountAdminUsername, userPrincipalName)) {
        result.isDelegateAdmin = true
        result.delegateAdminAccounts.push(accountId)
        uniqueAdminAccounts.add(accountId)
      }

      // Check if user is cost manager
      if (account.costManagerUsername &&
          usernameMatches(account.costManagerUsername, userPrincipalName)) {
        result.isCostManager = true
        result.costManagerAccounts.push(accountId)
        uniqueAdminAccounts.add(accountId)
      }
    }

    result.totalAdminAccounts = uniqueAdminAccounts.size

    return result
  }

  /**
   * Get enclave admin counts for a user (quick stats)
   */
  const getUserEnclaveStats = (userPrincipalName: string) => {
    const roles = getUserEnclaveRoles(userPrincipalName)

    return {
      primaryAdminCount: roles.primaryAdminAccounts.length,
      delegateAdminCount: roles.delegateAdminAccounts.length,
      costManagerCount: roles.costManagerAccounts.length,
      totalAccounts: roles.totalAdminAccounts,
      hasAnyAdminRole: roles.isPrimaryAdmin || roles.isDelegateAdmin || roles.isCostManager
    }
  }

  /**
   * Batch check enclave roles for multiple users
   * Useful for efficiently processing many users at once
   */
  const batchGetUserEnclaveRoles = (userPrincipalNames: string[]): Record<string, EnclaveRoleInfo> => {
    const results: Record<string, EnclaveRoleInfo> = {}

    for (const upn of userPrincipalNames) {
      results[upn] = getUserEnclaveRoles(upn)
    }

    return results
  }

  return {
    getUserEnclaveRoles,
    getUserEnclaveStats,
    batchGetUserEnclaveRoles,
    usernameMatches
  }
}
