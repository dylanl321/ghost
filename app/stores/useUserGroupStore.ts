// Type definitions
interface AwsRoleInfo {
  roles: string[]
  accountName: string
  accountStatus: string
  isGovCloud: boolean
  standardAccountId: string
  govCloudAccountId: string
  distributionGroups: string[]
}

export interface UserGroupState {
  initialized: boolean
  groups: string[]
  awsRoles: Record<string, AwsRoleInfo>
}

export const useUserGroupStore = defineStore('userGroups', {
  state: (): UserGroupState => ({
    initialized: false,
    groups: [],
    awsRoles: {}
  }),

  getters: {

  },

  actions: {
    async initialize() {
      // if (!this.initialized) {
      //   console.log('Organization Accounts Store already initialized. Using cached data.');
      //   return;
      // }

      if (import.meta.client) { // only run on client-side
        const { currentUser } = useOidcAuth();

        // Call useGraphAPI to get group display names and whatnot
        // so next I need to make changes to graph api to get the data i want
      }
    },

    clear() {
      this.initialized = false;
      this.groups = [];
      this.awsRoles = {};
    }
  }
});

// Might not even need to check if its already initialized, there is no API calls being run here

// does this ever need to be refreshed? or do we just set this when we login? I guess the question is, is there ever a point elsewhere where we login again and
// need to reset this data. I think on the profile you can do a refresh of your permissions which will reset this. But we can just add the logic there
// when that happens I think. It doesn't actually make sense to refresh this after a set amount of time.

// We should only need to initialize this in the loading screen and if we refresh the user's credentials
