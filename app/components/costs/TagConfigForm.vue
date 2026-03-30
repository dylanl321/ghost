<template>
  <!-- Loading state -->
  <div v-if="isLoading" class="flex items-center justify-center py-10">
    <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-blue-500 mx-auto" />
  </div>

  <div v-else class="space-y-8">
    <!-- Section 1: Favorite Tags -->
    <div>
      <div class="flex items-center gap-2 mb-1">
        <UIcon name="i-heroicons-star" class="w-4 h-4 text-amber-500" />
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Favorite Tags</h4>
      </div>
      <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Choose tags you use most often. These will appear at the top of the tag dropdown for quick access.
      </p>

      <!-- Toggle switches for all tags (AWS-discovered + custom) -->
      <div v-if="allTagsList.length > 0" class="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700 max-h-56 overflow-y-auto mb-3">
        <div
          v-for="tag in allTagsList"
          :key="tag.key"
          class="flex items-center justify-between px-3 py-2"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-sm text-gray-900 dark:text-gray-200 truncate">{{ tag.key }}</span>
            <UBadge v-if="tag.isCustom" size="xs" variant="soft" color="gray" label="custom" />
          </div>
          <UToggle
            :model-value="draft.importantTags.includes(tag.key)"
            @update:model-value="$emit('toggleImportantTag', tag.key, $event)"
          />
        </div>
      </div>
      <div v-else class="text-sm text-gray-400 italic mb-3">
        No tags discovered yet. Add one below or scan your resources.
      </div>

      <!-- Add custom tag input -->
      <div class="flex items-center gap-2 mb-3">
        <UInput
          v-model="customTagInput"
          placeholder="Add a tag not listed above..."
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

      <!-- Find More Tags from resources -->
      <div v-if="accountId" class="border-t border-gray-200 dark:border-gray-700 pt-3">
        <div class="flex items-center justify-between mb-2">
          <div>
            <h5 class="text-xs font-semibold text-gray-700 dark:text-gray-300">Find More Tags</h5>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Scan your AWS account to find tags that are actually in use on your resources.
            </p>
          </div>
          <UButton
            size="xs"
            color="blue"
            variant="soft"
            icon="i-heroicons-magnifying-glass"
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
          All discovered tags are already in your favorites.
        </div>
      </div>
    </div>

    <!-- Section 2: Default Tag -->
    <div>
      <div class="flex items-center gap-2 mb-1">
        <UIcon name="i-heroicons-bookmark" class="w-4 h-4 text-blue-500" />
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Default Tag</h4>
      </div>
      <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Automatically select this tag when you open the cost breakdown.
      </p>
      <USelectMenu
        :model-value="draft.defaultGroupByTag"
        :options="defaultGroupOptions"
        value-attribute="value"
        option-attribute="label"
        placeholder="None — I'll pick each time"
        size="sm"
        class="w-full sm:w-64"
        @update:model-value="$emit('updateDefaultGroup', $event)"
      />
    </div>

    <!-- Section 3: Tag Notes -->
    <div v-if="draft.importantTags.length > 0">
      <div class="flex items-center gap-2 mb-1">
        <UIcon name="i-heroicons-chat-bubble-bottom-center-text" class="w-4 h-4 text-green-500" />
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Tag Notes</h4>
      </div>
      <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Add notes to help your team understand what each tag means. These appear as tooltips.
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
            placeholder="What does this tag mean?"
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

// Merge AWS-discovered tags + custom important tags into a single list
const allTagsList = computed(() => {
  const awsSet = new Set(props.availableTags)
  const entries: Array<{ key: string; isCustom: boolean }> = []

  // AWS-discovered tags first
  props.availableTags.forEach(t => entries.push({ key: t, isCustom: false }))

  // Custom tags that aren't in the AWS list
  props.draft.importantTags
    .filter(t => !awsSet.has(t))
    .forEach(t => entries.push({ key: t, isCustom: true }))

  return entries
})

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
