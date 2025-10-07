<template>
  <div class="space-y-4">
    <div v-for="[serviceName, impact] in sortedServices" :key="serviceName" class="space-y-2">
      <div class="flex items-center justify-between text-sm">
        <div class="flex items-center gap-2">
          <span class="font-medium text-white uppercase">{{ serviceName }}</span>
          <UBadge
            :color="getImpactColor(impact.impactLevel)"
            variant="soft"
            size="xs"
          >
            {{ impact.impactLevel }}
          </UBadge>
        </div>
        <div class="text-gray-400">
          <span class="font-medium">{{ impact.totalRestricted }}</span> denied
          <span v-if="impact.totalConditional > 0" class="ml-2">
            <span class="font-medium">{{ impact.totalConditional }}</span> conditional
          </span>
        </div>
      </div>

      <!-- Visual bar chart -->
      <div class="relative h-8 bg-gray-800 rounded-lg overflow-hidden">
        <!-- Denied actions bar -->
        <div
          v-if="impact.totalRestricted > 0"
          class="absolute left-0 top-0 bottom-0 rounded-l-lg transition-all"
          :class="getBarColor(impact.impactLevel, 'denied')"
          :style="{ width: `${calculateBarWidth(impact.totalRestricted, impact.totalConditional)}%` }"
        >
          <div class="flex items-center justify-center h-full text-xs font-medium text-white">
            <span v-if="impact.totalRestricted > 0">{{ impact.totalRestricted }}</span>
          </div>
        </div>

        <!-- Conditional actions bar -->
        <div
          v-if="impact.totalConditional > 0"
          class="absolute top-0 bottom-0 transition-all"
          :class="getBarColor(impact.impactLevel, 'conditional')"
          :style="{
            left: `${calculateBarWidth(impact.totalRestricted, impact.totalConditional)}%`,
            width: `${calculateConditionalWidth(impact.totalRestricted, impact.totalConditional)}%`
          }"
        >
          <div class="flex items-center justify-center h-full text-xs font-medium text-white">
            <span v-if="impact.totalConditional > 0">{{ impact.totalConditional }}</span>
          </div>
        </div>

        <!-- Percentage label (right side) -->
        <div
          v-if="impact.percentRestricted > 0"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-300"
        >
          {{ impact.percentRestricted }}%
        </div>
      </div>

      <!-- Impact description -->
      <div class="text-xs text-gray-400 ml-1">
        {{ getImpactDescription(impact.impactLevel, impact.totalRestricted, impact.totalConditional) }}
      </div>
    </div>

    <!-- No restrictions message -->
    <div v-if="sortedServices.length === 0" class="text-center py-8 text-gray-400">
      <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-green-400" />
      <p class="text-sm">No service restrictions found</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  serviceImpacts: Record<string, {
    totalRestricted: number
    totalConditional: number
    percentRestricted: number
    impactLevel: 'low' | 'medium' | 'high' | 'critical'
  }>
  maxServices?: number
}>()

// Sort services by impact level and total restrictions
const sortedServices = computed(() => {
  const impactOrder = { critical: 0, high: 1, medium: 2, low: 3 }

  const entries = Object.entries(props.serviceImpacts)
    .sort((a, b) => {
      // First sort by impact level
      const levelDiff = impactOrder[a[1].impactLevel] - impactOrder[b[1].impactLevel]
      if (levelDiff !== 0) return levelDiff

      // Then by total restrictions
      return b[1].totalRestricted - a[1].totalRestricted
    })

  // Limit to maxServices if specified
  if (props.maxServices) {
    return entries.slice(0, props.maxServices)
  }

  return entries
})

const getImpactColor = (level: string) => {
  switch (level) {
    case 'critical': return 'red'
    case 'high': return 'orange'
    case 'medium': return 'yellow'
    case 'low': return 'blue'
    default: return 'gray'
  }
}

const getBarColor = (level: string, type: 'denied' | 'conditional') => {
  if (type === 'conditional') {
    return 'bg-yellow-600/70'
  }

  switch (level) {
    case 'critical': return 'bg-red-600'
    case 'high': return 'bg-orange-600'
    case 'medium': return 'bg-yellow-600'
    case 'low': return 'bg-blue-600'
    default: return 'bg-gray-600'
  }
}

const calculateBarWidth = (restricted: number, conditional: number) => {
  const total = restricted + conditional
  if (total === 0) return 0

  // Calculate percentage, but cap at 70% to leave room for conditional bar
  const percentage = (restricted / total) * 100
  return Math.min(percentage, 70)
}

const calculateConditionalWidth = (restricted: number, conditional: number) => {
  const total = restricted + conditional
  if (total === 0) return 0

  return (conditional / total) * 100
}

const getImpactDescription = (level: string, restricted: number, conditional: number) => {
  const totalAffected = restricted + conditional

  switch (level) {
    case 'critical':
      return `Severely restricted - ${totalAffected} actions affected. Immediate review recommended.`
    case 'high':
      return `Highly restricted - ${totalAffected} actions affected. May impact daily operations.`
    case 'medium':
      return `Moderately restricted - ${totalAffected} actions affected. Review recommended.`
    case 'low':
      return `Lightly restricted - ${totalAffected} actions affected. Minimal impact expected.`
    default:
      return `${totalAffected} actions affected by policies.`
  }
}
</script>
