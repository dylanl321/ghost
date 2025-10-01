<template>
  <!-- Mobile Overlay -->
  <div 
    v-if="isMobile && showMobileMenu"
    class="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
    @click="closeMobileMenu"
  ></div>
  
  <!-- Sidebar -->
  <div
    class="fixed inset-y-0 left-0 bg-slate-900 flex flex-col transition-all duration-300 ease-in-out overflow-hidden shadow-xl"
    :class="{
      // Desktop collapsed/expanded states
      'w-16 z-40': !isMobile && navigationStore.isCollapsed && !navigationStore.isHovered,
      'w-64 z-40': !isMobile && (!navigationStore.isCollapsed || navigationStore.isHovered),
      'shadow-2xl': !isMobile && navigationStore.isCollapsed && navigationStore.isHovered,
      
      // Mobile states
      'w-64 z-50 transform translate-x-0': isMobile && showMobileMenu,
      'w-64 z-50 transform -translate-x-full': isMobile && !showMobileMenu
    }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- Logo Section -->
    <div class="h-16 border-b border-slate-700 flex items-center justify-center px-4 flex-shrink-0 relative overflow-hidden">
      <!-- Expanded state content -->
      <div 
        class="flex items-center justify-between w-full transition-all duration-300"
        :class="{
          'opacity-0 pointer-events-none': navigationStore.isCollapsed && !navigationStore.isHovered,
          'opacity-100': !navigationStore.isCollapsed || navigationStore.isHovered
        }"
      >
        <div class="flex items-center gap-3 min-w-0">
          <img 
            src="@/assets/images/MS-logoWhite.png" 
            alt="Logo" 
            class="h-8 w-auto flex-shrink-0"
          >
        </div>
        
        <!-- Collapse Toggle Button -->
        <UButton
          v-if="canCollapse"
          variant="ghost"
          color="gray"
          size="xs"
          :icon="navigationStore.isCollapsed ? 'i-heroicons-chevron-right' : 'i-heroicons-chevron-left'"
          class="flex-shrink-0 transition-all duration-200 opacity-60 hover:opacity-100"
          @click="toggleSidebar"
          :title="getToggleTooltip()"
        />
      </div>
      
      <!-- Collapsed state icon -->
      <div 
        class="absolute inset-0 flex items-center justify-center transition-all duration-300"
        :class="{
          'opacity-100': navigationStore.isCollapsed && !navigationStore.isHovered,
          'opacity-0 pointer-events-none': !navigationStore.isCollapsed || navigationStore.isHovered
        }"
      >
        <img 
          src="@/assets/images/MS-logoWhite-icon.png" 
          alt="Logo" 
          class="w-8 h-8 flex-shrink-0"
        >
      </div>
    </div>

    <!-- Navigation Menu -->
    <div class="flex-1 overflow-y-auto py-6 overflow-x-hidden">
      <nav class="space-y-1 px-3 min-w-0">
        <template v-for="item in navigationItems" :key="item.label">
          <!-- Menu Item -->
          <div class="text-slate-400">
            <!-- Parent Item -->
            <div 
              class="flex items-center px-3 py-2 rounded-md cursor-pointer hover:bg-slate-800 transition-colors relative group overflow-hidden"
              :class="{ 'text-white bg-slate-800': isActive(item) }"
              @click="toggleDropdown(item)"
            >
              <UIcon :name="item.icon" class="flex-shrink-0 w-5 h-5" />
              <div 
                class="flex items-center justify-between flex-1 ml-3 min-w-0 transition-all duration-300"
                :class="{
                  'opacity-0 w-0': navigationStore.isCollapsed && !navigationStore.isHovered,
                  'opacity-100 w-full': !navigationStore.isCollapsed || navigationStore.isHovered
                }"
              >
                <span class="text-sm font-medium truncate">
                  {{ item.label }}
                </span>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <UBadge
                    v-if="item.inDevelopment"
                    color="yellow"
                    size="xs"
                    :title="item.developmentMessage"
                  >
                    WIP
                  </UBadge>
                  <UIcon 
                    v-if="item.children"
                    :name="isOpen(item) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                    class="w-4 h-4"
                  />
                </div>
              </div>
              
              <!-- Tooltip for collapsed state -->
              <div 
                v-if="navigationStore.isCollapsed && !navigationStore.isHovered"
                class="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 border border-slate-600"
              >
                {{ item.label }}
                <div class="absolute left-0 top-1/2 transform -translate-x-1 -translate-y-1/2 w-0 h-0 border-r-4 border-r-slate-800 border-t-2 border-b-2 border-t-transparent border-b-transparent"></div>
              </div>
            </div>

            <!-- Dropdown Items (delay showing on hover expansion) -->
            <div 
              v-if="item.children"
              v-show="isOpen(item) && (!navigationStore.isCollapsed || (navigationStore.isHovered && showChildrenAfterHover))"
              class="mt-1 ml-4 space-y-1 transition-all duration-200"
            >
              <NuxtLink
                v-for="child in item.children"
                :key="child.label"
                :to="child.to"
                class="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-slate-800 transition-colors relative group"
                :class="{ 'text-white bg-slate-800': isActive(child) }"
                @click.stop
              >
                <UIcon :name="child.icon" class="flex-shrink-0 w-4 h-4" />
                <span class="font-medium transition-opacity duration-200">{{ child.label }}</span>
              </NuxtLink>
            </div>

            <!-- Single Item Link -->
            <NuxtLink
              v-else
              :to="item.to"
              class="flex items-center px-3 py-2 rounded-md text-sm hover:bg-slate-800 transition-colors relative group overflow-hidden"
              :class="{ 'text-white bg-slate-800': isActive(item) }"
            >
              <UIcon :name="item.icon" class="flex-shrink-0 w-5 h-5" />
              <span 
                class="font-medium ml-3 truncate transition-all duration-300"
                :class="{
                  'opacity-0 w-0': navigationStore.isCollapsed && !navigationStore.isHovered,
                  'opacity-100 w-full': !navigationStore.isCollapsed || navigationStore.isHovered
                }"
              >
                {{ item.label }}
              </span>
              
              <!-- Tooltip for collapsed state -->
              <div 
                v-if="navigationStore.isCollapsed && !navigationStore.isHovered"
                class="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 border border-slate-600"
              >
                {{ item.label }}
                <div class="absolute left-0 top-1/2 transform -translate-x-1 -translate-y-1/2 w-0 h-0 border-r-4 border-r-slate-800 border-t-2 border-b-2 border-t-transparent border-b-transparent"></div>
              </div>
            </NuxtLink>
          </div>
        </template>
      </nav>
    </div>

    <!-- Footer Links -->
    <div class="border-t border-slate-700 flex-shrink-0">
      <!-- Support Link -->
      <div class="px-3 py-2">
        <NuxtLink
          to="/support"
          class="flex items-center px-3 py-2 rounded-md text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors w-full relative group overflow-hidden"
          :class="{ 'text-white bg-slate-800': route.path.startsWith('/support') }"
        >
          <UIcon name="i-heroicons-lifebuoy" class="flex-shrink-0 w-5 h-5" />
          <span
            class="font-medium ml-3 truncate transition-all duration-300"
            :class="{
              'opacity-0 w-0': navigationStore.isCollapsed && !navigationStore.isHovered,
              'opacity-100 w-full': !navigationStore.isCollapsed || navigationStore.isHovered
            }"
          >
            Support & Help
          </span>

          <!-- Tooltip for collapsed state -->
          <div
            v-if="navigationStore.isCollapsed && !navigationStore.isHovered"
            class="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 border border-slate-600"
          >
            Support & Help
            <div class="absolute left-0 top-1/2 transform -translate-x-1 -translate-y-1/2 w-0 h-0 border-r-4 border-r-slate-800 border-t-2 border-b-2 border-t-transparent border-b-transparent"></div>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useNavigationStore } from '~/stores/useNavigationStore'

