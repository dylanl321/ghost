/**
 * Admin Search Composable
 * Provides searchable index of all admin panels for instant discovery
 */

export interface AdminPanelItem {
  id: string
  label: string
  description?: string
  icon: string
  category: string      // Parent category (configuration, ai, system, etc.)
  categoryLabel: string // Display name for category
  to: string           // Navigation path
  tab?: string         // Tab slug if navigating to specific tab
  keywords?: string[]  // Additional search terms
}

// Shared state (singleton pattern for search input)
const searchQuery = ref('')

export function useAdminSearch() {
  const router = useRouter()

  // Full index of all admin panels organized by category
  const allPanels = computed<AdminPanelItem[]>(() => [
    // Configuration (2 tabs)
    {
      id: 'personal-api-access',
      label: 'Personal API Access',
      description: 'Manage your integration keys and API documentation',
      icon: 'i-heroicons-key',
      category: 'personal',
      categoryLabel: 'Settings',
      to: '/settings/api-access',
      keywords: ['api', 'keys', 'secrets', 'credentials', 'tokens']
    },
    {
      id: 'config-site-config',
      label: 'Site Configuration',
      description: 'Configure site-wide settings',
      icon: 'i-heroicons-cog-6-tooth',
      category: 'configuration',
      categoryLabel: 'Configuration',
      to: '/admin/configuration',
      tab: 'site-config',
      keywords: ['site', 'config', 'configuration', 'general']
    },
    {
      id: 'config-kirocrew',
      label: 'Kiro Crew Configuration',
      description: 'Publish Kiro Crew settings, files, and secrets',
      icon: 'i-heroicons-adjustments-horizontal',
      category: 'configuration',
      categoryLabel: 'Configuration',
      to: '/admin/kirocrew',
      keywords: ['kiro', 'crew', 'config', 'settings', 'files', 'secrets']
    },
    {
      id: 'config-oauth',
      label: 'OAuth & Applications',
      description: 'Inspect OAuth health, configuration, applications, activity, issues, and limits',
      icon: 'i-heroicons-key',
      category: 'configuration',
      categoryLabel: 'Configuration',
      to: '/admin/oauth',
      keywords: ['oauth', 'applications', 'clients', 'grants', 'tokens', 'mcp', 'crew', 'consent', 'registration', 'issues', 'quota']
    },

    // Users & Access (5 tabs)
    {
      id: 'users-preferences',
      label: 'User Preferences',
      description: 'Manage user preferences and profiles',
      icon: 'i-heroicons-user-circle',
      category: 'users',
      categoryLabel: 'Users & Access',
      to: '/admin/users',
      tab: 'preferences',
      keywords: ['user', 'preferences', 'settings', 'profile']
    },
    {
      id: 'users-roles',
      label: 'Roles & Permissions',
      description: 'Manage roles and access permissions',
      icon: 'i-heroicons-shield-check',
      category: 'users',
      categoryLabel: 'Users & Access',
      to: '/admin/users',
      tab: 'roles',
      keywords: ['roles', 'permissions', 'access', 'rbac', 'groups']
    },
    {
      id: 'users-usage-analytics',
      label: 'Usage Analytics',
      description: 'View user activity and usage metrics',
      icon: 'i-heroicons-chart-bar',
      category: 'users',
      categoryLabel: 'Users & Access',
      to: '/admin/users',
      tab: 'usage-analytics',
      keywords: ['usage', 'analytics', 'activity', 'metrics', 'statistics']
    },
    {
      id: 'users-journeys',
      label: 'User Journeys',
      description: 'Track user navigation paths and behavior',
      icon: 'i-heroicons-map',
      category: 'users',
      categoryLabel: 'Users & Access',
      to: '/admin/users',
      tab: 'user-journeys',
      keywords: ['user', 'journeys', 'paths', 'navigation', 'tracking']
    },
    {
      id: 'users-feedback',
      label: 'Feedback & Requests',
      description: 'View user feedback and feature requests',
      icon: 'i-heroicons-exclamation-triangle',
      category: 'users',
      categoryLabel: 'Users & Access',
      to: '/admin/users',
      tab: 'feedback',
      keywords: ['feedback', 'requests', 'issues', 'tickets', 'bugs']
    },

    // Content & Reports (3 tabs)
    {
      id: 'content-share-links',
      label: 'Share Links',
      description: 'Manage shared links',
      icon: 'i-heroicons-link',
      category: 'content',
      categoryLabel: 'Content & Reports',
      to: '/admin/content',
      tab: 'share-links',
      keywords: ['share', 'links', 'shared', 'public']
    },
    {
      id: 'content-scheduled-reports',
      label: 'Scheduled Reports',
      description: 'Manage scheduled report generation',
      icon: 'i-heroicons-calendar-days',
      category: 'content',
      categoryLabel: 'Content & Reports',
      to: '/admin/content',
      tab: 'reports',
      keywords: ['scheduled', 'reports', 'automation', 'cron']
    },
    {
      id: 'content-stored-reports',
      label: 'Stored Reports',
      description: 'View and manage stored reports',
      icon: 'i-heroicons-document-duplicate',
      category: 'content',
      categoryLabel: 'Content & Reports',
      to: '/admin/content',
      tab: 'stored-reports',
      keywords: ['stored', 'reports', 'history', 'archive']
    },

    // Cost Management (3 sub-pages)
    {
      id: 'costs-budget-alerts',
      label: 'Budget Alerts',
      description: 'Monitor budget alerts and configure thresholds',
      icon: 'i-heroicons-bell-alert',
      category: 'costs',
      categoryLabel: 'Cost Management',
      to: '/admin/costs/budget-alerts',
      keywords: ['budget', 'alerts', 'thresholds', 'spending', 'costs']
    },
    {
      id: 'costs-tag-compliance',
      label: 'Tag Compliance',
      description: 'Analyze cost allocation tag coverage',
      icon: 'i-heroicons-tag',
      category: 'costs',
      categoryLabel: 'Cost Management',
      to: '/admin/costs/tag-compliance',
      keywords: ['tag', 'compliance', 'coverage', 'cost', 'allocation', 'tagging']
    },
    {
      id: 'costs-data-validation',
      label: 'Data Validation',
      description: 'Validate cost data accuracy',
      icon: 'i-heroicons-clipboard-document-check',
      category: 'costs',
      categoryLabel: 'Cost Management',
      to: '/admin/costs/data-validation',
      keywords: ['validation', 'data', 'integrity', 'quality', 'accuracy', 'cost']
    },

    // AI & Agents (6 tabs)
    {
      id: 'ai-chat-monitor',
      label: 'Chat Monitor',
      description: 'Monitor AI chat sessions',
      icon: 'i-heroicons-chat-bubble-left-right',
      category: 'ai',
      categoryLabel: 'AI & Agents',
      to: '/admin/ai',
      tab: 'chat-monitor',
      keywords: ['chat', 'monitor', 'conversations', 'sessions', 'ai']
    },
    {
      id: 'ai-agent-logs',
      label: 'Agent Logs',
      description: 'View AI agent execution logs',
      icon: 'i-heroicons-document-text',
      category: 'ai',
      categoryLabel: 'AI & Agents',
      to: '/admin/ai',
      tab: 'agent-logs',
      keywords: ['agent', 'logs', 'execution', 'strands', 'ai']
    },
    {
      id: 'ai-agent-testing',
      label: 'Agent Testing',
      description: 'Test AI agents in sandbox',
      icon: 'i-heroicons-beaker',
      category: 'ai',
      categoryLabel: 'AI & Agents',
      to: '/admin/ai',
      tab: 'agent-testing',
      keywords: ['testing', 'agent', 'test', 'sandbox', 'ai']
    },
    {
      id: 'ai-agent-health',
      label: 'Agent Health',
      description: 'Monitor Strands AI agent health status',
      icon: 'i-heroicons-heart',
      category: 'ai',
      categoryLabel: 'AI & Agents',
      to: '/admin/ai',
      tab: 'agent-health',
      keywords: ['health', 'agent', 'strands', 'status', 'uptime']
    },
    {
      id: 'ai-metrics',
      label: 'AI Metrics',
      description: 'View AI performance metrics and analytics',
      icon: 'i-heroicons-chart-bar',
      category: 'ai',
      categoryLabel: 'AI & Agents',
      to: '/admin/ai',
      tab: 'ai-metrics',
      keywords: ['metrics', 'dashboard', 'performance', 'analytics', 'ai']
    },
    {
      id: 'ai-usage-collection',
      label: 'Usage Collection',
      description: 'Run and review organization AI usage collection',
      icon: 'i-heroicons-circle-stack',
      category: 'ai',
      categoryLabel: 'AI & Agents',
      to: '/admin/ai',
      tab: 'usage-collection',
      keywords: ['usage', 'collection', 'bedrock', 'mantle', 'errors', 'status']
    },
    {
      id: 'ai-mcp-usage',
      label: 'MCP Usage',
      description: 'View organization MCP tool usage and adoption',
      icon: 'i-heroicons-chart-bar-square',
      category: 'ai',
      categoryLabel: 'AI & Agents',
      to: '/admin/mcp-usage',
      keywords: ['mcp', 'usage', 'tools', 'adoption', 'calls', 'latency', 'fallbacks']
    },

    // System Health (4 tabs)
    {
      id: 'system-health-dashboard',
      label: 'Health Dashboard',
      description: 'View system health overview',
      icon: 'i-heroicons-server-stack',
      category: 'system',
      categoryLabel: 'System Health',
      to: '/admin/system',
      tab: 'health-dashboard',
      keywords: ['health', 'dashboard', 'status', 'system', 'uptime']
    },
    {
      id: 'system-logs',
      label: 'System Logs',
      description: 'View system activity logs',
      icon: 'i-heroicons-document-text',
      category: 'system',
      categoryLabel: 'System Health',
      to: '/admin/system',
      tab: 'system-logs',
      keywords: ['system', 'logs', 'audit', 'history', 'events', 'activity']
    },
    {
      id: 'system-notification-log',
      label: 'Notification Log',
      description: 'View sent notification history',
      icon: 'i-heroicons-bell',
      category: 'system',
      categoryLabel: 'System Health',
      to: '/admin/system',
      tab: 'notification-log',
      keywords: ['notifications', 'alerts', 'email', 'slack', 'log', 'sent']
    },
    {
      id: 'system-security-cache',
      label: 'Security Cache',
      description: 'Manage security data and Athena recomputation',
      icon: 'i-heroicons-shield-check',
      category: 'system',
      categoryLabel: 'System Health',
      to: '/admin/system',
      tab: 'security-cache',
      keywords: ['security', 'athena', 'findings', 'cache', 'recompute']
    },

    // Pipeline Analytics
    {
      id: 'pipelines-dashboard',
      label: 'Pipeline Dashboard',
      description: 'View pipeline analytics overview',
      icon: 'i-heroicons-arrow-path',
      category: 'pipelines',
      categoryLabel: 'Pipeline Analytics',
      to: '/admin/pipelines',
      keywords: ['pipelines', 'ci', 'cd', 'gitlab', 'builds', 'deployments']
    },
    {
      id: 'pipelines-repositories',
      label: 'Repositories',
      description: 'View repository pipeline metrics',
      icon: 'i-heroicons-folder',
      category: 'pipelines',
      categoryLabel: 'Pipeline Analytics',
      to: '/admin/pipelines/repositories',
      keywords: ['repositories', 'repos', 'gitlab', 'projects']
    },
    {
      id: 'pipelines-authors',
      label: 'Authors',
      description: 'View author pipeline activity',
      icon: 'i-heroicons-users',
      category: 'pipelines',
      categoryLabel: 'Pipeline Analytics',
      to: '/admin/pipelines/authors',
      keywords: ['authors', 'contributors', 'developers', 'commits']
    }
  ])

  // Filter panels based on search query
  const filteredPanels = computed<AdminPanelItem[]>(() => {
    const query = searchQuery.value.toLowerCase().trim()
    if (!query) {
      return []
    }

    return allPanels.value.filter(panel => {
      const searchText = [
        panel.label,
        panel.description,
        panel.categoryLabel,
        ...(panel.keywords || [])
      ].join(' ').toLowerCase()
      return searchText.includes(query)
    })
  })

  // Group filtered panels by category for display
  const groupedPanels = computed(() => {
    const groups: Record<string, AdminPanelItem[]> = {}

    for (const panel of filteredPanels.value) {
      if (!groups[panel.category]) {
        groups[panel.category] = []
      }
      groups[panel.category].push(panel)
    }

    return groups
  })

  // Check if there's an active search
  const isSearching = computed(() => searchQuery.value.trim().length > 0)

  // Navigate to a panel (with optional tab parameter)
  function navigateToPanel(panel: AdminPanelItem) {
    const path = panel.tab
      ? `${panel.to}?tab=${panel.tab}`
      : panel.to

    router.push(path)
    searchQuery.value = '' // Clear search after navigation
  }

  // Clear search
  function clearSearch() {
    searchQuery.value = ''
  }

  return {
    // State
    searchQuery,

    // Computed
    allPanels,
    filteredPanels,
    groupedPanels,
    isSearching,

    // Methods
    navigateToPanel,
    clearSearch
  }
}
