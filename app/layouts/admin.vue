<template>
  <div class="h-screen bg-gray-50 dark:bg-slate-900 flex flex-col overflow-hidden">
    <!-- Top Navigation -->
    <TopNav
      :breadcrumbs="breadcrumbs"
      @toggle-mobile-menu="() => {}"
    />

    <!-- Main Content Area -->
    <main class="flex-1 min-h-0 flex flex-col bg-gray-50 dark:bg-slate-900 pt-4 overflow-auto">
      <div class="relative h-full min-h-0">
        <section class="transition-opacity duration-200 h-full min-h-0">
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
