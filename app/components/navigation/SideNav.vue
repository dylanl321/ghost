<template>
  <!-- Mobile Overlay -->
  <div
    v-if="isMobile && showMobileMenu"
    class="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
    @click="closeMobileMenu"
  ></div>

  <!-- Sidebar -->
  <div
    class="fixed inset-y-0 left-0 bg-[var(--ghost-surface-2)] dark:bg-slate-900 border-r border-[color:var(--ghost-border)] dark:border-slate-700 flex flex-col transition-all duration-300 ease-in-out overflow-hidden shadow-sm dark:shadow-xl"
    :class="{
      // Desktop collapsed/expanded states
      'w-16 z-40':
        !isMobile && navigationStore.isCollapsed && !navigationStore.isHovered,
      'w-64 z-40':
        !isMobile &&
        (!navigationStore.isCollapsed || navigationStore.isHovered),
      'shadow-md':
        !isMobile && navigationStore.isCollapsed && navigationStore.isHovered,

      // Mobile states
      'w-64 z-50 transform translate-x-0': isMobile && showMobileMenu,
      'w-64 z-50 transform -translate-x-full': isMobile && !showMobileMenu,
    }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- Logo Section -->
    <div class="border-b border-[color:var(--ghost-border)] dark:border-slate-700 flex-shrink-0">
      <div class="h-16 flex items-center px-4 relative overflow-hidden">
        <!-- Expanded state content -->
        <div
          class="flex items-center justify-between w-full transition-all duration-300"
          :class="{
            'opacity-0 pointer-events-none':
              navigationStore.isCollapsed && !navigationStore.isHovered,
            'opacity-100':
              !navigationStore.isCollapsed || navigationStore.isHovered,
          }"
        >
          <div class="flex flex-col gap-1 min-w-0">
            <img
              src="@/assets/images/MS-logoWhite.png"
              alt="Logo"
              class="h-8 w-auto flex-shrink-0 invert dark:invert-0"
            />
          </div>

          <!-- Collapse Toggle Button -->
          <UButton
            v-if="canCollapse"
            variant="ghost"
            color="gray"
            size="xs"
            :icon="
              navigationStore.isCollapsed
                ? 'i-heroicons-chevron-right'
                : 'i-heroicons-chevron-left'
            "
            class="flex-shrink-0 transition-all duration-200 opacity-60 hover:opacity-100"
            @click="toggleSidebar"
            :title="getToggleTooltip()"
          />
        </div>

        <!-- Collapsed state icon -->
        <div
          class="absolute inset-0 flex flex-col items-center justify-center gap-1 transition-all duration-300"
          :class="{
            'opacity-100':
              navigationStore.isCollapsed && !navigationStore.isHovered,
            'opacity-0 pointer-events-none':
              !navigationStore.isCollapsed || navigationStore.isHovered,
          }"
        >
          <img
            src="@/assets/images/MS-logoWhite-icon.png"
            alt="Logo"
            class="w-8 h-8 flex-shrink-0 invert dark:invert-0"
          />
          <UIcon name="i-fa6-solid-ghost" class="h-3 w-3 text-emerald-400" />
        </div>
      </div>
    </div>

    <!-- Navigation Menu -->
    <div class="flex-1 overflow-y-auto py-6 overflow-x-hidden flex flex-col">
      <nav class="space-y-1 px-3 min-w-0 flex-shrink-0">
        <template v-for="item in navigationItems" :key="item.label">
          <!-- Menu Item -->
          <!-- AI Assistant - Controlled by feature flag -->
          <ClientOnly v-if="item.label === 'AI Assistant'">
            <NuxtLink
              v-if="strandsEnabled"
              :to="item.to"
              prefetch
              class="flex items-center px-3 py-2 rounded-md text-sm text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors relative group overflow-hidden"
              :class="{ 'text-slate-900 bg-slate-100 dark:text-white dark:bg-slate-800': isActive(item) }"
            >
              <UIcon :name="item.icon" class="flex-shrink-0 w-5 h-5" />
              <span
                class="font-medium ml-3 truncate transition-all duration-300"
                :class="{
                  'opacity-0 w-0':
                    navigationStore.isCollapsed && !navigationStore.isHovered,
                  'opacity-100 w-full':
                    !navigationStore.isCollapsed || navigationStore.isHovered,
                }"
              >
                {{ item.label }}
              </span>

              <!-- Tooltip for collapsed state -->
              <div
                v-if="navigationStore.isCollapsed && !navigationStore.isHovered"
                class="absolute left-full ml-2 px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 border border-slate-200 dark:border-slate-600 shadow-lg"
              >
                {{ item.label }}
                <div
                  class="absolute left-0 top-1/2 transform -translate-x-1 -translate-y-1/2 w-0 h-0 border-r-4 border-r-white dark:border-r-slate-800 border-t-2 border-b-2 border-t-transparent border-b-transparent"
                ></div>
              </div>
            </NuxtLink>
          </ClientOnly>

          <!-- Pipeline Analytics - Admin only -->
          <ClientOnly v-else-if="item.label === 'Pipeline Analytics'">
            <NuxtLink
              v-if="isAdmin"
              :to="item.to"
              prefetch
              class="flex items-center px-3 py-2 rounded-md text-sm text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors relative group overflow-hidden"
              :class="{ 'text-slate-900 bg-slate-100 dark:text-white dark:bg-slate-800': isActive(item) }"
            >
              <UIcon :name="item.icon" class="flex-shrink-0 w-5 h-5" />
              <span
                class="font-medium ml-3 truncate transition-all duration-300"
                :class="{
                  'opacity-0 w-0':
                    navigationStore.isCollapsed && !navigationStore.isHovered,
                  'opacity-100 w-full':
                    !navigationStore.isCollapsed || navigationStore.isHovered,
                }"
              >
                {{ item.label }}
              </span>

              <!-- Tooltip for collapsed state -->
              <div
                v-if="navigationStore.isCollapsed && !navigationStore.isHovered"
                class="absolute left-full ml-2 px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 border border-slate-200 dark:border-slate-600 shadow-lg"
              >
                {{ item.label }}
                <div
                  class="absolute left-0 top-1/2 transform -translate-x-1 -translate-y-1/2 w-0 h-0 border-r-4 border-r-white dark:border-r-slate-800 border-t-2 border-b-2 border-t-transparent border-b-transparent"
                ></div>
              </div>
            </NuxtLink>
          </ClientOnly>

          <!-- Support Tools - Admin only -->
          <ClientOnly v-else-if="item.label === 'Support Tools'">
            <NuxtLink
              v-if="isAdmin"
              :to="item.to"
              prefetch
              class="flex items-center px-3 py-2 rounded-md text-sm text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors relative group overflow-hidden"
              :class="{ 'text-slate-900 bg-slate-100 dark:text-white dark:bg-slate-800': isActive(item) }"
            >
              <UIcon :name="item.icon" class="flex-shrink-0 w-5 h-5" />
              <span
                class="font-medium ml-3 truncate transition-all duration-300"
                :class="{
                  'opacity-0 w-0':
                    navigationStore.isCollapsed && !navigationStore.isHovered,
                  'opacity-100 w-full':
                    !navigationStore.isCollapsed || navigationStore.isHovered,
                }"
              >
                {{ item.label }}
              </span>

              <!-- Tooltip for collapsed state -->
              <div
                v-if="navigationStore.isCollapsed && !navigationStore.isHovered"
                class="absolute left-full ml-2 px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 border border-slate-200 dark:border-slate-600 shadow-lg"
              >
                {{ item.label }}
                <div
                  class="absolute left-0 top-1/2 transform -translate-x-1 -translate-y-1/2 w-0 h-0 border-r-4 border-r-white dark:border-r-slate-800 border-t-2 border-b-2 border-t-transparent border-b-transparent"
                ></div>
              </div>
            </NuxtLink>
          </ClientOnly>

          <NuxtLink
            v-else
            :to="item.to"
            prefetch
            class="flex items-center px-3 py-2 rounded-md text-sm text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors relative group overflow-hidden"
            :class="{ 'text-slate-900 bg-slate-100 dark:text-white dark:bg-slate-800': isActive(item) }"
          >
            <UIcon :name="item.icon" class="flex-shrink-0 w-5 h-5" />
            <span
              class="font-medium ml-3 truncate transition-all duration-300"
              :class="{
                'opacity-0 w-0':
                  navigationStore.isCollapsed && !navigationStore.isHovered,
                'opacity-100 w-full':
                  !navigationStore.isCollapsed || navigationStore.isHovered,
              }"
            >
              {{ item.label }}
            </span>

            <!-- Tooltip for collapsed state -->
            <div
              v-if="navigationStore.isCollapsed && !navigationStore.isHovered"
              class="absolute left-full ml-2 px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 border border-slate-200 dark:border-slate-600 shadow-lg"
            >
              {{ item.label }}
              <div
                class="absolute left-0 top-1/2 transform -translate-x-1 -translate-y-1/2 w-0 h-0 border-r-4 border-r-white dark:border-r-slate-800 border-t-2 border-b-2 border-t-transparent border-b-transparent"
              ></div>
            </div>
          </NuxtLink>
        </template>
      </nav>

      <!-- Spacer to push favorites/recent to bottom -->
      <div class="flex-1"></div>

      <!-- Favorite Accounts -->
      <FavoriteAccountsNav />
      <!-- Recent Accounts -->
      <RecentAccountsNav />
    </div>

    <!-- Footer Links -->
    <div class="border-t border-slate-200 dark:border-slate-700 flex-shrink-0 h-[53px]">
      <div
        class="h-full flex items-center justify-center gap-1 px-2 transition-all duration-300"
        :class="{
          'justify-center': navigationStore.isCollapsed && !navigationStore.isHovered,
          'justify-around': !navigationStore.isCollapsed || navigationStore.isHovered,
        }"
      >
        <!-- Documentation Link -->
        <UTooltip text="Documentation" :shortcuts="[]">
          <NuxtLink
            to="/support/docs"
            prefetch
            class="flex items-center justify-center p-2 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors relative group"
            :class="{
              'text-slate-900 bg-slate-100 dark:text-white dark:bg-slate-800': route.path.startsWith('/support/docs'),
            }"
          >
            <UIcon name="i-heroicons-document-text" class="flex-shrink-0 w-5 h-5" />
          </NuxtLink>
        </UTooltip>

        <!-- Support Link -->
        <UTooltip text="Support" :shortcuts="[]">
          <NuxtLink
            to="/support"
            prefetch
            class="flex items-center justify-center p-2 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors relative group"
            :class="{
              'text-slate-900 bg-slate-100 dark:text-white dark:bg-slate-800': route.path === '/support' || route.path.startsWith('/support/'),
            }"
          >
            <UIcon name="i-heroicons-lifebuoy" class="flex-shrink-0 w-5 h-5" />
          </NuxtLink>
        </UTooltip>

        <!-- About Link -->
        <UTooltip text="About" :shortcuts="[]">
          <NuxtLink
            to="/about"
            prefetch
            class="flex items-center justify-center p-2 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors relative group"
            :class="{
              'text-slate-900 bg-slate-100 dark:text-white dark:bg-slate-800': route.path === '/about',
            }"
          >
            <UIcon name="i-heroicons-information-circle" class="flex-shrink-0 w-5 h-5" />
          </NuxtLink>
        </UTooltip>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useRoute } from "vue-router";
