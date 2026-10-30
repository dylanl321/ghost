<template>
  <UModal v-model="isOpen">
    <div class="p-6 space-y-4">
      <!-- Admin-configured popup message -->
      <template v-if="popupConfig">
        <div class="flex items-center gap-3">
          <UIcon :name="severityIcon" class="h-6 w-6" :class="severityIconColor" />
          <h2 class="text-xl font-semibold text-gray-100">
            {{ popupConfig.title || 'Announcement' }}
          </h2>
        </div>

        <div class="text-sm text-gray-300 whitespace-pre-line leading-relaxed">{{ popupConfig.body }}</div>

        <div class="flex items-center justify-between pt-2">
          <NuxtLink
            v-if="popupConfig.ctaLink && popupConfig.ctaLabel"
            :to="popupConfig.ctaLink"
            class="inline-flex items-center gap-1 text-sm font-medium transition-colors"
            :class="severityLinkColor"
            @click="dismiss"
          >
            {{ popupConfig.ctaLabel }}
            <UIcon name="i-heroicons-arrow-right-20-solid" class="h-4 w-4" />
          </NuxtLink>
          <span v-else />
          <UButton color="primary" @click="dismiss">Got it</UButton>
        </div>
      </template>

      <!-- Fallback: version changelog (original behavior) -->
      <template v-else>
        <div class="flex items-center gap-3">
          <UIcon name="i-heroicons-sparkles" class="h-6 w-6 text-emerald-400" />
          <h2 class="text-xl font-semibold text-gray-100">
            What's New in v{{ currentVersion }}
          </h2>
        </div>

        <div v-if="versionEntry" class="space-y-3">
          <div v-if="versionEntry.highlights.length" class="flex flex-wrap gap-2">
            <UBadge
              v-for="highlight in versionEntry.highlights"
              :key="highlight"
              color="emerald"
              variant="subtle"
              size="sm"
            >
              {{ highlight }}
            </UBadge>
          </div>

          <ul class="space-y-2 text-sm text-gray-300">
            <li
              v-for="(item, idx) in topItems"
              :key="idx"
              class="flex items-start gap-2"
            >
              <span class="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span>{{ item }}</span>
            </li>
          </ul>

          <NuxtLink
            to="/changelog"
            class="inline-flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
            @click="dismiss"
          >
            View full changelog
            <UIcon name="i-heroicons-arrow-right-20-solid" class="h-4 w-4" />
          </NuxtLink>
        </div>

        <div v-else class="text-sm text-gray-400">
          No changelog details available for this version.
        </div>

        <div class="flex justify-end pt-2">
          <UButton color="primary" @click="dismiss">Got it</UButton>
        </div>
      </template>
    </div>
  </UModal>
</template>

<script setup lang="ts">
import { useSiteConfigStore } from '~/stores/useSiteConfigStore'

const isOpen = defineModel<boolean>({ default: false })
const emit = defineEmits<{ dismiss: [] }>()

const config = useRuntimeConfig()
const currentVersion = config.public.appVersion
const siteConfigStore = useSiteConfigStore()

// Admin-configured popup (if enabled and has content)
const popupConfig = computed(() => {
  const popup = siteConfigStore.popupMessage
  if (popup?.enabled && popup?.id && popup?.body) {
    return popup
  }
  return null
})

// Severity-based styling
const severityIcon = computed(() => {
  switch (popupConfig.value?.severity) {
    case 'success': return 'i-heroicons-check-circle'
    case 'warning': return 'i-heroicons-exclamation-triangle'
    default: return 'i-heroicons-information-circle'
  }
})

const severityIconColor = computed(() => {
  switch (popupConfig.value?.severity) {
    case 'success': return 'text-emerald-400'
    case 'warning': return 'text-yellow-400'
    default: return 'text-blue-400'
  }
})

const severityLinkColor = computed(() => {
  switch (popupConfig.value?.severity) {
    case 'success': return 'text-emerald-400 hover:text-emerald-300'
    case 'warning': return 'text-yellow-400 hover:text-yellow-300'
    default: return 'text-blue-400 hover:text-blue-300'
  }
})

// Changelog fallback data
interface ChangelogEntry {
  version: string
  date: string
  highlights: string[]
  content: string
}

// server: false because this modal renders inside <ClientOnly>: during hydration Nuxt treats a
// server-fetched key that already has data (the [] default) as loaded, so it never fetched
const { data: changelog } = await useFetch<ChangelogEntry[]>('/api/changelog', {
  lazy: true,
  server: false,
  default: () => [],
})

const versionEntry = computed(() =>
  changelog.value?.find(e => e.version === currentVersion)
)

const topItems = computed(() => {
  if (!versionEntry.value) return []
  const lines = versionEntry.value.content.split('\n')
  const bullets: string[] = []
  for (const line of lines) {
    const match = line.match(/^- (.+)/)
    if (match) {
      bullets.push(match[1])
      if (bullets.length >= 5) break
    }
  }
  return bullets
})

function dismiss() {
  isOpen.value = false
  emit('dismiss')
}
</script>
