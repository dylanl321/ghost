import { computed, type ComputedRef } from 'vue'
import type { NormalizedDataset } from '~/types/costs'
import type { TableColumn } from '~/components/shared/DataTable.vue'
import type { DataMode } from '#shared/types/scheduled-reports'
import { getAccountsFromAnalysis, unwrapCostData } from '~/utils/cost-data-unwrap'

const logger = createLogger('TableRegistry')

// Account metadata type (simplified for LOB/Department lookup)
export interface AccountMetadata {
  accountId?: string
  awsStandardAccountID?: string
  name?: string
  linesOfBusiness?: string
  lineOfBusiness?: string
  departmentNumber?: string
  department?: string
}

// Table definition type
export interface TableDefinition {
  id: string
  title: string
  description?: string
  context: 'smart-analysis' | 'budget-health' | 'both' // Where this table should appear
  layout?: {
    width: 'full' | 'half' | 'third' // Grid width
    priority: number // Lower number = higher priority (appears earlier)
  }
  columns: TableColumn[]
  extractor: (dataset: NormalizedDataset, dataMode?: DataMode, accountsList?: AccountMetadata[], selectedAccounts?: string[]) => any[]
  config?: {
    searchable?: boolean
    sortable?: boolean
    paginated?: boolean
    columnToggle?: boolean
    exportCsv?: boolean
    exportPdf?: boolean
    emptyMessage?: string
  }
}

// Helper: Get status text
const getStatusText = (utilization: number): string => {
  if (utilization > 120) return 'Critical'
  if (utilization > 100) return 'Over Budget'
  if (utilization > 90) return 'Warning'
  if (utilization < 50) return 'Underutilized'
  return 'Healthy'
}

// Helper: Extract analysis data using shared unwrap utility
// Returns the analysis source object respecting the data mode (billable vs proforma)
const extractAnalysisData = (dataset: NormalizedDataset, dataMode: DataMode = 'billable') => {
  const actualData = unwrapCostData(dataset, 'analysis')
  if (!actualData) return null

  // Handle proforma mode - data is nested under proforma property
  const analysisSource = dataMode === 'proforma' && actualData?.proforma
    ? actualData.proforma
    : actualData

  return analysisSource
}

// ============================================================================
// TABLE DEFINITIONS
// ============================================================================

// Table: Budget Overage Accounts (All accounts over budget)
const budgetOverageAccounts: TableDefinition = {
  id: 'budgetOverageAccounts',
  title: 'Accounts Over Budget',
  description: 'All accounts currently exceeding their budgeted amount, sorted by risk score',
  context: 'budget-health',
  layout: { width: 'full', priority: 2 },
  columns: [
    { key: 'accountName', label: 'Account Name', default: true },
    { key: 'accountId', label: 'Account ID', default: false },
    {
      key: 'actualCost',
      label: 'Actual Cost',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'budgetedCost',
      label: 'Budget',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'riskScore',
      label: 'Risk Score',
      align: 'right',
      format: (v: number) => v.toFixed(0),
      default: true,
      helpLink: '/support/docs?topic=budget-risk-scoring',
      helpTooltip: 'Learn how Risk Scores are calculated'
    },
    {
      key: 'riskLevel',
      label: 'Risk Level',
      align: 'center',
      default: true,
      helpLink: '/support/docs?topic=budget-risk-scoring',
      helpTooltip: 'Learn about Risk Levels'
    },
    {
      key: 'dollarOver',
      label: '$ Over Budget',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      class: 'text-red-400 font-semibold',
      default: true
    },
    {
      key: 'percentOver',
      label: '% Over Budget',
      align: 'right',
      format: (v: number) => formatPercent(v),
      class: 'text-red-400 font-semibold',
      default: false
    },
    {
      key: 'utilization',
      label: 'Utilization',
      align: 'right',
      format: (v: number) => formatPercent(v),
      default: false
    },
    {
      key: 'status',
      label: 'Status',
      align: 'center',
      default: false
    }
  ],
  extractor: (dataset: NormalizedDataset, dataMode: DataMode = 'billable') => {
    // Extract from analysis.budgetAnalysis.byAccount
    const analysisSource = extractAnalysisData(dataset, dataMode)

    if (!analysisSource?.budgetAnalysis?.byAccount) {
      return []
    }

    const accounts = analysisSource.budgetAnalysis.byAccount
      .filter((acc: any) => acc.actualCost > acc.budgetedCost && acc.budgetedCost > 0)
      .map((acc: any) => ({
        accountName: acc.accountName || acc.accountId,
        accountId: acc.accountId,
        actualCost: acc.actualCost,
        budgetedCost: acc.budgetedCost,
        dollarOver: acc.actualCost - acc.budgetedCost,
        percentOver: ((acc.actualCost - acc.budgetedCost) / acc.budgetedCost) * 100,
        utilization: (acc.actualCost / acc.budgetedCost) * 100,
        status: getStatusText((acc.actualCost / acc.budgetedCost) * 100),
        riskScore: 0,
        riskLevel: '',
        riskColor: ''
      }))

    // Calculate risk scores across all accounts
    assignRiskScores(
      accounts,
      (a: any) => a.percentOver,
      (a: any) => a.dollarOver,
      (a: any, result) => {
        a.riskScore = result.riskScore
        a.riskLevel = result.riskLevel
        a.riskColor = result.riskColor
      }
    )

    if (accounts.length > 0) {
      // Sort by risk score descending
      accounts.sort((a: any, b: any) => b.riskScore - a.riskScore)
    }

    return accounts
  },
  config: {
    searchable: true,
    sortable: true,
    paginated: true,
    columnToggle: true,
    exportCsv: true,
    emptyMessage: 'No accounts are over budget'
  }
}

