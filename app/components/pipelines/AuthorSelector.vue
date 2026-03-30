<template>
  <ClientOnly>
    <USelectMenu
      v-model="selectedAuthorEmail"
      :options="authorOptions"
      placeholder="Filter by author..."
      searchable
      searchable-placeholder="Search authors..."
      value-attribute="value"
      :search-attributes="['label', 'email']"
      :loading="loading"
      class="w-64"
    >
      <template #label>
        <span v-if="selectedAuthorEmail">
          {{ getSelectedAuthorLabel() }}
        </span>
        <span v-else class="text-gray-500">All Authors</span>
      </template>

      <template #option="{ option }">
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-2">
            <div
              class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold text-white"
              :style="{ backgroundColor: getAuthorColor(option.email) }"
            >
              {{ getInitials(option.label) }}
            </div>
            <div class="flex flex-col">
              <span class="text-sm font-medium">{{ option.label }}</span>
              <span class="text-xs text-gray-500">{{ option.email }}</span>
            </div>
          </div>
          <UBadge size="xs" color="gray" variant="subtle">
            {{ option.count }}
          </UBadge>
        </div>
      </template>
    </USelectMenu>
    <template #fallback>
      <div class="w-64 h-10 bg-slate-800 rounded-md animate-pulse"></div>
    </template>
  </ClientOnly>
</template>

<script setup lang="ts">
import type { PipelineAuthorMetrics } from '#shared/types/pipelines'

const props = withDefaults(defineProps<{
  modelValue: string | null
  days?: number
  environment?: 'commercial' | 'govcloud'
}>(), {
  days: 30,
  environment: 'govcloud'
})

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

// Selected author email (two-way binding)
const selectedAuthorEmail = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// Fetch authors list
const { data: authorsData, pending: loading } = await useFetch('/api/pipelines/authors/list', {
  query: {
    days: props.days,
    environment: props.environment
  }
})

// Transform authors into select options
const authorOptions = computed(() => {
  // Handle the sendSuccess wrapped response
  const authors = authorsData.value?.data?.authors || authorsData.value?.authors || []
  if (!authors || authors.length === 0) return []

  // Add "All Authors" option at the top
  const allOption = {
    label: 'All Authors',
    value: null,
    email: '',
    count: authors.reduce((sum: number, a: PipelineAuthorMetrics) => sum + a.total_runs, 0)
  }

  const authorOpts = authors.map((author: PipelineAuthorMetrics) => ({
    label: author.author_name,
    value: author.author_email,
    email: author.author_email,
    count: author.total_runs
  }))

  return [allOption, ...authorOpts]
})

// Helper: Get selected author label
function getSelectedAuthorLabel(): string {
  const option = authorOptions.value.find(opt => opt.value === selectedAuthorEmail.value)
  return option?.label || 'Unknown Author'
}

// Helper: Get initials from name
function getInitials(name: string): string {
  if (!name) return '?'

  const parts = name.split(/\s+/)

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  return name.substring(0, 2).toUpperCase()
}

// Helper: Generate consistent color from email
function getAuthorColor(email: string): string {
  if (!email) return '#6B7280' // gray for "All Authors"

  const colors = [
    '#3B82F6', // blue
    '#10B981', // green
    '#F59E0B', // amber
    '#EF4444', // red
    '#8B5CF6', // purple
    '#EC4899', // pink
    '#14B8A6', // teal
    '#F97316'  // orange
  ]

  let hash = 0
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash)
  }

  return colors[Math.abs(hash) % colors.length]
}
</script>
