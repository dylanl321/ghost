import Fuse from 'fuse.js'

const logger = createLogger('CommandPalette')

/**
 * Command Palette Composable
 * Global state and logic for the Cmd+K command palette
 * Supports navigation, actions, fuzzy search, server-side search, AI routing, and context-aware suggestions
 */

export type CommandCategory =
  | 'navigation' | 'settings' | 'admin' | 'recent' | 'accounts'
  | 'actions' | 'favorites' | 'recentAccounts' | 'search-results' | 'ai' | 'fun'

export interface CommandItem {
  id: string
  label: string
  description?: string
  icon?: string
  to?: string
  action?: () => void
  category: CommandCategory
  keywords?: string[]
  // Extra metadata
  accountId?: string
  isGovCloud?: boolean
  highlight?: string   // Match highlight HTML from fuzzy-search API
  badge?: string       // Badge label (e.g. "Resource", "Instance")
  shortcut?: string    // Keyboard shortcut hint (e.g. "g d")
}

// Shared state (singleton pattern)
const isOpen = ref(false)
const searchQuery = ref('')
const recentCommands = ref<string[]>([])
const showShortcutsModal = ref(false)
const serverResults = ref<CommandItem[]>([])
const isServerSearching = ref(false)

// Drill-down state: when an account is selected, show sub-actions
const selectedAccount = ref<{ id: string; name: string; isGovCloud: boolean } | null>(null)

// g-prefix shortcut state
const pendingPrefix = ref<'g' | null>(null)
let prefixTimeout: ReturnType<typeof setTimeout> | null = null

// Debounce state for server search
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

// Singleton keyboard listener — only one instance should ever be registered
let keyboardListenerRegistered = false
let keyboardHandler: ((event: KeyboardEvent) => void) | null = null

// Maximum recent commands to track
const MAX_RECENT = 5
const RECENT_STORAGE_KEY = 'ghost-command-palette-recent'

// Tips shown when palette opens with empty query
const TIPS = [
  'Search accounts by name, ID, or business line',
  'Type a question to ask the AI assistant',
  'Press ? to see all keyboard shortcuts',
  'Try g+c to jump to costs, g+e for explorer',
  'Use action commands like "toggle theme" or "copy url"',
  'Search for admin panels by name or feature',
]

// Context-aware command suggestions by route prefix
const ROUTE_CONTEXT: Record<string, string[]> = {
  '/account/costs': ['nav-costs', 'nav-explorer', 'settings-accounts'],
  '/account/explorer': ['nav-org', 'nav-users', 'nav-costs'],
  '/account/org-chart': ['nav-explorer', 'nav-users'],
  '/account/user': ['nav-explorer', 'nav-my-access'],
  '/security': ['nav-explorer', 'nav-costs'],
  '/admin': ['admin-dashboard', 'admin-system', 'admin-configuration'],
  '/chat': ['nav-home', 'nav-explorer'],
  '/settings': ['settings-appearance', 'settings-prefs', 'settings-accounts'],
  '/reports': ['nav-reports', 'nav-scheduled-reports'],
}

