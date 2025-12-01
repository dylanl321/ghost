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

      <!-- Welcome Banner -->
      <WelcomeBanner v-if="!route.path.startsWith('/support')" />

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
          <!-- Left: GHOST Branding -->
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-fa6-solid-ghost" class="h-4 w-4 text-emerald-400" />
              <span class="font-medium text-gray-300">GHOST</span>
            </div>
            <span class="text-gray-600">|</span>
            <span class="text-xs">A product of the GDMS AWS Landing Zone Team</span>
          </div>

          <!-- Right: Feedback Only -->
          <div class="flex items-center">
            <FeedbackModal />
          </div>
        </div>
      </footer>
    </div>

    <!-- Global AI Assistant Popup (feature flag controlled) -->
    <ClientOnly>
      <StrandsChatPopup v-if="siteConfigStore.isStrandsChatPopupEnabled" />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { useNavigationStore } from '~/stores/useNavigationStore'
import { useSiteConfigStore } from '~/stores/useSiteConfigStore'
import WelcomeBanner from '~/components/welcome/WelcomeBanner.vue'

const route = useRoute()
const navigationStore = useNavigationStore()
const siteConfigStore = useSiteConfigStore()
const sideNavRef = ref()

// Detect explorer page to adjust layout
const isExplorerPage = computed(() => 
  route.path === '/account/explorer' || 
  route.path === '/reports/datasets'
)

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
