<template>
  <div class="fixed inset-y-0 left-0 w-64 bg-slate-900 flex flex-col">
    <!-- Logo Section -->
    <div class="h-16 px-6 border-b border-slate-700 flex items-center">
      <img src="@/assets/images/MS-logoWhite.png" alt="Logo" class="h-8 w-auto" >
    </div>

    <!-- Navigation Menu -->
    <div class="flex-1 overflow-y-auto py-6">
      <nav class="space-y-1 px-3">
        <template v-for="item in navigationItems" :key="item.label">
          <!-- Menu Item -->
          <div class="text-slate-400">
            <!-- Parent Item -->
            <div 
              class="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-slate-800 transition-colors"
              :class="{ 'text-white bg-slate-800': isActive(item) }"
              @click="toggleDropdown(item)"
            >
              <UIcon :name="item.icon" class="flex-shrink-0 w-5 h-5" />
              <span class="text-sm font-medium">{{ item.label }}</span>
              <UBadge
                v-if="item.inDevelopment"
                color="yellow"
                size="xs"
                class="ml-auto"
                :title="item.developmentMessage"
              >
                WIP
              </UBadge>
              <UIcon 
                v-if="item.children"
                :name="isOpen(item) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                class="w-4 h-4"
                :class="{ 'ml-auto': !item.inDevelopment }"
              />
            </div>

            <!-- Dropdown Items -->
            <div 
              v-if="item.children"
              v-show="isOpen(item)"
              class="mt-1 ml-4 space-y-1"
            >
              <NuxtLink
                v-for="child in item.children"
                :key="child.label"
                :to="child.to"
                class="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-slate-800 transition-colors"
                :class="{ 'text-white bg-slate-800': isActive(child) }"
                @click.stop
              >
                <UIcon :name="child.icon" class="flex-shrink-0 w-4 h-4" />
                <span class="font-medium">{{ child.label }}</span>
              </NuxtLink>
            </div>

            <!-- Single Item Link -->
            <NuxtLink
              v-else
              :to="item.to"
              class="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-slate-800 transition-colors"
              :class="{ 'text-white bg-slate-800': isActive(item) }"
            >
              <UIcon :name="item.icon" class="flex-shrink-0 w-5 h-5" />
              <span class="font-medium">{{ item.label }}</span>
            </NuxtLink>
          </div>
        </template>
      </nav>
    </div>

    <!-- Footer Links -->
    <div class="border-t border-slate-700">
      <!-- Support Link -->
      <div class="px-3 py-2">
        <NuxtLink
          to="/support/aws-access"
          class="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors w-full"
          :class="{ 'text-white bg-slate-800': route.path === '/support/aws-access' }"
        >
          <UIcon name="i-heroicons-lifebuoy" class="flex-shrink-0 w-5 h-5" />
          <span class="font-medium">Support & Help</span>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
// const router = useRouter()
const openItems = ref(new Set(['Accounts'])) // Keep Accounts dropdown open by default

const isActive = (item) => {
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
  
  if (openItems.value.has(item.label)) {
    openItems.value.delete(item.label)
  } else {
    openItems.value.add(item.label)
  }
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
      // {
      //   label: "Account Costs",
      //   to: "/total",
      //   icon: "i-heroicons-currency-dollar"
      // },

      // NOTE: disabling this until the scorecard page is working
      // {
      //   label: "Scorecard",
      //   to: "/org-scorecard",
      //   icon: "i-heroicons-chart-bar"
      // }
    ]
  },
  {
    label: 'Reports',
    icon: 'i-heroicons-currency-dollar',
    children: [
      {
        label: 'Generator',
        to: '/reports',
        icon: 'i-heroicons-presentation-chart-line'
      },
      {
        label: 'Saved Reports',
        to: '/reports/saved',
        icon: 'i-heroicons-document-magnifying-glass'
      },
      {
        label: 'Scheduled Reports',
        to: '/reports/scheduled',
        icon: 'i-heroicons-document-chart-bar'
      }
    ]
  },
  {
    label: 'Costs',
    icon: 'i-heroicons-currency-dollar',
    children: [
      {
        label: 'Overview',
        to: '/costs',
        icon: 'i-heroicons-presentation-chart-line'
      }
    ]
  },
  {
    label: 'System',
    icon: 'i-heroicons-cog-6-tooth',
    children: [
      {
        label: 'Changelog',
        to: '/changelog',
        icon: 'i-heroicons-document-text'
      }
    ]
  }
]


// const handleNavigation = (to) => {
//   if (to) {
//     router.push(to)
//   }
// }
</script> 