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
      description="API keys allow external systems to access GHOST APIs. They work for all endpoints except Entra ID APIs, which require user authentication."
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
          v-for="key in apiKeys"
          :key="key.id"
          :class="{ 'opacity-50': !key.isActive }"
        >
          <div class="space-y-4">
            <!-- Header -->
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {{ key.name }}
                  </h3>
                  <UBadge v-if="!key.isActive" color="gray" variant="soft" size="xs">
                    Inactive
                  </UBadge>
                  <UBadge v-else-if="isExpired(key)" color="red" variant="soft" size="xs">
                    Expired
                  </UBadge>
                  <UBadge v-else color="green" variant="soft" size="xs">
                    Active
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
                    <span class="font-mono text-xs">{{ key.id }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <Icon name="i-heroicons-calendar" class="w-4 h-4" />
                    <span>Created {{ formatDate(key.createdAt) }}</span>
                  </div>
                  <div v-if="key.expiresAt" class="flex items-center gap-2">
                    <Icon name="i-heroicons-clock" class="w-4 h-4" />
                    <span>Expires {{ formatDate(key.expiresAt) }}</span>
                  </div>
                  <div v-if="key.lastUsedAt" class="flex items-center gap-2">
                    <Icon name="i-heroicons-arrow-path" class="w-4 h-4" />
                    <span>Last used {{ formatDate(key.lastUsedAt) }}</span>
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-2">
                <UButton
                  v-if="key.isActive"
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
                    <span class="text-gray-500"># Using x-api-key header</span><br />
                    curl -H "x-api-key: YOUR_API_KEY" {{ currentDomain }}/api/accounts/list
                  </div>
                  <div class="bg-gray-50 dark:bg-gray-800 rounded p-2 text-xs font-mono overflow-x-auto">
                    <span class="text-gray-500"># Using Bearer token</span><br />
                    curl -H "Authorization: Bearer YOUR_API_KEY" {{ currentDomain }}/api/costs/summary
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
              Key Name
            </label>
            <UInput
              v-model="newKeyName"
              placeholder="e.g., Production Scripts, CI/CD Pipeline"
              size="lg"
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
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Expiration (Optional)
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
              Include this key in your API requests using one of these methods:
            </p>
            <div class="space-y-2">
              <div class="bg-white dark:bg-gray-900 rounded p-2 text-xs font-mono">
                <span class="text-gray-500"># Header method</span><br />
                curl -H "x-api-key: {{ createdKey }}" {{ currentDomain }}/api/accounts/list
              </div>
              <div class="bg-white dark:bg-gray-900 rounded p-2 text-xs font-mono">
                <span class="text-gray-500"># Bearer token method</span><br />
                curl -H "Authorization: Bearer {{ createdKey }}" {{ currentDomain }}/api/costs/summary
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
              :disabled="!newKeyName"
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
          <div v-if="usageStats" class="grid grid-cols-3 gap-4">
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ usageStats.totalCalls.toLocaleString() }}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400">Total Calls</div>
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

          <!-- Last Used -->
          <div v-if="usageStats?.lastUsed" class="text-sm text-gray-600 dark:text-gray-400">
            <Icon name="i-heroicons-clock" class="w-4 h-4 inline mr-2" />
            Last used: {{ formatDate(usageStats.lastUsed) }}
          </div>

          <!-- Top Endpoints -->
          <div v-if="usageStats && Object.keys(usageStats.callsByEndpoint).length > 0">
            <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-2">Top Endpoints</h4>
            <div class="space-y-2">
              <div
                v-for="(count, endpoint) in usageStats.callsByEndpoint"
                :key="endpoint"
                class="flex items-center justify-between text-sm"
              >
                <span class="font-mono text-xs text-gray-600 dark:text-gray-400">{{ endpoint }}</span>
                <span class="font-medium text-gray-900 dark:text-white">{{ count }} calls</span>
              </div>
            </div>
          </div>

          <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
            No usage history available yet
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
            />
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
const logger = createLogger('ApiKeysPanel')

const toast = useToast()

// State
const loading = ref(true)
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
const newKeyExpiration = ref('never')
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
  { label: 'Never expires', value: 'never' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
  { label: '180 days', value: '180' },
  { label: '1 year', value: '365' }
]

// Load API keys
const loadKeys = async () => {
  loading.value = true
  try {
    const response = await $fetch('/api/auth/api-keys')
    if (response.success) {
      apiKeys.value = response.data.keys
    }
  } catch (error: any) {
    logger.error('Failed to load API keys:', error)
    toast.add({
      title: 'Error',
      description: 'Failed to load API keys',
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
    if (newKeyDescription.value) {
      metadata.description = newKeyDescription.value
    }

    const response = await $fetch('/api/auth/api-keys/create', {
      method: 'POST',
      body: {
        name: newKeyName.value,
        scopes: [
          'entra:read',
          'entra:write',
          'entra:admin',
          'accounts:read',
          'accounts:write',
          'costs:read',
          'costs:write',
          'forecast:read',
          'forecast:write',
          'security-lake:read',
          'security-lake:write',
          'groups:read',
          'users:read',
          'cache:manage',
          'admin:all'
        ],
        expiresInDays,
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
      description: error.data?.statusMessage || 'Failed to create API key',
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
  createdKey.value = ''
  newKeyName.value = ''
  newKeyDescription.value = ''
  newKeyExpiration.value = 'never'
  loadKeys()
}

// View usage history
const viewUsage = async (key: any) => {
  selectedKey.value = key
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
      description: 'Failed to load usage history',
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
          ...selectedKey.value.metadata,
          description: editKeyDescription.value
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
      description: 'Failed to update description',
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  } finally {
    updating.value = false
  }
}

// Copy to clipboard
const copyToClipboard = () => {
  navigator.clipboard.writeText(createdKey.value)
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
      description: error.data?.statusMessage || 'Failed to revoke API key',
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

// Format date
const formatDate = (date: string | Date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Load keys on mount
onMounted(() => {
  loadKeys()
})
</script>
