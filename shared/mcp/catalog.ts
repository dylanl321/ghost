export type GhostMcpCatalogScope = 'ghost.read' | 'ghost.ai.invoke' | 'ghost.collaborate' | 'ghost.credentials.issue'
export type GhostMcpCatalogVisibility = 'advertised' | 'discoverable'

export interface GhostMcpCatalogEntry {
  name: string
  scope: GhostMcpCatalogScope
  visibility: GhostMcpCatalogVisibility
  domain: string
  source: string
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean }
}

const advertised = new Set([
  'ghost.accounts.search', 'ghost.access.mine', 'ghost.access.explain', 'ghost.organization.structure',
  'ghost.costs.dashboard', 'ghost.costs.query', 'ghost.costs.compare', 'ghost.costs.anomalies', 'ghost.costs.budget_vs_actual', 'ghost.alerts.list',
  'ghost.docs.search', 'ghost.docs.answer', 'ghost.catalog.golden_amis',
  'ghost.security.summary', 'ghost.compliance.summary', 'ghost.support.patch_compliance', 'ghost.security.remediation_plan',
  'ghost.resources.search', 'ghost.instances.search', 'ghost.instances.utilization', 'ghost.instances.health', 'ghost.audit.search', 'ghost.pipelines.search',
  'ghost.accounts.personal_context', 'ghost.notifications.list', 'ghost.notifications.action', 'ghost.reports.list', 'ghost.reports.cancel_export', 'ghost.evidence.create',
  'ghost.ai.usage', 'ghost.ai.insight', 'ghost.ai.troubleshoot',
  'ghost.credentials.start', 'ghost.credentials.issue'
])

const readTools: Record<string, { source: string; names: string[] }> = {
  accounts: {
    source: 'Organizations and GHOST account metadata',
    names: ['ghost.accounts.resolve', 'ghost.accounts.search', 'ghost.accounts.get', 'ghost.accounts.list', 'ghost.accounts.statistics']
  },
  access: {
    source: 'AWS IAM Identity Center Admin and GHOST account metadata',
    names: ['ghost.access.mine', 'ghost.access.for_account', 'ghost.access.for_user', 'ghost.access.explain']
  },
  users: { source: 'Microsoft Graph', names: ['ghost.users.search'] },
  organization: {
    source: 'AWS Organizations',
    names: ['ghost.organization.overview', 'ghost.organization.structure', 'ghost.organization.governance']
  },
  costs: {
    source: 'AWS Cost Explorer and GHOST account budgets',
    names: ['ghost.costs.query', 'ghost.costs.compare', 'ghost.costs.anomalies', 'ghost.costs.dashboard', 'ghost.costs.forecast', 'ghost.costs.resources', 'ghost.costs.tags', 'ghost.costs.budget_vs_actual']
  },
  alerts: { source: 'GHOST budget alerts', names: ['ghost.alerts.list'] },
  documentation: {
    source: 'ISGDDocs and GHOST documentation',
    names: ['ghost.docs.search', 'ghost.docs.answer', 'ghost.catalog.golden_amis']
  },
  outputs: { source: 'GHOST MCP output renderer', names: ['ghost.outputs.render'] },
  inventory: {
    source: 'AWS Config and GHOST utilization analysis',
    names: ['ghost.resources.search', 'ghost.instances.search', 'ghost.instances.utilization', 'ghost.instances.health']
  },
  security: {
    source: 'AWS Security Hub, Inspector, Config, and Systems Manager',
    names: ['ghost.security.summary', 'ghost.compliance.summary', 'ghost.security.findings', 'ghost.support.patch_compliance', 'ghost.security.remediation_plan', 'ghost.account.health']
  },
  policy: { source: 'GHOST policy analyzer', names: ['ghost.s3.analyze_policy'] },
  audit: { source: 'AWS CloudWatch Logs organization CloudTrail', names: ['ghost.audit.search'] },
  pipelines: { source: 'Athena pipeline telemetry', names: ['ghost.pipelines.overview', 'ghost.pipelines.search', 'ghost.pipelines.get_run'] },
  ai_usage: { source: 'GHOST AI usage facts', names: ['ghost.ai.usage'] }
}

const collaborationTools: Record<string, { source: string; names: string[] }> = {
  personal: {
    source: 'GHOST user preferences and notifications',
    names: ['ghost.preferences.get', 'ghost.accounts.personal_context', 'ghost.notifications.list', 'ghost.notifications.action', 'ghost.preferences.update']
  },
  evidence: {
    source: 'GHOST private evidence storage',
    names: ['ghost.evidence.create', 'ghost.evidence.list', 'ghost.evidence.get', 'ghost.evidence.download', 'ghost.evidence.delete']
  },
  reports: {
    source: 'GHOST report storage and dataset export queue',
    names: ['ghost.reports.list', 'ghost.reports.start_export', 'ghost.reports.export_status', 'ghost.reports.cancel_export', 'ghost.reports.download_url']
  }
}

const aiTools = ['ghost.ai.insight', 'ghost.ai.troubleshoot']
const credentialTools = ['ghost.credentials.start', 'ghost.credentials.issue']
const destructiveTools = new Set(['ghost.evidence.delete', 'ghost.reports.cancel_export'])
const nonIdempotentTools = new Set([
  'ghost.credentials.start', 'ghost.credentials.issue', 'ghost.ai.insight', 'ghost.ai.troubleshoot',
  'ghost.evidence.download', 'ghost.reports.download_url'
])
const collaborationReadTools = new Set([
  'ghost.preferences.get', 'ghost.accounts.personal_context', 'ghost.notifications.list', 'ghost.evidence.list',
  'ghost.evidence.get', 'ghost.evidence.download',
  'ghost.reports.list', 'ghost.reports.export_status', 'ghost.reports.download_url'
])

function annotations(name: string, scope: GhostMcpCatalogScope) {
  return {
    readOnlyHint: scope === 'ghost.read' || scope === 'ghost.ai.invoke' || collaborationReadTools.has(name),
    destructiveHint: destructiveTools.has(name),
    idempotentHint: !nonIdempotentTools.has(name)
  }
}

function entries(
  groups: Record<string, { source: string; names: string[] }>,
  scope: GhostMcpCatalogScope
): GhostMcpCatalogEntry[] {
  return Object.entries(groups).flatMap(([domain, group]) => group.names.map(name => ({
    name,
    scope,
    visibility: advertised.has(name) ? 'advertised' as const : 'discoverable' as const,
    domain,
    source: group.source,
    annotations: annotations(name, scope)
  })))
}

export const ghostMcpCatalog: GhostMcpCatalogEntry[] = [
  ...entries(readTools, 'ghost.read'),
  ...entries(collaborationTools, 'ghost.collaborate'),
  ...aiTools.map(name => ({ name, scope: 'ghost.ai.invoke' as const, visibility: advertised.has(name) ? 'advertised' as const : 'discoverable' as const, domain: 'ai', source: 'AWS Bedrock', annotations: annotations(name, 'ghost.ai.invoke') })),
  ...credentialTools.map(name => ({ name, scope: 'ghost.credentials.issue' as const, visibility: 'advertised' as const, domain: 'credentials', source: 'AWS IAM Identity Center', annotations: annotations(name, 'ghost.credentials.issue') }))
]

export const ghostMcpCatalogByName = new Map(ghostMcpCatalog.map(entry => [entry.name, entry]))
export const ghostMcpToolNames = ghostMcpCatalog.map(entry => entry.name)
