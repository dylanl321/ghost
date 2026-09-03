<template>
  <div class="space-y-8">
    <section>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">API Access</h1>
      <p class="mt-1 text-gray-600 dark:text-gray-400">
        Create personal integration keys and learn how to use the supported GHOST API.
      </p>
    </section>

    <ApiKeysPanel :show-heading="false" />

    <section class="grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header><h2 class="text-lg font-semibold">Quick start</h2></template>
        <ol class="list-decimal space-y-2 pl-5 text-sm text-gray-600 dark:text-gray-300">
          <li>Create a key with only the permissions your integration needs.</li>
          <li>Copy the secret when it appears. GHOST cannot show it again.</li>
          <li>Store it in a secret manager or environment variable.</li>
          <li>Send it in the <code class="font-mono">x-api-key</code> header.</li>
        </ol>
        <div class="mt-4 overflow-x-auto rounded-lg bg-gray-950 p-4 text-xs text-gray-100">
          <code>curl -H "x-api-key: $GHOST_API_KEY" \<br>&nbsp;&nbsp;"{{ apiOrigin }}/api/v1/accounts"</code>
        </div>
      </UCard>

      <UCard>
        <template #header><h2 class="text-lg font-semibold">Developer resources</h2></template>
        <div class="grid gap-3 sm:grid-cols-2">
          <UButton to="/api/swagger-ui" target="_blank" icon="i-heroicons-code-bracket-square">Swagger UI</UButton>
          <UButton to="/api/swagger.json" target="_blank" color="gray" variant="soft" icon="i-heroicons-arrow-down-tray">Raw OpenAPI</UButton>
          <UButton to="/support/docs#api-keys-guide" color="gray" variant="soft" icon="i-heroicons-book-open">API key guide</UButton>
          <UButton to="/support/docs#swagger-ui-guide" color="gray" variant="soft" icon="i-heroicons-question-mark-circle">Swagger guide</UButton>
        </div>
      </UCard>
    </section>

    <UCard>
      <template #header><h2 class="text-lg font-semibold">Permissions and endpoints</h2></template>
      <div class="grid gap-4 md:grid-cols-2">
        <div v-for="scope in scopes" :key="scope.name" class="rounded-lg border border-gray-200 p-4 dark:border-slate-700">
          <code class="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{{ scope.name }}</code>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ scope.description }}</p>
          <ul class="mt-3 space-y-1 text-xs text-gray-600 dark:text-gray-300">
            <li v-for="endpoint in scope.endpoints" :key="endpoint" class="font-mono">{{ endpoint }}</li>
          </ul>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'settings' })

const apiOrigin = computed(() => import.meta.client ? window.location.origin : 'https://ghost.example')
const scopes = [
  { name: 'accounts:read', description: 'Account inventory and organization structure.', endpoints: ['GET /api/v1/accounts', 'GET /api/v1/accounts/{identifier}', 'GET /api/v1/organization'] },
  { name: 'costs:read', description: 'AWS cost summaries.', endpoints: ['GET /api/v1/costs/summary'] },
  { name: 'forecast:read', description: 'AWS Cost Explorer and GHOST financial forecasts.', endpoints: ['GET /api/v1/forecasts/aws', 'GET /api/v1/forecasts/financial'] },
  { name: 'security:read', description: 'Security summaries, Security Hub findings, and Inspector findings.', endpoints: ['GET /api/v1/security/summary', 'GET /api/v1/security/findings', 'GET /api/v1/security/inspector/findings'] }
]
</script>
