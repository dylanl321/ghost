<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden transition-all hover:shadow-lg"
    :class="isCurrent ? 'ring-2 ring-emerald-500/50' : ''"
  >
    <!-- Version Header -->
    <div class="px-5 py-4 bg-gradient-to-r from-slate-50 to-transparent dark:from-slate-900 dark:to-transparent border-b border-gray-100 dark:border-slate-700">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span
            class="text-xl font-bold"
            :class="isCurrent ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'"
          >
            v{{ entry.version }}
          </span>
          <UBadge
            v-if="isCurrent"
            color="emerald"
            variant="solid"
            size="xs"
          >
            Latest
          </UBadge>
        </div>
        <time
          v-if="entry.date"
          :datetime="entry.date"
          class="text-sm text-gray-500 dark:text-gray-400"
        >
          {{ formatDate(entry.date) }}
        </time>
      </div>
    </div>

    <!-- Feature Highlights -->
    <div v-if="entry.highlights?.length" class="px-5 py-4">
      <div class="flex flex-wrap gap-2">
        <span
          v-for="highlight in entry.highlights"
          :key="highlight"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-slate-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300"
        >
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="getHighlightColor(highlight)"
          />
          {{ highlight }}
        </span>
      </div>
    </div>

    <!-- Expandable Details -->
    <details class="group border-t border-gray-100 dark:border-slate-700">
      <summary class="flex items-center gap-2 px-5 py-3 cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
        <UIcon
          name="i-heroicons-chevron-right"
          class="h-4 w-4 transition-transform group-open:rotate-90"
        />
        <span class="text-sm">View all changes</span>
      </summary>
      <div class="px-5 py-4 changelog-content bg-gray-50/50 dark:bg-slate-900/50">
        <MarkdownContent :content="entry.content" />
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
interface ChangelogEntry {
  version: string
  date: string
  highlights: string[]
  content: string
}

defineProps<{
  entry: ChangelogEntry
  isCurrent: boolean
  index: number
  side?: 'left' | 'right'
}>()

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function getHighlightColor(highlight: string): string {
  const lower = highlight.toLowerCase()
  if (lower.includes('chat') || lower.includes('ai')) return 'bg-purple-500'
  if (lower.includes('cost') || lower.includes('budget') || lower.includes('forecast')) return 'bg-green-500'
  if (lower.includes('search') || lower.includes('command')) return 'bg-blue-500'
  if (lower.includes('admin') || lower.includes('user') || lower.includes('management')) return 'bg-orange-500'
  if (lower.includes('export') || lower.includes('report')) return 'bg-cyan-500'
  if (lower.includes('alert') || lower.includes('notification')) return 'bg-red-500'
  if (lower.includes('support') || lower.includes('tool') || lower.includes('log')) return 'bg-yellow-500'
  if (lower.includes('account') || lower.includes('explorer') || lower.includes('enclave')) return 'bg-indigo-500'
  if (lower.includes('version') || lower.includes('changelog')) return 'bg-emerald-500'
  return 'bg-gray-500'
}
</script>

<style scoped>
.changelog-content :deep(h3) {
  @apply text-sm font-semibold text-gray-700 dark:text-gray-300 mt-3 mb-1.5 first:mt-0;
}

.changelog-content :deep(ul) {
  @apply space-y-0.5 mb-2;
}

.changelog-content :deep(li) {
  @apply text-sm text-gray-600 dark:text-gray-400 pl-0;
}
</style>
