<template>
  <div class="space-y-6">
    <!-- Header -->
    <UCard>
      <h1 class="text-2xl font-semibold">Admin Notifications</h1>
      <p class="text-sm text-gray-500">View all sent admin notifications including feedback alerts, errors, and system events.</p>
    </UCard>

    <!-- Filters -->
    <UCard>
      <template #header>
        <div class="text-lg font-semibold">Filters</div>
      </template>

      <div class="flex flex-wrap gap-6 items-center">
        <UFormGroup label="Type" class="min-w-[200px]">
          <USelect
            v-model="selectedType"
            :options="notificationTypeOptions"
            placeholder="Select type"
          />
        </UFormGroup>

        <UFormGroup label="Status" class="min-w-[200px]">
          <USelect
            v-model="selectedStatus"
            :options="statusOptions"
            placeholder="Select status"
          />
        </UFormGroup>

        <UFormGroup label="Search" class="min-w-[250px]">
          <UInput v-model="search" placeholder="Search subject or content..." />
        </UFormGroup>
      </div>
    </UCard>

    <!-- Table -->
    <UCard>
      <template #header>
        <div class="flex justify-between">
          <div class="flex items-center gap-3">
            <div class="text-lg font-semibold">Results</div>
            <UBadge color="emerald" variant="subtle">{{ filteredItems.length }} results</UBadge>
          </div>
          <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-path" :loading="loading" title="Refresh data" @click="fetchNotifications">Refresh</UButton>
        </div>
      </template>

      <UTable
        :rows="paginatedItems"
        :columns="columns"
        :loading="loading"
        class="min-w-full"
      >
        <template #type-data="{ row }">
          <UBadge :color="getTypeColor(row.type)" variant="subtle">
            {{ row.type }}
          </UBadge>
        </template>

        <template #status-data="{ row }">
          <UBadge :color="row.status === 'SENT' ? 'green' : 'red'">
            {{ row.status }}
          </UBadge>
        </template>

        <template #timestamp-data="{ row }">
          {{ formatDate(row.timestamp) }}
        </template>

        <template #recipients-data="{ row }">
          <div class="text-sm">
            {{ row.recipients.length }} recipient{{ row.recipients.length !== 1 ? 's' : '' }}
          </div>
        </template>

        <!-- Actions column -->
        <template #actions-data="{ row }">
          <UButton color="gray" variant="ghost" icon="i-heroicons-eye" @click="viewNotification(row)">
            View
          </UButton>
        </template>
      </UTable>

      <div class="flex justify-end items-center mt-4">
        <UPagination
          v-model="page"
          :page-count="pageCount"
          :total="filteredItems.length"
        />
      </div>
    </UCard>

    <!-- Notification Detail Modal -->
    <UModal v-model="showDetailModal" :ui="{ width: 'max-w-4xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold">{{ selectedNotification?.subject }}</h3>
              <div class="flex items-center gap-2 mt-1">
                <UBadge :color="getTypeColor(selectedNotification?.type)" variant="subtle" size="xs">
                  {{ selectedNotification?.type }}
                </UBadge>
                <UBadge :color="selectedNotification?.status === 'SENT' ? 'green' : 'red'" size="xs">
                  {{ selectedNotification?.status }}
                </UBadge>
              </div>
            </div>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="showDetailModal = false" />
          </div>
        </template>

        <div v-if="selectedNotification" class="space-y-6">
          <!-- Metadata -->
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div class="text-gray-500">Sent At</div>
              <div class="font-medium">{{ formatDate(selectedNotification.timestamp) }}</div>
            </div>
            <div>
              <div class="text-gray-500">Recipients</div>
              <div class="font-medium">{{ selectedNotification.recipients.join(', ') }}</div>
            </div>
            <div>
              <div class="text-gray-500">Environment</div>
              <div class="font-medium">{{ selectedNotification.environment }}</div>
            </div>
            <div>
              <div class="text-gray-500">Trigger</div>
              <div class="font-medium">{{ selectedNotification.trigger }}</div>
            </div>
            <div v-if="selectedNotification.delivery_info?.messageId">
              <div class="text-gray-500">SES Message ID</div>
              <div class="font-mono text-xs">{{ selectedNotification.delivery_info.messageId }}</div>
            </div>
            <div v-if="selectedNotification.error">
              <div class="text-red-500">Error</div>
              <div class="text-red-600 text-sm">{{ selectedNotification.error }}</div>
            </div>
          </div>

          <!-- Email Preview -->
          <div>
            <div class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Email Preview</div>
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800 max-h-96 overflow-auto">
              <div v-html="selectedNotification.full_content" class="prose dark:prose-invert max-w-none"></div>
            </div>
          </div>

          <!-- Raw Metadata -->
          <details class="text-xs">
            <summary class="cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
              View Raw Metadata
            </summary>
            <pre class="mt-2 p-3 bg-gray-100 dark:bg-gray-900 rounded overflow-auto">{{ JSON.stringify(selectedNotification.metadata, null, 2) }}</pre>
          </details>
        </div>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from '#imports'

