export interface AccountCostTagConfig {
  importantTags: string[]
  defaultGroupByTag?: string
  tagDescriptions?: Record<string, string>
  tagValueAliases?: Record<string, string>  // key format: "TagKey::tagValue" → "Friendly Name"
  updatedBy?: string
  updatedAt?: string
}

export interface TagCoverageAccount {
  accountId: string
  accountName?: string
  taggedCost: number
  untaggedCost: number
  coveragePercent: number
  estimatedProformaTaggedCost?: number
  estimatedProformaUntaggedCost?: number
}

export interface TagValueAccountCost {
  accountId: string
  accountName?: string
  billableCost: number
  estimatedProformaCost?: number
}

export interface TagValueCost {
  groupKey: string
  tagValue: string
  isUntagged: boolean
  billableCost: number
  estimatedProformaCost?: number
  accounts: TagValueAccountCost[]
}

export interface TagProformaEstimation {
  requested: boolean
  available: boolean
  method: 'account-weighted-billable-distribution'
  unavailableAccountIds: string[]
}

export interface TagCoverageData {
  tagKey: string
  accounts: TagCoverageAccount[]
  totalTaggedCost: number
  totalUntaggedCost: number
  overallCoverage: number
  estimatedProformaTaggedCost?: number
  estimatedProformaUntaggedCost?: number
  values?: TagValueCost[]
  proformaEstimation?: TagProformaEstimation
}
