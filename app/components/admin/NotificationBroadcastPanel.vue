<template>
  <div class="space-y-6">
    <!-- Send Broadcast Form -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <Icon name="i-heroicons-megaphone" class="w-5 h-5 text-blue-500" />
          <h3 class="text-lg font-semibold">Send Broadcast</h3>
        </div>
      </template>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
          <UInput v-model="form.title" placeholder="Notification title..." />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Body</label>
          <UTextarea v-model="form.body" placeholder="Notification message..." :rows="3" />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
            <USelectMenu v-model="form.category" :options="categoryOptions" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Severity</label>
            <USelectMenu v-model="form.severity" :options="severityOptions" />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Audience</label>
          <div class="flex gap-4">
            <URadio v-model="form.targetAudience" value="all" label="All Users" />
            <URadio v-model="form.targetAudience" value="list" label="Specific Users" />
          </div>
        </div>

        <div v-if="form.targetAudience === 'list'">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User emails (one per line)</label>
          <UTextarea v-model="targetUsersText" placeholder="user1@example.com&#10;user2@example.com" :rows="3" />
        </div>

        <!-- Preview -->
        <UCard v-if="form.title || form.body" class="bg-gray-50 dark:bg-gray-800/50">
          <div class="flex items-start gap-3">
            <Icon name="i-heroicons-megaphone" class="w-5 h-5 text-gray-500 mt-0.5" />
            <div>
              <p class="font-medium text-gray-900 dark:text-white">{{ form.title || 'Untitled' }}</p>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">{{ form.body || 'No body' }}</p>
              <div class="flex gap-2 mt-2">
                <UBadge color="gray" variant="subtle" size="xs">{{ form.category }}</UBadge>
                <UBadge :color="form.severity === 'critical' ? 'red' : form.severity === 'warning' ? 'yellow' : 'blue'" variant="subtle" size="xs">{{ form.severity }}</UBadge>
              </div>
            </div>
          </div>
        </UCard>

        <div class="flex justify-end">
          <UButton
            icon="i-heroicons-paper-airplane"
            @click="showConfirm = true"
            :disabled="!form.title || !form.body"
            color="primary"
          >
            Send Broadcast
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Confirmation Modal -->
    <UModal v-model="showConfirm">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Confirm Broadcast</h3>
        </template>
        <p class="text-gray-600 dark:text-gray-400">
          Send "{{ form.title }}" to
          <strong>{{ form.targetAudience === 'all' ? 'all users' : `${targetUserIds.length} user(s)` }}</strong>?
        </p>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="showConfirm = false">Cancel</UButton>
            <UButton color="primary" @click="sendBroadcast" :loading="sending">Send</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Broadcast History -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <Icon name="i-heroicons-clock" class="w-5 h-5 text-gray-500" />
          <h3 class="text-lg font-semibold">Broadcast History</h3>
        </div>
      </template>

      <UTable :rows="broadcasts" :columns="historyColumns" :loading="loadingHistory" :empty-state="{ icon: 'i-heroicons-megaphone', label: 'No broadcasts sent yet' }">
        <template #targetAudience-data="{ row }">
          <UBadge color="gray" variant="subtle" size="xs">{{ row.targetAudience }}</UBadge>
        </template>
        <template #delivered-data="{ row }">
          <span class="text-sm">{{ row.deliveredCount }}/{{ row.totalCount }}</span>
        </template>
        <template #status-data="{ row }">
          <UBadge :color="row.status === 'complete' ? 'green' : row.status === 'in-progress' ? 'yellow' : 'gray'" variant="subtle" size="xs">
            {{ row.status }}
          </UBadge>
        </template>
        <template #createdAt-data="{ row }">
          <span class="text-xs text-gray-500">{{ formatDate(row.createdAt) }}</span>
        </template>
      </UTable>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const toast = useToast()
const showConfirm = ref(false)
const sending = ref(false)
const loadingHistory = ref(false)
const broadcasts = ref<any[]>([])
const targetUsersText = ref('')

const form = reactive({
  title: '',
  body: '',
  category: 'SYSTEM',
  severity: 'info',
  targetAudience: 'all' as 'all' | 'list'
})

const categoryOptions = [
  { label: 'System', value: 'SYSTEM' },
  { label: 'Security', value: 'SECURITY_CRITICAL' },
  { label: 'Budget Alert', value: 'BUDGET_THRESHOLD' },
  { label: 'Compliance', value: 'COMPLIANCE' }
]

const severityOptions = [
  { label: 'Info', value: 'info' },
  { label: 'Warning', value: 'warning' },
  { label: 'Critical', value: 'critical' }
]

const historyColumns = [
  { key: 'title', label: 'Title' },
  { key: 'targetAudience', label: 'Target' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'status', label: 'Status' },
  { key: 'createdBy', label: 'Sent By' },
  { key: 'createdAt', label: 'Created' }
]

const targetUserIds = computed(() => {
  return targetUsersText.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
}

async function sendBroadcast() {
  sending.value = true
  showConfirm.value = false

  try {
    const payload: any = {
      title: form.title,
      body: form.body,
      category: form.category,
      severity: form.severity,
      targetAudience: form.targetAudience
    }

    if (form.targetAudience === 'list') {
      payload.targetUserIds = targetUserIds.value
    }

    const result = await $fetch('/api/admin/user-notifications/broadcast', {
      method: 'POST',
      body: payload
    }) as any

    if (result?.success) {
      toast.add({ title: 'Broadcast sent', description: `Delivered to ${result.data.deliveredCount} user(s)`, color: 'green' })
      form.title = ''
      form.body = ''
      loadBroadcasts()
    }
  } catch (err: any) {
    toast.add({ title: 'Failed to send broadcast', description: err.message, color: 'red' })
  } finally {
    sending.value = false
  }
}

async function loadBroadcasts() {
  loadingHistory.value = true
  try {
    const { data } = await useFetch('/api/admin/user-notifications/broadcasts')
    const result = data.value as any
    if (result?.success) {
      broadcasts.value = result.data.broadcasts
    }
  } catch {
    // Non-critical
  } finally {
    loadingHistory.value = false
  }
}

onMounted(() => {
  loadBroadcasts()
})
</script>
