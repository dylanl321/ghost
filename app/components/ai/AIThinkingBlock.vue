<template>
  <div v-if="thinking" class="ai-thinking-block mb-3">
    <button
      @click="isExpanded = !isExpanded"
      class="flex items-center gap-2 w-full px-3 py-2 text-left bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors group"
    >
      <UIcon 
        name="i-heroicons-light-bulb" 
        class="w-4 h-4 text-amber-500 flex-shrink-0" 
      />
      <span class="text-xs font-medium text-amber-700 dark:text-amber-300 flex-1">
        AI's Reasoning Process
      </span>
      <UIcon 
        :name="isExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" 
        class="w-4 h-4 text-amber-500 opacity-50 group-hover:opacity-100 transition-opacity" 
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
        <div class="mt-2 px-3 py-2 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/50 rounded-lg">
          <p class="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap leading-relaxed">
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

