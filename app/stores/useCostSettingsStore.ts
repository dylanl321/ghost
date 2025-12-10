import { defineStore } from 'pinia'
import type { CostFilterSettings } from '~/composables/useCostFilters'

export const useCostSettingsStore = defineStore('costSettings', {
  state: (): CostFilterSettings => ({
    hideSavingsPlans: false,
    hideEnterpriseSupport: false,
    hideReservedInstances: false,
    hideDevAccounts: true,
    minCostThreshold: 0,
    currencyFormat: 'abbreviated',
    showDecommissioned: true
  }),

  actions: {
    updateSettings(newSettings: Partial<CostFilterSettings>) {
      Object.assign(this, newSettings)
    },

    resetToDefaults() {
      this.hideSavingsPlans = false
      this.hideEnterpriseSupport = false
      this.hideReservedInstances = false
      this.hideDevAccounts = true
      this.minCostThreshold = 0
      this.currencyFormat = 'abbreviated'
      this.showDecommissioned = true
    },

    toggleFilter(filterKey: keyof Pick<CostFilterSettings, 'hideSavingsPlans' | 'hideEnterpriseSupport' | 'hideReservedInstances' | 'hideDevAccounts' | 'showDecommissioned'>) {
      this[filterKey] = !this[filterKey]
    }
  },

  persist: {
    key: 'ghost-cost-settings'
  }
})