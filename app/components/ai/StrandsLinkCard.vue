<template>
  <NuxtLink
    :to="link.url"
    class="block group"
  >
    <div
      class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-600 transition-all duration-200 hover:scale-[1.02] hover:shadow-md"
    >
      <!-- Icon -->
      <div class="flex-shrink-0">
        <div class="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center group-hover:bg-purple-200 dark:group-hover:bg-purple-800/40 transition-colors">
          <UIcon :name="link.icon" class="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {{ link.label }}
          </h4>
          <UBadge
            :color="badgeColor"
            size="xs"
            class="flex-shrink-0"
          >
            {{ badgeLabel }}
          </UBadge>
        </div>
        <p class="text-xs text-gray-600 dark:text-gray-400 truncate mt-0.5">
          {{ link.description }}
        </p>
      </div>

      <!-- Arrow Icon -->
      <div class="flex-shrink-0">
        <UIcon
          name="i-heroicons-arrow-right"
          class="w-5 h-5 text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors"
        />
      </div>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
import type { SuggestedLink } from '#shared/types/chat-threads'

interface Props {
  link: SuggestedLink
}

const props = defineProps<Props>()

// Badge configuration based on link type
const badgeColor = computed(() => {
  const colorMap: Record<string, string> = {
    cost: 'green',
    explorer: 'blue',
    users: 'purple',
    'org-chart': 'orange',
    reports: 'cyan',
    security: 'red'
  }
  return colorMap[props.link.type] || 'gray'
})

const badgeLabel = computed(() => {
  const labelMap: Record<string, string> = {
    cost: 'Costs',
    explorer: 'Resources',
    users: 'Users',
    'org-chart': 'Org Chart',
    reports: 'Reports',
    security: 'Security'
  }
  return labelMap[props.link.type] || 'Link'
})
</script>