// Table: Severe Budget Overages (>20% over budget)
const severeOverageAccounts: TableDefinition = {
  id: 'severeOverageAccounts',
  title: 'Severe Budget Overages',
  description: 'Accounts exceeding budget by more than 20%, sorted by risk score',
  context: 'budget-health',
  layout: { width: 'full', priority: 1 },
  columns: [
    { key: 'accountName', label: 'Account Name', default: true },
    { key: 'accountId', label: 'Account ID', default: false },
    {
      key: 'actualCost',
      label: 'Actual Cost',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'budgetedCost',
      label: 'Budget',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'riskScore',
      label: 'Risk Score',
      align: 'right',
      format: (v: number) => v.toFixed(0),
      default: true,
      helpLink: '/support/docs?topic=budget-risk-scoring',
      helpTooltip: 'Learn how Risk Scores are calculated'
    },
    {
      key: 'riskLevel',
      label: 'Risk Level',
      align: 'center',
      default: true,
      helpLink: '/support/docs?topic=budget-risk-scoring',
      helpTooltip: 'Learn about Risk Levels'
    },
    {
      key: 'dollarOver',
      label: '$ Over Budget',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      class: 'text-red-400 font-semibold',
      default: true
    },
    {
      key: 'percentOver',
      label: '% Over Budget',
      align: 'right',
      format: (v: number) => formatPercent(v),
      class: 'text-red-400 font-semibold',
      default: false
    }
  ],
  extractor: (dataset: NormalizedDataset, dataMode: DataMode = 'billable') => {
    const analysisSource = extractAnalysisData(dataset, dataMode)

    if (!analysisSource?.budgetAnalysis?.byAccount) {
      return []
    }

    const accounts = analysisSource.budgetAnalysis.byAccount
      .filter((acc: any) => {
        if (acc.budgetedCost === 0) return false
        const percentOver = ((acc.actualCost - acc.budgetedCost) / acc.budgetedCost) * 100
        return percentOver > 20
      })
      .map((acc: any) => ({
        accountName: acc.accountName || acc.accountId,
        accountId: acc.accountId,
        actualCost: acc.actualCost,
        budgetedCost: acc.budgetedCost,
        dollarOver: acc.actualCost - acc.budgetedCost,
        percentOver: ((acc.actualCost - acc.budgetedCost) / acc.budgetedCost) * 100,
        riskScore: 0,
        riskLevel: '',
        riskColor: ''
      }))

    // Calculate risk scores across all accounts
    assignRiskScores(
      accounts,
      (a: any) => a.percentOver,
      (a: any) => a.dollarOver,
      (a: any, result) => {
        a.riskScore = result.riskScore
        a.riskLevel = result.riskLevel
        a.riskColor = result.riskColor
      }
    )

    if (accounts.length > 0) {
      // Sort by risk score descending
      accounts.sort((a: any, b: any) => b.riskScore - a.riskScore)
    }

    return accounts
  },
  config: {
    searchable: true,
    sortable: true,
    paginated: true,
    columnToggle: true,
    exportCsv: true,
    emptyMessage: 'No accounts with severe overages'
  }
}

