<template>
  <div>
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          API Keys
        </h1>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Manage API keys for programmatic access to GHOST APIs
        </p>
      </div>
      <UButton
        color="blue"
        size="sm"
        icon="i-heroicons-plus"
        @click="navigateTo('/admin/api-keys')"
      >
        Create API Key
      </UButton>
    </div>

    <!-- Info Alert -->
    <UAlert
      color="blue"
      variant="soft"
      icon="i-heroicons-information-circle"
      class="mb-6"
      title="About API Keys"
      description="API keys allow external systems to access GHOST APIs. Click 'Create API Key' to visit the full management page."
    />

    <!-- Quick Info -->
    <UCard>
      <div class="p-8 text-center">
        <Icon name="i-heroicons-key" class="w-12 h-12 text-blue-500 mx-auto mb-4" />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          API Key Management
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
          The full API key management interface is available on its dedicated page with all features including creation, viewing usage, and revocation.
        </p>
        <UButton
          color="blue"
          @click="navigateTo('/admin/api-keys')"
        >
          Go to API Keys Page
        </UButton>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
// This is a simplified panel that directs users to the full API Keys page
// The full functionality requires its own page due to complexity
</script>
