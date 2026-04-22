<template>
  <div class="space-y-4 mt-4">
    <!-- Tags Table -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-tag" class="w-4 h-4 text-gray-400" />
            <span class="font-semibold text-sm">Tags</span>
            <UBadge color="gray" variant="soft" size="xs">{{ tagEntries.length }}</UBadge>
          </div>
          <UInput v-model="tagSearch" placeholder="Filter tags..." icon="i-heroicons-magnifying-glass" size="sm" class="w-48" />
        </div>
      </template>
      <div v-if="filteredTags.length > 0" class="divide-y divide-gray-100 dark:divide-gray-700">
        <div v-for="tag in filteredTags" :key="tag.key" class="flex items-center py-2.5 px-1">
          <div class="w-1/3">
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ tag.key }}</span>
          </div>
          <div class="flex-1">
            <span class="text-sm text-gray-600 dark:text-gray-300 break-all">{{ tag.value }}</span>
          </div>
          <UButton icon="i-heroicons-clipboard-document" size="2xs" color="gray" variant="ghost" @click="copy(tag.value)" />
        </div>
      </div>
      <div v-else class="text-sm text-gray-400 text-center py-6">
        {{ tagSearch ? 'No tags match filter' : 'No tags found' }}
      </div>
    </UCard>

    <!-- Tag Suggestions -->
    <template v-if="tagSuggestions">
      <!-- Missing Tags -->
      <UCard v-if="tagSuggestions.missing?.length">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-yellow-500" />
            <span class="font-semibold text-sm">Missing Tags</span>
            <UBadge color="yellow" variant="soft" size="xs">{{ tagSuggestions.missing.length }}</UBadge>
          </div>
        </template>
        <div class="space-y-2">
          <div v-for="suggestion in tagSuggestions.missing" :key="suggestion.key" class="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-800/30">
            <div class="flex items-center justify-between mb-1">
              <span class="font-medium text-sm text-gray-900 dark:text-white">{{ suggestion.key }}</span>
              <UBadge color="yellow" variant="soft" size="xs">Missing</UBadge>
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-400">{{ suggestion.reason }}</div>
            <div v-if="suggestion.suggestion" class="text-xs text-gray-500 mt-1">
              Suggested: <span class="font-mono">{{ suggestion.suggestion }}</span>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Tag Improvements -->
      <UCard v-if="tagSuggestions.improvements?.length">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-light-bulb" class="w-4 h-4 text-blue-500" />
            <span class="font-semibold text-sm">Improvement Suggestions</span>
            <UBadge color="blue" variant="soft" size="xs">{{ tagSuggestions.improvements.length }}</UBadge>
          </div>
        </template>
        <div class="space-y-2">
          <div v-for="imp in tagSuggestions.improvements" :key="imp.key" class="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30">
            <div class="font-medium text-sm text-gray-900 dark:text-white mb-1">{{ imp.key }}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400">
              Current: <span class="font-mono">{{ imp.currentValue }}</span>
            </div>
            <div class="text-xs text-gray-500">
              Suggested: <span class="font-mono">{{ imp.suggestion }}</span> — {{ imp.reason }}
            </div>
          </div>
        </div>
      </UCard>
    </template>

    <!-- GDMS Management -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4 text-gray-400" />
          <span class="font-semibold text-sm">GDMS Management</span>
        </div>
      </template>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-500 dark:text-gray-400">GDMS Managed</span>
          <UBadge :color="instance.managementInfo?.isGDMSManaged ? 'green' : 'gray'" variant="soft" size="xs">
            {{ instance.managementInfo?.isGDMSManaged ? 'Yes' : 'No' }}
          </UBadge>
        </div>
        <div v-if="instance.managementInfo?.gdmsManagedValue" class="flex justify-between">
          <span class="text-gray-500 dark:text-gray-400">Managed Value</span>
          <span class="text-gray-900 dark:text-white">{{ instance.managementInfo.gdmsManagedValue }}</span>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  instance: any
  tagSuggestions: any | null
  instanceId: string
  environment: string
}>()

defineEmits<{ refresh: [] }>()

const tagSearch = ref('')

const tagEntries = computed(() => {
  const tags = props.instance?.metadata?.tags
  if (!tags || typeof tags !== 'object') return []
  return Object.entries(tags).map(([key, value]) => ({ key, value: String(value) })).sort((a, b) => a.key.localeCompare(b.key))
})

const filteredTags = computed(() => {
  if (!tagSearch.value) return tagEntries.value
  const q = tagSearch.value.toLowerCase()
  return tagEntries.value.filter(t => t.key.toLowerCase().includes(q) || t.value.toLowerCase().includes(q))
})

function copy(text: string) {
  navigator.clipboard.writeText(text)
}
</script>
