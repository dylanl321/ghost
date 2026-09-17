<script setup lang="ts">
/**
 * OAuthConfigurationPanel
 *
 * Read-only safe effective configuration (Requirement 3.5). Every setting is
 * labelled read-only with its provenance (configured / effective / observed /
 * unknown); there is NO save, propose, merge, deploy, or quota-reset control.
 * Public JWK metadata is shown; private key parameters are never present in the
 * DTO. Unknown release/pipeline/image/task/signing-date evidence is shown as
 * "Unknown" rather than inferred.
 */
import type {
  OAuthConfiguration,
  OAuthConfigurationValue,
  OAuthProvenance
} from '#shared/types/oauth-administration'

const props = defineProps<{
  state: {
    data: OAuthConfiguration | null
    loading: boolean
    error: string | null
    unavailable: boolean
    conflict: boolean
    loaded: boolean
  }
  empty: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const config = computed(() => props.state.data)

interface SettingRow {
  key: string
  label: string
  value: OAuthConfigurationValue
}

const settings = computed<SettingRow[]>(() => {
  const c = config.value
  if (!c) return []
  return [
    { key: 'issuer', label: 'Issuer', value: c.issuer },
    { key: 'publicEndpoints', label: 'Public endpoints', value: c.publicEndpoints },
    { key: 'resources', label: 'Resources', value: c.resources },
    { key: 'scopes', label: 'Scopes', value: c.scopes },
    { key: 'grantTypes', label: 'Grant types', value: c.grantTypes },
    { key: 'clientAuthMethods', label: 'Client authentication', value: c.clientAuthMethods },
    { key: 'pkce', label: 'PKCE', value: c.pkce },
    { key: 'registrationPolicy', label: 'Registration policy', value: c.registrationPolicy },
    { key: 'tokenLifetimes', label: 'Token lifetimes', value: c.tokenLifetimes },
    { key: 'grantLifetimes', label: 'Grant lifetimes', value: c.grantLifetimes },
    { key: 'refreshRotation', label: 'Refresh rotation', value: c.refreshRotation },
    { key: 'quotas', label: 'Quotas', value: c.quotas },
    { key: 'durability', label: 'Durability', value: c.durability }
  ]
})

function provenanceMeta(provenance: OAuthProvenance) {
  switch (provenance) {
    case 'configured':
      return { color: 'sky' as const, label: 'Configured' }
    case 'effective':
      return { color: 'emerald' as const, label: 'Effective' }
    case 'observed':
      return { color: 'violet' as const, label: 'Observed' }
    default:
      return { color: 'gray' as const, label: 'Unknown' }
  }
}

/** Prefer the most authoritative available value for display. */
function displayValue(value: OAuthConfigurationValue): string {
  const chosen = value.effective ?? value.observed ?? value.configured
  if (chosen === null || chosen === undefined) return 'Unknown'
  if (Array.isArray(chosen)) return chosen.length ? chosen.join(', ') : 'None'
  if (typeof chosen === 'boolean') return chosen ? 'Enabled' : 'Disabled'
  return String(chosen)
}

function releaseValue(value?: string) {
  return value && value.trim().length > 0 ? value : 'Unknown'
}
</script>

<template>
  <section class="space-y-4">
    <header>
      <h2 class="text-lg font-semibold text-gray-950 dark:text-white">Effective configuration</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Safe read-only projection of the running provider. Deployment-backed settings cannot be edited here.
      </p>
    </header>

    <OAuthViewState
      :loading="state.loading"
      :empty="empty"
      :unavailable="state.unavailable"
      :conflict="state.conflict"
      :error="state.error"
      label="configuration"
      :hide-retry="state.unavailable"
      @retry="emit('retry')"
    >
      <div v-if="config" class="space-y-6">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Settings</h3>
              <UBadge color="gray" variant="subtle" size="xs">
                <UIcon name="i-heroicons-lock-closed" class="mr-1 size-3" />
                Read-only
              </UBadge>
            </div>
          </template>

          <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <div
              v-for="setting in settings"
              :key="setting.key"
              class="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            >
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ setting.label }}</span>
                <UBadge :color="provenanceMeta(setting.value.provenance).color" variant="subtle" size="xs">
                  {{ provenanceMeta(setting.value.provenance).label }}
                </UBadge>
                <UBadge v-if="setting.value.readOnly" color="gray" variant="subtle" size="xs">Read-only</UBadge>
              </div>
              <span class="break-words text-sm text-gray-600 dark:text-gray-400 sm:max-w-md sm:text-right">
                {{ displayValue(setting.value) }}
              </span>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Signing keys</h3>
          </template>
          <div v-if="config.signingKeys.length" class="space-y-3">
            <div
              v-for="key in config.signingKeys"
              :key="key.keyId"
              class="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-700"
            >
              <div class="flex flex-wrap items-center gap-2">
                <code class="text-xs text-gray-700 dark:text-gray-300">{{ key.keyId }}</code>
                <UBadge color="gray" variant="subtle" size="xs">{{ key.keyType }}</UBadge>
                <UBadge v-if="key.algorithm" color="gray" variant="subtle" size="xs">{{ key.algorithm }}</UBadge>
                <UBadge v-if="key.use" color="gray" variant="subtle" size="xs">{{ key.use }}</UBadge>
              </div>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Rotated: {{ key.rotatedAt || 'Unknown' }} · Expires: {{ key.expiresAt || 'Unknown' }}
              </p>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Only public metadata is shown. Signing dates are marked unknown when the provider does not report them.
            </p>
          </div>
          <p v-else class="text-sm text-gray-500 dark:text-gray-400">No public signing-key metadata available.</p>
        </UCard>

        <UCard>
          <template #header>
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Release evidence</h3>
          </template>
          <dl class="grid gap-3 sm:grid-cols-2">
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Release SHA</dt>
              <dd class="text-sm text-gray-800 dark:text-gray-200">{{ releaseValue(config.releaseEvidence?.releaseSha) }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Pipeline</dt>
              <dd class="text-sm text-gray-800 dark:text-gray-200">{{ releaseValue(config.releaseEvidence?.pipelineReference) }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Image digest</dt>
              <dd class="break-all text-sm text-gray-800 dark:text-gray-200">{{ releaseValue(config.releaseEvidence?.imageDigest) }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Task revision</dt>
              <dd class="text-sm text-gray-800 dark:text-gray-200">{{ releaseValue(config.releaseEvidence?.taskRevision) }}</dd>
            </div>
          </dl>
        </UCard>

        <OAuthCoverageBadge
          :coverage="config.metadata.coverage"
          :freshness="config.metadata.freshness"
          :observed-at="config.metadata.collectedAt"
        />
      </div>
    </OAuthViewState>
  </section>
</template>
