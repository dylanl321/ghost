<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
          System Configuration
        </h2>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage feature flags, service URLs, and site-wide settings
        </p>
      </div>
      <div class="flex gap-2">
        <UButton
          icon="i-heroicons-clock"
          label="History"
          variant="outline"
          @click="showHistory = true"
        />
        <UButton
          icon="i-heroicons-arrow-path"
          label="Refresh"
          variant="outline"
          :loading="loading"
          @click="loadConfig"
        />
        <UButton
          icon="i-heroicons-arrow-uturn-left"
          label="Reset All"
          color="red"
          variant="outline"
          :loading="resetting"
          @click="confirmResetAll"
        />
      </div>
    </div>

    <!-- Search and Filters -->
    <div class="flex gap-3 items-center">
      <UInput
        v-model="searchQuery"
        placeholder="Search settings..."
        icon="i-heroicons-magnifying-glass"
        class="flex-1"
      />
      <USelect
        v-model="categoryFilter"
        :options="categoryOptions"
        placeholder="All Categories"
        class="w-48"
      />
      <UButton
        :label="showModifiedOnly ? 'Modified Only' : 'Show All'"
        :color="showModifiedOnly ? 'primary' : 'gray'"
        variant="outline"
        icon="i-heroicons-funnel"
        @click="showModifiedOnly = !showModifiedOnly"
      />
    </div>

    <!-- Loading State -->
    <div v-if="loading && !configs.length" class="flex justify-center py-12">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
        <p class="text-gray-500 dark:text-gray-400">Loading configuration...</p>
      </div>
    </div>

    <!-- Error State -->
    <UAlert
      v-if="error"
      icon="i-heroicons-exclamation-triangle"
      color="red"
      variant="soft"
      :title="error"
      :close-button="{ icon: 'i-heroicons-x-mark-20-solid', color: 'red', variant: 'link' }"
      @close="error = null"
    />

    <!-- Success Notification -->
    <UAlert
      v-if="successMessage"
      icon="i-heroicons-check-circle"
      color="green"
      variant="soft"
      :title="successMessage"
      :close-button="{ icon: 'i-heroicons-x-mark-20-solid', color: 'green', variant: 'link' }"
      @close="successMessage = null"
    />

    <!-- Configuration Grid -->
    <div v-if="!loading || configs.length">
      <div v-if="filteredConfigs.length === 0" class="text-center py-12 text-gray-500">
        No settings match your search criteria
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ConfigItem
          v-for="config in filteredConfigs"
          :key="config.key"
          :config="config"
          @update="handleUpdate"
          @reset="handleReset"
        />
      </div>
    </div>

    <!-- Change History Modal -->
    <ChangeHistoryModal v-model="showHistory" />
  </div>
</template>

<script setup lang="ts">
import type { SiteConfigItem } from '~/shared/types/site-config';

const configs = ref<SiteConfigItem[]>([]);
const loading = ref(false);
const resetting = ref(false);
const error = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const showHistory = ref(false);

// Search and filter state
const searchQuery = ref('');
const categoryFilter = ref('');
const showModifiedOnly = ref(false);

// Category options for filter
const categoryOptions = [
  { label: 'All Categories', value: '' },
  { label: 'Feature Flags', value: 'features' },
  { label: 'Service Configuration', value: 'services' },
  { label: 'Performance Settings', value: 'performance' },
  { label: 'UI Customization', value: 'ui' },
];

// Filtered configs based on search and filters
const filteredConfigs = computed(() => {
  let filtered = configs.value;

  // Apply category filter
  if (categoryFilter.value) {
    filtered = filtered.filter((c) => c.category === categoryFilter.value);
  }

  // Apply search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter((c) => {
      return (
        c.label.toLowerCase().includes(query) ||
        c.key.toLowerCase().includes(query) ||
        c.description.toLowerCase().includes(query)
      );
    });
  }

  // Apply modified only filter
  if (showModifiedOnly.value) {
    filtered = filtered.filter((c) => {
      // Compare current value with defaultValue stored in the config itself
      return JSON.stringify(c.value) !== JSON.stringify(c.defaultValue);
    });
  }

  return filtered;
});

// Load configuration on mount
onMounted(() => {
  loadConfig();
});

async function loadConfig() {
  loading.value = true;
  error.value = null;

  try {
    const response = await $fetch('/api/admin/site-config/all');
    if (response.success) {
      configs.value = response.configs;
    } else {
      throw new Error('Failed to load configuration');
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to load configuration';
    console.error('Error loading config:', e);
  } finally {
    loading.value = false;
  }
}

async function handleUpdate(key: string, value: any) {
  error.value = null;
  successMessage.value = null;

  try {
    const response = await $fetch(`/api/admin/site-config/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: { value },
    });

    if (response.success) {
      // Update local config
      const index = configs.value.findIndex((c) => c.key === key);
      if (index !== -1) {
        configs.value[index] = response.config;
      }

      successMessage.value = `Updated ${response.config.label} successfully`;

      // Refresh site config store so changes take effect
      const siteConfigStore = useSiteConfigStore();
      await siteConfigStore.refresh();
    }
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to update configuration';
    console.error('Error updating config:', e);
  }
}

async function handleReset(key: string) {
  error.value = null;
  successMessage.value = null;

  try {
    const response = await $fetch('/api/admin/site-config/reset', {
      method: 'POST',
      body: { key },
    });

    if (response.success) {
      // Update local config
      const index = configs.value.findIndex((c) => c.key === key);
      if (index !== -1) {
        configs.value[index] = response.config;
      }

      successMessage.value = response.message;

      // Refresh site config store
      const siteConfigStore = useSiteConfigStore();
      await siteConfigStore.refresh();
    }
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to reset configuration';
    console.error('Error resetting config:', e);
  }
}

async function confirmResetAll() {
  if (!confirm('Are you sure you want to reset ALL configuration to defaults? This cannot be undone.')) {
    return;
  }

  resetting.value = true;
  error.value = null;
  successMessage.value = null;

  try {
    const response = await $fetch('/api/admin/site-config/reset', {
      method: 'POST',
      body: {},
    });

    if (response.success) {
      successMessage.value = response.message;
      await loadConfig();

      // Refresh site config store
      const siteConfigStore = useSiteConfigStore();
      await siteConfigStore.refresh();
    }
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to reset all configuration';
    console.error('Error resetting all config:', e);
  } finally {
    resetting.value = false;
  }
}
</script>
