<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-transform duration-300 ease-out"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-200 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <div
        v-if="isOpen"
        ref="panelEl"
        class="fixed inset-y-0 right-0 z-40 w-screen max-w-sm bg-white dark:bg-gray-900 shadow-xl border-l border-gray-200 dark:border-gray-700 flex flex-col"
      >
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-cog-6-tooth" class="w-5 h-5 text-gray-500" />
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Customize Dashboard</h2>
        </div>
        <UButton icon="i-heroicons-x-mark" size="xs" variant="ghost" color="gray" @click="isOpen = false" />
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-4 space-y-6">
        <!-- Sections -->
        <div>
          <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Sections</h3>
          <div ref="sortableEl" class="space-y-1 select-none">
            <div
              v-for="section in visibleLocalSections"
              :key="section.id"
              class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors select-none"
            >
              <!-- Drag handle -->
              <UIcon
                name="i-heroicons-bars-3"
                class="drag-handle w-4 h-4 text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0"
              />

              <!-- Section label -->
              <span class="flex-1 text-sm text-gray-700 dark:text-gray-300">
                {{ SECTION_LABELS[section.id] }}
                <UBadge v-if="section.id === 'adminOverview' || section.id === 'adminAlerts' || section.id === 'adminPipeline' || section.id === 'adminFeedback'" color="amber" variant="soft" size="xs" class="ml-1">Admin</UBadge>
              </span>

              <!-- Style picker: shown only when the section supports more than one style -->
              <div v-if="SECTION_STYLE_SUPPORT[section.id].length > 1" class="flex items-center gap-0.5">
                <button
                  v-for="style in SECTION_STYLE_SUPPORT[section.id]"
                  :key="style"
                  type="button"
                  :title="styleLabel(style)"
                  class="p-1 rounded transition-colors"
                  :class="
                    (section.displayStyle || 'full') === style
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                  "
                  @click="setSectionStyle(section.id, style)"
                >
                  <UIcon :name="styleIcon(style)" class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- Visibility toggle -->
              <UToggle
                :model-value="section.visible"
                size="sm"
                @update:model-value="toggleSection(section.id)"
              />
            </div>
          </div>
        </div>

        <!-- Metric Cards sub-section -->
        <div v-if="isSectionVisible('metricCards')">
          <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Metric Cards</h3>
          <div class="space-y-1">
            <div
              v-for="cardId in ALL_METRIC_CARD_IDS"
              :key="cardId"
              class="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <span class="text-sm text-gray-700 dark:text-gray-300">{{ METRIC_CARD_LABELS[cardId] }}</span>
              <UToggle
                :model-value="isMetricCardVisible(cardId)"
                size="sm"
                @update:model-value="toggleMetricCard(cardId)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
        <!-- Org default match indicator -->
        <div v-if="isAdmin && matchesOrgDefault === true" class="flex items-center justify-center gap-1.5 py-1">
          <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500" />
          <span class="text-xs text-green-600 dark:text-green-400 font-medium">Matches org default</span>
        </div>
        <div v-else-if="isAdmin && matchesOrgDefault === false" class="flex items-center justify-center gap-1.5 py-1">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-amber-500" />
          <span class="text-xs text-amber-600 dark:text-amber-400 font-medium">Modified from default</span>
        </div>
        <UButton
          v-if="isAdmin"
          label="Set as Org Default"
          variant="soft"
          color="primary"
          size="sm"
          icon="i-heroicons-arrow-up-tray"
          block
          :loading="exportLoading"
          @click="handleExportDefault"
        />
        <UButton
          label="Reset to Default"
          variant="ghost"
          color="gray"
          size="sm"
          icon="i-heroicons-arrow-path"
          block
          @click="resetLayout"
        />
      </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useSortable } from '@vueuse/integrations/useSortable'
import { onClickOutside } from '@vueuse/core'
import {
  SECTION_LABELS,
  METRIC_CARD_LABELS,
  ALL_METRIC_CARD_IDS,
  SECTION_STYLE_SUPPORT,
  type DisplayStyle,
  type DashboardSectionConfig,
} from '#shared/types/dashboard-layout'

