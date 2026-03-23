/**
 * Command Palette Composable
 * Global state and logic for the Cmd+K command palette
 */

export interface CommandItem {
  id: string
  label: string
  description?: string
  icon?: string
  to?: string
  action?: () => void
  category: 'navigation' | 'settings' | 'admin' | 'recent'
  keywords?: string[]
}

// Shared state (singleton pattern)
const isOpen = ref(false)
const searchQuery = ref('')
const recentCommands = ref<string[]>([])

// Maximum recent commands to track
const MAX_RECENT = 5
const RECENT_STORAGE_KEY = 'ghost-command-palette-recent'

export function useCommandPalette() {
  const router = useRouter()
  const { isAdmin } = useUserRoles()

  // Load recent commands from localStorage
  onMounted(() => {
    if (process.client) {
      try {
        const stored = localStorage.getItem(RECENT_STORAGE_KEY)
        if (stored) {
          recentCommands.value = JSON.parse(stored)
        }
      } catch (e) {
        console.warn('Failed to load recent commands:', e)
      }
    }
  })

  // Save recent command
  function addRecentCommand(commandId: string) {
    const updated = [commandId, ...recentCommands.value.filter(id => id !== commandId)].slice(0, MAX_RECENT)
    recentCommands.value = updated
    if (process.client) {
      try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(updated))
      } catch (e) {
        console.warn('Failed to save recent commands:', e)
      }
    }
  }

  // All available commands
  const allCommands = computed<CommandItem[]>(() => {
    const commands: CommandItem[] = [
      // Navigation
      { id: 'nav-home', label: 'Dashboard', description: 'Go to home dashboard', icon: 'i-heroicons-home', to: '/', category: 'navigation', keywords: ['home', 'overview'] },
      { id: 'nav-explorer', label: 'Account Explorer', description: 'Search and browse accounts', icon: 'i-heroicons-magnifying-glass', to: '/account/explorer', category: 'navigation', keywords: ['search', 'accounts'] },
      { id: 'nav-org', label: 'Organization Chart', description: 'View organization structure', icon: 'i-heroicons-building-library', to: '/account/org-chart', category: 'navigation', keywords: ['org', 'hierarchy', 'tree'] },
      { id: 'nav-costs', label: 'Cost Dashboard', description: 'View cost analytics', icon: 'i-heroicons-currency-dollar', to: '/account/costs', category: 'navigation', keywords: ['costs', 'spending', 'billing'] },
      { id: 'nav-users', label: 'Users & Access', description: 'User management', icon: 'i-heroicons-users', to: '/account/user', category: 'navigation', keywords: ['users', 'access'] },
      { id: 'nav-reports', label: 'Dataset Reports', description: 'View dataset reports', icon: 'i-heroicons-server-stack', to: '/reports/datasets', category: 'navigation', keywords: ['reports', 'datasets'] },
      { id: 'nav-chat', label: 'AI Assistant', description: 'Chat with AI assistant', icon: 'i-heroicons-sparkles', to: '/chat', category: 'navigation', keywords: ['ai', 'chat', 'assistant'] },
      { id: 'nav-profile', label: 'My Profile', description: 'View your profile', icon: 'i-heroicons-user-circle', to: '/profile', category: 'navigation', keywords: ['profile', 'me'] },

      // User Settings
      { id: 'settings-hub', label: 'Settings', description: 'Open settings hub', icon: 'i-heroicons-cog-6-tooth', to: '/settings', category: 'settings', keywords: ['settings', 'preferences'] },
      { id: 'settings-prefs', label: 'Preferences', description: 'Timezone, notifications', icon: 'i-heroicons-adjustments-horizontal', to: '/settings/preferences', category: 'settings', keywords: ['timezone', 'preferences', 'notifications'] },
      { id: 'settings-appearance', label: 'Appearance', description: 'Theme and display options', icon: 'i-heroicons-paint-brush', to: '/settings/appearance', category: 'settings', keywords: ['theme', 'dark', 'light', 'appearance'] },
      { id: 'settings-accounts', label: 'Account Preferences', description: 'Favorites and recent accounts', icon: 'i-heroicons-star', to: '/settings/accounts', category: 'settings', keywords: ['favorites', 'recent', 'accounts'] },
    ]

    // Admin commands (only for admins)
    if (isAdmin.value) {
      commands.push(
        { id: 'admin-dashboard', label: 'Admin Dashboard', description: 'Admin control panel', icon: 'i-heroicons-shield-check', to: '/admin', category: 'admin', keywords: ['admin', 'dashboard'] },
        { id: 'admin-configuration', label: 'Configuration', description: 'API keys, site config', icon: 'i-heroicons-cog-6-tooth', to: '/admin/configuration', category: 'admin', keywords: ['system', 'api', 'config', 'admin'] },
        { id: 'admin-users', label: 'Users & Access', description: 'Users, roles, journeys, feedback', icon: 'i-heroicons-user-group', to: '/admin/users', category: 'admin', keywords: ['users', 'roles', 'admin'] },
        { id: 'admin-content', label: 'Content & Reports', description: 'Share links, reports', icon: 'i-heroicons-document-duplicate', to: '/admin/content', category: 'admin', keywords: ['content', 'reports', 'admin'] },
        { id: 'admin-costs', label: 'Cost Management', description: 'Budget alerts, tag compliance', icon: 'i-heroicons-currency-dollar', to: '/admin/costs', category: 'admin', keywords: ['costs', 'budget', 'tags', 'admin'] },
        { id: 'admin-ai', label: 'AI & Agents', description: 'AI monitoring and testing', icon: 'i-heroicons-sparkles', to: '/admin/ai', category: 'admin', keywords: ['ai', 'agents', 'metrics', 'admin'] },
        { id: 'admin-system', label: 'System Health', description: 'Logs, health, notifications', icon: 'i-heroicons-server-stack', to: '/admin/system', category: 'admin', keywords: ['logs', 'monitoring', 'health', 'admin'] },
        { id: 'admin-pipelines', label: 'Pipeline Analytics', description: 'CI/CD analytics', icon: 'i-heroicons-arrow-path', to: '/admin/pipelines', category: 'admin', keywords: ['pipelines', 'cicd', 'admin'] },
      )
    }

    return commands
  })

  // Filtered commands based on search query
  const filteredCommands = computed(() => {
    const query = searchQuery.value.toLowerCase().trim()
    if (!query) {
      // Show recent + all commands grouped by category
      return allCommands.value
    }

    return allCommands.value.filter(cmd => {
      const searchText = [
        cmd.label,
        cmd.description,
        ...(cmd.keywords || [])
      ].join(' ').toLowerCase()
      return searchText.includes(query)
    })
  })

  // Grouped commands for display
  const groupedCommands = computed(() => {
    const groups: Record<string, CommandItem[]> = {
      recent: [],
      navigation: [],
      settings: [],
      admin: []
    }

    // Add recent commands first
    if (!searchQuery.value) {
      for (const id of recentCommands.value) {
        const cmd = allCommands.value.find(c => c.id === id)
        if (cmd) {
          groups.recent.push(cmd)
        }
      }
    }

    // Group filtered commands
    for (const cmd of filteredCommands.value) {
      if (!groups[cmd.category]) {
        groups[cmd.category] = []
      }
      // Don't duplicate recent commands
      if (!groups.recent.some(r => r.id === cmd.id)) {
        groups[cmd.category].push(cmd)
      }
    }

    return groups
  })

  // Open/close the palette
  function open() {
    isOpen.value = true
    searchQuery.value = ''
  }

  function close() {
    isOpen.value = false
    searchQuery.value = ''
  }

  function toggle() {
    if (isOpen.value) {
      close()
    } else {
      open()
    }
  }

  // Execute a command
  function executeCommand(command: CommandItem) {
    addRecentCommand(command.id)
    close()

    if (command.action) {
      command.action()
    } else if (command.to) {
      router.push(command.to)
    }
  }

  // Keyboard shortcut handler (Cmd+K / Ctrl+K)
  function handleKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault()
      toggle()
    }
    if (event.key === 'Escape' && isOpen.value) {
      close()
    }
  }

  // Register keyboard listener
  onMounted(() => {
    if (process.client) {
      document.addEventListener('keydown', handleKeydown)
    }
  })

  onUnmounted(() => {
    if (process.client) {
      document.removeEventListener('keydown', handleKeydown)
    }
  })

  return {
    // State
    isOpen: readonly(isOpen),
    searchQuery,
    recentCommands: readonly(recentCommands),

    // Computed
    allCommands,
    filteredCommands,
    groupedCommands,

    // Methods
    open,
    close,
    toggle,
    executeCommand,
    addRecentCommand
  }
}
