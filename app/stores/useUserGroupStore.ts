// Type definitions
// interface AwsRoleInfo {
//   roles: string[]
//   accountName: string
//   accountStatus: string
//   isGovCloud: boolean
//   standardAccountId: string
//   govCloudAccountId: string
//   distributionGroups: string[]
// }

export interface UserGroupState {
  roleGroups: object,
  distributionGroups: object,
}

export const useUserGroupStore = defineStore('userGroups', {
  state: (): UserGroupState => ({
    roleGroups: {},
    distributionGroups: {},
  }),

  getters: {

  },

  actions: {
    async initialize(accessToken: string) {
      if (import.meta.client) { // only run on client-side
        const { fetchGroups } = useGraphApi()
        const data = await fetchGroups(accessToken)
        this.roleGroups = data.awsRoleGroups
        this.distributionGroups = data.distributionGroups
      }
    },

    clear() {
      this.roleGroups = []
      this.distributionGroups = []
    }
  }
})