// Table: Underutilized Budgets (<50% utilization)
const underutilizedBudgets: TableDefinition = {
  id: 'underutilizedBudgets',
  title: 'Underutilized Budgets',
  description: 'Accounts using less than 50% of their allocated budget',
  context: 'budget-health',
  layout: { width: 'full', priority: 3 },
  columns: [
    { key: 'accountName', label: 'Account Name', default: true },
    { key: 'accountId', label: 'Account ID', default: true },
    {
      key: 'actualCost',
      label: 'Actual Cost',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'budgetedCost',
      label: 'Budget',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'unutilized',
      label: 'Unutilized',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      class: 'text-blue-400',
      default: true
    },
    {
      key: 'utilization',
      label: 'Utilization',
      align: 'right',
      format: (v: number) => formatPercent(v),
      class: 'text-blue-400',
      default: true
    }
  ],
  extractor: (dataset: NormalizedDataset, dataMode: DataMode = 'billable') => {
    const analysisSource = extractAnalysisData(dataset, dataMode)

    if (!analysisSource?.budgetAnalysis?.byAccount) {
      return []
    }

    const accounts = analysisSource.budgetAnalysis.byAccount
      .filter((acc: any) => {
        if (acc.budgetedCost === 0) return false
        const utilization = (acc.actualCost / acc.budgetedCost) * 100
        return utilization < 50
      })
      .map((acc: any) => ({
        accountName: acc.accountName || acc.accountId,
        accountId: acc.accountId,
        actualCost: acc.actualCost,
        budgetedCost: acc.budgetedCost,
        unutilized: acc.budgetedCost - acc.actualCost,
        utilization: (acc.actualCost / acc.budgetedCost) * 100
      }))
      .sort((a: any, b: any) => b.unutilized - a.unutilized) // Sort by unutilized amount desc

    return accounts
  },
  config: {
    searchable: true,
    sortable: true,
    paginated: true,
    columnToggle: true,
    exportCsv: true,
    emptyMessage: 'No underutilized budgets found'
  }
}

// Table: Budget Health by Line of Business
const budgetHealthByLOB: TableDefinition = {
  id: 'budgetHealthByLOB',
  title: 'Budget Health by Line of Business',
  description: 'Budget performance grouped by Line of Business',
  context: 'budget-health',
  layout: { width: 'full', priority: 4 },
  columns: [
    { key: 'lob', label: 'Line of Business', default: true },
    {
      key: 'accountCount',
      label: 'Accounts',
      align: 'center',
      default: true
    },
    {
      key: 'totalBudget',
      label: 'Total Budget',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'actualCost',
      label: 'Actual Cost',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'variance',
      label: 'Variance',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'utilization',
      label: 'Utilization',
      align: 'right',
      format: (v: number) => formatPercent(v),
      default: true
    },
    {
      key: 'status',
      label: 'Status',
      align: 'center',
      default: true
    }
  ],
  extractor: (dataset: NormalizedDataset, dataMode: DataMode = 'billable', accountsList?: AccountMetadata[]) => {
    const analysisSource = extractAnalysisData(dataset, dataMode)

    if (!analysisSource?.budgetAnalysis?.byAccount) {
      return []
    }

    // Create account lookup map for LOB enrichment
    const accountLookup = new Map<string, AccountMetadata>()
    if (accountsList) {
      accountsList.forEach(acc => {
        if (acc.accountId) accountLookup.set(acc.accountId, acc)
        if (acc.awsStandardAccountID) accountLookup.set(acc.awsStandardAccountID, acc)
      })
    }

    // Aggregate by LOB
    const lobGroups = new Map<string, {
      lob: string
      accounts: any[]
      totalBudget: number
      actualCost: number
    }>()

    analysisSource.budgetAnalysis.byAccount.forEach((acc: any) => {
      // Look up account metadata for LOB
      const metadata = accountLookup.get(acc.accountId)
      const lob = metadata?.linesOfBusiness || metadata?.lineOfBusiness || 'Unknown'

      if (!lobGroups.has(lob)) {
        lobGroups.set(lob, {
          lob,
          accounts: [],
          totalBudget: 0,
          actualCost: 0
        })
      }

      const group = lobGroups.get(lob)!
      group.accounts.push(acc)
      group.totalBudget += acc.budgetedCost || 0
      group.actualCost += acc.actualCost || 0
    })

    // Convert to array and calculate additional metrics
    const lobs = Array.from(lobGroups.values()).map(group => ({
      lob: group.lob,
      accountCount: group.accounts.length,
      totalBudget: group.totalBudget,
      actualCost: group.actualCost,
      variance: group.actualCost - group.totalBudget,
      utilization: group.totalBudget > 0 ? (group.actualCost / group.totalBudget) * 100 : 0,
      status: group.totalBudget > 0 ? getStatusText((group.actualCost / group.totalBudget) * 100) : 'N/A'
    }))
    .sort((a: any, b: any) => b.actualCost - a.actualCost) // Sort by actual cost desc

    return lobs
  },
  config: {
    searchable: true,
    sortable: true,
    paginated: false, // Usually not many LOBs
    columnToggle: true,
    exportCsv: true,
    emptyMessage: 'No LOB data available'
  }
}

