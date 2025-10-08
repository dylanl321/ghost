<template>
  <div class="space-y-6">
    <!-- Header -->
    <UCard>
      <h1 class="text-2xl font-semibold">User Feedback</h1>
      <p class="text-gray-500 text-sm">View all submitted issues, feature requests, and general feedback.</p>
    </UCard>

    <!-- Filters -->
    <UCard>
      <div class="flex flex-wrap items-end gap-4">
        <div class="flex-1 min-w-[200px]">
          <label class="block mb-1 text-sm font-medium">Type</label>
          <USelect
            v-model="filters.type"
            :options="['All', 'Issue', 'Feature Request', 'General Feedback']"
          />
        </div>

        <div class="flex-1 min-w-[200px]">
          <label class="block mb-1 text-sm font-medium">Search</label>
          <UInput
            v-model="filters.search"
            placeholder="Search descriptions or emails..."
            clearable
          />
        </div>

        <UButton color="primary" class="mt-1" @click="applyFilters">
          Apply Filters
        </UButton>
      </div>
    </UCard>

    <!-- Table -->
    <UCard>
      <UTable
        :rows="paginatedRows"
        :columns="columns"
        :loading="isLoading"
        :ui="{ td: { base: 'align-top whitespace-normal break-words' } }"
      >
        <template #description-data="{ row }">
          <div class="max-w-4xl whitespace-pre-wrap">
            {{ row.description }}
          </div>
        </template>
      </UTable>

      <div class="flex justify-end mt-4">
        <UPagination
          v-model="page"
          :page-count="pageCount"
          :total="filteredFeedback.length"
          :ui="{ wrapper: 'justify-end' }"
        />
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Feedback {
  id: string
  type: 'Issue' | 'Feature Request' | 'General Feedback'
  description: string
  reporter_email: string
  date_utc: string
  time_utc: string
  environment: string
  resolved: boolean
}

// Dummy data for now — will be replaced with API later
const feedback = ref<Feedback[]>([
  {
    id: '1',
    type: 'Issue',
    description: 'The home page throws an error when clicking on Reports.',
    reporter_email: 'test@example.com',
    date_utc: '2025-10-08',
    time_utc: '17:45',
    environment: 'prod',
    resolved: false,
  },
  {
    id: '2',
    type: 'Feature Request',
    description: 'Add dark mode support to the dashboard.',
    reporter_email: 'Anonymous',
    date_utc: '2025-10-07',
    time_utc: '10:15',
    environment: 'dev',
    resolved: false,
  },
])

const isLoading = ref(false)

// Filters
const filters = ref({
  type: 'All',
  search: '',
})

function applyFilters() {
  page.value = 1
}

// Table columns
const columns = [
  { key: 'type', label: 'Type', sortable: true },
  { key: 'description', label: 'Description' },
  { key: 'reporter_email', label: 'Reporter' },
  { key: 'date_utc', label: 'Date' },
  { key: 'environment', label: 'Env' },
  { key: 'resolved', label: 'Resolved' },
]

// Filtering logic
const filteredFeedback = computed(() => {
  return feedback.value.filter((item) => {
    const matchesType = filters.value.type === 'All' || item.type === filters.value.type
    const search = filters.value.search.toLowerCase()
    const matchesSearch =
      !search ||
      item.description.toLowerCase().includes(search) ||
      item.reporter_email.toLowerCase().includes(search)
    return matchesType && matchesSearch
  })
})

// Pagination
const page = ref(1)
const pageSize = 10
const pageCount = computed(() => Math.ceil(filteredFeedback.value.length / pageSize))

const paginatedRows = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredFeedback.value.slice(start, start + pageSize)
})
</script>
