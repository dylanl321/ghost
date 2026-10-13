<template>
  <div class="space-y-6">
    <!-- Header -->
    <UCard>
      <h1 class="text-2xl font-semibold">User Feedback</h1>
      <p class="text-sm text-gray-500">View all submitted feedback, issues, and feature requests.</p>
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
            :options="feedbackTypeOptions"
            placeholder="Select type"
          />
        </UFormGroup>

        <UFormGroup label="Search" class="min-w-[250px]">
          <UInput v-model="search" placeholder="Search descriptions..." />
        </UFormGroup>

        <UCheckbox
          v-model="filterUnresolved"
          label="Show unresolved only"
        />
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
          <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-path" :loading="loading" title="Refresh data" @click="refreshFeedback">Refresh</UButton>
        </div>
      </template>

      <UTable
        :rows="paginatedItems"
        :columns="columns"
        :loading="loading"
        class="min-w-full"
      >
        <template #description-data="{ row }">
          <p class="whitespace-pre-wrap">{{ row.description }}</p>
        </template>

        <template #source-data="{ row }">
          <UBadge :color="row.source === 'mcp-connections' ? 'amber' : 'gray'" variant="soft" size="xs">
            {{ feedbackSourceLabel(row.source) }}
          </UBadge>
        </template>

        <template #resolved-data="{ row }">
          <UBadge :color="row.resolved ? 'green' : 'gray'">
            {{ row.resolved ? 'Yes' : 'No' }}
          </UBadge>
        </template>

        <!-- Actions column -->
        <template #actions-data="{ row }">
          <UDropdown :items="getActionItems(row)">
            <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-vertical" />
          </UDropdown>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useToast } from '#imports'

const logger = createLogger('IssuesPanel')

type FeedbackType = 'All' | 'Issue' | 'Feature Request' | 'General Feedback'

const toast = useToast()
const loading = ref(false)
const feedbackItems = ref<any[]>([])

const feedbackTypeOptions: { label: string; value: FeedbackType }[] = [
  { label: 'All', value: 'All' },
  { label: 'Issue', value: 'Issue' },
  { label: 'Feature Request', value: 'Feature Request' },
  { label: 'General Feedback', value: 'General Feedback' },
]

const selectedType = ref('All')
const filterUnresolved = ref(false)
const search = ref('')
const page = ref(1)
const pageCount = 10

const columns = [
  { key: 'type', label: 'Type', sortable: true },
  { key: 'source', label: 'Source', sortable: true },
  { key: 'reporter_email', label: 'Reporter', sortable: true },
  { key: 'date_utc', label: 'Date', sortable: true },
  { key: 'description', label: 'Description' },
  { key: 'resolved', label: 'Resolved', sortable: true },
  { key: 'actions', label: '' }
]

function feedbackSourceLabel(source?: string) {
  return source === 'mcp-connections' ? 'MCP Connections' : 'General'
}

// --- Actions ---
const getActionItems = (row: any) => [
  [
    row.resolved
      ? { label: 'Reopen Issue', icon: 'i-heroicons-arrow-path', click: () => toggleResolved(row, false) }
      : { label: 'Mark as Resolved', icon: 'i-heroicons-check-circle', click: () => toggleResolved(row, true) }
  ]
]

async function toggleResolved(row: any, resolved: boolean) {
  try {
    const res = await fetch('/api/feedback/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, resolved })
    })

    if (!res.ok) throw new Error('Request failed')
    row.resolved = resolved

    toast.add({
      title: resolved ? 'Feedback resolved' : 'Issue reopened',
      description: `Feedback marked as ${resolved ? 'resolved' : 'open'}.`,
      color: resolved ? 'green' : 'blue'
    })
  } catch (err) {
    logger.error('Failed to update issue:', err)
    toast.add({ title: 'Error', description: 'Failed to update issue.', color: 'red' })
  }
}

// --- Filters ---
const filteredItems = computed(() =>
  feedbackItems.value.filter((item) => {
    const matchesType = selectedType.value === 'All' || item.type === selectedType.value
    const matchesSearch = search.value
      ? item.description?.toLowerCase().includes(search.value.toLowerCase())
      : true
    const matchesResolved = filterUnresolved.value ? !item.resolved : true
    return matchesType && matchesSearch && matchesResolved
  })
)

const paginatedItems = computed(() => {
  const start = (page.value - 1) * pageCount
  return filteredItems.value.slice(start, start + pageCount)
})

// Automatically reset pagination when filters change
watch([selectedType, search, filterUnresolved], () => {
  page.value = 1
})

// --- Fetch Data ---
async function loadFeedback() {
  loading.value = true
  try {
    const res = await fetch('/api/feedback/list')
    if (!res.ok) throw new Error('Request failed')
    const data = await res.json()
    feedbackItems.value = (data.data?.items ?? []).map((item: any) => ({
      ...item,
      resolved: item.resolved ?? false
    }))
  } catch (err) {
    logger.error('Failed to load feedback:', err)
    toast.add({ title: 'Error', description: 'Failed to load feedback.', color: 'red' })
  } finally {
    loading.value = false
  }
}

async function refreshFeedback() {
  await loadFeedback()
}

onMounted(loadFeedback)
</script>
