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
}

const GOV_IDENTIFIER = ' | gov'
const COMM_IDENTIFIER = ' | comm'

// ----- Store -----

// Time until the data needs to be refreshed
// This only gets checked when the user first "loads" the website (e.g. first visit, hard refresh, new tab, etc.). This is done via the "init-check.client.ts" custom plugin.
const timeToLiveSeconds = 60 * 60 * 24

export const useUserGroupStore = defineStore('userGroups', {
  state: (): UserGroupState => ({
    groupsLastFetch: null,
    awsRolesLastFetch: null,
    roleGroups: {},
    distributionGroups: {},
    awsRoles: {}
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
        console.error('Initialize awsRoles before accessing myEnclaves')
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
    async initializeGroups(accessToken: string, force: boolean = false) {
      if (!import.meta.client) return // only run on client-side
      if (!this.groupsNeedRefresh && !force) {
        console.log('Using cached user group data.')
        return
      }

      console.log('Initializing user groups')

      const { fetchGroups } = useGraphApi()
      const data = await fetchGroups(accessToken)
      this.roleGroups = data.awsRoleGroups
      this.distributionGroups = data.distributionGroups

      if (this.roleGroups && this.distributionGroups) {
        this.groupsLastFetch = Date.now()
      } else {
        console.error('Missing groups or roles for user.')
      }
    },

    async initializeAWSRoles(enclaveData: Record<string, AWSEnclaveData>, force: boolean = false) {
      if (!import.meta.client) return // only run on client-side
      if (!this.awsRolesNeedRefresh && !force) {
        console.log('Using cached user AWS roles data.')
        return
      }

      if (!this.roleGroups || !this.distributionGroups) {
        console.error('Ensure that groups have been initialized before initializing AWS roles.')
        return
      }

      console.log('Initializing user AWS roles')

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

      if (this.awsRoles) {
        this.awsRolesLastFetch = Date.now()
      } else {
        console.warn('Failed to fetch any AWS roles for current user.')
      }
    },

    clear() {
      this.roleGroups = {}
      this.distributionGroups = {}
      this.awsRoles = {}
      this.groupsLastFetch = null
      this.awsRolesLastFetch = null
      console.log('User group stored cleared')
    }
  },

  persist: true
})
