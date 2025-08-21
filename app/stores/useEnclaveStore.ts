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
        const data = await response.json()
        const structuredData = Object.fromEntries(
          data.data.map((account: AWSEnclaveData) => [account.accountId, account])
        )
        this.enclaves = structuredData
        console.log(`Collected information for ${Object.keys(structuredData).length} enclaves.`)
      }
    },

    clear() {
      this.enclaves = []
    }
  }
})
