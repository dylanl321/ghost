<script setup lang="ts">
definePageMeta({ layout: 'authentication' })

const route = useRoute()
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const details = ref<{
  prompt: string
  client: { name: string; uri?: string }
  scopes: string[]
  resource?: string | string[]
} | null>(null)

const scopeLabels: Record<string, string> = {
  'ghost.read': 'Read GHOST account, cost, user, security, resource, and pipeline data',
  'ghost.ai.invoke': 'Invoke GHOST AI insights and chat',
  'ghost.collaborate': 'Manage your preferences, chat threads, and report jobs'
}

interface InteractionResponse {
  redirectTo?: string
  prompt?: string
  client?: { name: string; uri?: string }
  scopes?: string[]
  resource?: string | string[]
}

async function submit(action: 'details' | 'login' | 'approve' | 'deny') {
  if (action !== 'details') submitting.value = true
  error.value = ''
  try {
    const response = await $fetch<InteractionResponse>(
      `/oauth/consent/${encodeURIComponent(String(route.params.uid))}`,
      { method: 'POST', body: { action } }
    )
    if (action === 'details') {
      details.value = response as typeof details.value
      if (response.prompt === 'login') await submit('login')
    } else if (response.redirectTo) {
      window.location.href = response.redirectTo
    }
  } catch (cause: any) {
    error.value = cause?.data?.message || cause?.message || 'Unable to complete authorization.'
  } finally {
    loading.value = false
    submitting.value = false
  }
}

onMounted(() => submit('details'))
</script>

<template>
  <main class="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
    <section class="w-full max-w-lg border border-gray-700 bg-gray-900 p-6 rounded-lg shadow-xl">
      <div class="flex items-center gap-3 mb-6">
        <UIcon name="i-heroicons-shield-check" class="size-8 text-primary" />
        <div>
          <h1 class="text-xl font-semibold">Authorize GHOST access</h1>
          <p class="text-sm text-gray-400">{{ details?.client.name || 'MCP client' }}</p>
        </div>
      </div>

      <div v-if="loading" class="py-10 text-center text-gray-400">
        <UIcon name="i-heroicons-arrow-path" class="size-6 animate-spin mx-auto" />
      </div>

      <template v-else-if="details">
        <ul class="space-y-3 mb-6">
          <li v-for="scope in details.scopes" :key="scope" class="flex gap-3 text-sm">
            <UIcon name="i-heroicons-check-circle" class="size-5 text-green-400 shrink-0" />
            <span>{{ scopeLabels[scope] || scope }}</span>
          </li>
        </ul>
        <p v-if="details.resource" class="text-xs text-gray-500 mb-6 break-all">{{ details.resource }}</p>
      </template>

      <p v-if="error" class="text-sm text-red-400 mb-4">{{ error }}</p>

      <div v-if="details?.prompt === 'consent'" class="flex justify-end gap-3">
        <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" :disabled="submitting" @click="submit('deny')">
          Deny
        </UButton>
        <UButton icon="i-heroicons-check" :loading="submitting" :disabled="!details" @click="submit('approve')">
          Approve
        </UButton>
      </div>
    </section>
  </main>
</template>
