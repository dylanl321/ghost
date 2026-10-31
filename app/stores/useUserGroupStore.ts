const logger = createLogger('GHOST-AUTH')

// ----- Interfaces -----

interface RoleGroupStructure {
  accountId: string;
  role: string;
  groupName: string;
}

interface DistributionGroupStructure {
  accountName: string;
  groupName: string;
}

interface AwsRoleInfo {
  roles: string[]
  accountName: string // ex. "GDMS Cloud"
  accountStatus: string // ex. "ACTIVE"
  isGovCloud: boolean
  standardAccountId: string
  govCloudAccountId: string
  distributionGroups: string[] // ex. "GDMSCloud.AWS"
}

export interface UserGroupState {
  groupsLastFetch: number | null
  awsRolesLastFetch: number | null
  roleGroups: Record<string, RoleGroupStructure>,
  distributionGroups: Record<string, DistributionGroupStructure>,
  awsRoles: Record<string, AwsRoleInfo>
  allEntraGroups: string[] // All Entra ID group names for role/permission evaluation
  // Cached account IDs for quick filtering
  myAccountIds: string[] // All accounts user has access to
  myAdminAccountIds: string[] // Accounts where user is admin (from enclave data)
}

const GOV_IDENTIFIER = ' | gov'
const COMM_IDENTIFIER = ' | comm'

// ----- Store -----

// Time until the data needs to be refreshed
// This only gets checked when the user first "loads" the website (e.g. first visit, hard refresh, new tab, etc.). This is done via the "init-check.client.ts" custom plugin.
const timeToLiveSeconds = 60 * 60 * 24
let groupInitializationPromise: Promise<void> | null = null

