<script setup lang="ts">
import { onMounted } from 'vue'
import { convertToUsernameSlug } from '~/utils/userUtils'

// Composables
const { user } = useOidcAuth()

// Page metadata
definePageMeta({
  title: 'My Access',
  description: 'View your AWS account access and roles'
})

// Redirect to user profile
onMounted(() => {
  if (user.value?.claims?.email) {
    const myEmail = user.value.claims.email
    const username = convertToUsernameSlug(myEmail)
    navigateTo(`/account/user/${username}`)
  } else {
    // If no user info, redirect to login or user search
    navigateTo('/account/user')
  }
})
</script>

<template>
  <div class="flex items-center justify-center py-16">
    <div class="text-center">
      <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 animate-spin text-blue-400 mb-4" />
      <p class="text-gray-400 text-lg">Redirecting to your profile...</p>
    </div>
  </div>
</template> 