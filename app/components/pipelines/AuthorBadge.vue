<template>
  <div class="flex items-center gap-2">
    <!-- Author Name (clickable if showLink is true) -->
    <component
      :is="showLink ? 'NuxtLink' : 'span'"
      :to="showLink ? authorLink : undefined"
      class="text-sm font-medium"
      :class="showLink ? 'text-primary hover:underline cursor-pointer' : 'text-gray-900 dark:text-gray-100'"
      @click.stop="showLink ? undefined : $event.preventDefault()"
    >
      {{ authorName }}
    </component>

    <!-- Contact Icons -->
    <PipelinesAuthorContactIcons
      v-if="showContactIcons"
      :email="authorEmail"
    />
  </div>
</template>

<script setup lang="ts">
import { parseAuthor, formatAuthorName } from '~/utils/author-helpers'
import type { AuthorInfo } from '#shared/types/pipelines'
import PipelinesAuthorContactIcons from './AuthorContactIcons.vue'

const props = withDefaults(defineProps<{
  authorField: string
  showContactIcons?: boolean
  showLink?: boolean
  maxNameLength?: number
}>(), {
  showContactIcons: true,
  showLink: true,
  maxNameLength: 30
})

const authorInfo = computed<AuthorInfo>(() => parseAuthor(props.authorField))

const authorName = computed(() => formatAuthorName(authorInfo.value, props.maxNameLength))

const authorEmail = computed(() => authorInfo.value.email)

const authorLink = computed(() => {
  // Encode email for URL
  return `/admin/pipelines/authors/${encodeURIComponent(authorEmail.value)}`
})
</script>
