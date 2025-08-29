export interface EnclaveState {
  lastFetch: number | null
  enclaves: Record<string, AWSEnclaveData>
}

// const timeToLiveSeconds = 60 * 60 * 24
const timeToLiveSeconds = 600

export const useEnclaveStore = defineStore('enclaveStore', {
  state: (): EnclaveState => ({
    lastFetch: null,
    enclaves: {},
  }),

  getters: {
    needsRefresh: (state) => {
      if (!state.lastFetch) return true
      return Date.now() - state.lastFetch > timeToLiveSeconds
    }
  },

  actions: {
    async initialize(force: boolean = false) {
      if (!import.meta.client) return // only run on client-side
      if (!this.needsRefresh && !force) return

      this.lastFetch = Date.now()

      const response = await fetch('/api/accounts/list')
      const json = await response.json()

      const accounts: AWSEnclaveData[] = json.data

      const dict: Record<string, AWSEnclaveData> = {}
      for (const acct of accounts) {
        const id = acct.accountId || acct.awsStandardAccountID
        if (!id) continue // skip if neither exists

        /* There is a special case where some accounts were not added to Appian, so to keep track of them we put them in DynamoDB and gave them a 9xxx request ID.
        Later, some of these accounts were then added into Appian (e.g. 705066229423) and their new request ID got synced to dynamoDB. These accounts have two
        records in DynamoDB and will thus return two results from the API. We want to handle these cases by getting the version that has been added to Appian. To do this,
        we check for a `true_requestID` property in the object. */
        if (id in dict) {
          if (dict[id]!.true_requestID) {
            continue // If it has 'true_requestID' then we want to use that one
          }
        }
        dict[id] = acct
      }

      this.enclaves = dict
      console.log(`Collected information for ${Object.keys(dict).length} enclaves.`)
    },

    clear() {
      this.enclaves = {}
    }
  }
})
