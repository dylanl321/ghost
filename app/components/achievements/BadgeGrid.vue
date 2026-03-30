<script setup lang="ts">
import type { BadgeDefinition } from '#shared/types/achievements'

const {
  badges,
  earnedCount,
  totalCount,
  loading,
  initialized,
  isBadgeEarned,
  getBadgeAwardedAt,
  getBadgeProgress
} = useAchievements()

const { emit } = useEventBus()

// Emit badges.viewed event on first mount (awards Badge Watcher badge)
onMounted(() => {
  if (initialized.value) {
    emit('badges.viewed', {})
  }
})

// Category grouping
const discoveryBadges = computed(() =>
  badges.value.filter(b => b.category === 'discovery')
)

const hiddenBadges = computed(() => {
  const all = badges.value.filter(b => b.category === 'hidden')
  // Show earned hidden badges + placeholder slots for unearned ones
  const earned = all.filter(b => isBadgeEarned(b.id))
  const unearnedCount = all.length - earned.length
  return { earned, unearnedCount, total: all.length }
})

const metaBadges = computed(() =>
  badges.value.filter(b => b.category === 'meta')
)

const progressPercent = computed(() =>
  totalCount.value > 0 ? Math.round((earnedCount.value / totalCount.value) * 100) : 0
)

// Filter state
type FilterKey = 'all' | 'discovery' | 'hidden' | 'meta'
const activeFilter = ref<FilterKey>('all')

const filters: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'hidden', label: 'Hidden' },
  { key: 'meta', label: 'Meta' }
]
</script>

<template>
  <div class="space-y-6">
    <!-- Loading state -->
    <div v-if="loading && !initialized" class="flex items-center justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
      <span class="ml-2 text-gray-400">Loading achievements...</span>
    </div>

    <template v-else>
      <!-- Progress header -->
      <UCard>
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="text-lg font-semibold text-white">Achievements</h3>
            <p class="text-sm text-gray-400 mt-0.5">
              {{ earnedCount }} / {{ totalCount }} badges earned
            </p>
          </div>
          <div class="text-2xl font-bold text-white">{{ progressPercent }}%</div>
        </div>
        <UProgress :value="progressPercent" color="yellow" size="sm" />
      </UCard>

      <!-- Filter tabs -->
      <div class="flex gap-2 flex-wrap">
        <UButton
          v-for="f in filters"
          :key="f.key"
          :variant="activeFilter === f.key ? 'solid' : 'ghost'"
          :color="activeFilter === f.key ? 'white' : 'gray'"
          size="xs"
          @click="activeFilter = f.key"
        >
          {{ f.label }}
        </UButton>
      </div>

      <!-- Discovery badges -->
      <div v-if="activeFilter === 'all' || activeFilter === 'discovery'">
        <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Feature Discovery
        </h4>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <BadgeCard
            v-for="badge in discoveryBadges"
            :key="badge.id"
            :badge="badge"
            :earned="isBadgeEarned(badge.id)"
            :awarded-at="getBadgeAwardedAt(badge.id)"
            :progress="getBadgeProgress(badge.id)"
          />
        </div>
      </div>

      <!-- Hidden badges -->
      <div v-if="activeFilter === 'all' || activeFilter === 'hidden'">
        <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Hidden
          <span class="text-gray-600 ml-1">
            ({{ hiddenBadges.earned.length }} / {{ hiddenBadges.total }} found)
          </span>
        </h4>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <!-- Show earned hidden badges -->
          <BadgeCard
            v-for="badge in hiddenBadges.earned"
            :key="badge.id"
            :badge="badge"
            :earned="true"
            :awarded-at="getBadgeAwardedAt(badge.id)"
            :progress="getBadgeProgress(badge.id)"
          />
          <!-- Placeholder slots for undiscovered hidden badges -->
          <div
            v-for="i in hiddenBadges.unearnedCount"
            :key="`hidden-placeholder-${i}`"
            class="rounded-xl border border-gray-800 bg-gray-900/30 p-5 flex flex-col items-center text-center opacity-40"
          >
            <div class="w-14 h-14 rounded-full flex items-center justify-center mb-3 bg-gray-800/50">
              <UIcon name="i-heroicons-question-mark-circle" class="w-6 h-6 text-gray-700" />
            </div>
            <div class="text-sm font-semibold text-gray-600">???</div>
            <div class="text-xs italic text-gray-700 mt-1">"Keep exploring to find this."</div>
          </div>
        </div>
      </div>

      <!-- Meta badges -->
      <div v-if="activeFilter === 'all' || activeFilter === 'meta'">
        <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Meta
        </h4>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <BadgeCard
            v-for="badge in metaBadges"
            :key="badge.id"
            :badge="badge"
            :earned="isBadgeEarned(badge.id)"
            :awarded-at="getBadgeAwardedAt(badge.id)"
            :progress="getBadgeProgress(badge.id)"
          />
        </div>
      </div>
    </template>
  </div>
</template>
