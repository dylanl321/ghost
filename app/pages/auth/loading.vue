<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";

const logger = createLogger('GHOST-AUTH')

definePageMeta({
  layout: "authentication",
});

const router = useRouter();
const route = useRoute();
const { user, loggedIn, logout } = useOidcAuth();
const userGroupStore = useUserGroupStore();
const enclaveStore = useEnclaveStore();
const { getReturnUrl, clearReturnUrl } = useAuthRedirect();

const step = ref("Validating login state...");
const error = ref<string | null>(null);
const progress = ref(0);

// Get the return URL with query parameter fallback support
const getFinalReturnUrl = (): string => {
  logger.info('Loading: Determining return URL...')
  logger.info('Loading: Query params:', route.query)

  // First check query parameters (support both 'returnTo' and 'redirect' for compatibility)
  const queryParam = route.query.returnTo || route.query.redirect
  if (queryParam && typeof queryParam === "string") {
    logger.info('Loading: Using query parameter:', queryParam)
    return decodeURIComponent(queryParam);
  }

  // Then use the composable to check sessionStorage
  const savedUrl = getReturnUrl()
  logger.info('Loading: Return URL from sessionStorage:', savedUrl)

  return savedUrl
};

const validateLoginState = async (accessToken: string) => {
  const currentUser = user.value;

  if (!loggedIn.value || !currentUser || !accessToken) {
    error.value = "Error: Authentication failed. Logging you out...";
    await new Promise((resolve) => setTimeout(resolve, 1000));
    logout();
    return false;
  }

  if (!currentUser.claims?.email || !currentUser.claims?.given_name) {
    error.value = "Error: Incomplete profile";
    await new Promise((resolve) => setTimeout(resolve, 1000));
    logout();
    return false;
  }

  return true;
};

onMounted(async () => {
  // CAPTURE URL IMMEDIATELY - before any async work that could cause re-render
  const finalReturnUrl = getFinalReturnUrl()
  logger.info('Loading: Final return URL captured:', finalReturnUrl)

  try {
    // DEV MODE: Skip Graph API but still load enclave data for account selection
    if (user.value?.provider === 'dev') {
      step.value = "Dev mode - setting up mock session..."
      progress.value = 30

      // Log dev mode login
      const email = user.value?.claims?.email || user.value?.userInfo?.email || 'dev@localhost'
      const username = email.split("@")[0] || "DevUser"
      logActivity(`Login (DevMode) - USER:${username}`)

      // Set mock groups from env via runtime config
      const config = useRuntimeConfig()
      const devGroups = (config.public.devUserGroups || 'AWS-Product-Team')
        .split(',')
        .map((g: string) => g.trim())
        .filter((g: string) => g.length > 0)

      logger.info('Dev mode: Setting groups:', devGroups)
      userGroupStore.setDevGroups(devGroups)

      // Load enclave data so accounts are available in the dev options panel
      step.value = "Loading AWS account data..."
      progress.value = 60
      await enclaveStore.initialize()

      step.value = "All set! Taking you back..."
      progress.value = 100
      await new Promise((resolve) => setTimeout(resolve, 500))

      clearReturnUrl()
      logger.info('Loading: Dev mode redirecting to:', finalReturnUrl)
      window.location.href = finalReturnUrl
      return
    }

    // Normal auth flow for real Entra sessions
    step.value = "Validating login state...";

    const accessToken = user.value?.accessToken || "";

    const validLogin = await validateLoginState(accessToken);
    if (!validLogin) {
      return;
    }

    // Log user login
    const email = user.value?.claims?.email as string
    const username = email.split("@")[0] || "UnknownUser";
    const logMessage = `Login - USER:${username}`;
    logActivity(logMessage);

    step.value = "Fetching user groups...";
    progress.value = 30;

    // Store user groups
    await userGroupStore.initializeGroups(accessToken);

    step.value = "Fetching AWS enclave information...";
    progress.value = 60;

    // Store account/enclave information for all AWS accounts
    await enclaveStore.initialize();

    // Store merged AWS role / enclave data in the user group store
    await userGroupStore.initializeAWSRoles(enclaveStore.enclaves);

    // Initialize user roles and permissions
    step.value = "Setting up user permissions...";
    progress.value = 80;
    const { debug: debugRoles } = useUserRoles();

    // Debug roles in development only (no sensitive data dumps in console)
    if (import.meta.dev) {
      logger.info('Session loaded successfully')
      debugRoles();
    }

    step.value = "All set! Taking you back...";
    progress.value = 100;
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Clear the return URL from sessionStorage since we're about to use it
    clearReturnUrl()

    // Redirect to the original URL the user was trying to access
    logger.info('Loading: Redirecting to:', finalReturnUrl);

    // Use window.location.href to ensure full page navigation
    // This prevents the loading page from appearing in content areas
    window.location.href = finalReturnUrl;
  } catch {
    error.value = "Something went wrong";
  }
});
</script>