export function useCommandPalette() {
  const router = useRouter()
  const route = useRoute()
  const { isAdmin } = useUserRoles()
  const accountsStore = useAwsAccountsStore()
  const { allPanels: adminPanels } = useAdminSearch()

  // Load recent commands from localStorage (runs once on first call)
  if (import.meta.client && recentCommands.value.length === 0) {
    try {
      const stored = localStorage.getItem(RECENT_STORAGE_KEY)
      if (stored) {
        recentCommands.value = JSON.parse(stored)
      }
    } catch (e) {
      logger.warn('Failed to load recent commands:', e)
    }
  }

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

  // All available commands (static + dynamic)
  const allCommands = computed<CommandItem[]>(() => {
    const commands: CommandItem[] = [
      // Navigation
      { id: 'nav-home', label: 'Dashboard', description: 'Go to home dashboard', icon: 'i-heroicons-home', to: '/', category: 'navigation', keywords: ['home', 'overview'], shortcut: 'g d' },
      { id: 'nav-explorer', label: 'Account Explorer', description: 'Search and browse accounts', icon: 'i-heroicons-magnifying-glass', to: '/account/explorer', category: 'navigation', keywords: ['search', 'accounts', 'browse'], shortcut: 'g e' },
      { id: 'nav-org', label: 'Organization Chart', description: 'View organization structure', icon: 'i-heroicons-building-library', to: '/account/org-chart', category: 'navigation', keywords: ['org', 'hierarchy', 'tree'], shortcut: 'g o' },
      { id: 'nav-costs', label: 'Cost Dashboard', description: 'View cost analytics', icon: 'i-heroicons-currency-dollar', to: '/account/costs', category: 'navigation', keywords: ['costs', 'spending', 'billing', 'budget'], shortcut: 'g c' },
      { id: 'nav-vmaas-costs', label: 'VMaaS Costs', description: 'View VMaaS actuals and server projections', icon: 'i-heroicons-server-stack', to: '/account/vmaas-costs', category: 'navigation', keywords: ['vmaas', 'servers', 'schedule', 'costs'] },
      { id: 'nav-users', label: 'Users & Access', description: 'User management', icon: 'i-heroicons-users', to: '/account/user', category: 'navigation', keywords: ['users', 'access', 'permissions'] },
      { id: 'nav-security', label: 'Security Health', description: 'Security findings and compliance', icon: 'i-heroicons-shield-exclamation', to: '/security', category: 'navigation', keywords: ['security', 'findings', 'compliance', 'vulnerabilities'], shortcut: 'g s' },
      { id: 'nav-reports', label: 'Dataset Reports', description: 'View dataset reports', icon: 'i-heroicons-server-stack', to: '/reports/datasets', category: 'navigation', keywords: ['reports', 'datasets', 'data', 'query'], shortcut: 'g r' },
      { id: 'nav-scheduled-reports', label: 'Scheduled Reports', description: 'View scheduled reports', icon: 'i-heroicons-calendar-days', to: '/reports/scheduled', category: 'navigation', keywords: ['scheduled', 'reports', 'automation'] },
      { id: 'nav-chat', label: 'AI Assistant', description: 'Chat with AI assistant', icon: 'i-heroicons-sparkles', to: '/chat', category: 'navigation', keywords: ['ai', 'chat', 'assistant', 'strands'], shortcut: 'g h' },
      { id: 'nav-profile', label: 'My Profile', description: 'View your profile', icon: 'i-heroicons-user-circle', to: '/profile', category: 'navigation', keywords: ['profile', 'me'], shortcut: 'g p' },
      { id: 'nav-changelog', label: 'Changelog', description: 'View version history and updates', icon: 'i-heroicons-document-text', to: '/changelog', category: 'navigation', keywords: ['changelog', 'updates', 'releases', 'version', 'history'], shortcut: 'g l' },
      { id: 'nav-support', label: 'Support Hub', description: 'Help and support resources', icon: 'i-heroicons-lifebuoy', to: '/support', category: 'navigation', keywords: ['support', 'help'] },
      { id: 'nav-support-docs', label: 'Documentation', description: 'Browse platform documentation', icon: 'i-heroicons-book-open', to: '/support/docs', category: 'navigation', keywords: ['documentation', 'docs', 'guide', 'help'] },
      { id: 'nav-support-roles', label: 'Roles Reference', description: 'AWS roles and permissions guide', icon: 'i-heroicons-identification', to: '/support/roles', category: 'navigation', keywords: ['roles', 'reference', 'aws', 'permissions'] },
      { id: 'nav-support-access', label: 'AWS Access Guide', description: 'How to request AWS access', icon: 'i-heroicons-key', to: '/support/aws-access', category: 'navigation', keywords: ['aws', 'access', 'request', 'onboarding'] },
      { id: 'nav-about', label: 'About GHOST', description: 'Platform information and features', icon: 'i-heroicons-information-circle', to: '/about', category: 'navigation', keywords: ['about', 'version', 'platform', 'info'] },
      { id: 'nav-my-access', label: 'My Access', description: 'View your AWS account access', icon: 'i-heroicons-finger-print', to: '/account/user/my-access', category: 'navigation', keywords: ['my', 'access', 'permissions', 'roles'] },

      // User Settings
      { id: 'settings-hub', label: 'Settings', description: 'Open settings hub', icon: 'i-heroicons-cog-6-tooth', to: '/settings', category: 'settings', keywords: ['settings', 'preferences'] },
      { id: 'settings-prefs', label: 'Preferences', description: 'Timezone, notifications', icon: 'i-heroicons-adjustments-horizontal', to: '/settings/preferences', category: 'settings', keywords: ['timezone', 'preferences', 'notifications'] },
      { id: 'settings-appearance', label: 'Appearance', description: 'Theme and display options', icon: 'i-heroicons-paint-brush', to: '/settings/appearance', category: 'settings', keywords: ['theme', 'dark', 'light', 'appearance'] },
      { id: 'settings-accounts', label: 'Account Preferences', description: 'Favorites and recent accounts', icon: 'i-heroicons-star', to: '/settings/accounts', category: 'settings', keywords: ['favorites', 'recent', 'accounts'] },
      { id: 'settings-notifications', label: 'Notifications', description: 'Notification preferences', icon: 'i-heroicons-bell', to: '/settings/notifications', category: 'settings', keywords: ['notifications', 'alerts', 'email', 'digest'] },

      // Action commands
      { id: 'action-toggle-theme', label: 'Toggle Dark/Light Theme', description: 'Switch between dark and light mode', icon: 'i-heroicons-sun', category: 'actions', keywords: ['theme', 'dark', 'light', 'mode', 'toggle', 'appearance'],
        action: () => {
          const colorMode = useColorMode()
          colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
        }
      },
      { id: 'action-copy-url', label: 'Copy Current URL', description: 'Copy page URL to clipboard', icon: 'i-heroicons-clipboard-document', category: 'actions', keywords: ['copy', 'url', 'link', 'clipboard', 'share'],
        action: () => {
          navigator.clipboard.writeText(window.location.href)
          // Show a brief toast
          const toast = document.createElement('div')
          toast.textContent = 'URL copied to clipboard!'
          toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:100001;padding:12px 20px;background:#065f46;color:#a7f3d0;border-radius:8px;font-size:14px;box-shadow:0 10px 40px rgba(0,0,0,0.2);opacity:0;transform:translateY(10px);transition:all 0.3s ease;'
          document.body.appendChild(toast)
          requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)' })
          setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(10px)'; setTimeout(() => toast.remove(), 300) }, 2000)
        }
      },
      { id: 'action-toggle-sidebar', label: 'Toggle Sidebar', description: 'Collapse or expand the navigation sidebar', icon: 'i-heroicons-bars-3', category: 'actions', keywords: ['sidebar', 'nav', 'collapse', 'expand', 'toggle', 'menu'],
        action: () => {
          const navStore = useNavigationStore()
          navStore.toggle(route.path)
        }
      },
      { id: 'action-refresh', label: 'Refresh Page Data', description: 'Reload the current page', icon: 'i-heroicons-arrow-path', category: 'actions', keywords: ['refresh', 'reload', 'data', 'update'],
        action: () => {
          window.location.reload()
        }
      },
    ]

    // Admin commands (only for admins) -- integrate useAdminSearch panels
    if (isAdmin.value) {
      // Top-level admin commands
      commands.push(
        { id: 'admin-dashboard', label: 'Admin Dashboard', description: 'Admin control panel', icon: 'i-heroicons-shield-check', to: '/admin', category: 'admin', keywords: ['admin', 'dashboard'] },
        { id: 'admin-notifications', label: 'Notification Settings', description: 'Admin notification management', icon: 'i-heroicons-bell-alert', to: '/admin/notifications', category: 'admin', keywords: ['notifications', 'admin', 'alerts'] },
      )

      // Map all admin search panels into command items
      for (const panel of adminPanels.value) {
        commands.push({
          id: `admin-panel-${panel.id}`,
          label: panel.label,
          description: `${panel.categoryLabel} — ${panel.description || ''}`,
          icon: panel.icon,
          to: panel.tab ? `${panel.to}?tab=${panel.tab}` : panel.to,
          category: 'admin',
          keywords: panel.keywords || []
        })
      }
    }

    return commands
  })

  // Fuse.js for local command search (typo-tolerant)
  const commandFuse = computed(() => {
    return new Fuse(allCommands.value, {
      keys: [
        { name: 'label', weight: 0.5 },
        { name: 'description', weight: 0.2 },
        { name: 'keywords', weight: 0.3 }
      ],
      threshold: 0.35,
      includeScore: true
    })
  })

  // Debounced server-side search
  function triggerServerSearch(query: string) {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)

    if (query.length < 3) {
      serverResults.value = []
      isServerSearching.value = false
      return
    }

    isServerSearching.value = true
    searchDebounceTimer = setTimeout(async () => {
      try {
        const res = await $fetch<{ success: boolean; data: any }>('/api/support/fuzzy-search', {
          params: { query, types: 'accounts', limit: 8 }
        })

        if (res.success && res.data?.results) {
          serverResults.value = res.data.results.map((r: any) => {
            const typeIcons: Record<string, string> = {
              account: 'i-heroicons-building-office-2',
              instance: 'i-heroicons-server',
              resource: 'i-heroicons-cube'
            }
            return {
              id: `search-${r.type}-${r.id}`,
              label: r.name,
              description: r.id,
              icon: typeIcons[r.type] || 'i-heroicons-magnifying-glass',
              to: r.type === 'account' ? `/account/explorer?search=${r.id}` : `/account/explorer?search=${r.metadata?.accountId || r.id}`,
              category: 'search-results' as CommandCategory,
              badge: r.type === 'account' ? undefined : r.type.charAt(0).toUpperCase() + r.type.slice(1),
              highlight: r.highlights?.[0],
              accountId: r.type === 'account' ? r.id : r.metadata?.accountId,
              isGovCloud: !!r.metadata?.govCloudAccountId
            }
          })
        }
      } catch (e) {
        logger.warn('Server search failed:', e)
        serverResults.value = []
      } finally {
        isServerSearching.value = false
      }
    }, 300)
  }

  // Watch search query to trigger server search
  watch(searchQuery, (query) => {
    const trimmed = query.trim()
    triggerServerSearch(trimmed)
  })

  // Random tip for empty state
  const currentTip = computed(() => {
    // Use a stable random based on time (changes every ~30s)
    const idx = Math.floor(Date.now() / 30000) % TIPS.length
    return TIPS[idx]
  })

  // Context-aware suggestions based on current route
  const contextualCommandIds = computed(() => {
    const path = route.path
    for (const [prefix, ids] of Object.entries(ROUTE_CONTEXT)) {
      if (path.startsWith(prefix)) {
        return ids
      }
    }
    return []
  })

  // Check if query looks like a question for AI
  function isQuestionQuery(query: string): boolean {
    const q = query.toLowerCase().trim()
    if (q.includes('?')) return true
    const questionStarts = ['how', 'what', 'why', 'who', 'where', 'when', 'can', 'show me', 'find', 'list', 'tell me']
    return questionStarts.some(s => q.startsWith(s))
  }

  // Filtered commands based on search query
  const filteredCommands = computed(() => {
    const query = searchQuery.value.toLowerCase().trim()
    if (!query) {
      return allCommands.value
    }

    // Easter egg: reveal fun commands for magic keywords
    const magicKeywords = ['summon', '/ghost', 'easter egg', 'easter']
    const isMagicQuery = magicKeywords.some(kw => query.startsWith(kw))

    // Fuzzy local command search via Fuse.js
    const fuseResults = commandFuse.value.search(query)
    const staticMatches = fuseResults.slice(0, 20).map(r => r.item)

    // Fuzzy search accounts and append top 5 matches
    const accountMatches = accountFuse.value.search(query).slice(0, 5).map(({ item }) => ({
      id: `account-${item.accountId}`,
      label: item.accountName,
      description: item.accountId,
      icon: 'i-heroicons-building-office-2',
      to: `/account/explorer?search=${item.accountId}`,
      category: 'accounts' as CommandCategory,
      accountId: item.accountId,
      isGovCloud: item.isGovCloud
    }))

    // Build AI suggestion if query looks like a question or has no results
    const aiCommands: CommandItem[] = []
    if (query.length > 2 && (isQuestionQuery(query) || (staticMatches.length === 0 && accountMatches.length === 0))) {
      aiCommands.push({
        id: 'ai-ask',
        label: `Ask AI: "${searchQuery.value.trim()}"`,
        description: 'Send this question to GHOST AI Assistant',
        icon: 'i-heroicons-sparkles',
        category: 'ai',
        action: () => {
          router.push({ path: '/chat', query: { q: searchQuery.value.trim() } })
        }
      })
    }

    if (isMagicQuery) {
      const funCommands: CommandItem[] = [
        {
          id: 'fun-parade',
          label: 'Summon Ghost Parade',
          description: 'Release the ghosts!',
          icon: 'i-fa6-solid-ghost',
          category: 'fun',
          keywords: ['summon', 'ghost', 'parade', 'easter'],
          action: () => {
            if (typeof window !== 'undefined' && (window as any).ghost?.haunt) {
              for (let i = 0; i < 8; i++) {
                setTimeout(() => (window as any).ghost.haunt(), i * 300)
              }
              console.log('%c👻 Ghost Parade summoned from the Command Palette!', 'color: #a855f7; font-size: 14px;')
            }
            useEventBus().emit('easter_egg.triggered', { command: 'ghost_parade' })
          }
        },
        {
          id: 'fun-dimension',
          label: 'Toggle Dark Dimension',
          description: 'Invert reality for 10 seconds',
          icon: 'i-heroicons-moon',
          category: 'fun',
          keywords: ['dark', 'dimension', 'invert', 'easter'],
          action: () => {
            document.body.style.filter = 'hue-rotate(180deg) invert(0.05)'
            document.body.style.transition = 'filter 0.5s ease'
            console.log('%c🌀 Entering the Dark Dimension...', 'color: #8b5cf6; font-size: 14px;')
            setTimeout(() => {
              document.body.style.filter = ''
              console.log('%c🌀 Reality restored.', 'color: #8b5cf6; font-size: 14px;')
            }, 10000)
            useEventBus().emit('easter_egg.triggered', { command: 'dark_dimension' })
          }
        },
        {
          id: 'fun-fortune',
          label: 'AWS Fortune Cookie',
          description: 'Receive wisdom from the cloud',
          icon: 'i-heroicons-sparkles',
          category: 'fun',
          keywords: ['fortune', 'cookie', 'wisdom', 'easter'],
          action: () => {
            const fortunes = [
              'Your next CloudFormation deploy will succeed on the first try.',
              'Beware: an untagged resource lurks in your account.',
              'A mysterious cost anomaly will reveal a hidden savings opportunity.',
              'The AWS gods smile upon your tagging strategy.',
              'An unexpected 200 OK brings great joy.',
              'Your S3 bucket policy is strong. Your passwords... less so.',
              'A wise engineer once said: always check the region dropdown.',
              'Fortune favors those who set budget alerts.',
              'You will discover a forgotten EC2 instance running since 2019.',
              'The cloud is just someone else\'s computer. Treat it kindly.',
            ]
            const fortune = fortunes[Math.floor(Math.random() * fortunes.length)]
            const toast = document.createElement('div')
            toast.innerHTML = `<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:20px;">🥠</span><span>${fortune}</span></div>`
            toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:100001;padding:16px 20px;background:linear-gradient(135deg,#1e1b4b,#312e81);color:#c4b5fd;border-radius:12px;font-size:14px;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.3);border:1px solid rgba(139,92,246,0.3);opacity:0;transform:translateY(10px);transition:all 0.3s ease;'
            document.body.appendChild(toast)
            requestAnimationFrame(() => {
              toast.style.opacity = '1'
              toast.style.transform = 'translateY(0)'
            })
            setTimeout(() => {
              toast.style.opacity = '0'
              toast.style.transform = 'translateY(10px)'
              setTimeout(() => toast.remove(), 300)
            }, 5000)
            useEventBus().emit('easter_egg.triggered', { command: 'fortune_cookie' })
          }
        },
        {
          id: 'fun-tarot',
          label: 'Draw a Tarot Card',
          description: 'What do the AWS cards foretell?',
          icon: 'i-heroicons-eye',
          category: 'fun',
          keywords: ['tarot', 'cards', 'fortune', 'easter'],
          action: () => {
            if (typeof window !== 'undefined' && (window as any).ghost?.tarot) {
              (window as any).ghost.tarot()
            }
            useEventBus().emit('easter_egg.triggered', { command: 'tarot_card' })
          }
        },
      ]
      return [...funCommands, ...staticMatches, ...accountMatches, ...serverResults.value, ...aiCommands]
    }

    return [...staticMatches, ...accountMatches, ...serverResults.value, ...aiCommands]
  })

  // Generate deep-link sub-actions for a selected account
  function buildAccountActions(acct: { id: string; name: string; isGovCloud: boolean }): CommandItem[] {
    const id = acct.id
    const name = acct.name
    return [
      { id: `acct-${id}-overview`, label: 'Overview', description: `${name} — account overview`, icon: 'i-heroicons-home', to: `/account/${id}?tab=overview`, category: 'navigation' },
      { id: `acct-${id}-resources`, label: 'Resources', description: `${name} — EC2, S3, Lambda, etc.`, icon: 'i-heroicons-server-stack', to: `/account/${id}?tab=resources`, category: 'navigation' },
      { id: `acct-${id}-policies`, label: 'Policies', description: `${name} — IAM policies`, icon: 'i-heroicons-shield-check', to: `/account/${id}?tab=policies`, category: 'navigation' },
      { id: `acct-${id}-security`, label: 'Security Findings', description: `${name} — security findings`, icon: 'i-heroicons-shield-exclamation', to: `/account/${id}?tab=security`, category: 'navigation' },
      { id: `acct-${id}-costs`, label: 'Costs', description: `${name} — cost breakdown`, icon: 'i-heroicons-currency-dollar', to: `/account/costs?account=${id}`, category: 'navigation' },
      { id: `acct-${id}-costs-trends`, label: 'Cost Trends', description: `${name} — cost trends over time`, icon: 'i-heroicons-arrow-trending-up', to: `/account/costs?account=${id}&chartTab=trends`, category: 'navigation' },
      { id: `acct-${id}-costs-forecast`, label: 'Cost Forecast', description: `${name} — projected spend`, icon: 'i-heroicons-chart-bar', to: `/account/costs?account=${id}&chartTab=forecast`, category: 'navigation' },
      { id: `acct-${id}-users`, label: 'Users', description: `${name} — users with access`, icon: 'i-heroicons-users', to: `/account/${id}/users`, category: 'navigation' },
      { id: `acct-${id}-groups`, label: 'Groups', description: `${name} — AD groups`, icon: 'i-heroicons-user-group', to: `/account/${id}/groups`, category: 'navigation' },
      { id: `acct-${id}-explorer`, label: 'View in Explorer', description: `${name} — full account detail`, icon: 'i-heroicons-magnifying-glass', to: `/account/explorer?search=${id}`, category: 'navigation' },
      ...(isAdmin.value ? [
        { id: `acct-${id}-pipelines`, label: 'Pipelines', description: `${name} — CI/CD pipelines`, icon: 'i-heroicons-arrow-path', to: `/account/${id}?tab=pipelines`, category: 'navigation' as CommandCategory },
        { id: `acct-${id}-notes`, label: 'Notes', description: `${name} — admin notes`, icon: 'i-heroicons-document-text', to: `/account/${id}?tab=notes`, category: 'navigation' as CommandCategory },
      ] : []),
    ]
  }

  // Drill-down commands for the currently selected account
  const accountDrillDown = computed<CommandItem[]>(() => {
    if (!selectedAccount.value) return []
    const actions = buildAccountActions(selectedAccount.value)
    const query = searchQuery.value.toLowerCase().trim()
    if (!query) return actions
    // Filter drill-down actions by search query
    return actions.filter(cmd => {
      const text = [cmd.label, cmd.description, ...(cmd.keywords || [])].join(' ').toLowerCase()
      return text.includes(query)
    })
  })

  // Grouped commands for display
  const groupedCommands = computed(() => {
    const groups: Record<string, CommandItem[]> = {
      suggested: [],
      recent: [],
      navigation: [],
      actions: [],
      settings: [],
      admin: [],
      accounts: [],
      'search-results': [],
      ai: [],
      fun: []
    }

    // When in drill-down mode, only show account sub-actions
    if (selectedAccount.value) {
      groups.navigation = accountDrillDown.value
      return groups
    }

    const query = searchQuery.value.trim()

    // Show context-aware suggestions when no query
    if (!query) {
      // Add recent commands first
      for (const id of recentCommands.value) {
        const cmd = allCommands.value.find(c => c.id === id)
        if (cmd) {
          groups.recent.push(cmd)
        }
      }

      // Add contextual suggestions
      for (const id of contextualCommandIds.value) {
        const cmd = allCommands.value.find(c => c.id === id)
        if (cmd && !groups.recent.some(r => r.id === cmd.id)) {
          groups.suggested.push(cmd)
        }
      }
    }

    // Group filtered commands
    for (const cmd of filteredCommands.value) {
      const groupKey = cmd.category as string
      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      // Don't duplicate recent or suggested commands
      if (!groups.recent.some(r => r.id === cmd.id) && !groups.suggested.some(r => r.id === cmd.id)) {
        groups[groupKey].push(cmd)
      }
    }

    // Limit account and search results
    if (groups.accounts.length > 8) {
      groups.accounts = groups.accounts.slice(0, 8)
    }
    if (groups['search-results'].length > 8) {
      groups['search-results'] = groups['search-results'].slice(0, 8)
    }

    return groups
  })

  // Open/close the palette
  function open() {
    isOpen.value = true
    searchQuery.value = ''
    serverResults.value = []
    selectedAccount.value = null
  }

  function close() {
    isOpen.value = false
    searchQuery.value = ''
    serverResults.value = []
    selectedAccount.value = null
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
      searchDebounceTimer = null
    }
  }

  function toggle() {
    if (isOpen.value) {
      close()
    } else {
      open()
    }
  }

  // Go back from account drill-down to main search
  function goBack() {
    selectedAccount.value = null
    searchQuery.value = ''
  }

  // Enter drill-down mode for an account
  function drillIntoAccount(accountId: string, accountName: string, isGovCloud: boolean) {
    selectedAccount.value = { id: accountId, name: accountName, isGovCloud }
    searchQuery.value = ''
  }

  // Execute a command — accounts enter drill-down, everything else navigates/runs
  function executeCommand(command: CommandItem) {
    // Account results: enter drill-down mode instead of navigating
    if ((command.category === 'accounts' || command.category === 'search-results') && command.accountId) {
      addRecentCommand(command.id)
      drillIntoAccount(command.accountId, command.label, command.isGovCloud || false)
      return
    }

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
        a: '/admin',
        p: '/profile',
        h: '/chat',
        r: '/reports/datasets',
        o: '/account/org-chart',
        l: '/changelog'
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

  // Register keyboard listener (singleton — only once globally)
  if (import.meta.client && !keyboardListenerRegistered) {
    keyboardHandler = handleKeydown
    document.addEventListener('keydown', keyboardHandler)
    keyboardListenerRegistered = true
  }

  return {
    // State
    isOpen: readonly(isOpen),
    searchQuery,
    recentCommands: readonly(recentCommands),
    showShortcutsModal,
    pendingPrefix: readonly(pendingPrefix),
    isServerSearching: readonly(isServerSearching),
    selectedAccount: readonly(selectedAccount),
    currentTip,

    // Computed
    allCommands,
    filteredCommands,
    groupedCommands,

    // Methods
    open,
    close,
    toggle,
    goBack,
    executeCommand,
    addRecentCommand
  }
}