import { useNavigationStore } from "~/stores/useNavigationStore";
import { useUserRoles } from "~/composables/useUserRoles";

const logger = createLogger('SideNav')

const route = useRoute();
const navigationStore = useNavigationStore();
const { isAdmin } = useUserRoles();
const siteConfigStore = useSiteConfigStore();

// Check if Strands chat is enabled
const strandsEnabled = computed(() => siteConfigStore.isStrandsChatEnabled);

// Mobile detection - SSR safe
const isMobile = computed(() => {
  // During SSR, assume desktop to avoid hydration mismatches
  if (process.server) return false;
  // On client, use the store value or fallback to window check
  return (
    navigationStore.isMobile ??
    (typeof window !== "undefined" && window.innerWidth < 768)
  );
});

// Computed properties
const canCollapse = computed(() => {
  // Handle SSR where route might be undefined
  if (!route?.path) return true;
  return !navigationStore.isPageProtected(route.path);
});

const isActive = (item) => {
  // Handle SSR where route might be undefined
  if (!route?.path) return false;

  if (item.to) {
    return route.path === item.to;
  }
  return false;
};

// Mouse interaction handlers
const handleMouseEnter = () => {
  navigationStore.setHovered(true);
};

const handleMouseLeave = () => {
  navigationStore.setHovered(false);
};

