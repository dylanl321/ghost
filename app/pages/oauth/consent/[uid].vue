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
  'ghost.read': 'Read AWS account details, costs, user access, security findings, resources, and pipeline activity available to you',
  'ghost.ai.invoke': 'Use GHOST AI insights and chat to answer AWS questions',
  'ghost.collaborate': 'Manage your GHOST preferences, chat threads, reports, and exports',
  'ghost.credentials.issue': 'Request short-lived AWS role credentials for roles assigned to you. GHOST will ask for confirmation before issuing them.'
}

interface InteractionResponse {
  redirectTo?: string
  prompt?: string
  client?: { name: string; uri?: string }
  scopes?: string[]
  resource?: string | string[]
}

async function submit(action: 'details' | 'login' | 'approve' | 'deny') {
  if (action === 'details') loading.value = true
  else submitting.value = true
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
  <main class="oauth-consent min-h-screen text-white flex items-center justify-center p-4">
    <section class="oauth-consent-card w-full max-w-lg p-6 sm:p-7">
      <div class="flex items-center gap-3 mb-6">
        <div class="oauth-consent-icon">
          <UIcon name="i-heroicons-shield-check" class="size-5" />
        </div>
        <div>
          <p class="oauth-consent-kicker">GHOST connection</p>
          <h1 class="text-xl font-semibold">Allow {{ details?.client.name || 'your MCP client' }} to access GHOST</h1>
        </div>
      </div>

      <div v-if="loading" class="py-10 text-center text-gray-400" role="status" aria-label="Loading authorization details">
        <UIcon name="i-heroicons-arrow-path" class="size-6 animate-spin mx-auto" />
      </div>

      <template v-else-if="details">
        <p class="oauth-consent-intro">{{ details.client.name || 'This MCP client' }} will use your existing GHOST and AWS permissions. This does not grant access to additional accounts or roles.</p>
        <h2 class="oauth-consent-heading">Permissions requested</h2>
        <ul class="space-y-3 mb-6">
          <li v-for="scope in details.scopes" :key="scope" class="flex gap-3 text-sm">
            <UIcon name="i-heroicons-check-circle" class="oauth-consent-check size-5 shrink-0" />
            <span>{{ scopeLabels[scope] || scope }}</span>
          </li>
        </ul>
        <p v-if="details.resource" class="oauth-consent-resource mb-6"><span>GHOST server</span>{{ details.resource }}</p>
      </template>

      <div v-if="error" class="oauth-consent-error" role="alert">
        <UIcon name="i-heroicons-exclamation-circle" class="mt-0.5 size-5 shrink-0" />
        <div>
          <p>{{ error }}</p>
          <UButton v-if="!details" icon="i-heroicons-arrow-path" color="gray" variant="soft" size="xs" class="mt-3" @click="submit('details')">
            Try again
          </UButton>
        </div>
      </div>

      <div v-if="details?.prompt === 'consent'" class="oauth-consent-actions flex justify-end gap-3">
        <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" :disabled="submitting" @click="submit('deny')">
          Cancel
        </UButton>
        <UButton icon="i-heroicons-check" :loading="submitting" :disabled="!details" @click="submit('approve')">
          Allow access
        </UButton>
      </div>
    </section>
  </main>
</template>

<style scoped>
.oauth-consent { position: relative; isolation: isolate; overflow: hidden; background: rgb(3 11 23); }
.oauth-consent::before, .oauth-consent::after { position: absolute; z-index: -1; pointer-events: none; content: ''; }
.oauth-consent::before { inset: 0; background: linear-gradient(115deg, transparent 0 18%, rgb(132 101 238 / .14) 30%, transparent 42% 58%, rgb(74 168 244 / .12) 68%, rgb(242 167 87 / .1) 74%, rgb(216 110 234 / .12) 80%, transparent 92%); background-size: 220% 100%; animation: consent-flow 16s ease-in-out infinite; }
.oauth-consent::after { inset: 0; background-image: linear-gradient(rgb(255 255 255 / .025) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / .025) 1px, transparent 1px); background-size: 2.5rem 2.5rem; mask-image: linear-gradient(to bottom, transparent, black 18%, black 82%, transparent); }
.oauth-consent-card { position: relative; overflow: hidden; background: linear-gradient(rgb(8 18 33 / .94), rgb(8 18 33 / .94)) padding-box, conic-gradient(from var(--consent-trace-angle), rgb(132 101 238), rgb(74 168 244), rgb(242 167 87), rgb(216 110 234), rgb(132 101 238)) border-box; border: 1px solid transparent; border-radius: .5rem; box-shadow: 0 24px 60px rgb(0 0 0 / .38); animation: consent-trace 18s linear infinite, consent-rise 220ms ease both; }
.oauth-consent-icon { display: grid; width: 2.5rem; height: 2.5rem; place-items: center; color: rgb(167 243 208); background: rgb(6 78 59 / .5); border: 1px solid rgb(110 231 183 / .35); border-radius: .375rem; }
.oauth-consent-kicker { margin: 0 0 .15rem; color: rgb(110 231 183); font-size: .6875rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.oauth-consent-intro { margin: 0 0 1.5rem; color: rgb(203 213 225); font-size: .875rem; line-height: 1.55; }
.oauth-consent-heading { margin: 0 0 .75rem; color: rgb(248 250 252); font-size: .8125rem; font-weight: 700; }
.oauth-consent-check { color: rgb(110 231 183); }
.oauth-consent-resource { display: grid; gap: .25rem; padding-top: 1rem; color: rgb(148 163 184); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .6875rem; line-height: 1.45; border-top: 1px solid rgb(148 163 184 / .18); overflow-wrap: anywhere; }
.oauth-consent-resource span { color: rgb(203 213 225); font-family: inherit; font-weight: 700; }
.oauth-consent-error { display: flex; gap: .625rem; margin-bottom: 1rem; padding: .75rem; color: rgb(254 202 202); background: rgb(127 29 29 / .2); border: 1px solid rgb(248 113 113 / .25); border-radius: .375rem; font-size: .8125rem; line-height: 1.5; }
.oauth-consent-error p { margin: 0; }
.oauth-consent-actions { padding-top: .25rem; border-top: 1px solid rgb(148 163 184 / .18); }
@property --consent-trace-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes consent-trace { to { --consent-trace-angle: 360deg; } }
@keyframes consent-flow { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
@keyframes consent-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .oauth-consent::before, .oauth-consent-card { animation: none; } }
</style>