// Table: Budget Health by Department
const budgetHealthByDepartment: TableDefinition = {
  id: 'budgetHealthByDepartment',
  title: 'Budget Health by Department',
  description: 'Budget performance grouped by Department',
  context: 'budget-health',
  layout: { width: 'full', priority: 5 },
  columns: [
    { key: 'department', label: 'Department', default: true },
    {
      key: 'accountCount',
      label: 'Accounts',
      align: 'center',
      default: true
    },
    {
      key: 'totalBudget',
      label: 'Total Budget',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'actualCost',
      label: 'Actual Cost',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'variance',
      label: 'Variance',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'utilization',
      label: 'Utilization',
      align: 'right',
      format: (v: number) => formatPercent(v),
      default: true
    },
    {
      key: 'status',
      label: 'Status',
      align: 'center',
      default: true
    }
  ],
  extractor: (dataset: NormalizedDataset, dataMode: DataMode = 'billable', accountsList?: AccountMetadata[]) => {
    const analysisSource = extractAnalysisData(dataset, dataMode)

    if (!analysisSource?.budgetAnalysis?.byAccount) {
      return []
    }

    // Create account lookup map for Department enrichment
    const accountLookup = new Map<string, AccountMetadata>()
    if (accountsList) {
      accountsList.forEach(acc => {
        if (acc.accountId) accountLookup.set(acc.accountId, acc)
        if (acc.awsStandardAccountID) accountLookup.set(acc.awsStandardAccountID, acc)
      })
    }

    // Aggregate by Department
    const deptGroups = new Map<string, {
      department: string
      accounts: any[]
      totalBudget: number
      actualCost: number
    }>()

    analysisSource.budgetAnalysis.byAccount.forEach((acc: any) => {
      // Look up account metadata for Department
      const metadata = accountLookup.get(acc.accountId)
      const dept = metadata?.departmentNumber || metadata?.department || 'Unknown'

      if (!deptGroups.has(dept)) {
        deptGroups.set(dept, {
          department: dept,
          accounts: [],
          totalBudget: 0,
          actualCost: 0
        })
      }

      const group = deptGroups.get(dept)!
      group.accounts.push(acc)
      group.totalBudget += acc.budgetedCost || 0
      group.actualCost += acc.actualCost || 0
    })

    // Convert to array and calculate additional metrics
    const departments = Array.from(deptGroups.values()).map(group => ({
      department: group.department,
      accountCount: group.accounts.length,
      totalBudget: group.totalBudget,
      actualCost: group.actualCost,
      variance: group.actualCost - group.totalBudget,
      utilization: group.totalBudget > 0 ? (group.actualCost / group.totalBudget) * 100 : 0,
      status: group.totalBudget > 0 ? getStatusText((group.actualCost / group.totalBudget) * 100) : 'N/A'
    }))
    .sort((a: any, b: any) => b.actualCost - a.actualCost) // Sort by actual cost desc

    return departments
  },
  config: {
    searchable: true,
    sortable: true,
    paginated: false, // Usually not many departments
    columnToggle: true,
    exportCsv: true,
    emptyMessage: 'No department data available'
  }
}