type NotificationType = 'All' | 'FEEDBACK' | 'ERROR' | 'SECURITY_ALERT' | 'SYSTEM_ALERT' | 'PERFORMANCE_ALERT' | 'DEPLOYMENT'
type NotificationStatus = 'All' | 'SENT' | 'FAILED'

interface Notification {
  id: string
  timestamp: string
  type: string
  subject: string
  recipients: string[]
  status: string
  trigger: string
  environment: string
  content_preview: string
  full_content?: string
  metadata?: any
  delivery_info?: {
    messageId?: string
    sentAt?: string
  }
  error?: string
}

const toast = useToast()
const loading = ref(false)
const notifications = ref<Notification[]>([])

const notificationTypeOptions = [
  { label: 'All', value: 'All' },
  { label: 'Feedback', value: 'FEEDBACK' },
  { label: 'Error', value: 'ERROR' },
  { label: 'Security Alert', value: 'SECURITY_ALERT' },
  { label: 'System Alert', value: 'SYSTEM_ALERT' },
  { label: 'Performance Alert', value: 'PERFORMANCE_ALERT' },
  { label: 'Deployment', value: 'DEPLOYMENT' }
]

const statusOptions = [
  { label: 'All', value: 'All' },
  { label: 'Sent', value: 'SENT' },
  { label: 'Failed', value: 'FAILED' }
]

const selectedType = ref<NotificationType>('All')
const selectedStatus = ref<NotificationStatus>('All')
const search = ref('')
const page = ref(1)
const pageCount = 10

const showDetailModal = ref(false)
const selectedNotification = ref<Notification | null>(null)

const columns = [
  { key: 'type', label: 'Type', sortable: true },
  { key: 'subject', label: 'Subject', sortable: true },
  { key: 'timestamp', label: 'Sent At', sortable: true },
  { key: 'recipients', label: 'Recipients' },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: '' }
]

// Get color for notification type badge
function getTypeColor(type: string): string {
  switch (type) {
    case 'FEEDBACK':
      return 'blue'
    case 'ERROR':
      return 'red'
    case 'SECURITY_ALERT':
      return 'orange'
    case 'SYSTEM_ALERT':
      return 'yellow'
    case 'PERFORMANCE_ALERT':
      return 'purple'
    case 'DEPLOYMENT':
      return 'green'
    default:
      return 'gray'
  }
}

// Format date
function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

// View notification details
async function viewNotification(notification: Notification) {
  try {
    // Fetch full notification details if not already loaded
    if (!notification.full_content) {
      loading.value = true
      const res = await fetch(`/api/admin/notifications/${notification.id}`)
      const data = await res.json()

      if (data.success && data.data) {
        notification.full_content = data.data.full_content
        notification.metadata = data.data.metadata
      }
    }

    selectedNotification.value = notification
    showDetailModal.value = true
  } catch (err) {
    console.error('Failed to load notification details:', err)
    toast.add({
      title: 'Error',
      description: 'Failed to load notification details.',
      color: 'red'
    })
  } finally {
    loading.value = false
  }
}

// Filters
const filteredItems = computed(() =>
  notifications.value.filter((item) => {
    const matchesType = selectedType.value === 'All' || item.type === selectedType.value
    const matchesStatus = selectedStatus.value === 'All' || item.status === selectedStatus.value
    const matchesSearch = search.value
      ? item.subject?.toLowerCase().includes(search.value.toLowerCase()) ||
        item.content_preview?.toLowerCase().includes(search.value.toLowerCase())
      : true

    return matchesType && matchesStatus && matchesSearch
  })
)

// Pagination
const paginatedItems = computed(() => {
  const start = (page.value - 1) * pageCount
  return filteredItems.value.slice(start, start + pageCount)
})

// Fetch notifications
async function fetchNotifications() {
  try {
    loading.value = true
    const res = await fetch('/api/admin/notifications/list?limit=100')
    const data = await res.json()

    if (data.success && data.data?.notifications) {
      notifications.value = data.data.notifications
    } else {
      throw new Error(data.error || 'Failed to fetch notifications')
    }
  } catch (err: any) {
    console.error('Failed to fetch notifications:', err)
    toast.add({
      title: 'Error',
      description: err.message || 'Failed to load notifications.',
      color: 'red'
    })
  } finally {
    loading.value = false
  }
}

// Load notifications on mount
onMounted(() => {
  fetchNotifications()
})
</script>
