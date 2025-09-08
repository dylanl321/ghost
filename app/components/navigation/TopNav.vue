<template>
  <div class="bg-slate-800">
    <div class="h-16 mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-full">
        <!-- Left side - Breadcrumb only -->
        <div class="flex items-center gap-4 flex-1 min-w-0">
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
interface Props {
  breadcrumbs: Array<object>
}

const props = defineProps<Props>()

const { user, logout } = useOidcAuth()

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