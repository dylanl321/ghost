import type { CostTagCreatorType } from '../utils/cost-tag-identities'

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
  positiveTaggedCost?: number
  positiveUntaggedCost?: number
  estimatedProformaTaggedCost?: number
  estimatedProformaUntaggedCost?: number
}

export interface TagValueAccountCost {
  accountId: string
  accountName?: string
  billableCost: number
  estimatedProformaCost?: number
  rawValues: string[]
}

export interface TagValueCost {
  groupKey: string
  tagValue: string
  displayName: string
  isUntagged: boolean
  isPerson: boolean
  creatorType?: CostTagCreatorType
  rawValues: string[]
  billableCost: number
  estimatedProformaCost?: number
  accountCount?: number
  accounts: TagValueAccountCost[]
}

export interface TagProformaEstimation {
  requested: boolean
  available: boolean
  method: 'account-time-bucket-weighted-billable-distribution'
  unavailableAccountIds: string[]
}

export interface TagCoverageData {
  tagKey: string
  costMetric: 'UnblendedCost' | 'NetUnblendedCost'
  accounts: TagCoverageAccount[]
  totalTaggedCost: number
  totalUntaggedCost: number
  signedTotalCost: number
  positiveTaggedCost: number
  positiveUntaggedCost: number
  overallCoverage: number
  estimatedProformaTaggedCost?: number
  estimatedProformaUntaggedCost?: number
  values?: TagValueCost[]
  proformaEstimation?: TagProformaEstimation
}
