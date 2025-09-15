<template>
  <div class="bg-slate-800">
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
            @click="toggleMobileMenu"
            class="md:hidden"
          />
          
          <!-- Sidebar Toggle for Desktop -->
          <UButton
            v-if="!isMobile && !(route?.path && navigationStore.isPageProtected(route.path))"
            variant="ghost"
            color="gray"
            size="sm"
            :icon="navigationStore.isCollapsed ? 'i-heroicons-bars-3' : 'i-heroicons-bars-3-bottom-left'"
            @click="toggleSidebar"
            class="hidden md:flex transition-all duration-200 opacity-70 hover:opacity-100"
            :title="navigationStore.isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          />
          
          <UBreadcrumb :links="props.breadcrumbs" class="text-sm" />
        </div>

        <!-- Right side -->
        <div class="flex items-center gap-4">
          <!-- Universal Search - Compact on the right -->
          <div class="w-80">
            <UniversalSearch />
          </div>
          
          <div class="relative">
            <UDropdown
              :items="userMenuItems"
              :popper="{ placement: 'bottom-end' }"
            >
              <button class="flex items-center gap-3 text-gray-300 hover:text-white transition-colors">
                <div class="hidden sm:flex flex-col items-end">
                  <span class="text-sm font-medium leading-tight">
                    {{ user?.claims?.given_name }} {{ user?.claims?.family_name }}
                  </span>
                  <span class="text-xs text-gray-400 leading-tight">
                    {{ user?.claims?.email }}
                  </span>
                </div>
                <UserAvatar
                  :user-principal-name="user?.claims?.email"
                  :display-name="`${user?.claims?.given_name} ${user?.claims?.family_name}`"
                  size="sm"
                />
              </button>
            </UDropdown>
          </div>
        </div>
      </div>
    </div>

    <!-- Report Issue Modal -->
    <!-- <ReportIssueModal v-model="showReportModal" /> -->
  </div>
</template>

<script setup lang="ts">
import { useNavigationStore } from '~/stores/useNavigationStore'
import UserAvatar from '~/components/ui/UserAvatar.vue'

interface Props {
  breadcrumbs: Array<object>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'toggle-mobile-menu': []
}>()

const { user, logout } = useOidcAuth()
const navigationStore = useNavigationStore()
const route = useRoute()

// Mobile detection - SSR safe
const isMobile = computed(() => {
  // During SSR, assume desktop to avoid hydration mismatches
  if (process.server) return false
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
    console.log('Cannot collapse sidebar on this page - it is protected')
  }
}

// Computed property for direct user profile link
const myAccessLink = computed(() => {
  if (user.value?.claims?.email) {
    const username = convertToUsernameSlug(user.value.claims.email)
    return `/account/user/${username}`
  }
  return '/account/user/my-access' // Fallback to redirect page
})

// Build AWS console links section
const awsConsoleLinks = computed(() => {
  const links = [
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

const userMenuItems = computed(() => {
  const menuItems = [
    [
      {
        label: 'Profile',
        icon: 'i-heroicons-user-circle',
        to: '/profile'
      },
      {
        label: 'My Access',
        icon: 'i-heroicons-key',
        to: myAccessLink.value
      },
      {
        label: 'Admin',
        icon: 'i-heroicons-adjustments-horizontal',
        to: '/admin/home'
      }
    ]
  ]
  
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