<script setup lang="ts">
/**
 * OAuthApplicationCreateForm
 *
 * The native public client creation wizard (task 7.3; Requirements 6.4, 6.6,
 * 6.7, 17.1, 17.2, 17.6). Three steps:
 *
 *   1. Details — name, accountable owner/team/purpose, redirect URIs, and
 *      resource/scope multiselects populated from the deployment's supported
 *      options (fetched via the server-side preview, so they mirror the running
 *      provider configuration rather than a hard-coded list).
 *   2. Confirm — the server-validated normalized preview (client type/auth
 *      profile, redirect URIs, resources, scopes). Submitting here runs the
 *      idempotent create operation and polls it to a terminal state.
 *   3. Result — the non-secret integration instructions plus an explicit
 *      "Run development sign-in test" button that reuses the CREATED client in a
 *      human-driven normal-consent flow.
 *
 * SAFETY: This component never renders a client secret or a registration access
 * token — a native public client has neither, and the server response contains
 * neither. All state lives in the composable's in-memory `creation` object; the
 * CSRF token is fetched and cached in composable memory only (Req 17.5).
 * Loading / conflict / error states are surfaced explicitly (Req 17.2). Every
 * control is keyboard-accessible NuxtUI (Req 17.1).
 */
import { computed, reactive, ref, watch } from 'vue'
import {
  useOAuthAdministration,
  type OAuthApplicationPreview,
  type OAuthCreateApplicationResult
} from '../../../composables/useOAuthAdministration'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  /** Emitted when a client was created so the panel can refresh its inventory. */
  created: []
}>()

const admin = useOAuthAdministration()
const { creation } = admin

type WizardStep = 'details' | 'confirm' | 'result'
const step = ref<WizardStep>('details')

/** The form fields. Redirect URIs and scopes/resources are edited as lists. */
const form = reactive({
  name: '',
  owner: '',
  team: '',
  purpose: '',
  redirectUris: [''] as string[],
  permittedResources: [] as string[],
  permittedScopes: [] as string[]
})

/** A required reason captured for the audited create operation (Req 13.1). */
const reason = ref('')

/** Supported options for the multiselects, hydrated from the preview response. */
const options = reactive({ resources: [] as string[], scopes: [] as string[] })

/** Local, form-level validation message shown before a server round-trip. */
const localError = ref<string | null>(null)

const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value)
})

/** Reset everything when the wizard opens. */
watch(
  () => props.open,
  (open) => {
    if (open) {
      step.value = 'details'
      form.name = ''
      form.owner = ''
      form.team = ''
      form.purpose = ''
      form.redirectUris = ['']
      form.permittedResources = []
      form.permittedScopes = []
      reason.value = ''
      options.resources = []
      options.scopes = []
      localError.value = null
      admin.resetCreation()
      // Preload the supported options with a light preview so the multiselects
      // populate even before the form is valid. Ignore validation errors here.
      void hydrateOptions()
    }
  }
)

/**
 * Fetch the supported resources/scopes via the preview route. The preview
 * validates too, so on the initial (empty) form it returns a 400; we only keep
 * the options when a preview succeeds. A dedicated tiny probe keeps the initial
 * multiselects populated by sending a minimal probe payload.
 */
async function hydrateOptions() {
  // Ask the server for options by previewing a throwaway minimal candidate. If
  // it fails validation we fall back to leaving options empty until the user's
  // first explicit preview populates them.
  const probe = await admin.previewApplication({
    name: 'probe',
    ownership: { owner: 'probe' },
    redirectUris: ['http://127.0.0.1:53682/callback'],
    permittedResources: [],
    permittedScopes: []
  }).catch(() => null)
  if (probe?.options) {
    options.resources = probe.options.resources
    options.scopes = probe.options.scopes
  }
  // Clear the probe preview + any probe validation error so the UI stays clean.
  creation.preview = null
  creation.error = null
}

function addRedirect() {
  form.redirectUris.push('')
}
function removeRedirect(index: number) {
  form.redirectUris.splice(index, 1)
  if (form.redirectUris.length === 0) form.redirectUris.push('')
}

