<template>
  <div>
    <!-- Header -->
    <div
      class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      :class="{ 'sm:justify-end': !showHeading }"
    >
      <div v-if="showHeading">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          Personal API Keys
        </h1>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Manage your own keys for programmatic access to GHOST APIs
        </p>
      </div>
      <UButton
        color="blue"
        size="sm"
        icon="i-heroicons-plus"
        @click="showCreateModal = true"
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
      description="API keys provide organization-wide, read-only access to supported /api/v1 endpoints. Send them only in the x-api-key header."
    />

    <!-- API Keys List -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
            Your API Keys
          </h2>
          <UBadge color="gray" variant="soft">
            {{ apiKeys.length }} {{ apiKeys.length === 1 ? 'key' : 'keys' }}
          </UBadge>
        </div>
      </template>

      <div v-if="loading" class="text-center py-12">
        <Icon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
        <p class="text-gray-500 dark:text-gray-400">Loading API keys...</p>
      </div>

      <div v-else-if="loadError" class="text-center py-12">
        <Icon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Couldn't load your API keys
        </h3>
        <p class="text-gray-500 dark:text-gray-400 mb-6">
          {{ loadError }}
        </p>
        <UButton color="gray" variant="soft" icon="i-heroicons-arrow-path" @click="loadKeys">
          Try Again
        </UButton>
      </div>

      <div v-else-if="apiKeys.length === 0" class="text-center py-12">
        <Icon name="i-heroicons-key" class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No API Keys Yet
        </h3>
        <p class="text-gray-500 dark:text-gray-400 mb-6">
          Create your first API key to get started with programmatic access.
        </p>
        <UButton color="blue" @click="showCreateModal = true">
          Create Your First Key
        </UButton>
      </div>

      <div v-else class="space-y-4">
        <UCard
          v-for="key in sortedKeys"
          :key="key.id"
          :class="{ 'opacity-50': !key.isActive || isExpired(key) }"
        >
          <div class="space-y-4">
            <!-- Header -->
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {{ key.name }}
                  </h3>
                  <UBadge v-if="!key.isActive" color="gray" variant="soft" size="xs">
                    Revoked
                  </UBadge>
                  <UBadge v-else-if="isExpired(key)" color="red" variant="soft" size="xs">
                    Expired
                  </UBadge>
                  <UBadge v-else color="green" variant="soft" size="xs">
                    Active
                  </UBadge>
                </div>

                <div class="mb-3 flex flex-wrap gap-1.5">
                  <UBadge
                    v-for="scope in key.scopes || []"
                    :key="scope"
                    color="emerald"
                    variant="soft"
                    size="xs"
                    class="font-mono"
                  >
                    {{ scope }}
                  </UBadge>
                </div>

                <!-- Description -->
                <p v-if="key.metadata?.description" class="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {{ key.metadata.description }}
                </p>

                <!-- Key Info -->
                <div class="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <div class="flex items-center gap-2">
                    <Icon name="i-heroicons-identification" class="w-4 h-4" />
                    <span>Key ID <span class="font-mono text-xs">{{ key.id }}</span></span>
                  </div>
                  <div class="flex items-center gap-2">
                    <Icon name="i-heroicons-calendar" class="w-4 h-4" />
                    <span>Created {{ formatDateTime(key.createdAt) }}</span>
                  </div>
                  <div v-if="key.expiresAt" class="flex items-center gap-2">
                    <Icon name="i-heroicons-clock" class="w-4 h-4" />
                    <span>{{ isExpired(key) ? 'Expired' : 'Expires' }} {{ formatDateTime(key.expiresAt) }}</span>
                  </div>
                  <div v-else class="flex items-center gap-2">
                    <Icon name="i-heroicons-clock" class="w-4 h-4" />
                    <span>Never expires</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <Icon name="i-heroicons-arrow-path" class="w-4 h-4" />
                    <span>{{ key.lastUsedAt ? `Last used ${formatDateTime(key.lastUsedAt)}` : 'Never used' }}</span>
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex flex-wrap items-center gap-2">
                <UButton
                  color="blue"
                  variant="ghost"
                  size="sm"
                  icon="i-heroicons-chart-bar"
                  @click="viewUsage(key)"
                >
                  Usage
                </UButton>
                <UButton
                  v-if="key.isActive"
                  color="gray"
                  variant="ghost"
                  size="sm"
                  icon="i-heroicons-pencil"
                  @click="editDescription(key)"
                >
                  Edit
                </UButton>
                <UButton
                  v-if="key.isActive"
                  color="red"
                  variant="ghost"
                  size="sm"
                  icon="i-heroicons-trash"
                  @click="confirmDelete(key)"
                >
                  Revoke
                </UButton>
              </div>
            </div>

            <!-- Example API Calls -->
            <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
              <details class="group">
                <summary class="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Icon name="i-heroicons-code-bracket" class="w-4 h-4" />
                  Example API Calls
                  <Icon name="i-heroicons-chevron-down" class="w-4 h-4 group-open:rotate-180 transition-transform" />
                </summary>
                <div class="mt-3 space-y-2">
                  <div class="bg-gray-50 dark:bg-gray-800 rounded p-2 text-xs font-mono overflow-x-auto">
                    <span class="text-gray-500"># Using x-api-key header</span><br>
                    curl -H "x-api-key: YOUR_API_KEY" {{ currentDomain }}/api/v1/accounts
                  </div>
                </div>
              </details>
            </div>
          </div>
        </UCard>
      </div>
    </UCard>

    <!-- Create API Key Modal -->
    <UModal v-model="showCreateModal" :ui="{ width: 'sm:max-w-2xl' }">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Create New API Key
          </h3>
        </template>

        <div v-if="!createdKey" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Permissions
            </label>
            <p class="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Every permission is read-only and covers the whole organization. Pick only what the integration calls.
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <UCheckbox
                v-for="scope in scopeOptions"
                :key="scope.value"
                v-model="newKeyScopes"
                :value="scope.value"
                :label="scope.label"
                :help="scope.help"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Key Name
            </label>
            <UInput
              v-model="newKeyName"
              placeholder="e.g., Production Scripts, CI/CD Pipeline"
              size="lg"
              :maxlength="100"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Give your API key a descriptive name to remember its purpose
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description (Optional)
            </label>
            <UTextarea
              v-model="newKeyDescription"
              placeholder="Add notes about this key's purpose, where it's used, etc."
              :rows="3"
              size="lg"
              :maxlength="DESCRIPTION_MAX"
            />
            <p class="mt-1 text-right text-xs text-gray-400">{{ newKeyDescription.length }}/{{ DESCRIPTION_MAX }}</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Expiration
            </label>
            <USelect
              v-model="newKeyExpiration"
              :options="expirationOptions"
              size="lg"
            />
          </div>

          <UAlert
            color="amber"
            variant="soft"
            icon="i-heroicons-exclamation-triangle"
            title="Important"
            description="The API key will only be shown once. Make sure to copy it to a secure location."
          />
        </div>

        <!-- Show Generated Key -->
        <div v-else class="space-y-4">
          <UAlert
            color="green"
            variant="soft"
            icon="i-heroicons-check-circle"
            title="API Key Created Successfully"
            description="Copy this key now - it will not be shown again!"
          />

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Your API Key
            </label>
            <div class="flex gap-2">
              <UInput
                :model-value="createdKey"
                readonly
                size="lg"
                class="flex-1 font-mono"
              />
              <UButton
                color="blue"
                icon="i-heroicons-clipboard-document"
                @click="copyToClipboard"
              >
                {{ copied ? 'Copied!' : 'Copy' }}
              </UButton>
            </div>
          </div>

          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              How to Use This Key
            </h4>
            <p class="text-xs text-gray-600 dark:text-gray-400 mb-3">
              Include this key in the x-api-key header:
            </p>
            <div class="space-y-2">
              <div class="bg-white dark:bg-gray-900 rounded p-2 text-xs font-mono">
                <span class="text-gray-500"># Header method</span><br>
                curl -H "x-api-key: {{ createdKey }}" {{ currentDomain }}/api/v1/accounts
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              v-if="!createdKey"
              color="gray"
              variant="ghost"
              @click="showCreateModal = false"
            >
              Cancel
            </UButton>
            <UButton
              v-if="!createdKey"
              color="blue"
              :loading="creating"
              :disabled="!newKeyName.trim() || newKeyScopes.length === 0"
              @click="createKey"
            >
              Create API Key
            </UButton>
            <UButton
              v-else
              color="blue"
              @click="closeCreateModal"
            >
              Done
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model="showDeleteModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Revoke API Key
          </h3>
        </template>

        <div class="space-y-4">
          <p class="text-gray-600 dark:text-gray-400">
            Are you sure you want to revoke the API key <strong class="text-gray-900 dark:text-white">{{ keyToDelete?.name }}</strong>?
          </p>
          <UAlert
            color="red"
            variant="soft"
            icon="i-heroicons-exclamation-triangle"
            title="This action cannot be undone"
            description="Any systems using this key will immediately lose access to GHOST APIs."
          />
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="ghost"
              @click="showDeleteModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="red"
              :loading="deleting"
              @click="deleteKey"
            >
              Revoke Key
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Usage History Modal -->
    <UModal v-model="showUsageModal" :ui="{ width: 'sm:max-w-4xl' }">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Usage History - {{ selectedKey?.name }}
          </h3>
        </template>

        <div v-if="loadingUsage" class="text-center py-12">
          <Icon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
          <p class="text-gray-500 dark:text-gray-400">Loading usage data...</p>
        </div>

        <div v-else class="space-y-6">
          <!-- Statistics -->
          <div v-if="usageStats" class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ usageStats.totalCalls.toLocaleString() }}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400">Last {{ usageStats.windowDays || 30 }} Days</div>
            </div>
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ usageStats.last24Hours.toLocaleString() }}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400">Last 24 Hours</div>
            </div>
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ usageStats.last7Days.toLocaleString() }}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400">Last 7 Days</div>
            </div>
          </div>

          <p v-if="usageStats?.truncated" class="text-xs text-amber-600 dark:text-amber-400">
            This key made more calls than GHOST can count in one view; totals are a lower bound.
          </p>

          <!-- Last Used -->
          <div v-if="usageStats?.lastUsed" class="text-sm text-gray-600 dark:text-gray-400">
            <Icon name="i-heroicons-clock" class="w-4 h-4 inline mr-2" />
            Last used: {{ formatDateTime(usageStats.lastUsed) }}
          </div>

          <!-- Top Endpoints -->
          <div v-if="topEndpoints.length > 0">
            <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-2">Top Endpoints</h4>
            <div class="space-y-2">
              <div
                v-for="[endpoint, count] in topEndpoints"
                :key="endpoint"
                class="flex items-center justify-between text-sm"
              >
                <span class="font-mono text-xs text-gray-600 dark:text-gray-400">{{ endpoint }}</span>
                <span class="font-medium text-gray-900 dark:text-white">{{ count }} calls</span>
              </div>
            </div>
          </div>

          <div v-if="usageStats && Object.keys(usageStats.callsByStatus).length > 0">
            <h4 class="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Response statuses</h4>
            <div class="flex flex-wrap gap-2">
              <UBadge v-for="(count, status) in usageStats.callsByStatus" :key="status" color="gray" variant="soft">
                {{ status }} · {{ count }}
              </UBadge>
            </div>
          </div>

          <div v-if="usageHistory.length > 0">
            <h4 class="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Recent calls</h4>
            <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table class="min-w-full divide-y divide-gray-200 text-left text-xs dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-800">
                  <tr><th class="px-3 py-2">Time</th><th class="px-3 py-2">Method</th><th class="px-3 py-2">Endpoint</th><th class="px-3 py-2">Status</th></tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr v-for="call in usageHistory.slice(0, 20)" :key="`${call.timestamp}-${call.endpoint}`">
                    <td class="whitespace-nowrap px-3 py-2">{{ formatDateTime(call.timestamp) }}</td>
                    <td class="px-3 py-2 font-mono">{{ call.method }}</td>
                    <td class="px-3 py-2 font-mono">{{ call.endpoint }}</td>
                    <td class="px-3 py-2">
                      <span :class="call.statusCode >= 400 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'">{{ call.statusCode }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div v-if="!usageStats?.totalCalls" class="text-center py-8 text-gray-500 dark:text-gray-400">
            No calls in the last {{ usageStats?.windowDays || 30 }} days
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end">
            <UButton color="gray" variant="ghost" @click="showUsageModal = false">
              Close
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Edit Description Modal -->
    <UModal v-model="showEditModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Edit Description - {{ selectedKey?.name }}
          </h3>
        </template>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description / Notes
            </label>
            <UTextarea
              v-model="editKeyDescription"
              placeholder="Add notes about this key's purpose, where it's used, etc."
              :rows="5"
              size="lg"
              :maxlength="DESCRIPTION_MAX"
            />
            <p class="mt-1 text-right text-xs text-gray-400">{{ editKeyDescription.length }}/{{ DESCRIPTION_MAX }}</p>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="gray" variant="ghost" @click="showEditModal = false">
              Cancel
            </UButton>
            <UButton color="blue" :loading="updating" @click="saveDescription">
              Save
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ showHeading?: boolean }>(), {
  showHeading: true
})