// Table: Budget by Project (individual accounts with project info)
const budgetByProject: TableDefinition = {
  id: 'budgetByProject',
  title: 'Budget by Project',
  description: 'Individual accounts with project information and budget comparison',
  context: 'budget-health',
  layout: { width: 'full', priority: 3.5 },
  columns: [
    { key: 'projectName', label: 'Project', default: true },
    { key: 'accountName', label: 'Account Name', default: true },
    { key: 'accountId', label: 'Account ID', default: false },
    {
      key: 'actualCost',
      label: 'Actual Cost',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'budgetedCost',
      label: 'GDMS Forecast',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'variance',
      label: 'Variance',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'utilization',
      label: 'Utilization',
      align: 'right',
      format: (v: number) => formatPercent(v),
      default: true
    },
    {
      key: 'status',
      label: 'Status',
      align: 'center',
      default: true
    }
  ],
  extractor: (dataset: NormalizedDataset, dataMode: DataMode = 'billable', accountsList?: AccountMetadata[]) => {
    const analysisSource = extractAnalysisData(dataset, dataMode)

    if (!analysisSource?.budgetAnalysis?.byAccount) {
      return []
    }

    // Create account lookup map for project name enrichment
    const accountLookup = new Map<string, any>()
    if (accountsList) {
      accountsList.forEach(acc => {
        if (acc.accountId) accountLookup.set(acc.accountId, acc)
        if (acc.awsStandardAccountID) accountLookup.set(acc.awsStandardAccountID, acc)
      })
    }

    // Build accounts list with project info
    const accounts = analysisSource.budgetAnalysis.byAccount
      .map((acc: any) => {
        const metadata = accountLookup.get(acc.accountId) || {}
        const projectName = (metadata as any).projectName || 'No Project'
        const utilization = acc.budgetedCost > 0 ? (acc.actualCost / acc.budgetedCost) * 100 : 0

        return {
          projectName,
          accountName: acc.accountName || acc.accountId,
          accountId: acc.accountId,
          actualCost: acc.actualCost || 0,
          budgetedCost: acc.budgetedCost || 0,
          variance: (acc.actualCost || 0) - (acc.budgetedCost || 0),
          utilization,
          status: acc.budgetedCost > 0 ? getStatusText(utilization) : 'No Budget'
        }
      })
      // Sort by project name, then by actual cost descending
      .sort((a: any, b: any) => {
        if (a.projectName !== b.projectName) {
          return a.projectName.localeCompare(b.projectName)
        }
        return b.actualCost - a.actualCost
      })

    return accounts
  },
  config: {
    searchable: true,
    sortable: true,
    paginated: true,
    columnToggle: true,
    exportCsv: true,
    emptyMessage: 'No account data available'
  }
}

// Table: Organization Budget Summary
const organizationBudgetSummary: TableDefinition = {
  id: 'organizationBudgetSummary',
  title: 'Organization Budget Summary',
  description: 'Overall budget health summary across all accounts',
  context: 'budget-health',
  layout: { width: 'full', priority: 6 },
  columns: [
    { key: 'category', label: 'Category', default: true, class: 'font-semibold' },
    {
      key: 'count',
      label: 'Count',
      align: 'center',
      default: true
    },
    {
      key: 'totalBudget',
      label: 'Total Budget',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'actualCost',
      label: 'Actual Cost',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'variance',
      label: 'Variance',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'utilization',
      label: 'Utilization',
      align: 'right',
      format: (v: number) => formatPercent(v),
      default: true
    }
  ],
  extractor: (dataset: NormalizedDataset, dataMode: DataMode = 'billable') => {
    const analysisSource = extractAnalysisData(dataset, dataMode)

    if (!analysisSource?.budgetAnalysis?.byAccount) {
      return []
    }

    const accounts = analysisSource.budgetAnalysis.byAccount

    // Calculate category summaries
    const allAccounts = accounts.filter((acc: any) => acc.budgetedCost > 0)
    const overBudget = accounts.filter((acc: any) => acc.actualCost > acc.budgetedCost && acc.budgetedCost > 0)
    const healthy = accounts.filter((acc: any) => {
      if (acc.budgetedCost === 0) return false
      const util = (acc.actualCost / acc.budgetedCost) * 100
      return util >= 50 && util <= 100
    })
    const underutilized = accounts.filter((acc: any) => {
      if (acc.budgetedCost === 0) return false
      return (acc.actualCost / acc.budgetedCost) * 100 < 50
    })

    const sumByCategory = (accs: any[]) => {
      return accs.reduce((sum: any, acc: any) => ({
        budget: sum.budget + acc.budgetedCost,
        actual: sum.actual + acc.actualCost
      }), { budget: 0, actual: 0 })
    }

    const allSum = sumByCategory(allAccounts)
    const overSum = sumByCategory(overBudget)
    const healthySum = sumByCategory(healthy)
    const underSum = sumByCategory(underutilized)

    return [
      {
        category: 'All Accounts',
        count: allAccounts.length,
        totalBudget: allSum.budget,
        actualCost: allSum.actual,
        variance: allSum.actual - allSum.budget,
        utilization: allSum.budget > 0 ? (allSum.actual / allSum.budget) * 100 : 0
      },
      {
        category: 'Over Budget',
        count: overBudget.length,
        totalBudget: overSum.budget,
        actualCost: overSum.actual,
        variance: overSum.actual - overSum.budget,
        utilization: overSum.budget > 0 ? (overSum.actual / overSum.budget) * 100 : 0
      },
      {
        category: 'Healthy',
        count: healthy.length,
        totalBudget: healthySum.budget,
        actualCost: healthySum.actual,
        variance: healthySum.actual - healthySum.budget,
        utilization: healthySum.budget > 0 ? (healthySum.actual / healthySum.budget) * 100 : 0
      },
      {
        category: 'Underutilized',
        count: underutilized.length,
        totalBudget: underSum.budget,
        actualCost: underSum.actual,
        variance: underSum.actual - underSum.budget,
        utilization: underSum.budget > 0 ? (underSum.actual / underSum.budget) * 100 : 0
      }
    ]
  },
  config: {
    searchable: false,
    sortable: false,
    paginated: false,
    columnToggle: false,
    exportCsv: true,
    emptyMessage: 'No budget data available'
  }
}

