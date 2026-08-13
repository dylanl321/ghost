export const ghostEnvironmentContext = {
  organization: 'General Dynamics Mission Systems (GDMS)',
  operatingModel: 'GovCloud-first',
  defaultEnvironment: 'govcloud',
  rules: [
    'Default generic AWS account, resource, security, patching, troubleshooting, and operational questions to GovCloud.',
    'Resolve GHOST account metadata before AWS work and use the paired GovCloud account ID when one exists.',
    'Use Commercial only when the user explicitly requests it or the service is Commercial-only, especially payer billing, Cost Explorer, Pricing, Billing Conductor, and proforma chargeback.',
    'Default cost analysis, dashboards, and forecasts to proforma. Use billable only when explicitly requested or when a detail domain such as resource-level or tag-level Cost Explorer data cannot support proforma.',
    'GHOST service APIs and management-account roles are the normal source for centralized data. User IDC authorization is only for explicitly requested short-lived user credentials.',
    'Never interpret a Commercial billing account ID as the operational workload account when a paired GovCloud ID exists.'
  ],
  knowledgeRouting: {
    officialDocumentationTool: 'ghost.docs.search',
    docsFirstTopics: ['golden AMIs', 'approved images', 'baselines', 'service catalogs', 'standards', 'architecture', 'processes', 'onboarding', 'team terminology', 'how GHOST/GDMS works'],
    rule: 'For internal catalogs, policy, process, standards, architecture, or team concepts, search official documentation before querying AWS inventory or asking the downstream agent. Use AWS data afterward only to validate live deployment state.'
  },
  environments: {
    govcloud: {
      partition: 'aws-us-gov',
      primaryRegion: 'us-gov-west-1',
      organizationsManagementAccountId: '374673712317',
      sharedServicesAccountId: '461760157232',
      roleName: 'GDMSOrganizationsRole',
      useFor: ['workloads', 'resources', 'security', 'operations', 'patching', 'CloudTrail', 'Config', 'Identity Center']
    },
    commercial: {
      partition: 'aws',
      primaryRegion: 'us-east-1',
      organizationsManagementAccountId: '205950196477',
      proformaAccountId: '253821132832',
      roleName: 'GDMSOrganizationsRole',
      useFor: ['payer billing', 'Cost Explorer', 'Pricing', 'Billing Conductor', 'proforma chargeback', 'Commercial-only services']
    }
  },
  terminology: {
    enclave: 'A GHOST-managed account pairing and its associated project metadata.',
    pairedAccount: 'One logical GHOST account represented by Commercial and GovCloud AWS account IDs.',
    billable: 'Authoritative payer cost from the Commercial management account.',
    proforma: 'Billing Conductor chargeback allocation; authoritative at account level, estimated for tag-level analysis.',
    effectiveAccess: 'Current IAM Identity Center account and permission-set assignments, queried through IDC Admin APIs.',
    directoryAccess: 'Entra group membership metadata; useful for directory context but not authoritative for effective AWS access.'
  }
} as const

export const ghostMcpInstructions = [
  'GHOST provides internal GDMS AWS account, cost, user, security, resource, pipeline, support, report, and AI context.',
  'GDMS is GovCloud-first. Default generic AWS operational work to GovCloud and us-gov-west-1. Resolve account metadata first and prefer the paired GovCloud account ID.',
  'Use Commercial only when explicitly requested or for Commercial-only domains such as payer billing, Cost Explorer, Pricing, Billing Conductor, and proforma chargeback.',
  'Default cost analysis, dashboards, and forecasts to proforma. Use billable only when explicitly requested or when resource-level or tag-level detail requires the payer Cost Explorer domain.',
  'Use GHOST service APIs and management-account roles for centralized reads. Use user IDC device authorization only when the user explicitly requests short-lived credentials.',
  'For internal GDMS catalogs, golden or approved offerings, standards, processes, architecture, onboarding, or team terminology, MUST call ghost.docs.search before AWS inventory or ghost.ai.chat. Documentation is authoritative for what is offered; AWS inventory only verifies what is deployed.',
  'Use ghost.access.mine for effective IDC assignments. Entra directory groups are not authoritative AWS access.',
  'For compliance questions, distinguish Security Hub/Inspector vulnerability posture, Security Hub control compliance, AWS Config rule compliance, and SSM patch compliance. Do not combine them into one unsupported compliance percentage or infer that a bounded findings list is the complete account total.',
  'Prefer bounded queries and exports for large datasets. Never imply that a write occurred unless the tool result confirms it.'
].join(' ')