const cleanedRedirects = computed(() =>
  form.redirectUris.map(uri => uri.trim()).filter(uri => uri.length > 0)
)

function buildForm() {
  return {
    name: form.name.trim(),
    ownership: {
      owner: form.owner.trim(),
      ...(form.team.trim() ? { team: form.team.trim() } : {}),
      ...(form.purpose.trim() ? { purpose: form.purpose.trim() } : {})
    },
    redirectUris: cleanedRedirects.value,
    permittedResources: form.permittedResources,
    permittedScopes: form.permittedScopes
  }
}

/** Quick client-side gate before the server preview to give fast feedback. */
function validateLocally(): boolean {
  localError.value = null
  if (!form.name.trim()) { localError.value = 'An application name is required.'; return false }
  if (!form.owner.trim()) { localError.value = 'An accountable owner is required.'; return false }
  if (cleanedRedirects.value.length === 0) { localError.value = 'At least one redirect URI is required.'; return false }
  if (form.permittedResources.length === 0) { localError.value = 'Select at least one permitted resource.'; return false }
  if (form.permittedScopes.length === 0) { localError.value = 'Select at least one permitted scope.'; return false }
  return true
}

/** Step 1 → 2: run the server-side preview and advance on success. */
async function goToConfirm() {
  if (!validateLocally()) return
  const preview = await admin.previewApplication(buildForm())
  if (preview) step.value = 'confirm'
}

/** Step 2 → 3: run the idempotent create operation, poll, and show the result. */
async function submitCreate() {
  if (!reason.value.trim()) { creation.error = 'A reason is required to create an application.'; return }
  const result = await admin.createApplication(buildForm(), reason.value.trim())
  if (result) {
    step.value = 'result'
    emit('created')
  }
}

function backToDetails() {
  step.value = 'details'
  creation.error = null
  creation.conflict = false
}

const previewData = computed<OAuthApplicationPreview['preview'] | null>(() => creation.preview?.preview ?? null)
const result = computed<OAuthCreateApplicationResult | null>(() => creation.result)

function runDevSignInTest() {
  if (result.value) void admin.devSignInTest(result.value)
}

function close() {
  isOpen.value = false
}
</script>

