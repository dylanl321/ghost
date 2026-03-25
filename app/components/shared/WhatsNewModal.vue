<template>
  <UModal v-model="isOpen" title="What's New">
    <div class="p-6 space-y-4">
      <div class="flex items-center gap-3">
        <UIcon name="i-heroicons-sparkles" class="h-6 w-6 text-emerald-400" />
        <h2 class="text-xl font-semibold text-gray-100">
          What's New in v{{ currentVersion }}
        </h2>
      </div>

      <div v-if="versionEntry" class="space-y-3">
        <!-- Highlights badges -->
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

        <!-- Top bullet points from changelog content -->
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

        <!-- Link to full changelog -->
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
    </div>
  </UModal>
</template>

<script setup lang="ts">
const isOpen = defineModel<boolean>({ default: false })
const emit = defineEmits<{ dismiss: [] }>()

const config = useRuntimeConfig()
const currentVersion = config.public.appVersion

interface ChangelogEntry {
  version: string
  date: string
  highlights: string[]
  content: string
}

const { data: changelog } = await useFetch<ChangelogEntry[]>('/api/changelog', {
  lazy: true,
  default: () => [],
})

const versionEntry = computed(() =>
  changelog.value?.find(e => e.version === currentVersion)
)

// Extract top 5 bullet points (lines starting with "- ") from the content
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
