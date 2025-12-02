<template>
  <!-- Feature Disabled Notice -->
  <div v-if="!strandsEnabled" class="disabled-notice">
    <UCard>
      <div class="p-8 text-center">
        <UIcon name="i-heroicons-no-symbol" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          GHOST Chat is Currently Disabled
        </h2>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          This feature has been temporarily disabled by an administrator.
          Please check back later or contact support if you need access.
        </p>
        <UButton
          icon="i-heroicons-home"
          label="Return to Dashboard"
          @click="navigateTo('/')"
        />
      </div>
    </UCard>
  </div>

  <!-- Full-Page Chat (when enabled) -->
  <GhostChatFullPage v-else />
</template>

<script setup lang="ts">
// Check if Strands chat is enabled
const siteConfigStore = useSiteConfigStore()
const strandsEnabled = computed(() => siteConfigStore.isStrandsChatEnabled)

// Page metadata
definePageMeta({
  title: 'GHOST Chat',
  description: 'AI-powered assistant for AWS operations - ask questions about costs, configurations, security, and more'
})
</script>

<style scoped>
.disabled-notice {
  @apply flex items-center justify-center p-6;
}
</style>

