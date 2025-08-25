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
  roleGroups: Record<string, RoleGroupStructure>,
  distributionGroups: Record<string, DistributionGroupStructure>,
  awsRoles: Record<string, AwsRoleInfo>
}

// ----- Store -----

export const useUserGroupStore = defineStore('userGroups', {
  state: (): UserGroupState => ({
    roleGroups: {},
    distributionGroups: {},
    awsRoles: {}
  }),

  getters: {

  },

  actions: {
    async initializeGroups(accessToken: string) {
      if (!import.meta.client) return // only run on client-side (TODO: double check this does not run on server)

      const { fetchGroups } = useGraphApi()
      const data = await fetchGroups(accessToken)
      this.roleGroups = data.awsRoleGroups
      this.distributionGroups = data.distributionGroups
    },

    async initializeAWSRoles(enclaveData: Record<string, AWSEnclaveData>) {
      if (!import.meta.client) return // only run on client-side

      if (!this.roleGroups || !this.distributionGroups) {
        console.error('Ensure that groups have been initialized before initializing AWS roles.')
        return
      }

      // Clear any existing AWS roles
      this.awsRoles = {}

      // TODO break into helper functions

      // Iterate over role groups and build AWS role info
      for (const key in this.roleGroups) {
        const { accountId, role, } = this.roleGroups[key]!

        const specificEnclaveData: AWSEnclaveData | undefined = enclaveData[accountId]

        const standardAccountId = specificEnclaveData?.accountId ?? specificEnclaveData?.awsStandardAccountID ?? ''
        const govCloudAccountId = specificEnclaveData?.awsGovCloudAccountID ?? ''
        
        // If this account doesn’t exist yet in awsRoles, initialize it
        if (!this.awsRoles[accountId]) {
          this.awsRoles[accountId] = {
            roles: [],
            accountName: specificEnclaveData?.accountName ?? 'Unknown Account',
            accountStatus: specificEnclaveData?.accountStatus ?? 'Unknown',
            isGovCloud: specificEnclaveData?.awsGovCloudAccountID !== '',
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
  }
})
