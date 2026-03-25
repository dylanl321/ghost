<template>
  <div class="bg-[var(--ghost-surface)] dark:bg-slate-800 border-b border-[color:var(--ghost-border)] dark:border-slate-700 shadow-sm">
    <div class="h-16 mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-full">
        <!-- Left side - Mobile menu toggle + Breadcrumb -->
        <div class="flex items-center gap-4 flex-1 min-w-0">
          <!-- Mobile Menu Toggle -->
          <UButton
            v-if="isMobile"
            variant="ghost"
            color="gray"
            size="sm"
            icon="i-heroicons-bars-3"
            class="md:hidden"
            @click="toggleMobileMenu"
          />
          
          <!-- Sidebar Toggle for Desktop -->
          <UButton
            v-if="!isMobile && !(route?.path && navigationStore.isPageProtected(route.path))"
            variant="ghost"
            color="gray"
            size="sm"
            :icon="navigationStore.isCollapsed ? 'i-heroicons-bars-3' : 'i-heroicons-bars-3-bottom-left'"
            class="hidden md:flex transition-all duration-200 opacity-70 hover:opacity-100"
            :title="navigationStore.isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
            @click="toggleSidebar"
          />
          
          <UBreadcrumb :links="props.breadcrumbs" class="text-sm" />
        </div>

        <!-- Right side -->
        <div class="flex items-center gap-4">

          <!-- Universal Search - Compact on the right -->
          <div class="w-80">
            <UniversalSearch />
          </div>

          <!-- Theme (dark/light/system) -->
          <button
            type="button"
            class="group relative inline-flex items-center justify-center rounded-lg p-2 transition-all duration-200 opacity-75 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
            :title="`Theme: ${themeLabel} (click to cycle)`"
            @click="cycleTheme"
          >
            <UIcon :name="themeIcon" class="w-5 h-5 text-gray-700 dark:text-gray-300" />

            <!-- Tiny mode indicator (System / Light / Dark) -->
            <span class="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex items-center gap-1">
              <span
                class="w-1.5 h-1.5 rounded-full border transition-colors"
                :class="colorMode.preference === 'system'
                  ? 'bg-gradient-to-br from-purple-500 to-blue-500 border-transparent'
                  : 'bg-transparent border-gray-300 dark:border-gray-600'"
              />
              <span
                class="w-1.5 h-1.5 rounded-full border transition-colors"
                :class="colorMode.preference === 'light'
                  ? 'bg-amber-400 border-transparent'
                  : 'bg-transparent border-gray-300 dark:border-gray-600'"
              />
              <span
                class="w-1.5 h-1.5 rounded-full border transition-colors"
                :class="colorMode.preference === 'dark'
                  ? 'bg-slate-700 dark:bg-slate-200 border-transparent'
                  : 'bg-transparent border-gray-300 dark:border-gray-600'"
              />
            </span>
          </button>

          <!-- AI Assistant Chat Button -->
          <UButton
            v-if="siteConfigStore.isStrandsChatEnabled"
            variant="ghost"
            color="gray"
            size="sm"
            icon="i-heroicons-chat-bubble-left-right"
            :title="chatSidebar.isOpen.value ? 'Close AI Assistant' : 'Open AI Assistant'"
            @click="chatSidebar.toggle()"
            class="transition-all duration-200 opacity-70 hover:opacity-100"
          />

          <div class="relative">
            <UDropdown
              :items="userMenuItems"
              :popper="{ placement: 'bottom-end' }"
            >
              <button class="flex items-center gap-3 text-gray-900 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors">
                <div class="hidden sm:flex flex-col items-end">
                  <span class="text-sm font-medium leading-tight">
                    {{ user?.claims?.given_name }} {{ user?.claims?.family_name }}
                  </span>
                  <span class="text-xs text-gray-600 dark:text-gray-400 leading-tight">
                    {{ user?.claims?.email }}
                  </span>
                </div>
                <UserAvatar
                  :user-principal-name="user?.claims?.email ? String(user.claims.email) : undefined"
                  :display-name="`${String(user?.claims?.given_name || '')} ${String(user?.claims?.family_name || '')}`.trim()"
                  size="sm"
                />
              </button>
            </UDropdown>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { useNavigationStore } from '~/stores/useNavigationStore'
