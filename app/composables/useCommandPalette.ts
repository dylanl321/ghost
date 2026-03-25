import Fuse from 'fuse.js'

const logger = createLogger('CommandPalette')

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
  category: 'navigation' | 'settings' | 'admin' | 'recent' | 'accounts'
  keywords?: string[]
  // Extra metadata for account items
  accountId?: string
  isGovCloud?: boolean
}

// Shared state (singleton pattern)
const isOpen = ref(false)
const searchQuery = ref('')
const recentCommands = ref<string[]>([])
const showShortcutsModal = ref(false)

// g-prefix shortcut state
const pendingPrefix = ref<'g' | null>(null)
let prefixTimeout: ReturnType<typeof setTimeout> | null = null

// Maximum recent commands to track
const MAX_RECENT = 5
const RECENT_STORAGE_KEY = 'ghost-command-palette-recent'

export function useCommandPalette() {
  const router = useRouter()
  const { isAdmin } = useUserRoles()
  const accountsStore = useAwsAccountsStore()

  // Load recent commands from localStorage
  onMounted(() => {
    if (process.client) {
      try {
        const stored = localStorage.getItem(RECENT_STORAGE_KEY)
        if (stored) {
          recentCommands.value = JSON.parse(stored)
        }
      } catch (e) {
        logger.warn('Failed to load recent commands:', e)
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
        logger.warn('Failed to save recent commands:', e)
      }
    }
  }

  // Fuse.js instance for fuzzy account search
  const accountFuse = computed(() => {
    return new Fuse(accountsStore.accountsList, {
      keys: ['accountName', 'accountId', 'awsStandardAccountID', 'linesOfBusiness'],
      threshold: 0.4,
      includeScore: true
    })
  })

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
      return allCommands.value
    }

    const staticMatches = allCommands.value.filter(cmd => {
      const searchText = [
        cmd.label,
        cmd.description,
        ...(cmd.keywords || [])
      ].join(' ').toLowerCase()
      return searchText.includes(query)
    })

    // Fuzzy search accounts and append top 5 matches
    const accountMatches = accountFuse.value.search(query).slice(0, 5).map(({ item }) => ({
      id: `account-${item.accountId}`,
      label: item.accountName,
      description: item.accountId,
      icon: 'i-heroicons-building-office-2',
      to: `/account/explorer?search=${item.accountId}`,
      category: 'accounts' as const,
      accountId: item.accountId,
      isGovCloud: item.isGovCloud
    }))

    return [...staticMatches, ...accountMatches]
  })

  // Grouped commands for display
  const groupedCommands = computed(() => {
    const groups: Record<string, CommandItem[]> = {
      recent: [],
      navigation: [],
      settings: [],
      admin: [],
      accounts: []
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

    // Limit account results to 8
    if (groups.accounts.length > 8) {
      groups.accounts = groups.accounts.slice(0, 8)
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

  // Check if focus is in an input/textarea (skip shortcuts in that case)
  function isInInput(): boolean {
    const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase()
    return tag === 'input' || tag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable
  }

  // Keyboard shortcut handler (Cmd+K / Ctrl+K + g-prefix nav + ? for help)
  function handleKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault()
      toggle()
      return
    }

    if (event.key === 'Escape' && isOpen.value) {
      close()
      return
    }

    // Skip g-prefix and ? shortcuts when typing in an input or when modifier keys are held
    if (isInInput() || event.metaKey || event.ctrlKey || event.altKey) {
      return
    }

    // ? opens shortcuts modal
    if (event.key === '?' && !isOpen.value) {
      event.preventDefault()
      showShortcutsModal.value = true
      return
    }

    // g-prefix navigation shortcuts
    if (pendingPrefix.value === 'g') {
      // Clear the pending prefix regardless of which key arrives
      pendingPrefix.value = null
      if (prefixTimeout) {
        clearTimeout(prefixTimeout)
        prefixTimeout = null
      }

      const destinations: Record<string, string> = {
        d: '/',
        c: '/account/costs',
        e: '/account/explorer',
        s: '/security',
        a: '/admin'
      }

      if (destinations[event.key]) {
        event.preventDefault()
        router.push(destinations[event.key])
      }
      return
    }

    // Press g to start prefix sequence (only when palette is closed)
    if (event.key === 'g' && !isOpen.value) {
      event.preventDefault()
      pendingPrefix.value = 'g'
      // Clear prefix after 500ms if no second key arrives
      if (prefixTimeout) clearTimeout(prefixTimeout)
      prefixTimeout = setTimeout(() => {
        pendingPrefix.value = null
        prefixTimeout = null
      }, 500)
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
    showShortcutsModal,
    pendingPrefix: readonly(pendingPrefix),

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
