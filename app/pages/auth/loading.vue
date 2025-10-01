<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";

definePageMeta({
  layout: "authentication",
});

const router = useRouter();
const route = useRoute();
const { user, loggedIn, logout } = useOidcAuth();
const userGroupStore = useUserGroupStore();
const enclaveStore = useEnclaveStore();
const { getReturnUrl } = useAuthRedirect();

const step = ref("Validating login state...");
const error = ref<string | null>(null);
const progress = ref(0);

// Enhanced return URL handling with query param support
const getFinalReturnUrl = (): string => {
  // First check query parameters (takes precedence)
  if (route.query.returnTo && typeof route.query.returnTo === "string") {
    return decodeURIComponent(route.query.returnTo);
  }

  // Then use the composable's logic
  return getReturnUrl();
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
  try {
    step.value = "Validating login state...";

    // Use mock user in bypass mode
    let accessToken: string = "";

    accessToken = user.value?.accessToken || "";

    const validLogin = await validateLoginState(accessToken);
    if (!validLogin) {
      return;
    }

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
    
    console.log("user", user.value);
    console.log("role groups", userGroupStore.roleGroups);
    console.log("dist groups", userGroupStore.distributionGroups);
    console.log("enclaves", enclaveStore.enclaves);
    console.log("aws roles", userGroupStore.awsRoles);
    
    // Debug roles in development
    if (process.dev) {
      debugRoles();
    }

    step.value = "All set! Taking you back...";
    progress.value = 100;
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Redirect to the original URL the user was trying to access
    const returnUrl = getFinalReturnUrl();
    console.log("Redirecting to:", returnUrl);

    // Use window.location.href to ensure full page navigation
    // This prevents the loading page from appearing in content areas
    window.location.href = returnUrl;
  } catch {
    error.value = "Something went wrong";
  }
});
</script>

<template>
  <!-- Ensure full-screen display with fixed positioning -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-secondary/50 to-primary-50/30 dark:from-slate-900/50 dark:to-primary-950/50 backdrop-blur-lg"
  >
    <div
      class="text-center p-12 rounded-xl shadow-xl bg-emerald-800/20 w-full max-w-md mx-4"
    >
      <div class="mb-8">
        <!-- Loading spinner icon -->
        <UIcon
          v-if="!error"
          name="i-heroicons-arrow-path"
          class="w-12 h-12 animate-spin text-primary-500 mx-auto mb-4"
        />
        <!-- Error icon -->
        <UIcon
          v-else
          name="i-heroicons-exclamation-triangle"
          class="w-12 h-12 text-red-500 mx-auto mb-4"
        />
      </div>

      <p
        class="text-2xl font-bold mb-8"
        :class="error ? 'text-red-500' : 'text-black dark:text-white'"
      >
        {{ error || step }}
      </p>

      <!-- Progress bar for non-error states -->
      <div
        v-if="!error"
        class="mt-4 bg-gray-200 dark:bg-emerald-900 rounded-full h-2.5 mb-4 overflow-hidden"
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
      <!-- <div v-if="error" class="mt-6 space-y-3">
        <UButton
          @click="() => window.location.reload()"
          color="red"
          variant="solid"
          class="w-full"
        >
          Try Again
        </UButton>
        <UButton
          @click="() => (window.location.href = '/')"
          color="gray"
          variant="soft"
          class="w-full"
        >
          Go to Dashboard
        </UButton>
      </div> -->
    </div>
  </div>
</template>
