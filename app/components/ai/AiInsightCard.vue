<template>
  <div
    v-if="!dismissed"
    class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 overflow-hidden"
  >
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <UIcon :name="icon" class="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
        <h3 class="text-sm font-semibold text-gray-900 dark:text-white">{{ title }}</h3>
        <UBadge color="indigo" variant="subtle" size="xs">AI</UBadge>
      </div>
      <div class="flex items-center gap-1">
        <UTooltip text="Regenerate insight">
          <UButton
            icon="i-heroicons-arrow-path"
            size="2xs"
            variant="ghost"
            color="gray"
            :loading="loading"
            @click="fetchInsight(true)"
          />
        </UTooltip>
        <UTooltip v-if="collapsible" :text="collapsed ? 'Expand' : 'Collapse'">
          <UButton
            :icon="collapsed ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-up'"
            size="2xs"
            variant="ghost"
            color="gray"
            @click="toggleCollapsed"
          />
        </UTooltip>
        <UTooltip v-if="dismissible" text="Dismiss">
          <UButton
            icon="i-heroicons-x-mark"
            size="2xs"
            variant="ghost"
            color="gray"
            @click="dismiss"
          />
        </UTooltip>
      </div>
    </div>

    <!-- Content -->
    <div v-show="!collapsed">
      <!-- Loading skeleton -->
      <div v-if="loading && !insight" class="space-y-2">
        <div class="animate-pulse h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
        <div class="animate-pulse h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
        <div class="animate-pulse h-3 bg-gray-200 dark:bg-gray-700 rounded w-4/6" />
      </div>

      <!-- Insight text (rendered as markdown) -->
      <div v-else-if="insight" class="ai-insight-content text-sm text-gray-700 dark:text-gray-300 leading-relaxed" v-html="renderedInsight" />

      <!-- Error (soft) -->
      <p v-else-if="error" class="text-xs text-gray-400 dark:text-gray-500 italic">
        Unable to generate insight. <button class="underline hover:text-gray-600 dark:hover:text-gray-400" @click="fetchInsight(true)">Try again</button>
      </p>

      <!-- Timestamp -->
      <p v-if="insight && generatedAt" class="text-[10px] text-gray-400 dark:text-gray-600 mt-2">
        {{ cached ? 'Cached' : 'Generated' }} {{ timeAgo }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { marked } from 'marked'
import { escapeHtml, sanitizeMarkdownHtml } from '~/utils/sanitizeHtml'

const props = withDefaults(defineProps<{
  type: string
  context: Record<string, any>
  title?: string
  icon?: string
  collapsible?: boolean
  dismissible?: boolean
}>(), {
  title: 'AI Insight',
  icon: 'i-heroicons-sparkles',
  collapsible: true,
  dismissible: false
})

const { getPreference, setPreference } = useUserPreferences()

const loading = ref(false)
const insight = ref<string | null>(null)
const error = ref(false)
const cached = ref(false)
const generatedAt = ref<string | null>(null)
const dismissed = ref(false)


const prefKey = computed(() => `aiInsight_${props.type}_collapsed`)
const collapsed = ref(false)

const timeAgo = computed(() => {
  if (!generatedAt.value) return ''
  const diff = Date.now() - new Date(generatedAt.value).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
})

const renderedInsight = computed(() => {
  if (!insight.value) return ''
  try {
    return sanitizeMarkdownHtml(marked.parse(insight.value, { gfm: true, breaks: true }) as string)
  } catch {
    return sanitizeMarkdownHtml(escapeHtml(insight.value))
  }
})

function toggleCollapsed() {
  collapsed.value = !collapsed.value
  setPreference(prefKey.value, collapsed.value)
}

function dismiss() {
  dismissed.value = true
}

// Deep watch context to refetch when data changes
const contextString = computed(() => JSON.stringify(props.context))
let lastContextString = ''

async function fetchInsight(refresh = false) {
  // Don't fetch with empty context
  const ctx = props.context
  if (!ctx || Object.keys(ctx).length === 0) return

  // Avoid re-fetching for the same context unless refresh is requested
  const currentCtx = contextString.value
  if (!refresh && currentCtx === lastContextString && insight.value) return
  lastContextString = currentCtx

  loading.value = true
  error.value = false

  try {
    const result = await $fetch<{ success: boolean; data: { insight: string; cached: boolean; generatedAt: string } }>('/api/ai/insights', {
      method: 'POST',
      body: { type: props.type, context: ctx, refresh }
    })

    if (result.success && result.data?.insight) {
      insight.value = result.data.insight
      cached.value = result.data.cached
      generatedAt.value = result.data.generatedAt
    } else {
      error.value = true
    }
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  collapsed.value = getPreference(prefKey.value, false)
})

// Fetch when usable data arrives, independently of the retired chatbot settings.
watch(contextString, () => {
  if (props.context && Object.keys(props.context).length > 0) fetchInsight()
}, { immediate: true })
</script>

<style scoped>
.ai-insight-content :deep(p) {
  @apply text-sm leading-relaxed mb-1.5 last:mb-0;
}
.ai-insight-content :deep(strong) {
  @apply font-semibold text-gray-900 dark:text-white;
}
.ai-insight-content :deep(ul) {
  @apply space-y-1 mb-2 pl-4 list-disc;
}
.ai-insight-content :deep(ol) {
  @apply space-y-1 mb-2 pl-4 list-decimal;
}
.ai-insight-content :deep(li) {
  @apply text-sm text-gray-700 dark:text-gray-300;
}
.ai-insight-content :deep(li::marker) {
  @apply text-indigo-400;
}
.ai-insight-content :deep(h2),
.ai-insight-content :deep(h3),
.ai-insight-content :deep(h4) {
  @apply text-sm font-semibold text-gray-900 dark:text-white mt-2 mb-1;
}
.ai-insight-content :deep(a) {
  @apply text-indigo-500 dark:text-indigo-400 hover:underline;
}
.ai-insight-content :deep(code) {
  @apply bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs;
}
</style>
