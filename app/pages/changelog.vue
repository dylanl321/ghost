<template>
  <div class="max-w-6xl mx-auto px-4 py-8">
    <!-- Page Header -->
    <div class="mb-12 text-center">
      <div class="flex items-center justify-center gap-3 mb-3">
        <UIcon name="i-fa6-solid-ghost" class="h-10 w-10 text-emerald-400" />
        <h1 class="text-4xl font-bold text-gray-900 dark:text-white">What's New in GHOST</h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400 text-lg">
        Track the latest features, improvements, and fixes
      </p>
      <div class="mt-4 inline-flex items-center gap-3 px-4 py-2 bg-emerald-500/10 rounded-full">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span class="text-emerald-600 dark:text-emerald-400 font-medium">
          Current Version: {{ currentVersion }}
        </span>
        <span class="text-gray-500 dark:text-gray-400 text-sm">
          Built {{ buildDate }}
        </span>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="pending" class="space-y-8">
      <div v-for="i in 3" :key="i" class="flex justify-center">
        <USkeleton class="h-32 w-96 rounded-xl" />
      </div>
    </div>

    <!-- Error State -->
    <UAlert
      v-else-if="error"
      icon="i-heroicons-exclamation-triangle"
      color="red"
      title="Error loading changelog"
      :description="error.message"
      class="max-w-lg mx-auto"
    />

    <!-- Empty State -->
    <div
      v-else-if="!entries?.length"
      class="text-center py-16 bg-white dark:bg-slate-800 rounded-xl max-w-lg mx-auto"
    >
      <UIcon name="i-heroicons-document-text" class="h-12 w-12 text-gray-400 mx-auto mb-4" />
      <p class="text-gray-500 dark:text-gray-400">No changelog entries yet</p>
    </div>

    <!-- Alternating Timeline -->
    <div v-else class="relative">
      <!-- Center Timeline Line -->
      <div class="absolute left-1/2 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-500 via-blue-500 to-purple-500 transform -translate-x-1/2 rounded-full hidden lg:block" />

      <div class="space-y-6 lg:space-y-0">
        <article
          v-for="(entry, index) in entries"
          :key="entry.version"
          class="relative lg:min-h-[180px]"
        >
          <!-- Mobile Layout -->
          <div class="lg:hidden mb-6">
            <ChangelogCard
              :entry="entry"
              :is-current="entry.version === currentVersion"
              :index="index"
            />
          </div>

          <!-- Desktop: Two-sided Layout -->
          <div class="hidden lg:grid lg:grid-cols-2 lg:gap-16 items-start">
            <!-- LEFT COLUMN: Features (even) or Details (odd) -->
            <div class="flex justify-end">
              <!-- Version & Features Card (even indices = left side) -->
              <div
                v-if="index % 2 === 0"
                class="w-full max-w-md text-right"
              >
                <div
                  class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 transition-all hover:shadow-lg"
                  :class="entry.version === currentVersion ? 'ring-2 ring-emerald-500/50' : ''"
                >
                  <!-- Version & Date -->
                  <div class="flex items-center justify-end gap-3 mb-3">
                    <time
                      v-if="entry.date"
                      class="text-sm text-gray-500 dark:text-gray-400"
                    >
                      {{ formatDate(entry.date) }}
                    </time>
                    <UBadge
                      v-if="entry.version === currentVersion"
                      color="emerald"
                      variant="solid"
                      size="xs"
                    >
                      Latest
                    </UBadge>
                    <span class="text-2xl font-bold text-gray-900 dark:text-white">
                      v{{ entry.version }}
                    </span>
                  </div>

                  <!-- Highlights -->
                  <div v-if="entry.highlights?.length" class="flex flex-wrap justify-end gap-2">
                    <span
                      v-for="highlight in entry.highlights"
                      :key="highlight"
                      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-slate-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300"
                    >
                      <span
                        class="w-2 h-2 rounded-full"
                        :class="getHighlightColor(highlight)"
                      />
                      {{ highlight }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Details Card (odd indices = left side) -->
              <div
                v-else
                class="w-full max-w-md"
              >
                <div class="bg-slate-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
                  <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
                    All Changes
                  </p>
                  <div class="changelog-content text-left">
                    <MarkdownContent :content="entry.content" />
                  </div>
                </div>
              </div>
            </div>

            <!-- CENTER: Timeline Node -->
            <div class="absolute left-1/2 top-5 transform -translate-x-1/2 z-10">
              <div
                class="w-5 h-5 rounded-full border-4 border-white dark:border-slate-900 shadow-lg"
                :class="index === 0 ? 'bg-emerald-500 ring-4 ring-emerald-500/30' : 'bg-slate-400 dark:bg-slate-500'"
              />
            </div>

            <!-- RIGHT COLUMN: Details (even) or Features (odd) -->
            <div class="flex justify-start">
              <!-- Details Card (even indices = right side) -->
              <div
                v-if="index % 2 === 0"
                class="w-full max-w-md"
              >
                <div class="bg-slate-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
                  <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
                    All Changes
                  </p>
                  <div class="changelog-content">
                    <MarkdownContent :content="entry.content" />
                  </div>
                </div>
              </div>

              <!-- Version & Features Card (odd indices = right side) -->
              <div
                v-else
                class="w-full max-w-md"
              >
                <div
                  class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 transition-all hover:shadow-lg"
                  :class="entry.version === currentVersion ? 'ring-2 ring-emerald-500/50' : ''"
                >
                  <!-- Version & Date -->
                  <div class="flex items-center gap-3 mb-3">
                    <span class="text-2xl font-bold text-gray-900 dark:text-white">
                      v{{ entry.version }}
                    </span>
                    <UBadge
                      v-if="entry.version === currentVersion"
                      color="emerald"
                      variant="solid"
                      size="xs"
                    >
                      Latest
                    </UBadge>
                    <time
                      v-if="entry.date"
                      class="text-sm text-gray-500 dark:text-gray-400"
                    >
                      {{ formatDate(entry.date) }}
                    </time>
                  </div>

                  <!-- Highlights -->
                  <div v-if="entry.highlights?.length" class="flex flex-wrap gap-2">
                    <span
                      v-for="highlight in entry.highlights"
                      :key="highlight"
                      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-slate-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300"
                    >
                      <span
                        class="w-2 h-2 rounded-full"
                        :class="getHighlightColor(highlight)"
                      />
                      {{ highlight }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>

    <!-- Back to Dashboard -->
    <div class="mt-16 pt-8 border-t border-gray-200 dark:border-slate-700 text-center">
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-primary transition-colors bg-gray-100 dark:bg-slate-800 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700"
      >
        <UIcon name="i-heroicons-arrow-left" class="h-4 w-4" />
        Back to Dashboard
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

interface ChangelogEntry {
  version: string
  date: string
  highlights: string[]
  content: string
}

const config = useRuntimeConfig()
const currentVersion = config.public.appVersion
const buildDate = config.public.buildDate

const { data: entries, pending, error } = await useFetch<ChangelogEntry[]>('/api/changelog')

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

.changelog-content :deep(p) {
  @apply text-sm text-gray-600 dark:text-gray-400 mb-2;
}
</style>
