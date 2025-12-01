/**
 * GHOST Site Schema - Complete navigation and linking schema for the GHOST application
 * This is passed to the AI to help it generate contextual deep links based on user queries
 */

export interface PageParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'date'
  description: string
  required?: boolean
  example?: string
  format?: string // For arrays: 'comma-separated' | 'json'
}

export interface PageSchema {
  id: string
  name: string
  path: string
  description: string
  icon: string
  category: 'accounts' | 'costs' | 'users' | 'reports' | 'admin' | 'security' | 'organization'
  keywords: string[] // For AI matching
  parameters?: PageParameter[]
  examples?: string[]
}

/**
 * Complete GHOST application site schema
 */
export const GHOST_SITE_SCHEMA: PageSchema[] = [
  // === OVERVIEW ===
  {
    id: 'overview',
    name: 'Overview Dashboard',
    path: '/',
    description: 'Main dashboard showing account summary, recent activity, and quick stats',
    icon: 'i-heroicons-home',
    category: 'accounts',
    keywords: ['home', 'dashboard', 'overview', 'summary', 'main', 'start'],
    examples: [
      'Take me to the main dashboard',
      'Go to home page',
      'Show me the overview'
    ]
  },

  // === ACCOUNT MANAGEMENT ===
  {
    id: 'account-explorer',
    name: 'Account Explorer',
    path: '/account/explorer',
    description: 'Browse and search AWS accounts, view account details, resources, and metadata',
    icon: 'i-heroicons-magnifying-glass',
    category: 'accounts',
    keywords: ['account', 'search', 'find', 'browse', 'explorer', 'list accounts', 'view accounts'],
    parameters: [
      {
        name: 'accounts',
        type: 'array',
        format: 'comma-separated',
        description: 'Pre-select specific account IDs',
        example: '374673712317,083876038518'
      },
      {
        name: 'search',
        type: 'string',
        description: 'Pre-fill search query',
        example: 'production'
      },
      {
        name: 'resourceTypes',
        type: 'array',
        format: 'comma-separated',
        description: 'Filter by AWS resource types',
        example: 'AWS::EC2::Instance,AWS::S3::Bucket'
      }
    ],
    examples: [
      'Find all production accounts',
      'Show me account 374673712317',
      'Search for accounts with EC2 instances',
      'List all AWS accounts'
    ]
  },

  {
    id: 'account-detail',
    name: 'Account Details',
    path: '/account/[accountId]',
    description: 'Detailed view of a specific AWS account including resources, costs, users, and compliance',
    icon: 'i-heroicons-building-library',
    category: 'accounts',
    keywords: ['account details', 'account info', 'specific account', 'account page'],
    parameters: [
      {
        name: 'accountId',
        type: 'string',
        required: true,
        description: '12-digit AWS account ID',
        example: '374673712317'
      },
      {
        name: 'tab',
        type: 'string',
        description: 'Active tab: overview, resources, costs, users, compliance',
        example: 'costs'
      }
    ],
    examples: [
      'Show me details for account 374673712317',
      'Open account 083876038518',
      'View account information for the Gov Master account'
    ]
  },

  {
    id: 'org-chart',
    name: 'Organization Chart',
    path: '/account/org-chart',
    description: 'Visual hierarchy of AWS organization structure with OUs and accounts',
    icon: 'i-heroicons-building-library',
    category: 'organization',
    keywords: ['organization', 'org chart', 'hierarchy', 'structure', 'ou', 'organizational unit', 'tree'],
    parameters: [
      {
        name: 'highlight',
        type: 'string',
        description: 'Highlight specific account ID in the chart',
        example: '374673712317'
      },
      {
        name: 'expand',
        type: 'string',
        description: 'Expand specific OU path',
        example: 'root/production'
      }
    ],
    examples: [
      'Show me the organization chart',
      'View AWS org structure',
      'Display account hierarchy',
      'Where is account 374673712317 in the org?'
    ]
  },

  // === COST MANAGEMENT ===
  {
    id: 'cost-dashboard',
    name: 'Cost Dashboard',
    path: '/account/costs',
    description: 'Comprehensive cost analysis with charts, trends, forecasts, and cost optimization insights',
    icon: 'i-heroicons-currency-dollar',
    category: 'costs',
    keywords: ['cost', 'costs', 'spend', 'spending', 'billing', 'charges', 'budget', 'expenses', 'financial', 'money', 'price', 'pricing'],
    parameters: [
      {
        name: 'accounts',
        type: 'array',
        format: 'comma-separated',
        description: 'Account IDs to analyze',
        example: '374673712317,083876038518'
      },
      {
        name: 'start',
        type: 'date',
        description: 'Start date for cost analysis (YYYY-MM-DD)',
        example: '2025-01-01'
      },
      {
        name: 'end',
        type: 'date',
        description: 'End date for cost analysis (YYYY-MM-DD)',
        example: '2025-01-31'
      },
      {
        name: 'range',
        type: 'string',
        description: 'Predefined range: mtd, ytd, last30, last90, custom',
        example: 'mtd'
      },
      {
        name: 'granularity',
        type: 'string',
        description: 'Time granularity: DAILY, MONTHLY',
        example: 'DAILY'
      },
      {
        name: 'groupBy',
        type: 'string',
        description: 'Group costs by: SERVICE, ACCOUNT, REGION',
        example: 'SERVICE'
      },
      {
        name: 'metric',
        type: 'string',
        description: 'Cost metric: Billable, Proforma',
        example: 'Billable'
      },
      {
        name: 'services',
        type: 'array',
        format: 'comma-separated',
        description: 'Filter by AWS service names',
        example: 'Amazon Elastic Compute Cloud,Amazon Simple Storage Service'
      }
    ],
    examples: [
      'Show me costs for account 374673712317 this month',
      'What are my EC2 costs for the last 30 days?',
      'Analyze spending for Gov Master account',
      'Compare costs between accounts 374673712317 and 083876038518'
    ]
  },

  // === USER & ACCESS MANAGEMENT ===
  {
    id: 'users-overview',
    name: 'Users & Access',
    path: '/account/user',
    description: 'User directory, access management, IAM roles, permissions, and identity information',
    icon: 'i-heroicons-users',
    category: 'users',
    keywords: ['user', 'users', 'access', 'permission', 'permissions', 'iam', 'identity', 'role', 'roles', 'policy', 'people', 'team'],
    parameters: [
      {
        name: 'account',
        type: 'string',
        description: 'Filter by account ID',
        example: '374673712317'
      },
      {
        name: 'search',
        type: 'string',
        description: 'Search for specific user',
        example: 'john.doe'
      }
    ],
    examples: [
      'Show me all users',
      'List IAM users in account 374673712317',
      'Find users with admin access',
      'Who has access to the production account?'
    ]
  },

  {
    id: 'user-detail',
    name: 'User Details',
    path: '/account/user/[username]',
    description: 'Detailed user profile including permissions, access history, group memberships, and activity',
    icon: 'i-heroicons-user-circle',
    category: 'users',
    keywords: ['user profile', 'user details', 'user info', 'specific user', 'user page'],
    parameters: [
      {
        name: 'username',
        type: 'string',
        required: true,
        description: 'Username or email (converted to slug)',
        example: 'john-doe'
      }
    ],
    examples: [
      'Show me john.doe\'s access',
      'View permissions for user jane.smith',
      'What accounts can john.doe access?'
    ]
  },

  // === REPORTING ===
  {
    id: 'dataset-reports',
    name: 'Dataset Reports',
    path: '/reports/datasets',
    description: 'Create custom reports from CloudTrail, AWS Config, Security Hub, and Entra data with advanced filtering',
    icon: 'i-heroicons-server-stack',
    category: 'reports',
    keywords: ['report', 'reports', 'dataset', 'data', 'cloudtrail', 'config', 'security hub', 'audit', 'compliance', 'export', 'query'],
    parameters: [
      {
        name: 'source',
        type: 'string',
        description: 'Data source: cloudtrail, config, securityhub, entra',
        example: 'cloudtrail'
      },
      {
        name: 'accounts',
        type: 'array',
        format: 'comma-separated',
        description: 'Filter by account IDs',
        example: '374673712317'
      },
      {
        name: 'preset',
        type: 'string',
        description: 'Load a preset report configuration',
        example: 'security-findings'
      }
    ],
    examples: [
      'Generate a CloudTrail report',
      'Create AWS Config report for account 374673712317',
      'Show me Security Hub findings',
      'Export compliance data'
    ]
  },

  // === SECURITY ===
  {
    id: 'security-findings',
    name: 'Security Findings',
    path: '/account/[accountId]?tab=compliance',
    description: 'Security Hub findings, vulnerabilities, compliance status, and security posture',
    icon: 'i-heroicons-shield-check',
    category: 'security',
    keywords: ['security', 'vulnerability', 'vulnerabilities', 'finding', 'findings', 'compliance', 'threat', 'risk', 'cve', 'security hub'],
    parameters: [
      {
        name: 'accountId',
        type: 'string',
        required: true,
        description: 'Account ID to view security findings',
        example: '374673712317'
      },
      {
        name: 'severity',
        type: 'string',
        description: 'Filter by severity: CRITICAL, HIGH, MEDIUM, LOW',
        example: 'CRITICAL'
      }
    ],
    examples: [
      'Show me critical security findings',
      'What vulnerabilities exist in account 374673712317?',
      'Display Security Hub findings for Gov Master',
      'Are there any compliance issues?'
    ]
  },

  // === ADMIN ===
  {
    id: 'pipeline-analytics',
    name: 'Pipeline Analytics',
    path: '/admin/pipelines',
    description: 'CI/CD pipeline monitoring, deployment analytics, and infrastructure automation insights (Admin only)',
    icon: 'i-heroicons-arrow-path',
    category: 'admin',
    keywords: ['pipeline', 'pipelines', 'ci/cd', 'deployment', 'deploy', 'build', 'automation', 'devops'],
    examples: [
      'Show me pipeline status',
      'View deployment history',
      'Check CI/CD pipelines'
    ]
  },

  {
    id: 'admin-dashboard',
    name: 'Admin Dashboard',
    path: '/admin',
    description: 'Administrative controls, user management, system settings, and audit logs (Admin only)',
    icon: 'i-heroicons-adjustments-horizontal',
    category: 'admin',
    keywords: ['admin', 'administration', 'settings', 'configuration', 'manage', 'control panel'],
    examples: [
      'Go to admin panel',
      'Open admin dashboard',
      'Manage system settings'
    ]
  },

  // === SUPPORT & HELP ===
  {
    id: 'support-docs',
    name: 'Documentation',
    path: '/support/docs',
    description: 'Complete GHOST documentation, guides, tutorials, and how-to articles',
    icon: 'i-heroicons-document-text',
    category: 'accounts',
    keywords: ['documentation', 'docs', 'help', 'guide', 'tutorial', 'how to', 'learn', 'manual'],
    parameters: [
      {
        name: 'article',
        type: 'string',
        description: 'Specific article slug',
        example: 'getting-started'
      }
    ],
    examples: [
      'Show me the documentation',
      'How do I use favorites?',
      'Read the getting started guide'
    ]
  },

  {
    id: 'support-help',
    name: 'Support & Help',
    path: '/support',
    description: 'Get help, contact support, submit feedback, and access troubleshooting resources',
    icon: 'i-heroicons-lifebuoy',
    category: 'accounts',
    keywords: ['support', 'help', 'contact', 'feedback', 'issue', 'problem', 'question', 'troubleshoot'],
    examples: [
      'I need help',
      'Contact support',
      'Submit feedback'
    ]
  },

  {
    id: 'about',
    name: 'About GHOST',
    path: '/about',
    description: 'About GHOST platform, team information, version details, and system overview',
    icon: 'i-heroicons-information-circle',
    category: 'accounts',
    keywords: ['about', 'version', 'info', 'information', 'team', 'credits'],
    examples: [
      'Tell me about GHOST',
      'What version is this?',
      'About page'
    ]
  }
]

