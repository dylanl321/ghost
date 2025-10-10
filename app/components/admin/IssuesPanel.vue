<template>
  <div class="space-y-6">
    <!-- Header -->
    <UCard>
      <h1 class="text-2xl font-semibold">User Feedback</h1>
      <p class="text-sm text-gray-500">View all submitted feedback, issues, and feature requests.</p>
    </UCard>

    <!-- Filters -->
    <UCard>
      <div class="flex flex-wrap gap-4 items-end">
        <USelect
          v-model="filterType"
          :options="feedbackTypeOptions"
          label="Type"
        />
        <UInput v-model="search" placeholder="Search descriptions..." class="w-64" />
        <UButton color="gray" variant="soft" @click="applyFilters">Apply</UButton>
      </div>
    </UCard>

    <!-- Table -->
    <UCard>
      <UBadge>{{ paginatedItems.length }} Results</UBadge>

      <UTable
        :rows="paginatedItems"
        :columns="columns"
        :loading="loading"
        class="min-w-full"
      >
        <template #description-data="{ row }">
          <p class="whitespace-pre-wrap">{{ row.description }}</p>
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
import { ref, computed, onMounted } from 'vue'
import { useToast } from '#imports'

type FeedbackType = '' | 'Issue' | 'Feature Request' | 'General Feedback'

const toast = useToast()
const loading = ref(false)
const feedbackItems = ref<any[]>([])
const feedbackTypeOptions: { label: string; value: FeedbackType }[] = [
  { label: 'All', value: '' },
  { label: 'Issue', value: 'Issue' },
  { label: 'Feature Request', value: 'Feature Request' },
  { label: 'General Feedback', value: 'General Feedback' },
]

const filterType = ref<FeedbackType>('')
const search = ref('')
const page = ref(1)
const pageCount = 10

const columns = [
  { key: 'type', label: 'Type', sortable: true },
  { key: 'reporter_email', label: 'Reporter', sortable: true },
  { key: 'date_utc', label: 'Date', sortable: true },
  { key: 'description', label: 'Description' }
]

// Derived data
const filteredItems = computed(() => {
  return feedbackItems.value.filter((item) => {
    const matchesType = filterType.value ? item.type === filterType.value : true
    const matchesSearch = search.value
      ? item.description?.toLowerCase().includes(search.value.toLowerCase())
      : true
    return matchesType && matchesSearch
  })
})

const paginatedItems = computed(() => {
  const start = (page.value - 1) * pageCount
  return filteredItems.value.slice(start, start + pageCount)
})

function applyFilters() {
  page.value = 1
}

// Fetch feedback list
async function loadFeedback() {
  loading.value = true
  try {
    const res = await fetch('/api/feedback/list')
    if (!res.ok) throw new Error('Request failed')
    const data = await res.json()
    feedbackItems.value = data.data?.items ?? []
  } catch (err) {
    console.error('Failed to load feedback:', err)
    toast.add({ title: 'Error', description: 'Failed to load feedback.', color: 'red' })
  } finally {
    loading.value = false
  }
}

onMounted(loadFeedback)
</script>