// ============================================================================
// SMART ANALYSIS TABLES (For Smart Analysis Tab)
// ============================================================================

// Table: Top 10 Spenders
const topSpendersTable: TableDefinition = {
  id: 'topSpendersTable',
  title: 'Top 10 Cost Drivers',
  description: 'Accounts with highest costs in the selected period',
  context: 'smart-analysis',
  layout: { width: 'half', priority: 2 },
  columns: [
    { key: 'rank', label: '#', align: 'center', default: true },
    { key: 'accountName', label: 'Account Name', default: true },
    { key: 'accountId', label: 'Account ID', default: true },
    {
      key: 'cost',
      label: 'Total Cost',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'percentOfTotal',
      label: '% of Total',
      align: 'right',
      format: (v: number) => formatPercent(v),
      default: true
    }
  ],
  extractor: (dataset: NormalizedDataset, dataMode: DataMode = 'billable', accountsList?: AccountMetadata[], selectedAccounts?: string[]) => {
    const analysisSource = extractAnalysisData(dataset, dataMode)

    if (!analysisSource?.budgetAnalysis?.byAccount) {
      return []
    }

    let accounts = analysisSource.budgetAnalysis.byAccount

    // Filter by selected accounts if provided (Smart Analysis context)
    if (selectedAccounts && selectedAccounts.length > 0) {
      accounts = accounts.filter((acc: any) => selectedAccounts.includes(acc.accountId))
    }

    // Calculate total cost from filtered accounts
    const totalCost = accounts.reduce((sum: number, acc: any) => sum + (acc.actualCost || 0), 0)

    // Sort by actual cost and take top 10
    const topAccounts = [...accounts]
      .sort((a: any, b: any) => (b.actualCost || 0) - (a.actualCost || 0))
      .slice(0, 10)
      .map((acc: any, index: number) => ({
        rank: index + 1,
        accountName: acc.accountName || 'Unknown',
        accountId: acc.accountId,
        cost: acc.actualCost || 0,
        percentOfTotal: totalCost > 0 ? ((acc.actualCost || 0) / totalCost) * 100 : 0
      }))

    return topAccounts
  },
  config: {
    searchable: false,
    sortable: false,
    paginated: false,
    columnToggle: true,
    exportCsv: true,
    emptyMessage: 'No cost data available'
  }
}