const route = useRoute()
const navigationStore = useNavigationStore()

// Mobile detection - SSR safe
const isMobile = computed(() => {
  // During SSR, assume desktop to avoid hydration mismatches
  if (process.server) return false
  // On client, use the store value or fallback to window check
  return navigationStore.isMobile ?? (typeof window !== 'undefined' && window.innerWidth < 768)
})
const openItems = ref(new Set(['Accounts'])) // Keep Accounts dropdown open by default

// Computed properties
const canCollapse = computed(() => {
  // Handle SSR where route might be undefined
  if (!route?.path) return true
  return !navigationStore.isPageProtected(route.path)
})

const isActive = (item) => {
  // Handle SSR where route might be undefined
  if (!route?.path) return false
  
  if (item.to) {
    return route.path === item.to
  }
  if (item.children) {
    return item.children.some(child => route.path === child.to)
  }
  return false
}

const isOpen = (item) => {
  return openItems.value.has(item.label)
}

const toggleDropdown = (item) => {
  if (!item.children) return
  
  // If sidebar is collapsed and not hovered, expand the sidebar instead
  if (navigationStore.isCollapsed && !navigationStore.isHovered) {
    navigationStore.expand()
    return
  }
  
  if (openItems.value.has(item.label)) {
    openItems.value.delete(item.label)
  } else {
    openItems.value.add(item.label)
  }
}

// Mouse interaction handlers
const showChildrenAfterHover = ref(false)

const handleMouseEnter = () => {
  navigationStore.setHovered(true)
  // add a short delay before showing children to avoid flicker
  showChildrenAfterHover.value = false
  setTimeout(() => {
    if (navigationStore.isHovered) {
      showChildrenAfterHover.value = true
    }
  }, 120)
}

const handleMouseLeave = () => {
  navigationStore.setHovered(false)
  showChildrenAfterHover.value = false
}