// Toggle sidebar with protection check
const toggleSidebar = () => {
  // Handle SSR where route might be undefined
  if (!route?.path) return;

  if (!canCollapse.value) {
    // Provide visual feedback for protected pages
    const rule = navigationStore.getPageRule(route.path);
    logger.info(
      `Cannot collapse sidebar: ${
        rule?.reason || "This page requires full navigation"
      }`
    );

    // Add a subtle shake animation to indicate it's not allowed
    if (process.client) {
      const button = document.querySelector(".animate-pulse");
      if (button) {
        button.classList.add("animate-bounce");
        setTimeout(() => button.classList.remove("animate-bounce"), 600);
      }
    }
    return;
  }

  const success = navigationStore.toggle(route.path);
  if (!success) {
    logger.info("Failed to toggle sidebar state");
  }
};

// Tooltip helper
const getToggleTooltip = () => {
  if (!canCollapse.value) {
    return "Cannot collapse on this page";
  }
  return navigationStore.isCollapsed ? "Expand sidebar" : "Collapse sidebar";
};

// Watch for route changes to handle auto-collapse/expand
watch(
  () => route?.path,
  (newPath, oldPath) => {
    if (newPath) {
      navigationStore.handleRouteChange(newPath, oldPath);
    }
  },
  { immediate: true }
);

