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
  },

  actions: {
    async initializeGroups(accessToken: string, force: boolean = false) {
      if (!import.meta.client) return // only run on client-side
      if (!this.groupsNeedRefresh && !force) return

      this.groupsLastFetch = Date.now()

      const { fetchGroups } = useGraphApi()
      const data = await fetchGroups(accessToken)
      this.roleGroups = data.awsRoleGroups
      this.distributionGroups = data.distributionGroups
    },

    async initializeAWSRoles(enclaveData: Record<string, AWSEnclaveData>, force: boolean = false) {
      if (!import.meta.client) return // only run on client-side
      if (!this.awsRolesNeedRefresh && !force) return

      if (!this.roleGroups || !this.distributionGroups) {
        console.error('Ensure that groups have been initialized before initializing AWS roles.')
        return
      }

      this.awsRolesLastFetch = Date.now()

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
    },

    clear() {
      this.roleGroups = {}
      this.distributionGroups = {}
      this.awsRoles = {}
    }
  },

  persist: true
})