// Table: Account Comparison (for few-accounts scenario)
const accountComparisonTable: TableDefinition = {
  id: 'accountComparisonTable',
  title: 'Selected Accounts Comparison',
  description: 'Side-by-side comparison of selected accounts',
  context: 'smart-analysis',
  layout: { width: 'full', priority: 1 },
  columns: [
    { key: 'accountName', label: 'Account Name', default: true },
    { key: 'accountId', label: 'Account ID', default: true },
    {
      key: 'actualCost',
      label: 'Actual Cost',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'budgetedCost',
      label: 'Budget',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'utilization',
      label: 'Utilization',
      align: 'right',
      format: (v: number) => formatPercent(v),
      default: true
    },
    {
      key: 'variance',
      label: 'Variance',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'status',
      label: 'Status',
      align: 'center',
      default: true
    }
  ],
  extractor: (dataset: NormalizedDataset, dataMode: DataMode = 'billable', accountsList?: AccountMetadata[], selectedAccounts?: string[]) => {
    const analysisSource = extractAnalysisData(dataset, dataMode)

    if (!analysisSource?.budgetAnalysis?.byAccount) {
      return []
    }

    let accountData = analysisSource.budgetAnalysis.byAccount

    // Filter by selected accounts if provided (Smart Analysis context)
    if (selectedAccounts && selectedAccounts.length > 0) {
      accountData = accountData.filter((acc: any) => selectedAccounts.includes(acc.accountId))
    }

    // Return filtered accounts with enriched data for comparison
    const accounts = accountData.map((acc: any) => ({
      accountName: acc.accountName || 'Unknown',
      accountId: acc.accountId,
      actualCost: acc.actualCost || 0,
      budgetedCost: acc.budgetedCost || 0,
      utilization: acc.budgetedCost > 0 ? (acc.actualCost / acc.budgetedCost) * 100 : 0,
      variance: (acc.actualCost || 0) - (acc.budgetedCost || 0),
      status: acc.budgetedCost > 0 ? getStatusText((acc.actualCost / acc.budgetedCost) * 100) : 'N/A'
    }))
    .sort((a: any, b: any) => b.actualCost - a.actualCost)

    return accounts
  },
  config: {
    searchable: true,
    sortable: true,
    paginated: false, // Usually just a few selected accounts
    columnToggle: true,
    exportCsv: true,
    emptyMessage: 'No accounts selected for comparison'
  }
}

