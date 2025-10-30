<template>
  <div class="h-screen bg-gray-50 dark:bg-slate-900 flex overflow-hidden">
    <!-- Side Navigation -->
    <SideNav ref="sideNavRef" />

    <!-- Main Content Wrapper -->
    <div
      class="flex-1 flex flex-col overflow-hidden min-h-0 transition-all duration-300 ease-in-out"
      :style="{ marginLeft: navigationStore.contentMargin }"
    >
      <TopNav
        :breadcrumbs="breadcrumbs"
        @toggle-mobile-menu="handleMobileMenuToggle"
      />

      <!-- Main Content Area -->
      <main 
        class="flex-1 min-h-0 flex flex-col bg-gray-50 dark:bg-slate-900"
        :class="isExplorerPage ? 'overflow-hidden' : 'pt-4 md:pt-4 overflow-auto'"
      >
        <!-- Page Content -->
        <div class="relative h-full min-h-0">
          <section
            class="transition-opacity duration-200 h-full min-h-0"
          >
            <slot />
          </section>
        </div>
      </main>

      <!-- Footer -->
      <footer class="bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 h-[53px] flex items-center">
        <div class="px-6 flex justify-between items-center w-full text-sm text-gray-500 dark:text-gray-400">
          <span>A product of the GDMS AWS Landing Zone Team</span>
          <FeedbackModal />
          <!-- <div class="flex items-center gap-4">
            <NuxtLink
              to="/changelog"
              class="flex items-center gap-1 hover:text-white transition-colors"
            >
              <UIcon name="i-heroicons-document-text" class="h-3 w-3" />
              <span>v0.1</span>
            </NuxtLink>
            <NuxtLink
              to="/changelog"
              class="text-xs hover:text-white transition-colors"
            >
              What's New
            </NuxtLink>
          </div> -->
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useNavigationStore } from '~/stores/useNavigationStore'

const route = useRoute()
const navigationStore = useNavigationStore()
const sideNavRef = ref()

// Detect explorer page to adjust layout
const isExplorerPage = computed(() => route.path === '/account/explorer')

// Mobile menu handler
const handleMobileMenuToggle = () => {
  if (sideNavRef.value) {
    sideNavRef.value.toggleMobileMenu()
  }
}

const breadcrumbs = computed(() => {
  const segments = route.path.split('/').filter(Boolean)

  const crumbs = [{ label: 'Dashboard', to: '/' }]

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (!seg) continue

    // Collapse `/account/explorer` into one crumb
    if (seg.toLowerCase() === 'account' && segments[i + 1]?.toLowerCase() === 'explorer') {
      crumbs.push({
        label: 'Account Explorer',
        to: '/account/explorer',
      })
      break // stop after pushing, so "explorer" doesn't get added separately
    }

    // Handle `/account/*` by making "Account" link to the account explorer
    if (seg.toLowerCase() === 'account') {
      crumbs.push({
        label: 'Account',
        to: '/account/explorer',
      })
      continue
    }

    crumbs.push({
      label: seg.charAt(0).toUpperCase() + seg.slice(1),
      to: '/' + segments.slice(0, i + 1).join('/'),
    })
  }

  return crumbs
})


</script>
