export interface EnclaveState {
  enclaves: Record<number, AWSEnclaveData>
}

export const useEnclaveStore = defineStore('enclaveStore', {
  state: (): EnclaveState => ({
    enclaves: {},
  }),

  getters: {

  },

  actions: {
    async initialize() {
      if (import.meta.client) { // only run on client-side
        const response = await fetch('/api/accounts/list')
        const json = await response.json()

        const accounts: AWSEnclaveData[] = json.data

        const dict: Record<string, AWSEnclaveData> = {}
        for (const acct of accounts) {
          const id = acct.accountId || acct.awsStandardAccountID
          if (!id) continue // skip if neither exists
          dict[id] = acct
        }

        this.enclaves = dict
        console.log(`Collected information for ${Object.keys(dict).length} enclaves.`)
      }
    },

    clear() {
      this.enclaves = []
    }
  }
})
