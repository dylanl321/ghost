<template>
  <div>
    <div v-if="dryRun" class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
      <!-- Main Enable Toggle -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-3 h-3 rounded-full" :class="dryRun.enabled ? 'bg-yellow-500' : 'bg-gray-400'"></div>
          <span class="font-medium">{{ dryRun.enabled ? 'Dry Run Mode Active' : 'Dry Run Mode Disabled' }}</span>
        </div>
        <UToggle
          :model-value="dryRun.enabled"
          :loading="savingField === 'enabled'"
          @update:model-value="updateField('enabled', $event)"
        />
      </div>

      <!-- Test Recipients (Email Chips) -->
      <div class="space-y-2">
        <p class="text-xs text-gray-500 dark:text-gray-400">Test Recipients</p>
        <div class="flex flex-wrap gap-2 items-center">
          <span
            v-for="email in (dryRun.email || [])"
            :key="email"
            class="inline-flex items-center gap-1 text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded font-mono"
          >
            {{ email }}
            <UButton
              icon="i-heroicons-x-mark"
              size="2xs"
              color="yellow"
              variant="ghost"
              :padded="false"
              @click="removeEmail(email)"
            />
          </span>
          <UButton
            icon="i-heroicons-plus"
            size="xs"
            color="gray"
            variant="soft"
            @click="showAddEmailModal = true"
          >
            Add
          </UButton>
        </div>
        <p v-if="dryRun.enabled && (!dryRun.email || dryRun.email.length === 0)" class="text-xs text-red-500">
          At least one test email is required when dry run is enabled
        </p>
      </div>

      <!-- Debug Flags -->
      <div class="space-y-2">
        <p class="text-xs text-gray-500 dark:text-gray-400">Debug Options</p>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex items-center justify-between">
            <span class="text-sm">Debug Info</span>
            <UToggle
              :model-value="dryRun.include_debug_info !== false"
              size="sm"
              :loading="savingField === 'include_debug_info'"
              @update:model-value="updateField('include_debug_info', $event)"
            />
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm">Recipient Debug</span>
            <UToggle
              :model-value="dryRun.include_recipient_debug !== false"
              size="sm"
              :loading="savingField === 'include_recipient_debug'"
              @update:model-value="updateField('include_recipient_debug', $event)"
            />
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm">Evaluation Debug</span>
            <UToggle
              :model-value="dryRun.include_evaluation_debug !== false"
              size="sm"
              :loading="savingField === 'include_evaluation_debug'"
              @update:model-value="updateField('include_evaluation_debug', $event)"
            />
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm">Config Debug</span>
            <UToggle
              :model-value="dryRun.include_config_debug !== false"
              size="sm"
              :loading="savingField === 'include_config_debug'"
              @update:model-value="updateField('include_config_debug', $event)"
            />
          </div>
        </div>
      </div>
    </div>

    <div v-else class="text-gray-500 dark:text-gray-400 text-sm">
      Dry run mode is not configured. Alerts are sent to production recipients.
    </div>

    <!-- Add Email Modal -->
    <UModal v-model="showAddEmailModal">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-medium">Add Test Email</h3>
            <UButton
              icon="i-heroicons-x-mark"
              color="gray"
              variant="ghost"
              @click="showAddEmailModal = false"
            />
          </div>
        </template>

        <UFormGroup label="Email Address" :error="emailError">
          <UInput
            v-model="newEmail"
            type="email"
            placeholder="test@example.com"
            @keyup.enter="addEmail"
          />
        </UFormGroup>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="showAddEmailModal = false">
              Cancel
            </UButton>
            <UButton @click="addEmail" :loading="savingField === 'email'">
              Add Email
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { DryRunConfig } from '#shared/types/budget-alert-config'

const props = defineProps<{
  dryRun: DryRunConfig | null
}>()

const toast = useToast()
const { updateDryRun } = useAlertConfig()

const savingField = ref<string | null>(null)
const showAddEmailModal = ref(false)
const newEmail = ref('')
const emailError = ref('')

async function updateField(field: string, value: any) {
  if (!props.dryRun) return

  savingField.value = field
  try {
    await updateDryRun({ [field]: value })
    toast.add({
      title: 'Saved',
      description: `${field.replace(/_/g, ' ')} updated`,
      color: 'green',
      timeout: 2000
    })
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || e.message || 'Failed to save',
      color: 'red'
    })
  } finally {
    savingField.value = null
  }
}

async function addEmail() {
  emailError.value = ''

  if (!newEmail.value.trim()) {
    emailError.value = 'Email is required'
    return
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(newEmail.value)) {
    emailError.value = 'Invalid email format'
    return
  }

  const currentEmails = props.dryRun?.email || []
  if (currentEmails.includes(newEmail.value)) {
    emailError.value = 'Email already exists'
    return
  }

  savingField.value = 'email'
  try {
    await updateDryRun({
      email: [...currentEmails, newEmail.value]
    })
    toast.add({
      title: 'Email Added',
      description: `${newEmail.value} added to test recipients`,
      color: 'green',
      timeout: 2000
    })
    newEmail.value = ''
    showAddEmailModal.value = false
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || e.message || 'Failed to add email',
      color: 'red'
    })
  } finally {
    savingField.value = null
  }
}

async function removeEmail(emailToRemove: string) {
  const currentEmails = props.dryRun?.email || []
  const updatedEmails = currentEmails.filter(e => e !== emailToRemove)

  savingField.value = 'email'
  try {
    await updateDryRun({ email: updatedEmails })
    toast.add({
      title: 'Email Removed',
      description: `${emailToRemove} removed from test recipients`,
      color: 'green',
      timeout: 2000
    })
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || e.message || 'Failed to remove email',
      color: 'red'
    })
  } finally {
    savingField.value = null
  }
}
</script>
