<template>
  <UModal v-model="isOpen" :ui="{ width: 'sm:max-w-4xl' }">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-clock" class="text-xl" />
            <h3 class="text-lg font-semibold">Configuration Change History</h3>
          </div>
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-x-mark"
            @click="isOpen = false"
          />
        </div>
      </template>

      <!-- Filters -->
      <div class="mb-4 flex gap-2">
        <UInput
          v-model="searchQuery"
          placeholder="Search by key or user..."
          icon="i-heroicons-magnifying-glass"
          class="flex-1"
        />
        <UButton
          icon="i-heroicons-arrow-path"
          label="Refresh"
          variant="outline"
          :loading="loading"
          @click="loadHistory"
        />
      </div>

      <!-- Loading State -->
      <div v-if="loading && !history.length" class="flex justify-center py-12">
        <div class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p class="text-gray-500 dark:text-gray-400">Loading history...</p>
        </div>
      </div>

      <!-- Error State -->
      <UAlert
        v-if="error"
        icon="i-heroicons-exclamation-triangle"
        color="red"
        variant="soft"
        :title="error"
        class="mb-4"
      />

      <!-- History Table -->
      <div v-if="!loading || history.length" class="space-y-3">
        <div v-if="filteredHistory.length === 0" class="text-center py-8 text-gray-500">
          No changes found
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="entry in filteredHistory"
            :key="`${entry.key}-${entry.changedAt}`"
            class="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-2">
                  <UIcon name="i-heroicons-pencil-square" class="text-gray-400 flex-shrink-0" />
                  <code class="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {{ entry.key }}
                  </code>
                </div>

                <div class="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span class="text-gray-500 dark:text-gray-400">Old Value:</span>
                    <div class="mt-1 p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                      <code class="text-xs text-red-700 dark:text-red-300 break-all">
                        {{ formatValue(entry.oldValue) }}
                      </code>
                    </div>
                  </div>
                  <div>
                    <span class="text-gray-500 dark:text-gray-400">New Value:</span>
                    <div class="mt-1 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                      <code class="text-xs text-green-700 dark:text-green-300 break-all">
                        {{ formatValue(entry.newValue) }}
                      </code>
                    </div>
                  </div>
                </div>

                <div v-if="entry.reason" class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  <span class="font-medium">Reason:</span> {{ entry.reason }}
                </div>
              </div>

              <div class="text-right text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                <div class="font-medium">{{ entry.changedBy }}</div>
                <div>{{ formatDate(entry.changedAt) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination Info -->
      <div v-if="filteredHistory.length > 0" class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 text-center">
        Showing {{ filteredHistory.length }} change{{ filteredHistory.length === 1 ? '' : 's' }}
      </div>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import type { SiteConfigHistoryEntry } from '~/shared/types/site-config';

const isOpen = defineModel<boolean>();

const history = ref<SiteConfigHistoryEntry[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const searchQuery = ref('');

// Load history when modal opens
watch(isOpen, (open) => {
  if (open && history.value.length === 0) {
    loadHistory();
  }
});

const filteredHistory = computed(() => {
  if (!searchQuery.value) {
    return history.value;
  }

  const query = searchQuery.value.toLowerCase();
  return history.value.filter((entry) => {
    return (
      entry.key.toLowerCase().includes(query) ||
      entry.changedBy.toLowerCase().includes(query)
    );
  });
});

async function loadHistory() {
  loading.value = true;
  error.value = null;

  try {
    const response = await $fetch('/api/admin/site-config/history');
    if (response.success) {
      history.value = response.history;
    } else {
      throw new Error('Failed to load change history');
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to load change history';
    console.error('Error loading history:', e);
  } finally {
    loading.value = false;
  }
}

function formatValue(value: any): string {
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
}
</script>
