<template>
  <UModal v-model="modelValue" :ui="{ width: 'sm:max-w-md' }">
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
          Delete User Preferences
        </h3>
      </template>

      <div class="space-y-4">
        <p class="text-gray-700 dark:text-gray-300">
          Are you sure you want to delete preferences for <strong>{{ userId }}</strong>?
        </p>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          This will reset all settings to defaults. Preferences will be recreated automatically the next time the user logs in.
        </p>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="gray" variant="ghost" @click="modelValue = false">
            Cancel
          </UButton>
          <UButton color="red" :loading="deleting" @click="handleDelete">
            Delete Preferences
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  userId: string
}>()

const modelValue = defineModel<boolean>({ required: true })
const emit = defineEmits<{ deleted: [] }>()

const { deleteUserPreferences } = useAdminUserDetail()
const toast = useToast()
const deleting = ref(false)

async function handleDelete() {
  deleting.value = true
  try {
    await deleteUserPreferences(props.userId)
    toast.add({
      title: 'Preferences Deleted',
      description: `Preferences deleted for ${props.userId}`,
      color: 'green',
      icon: 'i-heroicons-check-circle'
    })
    modelValue.value = false
    emit('deleted')
  } catch (err: any) {
    toast.add({
      title: 'Delete Failed',
      description: err.message || 'Failed to delete preferences',
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  } finally {
    deleting.value = false
  }
}
</script>
