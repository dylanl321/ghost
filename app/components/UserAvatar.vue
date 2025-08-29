<template>
  <div class="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-gray-700">
    <img
      v-if="photoUrl"
      :src="photoUrl"
      alt="User Avatar"
      class="w-full h-full object-cover"
      @error="onError"
    >
    <UIcon v-else name="i-heroicons-user" class="w-6 h-6 text-white" />
  </div>
</template>

<script setup lang="ts">
import { UIcon } from '#components'

const { user } = useOidcAuth()
const errored = ref(false)

const userId = computed(() => {
  if (!user.value?.claims.email) return null
  return user.value.claims.email.split('@')[0].toLowerCase()
})

const photoUrl = computed(() => {
  if (!userId.value || errored.value) return null
  return `https://employeephoto.gd-ms.us/${userId.value}.jpg`
})

function onError() {
  errored.value = true
}
</script>
