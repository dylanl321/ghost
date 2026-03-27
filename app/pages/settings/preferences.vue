<template>
  <div>
    <!-- Page Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Preferences</h1>
      <p class="mt-1 text-gray-500 dark:text-gray-400">
        Configure your timezone and default application behaviors.
      </p>
    </div>

    <!-- Loading State -->
    <div v-if="userPrefsLoading" class="flex items-center justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400" />
    </div>

    <!-- Settings Content -->
    <div v-else class="space-y-6">
      <!-- Timezone Section -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <UIcon name="i-heroicons-clock" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Timezone</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                All times in the application are displayed in your selected timezone
              </p>
            </div>
          </div>
        </template>

        <div class="space-y-6">
          <!-- Current Timezone Display -->
          <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
            <div>
              <div class="text-sm font-medium text-gray-500 dark:text-gray-400">Current Timezone</div>
              <div class="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                {{ formatTimezone(userTimezone) }}
              </div>
            </div>
            <UBadge color="emerald" variant="soft" size="lg">
              {{ userTimezone }}
            </UBadge>
          </div>

          <!-- Browser Timezone Detection -->
          <div v-if="browserTimezone !== userTimezone" class="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <div class="flex items-center gap-3">
              <UIcon name="i-heroicons-globe-alt" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <div>
                <div class="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Browser timezone detected
                </div>
                <div class="text-sm text-amber-600 dark:text-amber-400">
                  {{ formatTimezone(browserTimezone) }}
                </div>
              </div>
            </div>
            <UButton
              color="amber"
              variant="soft"
              size="sm"
              :loading="updatingTimezone"
              @click="useBrowserTimezone"
            >
              Use this timezone
            </UButton>
          </div>

          <!-- Timezone Selector -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Timezone
            </label>
            <div class="flex gap-3">
              <USelectMenu
                v-model="selectedTimezone"
                :options="timezoneOptions"
                option-attribute="label"
                value-attribute="value"
                searchable
                searchable-placeholder="Search timezones..."
                class="flex-1"
                size="lg"
              >
                <template #option="{ option }">
                  <div class="flex items-center justify-between w-full">
                    <span>{{ option.label }}</span>
                    <span class="text-gray-400 text-sm">{{ option.offset }}</span>
                  </div>
                </template>
              </USelectMenu>
              <UButton
                color="emerald"
                size="lg"
                :loading="updatingTimezone"
                :disabled="selectedTimezone === userTimezone"
                @click="saveTimezone"
              >
                Save
              </UButton>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Date & Time Format Section -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
              <UIcon name="i-heroicons-calendar" class="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Date & Time Format</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Choose how dates and times are displayed
              </p>
            </div>
          </div>
        </template>

        <div class="space-y-4">
          <!-- Date Format -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Date Format
            </label>
            <USelectMenu
              v-model="dateFormat"
              :options="dateFormatOptions"
              option-attribute="label"
              value-attribute="value"
              size="lg"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Preview: {{ dateFormatPreview }}
            </p>
          </div>

          <!-- Time Format -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Time Format
            </label>
            <div class="flex gap-4">
              <URadio
                v-model="timeFormat"
                value="12h"
                label="12-hour (3:30 PM)"
              />
              <URadio
                v-model="timeFormat"
                value="24h"
                label="24-hour (15:30)"
              />
            </div>
          </div>

          <div class="pt-4 border-t border-gray-200 dark:border-slate-700">
            <UButton
              color="emerald"
              :loading="savingFormats"
              @click="saveFormats"
            >
              Save Date & Time Settings
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Notifications Section -->
      <NuxtLink to="/settings/notifications">
        <UCard class="hover:shadow-lg transition-shadow cursor-pointer group">
          <div class="flex items-center gap-4">
            <div class="p-3 rounded-lg bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 group-hover:scale-110 transition-transform">
              <UIcon name="i-heroicons-bell" class="w-6 h-6" />
            </div>
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                Notification Settings
              </h3>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Manage notification delivery, email digest, mute, and category preferences.
              </p>
            </div>
            <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-gray-400" />
          </div>
        </UCard>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { COMMON_TIMEZONES, formatTimezone } from '#shared/types/user-preferences'

definePageMeta({
  layout: 'settings'
})

const toast = useToast()

const {
  timezone: userTimezone,
  browserTimezone,
  loading: userPrefsLoading,
  updateTimezone: updateUserTimezone,
  setPreference,
  getPreference
} = useUserPreferences()

// Timezone state
const selectedTimezone = ref('')
const updatingTimezone = ref(false)

const timezoneOptions = COMMON_TIMEZONES.map(tz => ({
  value: tz.value,
  label: tz.label,
  offset: tz.offset
}))

// Initialize selected timezone
watch(userTimezone, (newVal) => {
  if (newVal && !selectedTimezone.value) {
    selectedTimezone.value = newVal
  }
}, { immediate: true })

async function saveTimezone() {
  updatingTimezone.value = true
  try {
    const success = await updateUserTimezone(selectedTimezone.value)
    if (success) {
      toast.add({
        title: 'Timezone Updated',
        description: `Your timezone has been set to ${formatTimezone(selectedTimezone.value)}`,
        color: 'green',
        icon: 'i-heroicons-check-circle'
      })
    } else {
      toast.add({
        title: 'Update Failed',
        description: 'Failed to update timezone. Please try again.',
        color: 'red',
        icon: 'i-heroicons-x-circle'
      })
    }
  } finally {
    updatingTimezone.value = false
  }
}

async function useBrowserTimezone() {
  selectedTimezone.value = browserTimezone.value
  await saveTimezone()
}

// Date & Time Format
const dateFormat = ref('MM/DD/YYYY')
const timeFormat = ref('12h')
const savingFormats = ref(false)

const dateFormatOptions = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO)' }
]

const dateFormatPreview = computed(() => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const year = now.getFullYear()

  switch (dateFormat.value) {
    case 'MM/DD/YYYY': return `${month}/${day}/${year}`
    case 'DD/MM/YYYY': return `${day}/${month}/${year}`
    case 'YYYY-MM-DD': return `${year}-${month}-${day}`
    default: return `${month}/${day}/${year}`
  }
})

// Load saved formats
onMounted(() => {
  dateFormat.value = getPreference('dateFormat', 'MM/DD/YYYY')
  timeFormat.value = getPreference('timeFormat', '12h')
})

async function saveFormats() {
  savingFormats.value = true
  try {
    await setPreference('dateFormat', dateFormat.value)
    await setPreference('timeFormat', timeFormat.value)
    toast.add({
      title: 'Settings Saved',
      description: 'Your date and time preferences have been updated.',
      color: 'green',
      icon: 'i-heroicons-check-circle'
    })
  } finally {
    savingFormats.value = false
  }
}

</script>