const isOpen = defineModel<boolean>({ required: true })

const panelEl = ref<HTMLElement | null>(null)
onClickOutside(panelEl, () => { isOpen.value = false })

const { isAdmin } = useUserRoles()

const {
  layout,
  matchesOrgDefault,
  isSectionVisible,
  isMetricCardVisible,
  toggleSection,
  toggleMetricCard,
  setSectionStyle,
  reorderSections,
  resetLayout,
  exportAsDefault,
} = useDashboardLayout()

const ADMIN_SECTION_IDS = new Set(['adminOverview', 'adminAlerts', 'adminPipeline', 'adminFeedback'])

// Local copy of sections kept in sync with layout so sortable can mutate it
// without waiting for the async persist round-trip
const localSections = ref<DashboardSectionConfig[]>([])
const skipSync = ref(false)

// Hide admin sections from non-admin users
const visibleLocalSections = computed(() =>
  isAdmin.value ? localSections.value : localSections.value.filter(s => !ADMIN_SECTION_IDS.has(s.id))
)

watch(
  () => layout.value.sections,
  (sections) => {
    if (!skipSync.value) {
      localSections.value = [...sections]
    }
  },
  { immediate: true, deep: true },
)

const sortableEl = ref<HTMLElement | null>(null)

// Override onUpdate to do a synchronous array splice + persist.
// The default onUpdate uses nextTick which causes a race with onEnd,
// resulting in incomplete array state being persisted and items snapping back.
const { start, stop } = useSortable(sortableEl, localSections, {
  handle: '.drag-handle',
  animation: 150,
  ghostClass: 'opacity-30',
  onUpdate(evt) {
    if (evt.oldIndex == null || evt.newIndex == null) return

    // DOM indices correspond to visibleLocalSections, not the full localSections array
    const visible = [...visibleLocalSections.value]
    const [moved] = visible.splice(evt.oldIndex, 1)
    visible.splice(evt.newIndex, 0, moved)

    if (isAdmin.value) {
      localSections.value = visible
    } else {
      // Merge reordered visible sections with hidden admin sections
      const adminSections = localSections.value.filter(s => ADMIN_SECTION_IDS.has(s.id))
      const result: DashboardSectionConfig[] = [...visible]
      for (const admin of adminSections) {
        const origIdx = localSections.value.indexOf(admin)
        result.splice(Math.min(origIdx, result.length), 0, admin)
      }
      localSections.value = result
    }

    // Prevent the layout watcher from resetting localSections during persist
    skipSync.value = true
    reorderSections(localSections.value)
    nextTick(() => { skipSync.value = false })
  },
})

// The panel conditionally renders via v-if, so the DOM element doesn't exist
// until opened. Re-init sortable on each open so it binds to the fresh DOM element.
watch(isOpen, (open) => {
  if (open) {
    nextTick(() => {
      stop()
      start()
    })
  }
})

const exportLoading = ref(false)
const toast = useToast()

async function handleExportDefault() {
  exportLoading.value = true
  try {
    const result = await exportAsDefault()
    if (result.verified) {
      toast.add({ title: 'Layout saved and verified as org default', color: 'green', icon: 'i-heroicons-check-circle' })
    } else {
      toast.add({ title: 'Layout saved but verification failed', description: 'The stored default may differ. Try refreshing.', color: 'amber', icon: 'i-heroicons-exclamation-triangle' })
    }
  } catch (e: any) {
    toast.add({ title: 'Failed to save default layout', description: e.message, color: 'red', icon: 'i-heroicons-x-circle' })
  } finally {
    exportLoading.value = false
  }
}

// Returns the heroicon name for each display style
function styleIcon(style: DisplayStyle): string {
  if (style === 'full') return 'i-heroicons-rectangle-group'
  if (style === 'two-thirds') return 'i-heroicons-rectangle-stack'
  if (style === 'half') return 'i-heroicons-squares-2x2'
  return 'i-heroicons-minus'
}

function styleLabel(style: DisplayStyle): string {
  if (style === 'full') return 'Full'
  if (style === 'two-thirds') return '2/3'
  if (style === 'half') return '1/2'
  return '1/3'
}
</script>
