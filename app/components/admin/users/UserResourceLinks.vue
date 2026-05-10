<template>
  <div class="flex items-center gap-1 flex-wrap">
    <template v-for="link in links" :key="link.label">
      <UTooltip :text="link.description">
        <a
          v-if="link.available"
          :href="link.url"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
          @click.stop
        >
          <Icon :name="link.icon" class="w-3.5 h-3.5 flex-shrink-0" />
          <span :class="compact ? 'hidden sm:inline' : ''">{{ link.label }}</span>
        </a>
        <span
          v-else
          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-gray-300 dark:text-gray-600 cursor-not-allowed"
          aria-disabled="true"
        >
          <Icon :name="link.icon" class="w-3.5 h-3.5 flex-shrink-0" />
          <span :class="compact ? 'hidden sm:inline' : ''">{{ link.label }}</span>
        </span>
      </UTooltip>
    </template>
  </div>
</template>

<script setup lang="ts">
import { getUserResourceLinks } from '~/utils/hermesLinks'

const props = defineProps<{
  username: string
  mmUserId?: string
  /** compact=true hides labels on small screens (for table rows) */
  compact?: boolean
}>()

const links = computed(() => getUserResourceLinks(props.username, props.mmUserId))
</script>