// Toggle sidebar with protection check
const toggleSidebar = () => {
  // Handle SSR where route might be undefined
  if (!route?.path) return
  
  if (!canCollapse.value) {
    // Provide visual feedback for protected pages
    const rule = navigationStore.getPageRule(route.path)
    console.log(`Cannot collapse sidebar: ${rule?.reason || 'This page requires full navigation'}`)
    
    // Add a subtle shake animation to indicate it's not allowed
    if (process.client) {
      const button = document.querySelector('.animate-pulse')
      if (button) {
        button.classList.add('animate-bounce')
        setTimeout(() => button.classList.remove('animate-bounce'), 600)
      }
    }
    return
  }
  
  const success = navigationStore.toggle(route.path)
  if (!success) {
    console.log('Failed to toggle sidebar state')
  }
}

// Tooltip helper
const getToggleTooltip = () => {
  if (!canCollapse.value) {
    return 'Cannot collapse on this page'
  }
  return navigationStore.isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
}

// Watch for route changes to handle auto-collapse/expand
watch(() => route?.path, (newPath, oldPath) => {
  if (newPath) {
    navigationStore.handleRouteChange(newPath, oldPath)
  }
}, { immediate: true })

// Additional watcher to enforce state consistency
watch(() => [route?.path, navigationStore.isCollapsed], ([currentPath, collapsed]) => {
  // Double-check: If we're on a protected page and somehow collapsed, force expand
  if (currentPath && navigationStore.isPageProtected(currentPath) && collapsed) {
    console.log(`State inconsistency detected: Protected page ${currentPath} is collapsed - forcing expand`)
    navigationStore.expand()
  }
}, { immediate: true })

// Handle responsive behavior
const updateMobileState = () => {
  if (typeof window !== 'undefined') {
    const isMobile = window.innerWidth < 768
    navigationStore.setMobile(isMobile)
  }
}

// Initialize responsive behavior
onMounted(() => {
  updateMobileState()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateMobileState)
  }
  
  // Handle initial page load
  nextTick(() => {
    if (route?.path) {
      navigationStore.handleRouteChange(route.path)
    }
  })
})

// Mobile menu state
const showMobileMenu = ref(false)

const closeMobileMenu = () => {
  showMobileMenu.value = false
}

// Watch for mobile menu changes from parent components
watch(() => isMobile.value, (mobile) => {
  if (!mobile) {
    showMobileMenu.value = false
  }
})

// Expose mobile menu control
defineExpose({
  toggleMobileMenu: () => {
    showMobileMenu.value = !showMobileMenu.value
  },
  closeMobileMenu
})

// Cleanup on unmount
if (process.client) {
  onBeforeUnmount(() => {
    window.removeEventListener('resize', updateMobileState)
  })
}

const navigationItems = [
  {
    label: 'Accounts',
    icon: 'i-heroicons-squares-2x2',
    defaultOpen: true,
    collapsed: false,
    children: [
      {
        label: 'Overview',
        to: '/',
        icon: 'i-heroicons-home'
      },
      {
        label: 'Explorer',
        to: '/account/explorer',
        icon: 'i-heroicons-magnifying-glass'
      },
      {
        label: 'Organization Chart',
        to: '/account/org-chart',
        icon: 'i-heroicons-building-library'
      },
      {
        label: "Cost Dashboard",
        to: "/account/costs",
        icon: "i-heroicons-currency-dollar",
        collapseRule: 'default-collapsed' // This page benefits from more screen space
      },
      {
        label: "Users",
        to: "/account/user",
        icon: "i-heroicons-users"
      },
      {
        label: "AWS Assistant",
        to: "/chat",
        icon: "i-heroicons-chat-bubble-left-right"
      },

      // NOTE: disabling this until the scorecard page is working
      // {
      //   label: "Scorecard",
      //   to: "/org-scorecard",
      //   icon: "i-heroicons-chart-bar"
      // }
    ]
  },
  // {
  //   label: 'Reports',
  //   icon: 'i-heroicons-currency-dollar',
  //   children: [
  //     {
  //       label: 'Generator',
  //       to: '/reports',
  //       icon: 'i-heroicons-presentation-chart-line'
  //     },
  //     {
  //       label: 'Saved Reports',
  //       to: '/reports/saved',
  //       icon: 'i-heroicons-document-magnifying-glass'
  //     },
  //     {
  //       label: 'Scheduled Reports',
  //       to: '/reports/scheduled',
  //       icon: 'i-heroicons-document-chart-bar'
  //     }
  //   ]
  // },
  // {
  //   label: 'Costs',
  //   icon: 'i-heroicons-currency-dollar',
  //   children: [
  //     {
  //       label: 'Overview',
  //       to: '/costs',
  //       icon: 'i-heroicons-presentation-chart-line'
  //     }
  //   ]
  // },
  // {
  //   label: 'System',
  //   icon: 'i-heroicons-cog-6-tooth',
  //   children: [
  //     {
  //       label: 'Changelog',
  //       to: '/changelog',
  //       icon: 'i-heroicons-document-text'
  //     }
  //   ]
  // }
]


// const handleNavigation = (to) => {
//   if (to) {
//     router.push(to)
//   }
// }
</script> 