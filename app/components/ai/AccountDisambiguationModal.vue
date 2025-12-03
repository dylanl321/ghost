<template>
  <UModal v-model="isOpen" :prevent-close="isSelecting">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-question-mark-circle" class="w-6 h-6 text-blue-500" />
            <h3 class="text-lg font-semibold">Select Account</h3>
          </div>
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-x-mark"
            @click="cancel"
            :disabled="isSelecting"
          />
        </div>
      </template>

      <div class="space-y-4">
        <!-- Disambiguation Message -->
        <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <p class="text-sm text-gray-700 dark:text-gray-300">
            {{ disambiguation.message }}
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
            You searched for: <strong class="text-blue-600 dark:text-blue-400">{{ disambiguation.search_term }}</strong>
          </p>
        </div>

        <!-- Account Options -->
        <div class="space-y-2">
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Found {{ disambiguation.matches.length }} matching account{{ disambiguation.matches.length !== 1 ? 's' : '' }}:
          </p>

          <div class="space-y-2 max-h-96 overflow-y-auto">
            <button
              v-for="match in disambiguation.matches"
              :key="match.request_id"
              @click="selectAccount(match.request_id)"
              :disabled="isSelecting"
              class="w-full text-left p-4 rounded-lg border transition-all"
              :class="[
                isSelecting
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer',
                'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
              ]"
            >
              <!-- Account Name -->
              <div class="flex items-center justify-between mb-2">
                <h4 class="font-semibold text-gray-900 dark:text-white">
                  {{ match.account_alias }}
                </h4>
                <span class="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                  {{ match.match_score.toFixed(0) }}% match
                </span>
              </div>

              <!-- Account IDs -->
              <div class="space-y-1 mb-2">
                <div v-if="match.govcloud_account_id" class="flex items-center gap-2 text-sm">
                  <UIcon name="i-heroicons-shield-check" class="w-4 h-4 text-green-500" />
                  <span class="text-gray-600 dark:text-gray-400">GovCloud:</span>
                  <code class="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                    {{ match.govcloud_account_id }}
                  </code>
                </div>
                <div v-if="match.commercial_account_id" class="flex items-center gap-2 text-sm">
                  <UIcon name="i-heroicons-globe-alt" class="w-4 h-4 text-blue-500" />
                  <span class="text-gray-600 dark:text-gray-400">Commercial:</span>
                  <code class="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                    {{ match.commercial_account_id }}
                  </code>
                </div>
              </div>

              <!-- Match Reason -->
              <div class="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded p-2">
                <UIcon name="i-heroicons-information-circle" class="w-3 h-3 inline mr-1" />
                {{ match.match_reason }}
              </div>
            </button>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="isSelecting" class="flex items-center justify-center gap-2 py-4">
          <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-blue-500" />
          <span class="text-sm text-gray-600 dark:text-gray-400">Selecting account...</span>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton
            color="gray"
            variant="ghost"
            @click="cancel"
            :disabled="isSelecting"
          >
            Cancel
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import type { AccountDisambiguation } from '~/server/types/strands'

interface Props {
  disambiguation: AccountDisambiguation
  sessionId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  selected: [requestId: string]
  cancel: []
}>()

const isOpen = ref(true)
const isSelecting = ref(false)

const selectAccount = async (requestId: string) => {
  isSelecting.value = true
  emit('selected', requestId)
}

const cancel = () => {
  if (!isSelecting.value) {
    isOpen.value = false
    emit('cancel')
  }
}
</script>

<style scoped>
/* Custom scrollbar for account list */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  @apply bg-gray-100 dark:bg-gray-800 rounded;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  @apply bg-gray-300 dark:bg-gray-600 rounded;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  @apply bg-gray-400 dark:bg-gray-500;
}
</style>
