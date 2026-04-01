<template>
  <UModal v-model="modelValue" :ui="{ width: 'sm:max-w-2xl' }">
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
          Edit User Preferences
        </h3>
      </template>

      <div v-if="prefs" class="space-y-5">
        <!-- User -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">User</label>
          <div class="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-md">
            <UserAvatar :email="prefs.userId" size="sm" />
            <span class="text-sm text-gray-900 dark:text-white">{{ prefs.userId }}</span>
          </div>
        </div>

        <!-- Timezone -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Timezone</label>
          <USelect
            v-model="editTimezone"
            :options="commonTimezones"
            option-attribute="label"
            value-attribute="value"
            size="lg"
          />
        </div>

        <!-- Favorite Accounts -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Favorite Accounts</label>
          <UTextarea
            v-model="editFavorites"
            :rows="4"
            placeholder="Enter account IDs, one per line"
            class="font-mono text-sm"
          />
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {{ editFavorites.split('\n').filter((l: string) => l.trim()).length }} accounts
          </p>
        </div>

        <!-- Onboarding & Tours -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Onboarding & Tours</label>
          <div class="space-y-3 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <!-- Welcome Banner -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon name="i-heroicons-sparkles" class="w-4 h-4 text-amber-500" />
                <span class="text-sm text-gray-700 dark:text-gray-300">Welcome Banner</span>
                <UBadge
                  :color="bannerDismissed ? 'gray' : 'green'"
                  variant="soft"
                  size="xs"
                >
                  {{ bannerDismissed ? 'Dismissed' : 'Active' }}
                </UBadge>
              </div>
              <UButton
                v-if="bannerDismissed"
                size="xs"
                color="blue"
                variant="soft"
                @click="resetBanner"
              >
                Re-enable
              </UButton>
            </div>

            <!-- Cost Tour -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon name="i-heroicons-currency-dollar" class="w-4 h-4 text-green-500" />
                <span class="text-sm text-gray-700 dark:text-gray-300">Cost Dashboard Tour</span>
                <UBadge
                  :color="costTourCompleted ? 'green' : 'yellow'"
                  variant="soft"
                  size="xs"
                >
                  {{ costTourCompleted ? 'Completed' : `Step ${costTourStep}` }}
                </UBadge>
              </div>
              <UButton
                size="xs"
                color="blue"
                variant="soft"
                @click="resetCostTour"
              >
                Reset
              </UButton>
            </div>

            <!-- Account Tour -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon name="i-heroicons-building-office" class="w-4 h-4 text-blue-500" />
                <span class="text-sm text-gray-700 dark:text-gray-300">Account Details Tour</span>
                <UBadge
                  :color="accountTourCompleted ? 'green' : 'yellow'"
                  variant="soft"
                  size="xs"
                >
                  {{ accountTourCompleted ? 'Completed' : `Step ${accountTourStep}` }}
                </UBadge>
              </div>
              <UButton
                size="xs"
                color="blue"
                variant="soft"
                @click="resetAccountTour"
              >
                Reset
              </UButton>
            </div>
          </div>
        </div>

        <!-- Dashboard Layout Summary -->
        <div v-if="prefs.preferences?.dashboardLayout">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Dashboard Layout</label>
          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Hidden sections</span>
              <UBadge color="gray" variant="soft" size="xs">{{ hiddenSectionsCount }}</UBadge>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Disabled metric cards</span>
              <UBadge color="gray" variant="soft" size="xs">{{ disabledMetricsCount }}</UBadge>
            </div>
            <div class="pt-2 border-t border-gray-200 dark:border-gray-700">
              <UButton size="xs" color="gray" variant="soft" @click="resetLayout">
                Reset to Default Layout
              </UButton>
            </div>
          </div>
        </div>

        <!-- Advanced JSON (collapsible) -->
        <UAccordion :items="[{ label: 'Advanced: Raw JSON Editor', slot: 'json-editor' }]" :ui="{ wrapper: 'border border-gray-200 dark:border-gray-700 rounded-lg' }">
          <template #json-editor>
            <div class="p-4 space-y-2">
              <UAlert
                color="amber"
                variant="subtle"
                icon="i-heroicons-exclamation-triangle"
                title="Editing raw JSON will replace all structured fields above when saved."
                :ui="{ title: 'text-xs' }"
              />
              <UTextarea
                v-model="editJson"
                :rows="10"
                class="font-mono text-xs"
                @update:model-value="jsonEdited = true"
              />
            </div>
          </template>
        </UAccordion>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="gray" variant="ghost" @click="modelValue = false">Cancel</UButton>
          <UButton color="blue" :loading="saving" @click="handleSave">Save Changes</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import type { UserPreferences } from '#shared/types/user-preferences'
