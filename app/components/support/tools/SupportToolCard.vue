<template>
  <UCard
    class="transition-all duration-200"
    :class="{
      'col-span-full': isExpanded,
      'hover:shadow-lg hover:ring-1 hover:ring-gray-200 dark:hover:ring-gray-700': !isExpanded,
      'ring-1 ring-primary-200 dark:ring-primary-800 shadow-lg': isExpanded
    }"
  >
    <div class="space-y-4">
      <!-- Card Header -->
      <div
        class="flex items-center justify-between cursor-pointer select-none"
        @click="$emit('toggle')"
      >
        <div class="flex items-center gap-3 min-w-0">
          <div class="p-2 rounded-lg shrink-0" :class="iconBgClass">
            <Icon :name="icon" class="w-6 h-6" :class="iconColorClass" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h3 class="font-semibold text-gray-900 dark:text-white">{{ title }}</h3>
              <span
                v-if="category"
                class="text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0"
                :class="categoryBadgeClass"
              >
                {{ category }}
              </span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{{ description }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 ml-3">
          <!-- Quick action hints when collapsed -->
          <slot v-if="!isExpanded" name="quick-hints" />
          <div
            class="p-1 rounded-md transition-colors"
            :class="isExpanded ? 'bg-primary-100 dark:bg-primary-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-800'"
          >
            <Icon
              :name="isExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
              class="w-5 h-5"
              :class="isExpanded ? 'text-primary-500' : 'text-gray-400'"
            />
          </div>
        </div>
      </div>

      <!-- Expanded Content -->
      <div v-if="isExpanded" class="border-t border-gray-200 dark:border-gray-700 pt-4">
        <!-- Tool Detail Description -->
        <p v-if="detailDescription" class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {{ detailDescription }}
        </p>
        <slot />
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
interface Props {
  title: string
  description: string
  detailDescription?: string
  icon: string
  color: string
  category?: string
  isExpanded: boolean
}

const props = defineProps<Props>()

defineEmits<{
  toggle: []
}>()

const colorMap: Record<string, { iconBg: string; iconColor: string }> = {
  blue: { iconBg: 'bg-blue-100 dark:bg-blue-900/30', iconColor: 'text-blue-600 dark:text-blue-400' },
  green: { iconBg: 'bg-green-100 dark:bg-green-900/30', iconColor: 'text-green-600 dark:text-green-400' },
  purple: { iconBg: 'bg-purple-100 dark:bg-purple-900/30', iconColor: 'text-purple-600 dark:text-purple-400' },
  orange: { iconBg: 'bg-orange-100 dark:bg-orange-900/30', iconColor: 'text-orange-600 dark:text-orange-400' },
  indigo: { iconBg: 'bg-indigo-100 dark:bg-indigo-900/30', iconColor: 'text-indigo-600 dark:text-indigo-400' },
  red: { iconBg: 'bg-red-100 dark:bg-red-900/30', iconColor: 'text-red-600 dark:text-red-400' },
  teal: { iconBg: 'bg-teal-100 dark:bg-teal-900/30', iconColor: 'text-teal-600 dark:text-teal-400' },
  amber: { iconBg: 'bg-amber-100 dark:bg-amber-900/30', iconColor: 'text-amber-600 dark:text-amber-400' },
  violet: { iconBg: 'bg-violet-100 dark:bg-violet-900/30', iconColor: 'text-violet-600 dark:text-violet-400' },
  emerald: { iconBg: 'bg-emerald-100 dark:bg-emerald-900/30', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  cyan: { iconBg: 'bg-cyan-100 dark:bg-cyan-900/30', iconColor: 'text-cyan-600 dark:text-cyan-400' },
}

const categoryBadgeMap: Record<string, string> = {
  investigation: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  security: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  ai: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
  operations: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
}

const iconBgClass = computed(() => colorMap[props.color]?.iconBg || 'bg-blue-100 dark:bg-blue-900/30')
const iconColorClass = computed(() => colorMap[props.color]?.iconColor || 'text-blue-600 dark:text-blue-400')
const categoryBadgeClass = computed(() => categoryBadgeMap[props.category || ''] || categoryBadgeMap.investigation)
</script>
