<template>
  <!-- Modal mode: wrapped in UModal -->
  <UModal v-if="mode === 'modal'" :model-value="show" @update:model-value="$emit('update:show', $event)">
    <UCard
      :ui="{
        ring: '',
        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        header: { base: 'py-4 px-6', background: 'bg-white dark:bg-gray-900' },
        footer: { base: 'py-4 px-6', background: 'bg-white dark:bg-gray-900' }
      }"
    >
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Tag Configuration</h3>
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-x-mark-20-solid"
            size="sm"
            @click="$emit('update:show', false)"
          />
        </div>
      </template>

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
        @fetch-resource-tags="fetchResourceTags(accountId)"
      />

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="gray"
            variant="ghost"
            @click="$emit('update:show', false)"
          >
            Cancel
          </UButton>
          <UButton
            color="blue"
            variant="solid"
            :loading="isSavingConfig"
            :disabled="isLoadingConfig || isLoadingTags"
            @click="save"
          >
            Save Configuration
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>

  <!-- Inline mode: rendered as a card -->
  <UCard v-else>
    <template #header>
      <div>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Cost Allocation Tags</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Configure which tags are important for cost analysis on this account.
        </p>
      </div>
    </template>

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
      @fetch-resource-tags="fetchResourceTags(accountId)"
    />

    <template #footer>
      <div class="flex justify-end">
        <UButton
          color="blue"
          variant="solid"
          :loading="isSavingConfig"
          :disabled="isLoadingConfig || isLoadingTags"
          @click="save"
        >
          Save Configuration
        </UButton>
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
import type { AccountCostTagConfig } from '~~/shared/types/cost-tags'

const props = defineProps<{
  accountId: string
  show?: boolean
  mode?: 'modal' | 'inline'
}>()

defineEmits<{
  (e: 'update:show', value: boolean): void
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
  tagDescriptions: {}
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
    await saveAccountTagConfig(props.accountId, { ...draft })
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
  } else {
    draft.importantTags = []
    draft.defaultGroupByTag = undefined
    draft.tagDescriptions = {}
  }
}

async function loadData() {
  await Promise.all([
    fetchAvailableTags(),
    fetchAccountTagConfig(props.accountId)
  ])
  populateDraft()
}

// Modal mode: load data when modal opens
if (props.mode === 'modal' || !props.mode) {
  watch(() => props.show, async (open) => {
    if (!open) return
    await loadData()
  }, { immediate: true })
}

// Inline mode: load data on mount
if (props.mode === 'inline') {
  onMounted(() => loadData())
}
</script>
