export type McpCapabilityMode = 'Read' | 'Create' | 'Confirm'

export interface McpCapabilityGroup {
  id: string
  label: string
  description: string
  icon: string
  tools: Array<{
    name: string
    description: string
    mode: McpCapabilityMode
  }>
}

// This is the user-facing data coverage contract for the GHOST MCP catalog.
// Keep it scoped to non-admin workflows and verify every listed tool is registered.
export const endUserMcpCapabilityGroups: McpCapabilityGroup[] = [
  {
    id: 'accounts', label: 'Accounts and access', icon: 'i-heroicons-building-office-2',
    description: 'Find AWS accounts, understand organization structure, and explain effective user access.',
    tools: [
      { name: 'ghost.accounts.search', description: 'Find accounts by name, ID, project, owner, department, or line of business.', mode: 'Read' },
      { name: 'ghost.access.mine', description: 'List your effective AWS account assignments and roles.', mode: 'Read' },
      { name: 'ghost.access.explain', description: 'Explain why a user has access to an account.', mode: 'Read' },
      { name: 'ghost.organization.structure', description: 'Inspect organization units and account hierarchy.', mode: 'Read' }
    ]
  },
  {
    id: 'costs', label: 'Costs, budgets, and alerts', icon: 'i-heroicons-currency-dollar',
    description: 'Analyze spend, forecasts, budgets, account detail, service costs, and budget alerts.',
    tools: [
      { name: 'ghost.costs.dashboard', description: 'Return dashboard metrics, account estimates, and end-of-month and year-end projections.', mode: 'Read' },
      { name: 'ghost.costs.query', description: 'Query cost by account, service, date range, and grouping.', mode: 'Read' },
      { name: 'ghost.costs.budget_vs_actual', description: 'Compare budgets with actual account cost.', mode: 'Read' },
      { name: 'ghost.alerts.list', description: 'List budget alerts by account, month, or alert type.', mode: 'Read' }
    ]
  },
  {
    id: 'handbook', label: 'Handbook and standards', icon: 'i-heroicons-book-open',
    description: 'Ground answers in the GDMS AWS Operations Handbook and compare approved guidance with live catalogs.',
    tools: [
      { name: 'ghost.docs.search', description: 'Search official GDMS AWS documentation with cited passages.', mode: 'Read' },
      { name: 'ghost.docs.answer', description: 'Generate a concise, cited answer from the Handbook knowledge base.', mode: 'Read' },
      { name: 'ghost.catalog.golden_amis', description: 'Combine approved-image guidance with the live Golden AMI catalog.', mode: 'Read' }
    ]
  },
  {
    id: 'security', label: 'Security and compliance', icon: 'i-heroicons-shield-check',
    description: 'Review posture, findings, patch status, and remediation evidence.',
    tools: [
      { name: 'ghost.security.summary', description: 'Summarize account security posture and findings.', mode: 'Read' },
      { name: 'ghost.compliance.summary', description: 'Summarize Security Hub, Inspector, Config, and patch evidence.', mode: 'Read' },
      { name: 'ghost.support.patch_compliance', description: 'Inspect managed-instance patch compliance.', mode: 'Read' },
      { name: 'ghost.security.remediation_plan', description: 'Build a read-only remediation plan from active findings.', mode: 'Read' }
    ]
  },
  {
    id: 'operations', label: 'Inventory and operations', icon: 'i-heroicons-server-stack',
    description: 'Search AWS inventory, inspect utilization, audit activity, and triage pipelines.',
    tools: [
      { name: 'ghost.resources.search', description: 'Search live AWS resource inventory across GHOST accounts.', mode: 'Read' },
      { name: 'ghost.instances.search', description: 'List or find EC2 instances using a friendly account reference.', mode: 'Read' },
      { name: 'ghost.instances.utilization', description: 'Review persisted EC2 utilization and optimization findings.', mode: 'Read' },
      { name: 'ghost.audit.search', description: 'Search account-scoped organization CloudTrail logs.', mode: 'Read' },
      { name: 'ghost.pipelines.search', description: 'Search pipeline runs and Terraform resource activity.', mode: 'Read' }
    ]
  },
  {
    id: 'personal', label: 'Personal workspace', icon: 'i-heroicons-folder-open',
    description: 'Use your private account context, notification inbox, reports, exports, preferences, and chat threads.',
    tools: [
      { name: 'ghost.accounts.personal_context', description: 'Resolve your favorite and recently viewed accounts to current GHOST metadata.', mode: 'Read' },
      { name: 'ghost.notifications.list', description: 'Read your GHOST notification inbox.', mode: 'Read' },
      { name: 'ghost.reports.list', description: 'List your reports and recent exports.', mode: 'Read' },
      { name: 'ghost.chat_threads.list', description: 'List your GHOST chat threads.', mode: 'Read' },
      { name: 'ghost.evidence.create', description: 'Create a private evidence bundle with a 90-day retention period.', mode: 'Create' }
    ]
  },
  {
    id: 'support', label: 'AI assistance', icon: 'i-heroicons-sparkles',
    description: 'Review AI usage and request bounded analysis from GHOST.',
    tools: [
      { name: 'ghost.ai.usage', description: 'Review organization AI adoption, usage, and costs.', mode: 'Read' },
      { name: 'ghost.ai.insight', description: 'Generate a bounded insight from supplied GHOST context.', mode: 'Read' },
      { name: 'ghost.ai.troubleshoot', description: 'Generate a bounded AWS troubleshooting plan.', mode: 'Read' }
    ]
  },
  {
    id: 'credentials', label: 'AWS credentials', icon: 'i-heroicons-key',
    description: 'Issue short-lived Identity Center credentials only for roles assigned to you.',
    tools: [
      { name: 'ghost.credentials.start', description: 'Begin IAM Identity Center authorization.', mode: 'Confirm' },
      { name: 'ghost.credentials.issue', description: 'Issue process-local credentials after an explicit confirmation.', mode: 'Confirm' }
    ]
  }
]

export const endUserMcpToolNames = endUserMcpCapabilityGroups.flatMap(group => group.tools.map(tool => tool.name))