// Additional watcher to enforce state consistency
watch(
  () => [route?.path, navigationStore.isCollapsed],
  ([currentPath, collapsed]) => {
    // Double-check: If we're on a protected page and somehow collapsed, force expand
    if (
      currentPath &&
      navigationStore.isPageProtected(currentPath) &&
      collapsed
    ) {
      logger.info(
        `State inconsistency detected: Protected page ${currentPath} is collapsed - forcing expand`
      );
      navigationStore.expand();
    }
  },
  { immediate: true }
);

// Handle responsive behavior
const updateMobileState = () => {
  if (typeof window !== "undefined") {
    const isMobile = window.innerWidth < 768;
    navigationStore.setMobile(isMobile);
  }
};

// Initialize responsive behavior
onMounted(() => {
  updateMobileState();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", updateMobileState);
  }

  // Handle initial page load
  nextTick(() => {
    if (route?.path) {
      navigationStore.handleRouteChange(route.path);
    }
  });
});

// Mobile menu state
const showMobileMenu = ref(false);

const closeMobileMenu = () => {
  showMobileMenu.value = false;
};

// Watch for mobile menu changes from parent components
watch(
  () => isMobile.value,
  (mobile) => {
    if (!mobile) {
      showMobileMenu.value = false;
    }
  }
);

// Expose mobile menu control
defineExpose({
  toggleMobileMenu: () => {
    showMobileMenu.value = !showMobileMenu.value;
  },
  closeMobileMenu,
});

// Cleanup on unmount
if (process.client) {
  onBeforeUnmount(() => {
    window.removeEventListener("resize", updateMobileState);
  });
}

const navigationItems = computed(() => {
  return [
    {
      label: "Overview",
      to: "/",
      icon: "i-heroicons-home",
    },
    {
      label: "Account Explorer",
      to: "/account/explorer",
      icon: "i-heroicons-magnifying-glass",
    },
    {
      label: "Organization Chart",
      to: "/account/org-chart",
      icon: "i-heroicons-building-library",
    },
    {
      label: "Cost Dashboard",
      to: "/account/costs",
      icon: "i-heroicons-currency-dollar",
      collapseRule: "default-collapsed",
    },
    {
      label: "GDMS Finance",
      to: "/gdms-finance",
      icon: "i-heroicons-chart-bar",
    },
    {
      label: "Users & Access",
      to: "/account/user",
      icon: "i-heroicons-users",
    },
    {
      label: "Dataset Reports",
      to: "/reports/datasets",
      icon: "i-heroicons-server-stack",
    },
    {
      label: "Security Health",
      to: "/security",
      icon: "i-heroicons-shield-exclamation",
    },
    {
      label: "AI Assistant",
      to: "/chat",
      icon: "i-heroicons-sparkles",
    },
    {
      label: "Settings",
      to: "/settings",
      icon: "i-heroicons-cog-6-tooth",
    },
    // Always include Pipeline Analytics in structure to avoid hydration mismatch
    // Visibility controlled by ClientOnly in template
    {
      label: "Pipeline Analytics",
      to: "/admin/pipelines",
      icon: "i-heroicons-arrow-path",
    },
    // Support Tools - Admin only, visibility controlled by ClientOnly in template
    {
      label: "Support Tools",
      to: "/support-tools",
      icon: "i-heroicons-wrench-screwdriver",
    }
  ];
});
</script>
