<template>
  <UDropdown
    :items="dropdownItems"
    :popper="{ placement: 'bottom-end' }"
  >
    <UButton
      color="gray"
      variant="ghost"
      icon="i-heroicons-bookmark"
      trailing-icon="i-heroicons-chevron-down"
      size="xs"
    >
      {{ activePresetName || 'Presets' }}
    </UButton>
  </UDropdown>

  <!-- Save / Rename Preset Modal -->
  <UModal v-model="showSaveModal" :ui="{ width: 'sm:max-w-sm' }">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ editingPresetId ? 'Rename Preset' : 'Save Preset' }}
          </h3>
          <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" size="sm" @click="showSaveModal = false" />
        </div>
      </template>

      <div class="space-y-3">
        <UFormGroup label="Preset Name">
          <UInput
            v-model="presetName"
            placeholder="e.g., Production Accounts - Monthly"
            autofocus
            @keyup.enter="confirmSave"
          />
        </UFormGroup>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="gray" variant="ghost" @click="showSaveModal = false">Cancel</UButton>
          <UButton color="blue" :disabled="!presetName.trim()" @click="confirmSave">
            {{ editingPresetId ? 'Rename' : 'Save' }}
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>

  <!-- Delete Confirmation Modal -->
  <UModal v-model="showDeleteModal" :ui="{ width: 'sm:max-w-sm' }">
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Delete Preset</h3>
      </template>

      <p class="text-sm text-gray-700 dark:text-gray-300">
        Are you sure you want to delete <strong>{{ deletingPresetName }}</strong>?
      </p>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="gray" variant="ghost" @click="showDeleteModal = false">Cancel</UButton>
          <UButton color="red" @click="confirmDelete">Delete</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import type { CostTagCreatorView } from '~/utils/cost-tag-workspace'

interface CostFilterPreset {
  id: string
  name: string
  selectedAccounts: string[]
  timeframe: string
  dataMode: string
  viewBy: string
  activeTab: string
  chartTab?: string
  tag?: string | null
  tagView?: CostTagCreatorView
  createdAt: string
}

const props = defineProps<{
  selectedAccounts: string[]
  timeframe: string
  dataMode: string
  viewBy: string
  activeTab: string
  chartTab: string
  tag?: string | null
  tagView: CostTagCreatorView
}>()

const emit = defineEmits<{
  (e: 'load', preset: {
    selectedAccounts: string[]
    timeframe: string
    dataMode: string
    viewBy: string
    activeTab: string
    chartTab?: string
    tag?: string | null
    tagView?: CostTagCreatorView
  }): void
}>()

const PRESETS_KEY = 'costFilterPresets'
const { getPreference, setPreference } = useUserPreferences()
const toast = useToast()

// Modal state
const showSaveModal = ref(false)
const showDeleteModal = ref(false)
const presetName = ref('')
const editingPresetId = ref<string | null>(null)
const deletingPresetId = ref<string | null>(null)
const deletingPresetName = ref('')
const activePresetName = ref('')

// Load presets from user preferences
const presets = computed<CostFilterPreset[]>(() => {
  return getPreference<CostFilterPreset[]>(PRESETS_KEY, [])
})

// Build dropdown items
const dropdownItems = computed(() => {
  const items: any[][] = []

  // Saved presets - each with load, rename, delete actions
  if (presets.value.length > 0) {
    const presetItems = []
    for (const preset of presets.value) {
      presetItems.push({
        label: preset.name,
        icon: 'i-heroicons-bookmark-solid',
        click: () => loadPreset(preset)
      })
    }
    items.push(presetItems)

    // Per-preset management actions
    const mgmtItems = []
    for (const preset of presets.value) {
      mgmtItems.push({
        label: `Rename "${preset.name}"`,
        icon: 'i-heroicons-pencil-square',
        click: () => {
          editingPresetId.value = preset.id
          presetName.value = preset.name
          showSaveModal.value = true
        }
      })
      mgmtItems.push({
        label: `Delete "${preset.name}"`,
        icon: 'i-heroicons-trash',
        click: () => {
          deletingPresetId.value = preset.id
          deletingPresetName.value = preset.name
          showDeleteModal.value = true
        }
      })
    }
    items.push(mgmtItems)
  }

  // Save current view action
  items.push([
    {
      label: 'Save Current View as Preset',
      icon: 'i-heroicons-plus-circle',
      click: () => {
        editingPresetId.value = null
        presetName.value = ''
        showSaveModal.value = true
      }
    }
  ])

  return items
})

async function confirmSave() {
  const name = presetName.value.trim()
  if (!name) return

  const current = [...presets.value]

  if (editingPresetId.value) {
    const idx = current.findIndex(p => p.id === editingPresetId.value)
    const existing = current[idx]
    if (existing) {
      current[idx] = { ...existing, name }
      if (activePresetName.value === existing.name) {
        activePresetName.value = name
      }
    }
  } else {
    const newPreset: CostFilterPreset = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      selectedAccounts: [...props.selectedAccounts],
      timeframe: props.timeframe,
      dataMode: props.dataMode,
      viewBy: props.viewBy,
      activeTab: props.activeTab,
      chartTab: props.chartTab,
      tag: props.chartTab === 'tags' ? props.tag : undefined,
      tagView: props.chartTab === 'tags' ? props.tagView : undefined,
      createdAt: new Date().toISOString()
    }
    current.push(newPreset)
    activePresetName.value = name
  }

  await setPreference(PRESETS_KEY, current)
  showSaveModal.value = false

  toast.add({
    title: editingPresetId.value ? 'Preset Renamed' : 'Preset Saved',
    icon: 'i-heroicons-check-circle',
    color: 'green'
  })
}

async function confirmDelete() {
  if (!deletingPresetId.value) return

  const updated = presets.value.filter(p => p.id !== deletingPresetId.value)
  await setPreference(PRESETS_KEY, updated)

  if (activePresetName.value === deletingPresetName.value) {
    activePresetName.value = ''
  }

  showDeleteModal.value = false
  deletingPresetId.value = null

  toast.add({
    title: 'Preset Deleted',
    icon: 'i-heroicons-check-circle',
    color: 'green'
  })
}

function loadPreset(preset: CostFilterPreset) {
  activePresetName.value = preset.name
  emit('load', {
    selectedAccounts: preset.selectedAccounts,
    timeframe: preset.timeframe,
    dataMode: preset.dataMode,
    viewBy: preset.viewBy,
    activeTab: preset.activeTab,
    chartTab: preset.chartTab,
    tag: preset.tag,
    tagView: preset.tagView
  })

  toast.add({
    title: `Loaded "${preset.name}"`,
    icon: 'i-heroicons-bookmark',
    color: 'blue'
  })
}
</script>
