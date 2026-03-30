<template>
  <div>
    <UButton icon="i-heroicons-document-text" color="white" variant="ghost" @click="open">
      Submit Feedback
    </UButton>

    <UModal v-model="isOpen" title="Submit Feedback">
      <div class="p-6 space-y-4">
        <h1 class="text-xl mb-8 font-semibold">Submit Feedback</h1>

        <div>
          <label class="block mb-1 text-sm font-medium">Type</label>
          <USelect
            v-model="featureTypeSelection"
            :options="featureOptions"
          />
        </div>

        <div>
          <label class="block mb-1 text-sm font-medium">Description</label>
          <UTextarea
            v-model="description"
            :placeholder="descriptionPlaceholder"
            :rows="4"
          />
        </div>

        <div>
          <label class="block mb-1 text-sm font-medium">Your Email</label>
          <UInput
            v-model="reporter_email"
            type="email"
            placeholder="your.email@example.com"
            :disabled="isAnonymous"
          />
          <div class="mt-2 flex items-center space-x-2">
            <UCheckbox v-model="isAnonymous" label="Submit Anonymously" />
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <UButton color="gray" variant="ghost" @click="isOpen = false">Cancel</UButton>
          <UButton color="primary" :loading="isSubmitting" @click="submit">Submit</UButton>
        </div>
      </div>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToast } from '#imports'

const logger = createLogger('FeedbackModal')

const { user } = useOidcAuth()

type FeatureOptions = 'Issue' | 'Feature Request' | 'General Feedback'

const isOpen = ref(false)
const featureTypeSelection = ref<FeatureOptions>('Issue')
const featureOptions: Array<FeatureOptions> = ['Issue', 'Feature Request', 'General Feedback']
const description = ref('')
const reporter_email = ref('')
const isAnonymous = ref(false)
const isSubmitting = ref(false)

const toast = useToast()

function open() {
  isOpen.value = true
  if (user.value?.claims?.email) {
    reporter_email.value = user.value?.claims?.email as string
  }
}

// Watch for anonymous toggle to clear/restore email
watch(isAnonymous, (checked) => {
  if (checked) {
    reporter_email.value = 'Anonymous'
  } else if (user.value?.claims?.email) {
    reporter_email.value = user.value?.claims?.email as string
  } else {
    reporter_email.value = ''
  }
})

const descriptionPlaceholder = computed(() => {
  switch (featureTypeSelection.value) {
    case 'Issue':
      return 'Describe the issue. Please include details such as what page(s) it occurs on, what you expected to happen, and any steps to reproduce the problem.'
    case 'Feature Request':
      return 'Describe the feature you’d like to see added or improved.'
    case 'General Feedback':
      return 'Share your thoughts, suggestions, or any other feedback.'
    default:
      return 'Provide additional details...'
  }
})

async function submit() {
  if (!featureTypeSelection.value || !description.value || (!reporter_email.value && !isAnonymous.value)) {
    toast.add({
      title: 'Missing fields',
      description: 'Please fill out all fields.',
      color: 'red',
    })
    return
  }

  isSubmitting.value = true

  try {
    const data = {
      type: featureTypeSelection.value,
      description: description.value,
      reporter_email: reporter_email.value,
    }

    const result = await $fetch<{ success: boolean }>('/api/feedback/submit', {
      method: 'POST',
      body: data,
    })

    if (!result.success) {
      throw new Error('Server returned unsuccessful response')
    }

    useEventBus().emit('feedback.submitted', {})

    toast.add({
      title: 'Feedback Submitted',
      description: 'Thank you for your feedback!',
      color: 'green',
    })

    // Reset + close
    isOpen.value = false
    featureTypeSelection.value = 'Issue'
    description.value = ''
    reporter_email.value = ''
    isAnonymous.value = false
  } catch (err) {
    logger.error('Failed to submit feedback:', err)
    toast.add({ title: 'Error', description: 'Failed to submit feedback.', color: 'red' })
  } finally {
    isSubmitting.value = false
  }
}
</script>
