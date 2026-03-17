/**
 * Admin Search Composable
 * Provides searchable index of all admin panels for instant discovery
 */

export interface AdminPanelItem {
  id: string
  label: string
  description?: string
  icon: string
  category: string      // Parent category (settings, ai, monitoring, etc.)
  categoryLabel: string // Display name for category
  to: string           // Navigation path
  tab?: number         // Tab index if navigating to specific tab
  keywords?: string[]  // Additional search terms
}

// Shared state (singleton pattern for search input)
const searchQuery = ref('')

export function useAdminSearch() {
  const router = useRouter()

  // Full index of all admin panels organized by category
  const allPanels = computed<AdminPanelItem[]>(() => [
    // System Settings (6 tabs)
    {
      id: 'settings-api-keys',
      label: 'API Keys',
      description: 'Manage API keys and secrets',
      icon: 'i-heroicons-key',
      category: 'settings',
      categoryLabel: 'System Settings',
      to: '/admin/settings',
      tab: 0,
      keywords: ['api', 'keys', 'secrets', 'credentials', 'tokens']
    },
    {
      id: 'settings-site-config',
      label: 'Site Configuration',
      description: 'Configure site-wide settings',
      icon: 'i-heroicons-cog-6-tooth',
      category: 'settings',
      categoryLabel: 'System Settings',
      to: '/admin/settings',
      tab: 1,
      keywords: ['site', 'config', 'configuration', 'general']
    },
    {
      id: 'settings-notifications',
      label: 'Notifications',
      description: 'Configure notification settings',
      icon: 'i-heroicons-bell',
      category: 'settings',
      categoryLabel: 'System Settings',
      to: '/admin/settings',
      tab: 2,
      keywords: ['notifications', 'alerts', 'email', 'slack']
    },
    {
      id: 'settings-budget-alerts',
      label: 'Budget Alerts',
      description: 'Configure budget alert thresholds',
      icon: 'i-heroicons-bell-alert',
      category: 'settings',
      categoryLabel: 'System Settings',
      to: '/admin/settings',
      tab: 3,
      keywords: ['budget', 'alerts', 'thresholds', 'spending', 'costs']
    },
    {
      id: 'settings-alert-metrics',
      label: 'Alert Metrics',
      description: 'View alert delivery metrics',
      icon: 'i-heroicons-chart-bar',
      category: 'settings',
      categoryLabel: 'System Settings',
      to: '/admin/settings',
      tab: 4,
      keywords: ['metrics', 'alerts', 'delivery', 'statistics']
    },
    {
      id: 'settings-alert-settings',
      label: 'Alert Settings',
      description: 'Configure alert behavior and rules',
      icon: 'i-heroicons-adjustments-horizontal',
      category: 'settings',
      categoryLabel: 'System Settings',
      to: '/admin/settings',
      tab: 5,
      keywords: ['alert', 'settings', 'rules', 'behavior']
    },

    // User Management (2 tabs)
    {
      id: 'users-preferences',
      label: 'User Preferences',
      description: 'Manage user preferences',
      icon: 'i-heroicons-user-circle',
      category: 'users',
      categoryLabel: 'User Management',
      to: '/admin/users',
      tab: 0,
      keywords: ['user', 'preferences', 'settings', 'profile']
    },
    {
      id: 'users-roles',
      label: 'Roles & Permissions',
      description: 'Manage roles and access permissions',
      icon: 'i-heroicons-shield-check',
      category: 'users',
      categoryLabel: 'User Management',
      to: '/admin/users',
      tab: 1,
      keywords: ['roles', 'permissions', 'access', 'rbac', 'groups']
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
      tab: 0,
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
      tab: 1,
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
      tab: 2,
      keywords: ['stored', 'reports', 'history', 'archive']
    },

    // AI Operations (5 tabs)
    {
      id: 'ai-chat-monitor',
      label: 'Chat Monitor',
      description: 'Monitor AI chat sessions',
      icon: 'i-heroicons-chat-bubble-left-right',
      category: 'ai',
      categoryLabel: 'AI Operations',
      to: '/admin/ai',
      tab: 0,
      keywords: ['chat', 'monitor', 'conversations', 'sessions', 'ai']
    },
    {
      id: 'ai-agent-logs',
      label: 'Agent Logs',
      description: 'View AI agent execution logs',
      icon: 'i-heroicons-document-text',
      category: 'ai',
      categoryLabel: 'AI Operations',
      to: '/admin/ai',
      tab: 1,
      keywords: ['agent', 'logs', 'execution', 'strands', 'ai']
    },
    {
      id: 'ai-data-validation',
      label: 'Data Validation',
      description: 'Validate AI data integrity',
      icon: 'i-heroicons-clipboard-document-check',
      category: 'ai',
      categoryLabel: 'AI Operations',
      to: '/admin/ai',
      tab: 2,
      keywords: ['validation', 'data', 'integrity', 'quality', 'ai']
    },
    {
      id: 'ai-agent-testing',
      label: 'Agent Testing',
      description: 'Test AI agents',
      icon: 'i-heroicons-beaker',
      category: 'ai',
      categoryLabel: 'AI Operations',
      to: '/admin/ai',
      tab: 3,
      keywords: ['testing', 'agent', 'test', 'sandbox', 'ai']
    },
    {
      id: 'ai-metrics',
      label: 'Metrics Dashboard',
      description: 'View AI performance metrics',
      icon: 'i-heroicons-chart-bar',
      category: 'ai',
      categoryLabel: 'AI Operations',
      to: '/admin/ai',
      tab: 4,
      keywords: ['metrics', 'dashboard', 'performance', 'analytics', 'ai']
    },

    // System Monitoring (4 tabs - Agent Logs moved to AI Operations)
    {
      id: 'monitoring-activity-logs',
      label: 'Activity Logs',
      description: 'View system activity logs',
      icon: 'i-heroicons-document-text',
      category: 'monitoring',
      categoryLabel: 'System Monitoring',
      to: '/admin/monitoring',
      tab: 0,
      keywords: ['activity', 'logs', 'audit', 'history', 'events']
    },
    {
      id: 'monitoring-user-journeys',
      label: 'User Journeys',
      description: 'Track user navigation paths',
      icon: 'i-heroicons-map',
      category: 'monitoring',
      categoryLabel: 'System Monitoring',
      to: '/admin/monitoring',
      tab: 1,
      keywords: ['user', 'journeys', 'paths', 'navigation', 'tracking']
    },
    {
      id: 'monitoring-service-health',
      label: 'Service Health',
      description: 'Monitor service health status',
      icon: 'i-heroicons-heart',
      category: 'monitoring',
      categoryLabel: 'System Monitoring',
      to: '/admin/monitoring',
      tab: 2,
      keywords: ['health', 'service', 'status', 'uptime', 'heartbeat']
    },
    {
      id: 'monitoring-issues',
      label: 'Issues & Tickets',
      description: 'Manage system issues and tickets',
      icon: 'i-heroicons-exclamation-triangle',
      category: 'monitoring',
      categoryLabel: 'System Monitoring',
      to: '/admin/monitoring',
      tab: 3,
      keywords: ['issues', 'tickets', 'bugs', 'problems', 'errors']
    },

    // Security Data
    {
      id: 'security-data',
      label: 'Security Data Management',
      description: 'Manage security dashboard data and Athena recomputation',
      icon: 'i-heroicons-shield-check',
      category: 'security',
      categoryLabel: 'Security Data',
      to: '/admin/security',
      keywords: ['security', 'athena', 'findings', 'cache', 'recompute', 'scheduler']
    },

    // Pipeline Analytics (separate pages, no tabs)
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
    const path = panel.tab !== undefined
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