// Table: Service Breakdown Summary
const serviceBreakdownTable: TableDefinition = {
  id: 'serviceBreakdownTable',
  title: 'Top Services by Cost',
  description: 'Services contributing most to your cloud spend',
  context: 'smart-analysis',
  layout: { width: 'third', priority: 3 },
  columns: [
    { key: 'rank', label: '#', align: 'center', default: true },
    { key: 'serviceName', label: 'Service', default: true },
    {
      key: 'cost',
      label: 'Total Cost',
      align: 'right',
      format: (v: number) => formatCurrency(v),
      default: true
    },
    {
      key: 'percentOfTotal',
      label: '% of Total',
      align: 'right',
      format: (v: number) => formatPercent(v),
      default: true
    }
  ],
  extractor: (dataset: NormalizedDataset, dataMode: DataMode = 'billable', accountsList?: AccountMetadata[], selectedAccounts?: string[]) => {
    // Extract service data from dataset.services
    const servicesResponse = dataset.services as any

    if (!servicesResponse) {
      logger.warn('No services data in dataset')
      return []
    }

    // Unwrap the API response
    const unwrappedData = servicesResponse.data || servicesResponse

    // Handle multi-mode structure (billable, proforma, etc.) vs simple structure
    let servicesData: any
    if (unwrappedData.billable || unwrappedData.proforma) {
      // Multi-mode structure - access the correct mode
      servicesData = unwrappedData[dataMode] || unwrappedData.billable || unwrappedData
    } else {
      // Simple structure - data is at the root level
      servicesData = unwrappedData
    }

    if (!servicesData.resultsByTime || !Array.isArray(servicesData.resultsByTime)) {
      logger.warn('No resultsByTime in services data:', servicesData)
      return []
    }

    // Aggregate service costs across all time periods
    // resultsByTime contains Groups with Keys: [serviceName] and Metrics: { UnblendedCost: { Amount: "123.45" } }
    const serviceCostMap = new Map<string, number>()

    servicesData.resultsByTime.forEach((result: any) => {
      if (result.Groups && Array.isArray(result.Groups)) {
        result.Groups.forEach((group: any) => {
          // Keys is an array, first element is the service name
          const serviceName = group.Keys?.[0] || 'Unknown Service'
          const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')

          // Aggregate costs for this service
          serviceCostMap.set(
            serviceName,
            (serviceCostMap.get(serviceName) || 0) + cost
          )
        })
      }
    })

    // Convert map to array and calculate totals
    const totalCost = Array.from(serviceCostMap.values()).reduce((sum, cost) => sum + cost, 0)

    // Sort by cost and take top 5
    const topServices = Array.from(serviceCostMap.entries())
      .map(([serviceName, cost]) => ({ serviceName, cost }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5)
      .map((svc, index) => ({
        rank: index + 1,
        serviceName: svc.serviceName,
        cost: svc.cost,
        percentOfTotal: totalCost > 0 ? (svc.cost / totalCost) * 100 : 0
      }))

    logger.info('Service breakdown extracted:', {
      totalServices: serviceCostMap.size,
      topServices: topServices.length,
      totalCost,
      sample: topServices.slice(0, 2)
    })

    return topServices
  },
  config: {
    searchable: false,
    sortable: false,
    paginated: false,
    columnToggle: false,
    exportCsv: true,
    emptyMessage: 'No service breakdown data available'
  }
}

// ============================================================================
// REGISTRY AND SELECTION LOGIC
// ============================================================================

// All available tables
const allTables: TableDefinition[] = [
  budgetOverageAccounts,
  severeOverageAccounts,
  underutilizedBudgets,
  budgetByProject,
  budgetHealthByLOB,
  budgetHealthByDepartment,
  organizationBudgetSummary,
  topSpendersTable,
  accountComparisonTable,
  serviceBreakdownTable
]

// Table selection based on context (smart-analysis vs budget-health)
const selectTablesForContext = (context: 'smart' | 'budget', scenario: string, timeframe: string): TableDefinition[] => {
  const isHistorical = ['last7days', 'last30days', 'last90days', 'lastMonth', 'lastQuarter', 'lastYear', 'last12months'].includes(timeframe)

  // Budget Health tab - always shows same tables (org-wide, no filtering)
  if (context === 'budget') {
    if (isHistorical) {
      return [] // No budget data for historical periods
    }
    return [
      severeOverageAccounts,
      budgetOverageAccounts,
      underutilizedBudgets,
      budgetByProject,
      budgetHealthByLOB,
      budgetHealthByDepartment,
      organizationBudgetSummary
    ].sort((a, b) => (a.layout?.priority || 999) - (b.layout?.priority || 999))
  }

  // Smart Analysis tab - tables filtered by selected accounts, varies by scenario
  if (context === 'smart') {
    if (isHistorical) {
      // Historical data - only cost analysis tables
      return [
        topSpendersTable,
        serviceBreakdownTable
      ].sort((a, b) => (a.layout?.priority || 999) - (b.layout?.priority || 999))
    }

    // Current period - scenario-based selection
    switch (scenario) {
      case 'all-accounts':
        return [
          topSpendersTable,
          serviceBreakdownTable
        ].sort((a, b) => (a.layout?.priority || 999) - (b.layout?.priority || 999))

      case 'few-accounts':
        return [
          accountComparisonTable,
          topSpendersTable,
          serviceBreakdownTable
        ].sort((a, b) => (a.layout?.priority || 999) - (b.layout?.priority || 999))

      case 'single-account':
        return [
          accountComparisonTable,
          serviceBreakdownTable
        ].sort((a, b) => (a.layout?.priority || 999) - (b.layout?.priority || 999))

      default:
        return [
          topSpendersTable,
          serviceBreakdownTable
        ].sort((a, b) => (a.layout?.priority || 999) - (b.layout?.priority || 999))
    }
  }

  return []
}

// ============================================================================
// COMPOSABLE HOOK
// ============================================================================

export const useTableRegistry = (options: {
  scenario: ComputedRef<string>
  timeframe: ComputedRef<string>
  accountsList?: ComputedRef<AccountMetadata[]>
}) => {
  // Smart Analysis tables (filtered by selected accounts)
  const smartTables = computed(() => {
    return selectTablesForContext('smart', options.scenario.value, options.timeframe.value)
  })

  // Budget Health tables (always all accounts, org-wide)
  const budgetTables = computed(() => {
    return selectTablesForContext('budget', options.scenario.value, options.timeframe.value)
  })

  return {
    smartTables,
    budgetTables,
    allTables,
    accountsList: options.accountsList
  }
}