import { useSiteConfigStore } from '~/stores/useSiteConfigStore'
import UserAvatar from '~/components/ui/UserAvatar.vue'

const logger = createLogger('TopNav')

type BreadcrumbItem = {
  label: string
  to?: string
}

type UserMenuItem = {
  label: string
  icon?: string
  to?: string
  href?: string
  target?: string
  description?: string
  click?: () => void
}

interface Props {
  breadcrumbs: BreadcrumbItem[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'toggle-mobile-menu': []
}>()

const { user, logout } = useOidcAuth()
const navigationStore = useNavigationStore()
const siteConfigStore = useSiteConfigStore()
const chatSidebar = useChatSidebar()
const colorMode = useColorMode()
const route = useRoute()
const { can, isAdmin } = useUserRoles()

const themeIcon = computed(() => {
  switch (colorMode.preference) {
    case 'dark':
      return 'i-heroicons-moon'
    case 'light':
      return 'i-heroicons-sun'
    default:
      return 'i-heroicons-computer-desktop'
  }
})

const themeLabel = computed(() => {
  switch (colorMode.preference) {
    case 'dark':
      return 'Dark'
    case 'light':
      return 'Light'
    default:
      return 'System'
  }
})

function cycleTheme() {
  const current = colorMode.preference || 'system'
  colorMode.preference =
    current === 'system' ? 'light'
    : current === 'light' ? 'dark'
    : 'system'
}

// Mobile detection - SSR safe
const isMobile = computed(() => {
  // During SSR, assume desktop to avoid hydration mismatches
  if (import.meta.server) return false
  // On client, use the store value or fallback to window check
  return navigationStore.isMobile ?? (typeof window !== 'undefined' && window.innerWidth < 768)
})

// Mobile menu handling
const showMobileMenu = ref(false)

const toggleMobileMenu = () => {
  emit('toggle-mobile-menu')
}

const toggleSidebar = () => {
  // Handle SSR where route might be undefined
  if (!route?.path) return
  
  const success = navigationStore.toggle(route.path)
  if (!success) {
    logger.info('Cannot collapse sidebar on this page - it is protected')
  }
}

// Computed property for direct user profile link
const myAccessLink = computed(() => {
  if (user.value?.claims?.email) {
    const username = convertToUsernameSlug(String(user.value.claims.email))
    return `/account/user/${username}`
  }
  return '/account/user/my-access' // Fallback to redirect page
})

// Build AWS console links section
const awsConsoleLinks = computed<UserMenuItem[]>(() => {
  const links: UserMenuItem[] = [
    {
      label: 'AWS Commercial Console',
      icon: 'i-heroicons-cloud',
      href: createCommercialLoginLink(),
      target: '_blank',
      description: 'Access AWS Commercial environment'
    },
    {
      label: 'AWS GovCloud Console',
      icon: 'i-heroicons-shield-check',
      href: createGovCloudLoginLink(),
      target: '_blank',
      description: 'Access AWS GovCloud environment'
    }
  ]
  
  return links
})

const userMenuItems = computed<UserMenuItem[][]>(() => {
  // Build main menu items
  const mainMenuItems: UserMenuItem[] = [
    {
      label: 'Profile',
      icon: 'i-heroicons-user-circle',
      to: '/profile'
    },
    {
      label: 'My Access',
      icon: 'i-heroicons-key',
      to: myAccessLink.value
    }
  ]

  // Add Admin menu item only if user has admin permissions
  if (isAdmin.value || can('admin.logs') || can('admin.issues')) {
    mainMenuItems.push({
      label: 'Admin',
      icon: 'i-heroicons-adjustments-horizontal',
      to: '/admin'
    })
  }

  const menuItems = [mainMenuItems]

  // Add AWS console links if user has access
  if (awsConsoleLinks.value.length > 0) {
    menuItems.push(awsConsoleLinks.value)
  }

  // Add sign out as final section
  menuItems.push([
    {
      label: 'Sign Out',
      icon: 'i-heroicons-arrow-right-on-rectangle',
      click: () => logout()
    }
  ])

  return menuItems
})

// Global window interface for console logs
declare global {
  interface Window {
    _capturedLogs?: Array<{
      timestamp: number
      type: 'log' | 'error' | 'warn' | 'info'
      message: string
      stack?: string
    }>
  }
}
</script>