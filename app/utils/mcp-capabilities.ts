export interface McpCapabilityGroup {
  id: string
  label: string
  description: string
  icon: string
  tools: Array<{
    name: string
    description: string
    mode: 'Read' | 'Create' | 'Confirm'
  }>
}

// Keep this concise, user-facing map aligned with the server MCP catalog.
export const mcpCapabilityGroups: McpCapabilityGroup[] = [
  {
    id: 'accounts', label: 'Accounts and access', icon: 'i-heroicons-building-office-2',
    description: 'Find AWS accounts, understand ownership, and explain effective user access.',
    tools: [
      { name: 'ghost.accounts.search', description: 'Find accounts by name, ID, project, owner, department, or line of business.', mode: 'Read' },
      { name: 'ghost.access.explain', description: 'Explain why a user has access to an account.', mode: 'Read' },
      { name: 'ghost.organization.structure', description: 'Inspect organization units and account hierarchy.', mode: 'Read' }
    ]
  },
  {
    id: 'costs', label: 'Costs and forecasts', icon: 'i-heroicons-currency-dollar',
    description: 'Analyze spend, forecasts, budgets, resource costs, and allocation tags.',
    tools: [
      { name: 'ghost.costs.query', description: 'Query cost by account, service, date range, and grouping.', mode: 'Read' },
      { name: 'ghost.costs.forecast', description: 'Forecast future AWS cost for an account scope.', mode: 'Read' },
      { name: 'ghost.costs.budget_vs_actual', description: 'Compare budget with actual account cost.', mode: 'Read' }
    ]
  },
  {
    id: 'security', label: 'Security and compliance', icon: 'i-heroicons-shield-check',
    description: 'Review posture, findings, Golden AMIs, patch status, evidence, and remediation plans.',
    tools: [
      { name: 'ghost.compliance.summary', description: 'Summarize Security Hub, Inspector, Config, and patching evidence.', mode: 'Read' },
      { name: 'ghost.catalog.golden_amis', description: 'List approved Golden AMIs and their status.', mode: 'Read' },
      { name: 'ghost.security.remediation_plan', description: 'Build a read-only remediation plan from active findings.', mode: 'Read' }
    ]
  },
  {
    id: 'operations', label: 'Resources and operations', icon: 'i-heroicons-server-stack',
    description: 'Search inventory, inspect account health, review CloudTrail activity, and triage pipelines.',
    tools: [
      { name: 'ghost.resources.search', description: 'Search live AWS resource inventory across available accounts.', mode: 'Read' },
      { name: 'ghost.account.health', description: 'Review account health domains with evidence and guidance.', mode: 'Read' },
      { name: 'ghost.pipelines.for_account', description: 'Review pipeline runs and deployment activity for an account.', mode: 'Read' }
    ]
  },
  {
    id: 'personal', label: 'Personal workspace', icon: 'i-heroicons-folder-open',
    description: 'Manage your private evidence bundles, reports, exports, preferences, and chat threads.',
    tools: [
      { name: 'ghost.evidence.create', description: 'Create a private evidence bundle with a 90-day retention period.', mode: 'Create' },
      { name: 'ghost.reports.start_export', description: 'Queue a private dataset export.', mode: 'Create' },
      { name: 'ghost.chat_threads.update', description: 'Update your own GHOST chat thread.', mode: 'Create' }
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
