<template>
  <!-- Loading state -->
  <div v-if="isLoading" class="flex items-center justify-center py-10">
    <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-blue-500 mx-auto" />
  </div>

  <div v-else class="space-y-6">
    <!-- Important tags -->
    <div>
      <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-1">Important Tags</h4>
      <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Pinned at the top of the tag selector. Check tags from AWS or add your own below.
      </p>

      <!-- Checkboxes for AWS-discovered cost allocation tags -->
      <div v-if="availableTags.length > 0" class="space-y-2 max-h-48 overflow-y-auto pr-1 mb-3">
        <label
          v-for="tag in availableTags"
          :key="tag"
          class="flex items-center gap-2 cursor-pointer"
        >
          <UCheckbox
            :model-value="draft.importantTags.includes(tag)"
            @update:model-value="$emit('toggleImportantTag', tag, $event)"
          />
          <span class="text-sm text-gray-900 dark:text-gray-200">{{ tag }}</span>
        </label>
      </div>
      <div v-else class="text-sm text-gray-400 italic mb-3">
        No cost allocation tags discovered from AWS.
      </div>

      <!-- Custom tags already added (that aren't in availableTags) -->
      <div v-if="customImportantTags.length > 0" class="space-y-2 mb-3">
        <div
          v-for="tag in customImportantTags"
          :key="tag"
          class="flex items-center gap-2"
        >
          <UCheckbox
            :model-value="true"
            @update:model-value="$emit('toggleImportantTag', tag, false)"
          />
          <span class="text-sm text-gray-900 dark:text-gray-200">{{ tag }}</span>
          <UBadge size="xs" variant="soft" color="gray" label="custom" />
        </div>
      </div>

      <!-- Add custom tag input -->
      <div class="flex items-center gap-2 mb-3">
        <UInput
          v-model="customTagInput"
          placeholder="Add a custom tag key..."
          size="sm"
          class="flex-1 sm:max-w-xs"
          @keydown.enter.prevent="addCustomTag"
        />
        <UButton
          size="sm"
          color="gray"
          variant="soft"
          :disabled="!customTagInput.trim()"
          @click="addCustomTag"
        >
          Add
        </UButton>
      </div>

      <!-- Smart suggest from resources -->
      <div v-if="accountId" class="border-t border-gray-200 dark:border-gray-700 pt-3">
        <div class="flex items-center justify-between mb-2">
          <div>
            <h5 class="text-xs font-semibold text-gray-700 dark:text-gray-300">Suggest from Resources</h5>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Discover tags in use on actual AWS resources in this account.
            </p>
          </div>
          <UButton
            size="xs"
            color="blue"
            variant="soft"
            icon="i-heroicons-sparkles"
            :loading="isLoadingResourceTags"
            @click="$emit('fetchResourceTags')"
          >
            {{ resourceTags.length > 0 ? 'Refresh' : 'Discover' }}
          </UButton>
        </div>

        <!-- Resource tag suggestions -->
        <div v-if="isLoadingResourceTags" class="flex items-center gap-2 text-sm text-gray-500 py-2">
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
          Scanning account resources...
        </div>
        <div v-else-if="suggestedTags.length > 0" class="flex flex-wrap gap-1.5">
          <UTooltip
            v-for="tag in suggestedTags"
            :key="tag.key"
            :text="tag.exampleValues.length ? `e.g. ${tag.exampleValues.join(', ')}` : 'No values found'"
          >
            <UBadge
              color="blue"
              variant="subtle"
              size="sm"
              class="cursor-pointer hover:opacity-80 transition-opacity"
              @click="$emit('toggleImportantTag', tag.key, true)"
            >
              <UIcon name="i-heroicons-plus" class="w-3 h-3 mr-0.5" />
              {{ tag.key }}
            </UBadge>
          </UTooltip>
        </div>
        <div v-else-if="resourceTags.length > 0" class="text-xs text-gray-500 italic py-1">
          All discovered tags are already in your important list.
        </div>
      </div>
    </div>

    <!-- Default group-by tag -->
    <div>
      <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-1">Default Group By</h4>
      <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Pre-selected tag when opening the cost breakdown view.
      </p>
      <USelectMenu
        :model-value="draft.defaultGroupByTag"
        :options="defaultGroupOptions"
        value-attribute="value"
        option-attribute="label"
        placeholder="None (manual selection)"
        size="sm"
        class="w-full sm:w-64"
        @update:model-value="$emit('updateDefaultGroup', $event)"
      />
    </div>

    <!-- Tag descriptions -->
    <div v-if="draft.importantTags.length > 0">
      <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-1">Tag Descriptions</h4>
      <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Optional descriptions shown as tooltips in the tag selector.
      </p>
      <div class="space-y-2">
        <div
          v-for="tag in draft.importantTags"
          :key="tag"
          class="flex items-center gap-2"
        >
          <span class="text-xs text-gray-500 dark:text-gray-400 w-32 shrink-0 truncate" :title="tag">{{ tag }}</span>
          <UInput
            :model-value="draft.tagDescriptions?.[tag] ?? ''"
            placeholder="Optional description..."
            size="sm"
            class="flex-1"
            @update:model-value="$emit('setDescription', tag, $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AccountCostTagConfig } from '~~/shared/types/cost-tags'

const props = defineProps<{
  availableTags: string[]
  resourceTags: Array<{ key: string; exampleValues: string[] }>
  isLoadingResourceTags: boolean
  accountId: string
  draft: AccountCostTagConfig
  isLoading: boolean
  isSaving: boolean
  defaultGroupOptions: Array<{ label: string; value: string | null }>
}>()

const emit = defineEmits<{
  (e: 'toggleImportantTag', tag: string, checked: boolean): void
  (e: 'setDescription', tag: string, value: string): void
  (e: 'updateDefaultGroup', value: string | null): void
  (e: 'fetchResourceTags'): void
}>()

const customTagInput = ref('')

// Important tags that were added manually (not from the AWS-discovered cost allocation list)
const customImportantTags = computed(() =>
  props.draft.importantTags.filter(t => !props.availableTags.includes(t))
)

// Resource tags not already in availableTags or importantTags — these are the suggestions
const suggestedTags = computed(() =>
  props.resourceTags.filter(t =>
    !props.draft.importantTags.includes(t.key) && !props.availableTags.includes(t.key)
  )
)

function addCustomTag() {
  const tag = customTagInput.value.trim()
  if (!tag) return
  if (props.draft.importantTags.includes(tag)) {
    customTagInput.value = ''
    return
  }
  emit('toggleImportantTag', tag, true)
  customTagInput.value = ''
}
</script>