const logger = createLogger('ApiKeysPanel')

const toast = useToast()

// State
const loading = ref(true)
const loadError = ref('')
const apiKeys = ref<any[]>([])
const showCreateModal = ref(false)
const showDeleteModal = ref(false)
const showUsageModal = ref(false)
const showEditModal = ref(false)
const keyToDelete = ref<any>(null)
const selectedKey = ref<any>(null)
const usageStats = ref<any>(null)
const usageHistory = ref<any[]>([])
const loadingUsage = ref(false)
const newKeyName = ref('')
const newKeyDescription = ref('')
const newKeyExpiration = ref('90')
const newKeyScopes = ref<string[]>(['accounts:read'])
const editKeyDescription = ref('')
const creating = ref(false)
const deleting = ref(false)
const updating = ref(false)
const createdKey = ref('')
const copied = ref(false)

// Get current domain for examples
const currentDomain = computed(() => {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return 'http://localhost:3000'
})

// Expiration options
const expirationOptions = [
  { label: '90 days', value: '90' },
  { label: '30 days', value: '30' },
  { label: '180 days', value: '180' },
  { label: '1 year', value: '365' },
  { label: 'Never expires', value: 'never' }
]
const scopeOptions = [
  { label: 'Accounts', value: 'accounts:read', help: 'Accounts and organization structure' },
  { label: 'Costs', value: 'costs:read', help: 'Cost summaries, tag costs and tag keys' },
  { label: 'Forecasts', value: 'forecast:read', help: 'AWS and Finance forecasts' },
  { label: 'Security', value: 'security:read', help: 'Security Hub and Inspector findings' }
]
const DESCRIPTION_MAX = 1000