/**
 * Get schema as a formatted string for AI context
 */
export function getSchemaForAI(): string {
  const schemaDescription = GHOST_SITE_SCHEMA.map(page => {
    let description = `\n## ${page.name} (${page.path})\n`
    description += `**Description:** ${page.description}\n`
    description += `**Category:** ${page.category}\n`
    description += `**Keywords:** ${page.keywords.join(', ')}\n`

    if (page.parameters && page.parameters.length > 0) {
      description += `**URL Parameters:**\n`
      page.parameters.forEach(param => {
        description += `  - ${param.name} (${param.type}${param.required ? ', required' : ''}): ${param.description}\n`
        if (param.example) {
          description += `    Example: ${param.example}\n`
        }
      })
    }

    if (page.examples && page.examples.length > 0) {
      description += `**Example queries:**\n`
      page.examples.forEach(ex => {
        description += `  - "${ex}"\n`
      })
    }

    return description
  }).join('\n')

  return `# GHOST Application Navigation Schema

This is a complete map of the GHOST application. Use this to generate deep links based on user queries.

${schemaDescription}

## Link Generation Instructions:
1. Analyze the user's query to determine their intent
2. Match keywords from the query to page keywords
3. Extract relevant parameters (account IDs, dates, resource types, etc.) from the query or response
4. Construct the URL using the path and parameters
5. Return 1-3 most relevant links with clear labels and descriptions
6. For parameters with format 'comma-separated', join array values with commas
7. For date parameters, use YYYY-MM-DD format
8. Always URL-encode parameter values

## Important Account IDs:
- 374673712317: Gov Master Account
- 083876038518: Monitoring Account
- 205950196477: Commercial Master Account
`
}

/**
 * Find matching pages based on keywords
 */
export function findMatchingPages(query: string, maxResults: number = 5): PageSchema[] {
  const lowerQuery = query.toLowerCase()
  const matches: Array<{ page: PageSchema; score: number }> = []

  for (const page of GHOST_SITE_SCHEMA) {
    let score = 0

    // Check if path keywords match
    for (const keyword of page.keywords) {
      if (lowerQuery.includes(keyword.toLowerCase())) {
        score += 10
      }
    }

    // Check if description matches
    if (page.description.toLowerCase().includes(lowerQuery)) {
      score += 5
    }

    // Check if examples match
    if (page.examples) {
      for (const example of page.examples) {
        if (example.toLowerCase().includes(lowerQuery) || lowerQuery.includes(example.toLowerCase())) {
          score += 15
        }
      }
    }

    if (score > 0) {
      matches.push({ page, score })
    }
  }

  // Sort by score and return top results
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(m => m.page)
}