<template>
  <USlideover v-model="isOpen" side="right" :ui="{ width: 'max-w-2xl' }">
    <div class="flex h-full flex-col">
      <header class="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <div>
          <h3 class="font-semibold text-gray-950 dark:text-white">Create application</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Native public client · authorization code · S256 PKCE · no secret.
          </p>
        </div>
        <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" square aria-label="Close" @click="close" />
      </header>

      <!-- Step indicator -->
      <ol class="flex items-center gap-2 border-b border-gray-200 px-5 py-3 text-xs dark:border-gray-700" aria-label="Progress">
        <li :class="step === 'details' ? 'font-semibold text-indigo-600 dark:text-indigo-300' : 'text-gray-400'">1. Details</li>
        <li aria-hidden="true" class="text-gray-300">/</li>
        <li :class="step === 'confirm' ? 'font-semibold text-indigo-600 dark:text-indigo-300' : 'text-gray-400'">2. Confirm</li>
        <li aria-hidden="true" class="text-gray-300">/</li>
        <li :class="step === 'result' ? 'font-semibold text-indigo-600 dark:text-indigo-300' : 'text-gray-400'">3. Result</li>
      </ol>

      <div class="min-h-0 flex-1 overflow-y-auto p-5">
        <!-- STEP 1 — DETAILS -->
        <form v-if="step === 'details'" class="space-y-4" @submit.prevent="goToConfirm">
          <UFormGroup label="Application name" required>
            <UInput v-model="form.name" placeholder="My CLI tool" aria-label="Application name" />
          </UFormGroup>

          <div class="grid gap-3 sm:grid-cols-3">
            <UFormGroup label="Owner" required>
              <UInput v-model="form.owner" placeholder="jane.doe" aria-label="Accountable owner" />
            </UFormGroup>
            <UFormGroup label="Team">
              <UInput v-model="form.team" placeholder="Platform" aria-label="Team" />
            </UFormGroup>
            <UFormGroup label="Purpose">
              <UInput v-model="form.purpose" placeholder="Local dev" aria-label="Purpose" />
            </UFormGroup>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Ownership is accountable metadata, not a permission grant.
          </p>

          <UFormGroup label="Redirect URIs" required>
            <div class="space-y-2">
              <div v-for="(uri, index) in form.redirectUris" :key="index" class="flex items-center gap-2">
                <UInput
                  v-model="form.redirectUris[index]"
                  class="flex-1"
                  placeholder="http://127.0.0.1:8765/callback"
                  :aria-label="`Redirect URI ${index + 1}`"
                />
                <UButton
                  icon="i-heroicons-trash"
                  color="gray"
                  variant="ghost"
                  square
                  :aria-label="`Remove redirect URI ${index + 1}`"
                  @click="removeRedirect(index)"
                />
              </div>
              <UButton icon="i-heroicons-plus" size="xs" color="gray" variant="soft" @click="addRedirect">
                Add redirect URI
              </UButton>
            </div>
            <template #hint>
              <span class="text-xs text-gray-400">Native loopback (127.0.0.1 / localhost) is supported. Wildcards are rejected.</span>
            </template>
          </UFormGroup>

          <UFormGroup label="Permitted resources" required>
            <USelectMenu
              v-model="form.permittedResources"
              :options="options.resources"
              multiple
              placeholder="Select resources"
              aria-label="Permitted resources"
            />
          </UFormGroup>

          <UFormGroup label="Permitted scopes" required>
            <USelectMenu
              v-model="form.permittedScopes"
              :options="options.scopes"
              multiple
              placeholder="Select scopes"
              aria-label="Permitted scopes"
            />
          </UFormGroup>

          <UAlert
            v-if="localError"
            color="red"
            variant="soft"
            icon="i-heroicons-exclamation-circle"
            :title="localError"
          />
          <UAlert
            v-else-if="creation.error"
            color="red"
            variant="soft"
            icon="i-heroicons-exclamation-circle"
            title="Validation failed"
            :description="creation.error"
          />

          <div class="flex justify-end gap-2 pt-2">
            <UButton color="gray" variant="ghost" @click="close">Cancel</UButton>
            <UButton type="submit" color="indigo" :loading="creation.previewing">Preview</UButton>
          </div>
        </form>

        <!-- STEP 2 — CONFIRM -->
        <div v-else-if="step === 'confirm'" class="space-y-4">
          <UAlert
            color="sky"
            variant="soft"
            icon="i-heroicons-information-circle"
            title="Review before creating"
            description="This is the validated registration and permission preview. No client is created until you confirm."
          />

          <div v-if="previewData" class="space-y-4">
            <dl class="space-y-2 text-sm">
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500 dark:text-gray-400">Name</dt>
                <dd class="text-right text-gray-800 dark:text-gray-200">{{ previewData.name }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500 dark:text-gray-400">Client type</dt>
                <dd class="text-right text-gray-800 dark:text-gray-200">{{ previewData.clientType }} · auth {{ previewData.authMethod }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500 dark:text-gray-400">Flow</dt>
                <dd class="text-right text-gray-800 dark:text-gray-200">{{ previewData.grantTypes.join(', ') }} · PKCE {{ previewData.pkce }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500 dark:text-gray-400">Owner</dt>
                <dd class="text-right text-gray-800 dark:text-gray-200">{{ previewData.ownership.owner }}</dd>
              </div>
            </dl>

            <div>
              <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Redirect URIs</h4>
              <ul class="mt-1 space-y-1">
                <li v-for="uri in previewData.redirectUris" :key="uri" class="break-all text-xs text-gray-700 dark:text-gray-300">{{ uri }}</li>
              </ul>
              <p v-if="previewData.allowsLoopback" class="mt-1 text-xs text-gray-500 dark:text-gray-400">Native loopback redirects permitted.</p>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Resources</h4>
                <p class="mt-1 break-all text-xs text-gray-700 dark:text-gray-300">{{ previewData.permittedResources.join(', ') }}</p>
              </div>
              <div>
                <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Scopes</h4>
                <p class="mt-1 text-xs text-gray-700 dark:text-gray-300">{{ previewData.permittedScopes.join(', ') }}</p>
              </div>
            </div>
          </div>

          <UFormGroup label="Reason" required hint="Recorded in the operation audit trail.">
            <UInput v-model="reason" placeholder="Why this application is being created" aria-label="Reason" />
          </UFormGroup>

          <UAlert
            v-if="creation.conflict"
            color="orange"
            variant="soft"
            icon="i-heroicons-arrows-right-left"
            title="Creation conflict"
            :description="creation.error || 'This submission conflicts with a previous one. Review before retrying.'"
          />
          <UAlert
            v-else-if="creation.error"
            color="red"
            variant="soft"
            icon="i-heroicons-exclamation-circle"
            title="Creation failed"
            :description="creation.error"
          />

          <div v-if="creation.submitting || creation.polling" class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400" role="status" aria-live="polite">
            <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin" />
            <span>{{ creation.polling ? 'Waiting for the operation to complete…' : 'Submitting…' }}</span>
          </div>

          <div class="flex justify-between gap-2 pt-2">
            <UButton color="gray" variant="ghost" :disabled="creation.submitting || creation.polling" @click="backToDetails">Back</UButton>
            <UButton color="indigo" :loading="creation.submitting || creation.polling" @click="submitCreate">Create application</UButton>
          </div>
        </div>

        <!-- STEP 3 — RESULT -->
        <div v-else class="space-y-4">
          <UAlert
            color="emerald"
            variant="soft"
            icon="i-heroicons-check-circle"
            title="Application created"
            description="The native public client is registered. There is no client secret or registration token to store."
          />

          <div v-if="result" class="space-y-4">
            <div>
              <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Client ID</h4>
              <code class="mt-1 block break-all rounded bg-gray-100 px-2 py-1 text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-200">{{ result.clientId }}</code>
            </div>

            <div v-if="result.instructions" class="space-y-2 text-sm">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Integration</h4>
              <dl class="space-y-1">
                <div class="flex justify-between gap-4">
                  <dt class="text-gray-500 dark:text-gray-400">Authorize URL</dt>
                  <dd class="break-all text-right text-xs text-gray-800 dark:text-gray-200">{{ result.instructions.authorizeUrl }}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-gray-500 dark:text-gray-400">Token URL</dt>
                  <dd class="break-all text-right text-xs text-gray-800 dark:text-gray-200">{{ result.instructions.exchangeUrl }}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-gray-500 dark:text-gray-400">Auth method</dt>
                  <dd class="text-right text-gray-800 dark:text-gray-200">{{ result.instructions.authMethod }} · PKCE {{ result.instructions.pkceMethod }}</dd>
                </div>
              </dl>
              <ul class="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-600 dark:text-gray-400">
                <li v-for="note in result.instructions.notes" :key="note">{{ note }}</li>
              </ul>
            </div>

            <div class="rounded-md border border-gray-200 p-3 dark:border-gray-700">
              <h4 class="text-sm font-medium text-gray-900 dark:text-white">Development sign-in test</h4>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Opens the normal consent flow in a new tab reusing this client. A human completes the sign-in; no secret or credential is used.
              </p>
              <UButton
                class="mt-2"
                size="sm"
                color="indigo"
                variant="soft"
                icon="i-heroicons-arrow-top-right-on-square"
                @click="runDevSignInTest"
              >
                Run development sign-in test
              </UButton>
            </div>
          </div>

          <div class="flex justify-end pt-2">
            <UButton color="gray" @click="close">Done</UButton>
          </div>
        </div>
      </div>
    </div>
  </USlideover>
</template>