const errorMessage = (error: any, fallback: string) =>
  error?.data?.error?.message || error?.data?.statusMessage || error?.statusMessage || fallback

// Usable keys first, newest first within each group.
const sortedKeys = computed(() => [...apiKeys.value].sort((left, right) => {
  const usable = (key: any) => key.isActive && !isExpired(key) ? 0 : 1
  return usable(left) - usable(right) ||
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
}))

const topEndpoints = computed<[string, number][]>(() =>
  Object.entries<number>(usageStats.value?.callsByEndpoint || {})
    .sort(([, left], [, right]) => right - left)
    .slice(0, 10))

// Load API keys
const loadKeys = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const response = await $fetch('/api/auth/api-keys')
    if (response.success) {
      apiKeys.value = response.data.keys
    }
  } catch (error: any) {
    logger.error('Failed to load API keys:', error)
    loadError.value = errorMessage(error, 'Failed to load API keys')
    toast.add({
      title: 'Error',
      description: errorMessage(error, 'Failed to load API keys'),
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  } finally {
    loading.value = false
  }
}

// Create API key
const createKey = async () => {
  creating.value = true
  try {
    const expiresInDays = newKeyExpiration.value === 'never' ? undefined : parseInt(newKeyExpiration.value)

    const metadata: any = {}
    if (newKeyDescription.value.trim()) {
      metadata.description = newKeyDescription.value.trim()
    }

    const response = await $fetch('/api/auth/api-keys/create', {
      method: 'POST',
      body: {
        name: newKeyName.value.trim(),
        scopes: newKeyScopes.value,
        ...(expiresInDays ? { expiresInDays } : { neverExpires: true }),
        metadata
      }
    })

    if (response.success) {
      createdKey.value = response.data.key
      toast.add({
        title: 'Success',
        description: 'API key created successfully',
        color: 'green',
        icon: 'i-heroicons-check-circle'
      })
    }
  } catch (error: any) {
    logger.error('Failed to create API key:', error)
    toast.add({
      title: 'Error',
      description: errorMessage(error, 'Failed to create API key'),
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  } finally {
    creating.value = false
  }
}

// Close create modal and reload keys
const closeCreateModal = () => {
  showCreateModal.value = false
}

// However the modal closes (Done, Escape, clicking outside), never leave the
// secret behind for the next time it opens, and show the new key in the list.
watch(showCreateModal, (open) => {
  if (open) return
  const created = Boolean(createdKey.value)
  createdKey.value = ''
  copied.value = false
  newKeyName.value = ''
  newKeyDescription.value = ''
  newKeyExpiration.value = '90'
  newKeyScopes.value = ['accounts:read']
  if (created) loadKeys()
})

// View usage history
const viewUsage = async (key: any) => {
  selectedKey.value = key
  usageStats.value = null
  usageHistory.value = []
  loadingUsage.value = true
  showUsageModal.value = true

  try {
    const response = await $fetch(`/api/auth/api-keys/${key.id}/usage`)
    if (response.success) {
      usageStats.value = response.data.stats
      usageHistory.value = response.data.history
    }
  } catch (error: any) {
    logger.error('Failed to load usage:', error)
    toast.add({
      title: 'Error',
      description: errorMessage(error, 'Failed to load usage history'),
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  } finally {
    loadingUsage.value = false
  }
}

// Edit key description
const editDescription = (key: any) => {
  selectedKey.value = key
  editKeyDescription.value = key.metadata?.description || ''
  showEditModal.value = true
}

// Save key description
const saveDescription = async () => {
  if (!selectedKey.value) return

  updating.value = true
  try {
    await $fetch(`/api/auth/api-keys/${selectedKey.value.id}`, {
      method: 'PATCH',
      body: {
        metadata: {
          description: editKeyDescription.value.trim()
        }
      }
    })

    toast.add({
      title: 'Success',
      description: 'API key description updated',
      color: 'green',
      icon: 'i-heroicons-check-circle'
    })

    showEditModal.value = false
    loadKeys()
  } catch (error: any) {
    logger.error('Failed to update description:', error)
    toast.add({
      title: 'Error',
      description: errorMessage(error, 'Failed to update description'),
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  } finally {
    updating.value = false
  }
}

// Copy to clipboard
const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(createdKey.value)
  } catch {
    toast.add({ title: 'Copy failed', description: 'Select the key and copy it manually.', color: 'amber' })
    return
  }
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}

// Confirm delete
const confirmDelete = (key: any) => {
  keyToDelete.value = key
  showDeleteModal.value = true
}

// Delete API key
const deleteKey = async () => {
  if (!keyToDelete.value) return

  deleting.value = true
  try {
    await $fetch(`/api/auth/api-keys/${keyToDelete.value.id}`, {
      method: 'DELETE'
    })

    toast.add({
      title: 'Success',
      description: 'API key revoked successfully',
      color: 'green',
      icon: 'i-heroicons-check-circle'
    })

    showDeleteModal.value = false
    loadKeys()
  } catch (error: any) {
    logger.error('Failed to delete API key:', error)
    toast.add({
      title: 'Error',
      description: errorMessage(error, 'Failed to revoke API key'),
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  } finally {
    deleting.value = false
  }
}

// Check if key is expired
const isExpired = (key: any) => {
  if (!key.expiresAt) return false
  return new Date(key.expiresAt) < new Date()
}

const { formatDateTime } = useDateFormatter()

// Load keys on mount
onMounted(() => {
  loadKeys()
})
</script>
