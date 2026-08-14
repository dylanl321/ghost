<template>
  <USlideover v-model="isOpen" side="right" :ui="{ width: 'max-w-sm' }">
    <div class="flex flex-col h-full">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-adjustments-horizontal" class="w-5 h-5 text-gray-500" />
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Tag Settings</h2>
        </div>
        <UButton icon="i-heroicons-x-mark" size="xs" variant="ghost" color="gray" @click="isOpen = false" />
      </div>

      <!-- Scrollable content -->
      <div class="flex-1 overflow-y-auto p-4">
        <TagConfigForm
          :available-tags="availableTags"
          :resource-tags="resourceTags"
          :is-loading-resource-tags="isLoadingResourceTags"
          :account-id="accountId"
          :draft="draft"
          :is-loading="isLoadingConfig || isLoadingTags"
          :is-saving="isSavingConfig"
          :default-group-options="defaultGroupOptions"
          @toggle-important-tag="toggleImportantTag"
          @set-description="setDescription"
          @update-default-group="draft.defaultGroupByTag = $event ?? undefined"
          @fetch-resource-tags="fetchResourceTags(accountId, props.environment)"
        />
      </div>

      <!-- Footer -->
      <div class="p-4 border-t border-gray-200 dark:border-gray-700">
        <UButton
          label="Save Settings"
          color="blue"
          block
          :loading="isSavingConfig"
          :disabled="isLoadingConfig || isLoadingTags"
          @click="save"
        />
      </div>
    </div>
  </USlideover>
</template>

<script setup lang="ts">
import type { AccountCostTagConfig } from '~~/shared/types/cost-tags'

const props = defineProps<{
  accountId: string
  environment?: string
}>()

const isOpen = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  (e: 'saved', config: AccountCostTagConfig): void
}>()

const toast = useToast()
const {
  availableTags,
  resourceTags,
  tagConfig,
  isLoadingTags,
  isLoadingResourceTags,
  isLoadingConfig,
  isSavingConfig,
  fetchAvailableTags,
  fetchResourceTags,
  fetchAccountTagConfig,
  saveAccountTagConfig
} = useCostTags()

const draft = reactive<AccountCostTagConfig>({
  importantTags: [],
  defaultGroupByTag: undefined,
  tagDescriptions: {},
  tagValueAliases: {}
})

const defaultGroupOptions = computed(() => [
  { label: 'None', value: null },
  ...draft.importantTags.map(t => ({ label: t, value: t }))
])

function toggleImportantTag(tag: string, checked: boolean) {
  if (checked) {
    if (!draft.importantTags.includes(tag)) draft.importantTags.push(tag)
  } else {
    draft.importantTags = draft.importantTags.filter(t => t !== tag)
    if (draft.tagDescriptions?.[tag]) {
      const { [tag]: _, ...rest } = draft.tagDescriptions
      draft.tagDescriptions = rest
    }
    if (draft.defaultGroupByTag === tag) draft.defaultGroupByTag = undefined
  }
}

function setDescription(tag: string, value: string) {
  if (!draft.tagDescriptions) draft.tagDescriptions = {}
  if (value) {
    draft.tagDescriptions[tag] = value
  } else {
    const { [tag]: _, ...rest } = draft.tagDescriptions
    draft.tagDescriptions = rest
  }
}

async function save() {
  try {
    const saved = await saveAccountTagConfig(props.accountId, { ...draft })
    emit('saved', saved)
    toast.add({
      title: 'Configuration Saved',
      description: 'Tag configuration updated successfully',
      icon: 'i-heroicons-check-circle',
      color: 'green'
    })
  } catch {
    toast.add({
      title: 'Save Failed',
      description: 'Could not save tag configuration. Please try again.',
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
  }
}

function populateDraft() {
  if (tagConfig.value) {
    draft.importantTags = [...(tagConfig.value.importantTags ?? [])]
    draft.defaultGroupByTag = tagConfig.value.defaultGroupByTag
    draft.tagDescriptions = { ...(tagConfig.value.tagDescriptions ?? {}) }
    draft.tagValueAliases = { ...(tagConfig.value.tagValueAliases ?? {}) }
  } else {
    draft.importantTags = []
    draft.defaultGroupByTag = undefined
    draft.tagDescriptions = {}
    draft.tagValueAliases = {}
  }
}

async function loadData() {
  await Promise.all([
    fetchAvailableTags([props.accountId]),
    fetchAccountTagConfig(props.accountId)
  ])
  populateDraft()
}

// Load data when slideover opens
watch(isOpen, async (open) => {
  if (!open) return
  await loadData()
}, { immediate: true })
</script>