import { COMMON_TIMEZONES } from '#shared/types/user-preferences'
import { ALL_METRIC_CARD_IDS } from '#shared/types/dashboard-layout'

const props = defineProps<{
  prefs: UserPreferences | null
}>()

const modelValue = defineModel<boolean>({ required: true })
const emit = defineEmits<{ saved: [] }>()

const { patchUserPreferences } = useAdminUserDetail()
const toast = useToast()
const commonTimezones = COMMON_TIMEZONES
const saving = ref(false)
const jsonEdited = ref(false)

// Form state
const editTimezone = ref('')
const editFavorites = ref('')
const editJson = ref('')

// Derived onboarding state
const bannerDismissed = ref(false)
const costTourCompleted = ref(false)
const costTourStep = ref(0)
const accountTourCompleted = ref(false)
const accountTourStep = ref(0)
const hiddenSectionsCount = ref(0)
const disabledMetricsCount = ref(0)

// Track resets made in this edit session
const pendingResets = ref<Record<string, any>>({})

// Populate form when prefs change
watch(() => props.prefs, (p) => {
  if (!p) return
  editTimezone.value = p.timezone
  editFavorites.value = (p.preferences?.favoriteAccounts || []).join('\n')
  editJson.value = JSON.stringify(p.preferences || {}, null, 2)
  jsonEdited.value = false
  pendingResets.value = {}

  // Onboarding
  bannerDismissed.value = p.preferences?.welcomeBanner?.dismissed ?? false
  costTourCompleted.value = p.preferences?.costTour?.completed ?? false
  costTourStep.value = p.preferences?.costTour?.lastStep ?? 0
  accountTourCompleted.value = p.preferences?.accountTour?.completed ?? false
  accountTourStep.value = p.preferences?.accountTour?.lastStep ?? 0

  // Layout
  const layout = p.preferences?.dashboardLayout
  if (layout) {
    hiddenSectionsCount.value = (layout.sections || []).filter((s: any) => !s.visible).length
    disabledMetricsCount.value = ALL_METRIC_CARD_IDS.filter(id => layout.metricCards?.[id] === false).length
  } else {
    hiddenSectionsCount.value = 0
    disabledMetricsCount.value = 0
  }
}, { immediate: true })

function resetBanner() {
  bannerDismissed.value = false
  pendingResets.value.welcomeBanner = {
    dismissed: false,
    seenCount: 0,
    clicked: false,
    resetByAdminAt: new Date().toISOString()
  }
}

function resetCostTour() {
  costTourCompleted.value = false
  costTourStep.value = 0
  pendingResets.value.costTour = {
    completed: false,
    lastStep: 0,
    resetByAdminAt: new Date().toISOString()
  }
}

function resetAccountTour() {
  accountTourCompleted.value = false
  accountTourStep.value = 0
  pendingResets.value.accountTour = {
    completed: false,
    lastStep: 0,
    resetByAdminAt: new Date().toISOString()
  }
}

function resetLayout() {
  pendingResets.value.dashboardLayout = undefined
  hiddenSectionsCount.value = 0
  disabledMetricsCount.value = 0
}

async function handleSave() {
  if (!props.prefs) return
  saving.value = true

  try {
    let preferences: Record<string, any>

    if (jsonEdited.value) {
      // If user edited raw JSON, use that directly
      try {
        preferences = JSON.parse(editJson.value || '{}')
      } catch {
        toast.add({ title: 'Invalid JSON', description: 'Custom preferences must be valid JSON', color: 'red', icon: 'i-heroicons-exclamation-triangle' })
        saving.value = false
        return
      }
    } else {
      // Build from structured fields
      preferences = { ...(props.prefs.preferences || {}) }

      // Apply favorites
      const favoritesList = editFavorites.value.split('\n').map(l => l.trim()).filter(l => l.length > 0)
      preferences.favoriteAccounts = favoritesList

      // Apply pending resets
      for (const [key, value] of Object.entries(pendingResets.value)) {
        if (value === undefined) {
          delete preferences[key]
        } else {
          preferences[key] = value
        }
      }
    }

    await patchUserPreferences(props.prefs.userId, {
      timezone: editTimezone.value,
      preferences
    })

    toast.add({
      title: 'Preferences Updated',
      description: `Preferences updated for ${props.prefs.userId}`,
      color: 'green',
      icon: 'i-heroicons-check-circle'
    })

    modelValue.value = false
    emit('saved')
  } catch (err: any) {
    toast.add({
      title: 'Update Failed',
      description: err.message || 'Failed to update preferences',
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  } finally {
    saving.value = false
  }
}
</script>
