<template>
  <div class="h-screen bg-[var(--ghost-bg)] dark:bg-slate-900 flex overflow-hidden">
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

      <!-- Main Content Area with Settings Sidebar -->
      <main class="flex-1 min-h-0 flex bg-[var(--ghost-bg)] dark:bg-slate-900 overflow-hidden">
        <!-- Settings Sidebar -->
        <aside class="w-64 bg-[var(--ghost-surface-2)] dark:bg-slate-800 border-r border-[color:var(--ghost-border)] dark:border-slate-700 flex-shrink-0 overflow-y-auto hidden md:block">
          <SettingsNav />
        </aside>

        <!-- Page Content -->
        <div class="flex-1 overflow-y-auto">
          <div class="max-w-4xl mx-auto px-6 py-8">
            <slot />
          </div>
        </div>
      </main>

      <!-- Footer -->
      <footer class="bg-[var(--ghost-surface-2)] dark:bg-slate-800 border-t border-[color:var(--ghost-border)] dark:border-slate-700 h-[53px] flex items-center">
        <div class="px-6 flex justify-between items-center w-full text-sm text-gray-500 dark:text-gray-400">
          <!-- Left: GHOST Branding -->
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-fa6-solid-ghost" class="h-4 w-4 text-emerald-400" />
              <span class="font-medium text-gray-900 dark:text-gray-300">GHOST</span>
            </div>
            <span class="text-gray-600 dark:text-gray-500">|</span>
            <span class="text-xs">A product of the GDMS AWS Landing Zone Team</span>
          </div>

          <!-- Right: Active Queries -->
          <div class="flex items-center gap-3">
            <ClientOnly>
              <ActiveQueriesIndicator />
            </ClientOnly>
          </div>
        </div>
      </footer>
    </div>

    <!-- Global AI Assistant Popup -->
    <ClientOnly>
      <StrandsChatPopup v-if="siteConfigStore.isStrandsChatPopupEnabled" />
      <ChatThreadsSidebar v-if="siteConfigStore.isStrandsChatEnabled" />

      <!-- Dev Options Panel (only shows in dev auth mode) -->
      <DevOptionsPanel />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { useNavigationStore } from '~/stores/useNavigationStore'
import { useSiteConfigStore } from '~/stores/useSiteConfigStore'

const route = useRoute()
const navigationStore = useNavigationStore()
const siteConfigStore = useSiteConfigStore()
const sideNavRef = ref()

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

    // Capitalize and format segment
    const label = seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ')
    crumbs.push({
      label,
      to: '/' + segments.slice(0, i + 1).join('/'),
    })
  }

  return crumbs
})
</script>
