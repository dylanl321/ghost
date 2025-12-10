<template>
  <div v-if="thinking" class="ai-thinking-block mb-3">
    <button
      @click="isExpanded = !isExpanded"
      class="flex items-center gap-2 w-full px-2 py-1.5 text-left bg-gray-50 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group font-mono"
    >
      <UIcon
        name="i-heroicons-bug-ant"
        class="w-3.5 h-3.5 text-gray-500 flex-shrink-0"
      />
      <span class="text-[10px] font-medium text-gray-600 dark:text-gray-400 flex-1">
        Debug: AI Reasoning
      </span>
      <UIcon
        :name="isExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
        class="w-3.5 h-3.5 text-gray-500 opacity-50 group-hover:opacity-100 transition-opacity"
      />
    </button>
    
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 max-h-0"
      enter-to-class="opacity-100 max-h-96"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 max-h-96"
      leave-to-class="opacity-0 max-h-0"
    >
      <div v-show="isExpanded" class="overflow-hidden">
        <div class="mt-2 px-2 py-1.5 bg-gray-50/50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-800 rounded-lg">
          <p class="text-[10px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap leading-relaxed font-mono">
            {{ formattedThinking }}
          </p>
        </div>
      </div>
    </Transition>
    
    <!-- Collapsed Preview -->
    <p v-if="!isExpanded && thinkingSummary" class="mt-1 px-3 text-[10px] text-gray-500 dark:text-gray-500 italic line-clamp-1">
      {{ thinkingSummary }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { formatThinkingText, getThinkingSummary } from '~/utils/parseAIResponse'

const props = defineProps<{
  thinking: string | null
}>()

const isExpanded = ref(false)

const formattedThinking = computed(() => {
  if (!props.thinking) return ''
  return formatThinkingText(props.thinking)
})

const thinkingSummary = computed(() => {
  if (!props.thinking) return ''
  return getThinkingSummary(props.thinking, 100)
})
</script>

<style scoped>
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>

