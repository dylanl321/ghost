<template>
  <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 h-full overflow-hidden">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
          <UIcon name="i-heroicons-trophy" class="w-4.5 h-4.5 text-yellow-500" />
        </div>
        <div>
          <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Achievements</h2>
          <p class="text-[11px] text-gray-400 dark:text-gray-500">{{ earnedCount }} / {{ totalCount }} badges</p>
        </div>
      </div>
      <NuxtLink to="/profile?tab=achievements">
        <UButton size="xs" variant="ghost" color="gray" trailing-icon="i-heroicons-arrow-right-20-solid">
          View All
        </UButton>
      </NuxtLink>
    </div>

    <!-- Overall progress bar -->
    <div class="mb-4">
      <UProgress :value="overallPercent" color="yellow" size="xs" />
    </div>

    <!-- Recently earned -->
    <div v-if="recentlyEarned.length > 0" class="mb-4">
      <h3 class="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Recently Earned</h3>
      <div class="space-y-2">
        <div
          v-for="badge in recentlyEarned"
          :key="badge.id"
          class="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
        >
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            :style="{ background: `rgba(${hexToRgb(badge.color)}, 0.12)`, color: badge.color }"
          >
            <UIcon :name="toIconifyName(badge.icon)" class="w-4 h-4" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium text-gray-900 dark:text-white truncate">{{ badge.name }}</p>
            <p class="text-[10px] text-gray-500 dark:text-gray-400 truncate">{{ badge.description }}</p>
          </div>
          <span class="text-[10px] text-gray-400 flex-shrink-0">{{ formatRelative(awardedAt[badge.id]) }}</span>
        </div>
      </div>
    </div>

    <!-- Almost there -->
    <div v-if="almostThere.length > 0">
      <h3 class="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Almost There</h3>
      <div class="space-y-2.5">
        <div
          v-for="item in almostThere"
          :key="item.badge.id"
          class="flex items-center gap-3 px-3 py-2 rounded-lg"
        >
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 opacity-50"
            :style="{ background: 'rgb(31, 33, 41)', color: 'rgb(100, 104, 115)' }"
          >
            <UIcon :name="toIconifyName(item.badge.icon)" class="w-4 h-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between mb-1">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{{ item.badge.name }}</p>
              <span class="text-[10px] text-gray-500 ml-2 flex-shrink-0">{{ item.progress.current }}/{{ item.progress.target }}</span>
            </div>
            <div class="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-500"
                :style="{ width: `${Math.round((item.progress.current / item.progress.target) * 100)}%`, backgroundColor: item.badge.color, opacity: 0.5 }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="recentlyEarned.length === 0 && almostThere.length === 0" class="text-center py-4">
      <UIcon name="i-heroicons-trophy" class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
      <p class="text-xs text-gray-400">Start exploring to earn badges!</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BadgeDefinition } from '#shared/types/achievements'
import { BADGE_DEFINITIONS } from '~/config/badgeDefinitions'

defineProps<{
  displayStyle?: string
}>()

const {
  earnedCount,
  totalCount,
  earnedBadges,
  initialized,
  getBadgeAwardedAt,
  getBadgeProgress
} = useAchievements()

const awardedAt = computed(() => {
  const map: Record<string, string> = {}
  for (const b of earnedBadges.value) {
    const at = getBadgeAwardedAt(b.id)
    if (at) map[b.id] = at
  }
  return map
})

const overallPercent = computed(() =>
  totalCount.value > 0 ? Math.round((earnedCount.value / totalCount.value) * 100) : 0
)

// Most recently earned badges (up to 3, sorted by award date desc)
const recentlyEarned = computed(() => {
  return earnedBadges.value
    .filter(b => awardedAt.value[b.id])
    .sort((a, b) => {
      const dateA = new Date(awardedAt.value[a.id]).getTime()
      const dateB = new Date(awardedAt.value[b.id]).getTime()
      return dateB - dateA
    })
    .slice(0, 3)
})

// Badges closest to completion (have progress > 0, sorted by % desc, up to 3)
const almostThere = computed(() => {
  const items: { badge: BadgeDefinition; progress: { current: number; target: number }; percent: number }[] = []

  for (const badge of BADGE_DEFINITIONS) {
    if (earnedBadges.value.some(b => b.id === badge.id)) continue
    if (badge.hidden) continue
    const p = getBadgeProgress(badge.id)
    if (!p || p.target <= 1 || p.current === 0) continue
    items.push({ badge, progress: p, percent: p.current / p.target })
  }

  return items
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 3)
})

function toIconifyName(faIcon: string): string {
  const parts = faIcon.split(' ')
  const iconPart = parts.find(p => p.startsWith('fa-') && !p.startsWith('fa-solid') && !p.startsWith('fa-regular') && !p.startsWith('fa-brands'))
  if (!iconPart) return 'i-heroicons-trophy'
  return `i-fa6-solid-${iconPart.replace('fa-', '')}`
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}

function formatRelative(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>
