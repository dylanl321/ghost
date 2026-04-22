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

      <!-- Impersonation Banner -->
      <ClientOnly>
        <ImpersonationBanner />
      </ClientOnly>

      <!-- Welcome Banner -->
      <WelcomeBanner v-if="!route.path.startsWith('/support')" />

      <!-- Announcements -->
      <ClientOnly>
        <AnnouncementBanner />
      </ClientOnly>

      <!-- Main Content Area -->
      <main 
        class="flex-1 min-h-0 flex flex-col bg-[var(--ghost-bg)] dark:bg-slate-900"
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
      <footer class="bg-[var(--ghost-surface-2)] dark:bg-slate-800 border-t border-[color:var(--ghost-border)] dark:border-slate-700 h-[53px] flex items-center">
        <div class="px-6 flex justify-between items-center w-full text-sm text-gray-500 dark:text-gray-400">
          <!-- Left: GHOST Branding -->
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-fa6-solid-ghost" class="h-4 w-4 text-emerald-400" data-ghost-footer />
              <span class="font-medium text-gray-900 dark:text-gray-300">GHOST</span>
            </div>
            <span class="text-gray-600 dark:text-gray-500">|</span>
            <span class="text-xs">A product of the GDMS AWS Landing Zone Team</span>
            <span class="text-gray-400">•</span>
            <NuxtLink to="/changelog" class="text-xs hover:text-primary transition-colors">v{{ $config.public.appVersion }}</NuxtLink>
          </div>

          <!-- Right: Feedback & Active Queries -->
          <div class="flex items-center gap-3">
            <!-- Active Queries Indicator (with popover) -->
            <ClientOnly>
              <ActiveQueriesIndicator />
            </ClientOnly>

            <FeedbackModal />
          </div>
        </div>
      </footer>
    </div>

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

    <!-- Global Command Palette (Cmd+K) -->
    <ClientOnly>
      <CommandPalette />
    </ClientOnly>

    <!-- What's New Modal -->
    <ClientOnly>
      <WhatsNewModal v-model="showWhatsNew" @dismiss="onWhatsNewDismiss" />
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

// Popup / What's New modal
const showWhatsNew = ref(false)
const preferences = useUserPreferences()
const currentVersion = useRuntimeConfig().public.appVersion

// Initialize streaming notifications monitoring (background polling for chat queries)
const { startMonitoring } = useStreamingNotifications()

// Start monitoring on mount
onMounted(async () => {
  startMonitoring()

  // Ensure user preferences are loaded before checking dismissed state
  if (!preferences.initialized.value) {
    await preferences.load()
  }

  // Force-fetch site config so the popup decision uses fresh data,
  // not stale sessionStorage cache
  await siteConfigStore.fetchConfig(true)

  const popup = siteConfigStore.popupMessage
  if (popup?.enabled && popup?.id && popup?.body) {
    // Admin popup: show if user hasn't dismissed this specific popup ID
    const dismissedId = preferences.getPreference('dismissedPopupId', '')
    if (dismissedId !== popup.id) {
      showWhatsNew.value = true
    }
  } else {
    // Fallback: version changelog popup
    const lastSeen = preferences.getPreference('lastSeenVersion', '0.0.0')
    if (lastSeen !== currentVersion) {
      showWhatsNew.value = true
    }
  }
})

function onWhatsNewDismiss() {
  const popup = siteConfigStore.popupMessage
  if (popup?.enabled && popup?.id && popup?.body) {
    // Record dismissal of admin popup by its ID
    preferences.setPreference('dismissedPopupId', popup.id)
  } else {
    // Record version seen for changelog popup
    preferences.setPreference('lastSeenVersion', currentVersion as string)
  }
}

// Detect full-height pages that need special layout (no padding, overflow handled by page)
const isExplorerPage = computed(() =>
  route.path === '/account/explorer' ||
  route.path === '/reports/datasets' ||
  route.path === '/chat'
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