export const useUserGroupStore = defineStore('userGroups', {
  state: (): UserGroupState => ({
    groupsLastFetch: null,
    awsRolesLastFetch: null,
    roleGroups: {},
    distributionGroups: {},
    awsRoles: {},
    allEntraGroups: [],
    myAccountIds: [],
    myAdminAccountIds: []
  }),

  getters: {
    groupsNeedRefresh: (state) => {
      if (!state.groupsLastFetch) return true
      return Date.now() - state.groupsLastFetch > timeToLiveSeconds * 1000
    },

    awsRolesNeedRefresh: (state) => {
      if (!state.awsRolesLastFetch) return true
      return Date.now() - state.awsRolesLastFetch > timeToLiveSeconds * 1000
    },

    myEnclaves: (state) => {
      if (!state.awsRoles) {
        logger.error('Initialize awsRoles before accessing myEnclaves')
        return {}
      }

      const enclaves: Record<string, {
        projectName: string,
        standardId: string,
        govcloudId: string,
        environment: string,
        roles: Array<string>,
        total: number
      }> = {}

      for (const [accountId, roleData] of Object.entries(state.awsRoles)) {
        if (roleData.accountName === 'Unknown Account') {
          continue
        }

        const enclaveKey = roleData.standardAccountId

        if (!enclaves[enclaveKey]) {
          enclaves[enclaveKey] = {
            projectName: roleData.accountName,
            standardId: roleData.standardAccountId,
            govcloudId: roleData.govCloudAccountId,
            environment: roleData.isGovCloud ? 'GovCloud' : 'Commercial',
            roles: [],
            total: 0
          }
        }

        const identifier = accountId === roleData.standardAccountId ? COMM_IDENTIFIER : GOV_IDENTIFIER
        enclaves[enclaveKey].roles.push(...roleData.roles.map(r => `${r}${identifier}`)) // Add environment to end of each role string
        enclaves[enclaveKey].total = enclaves[enclaveKey].roles.length
      }

      // return Object.values(enclaves)
      return enclaves
    }
  },

  actions: {
    // Set groups for dev mode (skips Graph API). Preserves existing account/role data if present.
    setDevGroups(groups: string[]) {
      this.allEntraGroups = groups
      this.groupsLastFetch = Date.now()
      // Only reset account data if no accounts are currently assigned
      if (Object.keys(this.awsRoles).length === 0) {
        this.roleGroups = {}
        this.distributionGroups = {}
        this.awsRoles = {}
        this.myAccountIds = []
        this.myAdminAccountIds = []
        this.awsRolesLastFetch = Date.now()
      }
      logger.info('Dev mode: Set mock groups:', groups)
    },

    // Apply the dev-mode groups configured by DEV_USER_GROUPS
    applyConfiguredDevGroups() {
      const config = useRuntimeConfig()
      const groups = String(config.public.devUserGroups || 'AWS-Product-Team')
        .split(',')
        .map(group => group.trim())
        .filter(Boolean)
      this.setDevGroups(groups)
    },

    // Set dev accounts with real enclave data - builds awsRoles so the user appears to have access
    setDevAccounts(accountIds: string[], roles: string[], enclaveData: Record<string, AWSEnclaveData>) {
      this.awsRoles = {}
      this.roleGroups = {}
      this.myAccountIds = []
      this.myAdminAccountIds = []

      const accountIdsSet = new Set<string>()
      const adminAccountIdsSet = new Set<string>()

      for (const accountId of accountIds) {
        const enclave = enclaveData[accountId]
        if (!enclave) continue

        const standardAccountId = enclave.accountId || enclave.awsStandardAccountID || accountId
        const govCloudAccountId = enclave.awsGovCloudAccountID || ''

        // Add commercial account entry
        this.awsRoles[standardAccountId] = {
          roles: [...roles],
          accountName: enclave.projectName || enclave.accountName || 'Unknown Account',
          accountStatus: enclave.accountStatus || 'ACTIVE',
          isGovCloud: !!govCloudAccountId,
          standardAccountId,
          govCloudAccountId,
          distributionGroups: []
        }

        // Add govcloud account entry if paired
        if (govCloudAccountId) {
          this.awsRoles[govCloudAccountId] = {
            roles: [...roles],
            accountName: enclave.projectName || enclave.accountName || 'Unknown Account',
            accountStatus: enclave.accountStatus || 'ACTIVE',
            isGovCloud: true,
            standardAccountId,
            govCloudAccountId,
            distributionGroups: []
          }
        }

        accountIdsSet.add(standardAccountId)

        const hasAdminRole = roles.some(role =>
          role.toLowerCase().includes('admin') ||
          role.toLowerCase().includes('poweruser')
        )
        if (hasAdminRole) {
          adminAccountIdsSet.add(standardAccountId)
        }

        // Build matching roleGroups entries so the data looks realistic
        for (const role of roles) {
          const key = `${standardAccountId}-${role}`
          this.roleGroups[key] = {
            accountId: standardAccountId,
            role,
            groupName: `AWS-${standardAccountId}_GDSSO_${role}`
          }
          if (govCloudAccountId) {
            const govKey = `${govCloudAccountId}-${role}`
            this.roleGroups[govKey] = {
              accountId: govCloudAccountId,
              role,
              groupName: `AWS-${govCloudAccountId}_GDSSO_${role}`
            }
          }
        }
      }

      this.myAccountIds = Array.from(accountIdsSet)
      this.myAdminAccountIds = Array.from(adminAccountIdsSet)
      this.awsRolesLastFetch = Date.now()
      this.groupsLastFetch = Date.now()

      logger.info(`Dev mode: Set ${accountIds.length} accounts with roles [${roles.join(', ')}], ${this.myAccountIds.length} total, ${this.myAdminAccountIds.length} admin`)
    },

    async initializeGroups(accessToken: string, force: boolean = false) {
      if (!import.meta.client) return // only run on client-side
      if (!this.groupsNeedRefresh && !force) {
        logger.info('Using cached user group data.')
        return
      }

      // Dev sessions have no Graph access; the Graph helpers return no groups, which would
      // overwrite the configured dev groups and lock dev admins out of admin pages
      if (useOidcAuth().user.value?.provider === 'dev') {
        this.applyConfiguredDevGroups()
        return
      }

      logger.info('Initializing user groups')

      const { fetchGroups, fetchAllGroupsWithPagination } = useGraphApi()

      // Fetch ALL Entra ID groups (for role evaluation)
      const allGroupsRaw = await fetchAllGroupsWithPagination(accessToken)
      this.allEntraGroups = allGroupsRaw
        .map((g: any) => g.displayName || '')
        .filter((name: string) => name !== '')

      logger.info(`Stored ${this.allEntraGroups.length} total Entra ID groups for role evaluation`)

      // Fetch AWS-specific groups (for AWS access)
      const data = await fetchGroups(accessToken)
      this.roleGroups = data.awsRoleGroups
      this.distributionGroups = data.distributionGroups

      if (this.roleGroups && this.distributionGroups) {
        this.groupsLastFetch = Date.now()
      } else {
        logger.error('Missing groups or roles for user.')
      }
    },

    async ensureGroupsInitialized(accessToken: string) {
      if (!this.groupsNeedRefresh) return

      // Route middleware and the mounted store initializer can run together on refresh.
      groupInitializationPromise ||= this.initializeGroups(accessToken, true)
        .finally(() => {
          groupInitializationPromise = null
        })
      await groupInitializationPromise
    },

    async initializeAWSRoles(enclaveData: Record<string, AWSEnclaveData>, force: boolean = false) {
      if (!import.meta.client) return // only run on client-side
      if (!this.awsRolesNeedRefresh && !force) {
        logger.info('Using cached user AWS roles data.')
        return
      }

      if (!this.roleGroups || !this.distributionGroups) {
        logger.error('Ensure that groups have been initialized before initializing AWS roles.')
        return
      }

      logger.info('Initializing user AWS roles')

      // Clear any existing AWS roles
      this.awsRoles = {}

      // Iterate over role groups and build AWS role info
      for (const key in this.roleGroups) {
        const { accountId, role, } = this.roleGroups[key]!

        const specificEnclaveData: AWSEnclaveData | undefined = enclaveData[accountId] ?? Object.values(enclaveData).find(data => data.awsGovCloudAccountID === accountId)
        if (!specificEnclaveData) { // If the account no longer exists then skip it
          return
        }

        const standardAccountId = specificEnclaveData.accountId ?? specificEnclaveData?.awsStandardAccountID ?? ''
        const govCloudAccountId = specificEnclaveData.awsGovCloudAccountID ?? ''
        
        // If this account doesn’t exist yet in awsRoles, initialize it
        if (!this.awsRoles[accountId]) {
          this.awsRoles[accountId] = {
            roles: [],
            accountName: specificEnclaveData.accountName ?? 'Unknown Account',
            accountStatus: specificEnclaveData.accountStatus ?? 'Unknown',
            isGovCloud: specificEnclaveData.awsGovCloudAccountID !== '',
            standardAccountId,
            govCloudAccountId,
            distributionGroups: []
          }
        }

        // Add the role (avoid duplicates)
        if (!this.awsRoles[accountId].roles.includes(role)) {
          this.awsRoles[accountId].roles.push(role)
        }
      }

      // Attach distribution groups to matching accounts
      for (const key in this.distributionGroups) {
        const { groupName } = this.distributionGroups[key]!

        for (const accountId in this.awsRoles) {
          if (groupName === enclaveData[accountId]?.accountEmail) {
            const role = this.awsRoles[accountId]
            role?.distributionGroups.push(groupName)
          }
        }
      }

      // Build cached account ID lists for quick filtering
      const accountIdsSet = new Set<string>()
      const adminAccountIdsSet = new Set<string>()

      for (const accountId in this.awsRoles) {
        const roleInfo = this.awsRoles[accountId]

        // Use standard (commercial) account ID as the primary identifier
        const primaryAccountId = roleInfo.standardAccountId || accountId
        accountIdsSet.add(primaryAccountId)

        // Check if user has admin roles
        const hasAdminRole = roleInfo.roles.some(role =>
          role.toLowerCase().includes('admin') ||
          role.toLowerCase().includes('poweruser')
        )

        if (hasAdminRole) {
          adminAccountIdsSet.add(primaryAccountId)
        }
      }

      this.myAccountIds = Array.from(accountIdsSet)
      this.myAdminAccountIds = Array.from(adminAccountIdsSet)

      logger.info(`Cached ${this.myAccountIds.length} total accounts and ${this.myAdminAccountIds.length} admin accounts`)

      if (this.awsRoles) {
        this.awsRolesLastFetch = Date.now()
      } else {
        logger.warn('Failed to fetch any AWS roles for current user.')
      }
    },

    clear() {
      this.roleGroups = {}
      this.distributionGroups = {}
      this.awsRoles = {}
      this.allEntraGroups = []
      this.groupsLastFetch = null
      this.awsRolesLastFetch = null
      logger.info('User group stored cleared')
    }
  },

  persist: {
    key: 'ghost-user-groups',
    storage: piniaPluginPersistedstate.localStorage()
  }
})
