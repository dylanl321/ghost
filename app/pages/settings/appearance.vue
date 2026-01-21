<template>
  <div>
    <!-- Page Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Appearance</h1>
      <p class="mt-1 text-gray-500 dark:text-gray-400">
        Customize the look and feel of your dashboard.
      </p>
    </div>

    <div class="space-y-6">
      <!-- Theme Section -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
              <UIcon name="i-heroicons-paint-brush" class="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Theme</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Choose your preferred color scheme
              </p>
            </div>
          </div>
        </template>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Light Theme -->
          <button
            @click="setTheme('light')"
            class="relative p-4 rounded-lg border-2 transition-all"
            :class="[
              currentTheme === 'light'
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
            ]"
          >
            <div class="flex flex-col items-center gap-3">
              <div class="w-16 h-12 rounded bg-white border border-gray-200 flex items-center justify-center">
                <UIcon name="i-heroicons-sun" class="w-6 h-6 text-amber-500" />
              </div>
              <span class="font-medium text-gray-900 dark:text-white">Light</span>
            </div>
            <div v-if="currentTheme === 'light'" class="absolute top-2 right-2">
              <UIcon name="i-heroicons-check-circle-solid" class="w-5 h-5 text-emerald-500" />
            </div>
          </button>

          <!-- Dark Theme -->
          <button
            @click="setTheme('dark')"
            class="relative p-4 rounded-lg border-2 transition-all"
            :class="[
              currentTheme === 'dark'
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
            ]"
          >
            <div class="flex flex-col items-center gap-3">
              <div class="w-16 h-12 rounded bg-slate-800 border border-slate-700 flex items-center justify-center">
                <UIcon name="i-heroicons-moon" class="w-6 h-6 text-blue-400" />
              </div>
              <span class="font-medium text-gray-900 dark:text-white">Dark</span>
            </div>
            <div v-if="currentTheme === 'dark'" class="absolute top-2 right-2">
              <UIcon name="i-heroicons-check-circle-solid" class="w-5 h-5 text-emerald-500" />
            </div>
          </button>

          <!-- System Theme -->
          <button
            @click="setTheme('system')"
            class="relative p-4 rounded-lg border-2 transition-all"
            :class="[
              currentTheme === 'system'
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
            ]"
          >
            <div class="flex flex-col items-center gap-3">
              <div class="w-16 h-12 rounded bg-gradient-to-r from-white to-slate-800 border border-gray-300 flex items-center justify-center">
                <UIcon name="i-heroicons-computer-desktop" class="w-6 h-6 text-gray-600" />
              </div>
              <span class="font-medium text-gray-900 dark:text-white">System</span>
            </div>
            <div v-if="currentTheme === 'system'" class="absolute top-2 right-2">
              <UIcon name="i-heroicons-check-circle-solid" class="w-5 h-5 text-emerald-500" />
            </div>
          </button>
        </div>
      </UCard>

      <!-- Sidebar Section -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <UIcon name="i-heroicons-bars-3" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Sidebar</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Customize the navigation sidebar behavior
              </p>
            </div>
          </div>
        </template>

        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-gray-900 dark:text-white">Default Collapsed</div>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Start with the sidebar collapsed on page load
              </p>
            </div>
            <UToggle v-model="sidebarCollapsed" @change="saveSidebarPreference" />
          </div>

          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-gray-900 dark:text-white">Hover to Expand</div>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Expand sidebar when hovering over it
              </p>
            </div>
            <UToggle v-model="hoverExpand" @change="saveSidebarPreference" />
          </div>
        </div>
      </UCard>

      <!-- Display Density Section -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <UIcon name="i-heroicons-adjustments-vertical" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Display Density</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Adjust the spacing and density of the interface
              </p>
            </div>
          </div>
        </template>

        <div class="space-y-4">
          <div class="grid grid-cols-3 gap-3">
            <button
              v-for="option in densityOptions"
              :key="option.value"
              @click="setDensity(option.value)"
              class="p-3 rounded-lg border-2 text-center transition-all"
              :class="[
                density === option.value
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
              ]"
            >
              <UIcon :name="option.icon" class="w-5 h-5 mx-auto mb-1 text-gray-600 dark:text-gray-400" />
              <span class="text-sm font-medium text-gray-900 dark:text-white">{{ option.label }}</span>
            </button>
          </div>
        </div>
      </UCard>

      <!-- Table Settings Section -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <UIcon name="i-heroicons-table-cells" class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Tables</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Customize table display options
              </p>
            </div>
          </div>
        </template>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Default Page Size
            </label>
            <USelectMenu
              v-model="tablePageSize"
              :options="pageSizeOptions"
              @change="saveTablePreference"
            />
          </div>

          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-gray-900 dark:text-white">Striped Rows</div>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Alternate row colors for easier reading
              </p>
            </div>
            <UToggle v-model="stripedTables" @change="saveTablePreference" />
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'settings'
})

const toast = useToast()
const colorMode = useColorMode()
const { setPreference, getPreference } = useUserPreferences()

// Theme
const currentTheme = ref('system')

onMounted(() => {
  currentTheme.value = getPreference('theme', colorMode.preference)
})

function setTheme(theme: string) {
  currentTheme.value = theme
  colorMode.preference = theme
  setPreference('theme', theme)
  toast.add({
    title: 'Theme Updated',
    description: `Theme set to ${theme}`,
    color: 'green',
    icon: 'i-heroicons-check-circle'
  })
}

// Sidebar preferences
const sidebarCollapsed = ref(false)
const hoverExpand = ref(true)

onMounted(() => {
  sidebarCollapsed.value = getPreference('sidebarCollapsed', false)
  hoverExpand.value = getPreference('hoverExpand', true)
})

function saveSidebarPreference() {
  setPreference('sidebarCollapsed', sidebarCollapsed.value)
  setPreference('hoverExpand', hoverExpand.value)
  toast.add({
    title: 'Sidebar Settings Saved',
    color: 'green',
    icon: 'i-heroicons-check-circle'
  })
}

// Display density
const density = ref('comfortable')
const densityOptions = [
  { value: 'compact', label: 'Compact', icon: 'i-heroicons-arrows-pointing-in' },
  { value: 'comfortable', label: 'Comfortable', icon: 'i-heroicons-minus' },
  { value: 'spacious', label: 'Spacious', icon: 'i-heroicons-arrows-pointing-out' }
]

onMounted(() => {
  density.value = getPreference('density', 'comfortable')
})

function setDensity(value: string) {
  density.value = value
  setPreference('density', value)
  toast.add({
    title: 'Display Density Updated',
    color: 'green',
    icon: 'i-heroicons-check-circle'
  })
}

// Table settings
const tablePageSize = ref(25)
const stripedTables = ref(true)
const pageSizeOptions = [10, 25, 50, 100]

onMounted(() => {
  tablePageSize.value = getPreference('tablePageSize', 25)
  stripedTables.value = getPreference('stripedTables', true)
})

function saveTablePreference() {
  setPreference('tablePageSize', tablePageSize.value)
  setPreference('stripedTables', stripedTables.value)
  toast.add({
    title: 'Table Settings Saved',
    color: 'green',
    icon: 'i-heroicons-check-circle'
  })
}
</script>
