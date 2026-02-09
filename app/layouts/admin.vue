<template>
  <div class="h-screen bg-[var(--ghost-bg)] dark:bg-slate-900 flex flex-col overflow-hidden">
    <!-- Top Navigation -->
    <TopNav
      :breadcrumbs="breadcrumbs"
      @toggle-mobile-menu="() => {}"
    />

    <!-- Main Content Area with Admin Sidebar -->
    <div class="flex-1 min-h-0 flex overflow-hidden">
      <!-- Admin Sidebar Navigation -->
      <AdminNav class="hidden md:flex" />

      <!-- Page Content -->
      <main class="flex-1 overflow-y-auto bg-[var(--ghost-bg)] dark:bg-slate-900">
        <slot />
      </main>
    </div>

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
            <span class="text-gray-400">•</span>
            <NuxtLink to="/changelog" class="text-xs hover:text-primary transition-colors">v{{ $config.public.appVersion }}</NuxtLink>
        </div>

        <!-- Right: Feedback -->
        <div class="flex items-center">
          <FeedbackModal />
        </div>
      </div>
    </footer>

    <!-- Global AI Assistant Popup (feature flag controlled) -->
    <ClientOnly>
      <StrandsChatPopup v-if="siteConfigStore.isStrandsChatPopupEnabled" />

      <!-- Chat Threads Sidebar -->
      <ChatThreadsSidebar
        v-if="siteConfigStore.isStrandsChatEnabled"
      />

      <!-- Dev Options Panel (only shows in dev auth mode) -->
      <DevOptionsPanel />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { useSiteConfigStore } from '~/stores/useSiteConfigStore'

const route = useRoute()
const siteConfigStore = useSiteConfigStore()

// Generate breadcrumbs for admin pages
const breadcrumbs = computed(() => {
  const segments = route.path.split('/').filter(Boolean)

  const crumbs = [
    { label: 'Dashboard', to: '/' },
    { label: 'Admin', to: '/admin' }
  ]

  // Skip 'admin' segment as it's already in breadcrumbs
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]
    if (!seg) continue

    // Format category names
    const label = seg
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')

    crumbs.push({
      label,
      to: '/' + segments.slice(0, i + 1).join('/'),
    })
  }

  return crumbs
})
</script>
