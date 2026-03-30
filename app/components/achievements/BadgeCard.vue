<script setup lang="ts">
import type { BadgeDefinition } from '#shared/types/achievements'

const props = defineProps<{
  badge: BadgeDefinition
  earned: boolean
  awardedAt?: string
  progress?: { current: number; target: number } | null
}>()

/** Convert FA class name to Iconify UIcon format: "fa-solid fa-map" → "i-fa6-solid-map" */
function toIconifyName(faIcon: string): string {
  const parts = faIcon.split(' ')
  const iconPart = parts.find(p => p.startsWith('fa-') && !p.startsWith('fa-solid') && !p.startsWith('fa-regular') && !p.startsWith('fa-brands'))
  if (!iconPart) return 'i-heroicons-trophy'
  const name = iconPart.replace('fa-', '')
  return `i-fa6-solid-${name}`
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}

const iconName = computed(() => toIconifyName(props.badge.icon))
const rgb = computed(() => hexToRgb(props.badge.color))

const formattedDate = computed(() => {
  if (!props.awardedAt) return ''
  return new Date(props.awardedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
})

const isHiddenAndLocked = computed(() => props.badge.hidden && !props.earned)

const showProgress = computed(() =>
  !props.earned && !isHiddenAndLocked.value && props.progress && props.progress.target > 1 && props.progress.current > 0
)
const progressPercent = computed(() =>
  props.progress ? Math.round((props.progress.current / props.progress.target) * 100) : 0
)

// Tooltip: shows how to earn for unearned, or description + date for earned
const tooltipText = computed(() => {
  if (props.earned) return `${props.badge.description}${formattedDate.value ? ` — Earned ${formattedDate.value}` : ''}`
  if (isHiddenAndLocked.value) return 'Keep exploring to discover this hidden badge'
  let text = props.badge.description
  if (props.progress && props.progress.target > 1 && props.progress.current > 0) {
    text += ` (${props.progress.current}/${props.progress.target})`
  }
  return text
})
</script>

<template>
  <div
    :title="tooltipText"
    class="badge-card group relative rounded-xl border p-5 flex flex-col items-center text-center transition-all duration-200"
    :class="earned
      ? 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:shadow-lg hover:-translate-y-0.5'
      : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'"
  >
    <!-- Hidden badge tag -->
    <span
      v-if="badge.hidden && earned"
      class="absolute top-2 right-2 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-700/80 text-gray-400"
    >
      Hidden
    </span>

    <!-- Icon circle — greyed out when not earned -->
    <div
      class="w-14 h-14 rounded-full flex items-center justify-center text-xl mb-3 transition-transform duration-200 group-hover:scale-105"
      :style="earned
        ? { background: `rgba(${rgb}, 0.12)`, color: badge.color, boxShadow: `0 0 20px rgba(${rgb}, 0.15)` }
        : { background: 'rgb(31, 33, 41)', color: 'rgb(58, 61, 71)' }"
    >
      <UIcon
        :name="isHiddenAndLocked ? 'i-heroicons-question-mark-circle' : iconName"
        class="w-6 h-6"
      />
    </div>

    <!-- Name — readable in both states -->
    <div
      class="text-sm font-semibold mb-1"
      :class="earned ? 'text-white' : 'text-gray-300'"
    >
      {{ isHiddenAndLocked ? '???' : badge.name }}
    </div>

    <!-- Description (earned) or Hint (locked) — readable text -->
    <div v-if="earned" class="text-xs text-gray-400 leading-relaxed mb-2">
      {{ badge.description }}
    </div>
    <div v-else class="text-xs italic leading-relaxed mb-2" :class="isHiddenAndLocked ? 'text-gray-600' : 'text-gray-400'">
      "{{ isHiddenAndLocked ? 'Find this hidden badge to reveal it.' : badge.hint }}"
    </div>

    <!-- Progress bar for count-based badges -->
    <div v-if="showProgress" class="w-full mt-1 mb-1">
      <div class="flex items-center justify-between text-[10px] text-gray-500 mb-1">
        <span>{{ progress!.current }} / {{ progress!.target }}</span>
        <span>{{ progressPercent }}%</span>
      </div>
      <div class="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-500"
          :style="{ width: `${progressPercent}%`, backgroundColor: badge.color, opacity: 0.6 }"
        />
      </div>
    </div>

    <!-- Earned date -->
    <div v-if="earned && formattedDate" class="text-[10px] text-gray-500">
      Earned {{ formattedDate }}
    </div>
  </div>
</template>