<style scoped>
/* Grid background pattern */
.grid-background {
  background-image:
    linear-gradient(to right, rgba(148, 163, 184, 0.1) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(148, 163, 184, 0.1) 1px, transparent 1px);
  background-size: 60px 60px;
  animation: grid-flow 20s linear infinite;
}

@keyframes grid-flow {
  0% {
    transform: translate(0, 0);
  }
  100% {
    transform: translate(60px, 60px);
  }
}

/* Slow pulse animation */
@keyframes pulse-slow {
  0%, 100% {
    opacity: 0.3;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.05);
  }
}

.animate-pulse-slow {
  animation: pulse-slow 3s ease-in-out infinite;
}

/* Shimmer animation for progress bar */
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
</style>

<template>
  <!-- Ensure full-screen display with fixed positioning -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
  >
    <!-- Animated Background Pattern -->
    <div class="absolute inset-0 overflow-hidden opacity-10">
      <div class="absolute inset-0 grid-background"></div>
    </div>

    <!-- Main Content Container -->
    <div class="relative w-full max-w-md mx-4">
      <!-- Base glow effect - always visible -->
      <div class="absolute inset-0 flex items-center justify-center -z-10">
        <div
          class="blur-3xl rounded-full opacity-30 animate-pulse-slow w-96 h-96"
          :class="error ? 'bg-red-500' : 'bg-primary'"
        ></div>
      </div>

      <!-- Card with backdrop blur -->
      <div
        class="relative text-center p-12 rounded-xl shadow-xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50"
      >
        <!-- Icon glow - always visible -->
        <div class="absolute top-12 left-1/2 -translate-x-1/2 -z-10">
          <div
            class="blur-2xl rounded-full opacity-40 w-24 h-24 transition-all duration-500"
            :class="error ? 'bg-red-500' : 'bg-primary'"
          ></div>
        </div>

        <div class="mb-8 relative">
          <!-- Loading spinner icon -->
          <UIcon
            v-if="!error"
            name="i-heroicons-arrow-path"
            class="w-12 h-12 animate-spin text-primary mx-auto mb-4 drop-shadow-2xl"
          />
          <!-- Error icon -->
          <UIcon
            v-else
            name="i-heroicons-exclamation-triangle"
            class="w-12 h-12 text-red-500 mx-auto mb-4 drop-shadow-2xl"
          />
        </div>

        <p
          class="text-2xl font-bold mb-8 transition-colors duration-300"
          :class="error ? 'text-red-500' : 'text-white'"
        >
          {{ error || step }}
        </p>

        <!-- Progress bar for non-error states -->
        <div
          v-if="!error"
          class="mt-4 bg-slate-700/50 rounded-full h-2.5 mb-4 overflow-hidden"
        >
          <div
            class="bg-gradient-to-r from-primary-600 via-primary-500 to-primary-600 h-2.5 rounded-full transition-all duration-700 ease-in-out"
            :style="{
              width: `${progress}%`,
              backgroundSize: '200% 100%',
              animation: 'shimmer 2s infinite linear',
            }"
          />
        </div>

        <!-- Error actions -->
      </div>
    </div>
  </div>
</template>
