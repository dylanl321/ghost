<template>
  <div class="flex flex-col gap-6" data-tour="costs-summary">
    <p class="m-0 max-w-5xl text-2xl font-semibold leading-snug tracking-tight text-white md:text-[28px]" aria-live="polite">
      {{ narrative.lead }}<span :class="toneClass">{{ narrative.emphasis }}</span>{{ narrative.tail }}
    </p>

    <div class="flex flex-wrap items-end gap-x-12 gap-y-6">
      <dl class="m-0 grid min-w-0 grid-cols-2 gap-x-10 gap-y-4 sm:flex sm:flex-wrap">
        <div v-for="stat in stats" :key="stat.label" class="flex min-w-0 flex-col gap-1">
          <dt class="text-xs font-medium uppercase tracking-wider text-slate-400">{{ stat.label }}</dt>
          <dd class="m-0 text-2xl font-extrabold leading-none tabular-nums md:text-3xl" :class="statToneClass(stat.tone)">{{ stat.value }}</dd>
          <dd class="m-0 text-xs text-slate-400">{{ stat.sub }}</dd>
        </div>
      </dl>

      <!-- Period pace: spend against the full-period budget, with the budget-to-date marker -->
      <figure v-if="pace" class="m-0 flex min-w-0 flex-[1_1_360px] flex-col gap-3">
        <figcaption class="flex justify-between gap-4 text-xs text-slate-400">
          <span>{{ pace.caption }}</span>
          <span class="tabular-nums">{{ pace.right }}</span>
        </figcaption>
        <div
          class="relative h-3.5 rounded-full bg-white/10"
          role="img"
          :aria-label="pace.aria"
        >
          <div class="absolute inset-y-0 left-0 rounded-full" :class="pace.over ? 'bg-red-400' : 'bg-emerald-400'" :style="{ width: pct(pace.spendRatio) }" />
          <div class="absolute -inset-y-1.5 border-l-2 border-white" :style="{ left: pct(pace.markerRatio) }" />
        </div>
        <div class="flex flex-wrap gap-4 text-xs text-slate-300">
          <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm" :class="pace.over ? 'bg-red-400' : 'bg-emerald-400'" />Spend</span>
          <span class="flex items-center gap-1.5"><span class="h-3 border-l-2 border-white" />Budget to date</span>
          <span class="flex items-center gap-1.5"><span class="h-2.5 w-4 rounded-sm bg-white/10" />Full {{ pace.periodLabel }} budget</span>
        </div>
      </figure>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CostNarrative } from '#shared/utils/cost-dashboard'

export interface HeroStat {
  label: string
  value: string
  sub: string
  tone?: 'over' | 'under' | 'neutral'
}

export interface HeroPace {
  caption: string
  right: string
  aria: string
  periodLabel: string
  /** spend / full-period budget */
  spendRatio: number
  /** budget to date / full-period budget */
  markerRatio: number
  over: boolean
}

const props = defineProps<{
  narrative: CostNarrative
  stats: HeroStat[]
  pace?: HeroPace | null
}>()

const toneClass = computed(() =>
  props.narrative.tone === 'over' ? 'text-red-300' : props.narrative.tone === 'under' ? 'text-emerald-300' : '')

const statToneClass = (tone?: HeroStat['tone']) =>
  tone === 'over' ? 'text-red-300' : tone === 'under' ? 'text-emerald-300' : 'text-white'

const pct = (ratio: number) => `${Math.max(0, Math.min(1, ratio)) * 100}%`
</script>
