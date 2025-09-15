import { computed } from 'vue'
import type { Ref } from 'vue'

export type Scenario = 'all-accounts' | 'single-account' | 'few-accounts' | 'lob-group' | 'department-group'

export const useCostScenario = (args: {
  selectedAccounts: Ref<string[]>
  activeTab: Ref<string>
}) => {
  const { selectedAccounts, activeTab } = args

  const scenario = computed<Scenario>(() => {
    const count = selectedAccounts.value.length
    const tab = activeTab.value
    
    let detectedScenario: Scenario
    
    // Priority order: tab context first, then selection count
    if (tab === 'lob') {
      detectedScenario = 'lob-group'
    } else if (tab === 'dept') {
      detectedScenario = 'department-group'
    } else if (count === 0) {
      detectedScenario = 'all-accounts'
    } else if (count === 1) {
      detectedScenario = 'single-account'
    } else if (count <= 10) {
      detectedScenario = 'few-accounts'
    } else {
      detectedScenario = 'all-accounts' // fallback for large selections
    }
    
    console.log('Scenario detection:', {
      activeTab: tab,
      selectedCount: count,
      selectedAccounts: selectedAccounts.value.slice(0, 3), // Show first 3 for debug
      scenario: detectedScenario
    })
    
    return detectedScenario
  })

  return { scenario }
}


