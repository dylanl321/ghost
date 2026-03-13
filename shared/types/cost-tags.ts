export interface AccountCostTagConfig {
  importantTags: string[]
  defaultGroupByTag?: string
  tagDescriptions?: Record<string, string>
  updatedBy?: string
  updatedAt?: string
}

export interface TagCoverageAccount {
  accountId: string
  accountName?: string
  taggedCost: number
  untaggedCost: number
  coveragePercent: number
}

export interface TagCoverageData {
  tagKey: string
  accounts: TagCoverageAccount[]
  totalTaggedCost: number
  totalUntaggedCost: number
  overallCoverage: number
}
