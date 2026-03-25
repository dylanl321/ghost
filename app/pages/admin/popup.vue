<template>
  <div class="container mx-auto px-6 py-8 max-w-4xl">
    <!-- Header -->
    <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/admin')" class="mb-4">
      Back to Dashboard
    </UButton>
    <div class="flex items-center gap-3 mb-2">
      <div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
        <UIcon name="i-heroicons-chat-bubble-bottom-center-text" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
      </div>
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Popup Message</h1>
    </div>
    <p class="text-gray-600 dark:text-gray-400 mb-8">
      Configure a popup message that appears when users load the app. Users can dismiss it once; changing the Message ID re-shows it to everyone.
    </p>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400" />
    </div>

    <div v-else class="space-y-6">
      <!-- Enable Toggle -->
      <UCard>
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900 dark:text-white">Enable Popup</div>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              When disabled, users see the version changelog "What's New" popup instead.
            </p>
          </div>
          <UToggle v-model="form.enabled" />
        </div>
      </UCard>

      <!-- Configuration (shown when enabled) -->
      <template v-if="form.enabled">
        <!-- Message ID -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-finger-print" class="w-4 h-4 text-gray-400" />
              <span class="text-sm font-semibold text-gray-900 dark:text-white">Message Identity</span>
            </div>
          </template>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message ID</label>
              <div class="flex gap-2">
                <UInput v-model="form.id" placeholder="e.g. march-2026-update" class="flex-1" />
                <UButton color="gray" variant="soft" size="sm" @click="generateId">
                  Generate
                </UButton>
              </div>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Changing this ID will re-show the popup to all users who dismissed a previous message.
              </p>
            </div>
          </div>
        </UCard>

        <!-- Content -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-document-text" class="w-4 h-4 text-gray-400" />
              <span class="text-sm font-semibold text-gray-900 dark:text-white">Content</span>
            </div>
          </template>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
              <UInput v-model="form.title" placeholder="e.g. Important Update" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Body</label>
              <UTextarea
                v-model="form.body"
                placeholder="Write your message here..."
                :rows="5"
                autoresize
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Plain text. Line breaks are preserved.
              </p>
            </div>
          </div>
        </UCard>

        <!-- Appearance -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-paint-brush" class="w-4 h-4 text-gray-400" />
              <span class="text-sm font-semibold text-gray-900 dark:text-white">Appearance</span>
            </div>
          </template>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Severity / Style</label>
              <div class="flex gap-3">
                <button
                  v-for="opt in severityOptions"
                  :key="opt.value"
                  class="flex items-center gap-2 px-4 py-2 rounded-lg border transition-all"
                  :class="form.severity === opt.value
                    ? `${opt.activeBg} ${opt.activeBorder} ${opt.activeText}`
                    : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'"
                  @click="form.severity = opt.value"
                >
                  <UIcon :name="opt.icon" class="w-4 h-4" />
                  <span class="text-sm font-medium">{{ opt.label }}</span>
                </button>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Call to Action -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-cursor-arrow-rays" class="w-4 h-4 text-gray-400" />
              <span class="text-sm font-semibold text-gray-900 dark:text-white">Call to Action (Optional)</span>
            </div>
          </template>
          <div class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Button Label</label>
                <UInput v-model="form.ctaLabel" placeholder="e.g. Learn More" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Button Link</label>
                <UInput v-model="form.ctaLink" placeholder="e.g. /changelog or https://..." />
              </div>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Leave both empty to show only the "Got it" dismiss button.
            </p>
          </div>
        </UCard>

        <!-- Preview -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-eye" class="w-4 h-4 text-gray-400" />
              <span class="text-sm font-semibold text-gray-900 dark:text-white">Preview</span>
            </div>
          </template>
          <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-800 p-6 space-y-4">
            <div class="flex items-center gap-3">
              <UIcon :name="previewIcon" class="h-6 w-6" :class="previewIconColor" />
              <h2 class="text-xl font-semibold text-gray-100">
                {{ form.title || 'Announcement' }}
              </h2>
            </div>
            <div v-if="form.body" class="text-sm text-gray-300 whitespace-pre-line leading-relaxed">{{ form.body }}</div>
            <div v-else class="text-sm text-gray-500 italic">No body text configured.</div>
            <div class="flex items-center justify-between pt-2">
              <span
                v-if="form.ctaLink && form.ctaLabel"
                class="inline-flex items-center gap-1 text-sm font-medium"
                :class="previewLinkColor"
              >
                {{ form.ctaLabel }}
                <UIcon name="i-heroicons-arrow-right-20-solid" class="h-4 w-4" />
              </span>
              <span v-else />
              <UButton color="primary" disabled>Got it</UButton>
            </div>
          </div>
        </UCard>
      </template>

      <!-- Save -->
      <div class="flex items-center justify-between pt-2 pb-8">
        <div v-if="lastSaved" class="text-xs text-gray-500 dark:text-gray-400">
          Last saved: {{ lastSaved }}
        </div>
        <span v-else />
        <div class="flex gap-3">
          <UButton color="gray" variant="soft" :disabled="!hasChanges" @click="resetForm">
            Discard Changes
          </UButton>
          <UButton color="primary" :loading="saving" :disabled="!hasChanges || (form.enabled && !form.id)" @click="save">
            Save & Publish
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSiteConfigStore } from '~/stores/useSiteConfigStore'

definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'Popup Message',
  description: 'Configure the site-wide popup message'
})

const toast = useToast()
const siteConfigStore = useSiteConfigStore()

const loading = ref(true)
const saving = ref(false)
const lastSaved = ref('')

// Form state
const form = reactive({
  enabled: false,
  id: '',
  title: '',
  body: '',
  severity: 'info' as 'info' | 'success' | 'warning',
  ctaLabel: '',
  ctaLink: '',
})

// Snapshot of saved state for dirty checking
const savedSnapshot = ref('')

const hasChanges = computed(() => JSON.stringify(form) !== savedSnapshot.value)

const severityOptions = [
  { value: 'info', label: 'Info', icon: 'i-heroicons-information-circle', activeBg: 'bg-blue-50 dark:bg-blue-900/20', activeBorder: 'border-blue-300 dark:border-blue-700', activeText: 'text-blue-600 dark:text-blue-400' },
  { value: 'success', label: 'Success', icon: 'i-heroicons-check-circle', activeBg: 'bg-emerald-50 dark:bg-emerald-900/20', activeBorder: 'border-emerald-300 dark:border-emerald-700', activeText: 'text-emerald-600 dark:text-emerald-400' },
  { value: 'warning', label: 'Warning', icon: 'i-heroicons-exclamation-triangle', activeBg: 'bg-yellow-50 dark:bg-yellow-900/20', activeBorder: 'border-yellow-300 dark:border-yellow-700', activeText: 'text-yellow-600 dark:text-yellow-400' },
]

const previewIcon = computed(() => {
  switch (form.severity) {
    case 'success': return 'i-heroicons-check-circle'
    case 'warning': return 'i-heroicons-exclamation-triangle'
    default: return 'i-heroicons-information-circle'
  }
})

const previewIconColor = computed(() => {
  switch (form.severity) {
    case 'success': return 'text-emerald-400'
    case 'warning': return 'text-yellow-400'
    default: return 'text-blue-400'
  }
})

const previewLinkColor = computed(() => {
  switch (form.severity) {
    case 'success': return 'text-emerald-400'
    case 'warning': return 'text-yellow-400'
    default: return 'text-blue-400'
  }
})

function generateId() {
  const now = new Date()
  const month = now.toLocaleString('en-US', { month: 'short' }).toLowerCase()
  const year = now.getFullYear()
  const rand = Math.random().toString(36).substring(2, 6)
  form.id = `${month}-${year}-${rand}`
}

function resetForm() {
  const saved = JSON.parse(savedSnapshot.value)
  Object.assign(form, saved)
}

// Load current config
async function loadConfig() {
  loading.value = true
  try {
    // Ensure site config is loaded
    await siteConfigStore.fetchConfig()
    const popup = siteConfigStore.popupMessage
    if (popup) {
      form.enabled = popup.enabled ?? false
      form.id = popup.id ?? ''
      form.title = popup.title ?? ''
      form.body = popup.body ?? ''
      form.severity = popup.severity ?? 'info'
      form.ctaLabel = popup.ctaLabel ?? ''
      form.ctaLink = popup.ctaLink ?? ''
    }
    savedSnapshot.value = JSON.stringify(form)
  } catch (e: any) {
    toast.add({ title: 'Error', description: 'Failed to load popup config', color: 'red', icon: 'i-heroicons-x-circle' })
  } finally {
    loading.value = false
  }
}

// Save all popup config fields
async function save() {
  saving.value = true
  try {
    const fields: Record<string, any> = {
      'ui.popupMessage.enabled': form.enabled,
      'ui.popupMessage.id': form.id,
      'ui.popupMessage.title': form.title,
      'ui.popupMessage.body': form.body,
      'ui.popupMessage.severity': form.severity,
      'ui.popupMessage.ctaLabel': form.ctaLabel,
      'ui.popupMessage.ctaLink': form.ctaLink,
    }

    // Update each config key
    await Promise.all(
      Object.entries(fields).map(([key, value]) =>
        $fetch(`/api/admin/site-config/${encodeURIComponent(key)}`, {
          method: 'PUT',
          body: { value },
        })
      )
    )

    // Refresh the store so the changes take effect immediately
    await siteConfigStore.refresh()

    savedSnapshot.value = JSON.stringify(form)
    lastSaved.value = new Date().toLocaleTimeString()

    toast.add({
      title: 'Popup Updated',
      description: form.enabled
        ? `Popup "${form.title || 'Untitled'}" is now live for all users.`
        : 'Popup has been disabled. Users will see the version changelog instead.',
      color: 'green',
      icon: 'i-heroicons-check-circle',
    })
  } catch (e: any) {
    toast.add({
      title: 'Save Failed',
      description: e?.data?.message || e?.message || 'Failed to save popup configuration.',
      color: 'red',
      icon: 'i-heroicons-x-circle',
    })
  } finally {
    saving.value = false
  }
}

onMounted(loadConfig)
</script>
